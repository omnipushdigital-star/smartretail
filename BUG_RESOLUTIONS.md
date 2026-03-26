# OmniPush Bug Resolution Inventory

> **Purpose:** A living record of bugs encountered in OmniPush (Digital Signage Platform) and their confirmed resolutions.  
> **Device:** Amlogic S905W2 | Android 11 | WebView Chromium ~87 (frozen)  
> **Stack:** React 19 + Vite 7 SPA • Supabase Edge Functions • Cloudflare R2 CDN  
> **File:** `d:\Antigravity projects\Smart  Retail Display System\BUG_RESOLUTIONS.md`

---

## BUG-001 — Play Icon Flash During Video Transition

**Status:** 🔄 IN PROGRESS — Not yet confirmed fixed on device  
**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `DoubleBufferVideo`  
**Date Last Worked:** 2026-03-26

### Symptom
When transitioning between two videos in a playlist on the Android TV box, a native browser **play-button icon** (triangle/arrow) flashed on screen briefly during the swap. This did NOT happen in desktop browsers — it was WebView-specific.

### Root Cause
Three compounding causes:
1. **Native media controls overlay**: Chromium 87 WebView renders a built-in play icon overlay when a video element has no `src` or is paused.
2. **Decoder buffer collision**: Rapidly reassigning `src` on a video element that still held decoder buffers caused ACodec/OMXNodeInstance errors (Amlogic hardware), which reset the element to a "no source" state — triggering the play icon.
3. **Missing transparent poster**: Without a poster, the browser showed its default "no content" icon during the loading gap.

### Resolution

#### A. CSS — Suppress All Native Controls (in `globalStyle` string)
```css
video::-webkit-media-controls { display:none !important; }
video::-webkit-media-controls-enclosure { display:none !important; }
video::-webkit-media-controls-panel { display:none !important; }
video::-webkit-media-controls-play-button { display:none !important; }
video::-webkit-media-controls-overlay-play-button { display:none !important; }
video::-webkit-media-controls-start-playback-button { display:none !important; }
video::-internal-media-controls-overlay-play-button { display:none !important; }
```

#### B. Transparent Poster on Every Video Element
```tsx
poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
```
This is a 1×1 transparent GIF used as a blank placeholder so the browser never shows its default "no content" icon.

#### C. "Safe Swap" Logic — Sequential Decoder Management
The old code swapped video `src` attributes simultaneously. The fix:
1. Show a black overlay mask (`opacity: 1` div, `zIndex: 100`)
2. After 300ms (mask covers screen), **pause + clear + `load()`** the outgoing video to release decoder
3. Only then start `play()` on the incoming video
4. After `play()` resolves, hide overlay after a further 500ms

```tsx
// Step 1: Show mask
setIsTransitioning(true)

setTimeout(() => {
    requestAnimationFrame(() => {
        // Step 2: Release old decoder
        currentVideo.pause()
        currentVideo.removeAttribute('src')
        currentVideo.load()

        // Step 3: Play next
        setTimeout(() => {
            nextVideo.muted = true
            nextVideo.currentTime = 0
            nextVideo.play().then(() => {
                setActiveSlot(nextSlot)
                // Step 4: Keep mask a little longer for hardware to stabilize
                setTimeout(() => setIsTransitioning(false), 500)
            })
        }, 50)
    })
}, 300)
```

#### D. Video Element Attributes
```tsx
muted
playsInline
preload="auto"
autoPlay={false}
disablePictureInPicture={true}
webkit-playsinline="true"
x-webkit-airplay="deny"
controlsList="nodownload nofullscreen noremoteplayback"
```

---

## BUG-002 — Infinite Manifest Reconnection Loop ("Reconnecting..." message)

**Status:** ✅ Resolved  
**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `fetchManifest`  
**Date Resolved:** 2026-03-26

### Symptom
The player showed a continuous "Reconnecting..." message in the browser at `http://localhost:5173/player/DEVICE_CODE`. Logcat and DevTools showed `fetchManifest` being called in a rapid loop every few seconds.

### Root Cause
`fetchManifest` was declared with `useCallback` and had **`version` and `phase`** in its dependency array. Both of these state variables changed *as a result of* calling `fetchManifest` (it set `setVersion()` and `setPhase()`), creating a circular re-trigger:

```
fetchManifest called → sets version → version changes → new fetchManifest created → polling setInterval picks it up → loops
```

### Resolution
Remove `version` and `phase` from the `useCallback` dependency array. Use a `versionRef` (a `useRef` that stays in sync) inside the function body instead of reading `version` directly:

```tsx
// Sync ref whenever state changes
const versionRef = useRef<string | null>(null)
useEffect(() => { versionRef.current = version }, [version])

// In fetchManifest — read from ref, not state
current_version: versionRef.current,

// Stable dependency array — no version, no phase
}, [dc, syncAssets, initPairing]) // REMOVED version, phase
```

The polling timer in the `useEffect` uses `secretRef.current` (same pattern) so it never stales.

---

## BUG-003 — TypeScript Lint — "No Overlap" Error for New Transition Effect Values

**Status:** ✅ Resolved  
**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `DoubleBufferVideo`  
**Date Resolved:** 2026-03-26

### Symptom
After adding `slide-down` and `slide-right` to the transition system, TypeScript reported:
```
This comparison appears to be unintentional because the types '"fade" | "slide-left" | "none"' and '"slide-down"' have no overlap.
```

### Root Cause
The `effect` prop type union in the function signature was outdated — it only listed `'fade' | 'slide-up' | 'slide-left' | 'none'`. TypeScript's narrowing in the `if/else` chain saw the extra values as impossible.

### Resolution
1. Extract a named type alias so there's a single source of truth:
```tsx
type TransitionEffect = 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'none'
```
2. Update the prop: `effect?: TransitionEffect`
3. Rewrite the if/else chain as a **`switch` statement** — TypeScript narrows switch cases exhaustively, eliminating all "no overlap" warnings:
```tsx
const e: TransitionEffect = effect ?? 'slide-up'
switch (e) {
    case 'slide-down': style.transform = 'translate3d(0, 100%, 0)'; break
    case 'slide-right': style.transform = 'translate3d(100%, 0, 0)'; break
    // ...
}
```

---

## BUG-004 — Video Not Playing After Cache Clear (First Load Only)

**Status:** ✅ Resolved  
**File:** `omnipush-cms/src/pages/PlayerPage.tsx` → `DoubleBufferVideo` initialisation effect  
**Date Resolved:** 2026-03-26

### Symptom
After clearing browser cache on the Android TV box, the first video would not auto-play — the screen stayed black. A reload fixed it.

### Root Cause
On cold start, the `useEffect` that sets `slotUrls` and calls `v.play()` ran before the video element had loaded any data (`readyState < 2`). The `play()` promise was rejected silently.

### Resolution
Added a 100ms delay before the initial `play()` call to give the element time to start loading:
```tsx
setTimeout(() => {
    const v = activeSlot === 0 ? v1.current : v2.current
    if (v) {
        v.currentTime = 0
        v.play().catch(() => {})
    }
}, 100)
```
Also added a **watchdog interval** that re-fires `play()` if the active slot is paused but has data:
```tsx
setInterval(() => {
    const v = videoRefs[activeSlot].current
    if (v && v.paused && v.readyState >= 2 && !v.ended) {
        v.play().catch(() => {})
    }
}, 1500)
```

---

## BUG-005 — DownloadManager Crash on Auto-Update (Android App)

**Status:** ✅ Resolved  
**File:** `AndroidProjects/SmartRetailPlayer` — update download logic  
**Date Resolved:** 2026-03-15

### Symptom
App crashed with `IllegalArgumentException` during APK auto-update download.

### Root Cause
`DownloadManager` was passed a local file path (`C:\Users\...`) instead of a valid HTTPS URL pointing to the APK on Google Drive / server.

### Resolution
Changed the update check logic to:
1. Fetch version metadata from a hosted JSON endpoint
2. Compare installed version vs remote version
3. Pass only the HTTPS download URL to `DownloadManager`, never a local path

---

*Add new entries above this line in the format: `## BUG-NNN — Title`*
