# Phase Context: Define System Architecture Intent

## Objective
Formalize the architectural vision and technical intent for the Omnipush Smart Retail System. This involves defining the data flow patterns between CMS, Edge Functions, and Player Kiosks, and establishing the long-term scaling strategy.

## Key Requirements
1.  **Distributed State Model:** Define how command state flows from CMS (Admin UI) -> Supabase (WAL/Realtime) -> Player (Heartbeat/Polling).
2.  **Asset Management Lifecycle:** Codify the lifecycle of a media asset from library upload -> processing -> playlist assignment -> local cache validation on physical screens.
3.  **Cross-Platform Integration:** Define the JavaScript/Native bridge patterns for hardware diagnostics (e.g., `window.AndroidHealth`).
4.  **Security & Isolation:** Formalize the RLS (Row-Level Security) vs. Edge Function bypass patterns.

## Success Criteria
- [ ] Comprehensive `ARCH-INTENT.md` document created in `.planning/codebase/`.
- [ ] Mermaid diagrams illustrating the current and future state architecture.
- [ ] Consistency check with existing `PlayerPage.tsx` and `device-heartbeat` implementations.
