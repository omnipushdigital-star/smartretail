# Codebase Structure

## Directory Framework

```text
omnipush-cms/
├── .planning/                  # GSD Project and Codebase Mapping
├── supabase/                   # Supabase environment definition
│   └── functions/              # Edge Function source files (Deno)
├── src/                        # Core React application source
│   ├── assets/                 # Local image branding elements
│   ├── components/             # Reusable UI components
│   │   ├── layout/             # Master layout scaffolds (AdminLayout)
│   │   └── ui/                 # Atomic UI primitives (Modals, Pagination)
│   ├── contexts/               # React Context Providers (TenantContext)
│   ├── lib/                    # SDK definitions (supabase.ts)
│   ├── pages/                  # Route level top-components
│   │   ├── admin/              # Management dashboard routes (PlaylistsPage, DevicesPage, etc.)
│   │   ├── PlayerPage.tsx      # Core digital signage rendering viewport engine
│   │   └── ...                 # Other unauthenticated / auth pages
│   └── types/                  # Global TS interfaces & type assertions
└── index.html                  # React Vite mount file
```

## Structural Patterns

- **Page Routing:** Root views are stored explicitly in `src/pages/`.
- **Admin Views:** Everything dashboard-related operates in its own sub-zone `src/pages/admin/` and is securely grouped.
- **Edge Synchronization:** Supabase Functions are kept in `supabase/functions/` but actively hot-synced into the CMS Edge Functions UI by utilizing Vite's `?raw` string loading mechanism, ensuring local copy-paste workflows operate on accurate truth data.

## Key Files
- `src/pages/PlayerPage.tsx` -> High risk, hyper-sensitive DOM manipulating engine. Operates fundamentally differently than the rest of the application utilizing `useEffect` lifecycle timing tricks to circumvent native Chromium bugs.
- `src/index.css` -> Houses the design theme and CSS token variants including "Daylight mode" responsive themes.
