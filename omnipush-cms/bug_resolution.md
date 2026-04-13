# Bug Resolution Report: Player Black Screen & Stalled Transitions

## Overview
**Issue**: The signage player displayed a black screen on production (Vercel) while working correctly on localhost.
**Root Cause**: A combination of a "locked" initialization state in the `DoubleBufferVideo` component and a failing Vercel build process that served a stale version of the app.

---

## Technical Root Causes

### 1. Stale Asset Reference (Double-Buffer Lock)
The `DoubleBufferVideo` component had a `useRef` called `initialSyncDone` that locked the video URLs after the very first render.
- **Problem**: On initial mount, the manifest often contains remote HTTPS URLs. While the player is "loading," it begins syncing these to local Blob URLs for gapless playback.
- **Failure**: Once the sync finished and `manifest.assets` updated to Blob URLs, the `DoubleBufferVideo` component ignored the updates because of the `initialSyncDone` lock. It stayed stuck on remote URLs which often fail to autoplay or stall on specific browser environments (like Android WebView or Vercel's production headers).

### 2. TypeScript Build Failure
The app had a missing reference to `lastErrorRef` in the `sendHeartbeat` function.
- **Problem**: Locally, the dev server might tolerate small type mismatches, but the Vercel build command (`tsc -b && vite build`) is strict.
- **Failure**: The build failed silently in the dashboard, causing Vercel to continue serving a 12-hour-old version of the site that did not contain any of the recent stability fixes.

### 3. Heartbeat Stale Closure
The `sendHeartbeat` callback was missing `phase` in its dependency array.
- **Problem**: It captured the initial `loading` state accurately but didn't update when the player transitioned to `playing`.
- **Result**: The dashboard reported the device as `loading` even if it was actually trying to play, making remote monitoring impossible.

---

## Resolution Steps

1.  **Refactored `DoubleBufferVideo`**:
    - Removed `initialSyncDone` lock.
    - Added a reactive `useEffect` that updates `slotUrls` whenever `items` or `assets` change (e.g., after hydration).
    - Added a 5-second "Boot Watchdog" to force-start playback if the browser's `onCanPlay` event fails to trigger due to auto-play restrictions.

2.  **Fixed Compilation Errors**:
    - Defined `lastErrorRef` at the top level of `PlayerPage`.
    - Verified with a manual `npx tsc` check to ensure the build pipeline is clean.

3.  **Synchronized Heartbeats**:
    - Added `phase` to the dependency array of `sendHeartbeat` to ensure accurate telemetry.

4.  **Deployment Synchronization**:
    - Successfully pushed fixed code to `master`.
    - Manually promoted the build on Vercel to bypass the "Staged" state and force a production update.

---

## Verification
- **Vercel URL**: `https://signage.omnipushdigital.com/player/screen6`
- **Result**: Confirmed live video playback (Apache Pizza assets) and active buffer swapping (`ID:0/2 | Start OK`).
- **Telemetry**: Heartbeat now accurately reports `playing` status to Supabase.

**Status**: ✅ Resolved and Deployed
