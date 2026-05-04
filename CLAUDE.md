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

### 7. ExoPlayer CSS transparency must cover ALL container divs (not just the root)

**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `nativeVideoActive` useEffect

When `nativeVideoActive = true`, a `<style>` element is injected into `<head>` to make the WebView
transparent so ExoPlayer (sitting in the Android layer below) shows through.

The selector **must** cover every intermediate container div between `#root` and the UDB component:

```js
styleEl.textContent =
  'html,body,#root,#root>div,#root>div>div,#root>div>div>div{background:transparent!important}'
```

- `#root>div` = PlayerPage outer fixed div
- `#root>div>div` = normal playback container (renderMain return — position:fixed, background:#000)
- `#root>div>div>div` = PlaybackEngine region container (position:absolute, background:#000)

**Do NOT shorten this selector.** Each level has `background:'#000'` as an inline JSX style. Any
opaque div between the WebView surface and ExoPlayer's TextureView produces a permanently black
video. The UDB div and slot divs handle their own backgrounds reactively via `nativeVideoActive`
state; they do not need to be in this CSS rule.

### 8. console.log override: do NOT add AndroidHealth.logLine — it double-logs

**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `console.log` / `console.warn` override

The custom `console.log` replacement calls `originalLog.apply(console, args)`. This fires Chrome's
native console path, which `WebChromeClient.onConsoleMessage` intercepts and writes to Android
logcat as `OmniPushLogs`. That is the **only** path needed.

**Never add** `win.AndroidHealth.logLine(msg)` inside the override — that sends a second copy of
every log to `OmniPushLogs` via the Java bridge, making every line appear twice in logcat and
making ADB analysis unreliable (counts, timing, and instance-count deductions all become wrong).

### 9. 25-second transition watchdog must be cancellable (stored in a ref)

**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `advanceBuffer` → `transitionWatchdog25sRef`

The 25-second emergency watchdog that force-advances when `transitioningRef` is stuck must be
stored in `transitionWatchdog25sRef` and cancelled at the top of every `advanceBuffer` call:

```js
if (transitionWatchdog25sRef.current) clearTimeout(transitionWatchdog25sRef.current)
transitionWatchdog25sRef.current = setTimeout(() => { ... }, 25000)
```

**Do NOT use an anonymous `setTimeout`** for this watchdog. Anonymous timeouts accumulate without
cleanup — each call to `advanceBuffer` would create a new 25-second timer that can never be
cancelled. A stale watchdog firing 25s after an old transition (while a new transition is in its
700ms `transitioningRef=true` window) causes a spurious force-advance, which cascades into
rapid-advance: each forced advance starts another 25s timer, creating an unstoppable loop.

### 10. ExoPlayer watchdog must use max(duration, DEFAULT_VIDEO_DURATION) — never trust duration_seconds alone

**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `advanceBuffer` → ExoPlayer path

`commitAdvance()` sets the watchdog to `duration_seconds × 1000 + 20,000`. For HTML5 video, `onTimeUpdate`
fires 4×/sec and resets the watchdog to 15s ahead — so the DB value does not matter. **ExoPlayer has no
`onTimeUpdate` equivalent.** The watchdog fires exactly at `duration_seconds + 20s`.

If `duration_seconds` in the DB is wrong (e.g. 7s stored, actual video is 31s), the watchdog fires at 27s
and force-advances mid-video — cutting playback short. This is the primary cause of media synchronization
mismatch on the TV box.

**Fix:** After `commitAdvance()` in the ExoPlayer path, immediately override the watchdog:
```js
const exoDur = Math.max(getItemDuration(nextItem), DEFAULT_VIDEO_DURATION * 1000)
triggerWatchdog(exoDur + 20000)
```

This makes the watchdog emergency-only (fires only if ExoPlayer truly hangs). `onNativeVideoEnded` is
the primary advance signal and handles normal end-of-video transition.

**Do NOT** rely on `duration_seconds` being accurate in the DB. Inaccurate durations are common when
videos are uploaded without metadata extraction.

### 11. MediaCacheManager: treat JSON null checksum as absent

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

- **OMNI-106A** — Physical Amlogic S905W2 TV box. LAN: 192.168.1.10 (ADB: `adb connect 192.168.1.10:5555`). This is the device the black screen and rapid-advance bugs were found and fixed on. Always test video changes on this device or equivalent hardware.
- Chrome 83 WebView (Amlogic OEM) — HTML5 video is broken on this device. Native ExoPlayer path
  is mandatory for all video playback on Android.

## Pairing

The Android app displays a **6-digit** PIN. The CMS accepts exactly 6 digits.
