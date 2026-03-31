import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, ListVideo, GripVertical, X, Image as ImageIcon, Film, Globe, Loader2, Presentation } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Playlist, PlaylistItem, MediaAsset } from '../../types'
import { useTenant } from '../../contexts/TenantContext'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PAGE_SIZE = 10

function SortableItem({ item, onRemove, onUpdateSettings }: {
    item: PlaylistItem & { media?: MediaAsset },
    onRemove: (id: string) => void,
    onUpdateSettings: (id: string, settings: any) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
    const style = { transform: CSS.Transform.toString(transform), transition }

    const daysMap = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    const daysStr = item.days_of_week && item.days_of_week.length > 0 && item.days_of_week.length < 7
        ? item.days_of_week.map(d => daysMap[d]).join(', ')
        : (item.days_of_week?.length === 7 ? 'Everyday' : '')

    return (
        <div ref={setNodeRef} style={{ ...style, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.75rem', background: 'var(--color-surface-900)', borderRadius: 8, marginBottom: '0.5rem', border: '1px solid var(--color-surface-800)' }} className="sortable-item">
            <span {...attributes} {...listeners} className="drag-handle"><GripVertical size={14} /></span>
            {item.type === 'image' ? <ImageIcon size={14} color="#60a5fa" /> : item.type === 'video' ? <Film size={14} color="#a78bfa" /> : item.type === 'ppt' ? <Presentation size={14} color="#f59e0b" /> : <Globe size={14} color="#34d399" />}

            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.media?.name || item.web_url || 'Unknown'}
                </div>
                {item.is_scheduled && (
                    <div style={{ fontSize: '0.65rem', color: '#fbbf24', marginTop: '2px' }}>
                        ⏰ {item.start_time || item.end_time ? `${item.start_time || '00:00'}-${item.end_time || '23:59'}` : 'Scheduled'}
                        {daysStr && ` | ${daysStr}`}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                {/* Duration Editor for non-videos */}
                {item.type !== 'video' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <input
                            type="number"
                            value={item.duration_seconds || 15}
                            onChange={(e) => onUpdateSettings(item.id, { duration_seconds: parseInt(e.target.value) || 1 })}
                            style={{
                                width: '35px',
                                fontSize: '0.7rem',
                                padding: '0.125rem 0.25rem',
                                background: 'var(--color-surface-800)',
                                color: 'var(--color-text-primary)',
                                border: '1px solid var(--color-surface-700)',
                                borderRadius: 4,
                                textAlign: 'center'
                            }}
                        />
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-surface-500)' }}>s</span>
                    </div>
                )}

                {/* Speed Editor for Videos */}
                {item.type === 'video' && (
                    <select
                        value={item.playback_speed || 1.0}
                        onChange={(e) => onUpdateSettings(item.id, { playback_speed: parseFloat(e.target.value) })}
                        style={{
                            fontSize: '0.7rem',
                            padding: '0.125rem 0.25rem',
                            background: 'rgba(167, 139, 250, 0.1)',
                            color: '#c4b5fd',
                            border: '1px solid rgba(167, 139, 250, 0.2)',
                            borderRadius: 4,
                        }}
                    >
                        <option value="0.5">0.5x</option>
                        <option value="0.75">0.75x</option>
                        <option value="1.0">1.0x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2.0">2.0x</option>
                        <option value="3.0">3.0x</option>
                    </select>
                )}

                {/* Transition Selector */}
                <select
                    value={item.settings?.transition || 'slide'}
                    onChange={(e) => onUpdateSettings(item.id, { transition: e.target.value })}
                    style={{
                        fontSize: '0.7rem',
                        padding: '0.125rem 0.25rem',
                        background: 'var(--color-surface-800)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-surface-700)',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    <option value="slide">Slide</option>
                    <option value="zoom">Zoom</option>
                    <option value="fade">Fade</option>
                    <option value="none">None</option>
                </select>

                <button onClick={() => onRemove(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex' }}>
                    <X size={14} />
                </button>
            </div>
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
    const [addType, setAddType] = useState<'image' | 'video' | 'web_url' | 'ppt'>('video')
    const [addMediaId, setAddMediaId] = useState('')
    const [addUrl, setAddUrl] = useState('')
    const [addDuration, setAddDuration] = useState('10')
    const [addPlaybackSpeed, setAddPlaybackSpeed] = useState('1.0')
    const [addIsScheduled, setAddIsScheduled] = useState(false)
    const [addStartDate, setAddStartDate] = useState('')
    const [addEndDate, setAddEndDate] = useState('')
    const [addStartTime, setAddStartTime] = useState('')
    const [addEndTime, setAddEndTime] = useState('')
    const [addDaysOfWeek, setAddDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
    const [addTransition, setAddTransition] = useState<'slide' | 'zoom' | 'fade' | 'none'>('slide')
    const { currentTenantId } = useTenant()

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

    const loadAll = async () => {
        if (!currentTenantId) return
        setLoading(true)
        const [plRes, mediaRes] = await Promise.all([
            supabase.from('playlists').select('*').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('media_assets').select('*').eq('tenant_id', currentTenantId).order('name'),
        ])
        setPlaylists(plRes.data || [])
        setMediaAssets(mediaRes.data || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [currentTenantId])

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
                const { error } = await supabase.from('playlists').insert({ ...form, tenant_id: currentTenantId })
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

        // Validation: must have either a library asset OR a manual URL
        const hasLibraryAsset = !!addMediaId
        const hasManualUrl = !!addUrl.trim()

        if (!hasLibraryAsset && !hasManualUrl) {
            toast.error(addType === 'web_url' ? 'Enter a URL or select from library' : 'Select a media asset')
            return
        }

        const maxOrder = playlistItems.length > 0 ? Math.max(...playlistItems.map(i => i.sort_order)) + 1 : 0
        const payload: any = {
            playlist_id: editingPlaylist.id,
            type: addType,
            sort_order: maxOrder,
            settings: { transition: addTransition }
        }

        if (hasLibraryAsset) {
            payload.media_id = addMediaId
            if (addType === 'image' || addType === 'web_url' || addType === 'ppt') payload.duration_seconds = parseInt(addDuration) || 15
            if (addType === 'video') payload.playback_speed = parseFloat(addPlaybackSpeed) || 1.0
        } else {
            payload.web_url = addUrl
            payload.duration_seconds = parseInt(addDuration) || 15
        }

        if (addIsScheduled) {
            payload.is_scheduled = true
            if (addStartDate) payload.start_date = addStartDate
            if (addEndDate) payload.end_date = addEndDate
            if (addStartTime) payload.start_time = addStartTime
            if (addEndTime) payload.end_time = addEndTime
            payload.days_of_week = addDaysOfWeek
        }

        const { data: newItem, error } = await supabase.from('playlist_items')
            .insert(payload)
            .select('*')
            .single()

        if (error) {
            toast.error(error.message)
            return
        }

        // Resolve media for local state
        let resolvedItem = { ...newItem, media: null }
        if (newItem.media_id) {
            const { data: media } = await supabase.from('media_assets').select('*').eq('id', newItem.media_id).single()
            resolvedItem.media = media
        }

        setPlaylistItems(prev => [...prev, resolvedItem as any])
        setAddMediaId('')
        setAddUrl('')
        toast.success('Item added')
    }

    const updateItemSettings = async (itemId: string, data: any) => {
        // Optimistic update
        setPlaylistItems(prev => prev.map(i => {
            if (i.id !== itemId) return i
            const updated = { ...i }
            if (data.transition) updated.settings = { ...updated.settings, transition: data.transition }
            if (data.duration_seconds !== undefined) updated.duration_seconds = data.duration_seconds
            if (data.playback_speed !== undefined) updated.playback_speed = data.playback_speed
            return updated
        }))

        const updates: any = {}
        if (data.duration_seconds !== undefined) updates.duration_seconds = data.duration_seconds
        if (data.playback_speed !== undefined) updates.playback_speed = data.playback_speed
        if (data.transition) {
            const item = playlistItems.find(i => i.id === itemId)
            updates.settings = { ...(item?.settings || {}), transition: data.transition }
        }

        const { error } = await supabase.from('playlist_items').update(updates).eq('id', itemId)
        if (error) toast.error('Failed to update item')
        else toast.success('Updated', { duration: 1000 })
    }

    const removeItem = async (itemId: string) => {
        const { error } = await supabase.from('playlist_items').delete().eq('id', itemId)
        if (error) {
            toast.error('Failed to remove item')
        } else {
            setPlaylistItems(prev => prev.filter(i => i.id !== itemId))
            toast.success('Removed')
        }
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        const oldIndex = playlistItems.findIndex(i => i.id === active.id)
        const newIndex = playlistItems.findIndex(i => i.id === over.id)

        const newItems = arrayMove(playlistItems, oldIndex, newIndex).map((item, idx) => ({ ...item, sort_order: idx }))
        setPlaylistItems(newItems)

        // Bulk update sort order in DB
        await Promise.all(newItems.map(item =>
            supabase.from('playlist_items').update({ sort_order: item.sort_order }).eq('id', item.id)
        ))
    }

    const filteredMedia = mediaAssets.filter(m => m.type === addType)

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
                                            <td style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{p.name}</td>
                                            <td style={{ color: 'var(--color-surface-400)', fontSize: '0.8125rem' }}>{p.description || '—'}</td>
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
                            <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-surface-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Item</h3>
                            <div className="form-group">
                                <label className="label">Type</label>
                                <select className="input-field" value={addType} onChange={e => { setAddType(e.target.value as any); setAddMediaId('') }}>
                                    <option value="image">Image</option>
                                    <option value="video">Video</option>
                                    <option value="ppt">PowerPoint</option>
                                    <option value="web_url">Web URL / Menu Builder</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">
                                    Select from Library
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
                                        <span style={{ color: '#fbbf24' }}>⚠ No {addType} assets found.</span><br />
                                        <span style={{ color: '#94a3b8' }}>
                                            {addType === 'web_url'
                                                ? 'Use manual link or add to Media Library first.'
                                                : `Go to Media Library and upload a ${addType} file first.`}
                                        </span>
                                    </div>
                                ) : (
                                    <select className="input-field" value={addMediaId} onChange={e => { setAddMediaId(e.target.value); setAddUrl('') }}>
                                        <option value="">— Select {addType} —</option>
                                        {filteredMedia.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                )}
                            </div>

                            {addType === 'web_url' && (
                                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        <div style={{ height: '1px', flex: 1, background: '#1e293b' }}></div>
                                        <span style={{ fontSize: '0.7rem', color: '#475569', textTransform: 'uppercase' }}>OR</span>
                                        <div style={{ height: '1px', flex: 1, background: '#1e293b' }}></div>
                                    </div>
                                    <label className="label">Manual URL Entry</label>
                                    <input
                                        className="input-field"
                                        type="url"
                                        value={addUrl}
                                        onChange={e => {
                                            let val = e.target.value
                                            // Auto-convert YouTube watch URLs to embed
                                            const ytMatch = val.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)
                                            if (ytMatch) val = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytMatch[1]}`
                                            setAddUrl(val)
                                            setAddMediaId('')
                                        }}
                                        placeholder="https://... (YouTube, webpage, or dashboard)"
                                    />
                                    {/* YouTube auto-convert success notice */}
                                    {addUrl.includes('youtube.com/embed/') && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.875rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                            <span style={{ flexShrink: 0, fontSize: '0.875rem' }}>✅</span>
                                            <span><strong>YouTube embed detected</strong> — URL auto-converted to embed format. Video will play muted &amp; looped on screen.</span>
                                        </div>
                                    )}
                                    {/* Warn if user pasted a plain youtube.com/watch URL that wasn't caught */}
                                    {addUrl.includes('youtube.com/watch') && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.625rem 0.875rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: '0.75rem', color: '#dc2626', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                            <span style={{ flexShrink: 0 }}>⚠️</span>
                                            <span><strong>YouTube watch URL detected</strong> — This will be blocked by your browser. Please use the embed URL format: <code>https://www.youtube.com/embed/VIDEO_ID</code></span>
                                        </div>
                                    )}
                                    <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: '#64748b' }}>
                                        💡 Paste any YouTube link — it will be auto-converted to an embed URL.
                                    </div>
                                </div>
                            )}

                            {(addType === 'image' || addType === 'web_url' || addType === 'ppt') && (
                                <div className="form-group">
                                    <label className="label">Duration (seconds)</label>
                                    <input className="input-field" type="number" min="1" value={addDuration} onChange={e => setAddDuration(e.target.value)} />
                                </div>
                            )}

                            {addType === 'video' && (
                                <div className="form-group">
                                    <label className="label">Playback Speed</label>
                                    <select className="input-field" value={addPlaybackSpeed} onChange={e => setAddPlaybackSpeed(e.target.value)}>
                                        <option value="0.5">0.5x (Slow)</option>
                                        <option value="0.75">0.75x</option>
                                        <option value="1.0">1.0x (Normal)</option>
                                        <option value="1.25">1.25x</option>
                                        <option value="1.5">1.5x (Fast)</option>
                                        <option value="2.0">2.0x (Very Fast)</option>
                                        <option value="3.0">3.0x (Super Fast)</option>
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label className="label">Transition Effect</label>
                                <select className="input-field" value={addTransition} onChange={e => setAddTransition(e.target.value as any)}>
                                    <option value="slide">Slide (Horizontal)</option>
                                    <option value="zoom">Zoom</option>
                                    <option value="fade">Fade</option>
                                    <option value="none">None</option>
                                </select>
                            </div>

                            {/* Scheduling Section */}
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Advance Scheduling</h4>
                                    <label className="switch">
                                        <input type="checkbox" checked={addIsScheduled} onChange={e => setAddIsScheduled(e.target.checked)} />
                                        <span className="slider round"></span>
                                    </label>
                                </div>

                                {addIsScheduled && (
                                    <div className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <div className="form-group">
                                                <label className="label">Start Date</label>
                                                <input className="input-field" type="date" value={addStartDate} onChange={e => setAddStartDate(e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">End Date</label>
                                                <input className="input-field" type="date" value={addEndDate} onChange={e => setAddEndDate(e.target.value)} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                            <div className="form-group">
                                                <label className="label">Start Time</label>
                                                <input className="input-field" type="time" value={addStartTime} onChange={e => setAddStartTime(e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label className="label">End Time</label>
                                                <input className="input-field" type="time" value={addEndTime} onChange={e => setAddEndTime(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="label">Days of Week</label>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setAddDaysOfWeek(prev =>
                                                                prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                                                            )
                                                        }}
                                                        style={{
                                                            width: 28, height: 28, borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                                                            background: addDaysOfWeek.includes(i) ? 'var(--color-brand-600)' : 'var(--color-surface-800)',
                                                            color: addDaysOfWeek.includes(i) ? 'white' : 'var(--color-text-secondary)',
                                                            border: 'none', cursor: 'pointer', transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {d}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button className="btn-primary" onClick={addItem} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
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
                                            <SortableItem key={item.id} item={item} onRemove={removeItem} onUpdateSettings={updateItemSettings} />
                                        ))}
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </div>
                </Modal>
            )
            }
        </div >
    )
}
