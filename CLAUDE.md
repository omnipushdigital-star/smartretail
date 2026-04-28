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

---

## Device Notes

- **OMNI-106A** — Physical Amlogic S905W2 TV box at 106.219.159.21. This is the device the black
  screen bug was found and fixed on. Always test video changes on this device or equivalent hardware.
- Chrome 83 WebView (Amlogic OEM) — HTML5 video is broken on this device. Native ExoPlayer path
  is mandatory for all video playback on Android.

## Pairing

The Android app displays a **6-digit** PIN. The CMS accepts exactly 6 digits.
