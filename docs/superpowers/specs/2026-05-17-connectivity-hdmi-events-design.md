# Connectivity & HDMI Event Detection — Design Spec
**Date:** 2026-05-17  
**Status:** Approved

---

## Problem Statement

Three distinct failure modes are currently either undetected or indistinguishable:

1. **ISP outage with LAN connected** — Android uses `NET_CAPABILITY_INTERNET` (routing-table check) which returns `true` even when the ISP is down. `onAvailable()` fires, WebView reloads into a blank state, and PlayerPage takes ~97 seconds to enter offline mode. Screen goes black.
2. **HDMI cable disconnected** — `getHdmiStatus()` is called by PlayerPage (line 2224) but is not implemented in AndroidHealth. Returns nothing. CMS stat card always shows 0.
3. **CMS cannot distinguish events** — Dashboard has no way to tell apart LAN disconnect vs ISP outage vs HDMI disconnect. No event history exists.

---

## Constraints

- **PlayerPage.tsx must not be modified.** All detection and reporting lives in the Android native layer.
- ExoPlayer, blob hydration, and all existing critical invariants (CLAUDE.md §1–11) remain unchanged.
- OMNI-106A (Amlogic S905W2) is the primary test target — Amlogic firmware can be unreliable with ConnectivityManager callbacks, so defensive fallbacks are kept.

---

## Architecture

```
Android (Kotlin)
 ├── NET_CAPABILITY_VALIDATED replaces NET_CAPABILITY_INTERNET in isNetworkAvailable()
 ├── isLanConnected() — TRANSPORT_ETHERNET or TRANSPORT_WIFI present (physical link only)
 ├── DisplayManager.DisplayListener — real-time HDMI hotplug
 ├── getHdmiStatus() added to AndroidHealth (@JavascriptInterface)
 │    └── PlayerPage line 2224 already calls this — works automatically
 ├── reportEvent(type) — OkHttp POST to device-event edge fn on every state change
 └── Android heartbeat extended: lan_connected, internet_reachable, hdmi_status in meta

Supabase
 ├── NEW device_events table
 ├── NEW device-event edge function
 └── device-heartbeat edge function: persist lan_connected, internet_reachable, hdmi_status

CMS Dashboard (MonitoringPage.tsx)
 ├── 2 new stat cards: LAN Disconnected + ISP Down
 ├── Per-device row: LAN / Internet / HDMI state badges
 └── Event Log tab: real-time feed from device_events
```

**Event types:** `lan_connected`, `lan_disconnected`, `internet_lost`, `internet_restored`, `hdmi_connected`, `hdmi_disconnected`

**Event delivery path:** Android state change → `reportEvent()` → `device-event` edge fn → `device_events` table → Supabase realtime → CMS Event Log (near real-time, not dependent on heartbeat interval).

---

## Layer 1: Android (Kotlin)

### Files changed
- `PlayerActivity.kt`
- `AndroidHealth.kt`

### 1.1 Network detection fix — `PlayerActivity.kt`

**Replace `isNetworkAvailable()`:**
```kotlin
// BEFORE
return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)

// AFTER
return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
```

`NET_CAPABILITY_VALIDATED` means Android has probed actual internet reachability (via connectivitycheck endpoint). Returns `false` when ISP is down even if LAN/ethernet is physically connected. This is the single fix that resolves the black screen on ISP outage.

**Add `isLanConnected()`:**
```kotlin
private fun isLanConnected(): Boolean {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(network) ?: return false
    return caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
           caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
}
```

**State tracking fields:**
```kotlin
private var lastLanConnected: Boolean? = null
private var lastInternetReachable: Boolean? = null
private var lastHdmiConnected: Boolean? = null
```

**`onAvailable()` update:**
- Compare current `isLanConnected()` and `isNetworkAvailable()` against last known state
- If changed → call `reportEvent("internet_restored")` or `reportEvent("lan_connected")` as appropriate
- Update last-known state fields

**`onLost()` update:**
- Compare and call `reportEvent("internet_lost")` or `reportEvent("lan_disconnected")` as appropriate

**Android heartbeat meta additions** (in `startHeartbeat()`):
```kotlin
"lan_connected" to isLanConnected(),
"internet_reachable" to isNetworkAvailable(),
"hdmi_status" to if (lastHdmiConnected == true) "connected" else "disconnected"
```

### 1.2 HDMI detection — `PlayerActivity.kt`

Register `DisplayManager.DisplayListener` in `onCreate()`:
```kotlin
val displayManager = getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
displayManager.registerDisplayListener(object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) {
        lastHdmiConnected = true
        reportEvent("hdmi_connected")
        androidHealth.notifyHdmiChange(true)
    }
    override fun onDisplayRemoved(displayId: Int) {
        lastHdmiConnected = false
        reportEvent("hdmi_disconnected")
        androidHealth.notifyHdmiChange(false)
    }
    override fun onDisplayChanged(displayId: Int) { /* no-op */ }
}, null)

// Set initial state
lastHdmiConnected = displayManager.getDisplays().isNotEmpty()
```

On a TV box (no built-in screen), `getDisplays().isNotEmpty()` is `true` only when the HDMI cable is plugged in.

Unregister in `onDestroy()`.

### 1.3 `getHdmiStatus()` — `AndroidHealth.kt`

AndroidHealth holds a reference to `PlayerActivity` (already the case for other methods). Add:

```kotlin
// Field set by PlayerActivity via notifyHdmiChange()
@Volatile var hdmiConnected: Boolean = false

fun notifyHdmiChange(connected: Boolean) {
    hdmiConnected = connected
}

@JavascriptInterface
fun getHdmiStatus(): String = if (hdmiConnected) "connected" else "disconnected"
```

PlayerPage.tsx line 2224 already calls `win.AndroidHealth.getHdmiStatus()` — this now returns a real value with no JS changes.

### 1.4 `reportEvent()` — `PlayerActivity.kt`

Fire-and-forget OkHttp POST. Non-blocking (runs on `Dispatchers.IO`). Dropped silently if device is offline (acceptable — the heartbeat captures current state anyway).

```kotlin
private fun reportEvent(eventType: String) {
    val secret = preferenceManager.deviceSecret ?: return
    val code = preferenceManager.deviceCode ?: return
    lifecycleScope.launch(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("device_code", code)
                put("device_secret", secret)
                put("event_type", eventType)
                put("occurred_at", Instant.now().toString())
            }.toString().toRequestBody("application/json".toMediaType())

            okHttpClient.newCall(
                Request.Builder()
                    .url("${AppConstants.SUPABASE_URL}/functions/v1/device-event")
                    .post(body)
                    .addHeader("Authorization", "Bearer ${AppConstants.SUPABASE_ANON_KEY}")
                    .build()
            ).execute().close()
        } catch (e: Exception) {
            Log.w(TAG, "reportEvent($eventType) failed: ${e.message}")
        }
    }
}
```

---

## Layer 2: Supabase

### Files changed / created
- `supabase/migrations/20260517_device_events.sql` (new)
- `supabase/functions/device-event/index.ts` (new)
- `supabase/functions/device-heartbeat/index.ts` (updated)

### 2.1 `device_events` table

```sql
CREATE TABLE device_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES tenants(id) ON DELETE CASCADE,
  device_code  text NOT NULL,
  event_type   text NOT NULL
                 CHECK (event_type IN (
                   'lan_connected', 'lan_disconnected',
                   'internet_lost', 'internet_restored',
                   'hdmi_connected', 'hdmi_disconnected'
                 )),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  meta         jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_device_events_device ON device_events (device_code, occurred_at DESC);
CREATE INDEX idx_device_events_tenant ON device_events (tenant_id, occurred_at DESC);

-- RLS: tenants see only their own events
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant isolation" ON device_events
  USING (tenant_id = (SELECT tenant_id FROM devices WHERE device_code = device_events.device_code LIMIT 1));
```

### 2.2 `device-event` edge function

```typescript
// supabase/functions/device-event/index.ts
// Validates device secret, resolves tenant_id, inserts into device_events.
// Returns { ok: true } or { error: string }.

POST body: {
  device_code: string
  device_secret: string
  event_type: string
  occurred_at: string  // ISO 8601
}
```

Validation: device secret must match `devices` table. Invalid secret → 401. Unknown event_type → 400. On success → insert + `{ok: true}`.

### 2.3 `device-heartbeat` update

Read `meta.lan_connected`, `meta.internet_reachable`, `meta.hdmi_status` from incoming payload. These are already stored in the JSONB `meta` column — no schema change required. The existing upsert stores whatever is in the meta object.

No other heartbeat changes needed.

---

## Layer 3: CMS Dashboard

### File changed
- `omnipush-cms/src/pages/admin/MonitoringPage.tsx`

### 3.1 Two new stat cards

Added alongside existing HDMI card. Data derived from `latestHbs` (already computed):

**LAN Disconnected:**
```ts
latestHbs.filter(hb => {
  const m = hb.meta as any || {}
  return isOnline(hb.last_seen_at) && m.lan_connected === false
}).length
```
Icon: `Cable` (lucide), color red.

**ISP Down (LAN connected, no internet):**
```ts
latestHbs.filter(hb => {
  const m = hb.meta as any || {}
  return isOnline(hb.last_seen_at) && m.lan_connected === true && m.internet_reachable === false
}).length
```
Icon: `Globe` with slash or `WifiOff`, color orange.

Grid changes from `repeat(3, 1fr)` → `repeat(auto-fill, minmax(180px, 1fr))` so all five cards flow naturally without a fixed column count.

### 3.2 Per-device table status badges

Each device row in the "Device Status Overview" table gets a new **"Link"** column with three small badges:

| Badge | Green | Red | Grey |
|-------|-------|-----|------|
| LAN   | `meta.lan_connected === true` | `=== false` | undefined |
| NET   | `meta.internet_reachable === true` | `=== false` | undefined |
| HDMI  | `meta.hdmi_status === 'connected'` | `=== 'disconnected'` | `=== 'unknown'` or undefined |

Rendered as `<span>` with colored dot + 3-letter label. Tooltip on hover: "LAN connected", "Internet reachable", etc.

### 3.3 Event Log tab

The page gains two tabs: **"Device Status"** (existing table) and **"Event Log"** (new).

Event Log:
- Fetches last 500 rows from `device_events` ordered by `occurred_at DESC`
- Real-time: Supabase `postgres_changes` on `device_events` (INSERT events prepended)
- Filter: device code text input + event type dropdown
- Columns: **Time** (relative, e.g. "3 min ago"; absolute ISO on hover) | **Device** | **Event** (icon + human label)
- Paginated 50/page
- Event icons:
  - `lan_disconnected` → `Unplug` icon, red
  - `lan_connected` → `Cable` icon, green
  - `internet_lost` → `WifiOff` icon, orange
  - `internet_restored` → `Wifi` icon, green
  - `hdmi_disconnected` → `Tv2` icon, red
  - `hdmi_connected` → `Tv2` icon, green

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `reportEvent()` fails (device offline) | Silently dropped. Heartbeat captures current state regardless. |
| `NET_CAPABILITY_VALIDATED` never fires on Amlogic firmware | Existing 30s polling loop calls `isNetworkAvailable()` which now uses VALIDATED — polling acts as fallback probe. |
| DisplayManager returns empty on boot before HDMI settles | Initial `hdmiConnected` defaults to `getDisplays().isNotEmpty()` — correct for steady state. Brief flicker at boot is acceptable. |
| `device-event` edge fn receives unknown event_type | Returns 400. Android logs warning. No crash. |
| CMS receives heartbeat without lan_connected / internet_reachable | Badges render as grey (unknown). No crash. |

---

## Testing Checklist

- [ ] Pull ethernet cable → `lan_disconnected` event appears in CMS Event Log within 5s; LAN badge turns red
- [ ] Re-plug ethernet → `lan_connected` event appears; LAN badge turns green; offlineLayout hides
- [ ] Simulate ISP outage (block WAN on router, keep LAN up) → `internet_lost` event appears; NET badge turns orange; offlineLayout shows on device
- [ ] Restore ISP → `internet_restored` event appears; NET badge turns green
- [ ] Unplug HDMI cable → `hdmi_disconnected` event appears; HDMI badge turns red; CMS HDMI Disconnected stat card increments
- [ ] Re-plug HDMI → `hdmi_connected` event appears; HDMI badge turns green
- [ ] CMS stat cards show correct counts across all three event types
- [ ] Event Log filters by device code and event type correctly
- [ ] Realtime: events appear in CMS without page refresh
- [ ] Offline playback continues uninterrupted during all above scenarios (player logic unchanged)
