# Smart Retail Display System — Dev Notes

## Critical Invariants (Do Not Break)

### 1. Videos never get blob: URLs on Android

**Files:** `omnipush-cms/src/lib/cache.ts` → `hydrateAssetsFromCache`
and `omnipush-cms/src/pages/PlayerPage.tsx` → `syncAssets`

Videos must be skipped during blob hydration. ExoPlayer (native) and Amlogic hardware decoders
cannot open `blob:` URIs — they require real HTTPS URLs.

Check both: `asset.type === 'video'` AND `asset.type.startsWith('video/')` (both forms exist in the DB).

### 2. nativeAssetsRef must be set before syncAssets runs

**File:** `omnipush-cms/src/pages/PlayerPage.tsx`

`nativeAssetsRef.current = data.assets` must be saved **before** `syncAssets()` is called.
This preserves the original HTTPS URLs. The native video path resolves blob→HTTPS from this ref
at the ExoPlayer call site. If this line is removed or reordered, ExoPlayer gets blob: URLs and
videos silently fail to play on Android.

### 3. ExoPlayer PlayerView must use surface_type="texture_view"

**File:** `SmartRetailPlayer/app/src/main/res/layout/activity_player.xml`

`app:surface_type="texture_view"` — do NOT change to `surface_view`.

TextureView composites in the normal Android View hierarchy. The WebView sits on top with a
transparent background and ExoPlayer shows through underneath.

SurfaceView punches a hardware hole through SurfaceFlinger. On Amlogic S905 firmware the
amvideo tunnel makes the video plane invisible to screencap AND to the physical TV output
(black screen). This was the root cause of the original black screen bug.

### 4. WebView background: BLACK by default, TRANSPARENT only during native video

**File:** `SmartRetailPlayer/app/src/main/java/com/omnipush/smartretail/managers/AndroidHealth.kt`

- `playNativeVideo()` sets WebView background → `TRANSPARENT` (so ExoPlayer shows through)
- `stopNativeVideo()` sets WebView background → `BLACK` (hides old decoder frames)
- `WebViewManager` sets default background → `BLACK`

Never set the WebView permanently transparent. Old decoder frames bleed through between clips
and cause visual artifacts on hardware boxes.

### 5. file:// paths go to ExoPlayer only — never into WebView rendering

**Files:** `omnipush-cms/src/pages/PlayerPage.tsx` → `syncAssets`

`assetsToUse` must always hold original HTTPS URLs. WebView blocks `file://` URLs loaded
from an HTTPS origin (security restriction) — putting them in `assetsToUse` causes a black
screen with "Not allowed to load local resource" in logcat.

`nativeAssetsRef.current` is the only place that gets `file://` paths (merged from
`AndroidHealth.getLocalAssetMap()`). ExoPlayer resolves the URL at playback time via:
```ts
nativeAssets?.find(a => a.media_id === nextItem.media_id)?.url
```
This lookup must run unconditionally (not only when URL starts with `blob:`), so cached
`file://` paths are used even when `assetsToUse` holds HTTPS.

### 6. WiFi indicator must disappear instantly on network restore

**File:** `SmartRetailPlayer/app/src/main/java/com/omnipush/smartretail/activities/PlayerActivity.kt`

`onAvailable()` must call `adminHandler.removeCallbacks(reloadRunnable)` **before** hiding
`offlineLayout`. This cancels any pending scheduled reload so the indicator vanishes the
instant connectivity returns, not after the retry delay fires.

`scheduleReload()` must use `adminHandler.postDelayed(reloadRunnable, ...)` (named runnable,
reusable handler) — never an anonymous `Handler(Looper.getMainLooper()).postDelayed(...)`.
An anonymous handler produces a callback that cannot be cancelled.

`RECONNECT_DELAY_MS` is **15 seconds** — do not increase. The device caches content locally
so there is no user-visible gap during the retry window.

### 7. MediaCacheManager: treat JSON null checksum as absent

**File:** `SmartRetailPlayer/app/src/main/java/com/omnipush/smartretail/managers/MediaCacheManager.kt`

`JSONObject.optString("checksum_sha256")` returns the **string** `"null"` when the JSON
value is JSON null — it does NOT return Kotlin null. Always filter with:
```kotlin
.takeIf { it.isNotEmpty() && it != "null" }
```
Without this check every asset with a null checksum is saved as `null.<ext>`, causing all
such assets to collide on the same file and corrupt each other.

---

## Device Notes

- **OMNI-106A** — Physical Amlogic S905W2 TV box at 106.219.159.21. This is the device the black
  screen bug was found and fixed on. Always test video changes on this device or equivalent hardware.
- Chrome 83 WebView (Amlogic OEM) — HTML5 video is broken on this device. Native ExoPlayer path
  is mandatory for all video playback on Android.

## Pairing

The Android app displays a **6-digit** PIN. The CMS accepts exactly 6 digits.
