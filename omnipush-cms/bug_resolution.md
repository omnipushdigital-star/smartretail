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

---

# Bug Resolution: "init v1 slide" Black Screen & Autoplay Failure

## Issue Description
When booting the player and attempting to play videos, the screen would stay completely black with a tiny debug string `init | V1 | slide` visible in the bottom corner. This affected PC browsers, Motorola mobiles, Android boxes, and Android Emulator instances, but the root causes were different between native Android (APK) and standard HTML5 browsers.

## Root Causes
1.  **HTML5 Mode (PC / Browser) - Playback Never Started (`autoPlay={false}`)**:
    *   To comply with browser autoplay policies, `DoubleBufferVideo` enforces `autoPlay={false}` and relies on custom JS transition logic to trigger `.play()`.
    *   However, during the initial boot sequence (when the system transitions from 'Initializing...' to playing the first item), we were setting the video `src` but **never making an explicit `.play()` call** for the first video.
    *   The player correctly waited for the hardware video clock to advance before executing the visual transition, but because the video was paused precisely at `0:00`, it resulted in an infinite "wait" loop displaying a black screen.

2.  **Native Mode (Android APK) - WebView Opaque Layer Occlusion**:
    *   For hardware efficiency on Android boxes, the Omnipush APK intercepts media URLs and delegates video decoding directly to Android `ExoPlayer` which renders on a `SurfaceView` sitting essentially **underneath** the HTML WebView.
    *   The Web App's `index.css` included a global rule formatting `<body />` and `#root` with `background: #000`.
    *   Because the WebView was rendering this opaque black wall, the hardware `ExoPlayer` was playing beautifully but was physically completely blocked from the user's view by the HTML UI sitting on top of it.

## Resolution: "Explicit Initialization & Window Punching"

### 1. Explicit Boot Sequence (`DoubleBufferVideo`)
In `DoubleBufferVideo`'s initial HTML5 sync effect, we introduced a specifically timed `setTimeout` delay:
*   Once `src` elements are injected, we wait 200ms to allow React to flush to the DOM.
*   We then dynamically hook the first slot video reference and explicitly call `v.play()`. This initiates the actual media clock cycle and kicks the player out of its paused limbo loop.

### 2. Native Mode Transparency (`PlayerPage.tsx`)
We promoted the `isAndroidNative` detection logic to the parent `PlayerPage` to observe when the system state reaches `playing`.
*   When executing in native mode during active playback, a dedicated React `useEffect` forcibly overrides `background: transparent;` deep into the core HTML container boundaries (`<body>`, `#root`, and absolute wrapper layer). This punches a transparent "window" straight through the HTML rendering layer, restoring visibility to the native `SurfaceView` rendering beneath it.

## Reference Files
*   `src/pages/PlayerPage.tsx` (Transparency override logic & explicit `.play()` initialization inside `DoubleBufferVideo`).
