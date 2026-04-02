# Roadmap: Player Debug Overhaul

## Milestone 1: Core Lifecycle & Local Toggle

**Goal:** Establish the debug state management in the player application and implement the hidden local activation mechanic.

| Phase | Title | Description | Est. Time | Status |
|-------|-------|-------------|-----------|--------|
| **1.1** | **Debug State & Local Logic** | Implement `showDebug` state in `PlayerPage.tsx` and the triple-tap/click logic in the top-right corner. | 1 hr | Completed |
| **1.2** | **Session Reset & Basic View** | Ensure `showDebug` defaults to `false` on reloads and implement the basic UI wrapper. | 1 hr | Completed |
| **1.3** | **Verification (Local)** | Manual hardware and browser verification of the tap-to-reveal sequence. | 30m | Completed |

## Milestone 2: CMS Integration (Remote Toggle)

**Goal:** Enable remote activation of the debug view from the centralized management dashboard.

| Phase | Title | Description | Est. Time | Status |
|-------|-------|-------------|-----------|--------|
| **2.1** | **Command Definition** | Define the `TOGGLE_DEBUG` command in the `device_commands` DB mapping. | 30m | Completed |
| **2.2** | **CMS UI Hook** | Add the "Toggle Debug Overlay" button to the Device Details page in the CMS. | 1 hr | Completed |
| **2.3** | **Player Command Listener** | Update the `processIncomingCommands` logic in the player to listen for and execute the toggle. | 1 hr | Completed |

## Milestone 3: Advanced Metrics & Final Polishing

**Goal:** Populate the overlay with expanded metrics and finalize the design.

| Phase | Title | Description | Est. Time | Status |
|-------|-------|-------------|-----------|--------|
| **3.1** | **System Info & Network Metrics** | Add `navigator.onLine` and `userAgent` / `resolution` to the overlay. | 1 hr | Completed |
| **3.2** | **Update & Status Metrics** | Integrate `lastSyncTime`, `playlistItemCount`, and the error tail log. | 1 hr | Completed |
| **3.3** | **UI/UX Refinement** | Style the overlay for maximum readability on 1080p retail screens. | 1 hr | Completed |

## Operational Status

- **Project Initialized:** 2026-04-02
- **Completed Phases:** 100%
- **Current Milestone:** Completed

---
*Last updated: 2026-04-02*
