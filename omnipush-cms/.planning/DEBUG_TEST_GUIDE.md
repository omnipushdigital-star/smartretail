# Testing Guide: Player Debug Overhaul

This guide provides step-by-step instructions to verify the Remote and Local Debugging features on both development environments and production hardware.

## 1. Local Trigger Testing (Physical/Browser)

### 1.1 Gesture Trigger (Standard Verification)
1.  Open the Player URL in your browser or on the device.
2.  **Triple-Click/Tap** the extreme **top-right corner** of the screen (Area: 120x120px).
3.  **Verification**: The "📡 Debug Info" overlay should appear in the bottom-right corner.
4.  Repeat the gesture to hide it.

### 1.2 Keyboard Shortcut (Power User)
1.  Ensure the browser window is focused.
2.  Press `Shift + X`.
3.  **Verification**: The overlay should toggle instantly.

## 2. Remote Toggle Testing (Simulation)

You can simulate a CMS command by manually inserting a record into the Supabase database.

### 2.1 SQL Simulation
Run the following SQL in your Supabase SQL Editor:
```sql
INSERT INTO device_commands (device_id, command, status)
SELECT id, 'TOGGLE_DEBUG', 'PENDING'
FROM devices
WHERE device_code = 'YOUR_DEVICE_CODE_HERE'
LIMIT 1;
```
1.  Observe the player. Within the next heartbeat cycle (default ~30s), the overlay should toggle.
2.  Check the "Last Sync" metric in the overlay to confirm the heartbeat was processed.

## 3. Metrics Verification

### 3.1 Network Status Loop
1.  **Disconnect** your internet/WiFi while the player is running.
2.  Observe the overlay: The status should change from `ONLINE` (Green) to `OFFLINE` (Red).
3.  **Reconnect**: Observe it returning to `ONLINE`.

### 3.2 Error Log verification
1.  Open the Browser DevTools (F12) while the overlay is visible.
2.  Run this in the Console:
    ```javascript
    console.error("Test Error: Hardware Sync Failed");
    ```
3.  **Verification**: The message "⚠️ Test Error: Hardware Sync Failed" should appear at the bottom of the Debug Info overlay.

### 3.3 Media/Playlist Sync
1.  Publish a new layout or update the current one in the CMS.
2.  Watch the "Last Sync" time in the overlay. It should update precisely when the manifest poll completes.
3.  Verify the "Media" and "Items" count matches your CMS configuration.

## 4. Stability Check (Aesthetics)
-   Verify that the overlay has a **blurred background** (`backdrop-filter`) and is readable over high-motion video content.
-   Ensure the **Micro Indicator** (e.g., `B1:R B2:R | Loading...`) is visible in the top-left of the video region when debug mode is active.
