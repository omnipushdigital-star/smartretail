# Tech Stack

Overview of the Omnipush CMS Smart Retail Display System technology choices.

## Core Stack

- **Language:** TypeScript 5.9+
- **Framework:** React 19.x
- **Build Tool:** Vite 7.x
- **CSS Engine:** Tailwind CSS 4.x (via @tailwindcss/vite) + Vanilla CSS (`index.css` global tokens)
- **Routing:** React Router v7
- **Database / Backend:** Supabase (PostgreSQL, PostgREST, Edge Functions)

## Key Libraries

- **State / Data Fetching:** 
  - `@tanstack/react-query` - Async state management
  - Local component state (`useState`, `useEffect`)
- **Drag & Drop:** `@dnd-kit/core`, `sortable`, `utilities` (Playlist item reordering)
- **UI Components & Icons:** `lucide-react`
- **Notifications:** `react-hot-toast`
- **Utilities:** `date-fns` (time formatting), `clsx` (conditional styling)
- **Cloud Storage SDK:** `@aws-sdk/client-s3` (Cloudflare R2 interfacing through S3 API), `@aws-sdk/s3-request-presigner`
- **Canvas Capture:** `html2canvas` (potential preview/rendering mechanism)
- **QR Codes:** `qrcode.react` (pairing Android players to tenants)

## Infrastructure & Runtimes

- **Hosting Constraint:** Static generation targeted (deployed usually on Vercel or similar).
- **Embedded Player Native Target:** Android 11+ WebViews (Android player acts as shell downloading app manifest and rendering React/DOM elements directly).
- **Edge Functions Environment:** Deno via Supabase Edge Runtime (`supabase/functions/`).

## Tooling

- **Linter:** ESLint 9+ (`typescript-eslint`)
- **Compatibility:** `@vitejs/plugin-legacy` to transpile for older Chromium WebViews.
