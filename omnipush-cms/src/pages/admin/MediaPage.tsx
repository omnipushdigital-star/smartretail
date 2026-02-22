import React, { useEffect, useRef, useState } from 'react'
import { Plus, Search, Upload, Trash2, Image as ImageIcon, Film, Globe, Filter, Loader2, X, Download } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { MediaAsset } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 12
const BUCKET = 'signage_media'

function formatBytes(bytes?: number) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function TypeIcon({ type }: { type: string }) {
    if (type === 'video') return <Film size={14} color="#a78bfa" />
    if (type === 'web_url') return <Globe size={14} color="#34d399" />
    return <ImageIcon size={14} color="#60a5fa" />
}

export default function MediaPage() {
    const [assets, setAssets] = useState<MediaAsset[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterType, setFilterType] = useState('')
    const [page, setPage] = useState(1)
    const [uploading, setUploading] = useState(false)
    const [showUrlModal, setShowUrlModal] = useState(false)
    const [urlForm, setUrlForm] = useState({ name: '', url: '', tags: '' })
    const [deleting, setDeleting] = useState<string | null>(null)
    const [preview, setPreview] = useState<MediaAsset | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)

    const loadAssets = async () => {
        setLoading(true)
        const { data } = await supabase.from('media_assets').select('*').order('created_at', { ascending: false })
        setAssets(data || [])
        setLoading(false)
    }

    useEffect(() => { loadAssets() }, [])

    const filtered = assets.filter(a => {
        const matchSearch = a.name.toLowerCase().includes(search.toLowerCase())
        const matchType = !filterType || a.type === filterType
        return matchSearch && matchType
    })

    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        setUploading(true)
        for (const file of Array.from(files)) {
            const ext = file.name.split('.').pop()
            const path = `${DEFAULT_TENANT_ID}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
            const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
            if (upErr) { toast.error(`Upload failed: ${upErr.message}`); continue }
            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
            const type = file.type.startsWith('video') ? 'video' : 'image'
            const { error: dbErr } = await supabase.from('media_assets').insert({
                tenant_id: DEFAULT_TENANT_ID,
                name: file.name.replace(/\.[^/.]+$/, ''),
                type,
                storage_path: path,
                url: urlData.publicUrl,
                bytes: file.size,
                tags: [],
            })
            if (dbErr) toast.error(`DB save failed: ${dbErr.message}`)
            else toast.success(`Uploaded: ${file.name}`)
        }
        setUploading(false)
        loadAssets()
        if (fileInput.current) fileInput.current.value = ''
    }

    const handleAddUrl = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!urlForm.name || !urlForm.url) { toast.error('Name and URL required'); return }
        const { error } = await supabase.from('media_assets').insert({
            tenant_id: DEFAULT_TENANT_ID,
            name: urlForm.name,
            type: 'web_url',
            url: urlForm.url,
            tags: urlForm.tags ? urlForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        })
        if (error) toast.error(error.message)
        else { toast.success('URL added'); setShowUrlModal(false); setUrlForm({ name: '', url: '', tags: '' }); loadAssets() }
    }

    const handleDelete = async (asset: MediaAsset) => {
        if (!confirm('Delete this media asset? It may be used in playlists.')) return
        setDeleting(asset.id)
        if (asset.storage_path) {
            await supabase.storage.from(BUCKET).remove([asset.storage_path])
        }
        const { error } = await supabase.from('media_assets').delete().eq('id', asset.id)
        if (error) toast.error(error.message)
        else { toast.success('Deleted'); loadAssets() }
        setDeleting(null)
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Media Library</h1>
                    <p className="page-subtitle">Upload and manage images, videos, and web URLs for your displays</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={() => setShowUrlModal(true)}>
                        <Globe size={14} /> Add URL
                    </button>
                    <button className="btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 size={14} /> : <Upload size={14} />}
                        {uploading ? 'Uploading…' : 'Upload Files'}
                    </button>
                    <input ref={fileInput} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input type="text" className="input-field" placeholder="Search media..." value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                    </div>
                    <select className="input-field" style={{ width: 'auto' }} value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}>
                        <option value="">All types</option>
                        <option value="image">Images</option>
                        <option value="video">Videos</option>
                        <option value="web_url">Web URLs</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}><Loader2 size={32} style={{ margin: '0 auto' }} /></div>
            ) : paginated.length === 0 ? (
                <div className="empty-state" style={{ marginTop: '2rem' }}>
                    <ImageIcon size={48} />
                    <h3>No media found</h3>
                    <p>{search ? 'Try different search terms.' : 'Upload your first image or video to get started.'}</p>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        {paginated.map(a => (
                            <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPreview(a)}>
                                {/* Thumbnail */}
                                <div style={{ height: 130, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                    {a.type === 'image' && a.url ? (
                                        <img src={a.url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : a.type === 'video' && a.url ? (
                                        <video src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Globe size={36} color="#34d399" />
                                    )}
                                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '0.375rem' }}>
                                        <span className={`badge ${a.type === 'video' ? 'badge-blue' : a.type === 'web_url' ? 'badge-green' : ''}`} style={{ background: 'rgba(0,0,0,0.7)' }}>
                                            <TypeIcon type={a.type} />
                                            {a.type}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ padding: '0.75rem' }}>
                                    <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{formatBytes(a.bytes)}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 0 }}
                                            disabled={deleting === a.id}
                                        >
                                            {deleting === a.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="card" style={{ padding: 0 }}>
                        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </div>
                </>
            )}

            {/* URL modal */}
            {showUrlModal && (
                <Modal title="Add Web URL" onClose={() => setShowUrlModal(false)}>
                    <form onSubmit={handleAddUrl}>
                        <div className="form-group">
                            <label className="label">Name *</label>
                            <input className="input-field" value={urlForm.name} onChange={e => setUrlForm(f => ({ ...f, name: e.target.value }))} placeholder="My Web Content" />
                        </div>
                        <div className="form-group">
                            <label className="label">URL *</label>
                            <input className="input-field" type="url" value={urlForm.url} onChange={e => setUrlForm(f => ({ ...f, url: e.target.value }))} placeholder="https://example.com" />
                        </div>
                        <div className="form-group">
                            <label className="label">Tags (comma-separated)</label>
                            <input className="input-field" value={urlForm.tags} onChange={e => setUrlForm(f => ({ ...f, tags: e.target.value }))} placeholder="promo, seasonal" />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowUrlModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary">Add URL</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Preview modal */}
            {preview && (
                <Modal title={preview.name} onClose={() => setPreview(null)} maxWidth="800px">
                    <div style={{ textAlign: 'center' }}>
                        {preview.type === 'image' && preview.url && (
                            <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8, objectFit: 'contain' }} />
                        )}
                        {preview.type === 'video' && preview.url && (
                            <video src={preview.url} controls style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 8 }} />
                        )}
                        {preview.type === 'web_url' && (
                            <a href={preview.url} target="_blank" rel="noreferrer" className="btn-primary" style={{ display: 'inline-flex' }}>
                                Open URL
                            </a>
                        )}
                        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div className="label" style={{ marginBottom: '0.25rem' }}>Type</div>
                                <div style={{ color: '#f1f5f9' }}>{preview.type}</div>
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <div className="label" style={{ marginBottom: '0.25rem' }}>Size</div>
                                <div style={{ color: '#f1f5f9' }}>{formatBytes(preview.bytes)}</div>
                            </div>
                            {preview.checksum_sha256 && (
                                <div style={{ textAlign: 'left' }}>
                                    <div className="label" style={{ marginBottom: '0.25rem' }}>SHA-256</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{preview.checksum_sha256.substring(0, 16)}…</div>
                                </div>
                            )}
                        </div>
                        {preview.tags?.length > 0 && (
                            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.375rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {preview.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
                            </div>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    )
}
