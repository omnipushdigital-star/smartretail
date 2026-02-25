import React, { useState } from 'react'
import { Copy, Check, Database, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const SQL_BLOCKS = [
    {
        id: 'A',
        label: 'SQL BLOCK A — Fix Multi-Tenant Uniqueness',
        description: 'Drop global unique constraints on stores.code and devices.device_code, replace with composite unique per tenant.',
        color: '#f59e0b',
        sql: `DO $$ BEGIN
  ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_code_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stores_tenant_code_ux
ON public.stores (tenant_id, code);

DO $$ BEGIN
  ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_device_code_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS devices_tenant_device_code_ux
ON public.devices (tenant_id, device_code);`,
    },
    {
        id: 'B',
        label: 'SQL BLOCK B — Add Stable Role Key',
        description: 'Adds roles.key column, backfills from name (uppercase + underscored), enforces NOT NULL, unique per tenant.',
        color: '#8b5cf6',
        sql: `ALTER TABLE public.roles
ADD COLUMN IF NOT EXISTS key text;

UPDATE public.roles
SET key = upper(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g'))
WHERE key IS NULL;

ALTER TABLE public.roles
ALTER COLUMN key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_key_ux
ON public.roles (tenant_id, key);`,
    },
    {
        id: 'C',
        label: 'SQL BLOCK C — Upgrade layout_publications (GLOBAL/STORE/DEVICE Overrides)',
        description: 'Adds scope columns, removes incorrect uniqueness on layout_id, adds partial unique indexes for active publications per target scope.',
        color: '#06b6d4',
        sql: `ALTER TABLE public.layout_publications
ADD COLUMN IF NOT EXISTS tenant_id uuid,
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN IF NOT EXISTS store_id uuid,
ADD COLUMN IF NOT EXISTS device_id uuid,
ADD COLUMN IF NOT EXISTS role_id uuid,
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.layout_publications
ADD CONSTRAINT IF NOT EXISTS layout_publications_tenant_id_fkey
FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE public.layout_publications
ADD CONSTRAINT IF NOT EXISTS layout_publications_store_id_fkey
FOREIGN KEY (store_id) REFERENCES public.stores(id);

ALTER TABLE public.layout_publications
ADD CONSTRAINT IF NOT EXISTS layout_publications_device_id_fkey
FOREIGN KEY (device_id) REFERENCES public.devices(id);

ALTER TABLE public.layout_publications
ADD CONSTRAINT IF NOT EXISTS layout_publications_role_id_fkey
FOREIGN KEY (role_id) REFERENCES public.roles(id);

DO $$ BEGIN
  ALTER TABLE public.layout_publications DROP CONSTRAINT IF EXISTS layout_publications_layout_id_key;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS lp_active_global_ux
ON public.layout_publications (tenant_id, role_id)
WHERE is_active = true AND scope = 'GLOBAL';

CREATE UNIQUE INDEX IF NOT EXISTS lp_active_store_ux
ON public.layout_publications (tenant_id, store_id, role_id)
WHERE is_active = true AND scope = 'STORE';

CREATE UNIQUE INDEX IF NOT EXISTS lp_active_device_ux
ON public.layout_publications (tenant_id, device_id, role_id)
WHERE is_active = true AND scope = 'DEVICE';`,
    },
    {
        id: 'D',
        label: 'SQL BLOCK D — Performance Indexes',
        description: 'Adds lookup indexes for devices, publications, and heartbeats to optimize Player manifest resolution.',
        color: '#22c55e',
        sql: `CREATE INDEX IF NOT EXISTS devices_lookup_idx
ON public.devices (tenant_id, store_id, role_id, active);

CREATE INDEX IF NOT EXISTS lp_lookup_idx
ON public.layout_publications (tenant_id, scope, store_id, device_id, role_id, is_active);

CREATE INDEX IF NOT EXISTS heartbeat_device_last_seen_idx
ON public.device_heartbeats (device_id, last_seen_at DESC);`,
    },
]

export default function DbMigrationPage() {
    const [copied, setCopied] = useState<string | null>(null)

    const copyBlock = (id: string, sql: string) => {
        navigator.clipboard.writeText(sql)
        setCopied(id)
        toast.success(`Block ${id} copied to clipboard`)
        setTimeout(() => setCopied(null), 2000)
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">DB Migration</h1>
                    <p className="page-subtitle">Run these SQL blocks in Supabase SQL Editor (in order A → D)</p>
                </div>
            </div>

            {/* Warning Banner */}
            <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '1rem 1.25rem', marginBottom: '1.5rem',
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                borderRadius: 10,
            }}>
                <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                    <div style={{ fontWeight: 600, color: '#fbbf24', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                        Run blocks in order: A → B → C → D
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem', lineHeight: 1.5 }}>
                        Go to <strong style={{ color: '#e2e8f0' }}>Supabase Dashboard → SQL Editor</strong>, paste each block and click <strong style={{ color: '#e2e8f0' }}>Run</strong>.
                        All statements use <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: 3, color: '#7a8aff' }}>IF NOT EXISTS</code> / <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: 3, color: '#7a8aff' }}>IF EXISTS</code> — they are safe to re-run.
                    </div>
                </div>
            </div>

            {/* SQL Blocks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {SQL_BLOCKS.map(block => (
                    <div key={block.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Block header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid #1e293b',
                            background: 'rgba(15,23,42,0.6)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: 8,
                                    background: block.color + '22',
                                    border: `1px solid ${block.color}44`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: '0.8125rem', color: block.color,
                                }}>
                                    {block.id}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.9rem' }}>{block.label}</div>
                                    <div style={{ color: '#64748b', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{block.description}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => copyBlock(block.id, block.sql)}
                                className="btn-secondary"
                                style={{ flexShrink: 0, gap: '0.375rem' }}
                            >
                                {copied === block.id
                                    ? <><Check size={13} color="#22c55e" /> Copied!</>
                                    : <><Copy size={13} /> Copy SQL</>
                                }
                            </button>
                        </div>

                        {/* SQL code */}
                        <div style={{ position: 'relative' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                padding: '0.5rem 1.25rem',
                                background: '#060d1a',
                                borderBottom: '1px solid #0f172a',
                            }}>
                                <Database size={12} color="#475569" />
                                <span style={{ fontSize: '0.75rem', color: '#475569', fontFamily: 'monospace' }}>PostgreSQL</span>
                            </div>
                            <pre style={{
                                margin: 0,
                                padding: '1.25rem',
                                background: '#060d1a',
                                color: '#e2e8f0',
                                fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", Consolas, monospace',
                                fontSize: '0.8125rem',
                                lineHeight: 1.7,
                                overflowX: 'auto',
                                whiteSpace: 'pre',
                            }}>
                                {block.sql}
                            </pre>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer note */}
            <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(90,100,246,0.05)', border: '1px solid rgba(90,100,246,0.15)', borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.6 }}>
                    <strong style={{ color: '#7a8aff' }}>Player manifest resolution order</strong> (after Block C is applied):
                    &nbsp;<span className="badge badge-blue">DEVICE</span> overrides &nbsp;
                    <span className="badge badge-gray">STORE</span> overrides &nbsp;
                    <span className="badge badge-gray">GLOBAL</span>.
                    &nbsp;For each (tenant, role) only <strong style={{ color: '#e2e8f0' }}>one active publication per scope target</strong> is allowed at a time.
                </p>
            </div>
        </div>
    )
}
