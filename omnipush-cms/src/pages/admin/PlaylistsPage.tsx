import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, ListVideo, GripVertical, X, Image as ImageIcon, Film, Globe, Loader2 } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Playlist, PlaylistItem, MediaAsset } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PAGE_SIZE = 10

function SortableItem({ item, onRemove }: { item: PlaylistItem & { media?: MediaAsset }, onRemove: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
    const style = { transform: CSS.Transform.toString(transform), transition }
    return (
        <div ref={setNodeRef} style={{ ...style, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.75rem', background: '#0f172a', borderRadius: 8, marginBottom: '0.5rem', border: '1px solid #1e293b' }}>
            <span {...attributes} {...listeners} className="drag-handle"><GripVertical size={14} /></span>
            {item.type === 'image' ? <ImageIcon size={14} color="#60a5fa" /> : item.type === 'video' ? <Film size={14} color="#a78bfa" /> : <Globe size={14} color="#34d399" />}
            <span style={{ flex: 1, fontSize: '0.875rem', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.media?.name || item.web_url || 'Unknown'}
            </span>
            {item.duration_seconds && <span style={{ fontSize: '0.75rem', color: '#64748b', flexShrink: 0 }}>{item.duration_seconds}s</span>}
            <button onClick={() => onRemove(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex' }}>
                <X size={14} />
            </button>
        </div>
    )
}

export default function PlaylistsPage() {
    const [playlists, setPlaylists] = useState<Playlist[]>([])
    const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [showEditor, setShowEditor] = useState(false)
    const [editing, setEditing] = useState<Playlist | null>(null)
    const [form, setForm] = useState({ name: '', description: '' })
    const [saving, setSaving] = useState(false)
    const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null)
    const [playlistItems, setPlaylistItems] = useState<(PlaylistItem & { media?: MediaAsset })[]>([])
    const [addType, setAddType] = useState<'image' | 'video' | 'web_url'>('video')
    const [addMediaId, setAddMediaId] = useState('')
    const [addUrl, setAddUrl] = useState('')
    const [addDuration, setAddDuration] = useState('10')

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

    const loadAll = async () => {
        setLoading(true)
        const [plRes, mediaRes] = await Promise.all([
            supabase.from('playlists').select('*').order('name'),
            supabase.from('media_assets').select('*').order('name'),
        ])
        setPlaylists(plRes.data || [])
        setMediaAssets(mediaRes.data || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const filtered = playlists.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const openCreate = () => { setEditing(null); setForm({ name: '', description: '' }); setShowModal(true) }
    const openEdit = (p: Playlist) => { setEditing(p); setForm({ name: p.name, description: p.description || '' }); setShowModal(true) }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) { toast.error('Name is required'); return }
        setSaving(true)
        try {
            if (editing) {
                const { error } = await supabase.from('playlists').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id)
                if (error) throw error
                toast.success('Playlist updated')
            } else {
                const { error } = await supabase.from('playlists').insert({ ...form, tenant_id: DEFAULT_TENANT_ID })
                if (error) throw error
                toast.success('Playlist created')
            }
            setShowModal(false)
            loadAll()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
        }
        setSaving(false)
    }

    const openEditor = async (p: Playlist) => {
        setEditingPlaylist(p)
        // Load items and media separately to avoid join ambiguity in PostgREST
        const { data: items, error: itemsErr } = await supabase
            .from('playlist_items')
            .select('*')
            .eq('playlist_id', p.id)
            .order('sort_order')

        if (itemsErr) {
            toast.error(itemsErr.message)
            return
        }

        const mediaIds = (items || []).map(i => i.media_id).filter(Boolean)
        let mediaMap: Record<string, any> = {}
        if (mediaIds.length > 0) {
            const { data: media } = await supabase.from('media_assets').select('*').in('id', mediaIds)
            mediaMap = Object.fromEntries((media || []).map(m => [m.id, m]))
        }

        const resolved = (items || []).map(i => ({
            ...i,
            media: i.media_id ? mediaMap[i.media_id] : null
        }))

        setPlaylistItems(resolved as any)
        setShowEditor(true)
    }

    const addItem = async () => {
        if (!editingPlaylist) return
        if (addType !== 'web_url' && !addMediaId) { toast.error('Select a media asset'); return }
        if (addType === 'web_url' && !addUrl) { toast.error('Enter a URL'); return }
        const maxOrder = playlistItems.length > 0 ? Math.max(...playlistItems.map(i => i.sort_order)) + 1 : 0
        const payload: any = {
            playlist_id: editingPlaylist.id,
            type: addType,
            sort_order: maxOrder,
        }
        if (addType !== 'web_url') {
            payload.media_id = addMediaId
            if (addType === 'image') payload.duration_seconds = parseInt(addDuration) || 10
        } else {
            payload.web_url = addUrl
        }

        // Insert and then resolve the media manually to avoid ambiguity
        const { data: newItem, error } = await supabase.from('playlist_items')
            .insert(payload)
            .select('id, playlist_id, type, sort_order, media_id, web_url, duration_seconds')
            .single()
        if (error) { toast.error(error.message); return }

        let resolvedItem = { ...newItem, media: null }
        if (newItem.media_id) {
            const { data: media } = await supabase.from('media_assets').select('*').eq('id', newItem.media_id).single()
            resolvedItem.media = media
        }

        setPlaylistItems(items => [...items, resolvedItem as any])
        setAddMediaId('')
        setAddUrl('')
        toast.success('Item added')
    }

    const removeItem = async (itemId: string) => {
        await supabase.from('playlist_items').delete().eq('id', itemId)
        setPlaylistItems(items => items.filter(i => i.id !== itemId))
        toast.success('Removed')
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return
        const oldIndex = playlistItems.findIndex(i => i.id === active.id)
        const newIndex = playlistItems.findIndex(i => i.id === over.id)
        const newItems = arrayMove(playlistItems, oldIndex, newIndex).map((item, idx) => ({ ...item, sort_order: idx }))
        setPlaylistItems(newItems)
        await Promise.all(newItems.map(item => supabase.from('playlist_items').update({ sort_order: item.sort_order }).eq('id', item.id)))
    }

    const filteredMedia = mediaAssets.filter(m => addType === 'web_url' ? false : m.type === addType)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Playlists</h1>
                    <p className="page-subtitle">Build and manage content playlists for your displays</p>
                </div>
                <button id="create-playlist-btn" className="btn-primary" onClick={openCreate}>
                    <Plus size={16} /> New Playlist
                </button>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ position: 'relative', maxWidth: 360 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input type="text" className="input-field" placeholder="Search playlists..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <ListVideo size={40} />
                        <h3>No playlists</h3>
                        <p>Create your first playlist and add media items to it.</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Description</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(p => (
                                        <tr key={p.id}>
                                            <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{p.name}</td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{p.description || '—'}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => openEditor(p)} className="btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}>
                                                        Edit Items
                                                    </button>
                                                    <button onClick={() => openEdit(p)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }}>
                                                        <Edit2 size={13} />
                                                    </button>
                                                    <button onClick={async () => { if (!confirm('Delete playlist?')) return; await supabase.from('playlists').delete().eq('id', p.id); toast.success('Deleted'); loadAll() }} className="btn-danger" style={{ padding: '0.375rem 0.625rem' }}>
                                                        <Trash2 size={13} />
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

            {/* Create/Edit Modal */}
            {showModal && (
                <Modal title={editing ? 'Edit Playlist' : 'New Playlist'} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label className="label">Playlist Name *</label>
                            <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Main Menu Loop" />
                        </div>
                        <div className="form-group">
                            <label className="label">Description</label>
                            <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description..." />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Playlist editor */}
            {showEditor && editingPlaylist && (
                <Modal title={`Edit: ${editingPlaylist.name}`} onClose={() => setShowEditor(false)} maxWidth="700px">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        {/* Add items */}
                        <div>
                            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Item</h3>
                            <div className="form-group">
                                <label className="label">Type</label>
                                <select className="input-field" value={addType} onChange={e => { setAddType(e.target.value as any); setAddMediaId('') }}>
                                    <option value="image">Image</option>
                                    <option value="video">Video</option>
                                    <option value="web_url">Web URL</option>
                                </select>
                            </div>
                            {addType !== 'web_url' ? (
                                <div className="form-group">
                                    <label className="label">
                                        Select Media
                                        {filteredMedia.length > 0 && (
                                            <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>
                                                ({filteredMedia.length} available)
                                            </span>
                                        )}
                                    </label>
                                    {filteredMedia.length === 0 ? (
                                        <div style={{
                                            padding: '0.75rem 1rem',
                                            background: 'rgba(245,158,11,0.06)',
                                            border: '1px solid rgba(245,158,11,0.2)',
                                            borderRadius: 8,
                                            fontSize: '0.8125rem',
                                            color: '#92400e',
                                            lineHeight: 1.5,
                                        }}>
                                            <span style={{ color: '#fbbf24' }}>⚠ No {addType} files found.</span><br />
                                            <span style={{ color: '#94a3b8' }}>
                                                Go to{' '}
                                                <a href="/admin/media" target="_blank" rel="noreferrer"
                                                    style={{ color: '#7a8aff', textDecoration: 'underline' }}>
                                                    Media Library
                                                </a>{' '}
                                                and upload a {addType} file first.
                                            </span>
                                        </div>
                                    ) : (
                                        <select className="input-field" value={addMediaId} onChange={e => setAddMediaId(e.target.value)}>
                                            <option value="">— Select {addType} —</option>
                                            {filteredMedia.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="label">URL</label>
                                    <input className="input-field" type="url" value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://..." />
                                </div>
                            )}
                            {addType === 'image' && (
                                <div className="form-group">
                                    <label className="label">Duration (seconds)</label>
                                    <input className="input-field" type="number" min="1" value={addDuration} onChange={e => setAddDuration(e.target.value)} />
                                </div>
                            )}
                            <button className="btn-primary" onClick={addItem} style={{ width: '100%', justifyContent: 'center' }}>
                                <Plus size={14} /> Add to Playlist
                            </button>
                        </div>

                        {/* Items list */}
                        <div>
                            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Items ({playlistItems.length}) — drag to reorder
                            </h3>
                            {playlistItems.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#475569', fontSize: '0.875rem' }}>No items yet</div>
                            ) : (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                    <SortableContext items={playlistItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                        {playlistItems.map(item => (
                                            <SortableItem key={item.id} item={item} onRemove={removeItem} />
                                        ))}
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    )
}
