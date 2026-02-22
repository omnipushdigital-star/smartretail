import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Users as UsersIcon, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Role } from '../../types'
import { DEFAULT_TENANT_ID } from '../../lib/supabase'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10
const emptyForm = { name: '', description: '' }

export default function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([])
    const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<Role | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)

    const loadRoles = async () => {
        setLoading(true)
        const [rolesRes, devicesRes] = await Promise.all([
            supabase.from('roles').select('*').order('name'),
            supabase.from('devices').select('role_id').eq('active', true),
        ])
        const roles = rolesRes.data || []
        const counts: Record<string, number> = {}
        for (const d of devicesRes.data || []) {
            if (d.role_id) counts[d.role_id] = (counts[d.role_id] || 0) + 1
        }
        setRoles(roles)
        setDeviceCounts(counts)
        setLoading(false)
    }

    useEffect(() => { loadRoles() }, [])

    const filtered = roles.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true) }
    const openEdit = (r: Role) => { setEditing(r); setForm({ name: r.name, description: r.description || '' }); setShowModal(true) }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) { toast.error('Name is required'); return }
        setSaving(true)
        try {
            if (editing) {
                const { error } = await supabase.from('roles').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id)
                if (error) throw error
                toast.success('Role updated')
            } else {
                const { error } = await supabase.from('roles').insert({ ...form, tenant_id: DEFAULT_TENANT_ID })
                if (error) throw error
                toast.success('Role created')
            }
            setShowModal(false)
            loadRoles()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
        }
        setSaving(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this role?')) return
        setDeleting(id)
        const { error } = await supabase.from('roles').delete().eq('id', id)
        if (error) toast.error(error.message)
        else { toast.success('Role deleted'); loadRoles() }
        setDeleting(null)
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Screen Roles</h1>
                    <p className="page-subtitle">Define roles for different screen types (Menu, Deals, Drinks, etc.)</p>
                </div>
                <button id="create-role-btn" className="btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Add Role
                </button>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ position: 'relative', maxWidth: 360 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                        id="role-search"
                        type="text"
                        className="input-field"
                        placeholder="Search roles..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1) }}
                        style={{ paddingLeft: '2rem' }}
                    />
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <UsersIcon size={40} />
                        <h3>No roles found</h3>
                        <p>{search ? 'Try different search terms.' : 'Create roles like "Main Menu", "Deals", "Drinks", etc.'}</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Role Name</th>
                                        <th>Description</th>
                                        <th>Devices Assigned</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(r => (
                                        <tr key={r.id}>
                                            <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{r.name}</td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{r.description || '—'}</td>
                                            <td>
                                                <span className="badge badge-blue">{deviceCounts[r.id] || 0} devices</span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => openEdit(r)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }}>
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button onClick={() => handleDelete(r.id)} className="btn-danger" style={{ padding: '0.375rem 0.625rem' }} disabled={deleting === r.id}>
                                                        {deleting === r.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
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
                <Modal title={editing ? 'Edit Role' : 'Add Role'} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label className="label">Role Name *</label>
                            <input id="role-name" className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Menu, Deals, Drinks..." />
                        </div>
                        <div className="form-group">
                            <label className="label">Description</label>
                            <textarea className="input-field" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description of this screen role..." />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Saving…' : editing ? 'Update Role' : 'Create Role'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
