# Playback Implementation Snapshot (Fixed & Stable)
Date: 2026-03-19
Version: Stable Video Playback 1.0

## Successful Configuration
- **Double-Buffering Strategy**: Two persistent `<video>` elements with swapped `zIndex` and `opacity`.
- **Transitions**: Hard cuts (`transition: none`) to avoid Android WebView clipping/flickering.
- **Playback Start**: Explicit `currentTime = 0` and `.play()` only after `readyState >= 2` (canplay).
- **Polling Interval**: Fixed at **30 seconds**.
- **Heartbeat Interval**: Fixed at **30 seconds**.
- **Manifest Synchronization**: Uses `up_to_date` early return to prevent redundant state updates.
- **Auto-Sync**: Background asset synchronization via IndexedDB blobs.

## Key Files Modified
- `PlayerPage.tsx`: Core playback and transition logic.
- `device-manifest/index.ts`: Edge function for "up to date" check.
- `WebViewManager.kt`: Native JS injector for head/style safety.
- `PlayerActivity.kt`: Native heartbeat flag and orientation stability.
- `AndroidManifest.xml`: `configChanges` lock for orientation/resize.

## Restoration Steps
If video playback becomes jittery or heartbeats spam the server:
1. Ensure `DoubleBufferVideo` uses `transition: 'none'`.
2. Confirm `fetchManifest` has the `data.up_to_date` check.
3. Check `PlayerPage.tsx` for usage of `manifestTimerRef` and `hbTimerRef` (clearing old timers before setting new ones).
