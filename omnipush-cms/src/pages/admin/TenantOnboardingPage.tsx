import React, { useState, useEffect, useRef } from 'react'
import { Building2, Save, Upload, Palette, Globe, ShieldCheck, Image as ImageIcon, Loader2 } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function TenantOnboardingPage() {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [tenantData, setTenantData] = useState({
        name: 'Apache Pizza',
        logo_url: 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
        primary_color: '#ef4444',
        secondary_color: '#991b1b',
        domain: 'apachepizza.ie',
        support_email: 'support@apachepizza.ie'
    })

    useEffect(() => {
        fetchTenantInfo()
    }, [])

    async function fetchTenantInfo() {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', DEFAULT_TENANT_ID)
                .single()

            if (data) {
                setTenantData({
                    name: data.name || 'Apache Pizza',
                    logo_url: data.settings?.logo_url || 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                    primary_color: data.settings?.primary_color || '#ef4444',
                    secondary_color: data.settings?.secondary_color || '#991b1b',
                    domain: data.settings?.domain || 'apachepizza.ie',
                    support_email: data.settings?.support_email || 'support@apachepizza.ie'
                })
            }
        } catch (error: any) {
            console.error('Error fetching tenant:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)

            // 1. Upload to Supabase Storage
            const fileExt = file.name.split('.').pop()
            const fileName = `${DEFAULT_TENANT_ID}/logo_${Date.now()}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('public')
                .upload(fileName, file, { upsert: true })

            if (uploadError) throw uploadError

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('public')
                .getPublicUrl(fileName)

            setTenantData(prev => ({ ...prev, logo_url: publicUrl }))

            // 3. Extract Color
            await extractColorsFromImage(publicUrl)

            toast.success('Logo uploaded and branding identified!')
        } catch (error: any) {
            console.error('Upload error:', error)
            toast.error('Failed to upload logo')
        } finally {
            setUploading(false)
        }
    }

    const extractColorsFromImage = (url: string): Promise<void> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.crossOrigin = "Anonymous"
            img.src = url
            img.onload = () => {
                const canvas = document.createElement('canvas')
                const ctx = canvas.getContext('2d')
                if (!ctx) return resolve()

                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
                const colorMap: Record<string, number> = {}

                // Sample pixels (every 10th for speed)
                for (let i = 0; i < imageData.length; i += 40) {
                    const r = imageData[i]
                    const g = imageData[i + 1]
                    const b = imageData[i + 2]
                    const a = imageData[i + 3]

                    if (a < 128) continue // Ignore transparent

                    // Simple luminance check to ignore extreme whites/blacks
                    const lum = (0.299 * r + 0.587 * g + 0.114 * b)
                    if (lum > 240 || lum < 15) continue

                    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
                    colorMap[hex] = (colorMap[hex] || 0) + 1
                }

                // Find most frequent color
                const sortedColors = Object.entries(colorMap).sort((a, b) => b[1] - a[1])
                if (sortedColors.length > 0) {
                    const primary = sortedColors[0][0]
                    // Use a slightly darker version for secondary or pick the 2nd dominant
                    const secondary = sortedColors.length > 1 ? sortedColors[1][0] : primary

                    setTenantData(prev => ({
                        ...prev,
                        primary_color: primary,
                        secondary_color: secondary
                    }))
                }
                resolve()
            }
            img.onerror = () => resolve()
        })
    }

    async function handleSave() {
        try {
            setSaving(true)
            const { error } = await supabase
                .from('tenants')
                .upsert({
                    id: DEFAULT_TENANT_ID,
                    name: tenantData.name,
                    settings: {
                        logo_url: tenantData.logo_url,
                        primary_color: tenantData.primary_color,
                        secondary_color: tenantData.secondary_color,
                        support_email: tenantData.support_email,
                        domain: tenantData.domain
                    },
                    updated_at: new Date().toISOString()
                })

            if (error) throw error
            toast.success('Branding updated successfully')
            setTimeout(() => window.location.reload(), 1000)
        } catch (error: any) {
            toast.error(error.message || 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-surface-400">Loading configurations...</div>
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Identity & Branding</h1>
                    <p className="page-subtitle">Personalize your CMS environment and network portal</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={handleSave}
                    disabled={saving || uploading}
                >
                    <Save size={18} />
                    {saving ? 'Applying...' : 'Apply Branding'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Logo & Theme Section */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Palette size={20} color={tenantData.primary_color} />
                        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Visual Branding</h2>
                    </div>

                    <div className="form-group">
                        <label className="label">Organization Logo</label>
                        <div style={{
                            border: '2px dashed #334155',
                            borderRadius: 12,
                            padding: '1.5rem',
                            textAlign: 'center',
                            background: 'rgba(30, 41, 59, 0.5)',
                            position: 'relative'
                        }}>
                            {uploading ? (
                                <div style={{ padding: '1rem' }}>
                                    <Loader2 className="animate-spin" size={32} color={tenantData.primary_color} style={{ margin: '0 auto' }} />
                                    <p style={{ marginTop: '0.5rem', color: '#64748b' }}>Analyzing Logo...</p>
                                </div>
                            ) : (
                                <>
                                    <div style={{ width: 80, height: 80, background: 'white', borderRadius: 12, margin: '0 auto 1rem', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                        <img src={tenantData.logo_url} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    </div>
                                    <button
                                        className="btn-secondary"
                                        style={{ margin: '0 auto' }}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        <Upload size={14} />
                                        Upload New Logo
                                    </button>
                                    <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.75rem' }}>
                                        Colors will be extracted automatically
                                    </p>
                                </>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept="image/*"
                                onChange={handleLogoUpload}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="label">Detected Primary</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ width: 42, height: 42, borderRadius: 8, background: tenantData.primary_color, border: '2px solid #334155' }} />
                                <input
                                    type="text"
                                    className="input-field"
                                    value={tenantData.primary_color}
                                    onChange={e => setTenantData({ ...tenantData, primary_color: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">Secondary Accent</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ width: 42, height: 42, borderRadius: 8, background: tenantData.secondary_color, border: '2px solid #334155' }} />
                                <input
                                    type="text"
                                    className="input-field"
                                    value={tenantData.secondary_color}
                                    onChange={e => setTenantData({ ...tenantData, secondary_color: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Settings Section */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Globe size={20} color={tenantData.primary_color} />
                        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Portal Identity</h2>
                    </div>

                    <div className="form-group">
                        <label className="label">Display Name</label>
                        <input
                            type="text"
                            className="input-field"
                            value={tenantData.name}
                            onChange={e => setTenantData({ ...tenantData, name: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Corporate Domain</label>
                        <input
                            type="text"
                            className="input-field"
                            value={tenantData.domain}
                            onChange={e => setTenantData({ ...tenantData, domain: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Support Email</label>
                        <input
                            type="email"
                            className="input-field"
                            value={tenantData.support_email}
                            onChange={e => setTenantData({ ...tenantData, support_email: e.target.value })}
                        />
                    </div>

                    <div style={{
                        marginTop: '1.5rem',
                        padding: '1rem',
                        background: `rgba(${parseInt(tenantData.primary_color.slice(1, 3), 16)}, ${parseInt(tenantData.primary_color.slice(3, 5), 16)}, ${parseInt(tenantData.primary_color.slice(5, 7), 16)}, 0.1)`,
                        border: `1px solid ${tenantData.primary_color}33`,
                        borderRadius: 12,
                        display: 'flex', gap: '0.75rem'
                    }}>
                        <ShieldCheck size={20} color={tenantData.primary_color} style={{ flexShrink: 0 }} />
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>
                            Theme synchronization is active. All dashboard elements will inherit the <strong>{tenantData.name}</strong> color profile once saved.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
