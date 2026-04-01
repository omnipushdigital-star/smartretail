import React, { useEffect, useState } from 'react'
import { LayoutTemplate as LTIcon, Eye, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { LayoutTemplate } from '../../types'
import Modal from '../../components/ui/Modal'
import { useTenant } from '../../contexts/TenantContext'
import toast from 'react-hot-toast'

export default function LayoutTemplatesPage() {
    const { currentTenantId } = useTenant()
    const [templates, setTemplates] = useState<LayoutTemplate[]>([])
    const [loading, setLoading] = useState(true)
    const [preview, setPreview] = useState<LayoutTemplate | null>(null)

    const fetchTemplates = () => {
        setLoading(true)
        supabase.from('layout_templates').select('*').order('name').then(({ data }) => {
            setTemplates(data || [])
            setLoading(false)
        })
    }

    useEffect(() => {
        fetchTemplates()
    }, [])

    const seedSplitTemplate = async () => {
        if (!currentTenantId) {
            toast.error('No tenant selected')
            return
        }

        const splitTemplate = {
            tenant_id: currentTenantId,
            name: 'Split (70/30) - Pro',
            description: 'Custom split layout with 70% content and 30% side panel.',
            regions: [
                { id: 'main', x: 0, y: 0, width: 70, height: 100, label: 'Main Content' },
                { id: 'side', x: 70, y: 0, width: 30, height: 100, label: 'Side Panel' }
            ],
            is_default: false
        }

        const { error } = await supabase.from('layout_templates').insert([splitTemplate])
        if (error) {
            toast.error(`Fail: ${error.message}`)
        } else {
            toast.success('Split template created!')
            fetchTemplates()
        }
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Layout Templates</h1>
                    <p className="page-subtitle">Pre-built region layouts for your displays</p>
                </div>
                <button className="btn-primary" onClick={seedSplitTemplate}>
                    Add Split Template (Test)
                </button>
            </div>

            {/* Info banner */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'rgba(90,100,246,0.08)', border: '1px solid rgba(90,100,246,0.2)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.5rem' }}>
                <Info size={16} color="#7a8aff" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                    <strong>MVP: Full Screen only.</strong> Split-screen templates (30:70 pattern) will be added in a future release. The data model already supports multiple regions per template.
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading…</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {templates.map(t => (
                        <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{t.name}</div>
                                    {t.is_default && <span className="badge badge-blue" style={{ marginTop: '0.25rem' }}>Default</span>}
                                </div>
                                <div style={{ width: 48, height: 48, background: '#0f172a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #334155' }}>
                                    <LTIcon size={20} color="var(--color-brand-500)" />
                                </div>
                            </div>
                            {t.description && <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0 }}>{t.description}</p>}
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                <strong>{Array.isArray(t.regions) ? t.regions.length : 1}</strong> region{Array.isArray(t.regions) && t.regions.length > 1 ? 's' : ''}
                            </div>
                            <button className="btn-secondary" onClick={() => setPreview(t)} style={{ justifyContent: 'center', marginTop: 'auto' }}>
                                <Eye size={14} /> View Regions JSON
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {preview && (
                <Modal title={`Template: ${preview.name}`} onClose={() => setPreview(null)}>
                    <div style={{ marginBottom: '1rem' }}>
                        {/* Visual preview */}
                        <div style={{ background: '#0f172a', borderRadius: 8, padding: '1rem', marginBottom: '1rem', position: 'relative' }}>
                            <div style={{ width: '100%', paddingBottom: '56.25%', position: 'relative' }}>
                                {Array.isArray(preview.regions) && preview.regions.map((r: any) => (
                                    <div key={r.id} style={{
                                        position: 'absolute',
                                        left: `${r.x}%`, top: `${r.y}%`,
                                        width: `${r.width}%`, height: `${r.height}%`,
                                        background: 'rgba(90,100,246,0.15)',
                                        border: '1.5px dashed var(--color-brand-500)',
                                        borderRadius: 4,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.75rem', color: '#7a8aff', fontWeight: 500
                                    }}>
                                        {r.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="label">Regions JSON</div>
                        <pre style={{ background: '#0f172a', borderRadius: 8, padding: '1rem', overflow: 'auto', fontSize: '0.8125rem', color: '#94a3b8', margin: 0 }}>
                            {JSON.stringify(preview.regions, null, 2)}
                        </pre>
                    </div>
                </Modal>
            )}
        </div>
    )
}
