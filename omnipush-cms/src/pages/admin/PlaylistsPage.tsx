import React, { useEffect, useState } from 'react'
import { Plus, Search, Edit2, Trash2, ListVideo, GripVertical, X, Image as ImageIcon, Film, Globe, Loader2, Presentation, Share2, Monitor, CheckCircle2 } from 'lucide-react'
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
                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-3)' }}>s</span>
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
                        <option value="1">1.0x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2.0x</option>
                        <option value="3">3.0x</option>
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
    const [addPlaybackSpeed, setAddPlaybackSpeed] = useState('1')
    const [addIsScheduled, setAddIsScheduled] = useState(false)
    const [addStartDate, setAddStartDate] = useState('')
    const [addEndDate, setAddEndDate] = useState('')
    const [addStartTime, setAddStartTime] = useState('')
    const [addEndTime, setAddEndTime] = useState('')
    const [addDaysOfWeek, setAddDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
    const [addTransition, setAddTransition] = useState<'slide' | 'zoom' | 'fade' | 'none'>('slide')
    const [showPushModal, setShowPushModal] = useState(false)
    const [pushingPlaylist, setPushingPlaylist] = useState<Playlist | null>(null)
    const [devices, setDevices] = useState<any[]>([])
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])
    const [pushing, setPushing] = useState(false)
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

    const openPushModal = async (p: Playlist) => {
        setPushingPlaylist(p)
        setShowPushModal(true)
        const { data } = await supabase.from('devices').select('*, store:stores(name)').eq('tenant_id', currentTenantId).is('deleted_at', null).order('display_name')
        setDevices(data || [])
        // Pre-select devices already using this playlist
        setSelectedDeviceIds((data || []).filter(d => d.playlist_id === p.id).map(d => d.id))
    }

    const handlePush = async () => {
        if (!pushingPlaylist) return
        setPushing(true)
        try {
            // 1. Unset this playlist from any device that was selected but is NO LONGER selected (optional, maybe too destructive)
            // For now, let's just APPLY to selected.
            if (selectedDeviceIds.length > 0) {
                const { error } = await supabase.from('devices')
                    .update({ playlist_id: pushingPlaylist.id, updated_at: new Date().toISOString() })
                    .in('id', selectedDeviceIds)
                if (error) throw error
            }
            toast.success(`Playlist pushed to ${selectedDeviceIds.length} screens`)
            setShowPushModal(false)
        } catch (err: any) {
            toast.error(err.message)
        }
        setPushing(false)
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

        const updates: any = { updated_at: new Date().toISOString() }
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

        // Bulk update sort order in DB via single upsert (stripped of joined .media properties)
        const payload = newItems.map(({ media, ...dbProps }) => ({
            ...dbProps,
            updated_at: new Date().toISOString()
        }))

        const { error } = await supabase.from('playlist_items').upsert(payload, { onConflict: 'id' })
        if (error) {
            console.error('Batch updating sort order failed:', error)
            toast.error('Failed to sync new order')
        }
    }

    const filteredMedia = mediaAssets.filter(m => m.type === addType)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Playlists</h1>
                    <p className="text-text-2 mt-2 text-lg">Build and manage content playlists for your displays</p>
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
                                        <th style={{ width: 40 }}></th>
                                        <th>Name</th>
                                        <th>Description</th>
                                        <th style={{ textAlign: 'right', paddingRight: '2.5rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(p => (
                                        <tr key={p.id} className="hover:bg-brand-500/5 transition-colors">
                                            <td style={{ textAlign: 'center' }}>
                                                <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-500">
                                                    <ListVideo size={16} />
                                                </div>
                                            </td>
                                            <td style={{ color: 'var(--color-text-1)', fontWeight: 700, fontSize: '0.9375rem' }}>{p.name}</td>
                                            <td style={{ color: 'var(--color-text-2)', fontSize: '0.8125rem' }}>{p.description || '—'}</td>
                                            <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    <button onClick={() => openEditor(p)} className="btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', border: 'none', background: 'var(--color-brand-500)', color: 'white' }}>
                                                        <ListVideo size={12} /> Manage Items
                                                    </button>
                                                    <button onClick={() => openPushModal(p)} className="btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--color-brand-400)', border: '1px solid rgba(var(--color-brand-rgb), 0.2)' }}>
                                                        <Share2 size={12} /> Push
                                                    </button>
                                                    <div style={{ width: '1px', height: '1.25rem', background: 'var(--color-surface-800)', margin: '0 0.25rem' }} />
                                                    <button onClick={() => openEdit(p)} className="btn-secondary" style={{ padding: '0.375rem 0.5rem', border: 'none' }} title="Edit Name">
                                                        <Edit2 size={14} className="text-text-3" />
                                                    </button>
                                                    <button onClick={async () => { if (!confirm('Delete playlist?')) return; await supabase.from('playlists').delete().eq('id', p.id); toast.success('Deleted'); loadAll() }} className="btn-danger" style={{ padding: '0.375rem 0.5rem', background: 'transparent', border: 'none' }} title="Delete">
                                                        <Trash2 size={14} className="text-red-500" />
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
            {
                showModal && (
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
                )
            }

            {/* Playlist editor */}
            {
                showEditor && (
                    <Modal title={`Playlist: ${editingPlaylist?.name || ''}`} onClose={() => setShowEditor(false)} maxWidth="1000px">
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1.5rem', height: '75vh' }}>

                            {/* LEFT: Items list (The Playlist Content) */}
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                                <div style={{ marginBottom: '1rem' }}>
                                    {/* Stats Bar */}
                                    {(() => {
                                        const totalItems = playlistItems.length
                                        const totalBytes = playlistItems.reduce((sum, i) => sum + (i.media?.bytes || 0), 0)
                                        const totalSecs = playlistItems.reduce((sum, i) => {
                                            if (i.type === 'video') return sum
                                            return sum + (i.duration_seconds || 15)
                                        }, 0)
                                        const fmtBytes = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : b > 0 ? `${b} B` : '—'
                                        const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`
                                        return totalItems > 0 ? (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                padding: '0.5rem 0.875rem',
                                                background: 'var(--color-surface-900)', borderRadius: 8,
                                                border: '1px solid var(--color-surface-800)',
                                                fontSize: '0.8rem',
                                            }}>
                                                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{totalItems}</span>
                                                <span style={{ color: 'var(--color-text-2)' }}>items</span>
                                                <span style={{ color: 'var(--color-text-3)' }}>·</span>
                                                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtBytes(totalBytes)}</span>
                                                <span style={{ color: 'var(--color-text-3)' }}>·</span>
                                                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fmtDur(totalSecs)}</span>
                                                <span style={{ color: 'var(--color-text-3)', fontSize: '0.7rem', marginLeft: 'auto' }}>drag to reorder</span>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px dashed var(--color-surface-800)', color: 'var(--color-text-3)' }}>
                                                Playlist is empty. Add items from the library on the right.
                                            </div>
                                        )
                                    })()}
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                        <SortableContext items={playlistItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                            {playlistItems.map(item => (
                                                <SortableItem key={item.id} item={item} onRemove={removeItem} onUpdateSettings={updateItemSettings} />
                                            ))}
                                        </SortableContext>
                                    </DndContext>
                                </div>
                            </div>

                            {/* RIGHT: Library / Add Items Panel */}
                            <div style={{ borderLeft: '1px solid var(--color-surface-800)', paddingLeft: '1.5rem', overflowY: 'auto' }}>
                                <h3 style={{ margin: '0 0 1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-1)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Add Items</h3>

                                <div className="form-group">
                                    <label className="label">Content Type</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                                        {[
                                            { id: 'video', label: 'Video', icon: <Film size={12} /> },
                                            { id: 'image', label: 'Image', icon: <ImageIcon size={12} /> },
                                            { id: 'web_url', label: 'Web URL', icon: <Globe size={12} /> },
                                            { id: 'ppt', label: 'PPT', icon: <Presentation size={12} /> },
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => { setAddType(t.id as any); setAddMediaId('') }}
                                                style={{
                                                    padding: '0.5rem', fontSize: '0.75rem', borderRadius: 6, border: '1px solid var(--color-surface-800)',
                                                    background: addType === t.id ? 'rgba(var(--color-brand-rgb), 0.15)' : 'transparent',
                                                    color: addType === t.id ? 'var(--color-brand-400)' : 'var(--color-surface-400)',
                                                    display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center'
                                                }}
                                            >
                                                {t.icon} {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="label">Library Assets ({filteredMedia.length})</label>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-surface-800)', borderRadius: 8, background: 'var(--color-surface-900)' }}>
                                        {filteredMedia.length === 0 ? (
                                            <div style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--color-text-3)', textAlign: 'center' }}>No {addType}s found</div>
                                        ) : (
                                            filteredMedia.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => { setAddMediaId(m.id); setAddUrl('') }}
                                                    style={{
                                                        width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', borderBottom: '1px solid var(--color-surface-800)',
                                                        background: addMediaId === m.id ? 'rgba(var(--color-brand-rgb), 0.1)' : 'transparent',
                                                        color: addMediaId === m.id ? 'var(--color-brand-400)' : 'var(--color-text-secondary)',
                                                        fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                                                    }}
                                                >
                                                    {addMediaId === m.id ? <CheckCircle2 size={12} /> : <Plus size={12} />}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {addType === 'web_url' && (
                                    <div className="form-group">
                                        <label className="label">Manual URL</label>
                                        <input className="input-field" type="url" value={addUrl} onChange={e => { setAddUrl(e.target.value); setAddMediaId('') }} placeholder="https://..." style={{ fontSize: '0.8125rem' }} />
                                    </div>
                                )}

                                <div style={{ padding: '1rem', background: 'var(--color-surface-900)', borderRadius: 10, border: '1px solid var(--color-surface-800)', marginTop: '1rem' }}>
                                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label className="label" style={{ marginBottom: 0 }}>Auto-Schedule</label>
                                            <input type="checkbox" checked={addIsScheduled} onChange={e => setAddIsScheduled(e.target.checked)} />
                                        </div>
                                    </div>

                                    {addType !== 'video' && (
                                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                            <label className="label">Duration (seconds)</label>
                                            <input className="input-field" type="number" value={addDuration} onChange={e => setAddDuration(e.target.value)} style={{ padding: '0.375rem' }} />
                                        </div>
                                    )}

                                    <button className="btn-primary" onClick={addItem} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
                                        Add to Playlist
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Modal>
                )
            }

            {/* Push to Screens Modal */}
            {
                showPushModal && (
                    <Modal title={`Push to Screens: ${pushingPlaylist?.name || ''}`} onClose={() => setShowPushModal(false)} maxWidth="500px">
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-2)', marginBottom: '1.25rem' }}>
                            Select the screens you want to assign this playlist to. This will override their current content.
                        </p>

                        <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem', border: '1px solid var(--color-surface-800)', borderRadius: 12, background: 'var(--color-surface-950)' }}>
                            {devices.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-3)' }}>No active devices found</div>
                            ) : (
                                devices.map(d => (
                                    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-surface-900)', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedDeviceIds.includes(d.id)}
                                            onChange={e => {
                                                if (e.target.checked) setSelectedDeviceIds(prev => [...prev, d.id])
                                                else setSelectedDeviceIds(prev => prev.filter(id => id !== d.id))
                                            }}
                                            style={{ width: 18, height: 18, borderRadius: 4 }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>{d.display_name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-2)', display: 'flex', gap: '0.5rem' }}>
                                                <span style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{d.device_code}</span>
                                                <span>·</span>
                                                <span>{d.store?.name || 'Unassigned'}</span>
                                            </div>
                                        </div>
                                        {d.playlist_id === pushingPlaylist?.id && (
                                            <span style={{ fontSize: '0.65rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '0.15rem 0.4rem', borderRadius: 4, fontWeight: 700 }}>ACTIVE</span>
                                        )}
                                    </label>
                                ))
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button className="btn-secondary" onClick={() => setShowPushModal(false)}>Cancel</button>
                            <button className="btn-primary" onClick={handlePush} disabled={pushing || selectedDeviceIds.length === 0}>
                                {pushing ? <Loader2 size={14} className="animate-spin" /> : <Monitor size={14} />}
                                Update {selectedDeviceIds.length} Screens
                            </button>
                        </div>
                    </Modal>
                )
            }
        </div>
    )
}
