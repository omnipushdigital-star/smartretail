# Player Debug System Architecture

This document outlines the architecture for the Remote and Local Debugging system implemented for the Smart Retail Display System, specifically optimized for legacy Android signage hardware.

## 1. Objectives
- Provide real-time visibility into player health without manual physical access.
- Enable high-level metrics (sync, network, playlist state) to be toggled remotely via CMS.
- Maintain a stable, ephemeral overlay that does not interfere with video playback performance.

## 2. Trigger Mechanisms

### 2.1 Remote CMS Toggle (Global/Targeted)
- Commands are sent via the `device_commands` table.
- The `device-heartbeat` Edge Function delivers the `TOGGLE_DEBUG` command to the device.
- The Player UI reacts by updating the `showDebugOverlay` state.
- **Persistence**: Session-only. If the player reloads, debug mode resets to `off` to prevent accidental burn-in or customer-facing UI leaks.

### 2.2 Local Diagnostic Taps
- **Admin Panel**: 5-tap top-left corner (Requires PIN: `2580`).
- **Debug Overlay**: 3-tap top-right corner. This allows field technicians to quickly verify sync status without entering a PIN.
- **Keyboard Shortcut**: `Shift + X` (Debug Overlay) and `Shift + D` (Technical Diagnostics).

## 3. Architecture Layers

### 3.1 Data Acquisition (The "Metrics Engine")
- **Sync Timing**: Tracked within the `fetchManifest` loop. Updates `lastSyncTime` on every successful delta or full manifest poll.
- **Console Hijacking**: The global `console.log`, `console.error`, and `console.warn` are proxied. Errors are pushed to a circular buffer (`remoteLogs`) which is rendered in the overlay.
- **Network Status**: Monitored via standard browser `navigator.onLine` and validated by `fetch` failures.

### 3.2 UI Rendering (The "Overlay Layer")
- **Z-Index Strategy**: The debug overlay uses `100,000` to ensure it renders above the main video layer (`10`) and admin panel (`99,999`).
- **Performance**: Uses `backdrop-filter: blur(10px)` for readability on any video background, with `pointer-events: none` to prevent interference with the hidden corner tap zones.
- **Native Compatibility**: When in "Native Handoff" mode (Cortex/ExoPlayer), the WebView is transparent. The overlay remains visible as an HTML overlay on top of the native surface view.

### 3.3 Component Tree
- `PlayerPage` (State Owner: `showDebugOverlay`)
  - `PlaybackEngine` (Prop Passing: `showDebug`)
    - `DoubleBufferVideo` (Internal state indicator - visible only if `showDebug` is true)
  - `DebugOverlay` (Conditional Rendering)

## 4. Stability Snapshots
The system is designed to adhere to the `PLAYBACK_STABILITY_SNAPSHOT.md` rules:
- No background network noise during video loops.
- Minimal DOM updates when debug is disabled.
- Watchdog integration: Debug info shows "WD Skip" or "Waiting" when the Double-Buffer system encounters playback delays.
