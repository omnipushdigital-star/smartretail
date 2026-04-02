# Integrations

## Core Database & Auth (Supabase)

The core backbone of the entire CMS and player network is Supabase.
- **Data Layers:** Direct PG access via `@supabase/supabase-js`.
- **Edge Functions:** Deployed in Deno via Supabase (`v1/device-pairing`, `v1/device-heartbeat`, `v1/get-r2-upload-url`, `device-manifest`). The heartbeat manages RLS bypassing to acknowledge cache flushes directly to the `device_commands` DB.
- **Tenant Isolation:** Tenant context is intrinsically managed using row-level security (RLS) bound to `tenant_id` columns.

## Storage (Cloudflare R2 via AWS SDK)

- **Provider:** Cloudflare R2 object storage.
- **Adapter API:** Interfaced using `@aws-sdk/client-s3` acting against the S3-compatible endpoints.
- **Functions:** Uploading media assets is mediated by edge-generated presigned URLs (`get-r2-upload-url` Edge Function) to ensure the client uploads directly to R2 securely without exposing root tokens.

## Player Client Layer (Android Interface)

- **JavaScript Bridge:** The web player (`PlayerPage.tsx`) seamlessly communicates with the native Android layer via injected JavaScript interfaces: `window.AndroidHealth.setPlayerState('playing', label)`.
- **Updates:** The Android player periodically fetches application APK updates via Supabase/R2 hosting metadata stored in the DB, applying app refreshes via the CMS interface.

## Media Content Sources

- **YouTube Processing:** The CMS transparently processes raw YouTube URLs into optimized `youtube.com/embed` URLs ensuring 0-controls, autoplaying, looping background behavior.
- **Storage Paths:** Custom domains are mapped for content delivery (`pub-1bca73e45c7549a3b8a68d807324a9ba.r2.dev`).
