import React, { useEffect, useRef, useState } from 'react'
import { Plus, Search, Upload, Trash2, Image as ImageIcon, Film, Globe, Filter, Loader2, X, Link, CloudUpload, Presentation } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getR2UploadUrl } from '../../lib/r2'
import { MediaAsset } from '../../types'
import { useTenant } from '../../contexts/TenantContext'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 12
const BUCKET = 'signage_media'

// Cloudflare R2 public base URL (set in .env)
const R2_BASE = (import.meta.env.VITE_R2_PUBLIC_BASE_URL as string || '').replace(/\/$/, '')

function formatBytes(bytes?: number) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function timeAgo(dateStr?: string) {
    if (!dateStr) return null
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diff = Math.floor((now - then) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
    return `${Math.floor(diff / 86400)} days ago`
}

function TypeIcon({ type }: { type: string }) {
    if (type === 'video') return <Film size={14} color="#a78bfa" />
    if (type === 'web_url') return <Globe size={14} color="#34d399" />
    if (type === 'ppt' || type === 'presentation') return <Presentation size={14} color="#f59e0b" />
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
    const [showR2Modal, setShowR2Modal] = useState(false)
    const [urlForm, setUrlForm] = useState({ name: '', url: '', tags: '' })
    const [r2Form, setR2Form] = useState({ name: '', r2Path: '', type: 'ppt', tags: '' })
    const [deleting, setDeleting] = useState<string | null>(null)
    const [preview, setPreview] = useState<MediaAsset | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)
    const { currentTenantId } = useTenant()

    const loadAssets = async () => {
        if (!currentTenantId) return
        setLoading(true)
        const { data } = await supabase
            .from('media_assets')
            .select('*')
            .eq('tenant_id', currentTenantId)
            .order('created_at', { ascending: false })
        setAssets(data || [])
        setLoading(false)
    }

    const fixMediaTypes = async () => {
        if (!currentTenantId) return
        // Auto-fix any PPTs that were misclassified as images
        const { data: misclassified } = await supabase
            .from('media_assets')
            .select('id, name')
            .eq('tenant_id', currentTenantId)
            .eq('type', 'image')

        const toFix = misclassified?.filter(m => {
            const name = m.name.toLowerCase()
            const url = (assets.find(a => a.id === m.id)?.url || '').toLowerCase()
            return name.endsWith('.ppt') || name.endsWith('.pptx') || name.endsWith('.pptm') || name.endsWith('.pps') || name.endsWith('.ppsx') ||
                url.endsWith('.ppt') || url.endsWith('.pptx') || url.endsWith('.pptm') || url.endsWith('.pps') || url.endsWith('.ppsx')
        })

        if (toFix && toFix.length > 0) {
            console.log(`Fixing ${toFix.length} misclassified PPT items...`)
            let count = 0
            for (const item of toFix) {
                const { error } = await supabase.from('media_assets').update({ type: 'ppt' }).eq('id', item.id)
                if (!error) count++
            }
            if (count > 0) {
                toast.success(`Automatically updated ${count} PowerPoint files`)
                loadAssets()
            }
        }
    }

    useEffect(() => {
        loadAssets()
        fixMediaTypes()
    }, [currentTenantId])

    const filtered = assets.filter(a => {
        const matchSearch = a.name.toLowerCase().includes(search.toLowerCase())
        const matchType = !filterType || a.type === filterType
        return matchSearch && matchType
    })

    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        if (!currentTenantId) {
            toast.error('Please select a tenant first')
            if (fileInput.current) fileInput.current.value = ''
            return
        }

        setUploading(true)
        try {
            for (const file of Array.from(files)) {

                // 1. Get presigned URL (Plan B: Generated in Frontend)
                const { uploadUrl, key } = await getR2UploadUrl(
                    file.name,
                    file.type || 'application/octet-stream',
                    currentTenantId || 'default'
                )

                // 2. Upload directly to Cloudflare R2
                const upRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file
                })

                if (!upRes.ok) {
                    toast.error(`R2 Upload failed (HTTP ${upRes.status})`)
                    continue
                }

                // 3. Register in database
                const publicUrl = `${R2_BASE}/${key}`
                const fileNameLower = file.name.toLowerCase()
                const isPPT = fileNameLower.endsWith('.ppt') ||
                    fileNameLower.endsWith('.pptx') ||
                    fileNameLower.endsWith('.pptm') ||
                    fileNameLower.endsWith('.pps') ||
                    fileNameLower.endsWith('.ppsx') ||
                    file.type === 'application/vnd.ms-powerpoint' ||
                    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.slideshow' ||
                    file.type.includes('presentation')

                const type = file.type.startsWith('video') ? 'video' : (isPPT ? 'ppt' : 'image')

                const { error: dbErr } = await supabase.from('media_assets').insert({
                    tenant_id: currentTenantId,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    type,
                    storage_path: key,
                    url: publicUrl,
                    bytes: file.size,
                    tags: [],
                })

                if (dbErr) {
                    toast.error(`DB save failed: ${dbErr.message}`)
                } else {
                    toast.success(`Uploaded to R2: ${file.name}`)
                }
            }
        } catch (err: any) {
            console.error('Upload error:', err)
            toast.error(err.message || 'An unexpected error occurred during upload')
        } finally {
            setUploading(false)
            loadAssets()
            if (fileInput.current) fileInput.current.value = ''
        }
    }

    // ── Add external Web URL ──────────────────────────────────────────────────
    const handleAddUrl = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!urlForm.name || !urlForm.url) { toast.error('Name and URL required'); return }
        const { error } = await supabase.from('media_assets').insert({
            tenant_id: currentTenantId,
            name: urlForm.name,
            type: 'web_url',
            url: urlForm.url,
            tags: urlForm.tags ? urlForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        })
        if (error) toast.error(error.message)
        else { toast.success('URL added'); setShowUrlModal(false); setUrlForm({ name: '', url: '', tags: '' }); loadAssets() }
    }

    // ── Register a file already uploaded directly to Cloudflare R2 ───────────
    const handleRegisterR2 = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!r2Form.name || !r2Form.r2Path) { toast.error('Name and R2 path required'); return }

        // Smart path cleaning: If user pasted a full URL, extract the relative path
        let inputPath = r2Form.r2Path.trim()
        let cleanPath = inputPath

        if (cleanPath.includes(R2_BASE)) {
            cleanPath = cleanPath.split(R2_BASE).pop()?.replace(/^\//, '') || cleanPath
        } else if (cleanPath.startsWith('http')) {
            try {
                const urlObj = new URL(cleanPath)
                cleanPath = urlObj.pathname.replace(/^\//, '')
            } catch (e) {
                cleanPath = cleanPath.replace(/^\//, '')
            }
        } else {
            cleanPath = cleanPath.replace(/^\//, '')
        }

        // DECODE first to handle cases where users paste an already encoded string (to prevent %2520)
        // then re-encode safely.
        const decodedPath = decodeURIComponent(cleanPath)
        const encodedPath = decodedPath.split('/').map(part => encodeURIComponent(part)).join('/')
        const publicUrl = `${R2_BASE}/${encodedPath}`

        const { error } = await supabase.from('media_assets').insert({
            tenant_id: currentTenantId,
            name: r2Form.name,
            type: r2Form.type,
            url: publicUrl,
            storage_path: decodedPath,
            tags: r2Form.tags ? r2Form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        })
        if (error) toast.error(error.message)
        else {
            toast.success(`Registered: ${r2Form.name}`)
            setShowR2Modal(false)
            setR2Form({ name: '', r2Path: '', type: 'video', tags: '' })
            loadAssets()
        }
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async (asset: MediaAsset) => {
        if (!confirm('Delete this media asset? It may be used in playlists.')) return
        setDeleting(asset.id)
        // Only attempt Supabase Storage deletion for files that were uploaded there
        // R2-only files (directly uploaded to Cloudflare) don't exist in Supabase Storage
        if (asset.storage_path && !isR2Url(asset.url)) {
            await supabase.storage.from(BUCKET).remove([asset.storage_path])
        }
        const { error } = await supabase.from('media_assets').delete().eq('id', asset.id)
        if (error) toast.error(error.message)
        else { toast.success('Deleted'); loadAssets() }
        setDeleting(null)
    }

    const isR2Url = (url?: string) => url?.includes('r2.dev') || (R2_BASE && url?.includes(R2_BASE))

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Media Library</h1>
                    <p className="page-subtitle">
                        Manage images, videos, and web content for your displays
                        {R2_BASE && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--color-brand-400)', background: 'rgba(var(--color-brand-rgb), 0.1)', padding: '0.15rem 0.5rem', borderRadius: 4 }}>☁ Cloudflare R2</span>}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={() => setShowUrlModal(true)}>
                        <Globe size={14} /> Add URL
                    </button>
                    <button className="btn-secondary" onClick={() => setShowR2Modal(true)} title="Register file already uploaded to Cloudflare R2">
                        <CloudUpload size={14} /> Import from R2
                    </button>
                    <button className="btn-primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 size={14} /> : <Upload size={14} />}
                        {uploading ? 'Uploading…' : 'Upload Files'}
                    </button>
                    <input ref={fileInput} type="file" multiple accept="image/*,video/*,.ppt,.pptx" style={{ display: 'none' }} onChange={handleFileUpload} />
                </div>
            </div>

            {/* Search Bar */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input type="text" className="input-field" placeholder="Search media..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                </div>
            </div>

            {/* Two-column layout: sidebar + grid */}
            <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>

                {/* LEFT SIDEBAR — Type Filter */}
                <div style={{ width: 160, flexShrink: 0 }}>
                    <div className="card" style={{ padding: '0.875rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                            Filter by Type
                        </div>
                        {([
                            { value: '', label: 'All Media', icon: <Filter size={13} color="#94a3b8" /> },
                            { value: 'image', label: 'Images', icon: <ImageIcon size={13} color="#60a5fa" /> },
                            { value: 'video', label: 'Videos', icon: <Film size={13} color="#a78bfa" /> },
                            { value: 'ppt', label: 'Slides', icon: <Presentation size={13} color="#f59e0b" /> },
                            { value: 'web_url', label: 'Web URLs', icon: <Globe size={13} color="#34d399" /> },
                        ] as { value: string; label: string; icon: React.ReactNode }[]).map(({ value, label, icon }) => (
                            <button
                                key={value}
                                onClick={() => { setFilterType(value); setPage(1) }}
                                style={{
                                    width: '100%', textAlign: 'left', padding: '0.45rem 0.625rem',
                                    borderRadius: 6, border: 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    fontSize: '0.8125rem', marginBottom: '0.125rem',
                                    background: filterType === value ? 'rgba(var(--color-brand-rgb), 0.12)' : 'transparent',
                                    color: filterType === value ? 'var(--color-brand-400)' : 'var(--color-surface-400)',
                                    fontWeight: filterType === value ? 600 : 400,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {icon} {label}
                            </button>
                        ))}
                    </div>

                    <div className="card" style={{ padding: '0.875rem', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                            Folders (Tags)
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '0.5rem', background: 'var(--color-surface-900)', borderRadius: 6, border: '1px dashed var(--color-surface-800)', textAlign: 'center' }}>
                            Grouping available in Stage 3
                        </div>
                    </div>

                    <div className="card" style={{ padding: '0.875rem' }}>
                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.625rem' }}>
                            Library Stats
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.8 }}>
                            <div>Total size: <strong style={{ color: 'var(--color-text-secondary)' }}>{formatBytes(assets.reduce((sum, a) => sum + (a.bytes || 0), 0))}</strong></div>
                            <div>Storage usage: <strong style={{ color: 'var(--color-brand-400)' }}>{(assets.reduce((sum, a) => sum + (a.bytes || 0), 0) / (1024 * 1024 * 1024)).toFixed(2)} GB</strong></div>
                        </div>
                        {/* Asset counts */}
                        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-surface-800)', fontSize: '0.7rem', color: '#64748b', lineHeight: 1.8 }}>
                            <div>Total: <strong style={{ color: 'var(--color-text-secondary)' }}>{assets.length}</strong></div>
                            <div>{assets.filter(a => a.type === 'image').length} images</div>
                            <div>{assets.filter(a => a.type === 'video').length} videos</div>
                            <div>{assets.filter(a => a.type === 'ppt').length} slides</div>
                            <div>{assets.filter(a => a.type === 'web_url').length} URLs</div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Main content grid */}
                <div style={{ flex: 1, minWidth: 0 }}>

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
                                                <video src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                            ) : a.type === 'ppt' ? (
                                                <div style={{ textAlign: 'center', color: '#f59e0b' }}>
                                                    <Presentation size={48} />
                                                    <div style={{ fontSize: '0.65rem', marginTop: '0.5rem', fontWeight: 600 }}>POWERPOINT</div>
                                                </div>
                                            ) : (
                                                <Globe size={36} color="#34d399" />
                                            )}
                                            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: '0.375rem' }}>
                                                <span className={`badge ${a.type === 'video' ? 'badge-blue' : a.type === 'web_url' ? 'badge-green' : ''}`} style={{ background: 'rgba(0,0,0,0.7)' }}>
                                                    <TypeIcon type={a.type} />
                                                    {a.type}
                                                </span>
                                            </div>
                                            {/* R2 badge */}
                                            {isR2Url(a.url) && (
                                                <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(99,102,241,0.85)', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.625rem', color: '#fff', fontWeight: 600 }}>
                                                    ☁ R2
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ padding: '0.75rem' }}>
                                            <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-3)', marginTop: '0.2rem' }}>
                                                Updated {timeAgo((a as any).updated_at || (a as any).created_at)}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-2)', marginTop: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                </div> {/* end main grid column */}
            </div> {/* end two-column layout */}

            {/* Add Web URL modal */}
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

            {/* Import from R2 modal */}
            {showR2Modal && (
                <Modal title="☁ Import from Cloudflare R2" onClose={() => setShowR2Modal(false)}>
                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(99,102,241,0.07)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
                        Use this when you upload files <strong>directly in the Cloudflare R2 dashboard</strong>. Enter the file path (relative to your R2 bucket root) and it will appear in the Media Library.
                        <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#6366f1' }}>
                            Base URL: {R2_BASE || '(not configured)'}
                        </div>
                    </div>
                    <form onSubmit={handleRegisterR2}>
                        <div className="form-group">
                            <label className="label">Display Name *</label>
                            <input className="input-field" value={r2Form.name} onChange={e => setR2Form(f => ({ ...f, name: e.target.value }))} placeholder="My Pizza Video" />
                        </div>
                        <div className="form-group">
                            <label className="label">R2 File Path *</label>
                            <input
                                className="input-field"
                                value={r2Form.r2Path}
                                onChange={e => setR2Form(f => ({ ...f, r2Path: e.target.value }))}
                                placeholder="videos/my-video.mp4"
                                style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}
                            />
                            {r2Form.r2Path && R2_BASE && (
                                <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    → {R2_BASE}/{r2Form.r2Path.replace(/^\//, '')}
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="label">Type</label>
                            <select className="input-field" value={r2Form.type} onChange={e => setR2Form(f => ({ ...f, type: e.target.value }))}>
                                <option value="ppt">PowerPoint</option>
                                <option value="video">Video</option>
                                <option value="image">Image</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="label">Tags (comma-separated)</label>
                            <input className="input-field" value={r2Form.tags} onChange={e => setR2Form(f => ({ ...f, tags: e.target.value }))} placeholder="pizza, promo" />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowR2Modal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={!r2Form.name || !r2Form.r2Path || !R2_BASE}>
                                Register in Library
                            </button>
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
                        {preview.type === 'ppt' && preview.url && (
                            <iframe
                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(preview.url)}&embedded=true`}
                                style={{ width: '100%', height: 400, border: 'none', borderRadius: 8, background: '#fff' }}
                                title="ppt-preview"
                            />
                        )}
                        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div className="label" style={{ marginBottom: '0.25rem' }}>Type</div>
                                <div style={{ color: 'var(--color-text-primary)' }}>{preview.type}</div>
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <div className="label" style={{ marginBottom: '0.25rem' }}>Size</div>
                                <div style={{ color: 'var(--color-text-primary)' }}>{formatBytes(preview.bytes)}</div>
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <div className="label" style={{ marginBottom: '0.25rem' }}>Storage</div>
                                <div style={{ color: isR2Url(preview.url) ? '#6366f1' : '#94a3b8' }}>
                                    {isR2Url(preview.url) ? '☁ Cloudflare R2' : '📦 Supabase'}
                                </div>
                            </div>
                            {preview.checksum_sha256 && (
                                <div style={{ textAlign: 'left' }}>
                                    <div className="label" style={{ marginBottom: '0.25rem' }}>SHA-256</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>{preview.checksum_sha256.substring(0, 16)}…</div>
                                </div>
                            )}
                        </div>
                        {preview.url && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <a href={preview.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all', textDecoration: 'none' }}>
                                    {preview.url}
                                </a>
                            </div>
                        )}
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
