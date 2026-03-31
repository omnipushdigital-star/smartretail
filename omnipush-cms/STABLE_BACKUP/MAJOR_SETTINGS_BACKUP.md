# Major Settings & Stability Snapshot (v1.3.0)
Timestamp: 2026-03-29

This file contains the "Golden Configuration" for the Smart Retail Display System, covering the CMS, Edge Functions, and Player Engine.

## 1. Playback Engine Core (PlayerPage.tsx)
The player implements a double-buffered transition engine designed to eliminate flickering and maintain a 0ms gap between media.

### Transitions
- **Slide**: `translateX(-100%)` for outgoing / `translateX(0%)` from `translateX(100%)` for incoming.
- **Zoom**: `scale(1.2)/opacity(0)` for outgoing / `scale(1)/opacity(1)` from `scale(0.8)` for incoming.
- **Fade**: Simple `opacity 0 -> 1`.
- **None**: Instant swap.

### Safety Boundaries
- **Watchdog Timer**: Explicit 12-second skip timer initiated on each media load.
- **Video Suppressor**: `poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"` to hide the native "Play" icon.
- **Default Durations**: 10s for images, 30s for web pages.

## 2. CMS Integration (PlaylistsPage.tsx)
- **Inline Editing**: Real-time DB sync for `duration_seconds`, `playback_speed`, and `transition`.
- **Speed Options**: 0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x.
- **Transition Selection**: Persisted in the `settings` JSONB column in Supabase `playlist_items`.

## 3. Deployment & Environment
- **Vercel Root**: Set to `omnipush-cms` for master repo sync, override to `.` when deploying from subfolder.
- **Supabase Edge Function**: `device-manifest` must include the `settings` object in the payload for transition support.

## 5. Remote Monitoring & Screenshots
- **Current Storage**: Supabase Storage (`device-screenshots` bucket).
- **File Naming Pattern**: `${deviceCode}_${commandId}.jpg` for command-based shots.
- **Deletion Policy (Recommended)**: 30-day rolling window for screenshots and heartbeats to prevent DB bloat.
- **Cloudflare R2 Integration**: Infrastructure ready (`get-r2-upload-url` Edge Function). Recommended for high-volume screenshot storage to optimize costs.

## 6. Known Issues & Workarounds
- **Black Screenshots**: Occurs on hardware-accelerated WebViews when capturing `SurfaceView` content (video). Fix: Use `PixelCopy` API in Android native layer or implement a Web-based capture fallback in the player.
- **Vite Chunk Warnings**: Manual chunking in `vite.config.ts` recommended for production if assets exceed 500kB.
