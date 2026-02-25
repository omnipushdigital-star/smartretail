import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Store as StoreIcon, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Store } from '../../types'
import { DEFAULT_TENANT_ID } from '../../lib/supabase'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10
const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Dubai', 'Australia/Sydney']
const emptyForm = { code: '', name: '', timezone: 'UTC', active: true }

export default function StoresPage() {
    const [stores, setStores] = useState<Store[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<Store | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [toggling, setToggling] = useState<string | null>(null)

    const loadStores = async () => {
        setLoading(true)
        const { data } = await supabase.from('stores').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name')
        setStores(data || [])
        setLoading(false)
    }

    useEffect(() => { loadStores() }, [])

    const filtered = stores.filter(s => {
        const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase())
        const matchActive = filterActive === 'all' || (filterActive === 'active' ? s.active : !s.active)
        return matchSearch && matchActive
    })
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }
    const openEdit = (s: Store) => { setEditing(s); setForm({ code: s.code, name: s.name, timezone: s.timezone, active: s.active }); setShowModal(true) }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.code.trim() || !form.name.trim()) { toast.error('Code and Name are required'); return }
        const code = form.code.trim().toUpperCase()
        setSaving(true)
        try {
            if (editing) {
                const { error } = await supabase.from('stores').update({ ...form, code, updated_at: new Date().toISOString() }).eq('id', editing.id)
                if (error) throw error
                toast.success('Store updated')
            } else {
                const { error } = await supabase.from('stores').insert({ ...form, code, tenant_id: DEFAULT_TENANT_ID })
                if (error) throw error
                toast.success('Store created')
            }
            setShowModal(false)
            loadStores()
        } catch (err: any) {
            if (err.message?.includes('stores_tenant_code_ux') || err.message?.includes('stores_code_key')) {
                toast.error('A store with this code already exists')
            } else {
                toast.error(err.message || 'Failed to save')
            }
        }
        setSaving(false)
    }

    const toggleActive = async (s: Store) => {
        setToggling(s.id)
        const { error } = await supabase.from('stores').update({ active: !s.active, updated_at: new Date().toISOString() }).eq('id', s.id)
        if (error) toast.error(error.message)
        else { toast.success(s.active ? 'Store disabled' : 'Store enabled'); loadStores() }
        setToggling(null)
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Stores</h1>
                    <p className="page-subtitle">Manage retail store locations</p>
                </div>
                <button id="create-store-btn" className="btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Add Store
                </button>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '1 1 240px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input id="store-search" type="text" className="input-field" placeholder="Search stores..."
                            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                            style={{ paddingLeft: '2rem' }} />
                    </div>
                    <select className="input-field" style={{ width: 'auto' }} value={filterActive}
                        onChange={e => { setFilterActive(e.target.value as any); setPage(1) }}>
                        <option value="all">All status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <StoreIcon size={40} />
                        <h3>No stores found</h3>
                        <p>{search ? 'Try different search terms.' : 'Create your first store to get started.'}</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Code</th>
                                        <th>Name</th>
                                        <th>Timezone</th>
                                        <th>Updated</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(s => (
                                        <tr key={s.id}>
                                            <td><span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>{s.code}</span></td>
                                            <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{s.name}</td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{s.timezone}</td>
                                            <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                                                {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td>
                                                <span className={`badge ${s.active ? 'badge-green' : 'badge-gray'}`}>
                                                    {s.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => openEdit(s)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }}>
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(s)}
                                                        className={s.active ? 'btn-danger' : 'btn-secondary'}
                                                        style={{ padding: '0.375rem 0.625rem' }}
                                                        disabled={toggling === s.id}
                                                        title={s.active ? 'Disable store' : 'Enable store'}
                                                    >
                                                        {toggling === s.id ? <Loader2 size={13} /> : s.active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </>
                )}
            </div>

            {showModal && (
                <Modal title={editing ? 'Edit Store' : 'Add Store'} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSave}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Store Code *</label>
                                <input id="store-code" className="input-field"
                                    value={form.code}
                                    onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                                    placeholder="e.g. STORE001"
                                    disabled={!!editing}
                                    style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} />
                                <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#475569' }}>Unique per tenant. Auto-uppercased.</p>
                            </div>
                            <div className="form-group">
                                <label className="label">Store Name *</label>
                                <input id="store-name" className="input-field" value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Downtown Branch" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">Timezone</label>
                            <select className="input-field" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                            </select>
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
                                {saving ? 'Saving…' : editing ? 'Update Store' : 'Create Store'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
