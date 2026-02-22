import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Monitor, Copy, Check, Loader2, RefreshCw } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Device, Store, Role, DeviceHeartbeat } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 10
const ONLINE_THRESHOLD_MS = 15 * 60 * 1000

function isOnline(lastSeen?: string) {
    if (!lastSeen) return false
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

const emptyForm = {
    device_code: '', display_name: '', store_id: '', role_id: '',
    orientation: 'landscape' as 'landscape' | 'portrait', resolution: '1920x1080', active: true
}

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
    const [editing, setEditing] = useState<Device | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [selected, setSelected] = useState<string[]>([])
    const [bulkAction, setBulkAction] = useState('')

    const loadAll = async () => {
        setLoading(true)
        const [devsRes, storesRes, rolesRes, hbRes] = await Promise.all([
            supabase.from('devices').select('*, store:stores(id,code,name), role:roles(id,name)').order('display_name'),
            supabase.from('stores').select('*').eq('active', true).order('name'),
            supabase.from('roles').select('*').order('name'),
            supabase.from('device_heartbeats').select('*').order('last_seen_at', { ascending: false }).limit(200),
        ])
        const devs = devsRes.data || []
        // Latest heartbeat per device
        const hbMap: Record<string, DeviceHeartbeat> = {}
        for (const hb of (hbRes.data || [])) {
            if (!hbMap[hb.device_code]) hbMap[hb.device_code] = hb
        }
        setDevices(devs)
        setStores(storesRes.data || [])
        setRoles(rolesRes.data || [])
        setHeartbeats(hbMap)
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const filtered = devices.filter(d => {
        const matchSearch = (d.device_code + (d.display_name || '') + (d.store?.name || '')).toLowerCase().includes(search.toLowerCase())
        const matchStore = !filterStore || d.store_id === filterStore
        const matchRole = !filterRole || d.role_id === filterRole
        return matchSearch && matchStore && matchRole
    })

    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }
    const openEdit = (d: Device) => {
        setEditing(d)
        setForm({
            device_code: d.device_code, display_name: d.display_name || '',
            store_id: d.store_id || '', role_id: d.role_id || '',
            orientation: d.orientation, resolution: d.resolution, active: d.active
        })
        setShowModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.device_code.trim()) { toast.error('Device code is required'); return }
        setSaving(true)
        try {
            const payload = {
                device_code: form.device_code,
                display_name: form.display_name || null,
                store_id: form.store_id || null,
                role_id: form.role_id || null,
                orientation: form.orientation,
                resolution: form.resolution,
                active: form.active,
                updated_at: new Date().toISOString(),
            }
            if (editing) {
                const { error } = await supabase.from('devices').update(payload).eq('id', editing.id)
                if (error) throw error
                toast.success('Device updated')
            } else {
                const { error } = await supabase.from('devices').insert({ ...payload, tenant_id: DEFAULT_TENANT_ID })
                if (error) throw error
                toast.success('Device created')
            }
            setShowModal(false)
            loadAll()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
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

    const copySecret = (id: string, secret: string) => {
        navigator.clipboard.writeText(secret)
        setCopiedId(id)
        toast.success('Secret copied')
        setTimeout(() => setCopiedId(null), 2000)
    }

    const handleBulkApply = async () => {
        if (!bulkAction || selected.length === 0) { toast.error('Select devices and an action'); return }
        const [action, value] = bulkAction.split(':')
        if (!value) { toast.error('No target selected'); return }
        const field = action === 'store' ? 'store_id' : 'role_id'
        const { error } = await supabase.from('devices').update({ [field]: value, updated_at: new Date().toISOString() }).in('id', selected)
        if (error) toast.error(error.message)
        else { toast.success(`Updated ${selected.length} device(s)`); setSelected([]); setBulkAction(''); loadAll() }
    }

    const toggleSelect = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    const toggleAll = () => setSelected(s => s.length === paginated.length ? [] : paginated.map(d => d.id))

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Devices</h1>
                    <p className="page-subtitle">Manage display devices across all store locations</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={loadAll} title="Refresh">
                        <RefreshCw size={14} />
                    </button>
                    <button id="create-device-btn" className="btn-primary" onClick={openCreate}>
                        <Plus size={16} /> Add Device
                    </button>
                </div>
            </div>

            {/* Filters */}
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

            {/* Bulk actions */}
            {selected.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(90,100,246,0.1)', border: '1px solid rgba(90,100,246,0.3)', borderRadius: 10, marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.875rem', color: '#7a8aff', fontWeight: 500 }}>{selected.length} selected</span>
                    <select className="input-field" style={{ width: 'auto' }} value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
                        <option value="">Bulk action...</option>
                        <optgroup label="Assign Store">
                            {stores.map(s => <option key={s.id} value={`store:${s.id}`}>→ Store: {s.name}</option>)}
                        </optgroup>
                        <optgroup label="Assign Role">
                            {roles.map(r => <option key={r.id} value={`role:${r.id}`}>→ Role: {r.name}</option>)}
                        </optgroup>
                    </select>
                    <button className="btn-primary" onClick={handleBulkApply} style={{ padding: '0.375rem 0.875rem' }}>Apply</button>
                    <button className="btn-secondary" onClick={() => setSelected([])} style={{ padding: '0.375rem 0.875rem' }}>Clear</button>
                </div>
            )}

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
                                        <th style={{ width: 40 }}>
                                            <input type="checkbox" checked={selected.length === paginated.length} onChange={toggleAll} />
                                        </th>
                                        <th>Device Code</th>
                                        <th>Display Name</th>
                                        <th>Store</th>
                                        <th>Role</th>
                                        <th>Status</th>
                                        <th>Last Seen</th>
                                        <th>Version</th>
                                        <th>Secret</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(d => {
                                        const hb = heartbeats[d.device_code]
                                        const online = isOnline(hb?.last_seen_at)
                                        return (
                                            <tr key={d.id}>
                                                <td><input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggleSelect(d.id)} /></td>
                                                <td><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8125rem', color: '#f1f5f9' }}>{d.device_code}</span></td>
                                                <td style={{ color: '#cbd5e1' }}>{d.display_name || '—'}</td>
                                                <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{(d as any).store?.name || '—'}</td>
                                                <td>{(d as any).role?.name ? <span className="badge badge-blue">{(d as any).role.name}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                                                <td>
                                                    <span className={`badge ${online ? 'badge-green' : (hb ? 'badge-red' : 'badge-gray')}`}>
                                                        {online ? '● Online' : hb ? '● Offline' : '○ Never'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                                    {hb ? formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true }) : '—'}
                                                </td>
                                                <td>{hb?.current_version ? <span className="badge badge-blue">{hb.current_version}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569', letterSpacing: '0.1em' }}>
                                                            {'•'.repeat(8)}
                                                        </span>
                                                        <button
                                                            onClick={() => copySecret(d.id, d.device_secret)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex' }}
                                                            title="Copy secret"
                                                        >
                                                            {copiedId === d.id ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button onClick={() => openEdit(d)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }}>
                                                            <Edit2 size={13} />
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

            {showModal && (
                <Modal title={editing ? 'Edit Device' : 'Register Device'} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSave}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Device Code *</label>
                                <input className="input-field" value={form.device_code} onChange={e => setForm(f => ({ ...f, device_code: e.target.value }))} placeholder="DEV-001" disabled={!!editing} />
                            </div>
                            <div className="form-group">
                                <label className="label">Display Name</label>
                                <input className="input-field" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Front Counter Screen" />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Store</label>
                                <select className="input-field" value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                                    <option value="">— Unassigned —</option>
                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Role</label>
                                <select className="input-field" value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
                                    <option value="">— Unassigned —</option>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
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
        </div>
    )
}
