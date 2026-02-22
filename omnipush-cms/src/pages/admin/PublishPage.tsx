import React, { useEffect, useState } from 'react'
import { Plus, Package, Upload, RotateCcw, Loader2, ChevronDown, ChevronRight, FileCheck } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { Bundle, Layout, LayoutPublication } from '../../types'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

function formatBytes(bytes?: number) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function PublishPage() {
    const [bundles, setBundles] = useState<Bundle[]>([])
    const [layouts, setLayouts] = useState<Layout[]>([])
    const [publications, setPublications] = useState<LayoutPublication[]>([])
    const [loading, setLoading] = useState(true)
    const [showBundleModal, setShowBundleModal] = useState(false)
    const [showPublishModal, setShowPublishModal] = useState(false)
    const [bundleForm, setBundleForm] = useState({ version: '', notes: '' })
    const [publishForm, setPublishForm] = useState({ layout_id: '', bundle_id: '' })
    const [expandedBundle, setExpandedBundle] = useState<string | null>(null)
    const [bundleFiles, setBundleFiles] = useState<Record<string, any[]>>({})
    const [saving, setSaving] = useState(false)
    const [publishing, setPublishing] = useState(false)

    const loadAll = async () => {
        setLoading(true)
        const [bRes, lRes, pRes] = await Promise.all([
            supabase.from('bundles').select('*').order('created_at', { ascending: false }),
            supabase.from('layouts').select('*').order('name'),
            supabase.from('layout_publications').select('*, layout:layouts(id,name), bundle:bundles(id,version)').order('published_at', { ascending: false }),
        ])
        setBundles(bRes.data || [])
        setLayouts(lRes.data || [])
        setPublications(pRes.data || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])

    const loadBundleFiles = async (bundleId: string) => {
        const { data } = await supabase.from('bundle_files').select('*, media:media_assets(id,name,type,bytes,checksum_sha256)').eq('bundle_id', bundleId)
        setBundleFiles(f => ({ ...f, [bundleId]: data || [] }))
    }

    const toggleBundle = (id: string) => {
        if (expandedBundle === id) {
            setExpandedBundle(null)
        } else {
            setExpandedBundle(id)
            if (!bundleFiles[id]) loadBundleFiles(id)
        }
    }

    const handleCreateBundle = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!bundleForm.version.trim()) { toast.error('Version string required'); return }
        setSaving(true)
        const { error } = await supabase.from('bundles').insert({ version: bundleForm.version, notes: bundleForm.notes, tenant_id: DEFAULT_TENANT_ID })
        setSaving(false)
        if (error) { toast.error(error.message); return }
        toast.success(`Bundle ${bundleForm.version} created`)
        setShowBundleModal(false)
        setBundleForm({ version: '', notes: '' })
        loadAll()
    }

    const handlePublishLayout = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!publishForm.layout_id || !publishForm.bundle_id) { toast.error('Select layout and bundle'); return }
        setPublishing(true)
        try {
            // Step 1: Get layout region playlists
            const { data: regions } = await supabase.from('layout_region_playlists').select('playlist_id').eq('layout_id', publishForm.layout_id)
            const playlistIds = (regions || []).map(r => r.playlist_id).filter(Boolean)

            // Step 2: Get all media from those playlists
            let mediaIds: string[] = []
            if (playlistIds.length > 0) {
                const { data: items } = await supabase.from('playlist_items').select('media_id').in('playlist_id', playlistIds)
                mediaIds = [...new Set((items || []).map(i => i.media_id).filter(Boolean))]
            }

            // Step 3: Upsert layout_publications
            const { error: pubErr } = await supabase.from('layout_publications').upsert({
                layout_id: publishForm.layout_id,
                bundle_id: publishForm.bundle_id,
                published_at: new Date().toISOString()
            }, { onConflict: 'layout_id' })
            if (pubErr) throw pubErr

            // Step 4: Insert bundle_files
            if (mediaIds.length > 0) {
                await supabase.from('bundle_files').delete().eq('bundle_id', publishForm.bundle_id)
                const { error: filesErr } = await supabase.from('bundle_files').insert(
                    mediaIds.map(mid => ({ bundle_id: publishForm.bundle_id, media_id: mid }))
                )
                if (filesErr) throw filesErr
            }

            toast.success('Layout published successfully!')
            setShowPublishModal(false)
            setPublishForm({ layout_id: '', bundle_id: '' })
            loadAll()
        } catch (err: any) {
            toast.error(err.message || 'Publish failed')
        }
        setPublishing(false)
    }

    const handleRollback = async (layoutId: string, bundleId: string) => {
        if (!confirm('Switch this layout to the selected bundle? This will update the current publication.')) return
        const { error } = await supabase.from('layout_publications').upsert({
            layout_id: layoutId,
            bundle_id: bundleId,
            published_at: new Date().toISOString()
        }, { onConflict: 'layout_id' })
        if (error) toast.error(error.message)
        else { toast.success('Rollback successful'); loadAll() }
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Publish Versions</h1>
                    <p className="page-subtitle">Bundle and publish display content to your devices</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={() => setShowPublishModal(true)}>
                        <Upload size={14} /> Publish Layout
                    </button>
                    <button className="btn-primary" onClick={() => setShowBundleModal(true)}>
                        <Plus size={16} /> New Bundle
                    </button>
                </div>
            </div>

            {/* Current Publications */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileCheck size={16} color="#22c55e" />
                    Current Publications
                </h2>
                {publications.length === 0 ? (
                    <div style={{ color: '#64748b', fontSize: '0.875rem' }}>No layouts published yet.</div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Layout</th>
                                    <th>Bundle Version</th>
                                    <th>Published At</th>
                                    <th>Rollback to...</th>
                                </tr>
                            </thead>
                            <tbody>
                                {publications.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{(p as any).layout?.name}</td>
                                        <td><span className="badge badge-green">{(p as any).bundle?.version}</span></td>
                                        <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>{new Date(p.published_at).toLocaleString()}</td>
                                        <td>
                                            <select
                                                className="input-field"
                                                style={{ width: 'auto', fontSize: '0.8125rem' }}
                                                defaultValue=""
                                                onChange={e => {
                                                    if (e.target.value) {
                                                        handleRollback(p.layout_id, e.target.value)
                                                        e.target.value = ''
                                                    }
                                                }}
                                            >
                                                <option value="">Choose bundle…</option>
                                                {bundles.filter(b => b.id !== p.bundle_id).map(b => (
                                                    <option key={b.id} value={b.id}>{b.version}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Bundles list */}
            <div>
                <h2 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Package size={16} color="#7a8aff" />
                    All Bundles
                </h2>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : bundles.length === 0 ? (
                    <div className="empty-state">
                        <Package size={40} />
                        <h3>No bundles yet</h3>
                        <p>Create a bundle version (e.g., v1, v2) to start publishing content.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {bundles.map(b => (
                            <div key={b.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <button
                                    onClick={() => toggleBundle(b.id)}
                                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}
                                >
                                    {expandedBundle === b.id ? <ChevronDown size={16} color="#64748b" /> : <ChevronRight size={16} color="#64748b" />}
                                    <span className="badge badge-blue" style={{ fontSize: '0.875rem', fontWeight: 700 }}>{b.version}</span>
                                    {b.notes && <span style={{ color: '#94a3b8', fontSize: '0.875rem', flex: 1 }}>{b.notes}</span>}
                                    <span style={{ color: '#475569', fontSize: '0.75rem', marginLeft: 'auto' }}>{new Date(b.created_at).toLocaleDateString()}</span>
                                </button>
                                {expandedBundle === b.id && (
                                    <div style={{ borderTop: '1px solid #1e293b', padding: '1rem 1.25rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                                            Included Media Files ({(bundleFiles[b.id] || []).length})
                                        </div>
                                        {!bundleFiles[b.id] ? (
                                            <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading…</div>
                                        ) : bundleFiles[b.id].length === 0 ? (
                                            <div style={{ color: '#475569', fontSize: '0.875rem' }}>No media files in this bundle.</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {bundleFiles[b.id].map(f => (
                                                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', background: '#0f172a', borderRadius: 6, fontSize: '0.8125rem' }}>
                                                        <span style={{ color: '#f1f5f9', flex: 1 }}>{f.media?.name}</span>
                                                        <span className="badge badge-gray">{f.media?.type}</span>
                                                        <span style={{ color: '#64748b' }}>{formatBytes(f.media?.bytes)}</span>
                                                        {f.media?.checksum_sha256 && (
                                                            <span style={{ fontFamily: 'monospace', color: '#475569', fontSize: '0.75rem' }}>{f.media.checksum_sha256.substring(0, 8)}…</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* New Bundle Modal */}
            {showBundleModal && (
                <Modal title="Create New Bundle" onClose={() => setShowBundleModal(false)}>
                    <form onSubmit={handleCreateBundle}>
                        <div className="form-group">
                            <label className="label">Version * (e.g., v1, v2.3, 2026-02-23)</label>
                            <input className="input-field" value={bundleForm.version} onChange={e => setBundleForm(f => ({ ...f, version: e.target.value }))} placeholder="v1" />
                        </div>
                        <div className="form-group">
                            <label className="label">Release Notes</label>
                            <textarea className="input-field" rows={3} value={bundleForm.notes} onChange={e => setBundleForm(f => ({ ...f, notes: e.target.value }))} placeholder="What's in this bundle..." />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowBundleModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Creating…' : 'Create Bundle'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Publish Layout Modal */}
            {showPublishModal && (
                <Modal title="Publish Layout to Bundle" onClose={() => setShowPublishModal(false)}>
                    <form onSubmit={handlePublishLayout}>
                        <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: 0 }}>
                            This will link the layout to the bundle and auto-collect all required media files.
                        </p>
                        <div className="form-group">
                            <label className="label">Layout *</label>
                            <select className="input-field" value={publishForm.layout_id} onChange={e => setPublishForm(f => ({ ...f, layout_id: e.target.value }))}>
                                <option value="">— Select Layout —</option>
                                {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="label">Bundle *</label>
                            <select className="input-field" value={publishForm.bundle_id} onChange={e => setPublishForm(f => ({ ...f, bundle_id: e.target.value }))}>
                                <option value="">— Select Bundle —</option>
                                {bundles.map(b => <option key={b.id} value={b.id}>{b.version}{b.notes ? ` — ${b.notes}` : ''}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowPublishModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={publishing}>
                                {publishing && <Loader2 size={14} />}
                                {publishing ? 'Publishing…' : 'Publish Layout'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}
