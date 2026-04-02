# Requirements: Player Debug Overlay Overhaul

## User Stories

1.  **Remote Debugging:** "As a CMS Administrator, I want to remotely enable a debug overlay on a specific device so I can see its network status and last update time without traveling to the site."
2.  **Local Troubleshooting:** "As a Field Technician, I want to perform a hidden mouse-click or tap sequence on the physical screen to reveal technical metadata when the CMS is unreachable."
3.  **Automatic Cleanup:** "As a Store Manager, I want the technical codes to disappear if the device reboots, so my customers don't see raw logs after a power cycle."
4.  **Operational Insights:** "As a Developer, I want to see the total number of items in the playlist and the last sync time to verify scheduling logic is actually triggering correctly."

---

## 1. Local Toggle Mechanism

- **Trigger:** Triple-click (or triple-tap) in the **top-right corner** of the screen.
- **State Change:** Toggle `showDebug` React state.
- **Feedback:** Immediate display/hide of overlay.
- **Persistence:** **Volatile** (Reset to `false` on page refresh/reboot).

## 2. Remote Toggle Mechanism (CMS)

- **UI Location:** `DevicesPage.tsx` -> Device Details tab (Advanced section).
- **Control:** "Toggle Debug Overlay" button.
- **Action:** Send a `TOGGLE_DEBUG` command (ID: `TOGGLE_DEBUG`) via the `device_commands` table.
- **Player Response:** Listen for `TOGGLE_DEBUG` command. When received, flip the `showDebug` state in `PlayerPage.tsx`.

## 3. Debug Metrics Overhaul

| Metric Name | Source | Description |
|---|---|---|
| **Playlist Progress** | `activeItems` index | Current ID:x/y (e.g., ID:2/15) |
| **Network Status** | `navigator.onLine` | Visual "Online" (Green) or "Offline" (Red) text. |
| **Last Sync Time** | `manifestUpdate` state | Timestamp of the last successful `device-manifest` fetch. |
| **Total Media Count** | `items.length` | "Playlist items: [N]" |
| **Recent Error Log** | `addLog()` tail | Show the last 1-2 system errors (Red text). |
| **System Info** | `userAgent` | Browser version / Resolution (1920x1080). |

## 4. UI/UX Specifications

- **Position:** Fixed at Bottom-Right (overlaying content).
- **Background:** High-contrast semi-transparent black (`rgba(0,0,0,0.75)`).
- **Typography:** Monospaced, small font-size (`0.75rem`).
- **Visibility:** Default to `hidden` (`display: none` or conditional React rendering).
- **Safe Zone:** Ensure it stays within the 1080p safe zone (not cut off by overscan on older TV boxes).

---

## Technical Constraints

- **WebView Compatibility:** Must avoid heavy SVG filters or complex CSS that might tank the frame rate on older Android 11 boxes during video transitions.
- **Command Latency:** Commands must be fetched during the heartbeat cycle (default 30 seconds).

---

## Success Criteria

- [ ] Debug overlay is 100% hidden by default.
- [ ] Triple tap in top-right reveals overlay.
- [ ] Network status updates dynamically when Wi-Fi is cut.
- [ ] Rebooting the device hides the overlay automatically.
- [ ] CMS button successfully shows overlay remotely.
- [ ] All metrics (Last Update, Playlist Count, Errors) are visible in the overlay.
