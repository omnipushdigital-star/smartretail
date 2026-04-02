# Project: Player System Debug Overhaul

## What This Is
A critical observability update for the **Omnipush Smart Retail Player** and **CMS Controller**. The system currently displays a raw, static debug loop that cannot be hidden once deployed visually. This project introduces a session-based toggling mechanism (both local and remote) and an expanded set of operational metrics to aid field troubleshooting without permanently cluttering the user interface.

## Value Prop
- **Cleaner UX:** High-quality retail displays shouldn't show raw logs unless necessary.
- **Improved Maintenance:** Field technicians can see why a player is offline or failing locally without relying on external logs.
- **Privacy/Security:** Debug codes can be hidden on reboot, ensuring that persistent technical metadata isn't leaked to customers.

## Requirements

### Validated
- ✓ [Existing] Double Buffer Video Engine (Stability fixed in master)
- ✓ [Existing] RLS-Bypass Heartbeat ACKing (Stability fixed in master)

### Active
- [ ] Remote Debug Toggle (CMS Devices page)
- [ ] Local Debug Toggle (Mouse/Tap hidden pattern on player)
- [ ] Ephemeral State (Reset debug view to 0/False on reboot)
- [ ] Metrics Overhaul (Last sync time, Network status, Playlist count, Tail error log)

### Out of Scope
- [Persistent Debug Logs] - This project focus is real-time overlay, not historical log aggregation.
- [External Monitoring APIs] - Datadog/CloudWatch integration is not required at this time.

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Session-only Persistence | Security/UX: We don't want a screen to accidentally stay in "Debug mode" for days after a technician finishes. Rebooting should always restore the perfect retail view. | Pending |
| Multi-Channel Toggle | Both local and remote. In remote areas, it might be hard to access the CMS; in physical kiosks, local access via mouse/tap is better. | Pending |

## Evolution
This document evolves during phase transitions and milestone boundaries.

---
*Last updated: 2026-04-02 after initialization*
