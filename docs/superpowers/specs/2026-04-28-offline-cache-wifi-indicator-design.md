# Offline-First Media Cache + WiFi Indicator — Design Spec
Date: 2026-04-28

## Problem

When internet is disconnected on the Android box, the player shows a black screen.
Root causes:
1. ExoPlayer loses its HTTPS stream → stops → WebView is transparent (native video mode) → black
2. No pre-downloaded media files on disk to fall back to
3. Offline indicator only appears on WebView error with a 10-second auto-hide (too late, too brief)

## Goals

1. All media files pre-downloaded to Android internal storage before they are needed
2. Cold boot with no internet → play immediately from local files
3. CMS playlist change → push notification via Supabase Realtime → player syncs in background
4. Old files deleted automatically once new manifest is fully confirmed on disk
5. Persistent semi-transparent red WiFi-off icon in top-right corner while offline

## Frozen Player Settings (Must Not Change)

These invariants from the Amlogic black screen fix must be preserved throughout implementation:

- **Videos never get blob: URLs** — `hydrateAssetsFromCache` and `syncAssets` skip all video types
- **nativeAssetsRef set before syncAssets** — preserves original HTTPS/file:// URLs for ExoPlayer
- **ExoPlayer `surface_type="texture_view"`** — must not become `surface_view`
- **WebView background BLACK by default, TRANSPARENT only during native video** — restored to BLACK on `stopNativeVideo()`

---

## Part 1: Offline-First Media Cache

### Schema (confirmed from Supabase)

| Table | Key columns | Change signal |
|-------|-------------|---------------|
| `playlists` | `id, updated_at` | top-level change |
| `playlist_items` | `playlist_id, media_id, updated_at` | item add/remove/reorder |
| `media_assets` | `id, url, checksum_sha256, bytes, type` | file content change |

### Storage

- **Location:** `context.filesDir/media/<checksum_or_mediaId>.<ext>`
- **filesDir** — survives reboots, never cleared by OS (unlike cacheDir)
- **Filename = checksum** — if file exists at path, skip download (content-addressed)
- **Fallback filename** — use `media_id` if `checksum_sha256` is null in DB

### New Class: `MediaCacheManager`

Single responsibility: owns download queue, file paths, manifest persistence, Realtime subscription, and cleanup.

```
MediaCacheManager
├── init(context, deviceSecret, playlistId)
├── getLocalAssetMap(): Map<String, String>   // media_id → file:// path
├── syncNow(): suspend fun                    // fetch manifest, download, swap, cleanup
├── startRealtimeSync()                       // Supabase Realtime subscription
├── stopRealtimeSync()
└── release()
```

Initialised by `PlayerActivity`, exposed to JS via `AndroidHealth.getLocalAssetMap()`.

### Sync Algorithm

```
ON STARTUP:
  1. Load saved manifest from SharedPreferences → build local file map
  2. Check network:
     - Offline → start playing from local files immediately
               → poll for network every 30s → run syncNow() when restored
     - Online  → run syncNow() in background coroutine

syncNow():
  1. Fetch fresh manifest from CMS edge function
  2. For each asset:
     - File exists at filesDir/media/<checksum>.<ext>? → skip
     - Missing or changed? → download to temp file → move to final path
  3. Wait for ALL downloads to complete
  4. Atomic swap: overwrite manifest in SharedPreferences
  5. Delete files on disk NOT in new manifest

ON REALTIME EVENT (playlist_items INSERT/UPDATE/DELETE):
  → call syncNow()

FALLBACK POLL: every 30 min (WebSocket may drop on Amlogic firmware)
```

### Supabase Realtime Subscription

Subscribe to `playlist_items` table changes filtered by `playlist_id`:

```kotlin
supabaseClient
  .channel("playlist-${playlistId}")
  .postgresChangeFlow<PostgresAction>(schema = "public") {
      table = "playlist_items"
      filter = "playlist_id=eq.$playlistId"
  }
  .onEach { syncNow() }
  .launchIn(scope)
```

Handles INSERT, UPDATE, DELETE — any of these means content changed.

### JS Integration

`AndroidHealth` exposes:
```kotlin
@JavascriptInterface
fun getLocalAssetMap(): String  // returns JSON: { "media_id": "file:///..." }
```

`PlayerPage.tsx` calls this on startup and merges into the asset list:
```typescript
const localMap = JSON.parse(AndroidHealth.getLocalAssetMap())
const resolvedAssets = assets.map(a =>
  localMap[a.media_id] ? { ...a, url: localMap[a.media_id] } : a
)
```

This runs BEFORE `syncAssets()` so local file paths flow through to `nativeAssetsRef` correctly.
ExoPlayer receives `file://` paths — works identically to `https://`.

### Cold Boot Offline Flow

```
App starts
  │
  ├─ Load SharedPreferences manifest → local file map available
  │
  ├─ isNetworkAvailable() = false
  │   → WebViewManager.loadPlayer(isOffline=true) → LOAD_CACHE_ONLY
  │   → React boots from WebView HTTP cache
  │   → JS calls AndroidHealth.getLocalAssetMap() → gets file:// paths
  │   → Player starts playing local files immediately
  │   → Background: poll every 30s for network
  │
  └─ When network restores → syncNow() runs in background
```

---

## Part 2: Offline WiFi Indicator

### Visual Spec

- **Icon:** `ic_wifi_off.xml` — Material Design WiFi-off vector drawable
- **Container:** Semi-transparent dark pill, background `#99000000`
- **Icon tint:** `#EF4444` (red, matches existing offline color scheme)
- **Size:** 32×32dp icon, 8dp padding, rounded corners
- **Position:** Top-right corner, 16dp margin from edges
- **Z-order:** Above WebView and ExoPlayer layers

### Trigger

| Event | Action |
|-------|--------|
| `NetworkCallback.onLost()` | Show indicator immediately |
| `NetworkCallback.onAvailable()` | Hide indicator immediately |
| App start with no network | Show immediately (before WebView loads) |

**Remove** the existing 10-second auto-hide on WebView error — replaced by the above.

### Layout Change (activity_player.xml)

Replace the existing `offlineLayout` LinearLayout (⚠ + "Offline" text) with:
```xml
<LinearLayout
    android:id="@+id/offlineLayout"
    ...
    android:background="#99000000"
    android:visibility="gone">
    <ImageView
        android:src="@drawable/ic_wifi_off"
        android:tint="#EF4444"
        android:layout_width="32dp"
        android:layout_height="32dp" />
</LinearLayout>
```

---

## Files to Change

### Android (`SmartRetailPlayer`)
| File | Change |
|------|--------|
| `MediaCacheManager.kt` | **New** — download, storage, Realtime, sync |
| `AndroidHealth.kt` | Add `getLocalAssetMap()` JS interface |
| `PlayerActivity.kt` | Init MediaCacheManager, wire network events to it |
| `activity_player.xml` | Replace offlineLayout with WiFi icon |
| `ic_wifi_off.xml` | **New** — vector drawable |
| `build.gradle` | Add Supabase Realtime dependency if not present |

### CMS (`omnipush-cms`)
| File | Change |
|------|--------|
| `PlayerPage.tsx` | Call `getLocalAssetMap()` on startup, merge before syncAssets |

---

## Out of Scope

- Video streaming quality / adaptive bitrate
- Storage quota management (phase 2)
- Per-asset download progress UI
- Multi-playlist devices
