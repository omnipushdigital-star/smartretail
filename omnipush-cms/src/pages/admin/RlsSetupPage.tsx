import React, { useState } from 'react'
import { Copy, Check, Shield, AlertTriangle, ChevronDown, ChevronUp, Info, Database, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── SQL Block Definitions ────────────────────────────────────────────────────

const SECTION_A_SQL = `-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION A — tenant_users mapping table                      ║
-- ╚══════════════════════════════════════════════════════════════╝

create table if not exists public.tenant_users (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

alter table public.tenant_users enable row level security;

-- Users can see their own tenant membership row(s)
drop policy if exists "tenant_users_select_self" on public.tenant_users;
create policy "tenant_users_select_self"
on public.tenant_users
for select
to authenticated
using (user_id = auth.uid());

-- Only service role can insert / update / delete (no authenticated policies = deny)
drop policy if exists "tenant_users_insert" on public.tenant_users;
drop policy if exists "tenant_users_update" on public.tenant_users;
drop policy if exists "tenant_users_delete" on public.tenant_users;`

const ASSIGN_SELF_SQL = `-- Run this while logged into the SQL Editor as a superuser/service role.
-- Replace the UUID with your actual Auth user ID
-- (find it at: Supabase Dashboard → Authentication → Users)

insert into public.tenant_users (tenant_id, user_id, role)
values (
  '00000000-0000-0000-0000-000000000001',  -- default tenant
  '<paste-your-auth-user-uuid-here>',
  'admin'
)
on conflict (tenant_id, user_id) do nothing;`

const SECTION_B_SQL = `-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION B — Helper function: is_tenant_member(tid)          ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Returns TRUE if the currently authenticated user belongs to the
-- given tenant. Used in all RLS policies below.

create or replace function public.is_tenant_member(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_users tu
    where tu.tenant_id = tid
      and tu.user_id   = auth.uid()
  );
$$;`

const SECTION_C_SQL = `-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION C — RLS for all tenant-scoped tables                ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── tenants (read-only for members; no CMS insert/update/delete) ──────────────
alter table public.tenants enable row level security;

drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select"
on public.tenants for select
to authenticated
using (public.is_tenant_member(id));

-- ── stores ────────────────────────────────────────────────────────────────────
alter table public.stores enable row level security;

drop policy if exists "stores_select" on public.stores;
create policy "stores_select"
on public.stores for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "stores_insert" on public.stores;
create policy "stores_insert"
on public.stores for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "stores_update" on public.stores;
create policy "stores_update"
on public.stores for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "stores_delete" on public.stores;
create policy "stores_delete"
on public.stores for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── roles ─────────────────────────────────────────────────────────────────────
alter table public.roles enable row level security;

drop policy if exists "roles_select" on public.roles;
create policy "roles_select"
on public.roles for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "roles_insert" on public.roles;
create policy "roles_insert"
on public.roles for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "roles_update" on public.roles;
create policy "roles_update"
on public.roles for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "roles_delete" on public.roles;
create policy "roles_delete"
on public.roles for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── devices ───────────────────────────────────────────────────────────────────
alter table public.devices enable row level security;

drop policy if exists "devices_select" on public.devices;
create policy "devices_select"
on public.devices for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "devices_insert" on public.devices;
create policy "devices_insert"
on public.devices for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "devices_update" on public.devices;
create policy "devices_update"
on public.devices for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "devices_delete" on public.devices;
create policy "devices_delete"
on public.devices for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── media_assets ──────────────────────────────────────────────────────────────
alter table public.media_assets enable row level security;

drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select"
on public.media_assets for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "media_assets_insert" on public.media_assets;
create policy "media_assets_insert"
on public.media_assets for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "media_assets_update" on public.media_assets;
create policy "media_assets_update"
on public.media_assets for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "media_assets_delete" on public.media_assets;
create policy "media_assets_delete"
on public.media_assets for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── playlists ─────────────────────────────────────────────────────────────────
alter table public.playlists enable row level security;

drop policy if exists "playlists_select" on public.playlists;
create policy "playlists_select"
on public.playlists for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "playlists_insert" on public.playlists;
create policy "playlists_insert"
on public.playlists for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "playlists_update" on public.playlists;
create policy "playlists_update"
on public.playlists for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "playlists_delete" on public.playlists;
create policy "playlists_delete"
on public.playlists for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── playlist_items (joins via playlist → tenant_id) ───────────────────────────
alter table public.playlist_items enable row level security;

drop policy if exists "playlist_items_select" on public.playlist_items;
create policy "playlist_items_select"
on public.playlist_items for select to authenticated
using (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id
      and public.is_tenant_member(p.tenant_id)
  )
);

drop policy if exists "playlist_items_insert" on public.playlist_items;
create policy "playlist_items_insert"
on public.playlist_items for insert to authenticated
with check (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id
      and public.is_tenant_member(p.tenant_id)
  )
);

drop policy if exists "playlist_items_update" on public.playlist_items;
create policy "playlist_items_update"
on public.playlist_items for update to authenticated
using (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id
      and public.is_tenant_member(p.tenant_id)
  )
);

drop policy if exists "playlist_items_delete" on public.playlist_items;
create policy "playlist_items_delete"
on public.playlist_items for delete to authenticated
using (
  exists (
    select 1 from public.playlists p
    where p.id = playlist_items.playlist_id
      and public.is_tenant_member(p.tenant_id)
  )
);

-- ── layout_templates ──────────────────────────────────────────────────────────
alter table public.layout_templates enable row level security;

drop policy if exists "layout_templates_select" on public.layout_templates;
create policy "layout_templates_select"
on public.layout_templates for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "layout_templates_insert" on public.layout_templates;
create policy "layout_templates_insert"
on public.layout_templates for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "layout_templates_update" on public.layout_templates;
create policy "layout_templates_update"
on public.layout_templates for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "layout_templates_delete" on public.layout_templates;
create policy "layout_templates_delete"
on public.layout_templates for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── layouts ───────────────────────────────────────────────────────────────────
alter table public.layouts enable row level security;

drop policy if exists "layouts_select" on public.layouts;
create policy "layouts_select"
on public.layouts for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "layouts_insert" on public.layouts;
create policy "layouts_insert"
on public.layouts for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "layouts_update" on public.layouts;
create policy "layouts_update"
on public.layouts for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "layouts_delete" on public.layouts;
create policy "layouts_delete"
on public.layouts for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── layout_region_playlists (joins via layout → tenant_id) ────────────────────
alter table public.layout_region_playlists enable row level security;

drop policy if exists "lrp_select" on public.layout_region_playlists;
create policy "lrp_select"
on public.layout_region_playlists for select to authenticated
using (
  exists (
    select 1 from public.layouts l
    where l.id = layout_region_playlists.layout_id
      and public.is_tenant_member(l.tenant_id)
  )
);

drop policy if exists "lrp_insert" on public.layout_region_playlists;
create policy "lrp_insert"
on public.layout_region_playlists for insert to authenticated
with check (
  exists (
    select 1 from public.layouts l
    where l.id = layout_region_playlists.layout_id
      and public.is_tenant_member(l.tenant_id)
  )
);

drop policy if exists "lrp_update" on public.layout_region_playlists;
create policy "lrp_update"
on public.layout_region_playlists for update to authenticated
using (
  exists (
    select 1 from public.layouts l
    where l.id = layout_region_playlists.layout_id
      and public.is_tenant_member(l.tenant_id)
  )
);

drop policy if exists "lrp_delete" on public.layout_region_playlists;
create policy "lrp_delete"
on public.layout_region_playlists for delete to authenticated
using (
  exists (
    select 1 from public.layouts l
    where l.id = layout_region_playlists.layout_id
      and public.is_tenant_member(l.tenant_id)
  )
);

-- ── bundles ───────────────────────────────────────────────────────────────────
alter table public.bundles enable row level security;

drop policy if exists "bundles_select" on public.bundles;
create policy "bundles_select"
on public.bundles for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "bundles_insert" on public.bundles;
create policy "bundles_insert"
on public.bundles for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "bundles_update" on public.bundles;
create policy "bundles_update"
on public.bundles for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "bundles_delete" on public.bundles;
create policy "bundles_delete"
on public.bundles for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── bundle_files (joins via bundle → tenant_id) ───────────────────────────────
alter table public.bundle_files enable row level security;

drop policy if exists "bundle_files_select" on public.bundle_files;
create policy "bundle_files_select"
on public.bundle_files for select to authenticated
using (
  exists (
    select 1 from public.bundles b
    where b.id = bundle_files.bundle_id
      and public.is_tenant_member(b.tenant_id)
  )
);

drop policy if exists "bundle_files_insert" on public.bundle_files;
create policy "bundle_files_insert"
on public.bundle_files for insert to authenticated
with check (
  exists (
    select 1 from public.bundles b
    where b.id = bundle_files.bundle_id
      and public.is_tenant_member(b.tenant_id)
  )
);

drop policy if exists "bundle_files_update" on public.bundle_files;
create policy "bundle_files_update"
on public.bundle_files for update to authenticated
using (
  exists (
    select 1 from public.bundles b
    where b.id = bundle_files.bundle_id
      and public.is_tenant_member(b.tenant_id)
  )
);

drop policy if exists "bundle_files_delete" on public.bundle_files;
create policy "bundle_files_delete"
on public.bundle_files for delete to authenticated
using (
  exists (
    select 1 from public.bundles b
    where b.id = bundle_files.bundle_id
      and public.is_tenant_member(b.tenant_id)
  )
);

-- ── layout_publications ───────────────────────────────────────────────────────
alter table public.layout_publications enable row level security;

drop policy if exists "layout_publications_select" on public.layout_publications;
create policy "layout_publications_select"
on public.layout_publications for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "layout_publications_insert" on public.layout_publications;
create policy "layout_publications_insert"
on public.layout_publications for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "layout_publications_update" on public.layout_publications;
create policy "layout_publications_update"
on public.layout_publications for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "layout_publications_delete" on public.layout_publications;
create policy "layout_publications_delete"
on public.layout_publications for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── rules ─────────────────────────────────────────────────────────────────────
alter table public.rules enable row level security;

drop policy if exists "rules_select" on public.rules;
create policy "rules_select"
on public.rules for select to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "rules_insert" on public.rules;
create policy "rules_insert"
on public.rules for insert to authenticated
with check (public.is_tenant_member(tenant_id));

drop policy if exists "rules_update" on public.rules;
create policy "rules_update"
on public.rules for update to authenticated
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

drop policy if exists "rules_delete" on public.rules;
create policy "rules_delete"
on public.rules for delete to authenticated
using (public.is_tenant_member(tenant_id));

-- ── rule_schedules (joins via rule → tenant_id) ───────────────────────────────
alter table public.rule_schedules enable row level security;

drop policy if exists "rule_schedules_select" on public.rule_schedules;
create policy "rule_schedules_select"
on public.rule_schedules for select to authenticated
using (
  exists (
    select 1 from public.rules r
    where r.id = rule_schedules.rule_id
      and public.is_tenant_member(r.tenant_id)
  )
);

drop policy if exists "rule_schedules_insert" on public.rule_schedules;
create policy "rule_schedules_insert"
on public.rule_schedules for insert to authenticated
with check (
  exists (
    select 1 from public.rules r
    where r.id = rule_schedules.rule_id
      and public.is_tenant_member(r.tenant_id)
  )
);

drop policy if exists "rule_schedules_update" on public.rule_schedules;
create policy "rule_schedules_update"
on public.rule_schedules for update to authenticated
using (
  exists (
    select 1 from public.rules r
    where r.id = rule_schedules.rule_id
      and public.is_tenant_member(r.tenant_id)
  )
);

drop policy if exists "rule_schedules_delete" on public.rule_schedules;
create policy "rule_schedules_delete"
on public.rule_schedules for delete to authenticated
using (
  exists (
    select 1 from public.rules r
    where r.id = rule_schedules.rule_id
      and public.is_tenant_member(r.tenant_id)
  )
);`

const SECTION_D_SQL = `-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION D — RLS for device_heartbeats (read-only for admins)║
-- ╚══════════════════════════════════════════════════════════════╝
-- Heartbeats have no direct tenant_id. We JOIN through devices.
-- Writes are performed exclusively by Edge Functions (service role).

alter table public.device_heartbeats enable row level security;

drop policy if exists "device_heartbeats_select" on public.device_heartbeats;
create policy "device_heartbeats_select"
on public.device_heartbeats for select
to authenticated
using (
  exists (
    select 1
    from public.devices d
    where d.id = device_heartbeats.device_id
      and public.is_tenant_member(d.tenant_id)
  )
);

-- Explicitly drop any stale insert/update/delete policies.
-- Authenticated users CANNOT write heartbeats — only service role (Edge Fn) can.
drop policy if exists "device_heartbeats_insert" on public.device_heartbeats;
drop policy if exists "device_heartbeats_update" on public.device_heartbeats;
drop policy if exists "device_heartbeats_delete" on public.device_heartbeats;`

const SECTION_E_SQL = `-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION E — Storage RLS for "media" bucket                  ║
-- ╚══════════════════════════════════════════════════════════════╝
-- Assumes object paths are structured as: tenant/<tenant_uuid>/filename
-- Supabase has RLS enabled on storage.objects by default.

drop policy if exists "media_objects_select" on storage.objects;
create policy "media_objects_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'media'
  and public.is_tenant_member(
    (regexp_match(name, '^tenant/([0-9a-fA-F-]{36})/'))[1]::uuid
  )
);

drop policy if exists "media_objects_insert" on storage.objects;
create policy "media_objects_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'media'
  and public.is_tenant_member(
    (regexp_match(name, '^tenant/([0-9a-fA-F-]{36})/'))[1]::uuid
  )
);

drop policy if exists "media_objects_update" on storage.objects;
create policy "media_objects_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'media'
  and public.is_tenant_member(
    (regexp_match(name, '^tenant/([0-9a-fA-F-]{36})/'))[1]::uuid
  )
)
with check (
  bucket_id = 'media'
  and public.is_tenant_member(
    (regexp_match(name, '^tenant/([0-9a-fA-F-]{36})/'))[1]::uuid
  )
);

drop policy if exists "media_objects_delete" on storage.objects;
create policy "media_objects_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'media'
  and public.is_tenant_member(
    (regexp_match(name, '^tenant/([0-9a-fA-F-]{36})/'))[1]::uuid
  )
);`

const SECTION_F_SQL = `-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SECTION F — Verification queries                            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1) Check your own tenant membership:
select * from tenant_users where user_id = auth.uid();

-- 2) Confirm RLS is enabled on all core tables:
select
  relname as table_name,
  relrowsecurity as rls_enabled
from pg_class
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where nspname = 'public'
  and relname in (
    'tenant_users', 'tenants',
    'stores', 'roles', 'devices',
    'media_assets', 'playlists', 'playlist_items',
    'layout_templates', 'layouts', 'layout_region_playlists',
    'bundles', 'bundle_files',
    'layout_publications', 'rules', 'rule_schedules',
    'device_heartbeats'
  )
order by table_name;

-- 3) Validate data access (should return your rows, not empty):
select count(*) as store_count from stores;
select count(*) as device_count from devices;
select count(*) as heartbeat_count from device_heartbeats;

-- 4) Confirm the helper function exists:
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'is_tenant_member';`

// ─── SQL Block data ───────────────────────────────────────────────────────────

const BLOCKS = [
    {
        id: 'A',
        color: '#f59e0b',
        label: 'Section A — tenant_users Mapping Table',
        description: 'Create the tenant_users join table and restrict access so users only see their own membership rows.',
        sql: SECTION_A_SQL,
    },
    {
        id: 'B',
        color: '#8b5cf6',
        label: 'Section B — is_tenant_member() Helper Function',
        description: 'Reusable SQL function that returns TRUE when the current user belongs to a given tenant_id. Used across all RLS policies.',
        sql: SECTION_B_SQL,
    },
    {
        id: 'C',
        color: '#06b6d4',
        label: 'Section C — RLS for All Tenant-Scoped Tables',
        description: 'Enable RLS and add SELECT / INSERT / UPDATE / DELETE policies for every table that carries a tenant_id column.',
        sql: SECTION_C_SQL,
    },
    {
        id: 'D',
        color: '#5a64f6',
        label: 'Section D — RLS for device_heartbeats (Admin Read-Only)',
        description: 'Admins can SELECT heartbeats by joining through the devices table. Writes are blocked for authenticated users — only Edge Functions (service role) can insert.',
        sql: SECTION_D_SQL,
    },
    {
        id: 'E',
        color: '#ec4899',
        label: 'Section E — Storage RLS for "media" Bucket',
        description: 'Restrict Storage uploads/downloads to tenant members. Requires object paths prefixed with tenant/<uuid>/.',
        sql: SECTION_E_SQL,
    },
    {
        id: 'F',
        color: '#22c55e',
        label: 'Section F — Verification Queries',
        description: 'Run these after applying all sections to confirm RLS is active and your user can access their tenant data.',
        sql: SECTION_F_SQL,
    },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function SqlCard({
    block,
    copied,
    onCopy,
}: {
    block: typeof BLOCKS[0]
    copied: string | null
    onCopy: (id: string, sql: string) => void
}) {
    const [open, setOpen] = useState(true)

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center',
                padding: '1rem 1.25rem',
                background: 'rgba(15,23,42,0.6)',
                borderBottom: open ? '1px solid #1e293b' : 'none',
                gap: '0.75rem',
            }}>
                {/* Section badge */}
                <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: block.color + '22',
                    border: `1px solid ${block.color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.8125rem', color: block.color,
                }}>
                    {block.id}
                </div>

                {/* Label + description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem' }}>{block.label}</div>
                    <div style={{ color: '#64748b', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{block.description}</div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                        onClick={() => onCopy(block.id, block.sql)}
                        className="btn-secondary"
                        style={{ gap: '0.375rem' }}
                    >
                        {copied === block.id
                            ? <><Check size={13} color="#22c55e" /> Copied!</>
                            : <><Copy size={13} /> Copy SQL</>
                        }
                    </button>
                    <button
                        onClick={() => setOpen(o => !o)}
                        className="btn-secondary"
                        style={{ padding: '0.5rem', minWidth: 'unset' }}
                        title={open ? 'Collapse' : 'Expand'}
                    >
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* SQL body */}
            {open && (
                <div>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 1.25rem',
                        background: '#060d1a',
                        borderBottom: '1px solid #0f172a',
                    }}>
                        <Database size={11} color="#475569" />
                        <span style={{ fontSize: '0.7188rem', color: '#475569', fontFamily: 'monospace' }}>PostgreSQL / Supabase SQL Editor</span>
                    </div>
                    <pre style={{
                        margin: 0,
                        padding: '1.25rem',
                        background: '#060d1a',
                        color: '#e2e8f0',
                        fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Consolas, monospace',
                        fontSize: '0.7813rem',
                        lineHeight: 1.75,
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                        maxHeight: 480,
                    }}>
                        {block.sql}
                    </pre>
                </div>
            )}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RlsSetupPage() {
    const [copied, setCopied] = useState<string | null>(null)
    const [assignCopied, setAssignCopied] = useState(false)

    const copyBlock = (id: string, sql: string) => {
        navigator.clipboard.writeText(sql)
        setCopied(id)
        toast.success(`Section ${id} copied to clipboard`)
        setTimeout(() => setCopied(null), 2000)
    }

    const copyAssign = () => {
        navigator.clipboard.writeText(ASSIGN_SELF_SQL)
        setAssignCopied(true)
        toast.success('Assignment SQL copied')
        setTimeout(() => setAssignCopied(false), 2000)
    }

    return (
        <div>
            {/* Page header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">RLS Setup</h1>
                    <p className="page-subtitle">
                        Production-grade Row Level Security — paste each block into Supabase SQL Editor in order A → F
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 1rem', borderRadius: 999,
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                    color: '#fbbf24', fontSize: '0.8125rem', fontWeight: 500,
                }}>
                    <Shield size={14} />
                    Manual SQL — Supabase Editor Only
                </div>
            </div>

            {/* Warning banner */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '1rem 1.25rem', marginBottom: '1.5rem',
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 10,
            }}>
                <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                    <div style={{ fontWeight: 600, color: '#fbbf24', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        Run sections in order: A → B → C → D → E → F
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem', lineHeight: 1.6 }}>
                        Go to <strong style={{ color: '#e2e8f0' }}>Supabase Dashboard → SQL Editor</strong>, paste each block and click <strong style={{ color: '#e2e8f0' }}>Run</strong>.
                        All <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: 3, color: '#7a8aff' }}>drop policy if exists</code> statements
                        are idempotent — safe to re-run. <strong style={{ color: '#fbbf24' }}>Section B must be run before C–E</strong> (policies depend on the helper function).
                    </div>
                </div>
            </div>

            {/* How-to: assign user to tenant */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '1rem 1.25rem', marginBottom: '1.75rem',
                background: 'rgba(90,100,246,0.07)', border: '1px solid rgba(90,100,246,0.2)',
                borderRadius: 10,
            }}>
                <UserCheck size={18} color="#7a8aff" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#a5b4fc', fontSize: '0.875rem', marginBottom: '0.375rem' }}>
                        How to assign your user to the tenant (required after Section A)
                    </div>
                    <ol style={{ margin: '0 0 0.75rem 1rem', padding: 0, color: '#94a3b8', fontSize: '0.8125rem', lineHeight: 1.8 }}>
                        <li>Go to <strong style={{ color: '#e2e8f0' }}>Supabase → Authentication → Users</strong> and copy your user's UUID.</li>
                        <li>Paste the UUID into the SQL below (replacing the placeholder).</li>
                        <li>Run it in the SQL Editor <strong style={{ color: '#e2e8f0' }}>using the service role</strong> (the editor always runs as superuser).</li>
                    </ol>
                    {/* Assign self SQL */}
                    <div style={{ position: 'relative' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.4rem 1rem',
                            background: '#060d1a', borderRadius: '8px 8px 0 0',
                            border: '1px solid #1e293b', borderBottom: 'none',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Database size={11} color="#475569" />
                                <span style={{ fontSize: '0.7188rem', color: '#475569', fontFamily: 'monospace' }}>Assign self to tenant — paste user UUID first</span>
                            </div>
                            <button
                                onClick={copyAssign}
                                className="btn-secondary"
                                style={{ gap: '0.375rem', padding: '0.3rem 0.625rem', fontSize: '0.75rem' }}
                            >
                                {assignCopied ? <><Check size={11} color="#22c55e" /> Copied!</> : <><Copy size={11} /> Copy</>}
                            </button>
                        </div>
                        <pre style={{
                            margin: 0, padding: '0.875rem 1rem',
                            background: '#060d1a', color: '#e2e8f0',
                            fontFamily: '"Fira Code", Consolas, monospace',
                            fontSize: '0.7813rem', lineHeight: 1.7,
                            overflowX: 'auto', whiteSpace: 'pre',
                            borderRadius: '0 0 8px 8px', border: '1px solid #1e293b',
                        }}>
                            {ASSIGN_SELF_SQL}
                        </pre>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.75rem' }}>
                        <Info size={13} color="#475569" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: '#475569', fontSize: '0.8rem', lineHeight: 1.6 }}>
                            Once RLS is active you will only see data for tenants you are a member of.
                            If the CMS shows empty tables after enabling RLS, it means the user is not yet assigned — run the above query.
                        </span>
                    </div>
                </div>
            </div>

            {/* SQL Blocks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {BLOCKS.map(block => (
                    <SqlCard key={block.id} block={block} copied={copied} onCopy={copyBlock} />
                ))}
            </div>

            {/* Footer note */}
            <div style={{
                marginTop: '1.5rem', padding: '1rem 1.25rem',
                background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)',
                borderRadius: 10,
            }}>
                <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                    <Shield size={15} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <div style={{ fontWeight: 600, color: '#4ade80', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            Security model summary
                        </div>
                        <ul style={{ margin: '0 0 0 1rem', padding: 0, color: '#64748b', fontSize: '0.8125rem', lineHeight: 1.8 }}>
                            <li><strong style={{ color: '#94a3b8' }}>Admin users</strong> — access rows scoped to their tenant via <code style={{ color: '#7a8aff' }}>is_tenant_member()</code>.</li>
                            <li><strong style={{ color: '#94a3b8' }}>Player devices</strong> — never query Postgres directly; all reads go through Edge Functions using the service role key.</li>
                            <li><strong style={{ color: '#94a3b8' }}>Heartbeat writes</strong> — performed exclusively by the <code style={{ color: '#7a8aff' }}>device-heartbeat</code> Edge Function (service role), not by authenticated users.</li>
                            <li><strong style={{ color: '#94a3b8' }}>Storage</strong> — media files are scoped by path prefix <code style={{ color: '#7a8aff' }}>tenant/&lt;uuid&gt;/…</code> enforced via storage.objects RLS.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
