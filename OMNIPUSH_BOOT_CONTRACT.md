# OMNIPUSH BOOT CONTRACT (v1.0)
## Hardened Initialization Sequence for Amlogic & Chromium 87

This document defines the critical technical requirements for the player to boot reliably on legacy Android hardware. These rules were established to fix the "Initializing" hang on Amlogic S905W2 devices.

> [!CAUTION]
> ANY VIOLATION OF THESE RULES MAY PREVENT DEVICE BOOT IN PRODUCTION.

### 1. Network Layer (supabase.ts)
*   **Rule**: ALL Edge Function calls MUST use `Promise.race()` between the fetch and a manual timer.
*   **Timing**: The manual timer MUST be `25,000ms`. The AbortController signal MUST be `28,000ms`.
*   **Why**: Chromium 87 (Amlogic) has a "blackhole" bug where `abort()` fires but the JS thread hangs indefinitely. The manual timer (3s gap) ensures the JS-level timer wins the race, bypassing the broken network abort.

### 2. Boot Sequence (PlayerPage.tsx)
*   **Rule**: The player MUST use a 3-attempt loop (`bootFetch`) before falling back to cache.
*   **Strategy**: Sequentially increment `failCountRef`.
*   **Why**: Devices often take 10-30 seconds after OS boot to stabilize the DNS/SSL stack. A single fetch attempt will cause the player to error out before the network is ready.

### 3. Loading Watchdog (index.html / PlayerPage.tsx)
*   **Rule**: The safety reload watchdog MUST be $\ge 90$ seconds.
*   **Math**: Each network attempt (25s) + backoff (~15s) means the 3rd attempt can take up to ~80 seconds.
*   **Why**: If the watchdog reloads at 15s or 30s (default values), it will interrupt the boot attempts before they can reach the "offline cache fallback" logic, causing an infinite reload cycle.

### 4. UI Rendering
*   **Viewport**: Use `100%` width instead of `100vw` for root containers to prevent the scrollbar bug that causes right-side clipping on WebViews.
*   **Connectivity Icons**: Ensure status icons have at least `32x32px` containers to prevent clipping on the Android navigation bar overlay.

---
*Created: April 2026*
*Status: BOOT-CRITICAL*
