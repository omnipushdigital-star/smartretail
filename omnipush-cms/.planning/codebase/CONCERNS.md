# Technical Concerns

## Android WebView Instabilities

- **Bug History:** Older WebViews installed natively on budget Android hardware have proven unstable.
- **Video Memory:** Specifically, `<video>` rendering pipelines without explicit limits, CORS cross-origin complexities, or race condition `media.load()` triggers trigger abrupt Code 4 (`MEDIA_ERR_SRC_NOT_SUPPORTED`) format crashes. Handled extensively inside `PlayerPage.tsx` using Double Buffering, but requires extreme caution during any future edits.

## Infinite Loops

- **Command Acks:** Previous iteration saw infinite loops because the Player was subject to clientside RLS limits, preventing local cache commands from acknowledging gracefully in the DB.
- **Resolution:** Deferred updating to the heartbeat Edge Function via `ack_command_id`, meaning `device-heartbeat` is now load-bearing infrastructural security node. Do not casually change the parameter structure here.

## Daylight vs Night Mode Hardcodings

- **Legacy Cruft:** Some older CSS modules or React Tables have had explicit `#1e293b` colors mapped into the DOM. These had to be flushed out aggressively. Future Admin views must inherit generic token variables (`--color-surface-X`) for CSS structure.

## Database Concurrency

- **Drag and Drop DB Swaps:** Right now, dragging elements on `PlaylistsPage` triggers an `await Promise.all(...)` of direct POST calls updating row items. Not scaled efficiently. Highly granular modifications could throttle the API under massive scale.
