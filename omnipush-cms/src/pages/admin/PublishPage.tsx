import React, { useEffect, useState } from 'react'
import { Upload, FileCheck, Loader2, Globe, Store as StoreIcon, Monitor, ChevronDown, ChevronRight, Package, ArrowUpRight } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Layout, Bundle } from '../../types'
import { Store, Role, Device } from '../../types'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'

type Scope = 'GLOBAL' | 'STORE' | 'DEVICE'

const SCOPE_OPTIONS: { value: Scope; label: string; icon: React.ReactNode; description: string }[] = [
    { value: 'GLOBAL', label: 'Global', icon: <Globe size={15} />, description: 'Apply to all stores for a role' },
    { value: 'STORE', label: 'Store Override', icon: <StoreIcon size={15} />, description: 'Override for a specific store' },
    { value: 'DEVICE', label: 'Device Override', icon: <Monitor size={15} />, description: 'Override for a specific device' },
]

interface ActivePub {
    id: string
    tenant_id: string
    scope: Scope
    layout_id: string
    bundle_id: string
    store_id?: string
    device_id?: string
    role_id?: string
    is_active: boolean
    published_at: string
    layout?: { name: string }
    bundle?: { version: string }
    store?: { name: string; code: string }
    device?: { device_code: string; display_name: string }
    role?: { name: string; key: string }
}

export default function PublishPage() {
    const navigate = useNavigate()
    const [layouts, setLayouts] = useState<Layout[]>([])
    const [bundles, setBundles] = useState<Bundle[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [devices, setDevices] = useState<Device[]>([])
    const [publications, setPublications] = useState<ActivePub[]>([])
    const [loading, setLoading] = useState(true)
    const [showPublishModal, setShowPublishModal] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [expandedPub, setExpandedPub] = useState<string | null>(null)

    const [form, setForm] = useState({
        role_id: '',
        scope: 'GLOBAL' as Scope,
        store_id: '',
        device_id: '',
        layout_id: '',
        bundle_id: '',
    })

    const loadAll = async () => {
        setLoading(true)
        const [lRes, bRes, sRes, rRes, dRes] = await Promise.all([
            supabase.from('layouts').select('*').order('name'),
            supabase.from('bundles').select('*').order('created_at', { ascending: false }),
            supabase.from('stores').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
            supabase.from('devices').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true).order('device_code'),
        ])
        const layouts_ = lRes.data || []
        const bundles_ = bRes.data || []
        const stores_ = sRes.data || []
        const roles_ = rRes.data || []
        const devices_ = dRes.data || []
        setLayouts(layouts_)
        setBundles(bundles_)
        setStores(stores_)
        setRoles(roles_)
        setDevices(devices_)

        // Try the join query first; fall back to plain select if schema cache is stale
        const pJoin = await supabase
            .from('layout_publications')
            .select('*, layout:layouts(name), bundle:bundles(version), store:stores(name,code), device:devices(device_code,display_name), role:roles(name,key)')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('is_active', true)
            .order('published_at', { ascending: false })

        if (!pJoin.error) {
            setPublications((pJoin.data as ActivePub[]) || [])
        } else {
            // Schema cache stale — fall back to simple select and resolve names client-side
            console.warn('Join query failed, falling back to simple select:', pJoin.error.message)
            const pSimple = await supabase
                .from('layout_publications')
                .select('*')
                .eq('tenant_id', DEFAULT_TENANT_ID)
                .eq('is_active', true)
                .order('published_at', { ascending: false })
            const pubs = (pSimple.data || []).map((p: any) => ({
                ...p,
                layout: layouts_.find((l: any) => l.id === p.layout_id) ? { name: (layouts_.find((l: any) => l.id === p.layout_id) as any).name } : undefined,
                bundle: bundles_.find((b: any) => b.id === p.bundle_id) ? { version: (bundles_.find((b: any) => b.id === p.bundle_id) as any).version } : undefined,
                role: roles_.find((r: any) => r.id === p.role_id) ? { name: (roles_.find((r: any) => r.id === p.role_id) as any).name, key: (roles_.find((r: any) => r.id === p.role_id) as any).key } : undefined,
                store: stores_.find((s: any) => s.id === p.store_id) ? { name: (stores_.find((s: any) => s.id === p.store_id) as any).name, code: (stores_.find((s: any) => s.id === p.store_id) as any).code } : undefined,
                device: devices_.find((d: any) => d.id === p.device_id) ? { device_code: (devices_.find((d: any) => d.id === p.device_id) as any).device_code, display_name: (devices_.find((d: any) => d.id === p.device_id) as any).display_name } : undefined,
            }))
            setPublications(pubs as ActivePub[])
        }
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const handlePublish = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.role_id) { toast.error('Please select a role'); return }
        if (!form.layout_id) { toast.error('Please select a layout'); return }
        if (!form.bundle_id) { toast.error('Please select a bundle'); return }
        if (form.scope === 'STORE' && !form.store_id) { toast.error('Please select a store'); return }
        if (form.scope === 'DEVICE' && !form.device_id) { toast.error('Please select a device'); return }

        setPublishing(true)
        try {
            // Step 1: Deactivate previous active publication for same target
            let deactivateQ = supabase.from('layout_publications')
                .update({ is_active: false })
                .eq('tenant_id', DEFAULT_TENANT_ID)
                .eq('is_active', true)
                .eq('scope', form.scope)
                .eq('role_id', form.role_id)

            if (form.scope === 'STORE') deactivateQ = deactivateQ.eq('store_id', form.store_id)
            if (form.scope === 'DEVICE') deactivateQ = deactivateQ.eq('device_id', form.device_id)
            const { error: deactivateErr } = await deactivateQ
            if (deactivateErr) throw deactivateErr

            // Step 2: Collect media from layout
            const { data: regions } = await supabase.from('layout_region_playlists').select('playlist_id').eq('layout_id', form.layout_id)
            const playlistIds = (regions || []).map((r: any) => r.playlist_id).filter(Boolean)
            let mediaIds: string[] = []
            if (playlistIds.length > 0) {
                const { data: items } = await supabase.from('playlist_items').select('media_id').in('playlist_id', playlistIds)
                mediaIds = [...new Set((items || []).map((i: any) => i.media_id).filter(Boolean))]
            }

            // Step 3: Insert bundle_files
            if (mediaIds.length > 0) {
                await supabase.from('bundle_files').delete().eq('bundle_id', form.bundle_id)
                const { error: filesErr } = await supabase.from('bundle_files').insert(
                    mediaIds.map(mid => ({ bundle_id: form.bundle_id, media_id: mid }))
                )
                if (filesErr) throw filesErr
            }

            // Step 4: Insert new publication
            const { error: pubErr } = await supabase.from('layout_publications').insert({
                tenant_id: DEFAULT_TENANT_ID,
                layout_id: form.layout_id,
                bundle_id: form.bundle_id,
                scope: form.scope,
                role_id: form.role_id,
                store_id: form.scope === 'STORE' ? form.store_id : null,
                device_id: form.scope === 'DEVICE' ? form.device_id : null,
                is_active: true,
                published_at: new Date().toISOString(),
            })
            if (pubErr) throw pubErr

            toast.success('Published successfully!')
            setShowPublishModal(false)
            setForm({ role_id: '', scope: 'GLOBAL', store_id: '', device_id: '', layout_id: '', bundle_id: '' })
            loadAll()
        } catch (err: any) {
            if (err.message?.includes('lp_active')) {
                toast.error('An active publication already exists for this target — deactivation failed in DB. Run Block C migration first.')
            } else {
                toast.error(err.message || 'Publish failed')
            }
        }
        setPublishing(false)
    }

    const forceRepair = async () => {
        const loading = toast.loading('Repairing database links...')
        try {
            // 1. Ensure Tenant
            await supabase.from('tenants').upsert({
                id: DEFAULT_TENANT_ID,
                name: 'Default Tenant',
                slug: 'default',
                active: true
            })

            // 2. Link orphans
            await supabase.from('roles').update({ tenant_id: DEFAULT_TENANT_ID }).eq('id', '642ed289-53e7-49f3-80f4-d50d32159074')
            await supabase.from('devices').update({ tenant_id: DEFAULT_TENANT_ID }).eq('device_code', 'DUB01_MAIN_001')

            // 3. Fix publication
            await supabase.from('layout_publications').update({
                tenant_id: DEFAULT_TENANT_ID,
                is_active: true
            }).eq('role_id', '642ed289-53e7-49f3-80f4-d50d32159074')

            toast.success('Database links restored! Refreshing playout...', { id: loading })
            loadAll()
        } catch (e: any) {
            toast.error('Repair failed: ' + e.message, { id: loading })
        }
    }

    const handleDeactivate = async (pubId: string) => {
        if (!confirm('Deactivate this publication?')) return
        const { error } = await supabase.from('layout_publications').update({ is_active: false }).eq('id', pubId)
        if (error) toast.error(error.message)
        else { toast.success('Deactivated'); loadAll() }
    }

    const scopeIcon = (scope: Scope) => {
        if (scope === 'GLOBAL') return <Globe size={13} color="#7a8aff" />
        if (scope === 'STORE') return <StoreIcon size={13} color="#f59e0b" />
        return <Monitor size={13} color="#22c55e" />
    }

    const scopeTarget = (pub: ActivePub) => {
        if (pub.scope === 'GLOBAL') return <span style={{ color: '#94a3b8' }}>All stores</span>
        if (pub.scope === 'STORE') return <span style={{ color: '#fde68a' }}>{pub.store?.name || pub.store_id}</span>
        return <span style={{ color: '#86efac' }}>{pub.device?.device_code} {pub.device?.display_name ? `(${pub.device.display_name})` : ''}</span>
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Publish</h1>
                    <p className="page-subtitle">Push layouts to devices — global, per-store, or per-device overrides</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={forceRepair}
                        className="btn-secondary"
                        style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', gap: '0.4rem' }}
                    >
                        Force DB Repair
                    </button>
                    <button className="btn-primary" onClick={() => setShowPublishModal(true)}>
                        <Upload size={14} /> Publish Layout
                    </button>
                </div>
            </div>

            {/* Override hierarchy note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', marginBottom: '1.25rem', background: 'rgba(90,100,246,0.05)', border: '1px solid rgba(90,100,246,0.15)', borderRadius: 10, fontSize: '0.8125rem' }}>
                <span style={{ color: '#64748b' }}>Override priority:</span>
                <span className="badge badge-green">DEVICE</span>
                <span style={{ color: '#475569' }}>›</span>
                <span className="badge badge-gray">STORE</span>
                <span style={{ color: '#475569' }}>›</span>
                <span className="badge badge-blue">GLOBAL</span>
                <span style={{ color: '#64748b', marginLeft: '0.25rem' }}>— per (tenant, role)</span>
            </div>

            {/* Active Publications */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileCheck size={16} color="#22c55e" />
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Active Publications</h2>
                </div>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}><Loader2 size={20} style={{ margin: '0 auto' }} /></div>
                ) : publications.length === 0 ? (
                    <div style={{ padding: '2rem', color: '#64748b', fontSize: '0.875rem', textAlign: 'center' }}>No active publications yet.</div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Scope</th>
                                    <th>Role</th>
                                    <th>Target</th>
                                    <th>Layout</th>
                                    <th>Bundle</th>
                                    <th>Published</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {publications.map(p => (
                                    <tr key={p.id}>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                {scopeIcon(p.scope)} <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{p.scope}</span>
                                            </span>
                                        </td>
                                        <td>
                                            {p.role ? (
                                                <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>{p.role.key}</span>
                                            ) : '—'}
                                        </td>
                                        <td>{scopeTarget(p)}</td>
                                        <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{p.layout?.name || '—'}</td>
                                        <td><span className="badge badge-green">{p.bundle?.version || '—'}</span></td>
                                        <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                                            {p.published_at ? formatDistanceToNow(new Date(p.published_at), { addSuffix: true }) : '—'}
                                        </td>
                                        <td>
                                            <button onClick={() => handleDeactivate(p.id)} className="btn-danger" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>
                                                Deactivate
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bundles overview */}
            <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Package size={15} color="#7a8aff" /> All Bundles
                    </span>
                    <button
                        onClick={() => navigate('/admin/bundles')}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', gap: '0.3rem', padding: '0.375rem 0.75rem' }}
                    >
                        Manage Bundles <ArrowUpRight size={12} />
                    </button>
                </div>
                {bundles.length === 0 ? (
                    <div style={{ color: '#475569', fontSize: '0.875rem' }}>
                        No bundles yet. <button onClick={() => navigate('/admin/bundles')} style={{ background: 'none', border: 'none', color: '#7a8aff', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}>Create one in Bundles →</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {bundles.slice(0, 8).map(b => (
                            <div key={b.id} className="card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span className="badge badge-blue" style={{ fontWeight: 700 }}>{b.version}</span>
                                <span style={{ color: '#64748b', fontSize: '0.8125rem', flex: 1 }}>{b.notes || 'No notes'}</span>
                                <span style={{ color: '#475569', fontSize: '0.75rem' }}>{b.created_at ? new Date(b.created_at).toLocaleDateString() : ''}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Publish Modal */}
            {showPublishModal && (
                <Modal title="Publish Layout" onClose={() => setShowPublishModal(false)}>
                    <form onSubmit={handlePublish}>
                        {/* Scope picker */}
                        <div className="form-group">
                            <label className="label">Scope *</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {SCOPE_OPTIONS.map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => setForm(f => ({ ...f, scope: opt.value, store_id: '', device_id: '' }))}
                                        style={{
                                            flex: 1, padding: '0.625rem 0.5rem', borderRadius: 8, cursor: 'pointer',
                                            border: `1px solid ${form.scope === opt.value ? 'rgba(90,100,246,0.6)' : '#1e293b'}`,
                                            background: form.scope === opt.value ? 'rgba(90,100,246,0.12)' : '#0f172a',
                                            color: form.scope === opt.value ? '#c7d2fe' : '#64748b',
                                            fontSize: '0.8125rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
                                        }}>
                                        {opt.icon}
                                        <span style={{ fontWeight: 600 }}>{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                            <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', color: '#475569' }}>
                                {SCOPE_OPTIONS.find(o => o.value === form.scope)?.description}
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="label">Role *</label>
                            <select className="input-field" value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
                                <option value="">— Select Role —</option>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.name} {r.key ? `(${r.key})` : ''}</option>)}
                            </select>
                        </div>

                        {form.scope === 'STORE' && (
                            <div className="form-group">
                                <label className="label">Store *</label>
                                <select className="input-field" value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                                    <option value="">— Select Store —</option>
                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                </select>
                            </div>
                        )}

                        {form.scope === 'DEVICE' && (
                            <div className="form-group">
                                <label className="label">Device *</label>
                                <select className="input-field" value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                                    <option value="">— Select Device —</option>
                                    {devices.map(d => <option key={d.id} value={d.id}>{d.device_code}{d.display_name ? ` — ${d.display_name}` : ''}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="form-group">
                            <label className="label">Layout *</label>
                            <select className="input-field" value={form.layout_id} onChange={e => setForm(f => ({ ...f, layout_id: e.target.value }))}>
                                <option value="">— Select Layout —</option>
                                {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="label">Bundle *</label>
                            <select className="input-field" value={form.bundle_id} onChange={e => setForm(f => ({ ...f, bundle_id: e.target.value }))}>
                                <option value="">— Select Bundle —</option>
                                {bundles.map(b => <option key={b.id} value={b.id}>{b.version}{b.notes ? ` — ${b.notes}` : ''}</option>)}
                            </select>
                        </div>

                        <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, marginBottom: '1rem', fontSize: '0.8125rem', color: '#92400e' }}>
                            ⚠️ <span style={{ color: '#94a3b8' }}>Publishing will <strong style={{ color: '#fbbf24' }}>deactivate the current active publication</strong> for the same (tenant, scope, role{form.scope !== 'GLOBAL' ? ', target' : ''}) automatically.</span>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowPublishModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={publishing}>
                                {publishing && <Loader2 size={14} />}
                                {publishing ? 'Publishing…' : 'Publish'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
