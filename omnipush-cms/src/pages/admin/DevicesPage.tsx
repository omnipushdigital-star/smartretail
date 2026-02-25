import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Monitor, Copy, Check, Loader2, RefreshCw, Info, Eye, EyeOff, QrCode } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Device, Store, Role, DeviceHeartbeat } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 10
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000 // 3 minutes per spec

function isOnline(lastSeen?: string) {
    if (!lastSeen) return false
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

function generateDeviceCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') +
        '-' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function generateSecret() {
    return crypto.randomUUID()
}

const emptyForm = {
    display_name: '', store_id: '', role_id: '',
    orientation: 'landscape' as 'landscape' | 'portrait',
    resolution: '1920x1080', active: true
}

interface PairingInfo { device_code: string; device_secret: string }

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [heartbeats, setHeartbeats] = useState<Record<string, DeviceHeartbeat>>({})
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterStore, setFilterStore] = useState('')
    const [filterRole, setFilterRole] = useState('')
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [showPairingModal, setShowPairingModal] = useState(false)
    const [editing, setEditing] = useState<Device | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [pairing, setPairing] = useState<PairingInfo | null>(null)
    const [revealedId, setRevealedId] = useState<string | null>(null)

    const loadAll = async () => {
        setLoading(true)
        const [devsRes, storesRes, rolesRes, hbRes] = await Promise.all([
            supabase.from('devices').select('*, store:stores(id,code,name), role:roles(id,name,key)')
                .eq('tenant_id', DEFAULT_TENANT_ID).order('display_name'),
            supabase.from('stores').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
            supabase.from('device_heartbeats').select('*').order('last_seen_at', { ascending: false }).limit(500),
        ])
        const hbMap: Record<string, DeviceHeartbeat> = {}
        for (const hb of (hbRes.data || [])) {
            if (!hbMap[hb.device_code]) hbMap[hb.device_code] = hb
        }
        setDevices(devsRes.data || [])
        setStores(storesRes.data || [])
        setRoles(rolesRes.data || [])
        setHeartbeats(hbMap)
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const filtered = devices.filter(d => {
        const matchSearch = (d.device_code + (d.display_name || '') + ((d as any).store?.name || '')).toLowerCase().includes(search.toLowerCase())
        const matchStore = !filterStore || d.store_id === filterStore
        const matchRole = !filterRole || d.role_id === filterRole
        return matchSearch && matchStore && matchRole
    })
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }
    const openEdit = (d: Device) => {
        setEditing(d)
        setForm({
            display_name: d.display_name || '',
            store_id: d.store_id || '', role_id: d.role_id || '',
            orientation: d.orientation, resolution: d.resolution, active: d.active
        })
        setShowModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            if (editing) {
                const { error } = await supabase.from('devices').update({
                    display_name: form.display_name || null,
                    store_id: form.store_id || null, role_id: form.role_id || null,
                    orientation: form.orientation, resolution: form.resolution,
                    active: form.active, updated_at: new Date().toISOString(),
                }).eq('id', editing.id)
                if (error) throw error
                toast.success('Device updated')
                setShowModal(false)
                loadAll()
            } else {
                // Auto-generate device_code + secret
                const device_code = generateDeviceCode()
                const device_secret = generateSecret()
                const { error } = await supabase.from('devices').insert({
                    device_code, device_secret,
                    display_name: form.display_name || null,
                    store_id: form.store_id || null, role_id: form.role_id || null,
                    orientation: form.orientation, resolution: form.resolution,
                    active: form.active, tenant_id: DEFAULT_TENANT_ID,
                })
                if (error) throw error
                toast.success('Device registered')
                setShowModal(false)
                setPairing({ device_code, device_secret })
                setShowPairingModal(true)
                loadAll()
            }
        } catch (err: any) {
            if (err.message?.includes('devices_tenant_device_code_ux')) {
                toast.error('Device code already exists — please try again')
            } else {
                toast.error(err.message || 'Failed to save')
            }
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this device?')) return
        setDeleting(id)
        const { error } = await supabase.from('devices').delete().eq('id', id)
        if (error) toast.error(error.message)
        else { toast.success('Device deleted'); loadAll() }
        setDeleting(null)
    }

    const copyText = (text: string, label: string, id?: string) => {
        navigator.clipboard.writeText(text)
        if (id) setCopiedId(id)
        toast.success(`${label} copied`)
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Devices</h1>
                    <p className="page-subtitle">Manage display devices across store locations</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={loadAll} title="Refresh"><RefreshCw size={14} /></button>
                    <button id="create-device-btn" className="btn-primary" onClick={openCreate}><Plus size={16} /> Add Device</button>
                </div>
            </div>

            {/* Player Auth note */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1.25rem', marginBottom: '1rem', background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 10 }}>
                <Info size={15} color="#06b6d4" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    <strong style={{ color: '#67e8f9' }}>Player Auth:</strong> The Player calls <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: 3, color: '#7a8aff' }}>/device/manifest</code> with <code>device_code</code> + <code>device_secret</code> to fetch the active bundle (resolved by priority: <strong>DEVICE &gt; STORE &gt; GLOBAL</strong>).
                </p>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input type="text" className="input-field" placeholder="Search devices..." value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                    </div>
                    <select className="input-field" style={{ width: 'auto' }} value={filterStore} onChange={e => { setFilterStore(e.target.value); setPage(1) }}>
                        <option value="">All stores</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select className="input-field" style={{ width: 'auto' }} value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}>
                        <option value="">All roles</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <Monitor size={40} />
                        <h3>No devices found</h3>
                        <p>{search || filterStore || filterRole ? 'Try adjusting filters.' : 'Register your first display device.'}</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Device Code</th>
                                        <th>Display Name</th>
                                        <th>Store</th>
                                        <th>Role</th>
                                        <th>Orientation</th>
                                        <th>Device Secret</th>
                                        <th>Status</th>
                                        <th>Last Seen</th>
                                        <th>Version</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(d => {
                                        const hb = heartbeats[d.device_code]
                                        const online = isOnline(hb?.last_seen_at)
                                        return (
                                            <tr key={d.id}>
                                                <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: '#f1f5f9', letterSpacing: '0.05em' }}>{d.device_code}</span></td>
                                                <td style={{ color: '#cbd5e1' }}>{d.display_name || '—'}</td>
                                                <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{(d as any).store?.name || '—'}</td>
                                                <td>
                                                    {(d as any).role?.key
                                                        ? <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>{(d as any).role.key}</span>
                                                        : <span style={{ color: '#475569' }}>—</span>
                                                    }
                                                </td>
                                                <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>{d.orientation}</td>
                                                {/* ── Device Secret cell ── */}
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                        <span style={{
                                                            fontFamily: 'monospace', fontSize: '0.7rem',
                                                            color: revealedId === d.id ? '#a5b4fc' : '#334155',
                                                            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            letterSpacing: revealedId === d.id ? undefined : '0.1em',
                                                        }}>
                                                            {revealedId === d.id ? d.device_secret : '••••••••••••'}
                                                        </span>
                                                        <button
                                                            onClick={() => setRevealedId(revealedId === d.id ? null : d.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '0.2rem', display: 'flex' }}
                                                            title={revealedId === d.id ? 'Hide secret' : 'Reveal secret'}
                                                        >
                                                            {revealedId === d.id ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        </button>
                                                        <button
                                                            onClick={() => copyText(d.device_secret, 'Secret', d.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === d.id ? '#22c55e' : '#475569', padding: '0.2rem', display: 'flex' }}
                                                            title="Copy secret"
                                                        >
                                                            {copiedId === d.id ? <Check size={12} /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${online ? 'badge-green' : hb ? 'badge-red' : 'badge-gray'}`}>
                                                        {online ? '● Online' : hb ? '● Offline' : '○ Never'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                                    {hb ? formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true }) : '—'}
                                                </td>
                                                <td>
                                                    {hb?.current_version
                                                        ? <span className="badge badge-blue">{hb.current_version}</span>
                                                        : <span style={{ color: '#475569' }}>—</span>
                                                    }
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button onClick={() => openEdit(d)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }} title="Edit device">
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => { setPairing({ device_code: d.device_code, device_secret: d.device_secret }); setShowPairingModal(true) }}
                                                            className="btn-secondary"
                                                            style={{ padding: '0.375rem 0.625rem' }}
                                                            title="Show pairing info"
                                                        >
                                                            <QrCode size={13} />
                                                        </button>
                                                        <button onClick={() => handleDelete(d.id)} className="btn-danger" style={{ padding: '0.375rem 0.625rem' }} disabled={deleting === d.id}>
                                                            {deleting === d.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </>
                )}
            </div>

            {/* Register Device Modal */}
            {showModal && (
                <Modal title={editing ? 'Edit Device' : 'Register Device'} onClose={() => setShowModal(false)}>
                    {!editing && (
                        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(90,100,246,0.08)', border: '1px solid rgba(90,100,246,0.2)', borderRadius: 8, fontSize: '0.8125rem', color: '#94a3b8' }}>
                            ✨ <strong style={{ color: '#c7d2fe' }}>Device Code and Secret will be auto-generated</strong> — shown after creation for pairing.
                        </div>
                    )}
                    <form onSubmit={handleSave}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Store</label>
                                <select className="input-field" value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                                    <option value="">— Unassigned —</option>
                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Role</label>
                                <select className="input-field" value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
                                    <option value="">— Unassigned —</option>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name} {r.key ? `(${r.key})` : ''}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">Display Name</label>
                            <input className="input-field" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="e.g. Front Counter Screen" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Orientation</label>
                                <select className="input-field" value={form.orientation} onChange={e => setForm(f => ({ ...f, orientation: e.target.value as any }))}>
                                    <option value="landscape">Landscape</option>
                                    <option value="portrait">Portrait</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Resolution</label>
                                <select className="input-field" value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}>
                                    <option value="1920x1080">1920×1080 (Full HD)</option>
                                    <option value="3840x2160">3840×2160 (4K)</option>
                                    <option value="1280x720">1280×720 (HD)</option>
                                    <option value="1080x1920">1080×1920 (Portrait FHD)</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                                Active
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Saving…' : editing ? 'Update Device' : 'Register Device'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Pairing Instructions Modal */}
            {showPairingModal && pairing && (
                <Modal title="📺 Device Pairing Instructions" onClose={() => setShowPairingModal(false)}>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
                        Device registered! Use the credentials below to configure the Player app on the screen.
                    </div>
                    {[
                        { label: 'Device Code', value: pairing.device_code, mono: true, highlight: true },
                        { label: 'Device Secret', value: pairing.device_secret, mono: true },
                        { label: 'Player URL', value: `https://YOUR_PLAYER_DOMAIN/?code=${pairing.device_code}`, mono: true },
                    ].map(row => (
                        <div key={row.label} style={{ marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.375rem' }}>
                                {row.label}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#0f172a', borderRadius: 8, border: `1px solid ${row.highlight ? 'rgba(90,100,246,0.4)' : '#1e293b'}` }}>
                                <span style={{ flex: 1, fontFamily: row.mono ? 'monospace' : undefined, fontSize: row.highlight ? '1.125rem' : '0.8125rem', color: row.highlight ? '#c7d2fe' : '#cbd5e1', letterSpacing: row.highlight ? '0.15em' : undefined, fontWeight: row.highlight ? 700 : undefined, wordBreak: 'break-all' }}>
                                    {row.value}
                                </span>
                                <button
                                    onClick={() => copyText(row.value, row.label)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex', flexShrink: 0 }}
                                    title={`Copy ${row.label}`}
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.8125rem', color: '#92400e', marginTop: '0.5rem' }}>
                        ⚠️ <strong style={{ color: '#fbbf24' }}>Save the Device Secret now.</strong> It will not be shown again. Manual entry is also supported on the Player.
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                        <button className="btn-primary" onClick={() => setShowPairingModal(false)}>Done</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}
