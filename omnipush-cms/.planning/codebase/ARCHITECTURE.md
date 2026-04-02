# Architecture

## System Pattern

The application adopts a **Client-Heavy Single Page Application (SPA)** architecture married to a **Serverless Database Context (BaaS)** pattern using Supabase.

### High-Level Components

1. **CMS Dashboard Interface (`AdminLayout`)**
   - Renders via React Router.
   - Responsible for organizing Tenant scope (Stores, Layouts, Devices, Libraries, Playlists).
   - Manipulates direct relational data on Supabase tables via React Query / raw SDK calls.

2. **Player App / Render Engine (`PlayerPage.tsx`)**
   - Specialized route designated to run silently inside Android `WebView` kiosks.
   - Dual-buffer DOM structure for pre-caching videos via parallel `<video>` nodes with opacity/Z-index swaps, completely mitigating Android chromium initialization delay.
   - Continuously heartbeats to `device-heartbeat` Edge Function to mark remote commands as `EXECUTED` and maintain device active presence.
   - Syncs localized manifest JSON structures to determine schedule loops.

3. **Backend Validation / Edge Functions**
   - Complex transactions mapping internal UUIDs (e.g. Device Pairing PIN flow `device-pairing`, RLS-bypassed Acks `device-heartbeat`) are deferred to Edge Functions.
   - Storage upload security uses Pre-signed URL delegation (`get-r2-upload-url`).

## Data Flow

1. **Admin mutations** update PostgreSQL via PostgREST endpoint (Supabase JS API).
2. Changes immediately trigger real-time cascading logical shifts structurally in the DB.
3. **Player Kiosks** regularly fetch the updated manifest JSON (`device-manifest`) calculating time-based dayparting limits client-side initially.
4. Player issues `poll` requests checking for explicit commands (like `CLEAR_CACHE`) executing them locally in the Android environment via `window.AndroidHealth` JS bridges.

## Access Boundaries

- **Clientside State Context:** Tied to `TenantContext`. All Admin views operate under `currentTenantId`.
- **Database Rules:** Standard Row-Level-Security (RLS) policies govern data mutations enforcing tenant isolation intrinsically.
- **Player Bypass:** Edge Functions bypass restrictive RLS to authorize device-level actions seamlessly.
