import React, { useEffect, useState } from 'react'
import {
    Package, Plus, Trash2, Loader2, Image as ImageIcon,
    Film, Globe, Layers, AlertTriangle, Check, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Bundle, Layout, MediaAsset } from '../../types'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────

// Local type for file rows (includes joined media)
interface BundleFileRow {
    id: string
    bundle_id: string
    media_id: string
    media?: MediaAsset
}

interface BundleWithFiles extends Omit<Bundle, 'files'> {
    file_count?: number
    files?: BundleFileRow[]
    publication_count?: number
}

type MediaType = 'image' | 'video' | 'web_url'

const MEDIA_ICON: Record<MediaType, React.ReactNode> = {
    image: <ImageIcon size={13} color="#7a8aff" />,
    video: <Film size={13} color="#f59e0b" />,
    web_url: <Globe size={13} color="#22c55e" />,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b?: number | null) {
    if (!b) return '—'
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1024 / 1024).toFixed(2)} MB`
}

function versionSuggest(existing: string[]): string {
    // Find highest semver patch and bump it
    const nums = existing.map(v => {
        const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
        return m ? [+m[1], +m[2], +m[3]] : null
    }).filter(Boolean) as number[][]

    if (nums.length === 0) return 'v1.0.0'
    nums.sort((a, b) => a[0] !== b[0] ? b[0] - a[0] : a[1] !== b[1] ? b[1] - a[1] : b[2] - a[2])
    const [maj, min, patch] = nums[0]
    return `v${maj}.${min}.${patch + 1}`
}

// ─── Bundle Row component ─────────────────────────────────────────────────────

function BundleRow({
    bundle,
    onDelete,
    onRefresh,
}: {
    bundle: BundleWithFiles
    onDelete: (id: string, version: string) => void
    onRefresh: () => void
}) {
    const [open, setOpen] = useState(false)
    const [files, setFiles] = useState<BundleFileRow[]>([])
    const [loadingFiles, setLoadingFiles] = useState(false)

    const loadFiles = async () => {
        if (files.length > 0) { setOpen(o => !o); return }
        setLoadingFiles(true)
        const { data } = await supabase
            .from('bundle_files')
            .select('*, media:media_assets(id,name,type,bytes,url,storage_path)')
            .eq('bundle_id', bundle.id)
            .order('created_at')
        setFiles((data as BundleFileRow[]) || [])
        setLoadingFiles(false)
        setOpen(true)
    }

    return (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '0.75rem' }}>
            {/* Header row */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                padding: '0.875rem 1.25rem',
                borderBottom: open ? '1px solid #1e293b' : 'none',
            }}>
                {/* Version badge */}
                <span className="badge badge-blue" style={{ fontWeight: 700, fontSize: '0.875rem', fontFamily: 'monospace', padding: '0.3rem 0.75rem' }}>
                    {bundle.version}
                </span>

                {/* Notes */}
                <span style={{ flex: 1, color: '#94a3b8', fontSize: '0.8125rem' }}>
                    {bundle.notes || <span style={{ color: '#334155' }}>No notes</span>}
                </span>

                {/* File count */}
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: '#64748b' }}>
                    <Layers size={13} />
                    {bundle.file_count ?? '?'} file{bundle.file_count !== 1 ? 's' : ''}
                </span>

                {/* Published count */}
                {(bundle.publication_count ?? 0) > 0 && (
                    <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>
                        {bundle.publication_count} active pub{bundle.publication_count !== 1 ? 's' : ''}
                    </span>
                )}

                {/* Created */}
                <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                    {bundle.created_at ? formatDistanceToNow(new Date(bundle.created_at), { addSuffix: true }) : '—'}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button
                        onClick={loadFiles}
                        className="btn-secondary"
                        style={{ padding: '0.375rem 0.625rem', gap: '0.25rem', fontSize: '0.75rem' }}
                        disabled={loadingFiles}
                    >
                        {loadingFiles ? <Loader2 size={12} /> : open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Files
                    </button>
                    <button
                        onClick={() => onDelete(bundle.id, bundle.version)}
                        className="btn-danger"
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                        title={
                            (bundle.publication_count ?? 0) > 0
                                ? 'Cannot delete — bundle has active publications'
                                : 'Delete bundle'
                        }
                        disabled={(bundle.publication_count ?? 0) > 0}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {/* Files panel */}
            {open && (
                <div style={{ background: '#060d1a', padding: '0.75rem 1.25rem' }}>
                    {files.length === 0 ? (
                        <div style={{ color: '#475569', fontSize: '0.8125rem', textAlign: 'center', padding: '1rem' }}>
                            No files in this bundle. Use "Snapshot from Layout" to populate it.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                            {files.map(f => (
                                <div key={f.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.5rem 0.75rem', borderRadius: 6,
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                    <span style={{ display: 'flex', alignItems: 'center' }}>
                                        {MEDIA_ICON[(f.media?.type || 'image') as MediaType]}
                                    </span>
                                    <span style={{ flex: 1, color: '#e2e8f0', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {f.media?.name || f.media_id}
                                    </span>
                                    <span className={`badge badge-${f.media?.type === 'image' ? 'blue' : f.media?.type === 'video' ? 'gray' : 'green'}`} style={{ fontSize: '0.6875rem' }}>
                                        {f.media?.type || '—'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#475569', minWidth: 60, textAlign: 'right' }}>
                                        {formatBytes(f.media?.bytes)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Create Bundle Modal ──────────────────────────────────────────────────────

interface CreateForm {
    version: string
    notes: string
    layout_id: string
    snapshot: boolean
}

function CreateBundleModal({
    layouts,
    suggestedVersion,
    onClose,
    onCreated,
}: {
    layouts: Layout[]
    suggestedVersion: string
    onClose: () => void
    onCreated: () => void
}) {
    const [form, setForm] = useState<CreateForm>({
        version: suggestedVersion,
        notes: '',
        layout_id: '',
        snapshot: true,
    })
    const [saving, setSaving] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.version.trim()) { toast.error('Version is required'); return }

        setSaving(true)
        try {
            // 1. Insert bundle
            const { data: bundle, error: bErr } = await supabase
                .from('bundles')
                .insert({ tenant_id: DEFAULT_TENANT_ID, version: form.version.trim(), notes: form.notes.trim() || null })
                .select()
                .single()
            if (bErr) throw bErr

            // 2. Snapshot media from layout if requested
            if (form.snapshot && form.layout_id) {
                const { data: regionMaps } = await supabase
                    .from('layout_region_playlists')
                    .select('playlist_id')
                    .eq('layout_id', form.layout_id)

                const playlistIds = (regionMaps || []).map((r: any) => r.playlist_id).filter(Boolean)
                let mediaIds: string[] = []

                if (playlistIds.length > 0) {
                    const { data: items } = await supabase
                        .from('playlist_items')
                        .select('media_id')
                        .in('playlist_id', playlistIds)
                    mediaIds = [...new Set((items || []).map((i: any) => i.media_id).filter(Boolean))]
                }

                if (mediaIds.length > 0) {
                    const { error: filesErr } = await supabase
                        .from('bundle_files')
                        .insert(mediaIds.map(mid => ({ bundle_id: bundle.id, media_id: mid })))
                    if (filesErr) throw filesErr
                    toast.success(`Bundle ${bundle.version} created — ${mediaIds.length} asset${mediaIds.length !== 1 ? 's' : ''} snapshotted`)
                } else {
                    toast.success(`Bundle ${bundle.version} created (no media found in layout)`)
                }
            } else {
                toast.success(`Bundle ${bundle.version} created`)
            }

            onCreated()
            onClose()
        } catch (err: any) {
            toast.error(err.message || 'Failed to create bundle')
        }
        setSaving(false)
    }

    return (
        <Modal title="Create Bundle" onClose={onClose}>
            <form onSubmit={handleSubmit}>
                {/* Version */}
                <div className="form-group">
                    <label className="label">Version *</label>
                    <input
                        className="input-field"
                        value={form.version}
                        onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                        placeholder="e.g. v1.0.0"
                        style={{ fontFamily: 'monospace' }}
                    />
                    <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', color: '#475569' }}>
                        Use semantic versioning (v&lt;major&gt;.&lt;minor&gt;.&lt;patch&gt;). Suggested: <code style={{ color: '#7a8aff' }}>{suggestedVersion}</code>
                    </p>
                </div>

                {/* Notes */}
                <div className="form-group">
                    <label className="label">Release Notes</label>
                    <textarea
                        className="input-field"
                        value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="What changed in this bundle? (optional)"
                        rows={2}
                        style={{ resize: 'vertical' }}
                    />
                </div>

                {/* Snapshot toggle */}
                <div className="form-group">
                    <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                        <input
                            type="checkbox"
                            checked={form.snapshot}
                            onChange={e => setForm(f => ({ ...f, snapshot: e.target.checked }))}
                            style={{ accentColor: '#5a64f6', width: 15, height: 15 }}
                        />
                        Snapshot media from a Layout
                    </label>
                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.75rem', color: '#475569' }}>
                        Auto-populate bundle_files with all media assets referenced by the layout's playlists.
                    </p>
                </div>

                {/* Layout picker (visible when snapshot is on) */}
                {form.snapshot && (
                    <div className="form-group">
                        <label className="label">Source Layout *</label>
                        <select
                            className="input-field"
                            value={form.layout_id}
                            onChange={e => setForm(f => ({ ...f, layout_id: e.target.value }))}
                        >
                            <option value="">— Select Layout —</option>
                            {layouts.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Info box */}
                <div style={{
                    display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
                    padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1.25rem',
                    background: 'rgba(90,100,246,0.07)', border: '1px solid rgba(90,100,246,0.18)',
                    fontSize: '0.8125rem', color: '#94a3b8',
                }}>
                    <AlertTriangle size={14} color="#7a8aff" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                        After creating, go to <strong style={{ color: '#c7d2fe' }}>Publish</strong> and select this bundle to push it to devices.
                        The Player will show the new version at the next manifest poll (~2 min).
                    </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={saving || (form.snapshot && !form.layout_id)}>
                        {saving && <Loader2 size={14} />}
                        {saving ? 'Creating…' : 'Create Bundle'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BundlesPage() {
    const [bundles, setBundles] = useState<BundleWithFiles[]>([])
    const [layouts, setLayouts] = useState<Layout[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)

    const loadAll = async () => {
        setLoading(true)

        const [bRes, lRes] = await Promise.all([
            supabase
                .from('bundles')
                .select('*')
                .eq('tenant_id', DEFAULT_TENANT_ID)
                .order('created_at', { ascending: false }),
            supabase
                .from('layouts')
                .select('id, name, tenant_id')
                .eq('tenant_id', DEFAULT_TENANT_ID)
                .order('name'),
        ])

        const bundleList: BundleWithFiles[] = bRes.data || []

        // Fetch file counts + active publication counts for each bundle in one query each
        if (bundleList.length > 0) {
            const ids = bundleList.map(b => b.id)

            const [fcRes, pcRes] = await Promise.all([
                supabase.from('bundle_files').select('bundle_id').in('bundle_id', ids),
                supabase.from('layout_publications').select('bundle_id').in('bundle_id', ids).eq('is_active', true),
            ])

            const fileCounts: Record<string, number> = {}
            const pubCounts: Record<string, number> = {}
                ; (fcRes.data || []).forEach((r: any) => { fileCounts[r.bundle_id] = (fileCounts[r.bundle_id] || 0) + 1 })
                ; (pcRes.data || []).forEach((r: any) => { pubCounts[r.bundle_id] = (pubCounts[r.bundle_id] || 0) + 1 })

            bundleList.forEach(b => {
                b.file_count = fileCounts[b.id] || 0
                b.publication_count = pubCounts[b.id] || 0
            })
        }

        setBundles(bundleList)
        setLayouts((lRes.data as Layout[]) || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const handleDelete = async (id: string, version: string) => {
        const b = bundles.find(x => x.id === id)
        if ((b?.publication_count ?? 0) > 0) {
            toast.error('Cannot delete a bundle that has active publications. Deactivate them first.')
            return
        }
        if (!confirm(`Delete bundle ${version}? This will also remove all its bundle_files. This cannot be undone.`)) return
        const { error } = await supabase.from('bundles').delete().eq('id', id)
        if (error) toast.error(error.message)
        else { toast.success(`Bundle ${version} deleted`); loadAll() }
    }

    const existingVersions = bundles.map(b => b.version)
    const suggested = versionSuggest(existingVersions)

    // Summary stats
    const totalFiles = bundles.reduce((s, b) => s + (b.file_count || 0), 0)
    const activePubs = bundles.reduce((s, b) => s + (b.publication_count || 0), 0)

    return (
        <div>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Bundles</h1>
                    <p className="page-subtitle">Create and version content bundles — snapshot media from layouts, then publish to screens</p>
                </div>
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                    <button className="btn-secondary" onClick={loadAll} title="Refresh">
                        <RefreshCw size={14} />
                    </button>
                    <button className="btn-primary" onClick={() => setShowCreate(true)}>
                        <Plus size={14} /> New Bundle
                    </button>
                </div>
            </div>

            {/* Stat strip */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Total Bundles', value: bundles.length, color: '#7a8aff' },
                    { label: 'Total Files', value: totalFiles, color: '#f59e0b' },
                    { label: 'Active Publications', value: activePubs, color: '#22c55e' },
                ].map(s => (
                    <div key={s.label} className="card" style={{ flex: 1, padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem' }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Workflow note */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.75rem 1.25rem', marginBottom: '1.5rem',
                background: 'rgba(90,100,246,0.06)', border: '1px solid rgba(90,100,246,0.15)',
                borderRadius: 10, fontSize: '0.8125rem',
            }}>
                <span style={{ color: '#64748b' }}>Workflow:</span>
                <span className="badge badge-blue">1. Media Library</span>
                <span style={{ color: '#334155' }}>→</span>
                <span className="badge badge-blue">2. Playlist</span>
                <span style={{ color: '#334155' }}>→</span>
                <span className="badge badge-blue">3. Layout</span>
                <span style={{ color: '#334155' }}>→</span>
                <span className="badge badge-green">4. Bundle (here)</span>
                <span style={{ color: '#334155' }}>→</span>
                <span className="badge badge-gray">5. Publish</span>
                <span style={{ color: '#334155' }}>→</span>
                <span style={{ color: '#64748b' }}>📺 Player</span>
            </div>

            {/* Bundle list */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <Loader2 size={24} style={{ margin: '0 auto 0.75rem', display: 'block' }} />
                    Loading bundles…
                </div>
            ) : bundles.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '4rem 2rem',
                    background: 'rgba(255,255,255,0.02)', border: '1px dashed #1e293b',
                    borderRadius: 12,
                }}>
                    <Package size={40} color="#334155" style={{ margin: '0 auto 1rem', display: 'block' }} />
                    <div style={{ fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>No bundles yet</div>
                    <div style={{ color: '#334155', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Create your first bundle and snapshot a layout's media assets to publish to your screens.
                    </div>
                    <button className="btn-primary" onClick={() => setShowCreate(true)}>
                        <Plus size={14} /> Create First Bundle
                    </button>
                </div>
            ) : (
                <div>
                    {bundles.map(b => (
                        <BundleRow key={b.id} bundle={b} onDelete={handleDelete} onRefresh={loadAll} />
                    ))}
                </div>
            )}

            {/* Legend */}
            {bundles.length > 0 && (
                <div style={{ marginTop: '1rem', display: 'flex', gap: '1.25rem', fontSize: '0.75rem', color: '#475569' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>{MEDIA_ICON['image']} Image</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>{MEDIA_ICON['video']} Video</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>{MEDIA_ICON['web_url']} Web URL</span>
                    <span style={{ marginLeft: 'auto', color: '#334155' }}>
                        Bundles with active publications cannot be deleted.
                    </span>
                </div>
            )}

            {/* Create modal */}
            {showCreate && (
                <CreateBundleModal
                    layouts={layouts}
                    suggestedVersion={suggested}
                    onClose={() => setShowCreate(false)}
                    onCreated={loadAll}
                />
            )}
        </div>
    )
}
