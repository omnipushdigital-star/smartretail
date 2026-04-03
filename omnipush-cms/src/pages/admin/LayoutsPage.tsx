import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Layout as LayoutIcon, Loader2, Send, CheckCircle, Smartphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { Layout, LayoutTemplate, Playlist, Role } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10

export default function LayoutsPage() {
    const { currentTenantId } = useTenant()
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
    const [roles, setRoles] = useState<Role[]>([])
    const [showQuickPublish, setShowQuickPublish] = useState<Layout | null>(null)
    const [publishing, setPublishing] = useState(false)
    const [saving, setSaving] = useState(false)

    const loadAll = async () => {
        if (!currentTenantId) return
        setLoading(true)
        const [lRes, tRes, pRes, rRes] = await Promise.all([
            supabase.from('layouts').select('*, template:layout_templates(id,name,regions)').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('layout_templates').select('*').order('name'),
            supabase.from('playlists').select('*').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', currentTenantId).order('name'),
        ])
        setLayouts(lRes.data || [])
        setTemplates(tRes.data || [])
        setPlaylists(pRes.data || [])
        setRoles(rRes.data || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [currentTenantId])

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
                const { data, error } = await supabase.from('layouts').insert({ name: form.name, template_id: form.template_id || null, tenant_id: currentTenantId }).select('id').single()
                if (error) throw error

                // Create assignments for all regions defined in the template
                const selectedTemplate = templates.find(t => t.id === form.template_id)
                if (selectedTemplate && Array.isArray(selectedTemplate.regions)) {
                    const assignments = selectedTemplate.regions.map((r: any) => ({
                        layout_id: data.id,
                        region_id: r.id,
                        playlist_id: null
                    }))
                    if (assignments.length > 0) {
                        await supabase.from('layout_region_playlists').insert(assignments)
                    }
                } else {
                    // Fallback to 'full' for legacy templates without explicit regions
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
    }

    const saveRegionPlaylist = async (regionId: string, playlistId: string) => {
        if (!showDetail) return
        const existing = detailPlaylists.find(r => r.region_id === regionId)
        if (existing) {
            await supabase.from('layout_region_playlists').update({ playlist_id: playlistId || null }).eq('id', existing.id)
        } else {
            await supabase.from('layout_region_playlists').insert({ layout_id: showDetail.id, region_id: regionId, playlist_id: playlistId || null })
        }
        toast.success(`Region ${regionId} updated`)
        openDetail(showDetail)
    }

    const syncRegions = async () => {
        if (!showDetail || !currentTenantId) return
        const t = templates.find(temp => temp.id === showDetail.template_id)
        if (!t || !Array.isArray(t.regions)) {
            toast.error('Template has no regions to sync')
            return
        }

        const confirmSync = confirm("This will reset all playlist assignments for this layout to match the template's regions. Continue?")
        if (!confirmSync) return

        setSaving(true)
        try {
            // Drop current mappings
            await supabase.from('layout_region_playlists').delete().eq('layout_id', showDetail.id)

            // Re-backfill from template
            const assignments = t.regions.map((r: any) => ({
                layout_id: showDetail.id,
                region_id: r.id,
                playlist_id: null
            }))
            await supabase.from('layout_region_playlists').insert(assignments)

            toast.success('Regions synced successfully')
            openDetail(showDetail)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSaving(false)
        }
    }

    const handleQuickPublish = async (roleId: string) => {
        if (!showQuickPublish || !currentTenantId) return
        setPublishing(true)
        const loadingToast = toast.loading('Initiating Quick Publish...')

        try {
            const version = `auto-v${new Date().getTime().toString().slice(-6)}`
            const layout = showQuickPublish

            // 1. Create Bundle
            const { data: bundle, error: bErr } = await supabase
                .from('bundles')
                .insert({
                    tenant_id: currentTenantId,
                    version: version,
                    notes: `Quick Publish from Layout "${layout.name}"`
                })
                .select('id')
                .single()
            if (bErr) throw bErr

            // 2. Snapshot Media
            const { data: regionMaps } = await supabase.from('layout_region_playlists').select('playlist_id').eq('layout_id', layout.id)
            const playlistIds = (regionMaps || []).map((r: any) => r.playlist_id).filter(Boolean)
            if (playlistIds.length > 0) {
                const { data: items } = await supabase.from('playlist_items').select('media_id').in('playlist_id', playlistIds)
                const mediaIds = [...new Set((items || []).map((i: any) => i.media_id).filter(Boolean))]
                if (mediaIds.length > 0) {
                    await supabase.from('bundle_files').insert(mediaIds.map(mid => ({ bundle_id: bundle.id, media_id: mid })))
                }
            }

            // 3. Deactivate current active for this role
            await supabase.from('layout_publications')
                .update({ is_active: false })
                .eq('tenant_id', currentTenantId)
                .eq('is_active', true)
                .eq('scope', 'GLOBAL')
                .eq('role_id', roleId)

            // 4. Insert Publication
            const { error: pubErr } = await supabase.from('layout_publications').insert({
                tenant_id: currentTenantId,
                layout_id: layout.id,
                bundle_id: bundle.id,
                scope: 'GLOBAL',
                role_id: roleId,
                is_active: true,
                published_at: new Date().toISOString()
            })
            if (pubErr) throw pubErr

            toast.success(`Broadcasting update to all screens...`, { id: loadingToast })
            setShowQuickPublish(null)
        } catch (err: any) {
            toast.error(`Quick Publish failed: ${err.message}`, { id: loadingToast })
        } finally {
            setPublishing(false)
        }
    }

    const paginated = layouts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Layouts</h1>
                    <p className="text-text-2 mt-2 text-lg">Combine templates + playlists to build display layouts</p>
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
                                            <td className="text-text-1 font-bold">{l.name}</td>
                                            <td className="text-text-2">{(l as any).template?.name || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => setShowQuickPublish(l)} className="btn-primary" style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem', gap: '0.4rem', border: 'none', background: 'var(--color-brand-600)', color: 'white' }}>
                                                        <Send size={13} /> Quick Publish
                                                    </button>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {detailPlaylists.map(r => (
                            <div key={r.id} className="form-group" style={{ marginBottom: 0 }}>
                                <label className="label" style={{ fontSize: '0.75rem' }}>Region: <span style={{ color: 'var(--color-brand-400)', fontFamily: 'monospace' }}>{r.region_id}</span></label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <select
                                        className="input-field"
                                        value={r.playlist_id || ''}
                                        onChange={e => saveRegionPlaylist(r.region_id, e.target.value)}
                                        style={{ background: '#0f172a' }}
                                    >
                                        <option value="">— No Playlist —</option>
                                        {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        ))}

                        {/* If no regions currently assigned, but template has them, show empty state or initialize */}
                        {detailPlaylists.length === 0 && (
                            <div className="empty-state" style={{ padding: '1rem' }}>
                                <p style={{ fontSize: '0.8rem', color: '#64748b' }}>No region mappings found. Re-save the layout to initialize regions from template.</p>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem' }}>
                        <button
                            className="btn-secondary"
                            onClick={syncRegions}
                            style={{ border: 'none', background: 'none', color: 'var(--color-text-3)', fontSize: '0.75rem', textDecoration: 'underline', padding: 0 }}
                        >
                            Sync Regions from Template
                        </button>
                        <button className="btn-secondary" onClick={() => setShowDetail(null)}>Close</button>
                    </div>
                </Modal>
            )}

            {/* Quick Publish Modal */}
            {showQuickPublish && (
                <Modal title="Quick Publish Layout" onClose={() => setShowQuickPublish(null)}>
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-4 p-4 bg-brand-500/5 rounded-2xl border border-brand-500/10">
                            <LayoutIcon size={24} className="text-brand-500" />
                            <div>
                                <h4 className="text-sm font-bold text-text-1">{showQuickPublish.name}</h4>
                                <p className="text-xs text-text-3">Auto-bundles media & pushes to all screens in selected role</p>
                            </div>
                        </div>

                        <label className="label mb-2">Select Target Screen Role</label>
                        <div className="grid grid-cols-1 gap-2">
                            {roles.length === 0 ? (
                                <p className="text-xs text-text-3 p-4 border border-dashed rounded-xl">No screen roles defined. Create roles first.</p>
                            ) : roles.map(role => (
                                <button
                                    key={role.id}
                                    onClick={() => handleQuickPublish(role.id)}
                                    disabled={publishing}
                                    className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-950/50 hover:border-brand-500 hover:bg-brand-500/5 transition-all text-left group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500">
                                            <Smartphone size={16} />
                                        </div>
                                        <div>
                                            <span className="block text-sm font-bold text-text-1">{role.name}</span>
                                            <span className="block text-[10px] text-text-3 font-mono">{role.key}</span>
                                        </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Send size={14} className="text-brand-500" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-white/10">
                        <button className="btn-secondary" onClick={() => setShowQuickPublish(null)}>Cancel</button>
                    </div>
                </Modal>
            )}
        </div>
    )
}
