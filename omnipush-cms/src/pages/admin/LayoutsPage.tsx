import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Layout as LayoutIcon, Loader2 } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Layout, LayoutTemplate, Playlist } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10

export default function LayoutsPage() {
    const [layouts, setLayouts] = useState<Layout[]>([])
    const [templates, setTemplates] = useState<LayoutTemplate[]>([])
    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [showDetail, setShowDetail] = useState<Layout | null>(null)
    const [editing, setEditing] = useState<Layout | null>(null)
    const [form, setForm] = useState({ name: '', template_id: '' })
    const [detailPlaylists, setDetailPlaylists] = useState<any[]>([])
    const [detailPlaylistId, setDetailPlaylistId] = useState('')
    const [saving, setSaving] = useState(false)

    const loadAll = async () => {
        setLoading(true)
        const [lRes, tRes, pRes] = await Promise.all([
            supabase.from('layouts').select('*, template:layout_templates(id,name,regions)').order('name'),
            supabase.from('layout_templates').select('*').order('name'),
            supabase.from('playlists').select('*').order('name'),
        ])
        setLayouts(lRes.data || [])
        setTemplates(tRes.data || [])
        setPlaylists(pRes.data || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const openCreate = () => {
        setEditing(null)
        setForm({ name: '', template_id: templates.find(t => t.is_default)?.id || templates[0]?.id || '' })
        setShowModal(true)
    }
    const openEdit = (l: Layout) => { setEditing(l); setForm({ name: l.name, template_id: l.template_id || '' }); setShowModal(true) }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) { toast.error('Name is required'); return }
        setSaving(true)
        try {
            if (editing) {
                const { error } = await supabase.from('layouts').update({ name: form.name, template_id: form.template_id || null, updated_at: new Date().toISOString() }).eq('id', editing.id)
                if (error) throw error
                toast.success('Layout updated')
            } else {
                const { data, error } = await supabase.from('layouts').insert({ name: form.name, template_id: form.template_id || null, tenant_id: DEFAULT_TENANT_ID }).select('id').single()
                if (error) throw error
                // Create default full region assignment
                if (form.template_id) {
                    await supabase.from('layout_region_playlists').insert({ layout_id: data.id, region_id: 'full', playlist_id: null })
                }
                toast.success('Layout created')
            }
            setShowModal(false)
            loadAll()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
        }
        setSaving(false)
    }

    const openDetail = async (l: Layout) => {
        setShowDetail(l)
        const { data } = await supabase.from('layout_region_playlists').select('*, playlist:playlists(id,name)').eq('layout_id', l.id)
        setDetailPlaylists(data || [])
        const fullRegion = (data || []).find((r: any) => r.region_id === 'full')
        setDetailPlaylistId(fullRegion?.playlist_id || '')
    }

    const saveRegionPlaylist = async () => {
        if (!showDetail) return
        // Upsert the full region assignment
        const existing = detailPlaylists.find(r => r.region_id === 'full')
        if (existing) {
            await supabase.from('layout_region_playlists').update({ playlist_id: detailPlaylistId || null }).eq('id', existing.id)
        } else {
            await supabase.from('layout_region_playlists').insert({ layout_id: showDetail.id, region_id: 'full', playlist_id: detailPlaylistId || null })
        }
        toast.success('Region playlist saved')
        openDetail(showDetail)
    }

    const paginated = layouts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Layouts</h1>
                    <p className="page-subtitle">Combine templates + playlists to build display layouts</p>
                </div>
                <button id="create-layout-btn" className="btn-primary" onClick={openCreate}>
                    <Plus size={16} /> New Layout
                </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <LayoutIcon size={40} />
                        <h3>No layouts</h3>
                        <p>Create a layout to assign playlists to template regions.</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Template</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(l => (
                                        <tr key={l.id}>
                                            <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{l.name}</td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{(l as any).template?.name || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => openDetail(l)} className="btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}>
                                                        Assign Playlist
                                                    </button>
                                                    <button onClick={() => openEdit(l)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }}>
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button onClick={async () => { if (!confirm('Delete layout?')) return; await supabase.from('layouts').delete().eq('id', l.id); toast.success('Deleted'); loadAll() }} className="btn-danger" style={{ padding: '0.375rem 0.625rem' }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={Math.ceil(layouts.length / PAGE_SIZE)} totalItems={layouts.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </>
                )}
            </div>

            {/* Create/Edit */}
            {showModal && (
                <Modal title={editing ? 'Edit Layout' : 'New Layout'} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label className="label">Layout Name *</label>
                            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Menu Display" />
                        </div>
                        <div className="form-group">
                            <label className="label">Template</label>
                            <select className="input-field" value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}>
                                <option value="">— Select Template —</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (Default)' : ''}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Saving…' : editing ? 'Update' : 'Create Layout'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Region detail */}
            {showDetail && (
                <Modal title={`Layout: ${showDetail.name}`} onClose={() => setShowDetail(null)}>
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1rem' }}>
                            Template: <strong style={{ color: '#94a3b8' }}>{(showDetail as any).template?.name || '—'}</strong>
                        </div>
                        <div style={{ background: '#0f172a', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', border: '1px solid #1e293b' }}>
                            <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Regions</div>
                            {detailPlaylists.length === 0 ? (
                                <div style={{ color: '#475569', fontSize: '0.875rem' }}>No regions assigned yet.</div>
                            ) : (
                                detailPlaylists.map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #1e293b' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#7a8aff' }}>{r.region_id}</span>
                                        <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{r.playlist?.name || '— No playlist —'}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="label">Assign Playlist to "Full Screen" Region</label>
                        <select className="input-field" value={detailPlaylistId} onChange={e => setDetailPlaylistId(e.target.value)}>
                            <option value="">— No Playlist —</option>
                            {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                        <button className="btn-secondary" onClick={() => setShowDetail(null)}>Close</button>
                        <button className="btn-primary" onClick={saveRegionPlaylist}>Save Assignment</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}
