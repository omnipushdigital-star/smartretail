# Bug Resolution: Amlogic Android TV (Chromium 87) Boot Hang & Reload Loop

## Issue Description
When booting the player on Amlogic S905W2 devices (Android 11, Chromium 87 WebView), the player would often get stuck on the "Initializing" screen or enter a continuous reload loop (spinner cycling Red -> Green -> Red).

## Root Causes
1.  **Chromium 87 `AbortController` Silent Hang**:
    *   In the legacy Chromium 87 WebView, calling `AbortController.abort()` on a pending `fetch` request would sometimes cause the entire JavaScript thread to hang or never resolve the Promise. This resulted in a "silent blackhole" where the player state would never progress.
2.  **Android App Native Watchdog Conflicts**:
    *   The Android application wrapper has a native watchdog that force-reloads the WebView if it doesn't finish loading within ~30-40 seconds.
    *   Our initial network timeouts (25s) + multiple retries exceeded this 30s window, causing the app to reload the page exactly while we were attempting the first connection. This created an infinite "reload loop" that eventually corrupted the player state.
3.  **HTML-Level Watchdog Interference**:
    *   A legacy 15s reload watchdog in `index.html` was triggering before the player's 3 attempts could complete, causing premature reloads even when the network was eventually available.

## Resolution: "Fast Boot" Optimization

### 1. Manual Timeout Race (`supabase.ts`)
We replaced the standard `AbortController` timeout logic with a manual `Promise.race` between the network fetch and a custom JS timer.
*   **Gap Timing**: The manual timer (e.g., 12s) fires **3 seconds before** the `AbortController.abort()` signal. This ensures the JS Promise resolves via the timer first, bypassing the buggy `abort()` mechanism in Chromium 87.

### 2. Fast Boot Sequence (`PlayerPage.tsx`)
We implemented a boot-specific network sequence to survive the Android App's 30s loading window:
*   **12s Timeouts**: Each of the 3 boot attempts now uses a strict 12-second timeout (down from 25s).
*   **Sequence Timing**: Total time for 3 attempts is ~36 seconds, ensuring the player hits the "Offline cache fallback" (which displays pixels immediately) within a window that the Android watchdog accepts.

### 3. Extended Watchdog (`index.html`)
We increased the HTML-level error watchdog from 15s to **45s**.
*   **Why**: This gives the 3rd "Fast Boot" attempt enough time to finish and trigger the cache fallback before the page is force-reloaded by the `window.onerror` handler.

## Verification Checklist
- [x] **No infinite loop**: Spinner transitions to content or standby screen within 40s.
- [x] **Offline Resilience**: Disconnecting network should trigger cache fallback after 3x12s attempts.
- [x] **Visual Stability**: No clipping of WiFi icon or playlist images on Android WebView.

## Reference Files
*   `src/lib/supabase.ts` (Network timeout logic)
*   `src/pages/PlayerPage.tsx` (BootFetch loop sequence)
*   `index.html` (Emergency reload watchdog)
