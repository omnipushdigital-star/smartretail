# Connectivity & HDMI Event Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android correctly detect ISP outage (LAN connected but no internet), HDMI hotplug, and LAN cable disconnect — reporting each as a discrete event to a new Supabase `device_events` table — and surface all three as stat cards, per-device badges, and a real-time Event Log tab in the CMS dashboard.

**Architecture:** Android uses `NET_CAPABILITY_VALIDATED` (real internet probe, not just routing table) and `DisplayManager.DisplayListener` (HDMI hotplug) to detect events, then fires a new `device-event` Supabase edge function immediately on state change. The existing heartbeat gains three new meta fields (`lan_connected`, `internet_reachable`, `hdmi_status`) for snapshot state. The CMS MonitoringPage gains stat cards, per-device link badges, and a tabbed Event Log fed by Supabase realtime.

**Tech Stack:** Kotlin/Android (API 23+, ConnectivityManager, DisplayManager, OkHttp via existing NetworkManager), Deno/TypeScript (Supabase Edge Functions), React + lucide-react (MonitoringPage), Supabase Postgres + Realtime.

**Constraint:** `PlayerPage.tsx` is NOT modified. The `device-heartbeat` edge function is NOT modified — it already captures extra meta fields via `Object.assign(meta, rest)`.

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `omnipush-cms/supabase/functions/device-event/index.ts` | **Create** | New edge function — validates device, inserts event |
| `SmartRetailPlayer/.../utils/AppConstants.kt` | **Modify** | Add `DEVICE_EVENT_API_URL` constant |
| `SmartRetailPlayer/.../managers/NetworkManager.kt` | **Modify** | Add `sendDeviceEvent()` suspend fun |
| `SmartRetailPlayer/.../activities/PlayerActivity.kt` | **Modify** | Fix `isNetworkAvailable()`, add `isLanConnected()`, fix `registerNetworkCallback()`, add state tracking fields, add `reportEvent()`, add HDMI DisplayManager, extend heartbeat payload |
| `SmartRetailPlayer/.../managers/AndroidHealth.kt` | **Modify** | Add `hdmiConnected` field, `notifyHdmiChange()`, `getHdmiStatus()` |
| `omnipush-cms/src/pages/admin/MonitoringPage.tsx` | **Modify** | New imports, Event Log state + types, realtime subscription, 2 new stat cards, LAN/NET/HDMI badges in table rows, Event Log tab |

**Android project root:** `C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer\app\src\main\java\com\omnipush\smartretail`

---

## Task 1 — Create `device_events` Supabase table

**Files:**
- SQL run via: Supabase Dashboard → SQL Editor (project: qxialnmorewjgpmpcswr)

- [ ] **Step 1: Open Supabase SQL Editor**

Navigate to https://supabase.com/dashboard/project/qxialnmorewjgpmpcswr/sql/new

- [ ] **Step 2: Run the migration SQL**

Paste and execute:

```sql
CREATE TABLE public.device_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
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

CREATE INDEX idx_device_events_device ON public.device_events (device_code, occurred_at DESC);
CREATE INDEX idx_device_events_tenant ON public.device_events (tenant_id, occurred_at DESC);

ALTER TABLE public.device_events ENABLE ROW LEVEL SECURITY;

-- Tenants see only their own events
CREATE POLICY "tenant_isolation" ON public.device_events
  FOR ALL USING (
    tenant_id = (
      SELECT tenant_id FROM public.devices
      WHERE device_code = device_events.device_code
      LIMIT 1
    )
  );

-- Enable realtime for CMS live feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_events;
```

- [ ] **Step 3: Verify table created**

Run in SQL Editor:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'device_events'
ORDER BY ordinal_position;
```

Expected output: 6 rows — `id`, `tenant_id`, `device_code`, `event_type`, `occurred_at`, `meta`.

- [ ] **Step 4: Commit note**

No file to commit (applied directly to DB). Add a comment in `AppConstants.kt` noting the table was created (done in Task 3).

---

## Task 2 — Create `device-event` Edge Function

**Files:**
- Create: `omnipush-cms/supabase/functions/device-event/index.ts`

- [ ] **Step 1: Create the function file**

```
omnipush-cms/supabase/functions/device-event/index.ts
```

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_EVENT_TYPES = new Set([
  "lan_connected", "lan_disconnected",
  "internet_lost", "internet_restored",
  "hdmi_connected", "hdmi_disconnected",
]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { device_code, device_secret, event_type, occurred_at } = body;

    if (!device_code || !device_secret || !event_type) {
      return Response.json(
        { error: "device_code, device_secret, and event_type are required" },
        { status: 400, headers: CORS }
      );
    }

    if (!VALID_EVENT_TYPES.has(event_type)) {
      return Response.json(
        { error: `Invalid event_type: ${event_type}` },
        { status: 400, headers: CORS }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate device credentials and resolve tenant_id in one query
    const { data: device, error: devErr } = await supabase
      .from("devices")
      .select("id, tenant_id, device_secret, active")
      .eq("device_code", device_code)
      .is("deleted_at", null)
      .single();

    if (devErr || !device) {
      return Response.json({ error: "Device not found" }, { status: 401, headers: CORS });
    }
    if (device.device_secret !== device_secret || !device.active) {
      return Response.json({ error: "Invalid credentials or inactive device" }, { status: 401, headers: CORS });
    }

    const { error: insertErr } = await supabase.from("device_events").insert({
      tenant_id: device.tenant_id,
      device_code,
      event_type,
      occurred_at: occurred_at ?? new Date().toISOString(),
      meta: {},
    });

    if (insertErr) {
      console.error("[DeviceEvent] Insert failed:", insertErr);
      return Response.json({ error: "Insert failed" }, { status: 500, headers: CORS });
    }

    console.log(`[DeviceEvent] ${device_code} → ${event_type}`);
    return Response.json({ ok: true }, { headers: CORS });
  } catch (err: any) {
    console.error("[DeviceEvent] Fatal:", err.message);
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
});
```

- [ ] **Step 2: Deploy the edge function**

From `omnipush-cms/` directory:
```bash
npx supabase functions deploy device-event --project-ref qxialnmorewjgpmpcswr
```

Expected output: `Deployed Functions device-event`

- [ ] **Step 3: Smoke test with curl**

Replace `DEVICE_CODE` and `DEVICE_SECRET` with a real paired device's values from the Supabase `devices` table:

```bash
curl -X POST https://qxialnmorewjgpmpcswr.supabase.co/functions/v1/device-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw" \
  -d '{"device_code":"DEVICE_CODE","device_secret":"DEVICE_SECRET","event_type":"hdmi_disconnected"}'
```

Expected: `{"ok":true}`

- [ ] **Step 4: Verify row in DB**

In Supabase SQL Editor:
```sql
SELECT device_code, event_type, occurred_at FROM device_events ORDER BY occurred_at DESC LIMIT 5;
```

Expected: the test event appears.

- [ ] **Step 5: Commit**

```bash
git add omnipush-cms/supabase/functions/device-event/index.ts
git commit -m "feat: add device-event edge function for discrete connectivity events"
```

---

## Task 3 — AppConstants + NetworkManager.sendDeviceEvent()

**Files:**
- Modify: `utils/AppConstants.kt` (line 16 area)
- Modify: `managers/NetworkManager.kt` (after `sendHeartbeat`, around line 180)

- [ ] **Step 1: Add `DEVICE_EVENT_API_URL` to AppConstants**

Open `AppConstants.kt`. After line 16 (`const val HEARTBEAT_API_URL`), add:

```kotlin
    const val HEARTBEAT_API_URL = "$SUPABASE_URL/functions/v1/device-heartbeat"
    const val DEVICE_EVENT_API_URL = "$SUPABASE_URL/functions/v1/device-event"  // NEW
    const val MANIFEST_API_URL = "$SUPABASE_URL/functions/v1/device-manifest"
```

- [ ] **Step 2: Add `sendDeviceEvent()` to NetworkManager**

Open `NetworkManager.kt`. After the closing `}` of `sendHeartbeat()` (around line 183), add:

```kotlin
    // ── DEVICE EVENTS ──────────────────────────────────────────────────────────

    /**
     * Reports a discrete connectivity or HDMI state change event to Supabase.
     * Fire-and-forget — caller should use lifecycleScope.launch(Dispatchers.IO).
     * Returns true on success, false on any failure (caller can log and ignore).
     */
    suspend fun sendDeviceEvent(
        deviceCode: String?,
        deviceSecret: String?,
        eventType: String,
        occurredAt: String
    ): Boolean = withContext(Dispatchers.IO) {
        if (deviceCode == null || deviceSecret == null) return@withContext false
        try {
            val bodyMap = mapOf(
                "device_code" to deviceCode,
                "device_secret" to deviceSecret,
                "event_type" to eventType,
                "occurred_at" to occurredAt
            )
            val body = gson.toJson(bodyMap).toRequestBody(JSON)
            val request = Request.Builder()
                .url(AppConstants.DEVICE_EVENT_API_URL)
                .post(body)
                .addHeader("apikey", AppConstants.SUPABASE_ANON_KEY)
                .addHeader("Authorization", "Bearer ${AppConstants.SUPABASE_ANON_KEY}")
                .build()
            val response = client.newCall(request).execute()
            val ok = response.isSuccessful
            response.close()
            ok
        } catch (e: Exception) {
            Log.w("NetworkManager", "sendDeviceEvent($eventType) failed: ${e.message}")
            false
        }
    }
```

- [ ] **Step 3: Build the Android project to verify compilation**

In Android Studio: **Build → Make Project** (or `./gradlew assembleDebug` from terminal in `SmartRetailPlayer/`)

Expected: BUILD SUCCESSFUL, 0 errors.

- [ ] **Step 4: Commit**

```bash
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" add app/src/main/java/com/omnipush/smartretail/utils/AppConstants.kt app/src/main/java/com/omnipush/smartretail/managers/NetworkManager.kt
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" commit -m "feat: add DEVICE_EVENT_API_URL and NetworkManager.sendDeviceEvent()"
```

---

## Task 4 — PlayerActivity: Fix network detection + add state tracking

**Files:**
- Modify: `activities/PlayerActivity.kt` (lines 118–123, 136–177)

- [ ] **Step 1: Replace `isNetworkAvailable()` body**

Open `PlayerActivity.kt`. Find lines 118–123:

```kotlin
    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
```

Replace with:

```kotlin
    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        // NET_CAPABILITY_VALIDATED = Android has probed and confirmed actual internet reachability.
        // NET_CAPABILITY_INTERNET only checks the routing table — returns true even when ISP is down.
        return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    /** Returns true if a physical LAN/WiFi link is present, regardless of internet reachability. */
    private fun isLanConnected(): Boolean {
        val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) ||
               caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI)
    }
```

- [ ] **Step 2: Add state-tracking fields after `lastReloadTime`**

Find line 134: `private var lastReloadTime = 0L`

Add immediately after it:

```kotlin
    // ─── Connectivity Event State Tracking ──────────────────────────────────────
    // null = initial/unknown; avoids spurious events on first callback fire.
    private var lastInternetReachable: Boolean? = null
    private var lastLanConnected: Boolean? = null
    // HDMI state is initialised in setupWebView() once DisplayManager is queried.
    private var lastHdmiConnected: Boolean = false
```

- [ ] **Step 3: Update `registerNetworkCallback()` — request VALIDATED + wire events**

Find `registerNetworkCallback()` starting at line 136. Replace the entire function body with:

```kotlin
    private fun registerNetworkCallback() {
        try {
            val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            // Request NET_CAPABILITY_VALIDATED so callbacks fire only when internet is truly
            // reachable — not just when a LAN route exists. This is the fix for ISP-down detection.
            val request = android.net.NetworkRequest.Builder()
                .addCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                .build()

            networkCallback = object : android.net.ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: android.net.Network) {
                    val now = System.currentTimeMillis()
                    runOnUiThread {
                        adminHandler.removeCallbacks(reloadRunnable)
                        binding.offlineLayout.visibility = View.GONE
                    }

                    // Report internet_restored event if state changed
                    if (lastInternetReachable != true) {
                        lastInternetReachable = true
                        reportEvent("internet_restored")
                    }

                    if (now - lastReloadTime < 600_000L) {
                        Log.d(TAG, "Network restored but debounced (reloaded < 10m ago)")
                        return
                    }
                    lastReloadTime = now
                    Log.d(TAG, "Network restored — reloading with fresh content")
                    runOnUiThread {
                        val url = prefManager.buildPlayerUrl(forceRefresh = true)
                        webViewManager.loadPlayer(binding.webView, url, isOffline = false)
                    }
                }

                override fun onLost(network: android.net.Network) {
                    Log.d(TAG, "Network lost — showing offline indicator")
                    runOnUiThread { binding.offlineLayout.visibility = View.VISIBLE }

                    val lanUp = isLanConnected()
                    if (lanUp) {
                        // Physical link still present — ISP is down
                        if (lastInternetReachable != false) {
                            lastInternetReachable = false
                            reportEvent("internet_lost")
                        }
                    } else {
                        // LAN cable pulled
                        if (lastLanConnected != false) {
                            lastLanConnected = false
                            lastInternetReachable = false
                            reportEvent("lan_disconnected")
                        }
                    }
                }
            }
            cm.registerNetworkCallback(request, networkCallback!!)
            Log.d(TAG, "Network callback registered (VALIDATED)")
        } catch (e: Exception) {
            Log.w(TAG, "Could not register network callback: ${e.message}")
        }
    }
```

- [ ] **Step 4: Add `reportEvent()` helper**

Immediately after `registerNetworkCallback()` closing brace, add:

```kotlin
    /**
     * Fires a discrete connectivity or HDMI event to the device-event edge function.
     * Non-blocking: runs on Dispatchers.IO via lifecycleScope. Silently dropped if offline.
     */
    private fun reportEvent(eventType: String) {
        val code = prefManager.deviceCode
        val secret = prefManager.deviceSecret
        if (code == null || secret == null) return
        val occurredAt = java.time.Instant.now().toString()
        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val ok = networkManager.sendDeviceEvent(code, secret, eventType, occurredAt)
            Log.d(TAG, "reportEvent($eventType) → ${if (ok) "OK" else "DROPPED (offline)"}")
        }
    }
```

- [ ] **Step 5: Build to verify no compile errors**

Android Studio: **Build → Make Project**

Expected: BUILD SUCCESSFUL

- [ ] **Step 6: Commit**

```bash
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" add app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" commit -m "fix: use NET_CAPABILITY_VALIDATED for real internet detection; add reportEvent()"
```

---

## Task 5 — PlayerActivity: HDMI DisplayManager + heartbeat fields

**Files:**
- Modify: `activities/PlayerActivity.kt` — class fields, `setupWebView()`, `onDestroy()`, `startHeartbeat()`

- [ ] **Step 1: Add class-level fields alongside `networkCallback` (line 125)**

```kotlin
    private var networkCallback: android.net.ConnectivityManager.NetworkCallback? = null
    private var displayManager: android.hardware.display.DisplayManager? = null        // NEW
    private var hdmiDisplayListener: android.hardware.display.DisplayManager.DisplayListener? = null  // NEW
```

- [ ] **Step 2: Register DisplayManager in `setupWebView()` using the class fields**

After the closing brace of `webViewManager.configure(...)` (after line 206) and before `val isOffline = !isNetworkAvailable()`, insert:

```kotlin
        // ─── HDMI Detection via DisplayManager ──────────────────────────────────
        // On a TV box (no built-in screen) the only display IS the HDMI output.
        // getDisplays().isNotEmpty() = cable plugged in. onDisplayAdded/Removed = hotplug events.
        displayManager = getSystemService(android.content.Context.DISPLAY_SERVICE) as android.hardware.display.DisplayManager
        lastHdmiConnected = displayManager!!.getDisplays().isNotEmpty()
        androidHealth.notifyHdmiChange(lastHdmiConnected)
        Log.d(TAG, "HDMI initial state: ${if (lastHdmiConnected) "connected" else "disconnected"}")

        hdmiDisplayListener = object : android.hardware.display.DisplayManager.DisplayListener {
            override fun onDisplayAdded(displayId: Int) {
                if (!lastHdmiConnected) {
                    lastHdmiConnected = true
                    androidHealth.notifyHdmiChange(true)
                    Log.d(TAG, "HDMI connected (displayId=$displayId)")
                    reportEvent("hdmi_connected")
                }
            }
            override fun onDisplayRemoved(displayId: Int) {
                if (lastHdmiConnected) {
                    lastHdmiConnected = false
                    androidHealth.notifyHdmiChange(false)
                    Log.d(TAG, "HDMI disconnected (displayId=$displayId)")
                    reportEvent("hdmi_disconnected")
                }
            }
            override fun onDisplayChanged(displayId: Int) { /* no-op */ }
        }
        displayManager!!.registerDisplayListener(hdmiDisplayListener, null)
```

- [ ] **Step 3: Unregister in `onDestroy()`**

Find `onDestroy()`. Before the existing `networkCallback` unregister block, add:

```kotlin
        hdmiDisplayListener?.let { listener ->
            try {
                displayManager?.unregisterDisplayListener(listener)
            } catch (e: Exception) {
                Log.w(TAG, "displayManager unregister failed: ${e.message}")
            }
        }
```

- [ ] **Step 3: Add three fields to Android heartbeat payload**

Find `startHeartbeat()` at line 315. The telemetry map is built at lines 321–334. After line 324 (`healthParams["apk_version_code"]`), add:

```kotlin
                        // Connectivity & HDMI snapshot for CMS dashboard
                        healthParams["lan_connected"] = isLanConnected()
                        healthParams["internet_reachable"] = isNetworkAvailable()
                        healthParams["hdmi_status"] = if (lastHdmiConnected) "connected" else "disconnected"
```

The `telemetry: Map<String, Any>` type in `sendHeartbeat()` accepts `Boolean` — Gson serialises it as a JSON boolean. The `device-heartbeat` edge function captures extra fields via `Object.assign(meta, rest)`, so these arrive in `meta` automatically.

- [ ] **Step 4: Build**

Android Studio: **Build → Make Project**

Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Deploy APK to OMNI-106A and verify in ADB logcat**

```bash
adb connect 192.168.1.10:5555
adb -s 192.168.1.10:5555 install -r SmartRetailPlayer/app/build/outputs/apk/debug/app-debug.apk
adb -s 192.168.1.10:5555 logcat -s PlayerActivity:D AndroidHealth:D -v time
```

Unplug and re-plug HDMI cable. Expected logcat lines:
```
HDMI disconnected (displayId=0)
reportEvent(hdmi_disconnected) → OK
HDMI connected (displayId=0)
reportEvent(hdmi_connected) → OK
```

- [ ] **Step 6: Commit**

```bash
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" add app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" commit -m "feat: HDMI DisplayManager detection + lan_connected/internet_reachable in heartbeat"
```

---

## Task 6 — AndroidHealth: `getHdmiStatus()` bridge method

**Files:**
- Modify: `managers/AndroidHealth.kt`

- [ ] **Step 1: Add `hdmiConnected` field and `notifyHdmiChange()` to AndroidHealth class**

Open `AndroidHealth.kt`. After line 28 (`private var currentUrl: String? = null`), add:

```kotlin
    // ── HDMI State (set by PlayerActivity via DisplayManager) ────────────────
    @Volatile private var hdmiConnected: Boolean = false

    /** Called by PlayerActivity whenever DisplayManager fires onDisplayAdded/Removed. */
    fun notifyHdmiChange(connected: Boolean) {
        hdmiConnected = connected
    }
```

- [ ] **Step 2: Add `getHdmiStatus()` @JavascriptInterface**

After the `getLocalIp()` method (line 105), add:

```kotlin
    /**
     * Called by PlayerPage.tsx (line 2224) in the heartbeat payload.
     * Returns "connected" or "disconnected" based on DisplayManager state.
     * @Volatile ensures the value is always current across threads.
     */
    @JavascriptInterface
    fun getHdmiStatus(): String = if (hdmiConnected) "connected" else "disconnected"
```

- [ ] **Step 3: Build**

Android Studio: **Build → Make Project**

Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Verify via ADB — JS heartbeat now sends real HDMI status**

With APK deployed to OMNI-106A and ADB logcat running:

```bash
adb -s 192.168.1.10:5555 logcat -s OmniPushLogs:D -v time | grep -i hdmi
```

Within 30 seconds (one JS heartbeat cycle), expected to see in the JS heartbeat log:
```
[Player] heartbeat meta ... hdmi_status: "connected"
```

After unplugging HDMI and waiting one heartbeat cycle:
```
[Player] heartbeat meta ... hdmi_status: "disconnected"
```

- [ ] **Step 5: Commit**

```bash
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" add app/src/main/java/com/omnipush/smartretail/managers/AndroidHealth.kt
git -C "C:\Users\Naveen Saini\AndroidProjects\SmartRetailPlayer" commit -m "feat: add getHdmiStatus() JavascriptInterface bridge method"
```

---

## Task 7 — MonitoringPage: new imports, types, and Event Log state

**Files:**
- Modify: `omnipush-cms/src/pages/admin/MonitoringPage.tsx`

- [ ] **Step 1: Update imports at the top of MonitoringPage.tsx**

Find line 2 (current lucide imports):

```tsx
import { Activity, Wifi, WifiOff, Search, RefreshCw, Tv2, AlertCircle, Eye, EyeOff } from 'lucide-react'
```

Replace with:

```tsx
import { Activity, Wifi, WifiOff, Search, RefreshCw, Tv2, AlertCircle, Eye, EyeOff, Cable, Globe, Unplug } from 'lucide-react'
```

- [ ] **Step 2: Add `DeviceEvent` interface after the `DeviceInfo` interface**

Find the `DeviceInfo` interface (around line 16). After its closing `}`, add:

```tsx
interface DeviceEvent {
    id: string
    device_code: string
    event_type: 'lan_connected' | 'lan_disconnected' | 'internet_lost' | 'internet_restored' | 'hdmi_connected' | 'hdmi_disconnected'
    occurred_at: string
    meta: Record<string, any>
}
```

- [ ] **Step 3: Add Event Log state inside the `MonitoringPage` component**

Find the block of `useState` calls at the top of `MonitoringPage()` (around lines 28–38). Add after `lastRefresh`:

```tsx
    const [activeTab, setActiveTab] = useState<'devices' | 'eventlog'>('devices')
    const [events, setEvents] = useState<DeviceEvent[]>([])
    const [eventDeviceFilter, setEventDeviceFilter] = useState('')
    const [eventTypeFilter, setEventTypeFilter] = useState('')
    const [eventPage, setEventPage] = useState(1)
```

- [ ] **Step 4: Extend `loadAll()` to also fetch recent events**

Find `loadAll()`. Inside the function, after the existing three parallel `Promise.all` calls and before `setLoading(false)`, add:

```tsx
        // Load last 500 device events
        const { data: eventsData } = await supabase
            .from('device_events')
            .select('*')
            .order('occurred_at', { ascending: false })
            .limit(500)
        setEvents(eventsData || [])
```

- [ ] **Step 5: Add realtime subscription for `device_events`**

In the `useEffect` that sets up realtime (around lines 85–133), after the `devChannel` subscription, add:

```tsx
        // 3. Subscribe to device_events for real-time Event Log
        const eventsChannel = supabase
            .channel('monitoring_device_events')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'device_events'
            }, (payload) => {
                setEvents(prev => [payload.new as DeviceEvent, ...prev].slice(0, 500))
            })
            .subscribe()
```

And add `eventsChannel` to the cleanup return:

```tsx
        return () => {
            supabase.removeChannel(hbChannel)
            supabase.removeChannel(devChannel)
            supabase.removeChannel(eventsChannel)   // NEW
            clearInterval(tick)
        }
```

- [ ] **Step 6: Build CMS to verify no TypeScript errors**

```bash
cd "D:/Antigravity projects/Smart  Retail Display System/.claude/worktrees/loving-lumiere-8e8da3/omnipush-cms"
npm run build
```

Expected: no TypeScript errors, build completes.

- [ ] **Step 7: Commit**

```bash
cd "D:/Antigravity projects/Smart  Retail Display System/.claude/worktrees/loving-lumiere-8e8da3"
git add omnipush-cms/src/pages/admin/MonitoringPage.tsx
git commit -m "feat: add DeviceEvent type, event log state, and realtime subscription to MonitoringPage"
```

---

## Task 8 — MonitoringPage: new stat cards

**Files:**
- Modify: `omnipush-cms/src/pages/admin/MonitoringPage.tsx`

- [ ] **Step 1: Change stat card grid to auto-fill**

Find the stat card grid container (around line 204):

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
```

Replace with:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
```

- [ ] **Step 2: Add "LAN Disconnected" stat card**

After the existing "HDMI Disconnected" stat card closing `</div>` (after line 259), add:

```tsx
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>
                        <Unplug size={22} color="#ef4444" />
                    </div>
                    <div>
                        <div className="stat-value" style={{ color: '#ef4444' }}>
                            {latestHbs.filter(hb => {
                                const m = hb.meta as any || {}
                                return isOnline(hb.last_seen_at) && m.lan_connected === false
                            }).length}
                        </div>
                        <div className="stat-label">LAN Disconnected</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                        <Globe size={22} color="#f59e0b" />
                    </div>
                    <div>
                        <div className="stat-value" style={{ color: '#f59e0b' }}>
                            {latestHbs.filter(hb => {
                                const m = hb.meta as any || {}
                                return isOnline(hb.last_seen_at) &&
                                    m.lan_connected === true &&
                                    m.internet_reachable === false
                            }).length}
                        </div>
                        <div className="stat-label">ISP Down</div>
                    </div>
                </div>
```

- [ ] **Step 3: Build CMS**

```bash
npm run build
```

Expected: BUILD SUCCESSFUL, no errors.

- [ ] **Step 4: Commit**

```bash
cd "D:/Antigravity projects/Smart  Retail Display System/.claude/worktrees/loving-lumiere-8e8da3"
git add omnipush-cms/src/pages/admin/MonitoringPage.tsx
git commit -m "feat: add LAN Disconnected and ISP Down stat cards to Monitoring dashboard"
```

---

## Task 9 — MonitoringPage: LAN/Internet/HDMI badges in device table

**Files:**
- Modify: `omnipush-cms/src/pages/admin/MonitoringPage.tsx`

- [ ] **Step 1: Add "Link" column header to the device table**

Find the `<thead>` of the device status table (around line 302):

```tsx
<tr>
    <th>Device Code</th>
    <th>Display Name</th>
    <th>Store / Role</th>
    <th>Status</th>
    <th>Health (Disk/RAM)</th>
    <th>Last Seen</th>
    <th>Model & IP</th>
</tr>
```

Replace with:

```tsx
<tr>
    <th>Device Code</th>
    <th>Display Name</th>
    <th>Store / Role</th>
    <th>Status</th>
    <th>Link</th>
    <th>Health (Disk/RAM)</th>
    <th>Last Seen</th>
    <th>Model & IP</th>
</tr>
```

- [ ] **Step 2: Add badge cell in each device row**

Find the device row's `<tr key={hb.device_code}>` render (around line 324). After the Status `<td>` (which ends around line 352) and before the Health `<td>` (line 353), insert:

```tsx
                                            <td>
                                                {online ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        {/* LAN badge */}
                                                        {meta.lan_connected === true && (
                                                            <span title="LAN connected" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#22c55e', fontWeight: 600 }}>
                                                                <Cable size={10} /> LAN
                                                            </span>
                                                        )}
                                                        {meta.lan_connected === false && (
                                                            <span title="LAN disconnected" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>
                                                                <Unplug size={10} /> NO LAN
                                                            </span>
                                                        )}
                                                        {/* Internet badge */}
                                                        {meta.internet_reachable === true && (
                                                            <span title="Internet reachable" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#22c55e', fontWeight: 600 }}>
                                                                <Globe size={10} /> NET
                                                            </span>
                                                        )}
                                                        {meta.internet_reachable === false && (
                                                            <span title="Internet unreachable (ISP down)" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>
                                                                <Globe size={10} /> NO NET
                                                            </span>
                                                        )}
                                                        {/* HDMI badge */}
                                                        {meta.hdmi_status === 'connected' && (
                                                            <span title="HDMI connected" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#22c55e', fontWeight: 600 }}>
                                                                <Tv2 size={10} /> HDMI
                                                            </span>
                                                        )}
                                                        {meta.hdmi_status === 'disconnected' && (
                                                            <span title="HDMI disconnected" style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>
                                                                <Tv2 size={10} /> NO HDMI
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--color-surface-500)', fontSize: '10px' }}>—</span>
                                                )}
                                            </td>
```

- [ ] **Step 3: Build CMS**

```bash
npm run build
```

Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
cd "D:/Antigravity projects/Smart  Retail Display System/.claude/worktrees/loving-lumiere-8e8da3"
git add omnipush-cms/src/pages/admin/MonitoringPage.tsx
git commit -m "feat: add LAN/Internet/HDMI link badges to device status table"
```

---

## Task 10 — MonitoringPage: Event Log tab

**Files:**
- Modify: `omnipush-cms/src/pages/admin/MonitoringPage.tsx`

- [ ] **Step 1: Add tab switcher UI above the Device Status table**

Find the Device Status Overview card (around line 287):

```tsx
<div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
    <div className="card-header pb-0 border-b-0">
        <h2 className="text-sm font-semibold text-surface-400">Device Status Overview</h2>
    </div>
```

Replace the outer div opening + header with:

```tsx
{/* Tab switcher */}
<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
    <button
        onClick={() => setActiveTab('devices')}
        className={activeTab === 'devices' ? 'btn-primary' : 'btn-secondary'}
        style={{ fontSize: '0.8125rem' }}
    >
        Device Status
    </button>
    <button
        onClick={() => setActiveTab('eventlog')}
        className={activeTab === 'eventlog' ? 'btn-primary' : 'btn-secondary'}
        style={{ fontSize: '0.8125rem' }}
    >
        Event Log
    </button>
</div>

{activeTab === 'devices' && (
<div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
    <div className="card-header pb-0 border-b-0">
        <h2 className="text-sm font-semibold text-surface-400">Device Status Overview</h2>
    </div>
```

- [ ] **Step 2: Close the conditional wrapper after the Device Status card ends**

Find the closing `</div>` of the Device Status Overview card (after line 440). Add `)}`  after it:

```tsx
            </div>
        )}   {/* end activeTab === 'devices' */}
```

- [ ] **Step 3: Add Event Log panel after the devices conditional**

After the closing `)}` from Step 2, add the full Event Log UI:

```tsx
{activeTab === 'eventlog' && (() => {
    const EVENT_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
        lan_disconnected:  { label: 'LAN Disconnected',    color: '#ef4444', icon: <Unplug size={13} /> },
        lan_connected:     { label: 'LAN Connected',       color: '#22c55e', icon: <Cable  size={13} /> },
        internet_lost:     { label: 'ISP Down',            color: '#f59e0b', icon: <WifiOff size={13} /> },
        internet_restored: { label: 'Internet Restored',   color: '#22c55e', icon: <Wifi  size={13} /> },
        hdmi_disconnected: { label: 'HDMI Disconnected',   color: '#ef4444', icon: <Tv2   size={13} /> },
        hdmi_connected:    { label: 'HDMI Connected',      color: '#22c55e', icon: <Tv2   size={13} /> },
    }

    const filteredEvents = events.filter(ev => {
        const matchDev  = !eventDeviceFilter || ev.device_code.toLowerCase().includes(eventDeviceFilter.toLowerCase())
        const matchType = !eventTypeFilter    || ev.event_type === eventTypeFilter
        return matchDev && matchType
    })
    const EVENT_PAGE_SIZE = 50
    const pagedEvents = filteredEvents.slice((eventPage - 1) * EVENT_PAGE_SIZE, eventPage * EVENT_PAGE_SIZE)

    return (
        <>
            {/* Event Log filters */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Filter by device code..."
                            value={eventDeviceFilter}
                            onChange={e => { setEventDeviceFilter(e.target.value); setEventPage(1) }}
                            style={{ paddingLeft: '2rem' }}
                        />
                    </div>
                    <select
                        className="input-field"
                        style={{ width: 'auto' }}
                        value={eventTypeFilter}
                        onChange={e => { setEventTypeFilter(e.target.value); setEventPage(1) }}
                    >
                        <option value="">All event types</option>
                        <option value="lan_disconnected">LAN Disconnected</option>
                        <option value="lan_connected">LAN Connected</option>
                        <option value="internet_lost">ISP Down</option>
                        <option value="internet_restored">Internet Restored</option>
                        <option value="hdmi_disconnected">HDMI Disconnected</option>
                        <option value="hdmi_connected">HDMI Connected</option>
                    </select>
                </div>
            </div>

            {/* Event Log table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #1e293b', fontWeight: 600, fontSize: '0.875rem', color: '#94a3b8' }}>
                    Event Log (last 500) — live
                </div>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Device</th>
                                <th>Event</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedEvents.length === 0 ? (
                                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No events yet. Events appear here in real-time once the updated APK is deployed.</td></tr>
                            ) : pagedEvents.map(ev => {
                                const cfg = EVENT_LABELS[ev.event_type] ?? { label: ev.event_type, color: '#94a3b8', icon: null }
                                return (
                                    <tr key={ev.id}>
                                        <td
                                            style={{ fontSize: '0.8125rem', color: '#64748b', whiteSpace: 'nowrap' }}
                                            title={new Date(ev.occurred_at).toISOString()}
                                        >
                                            {formatDistanceToNow(new Date(ev.occurred_at), { addSuffix: true })}
                                        </td>
                                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                            {ev.device_code}
                                        </td>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: cfg.color, fontWeight: 600, fontSize: '0.8125rem' }}>
                                                {cfg.icon} {cfg.label}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    page={eventPage}
                    totalPages={Math.ceil(filteredEvents.length / EVENT_PAGE_SIZE)}
                    totalItems={filteredEvents.length}
                    pageSize={EVENT_PAGE_SIZE}
                    onPageChange={setEventPage}
                />
            </div>
        </>
    )
})()}
```

- [ ] **Step 4: Build CMS**

```bash
cd "D:/Antigravity projects/Smart  Retail Display System/.claude/worktrees/loving-lumiere-8e8da3/omnipush-cms"
npm run build
```

Expected: BUILD SUCCESSFUL — no TypeScript errors.

- [ ] **Step 5: Verify in browser**

```bash
npm run dev
```

Open http://localhost:5173 → Admin → Monitoring.

Check:
- Tab switcher appears: "Device Status" and "Event Log"
- "Device Status" tab shows existing table (unchanged behaviour)
- "Event Log" tab shows table with "No events yet" message (or real events if APK already deployed)
- Filters work (type in device code, select event type)

- [ ] **Step 6: Final commit**

```bash
cd "D:/Antigravity projects/Smart  Retail Display System/.claude/worktrees/loving-lumiere-8e8da3"
git add omnipush-cms/src/pages/admin/MonitoringPage.tsx
git commit -m "feat: add Event Log tab with real-time event feed to Monitoring dashboard"
```

---

## End-to-End Verification Checklist

Run after all tasks are complete with updated APK deployed on OMNI-106A.

- [ ] **LAN disconnect:** Pull ethernet cable from OMNI-106A → within 5s, `lan_disconnected` event appears in Event Log. Device table LAN badge turns red "NO LAN". `offlineLayout` appears on device screen. Cached content continues playing.
- [ ] **LAN reconnect:** Re-plug ethernet (with internet working) → `internet_restored` event appears. LAN badge turns green. `offlineLayout` hides. Content continues.
- [ ] **ISP outage simulation:** Block WAN on router, keep LAN connected → `internet_lost` event appears. ISP Down stat card increments. NET badge turns orange "NO NET". `offlineLayout` appears on device screen. Cached content continues.
- [ ] **ISP restore:** Re-enable WAN → `internet_restored` event appears. NET badge turns green. `offlineLayout` hides.
- [ ] **HDMI disconnect:** Unplug HDMI cable → `hdmi_disconnected` event appears. HDMI Disconnected stat card increments. (Screen is physically off so no visual test on device — verify via Event Log.)
- [ ] **HDMI reconnect:** Re-plug HDMI → `hdmi_connected` event appears.
- [ ] **CMS realtime:** All above events appear in Event Log without page refresh.
- [ ] **PlayerPage unchanged:** Verify `omnipush-cms/src/pages/PlayerPage.tsx` has no diff — `git diff HEAD -- omnipush-cms/src/pages/PlayerPage.tsx` should be empty.
