import React, { useState, useEffect } from 'react'
import { Building2, Save, Upload, Palette, Globe, ShieldCheck } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function TenantOnboardingPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
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

            if (error) {
                if (error.code === 'PGRST116') {
                    // Tenant doesn't exist, we'll use defaults
                    console.log('No tenant found, using defaults')
                } else {
                    throw error
                }
            }

            if (data) {
                setTenantData({
                    name: data.name || 'Apache Pizza',
                    logo_url: data.settings?.logo_url || 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                    primary_color: data.settings?.primary_color || '#ef4444',
                    secondary_color: data.settings?.secondary_color || '#991b1b',
                    domain: data.domain || 'apachepizza.ie',
                    support_email: data.settings?.support_email || 'support@apachepizza.ie'
                })
            }
        } catch (error: any) {
            console.error('Error fetching tenant:', error)
            toast.error('Failed to load tenant data')
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        try {
            setSaving(true)
            const { error } = await supabase
                .from('tenants')
                .upsert({
                    id: DEFAULT_TENANT_ID,
                    name: tenantData.name,
                    domain: tenantData.domain,
                    settings: {
                        logo_url: tenantData.logo_url,
                        primary_color: tenantData.primary_color,
                        secondary_color: tenantData.secondary_color,
                        support_email: tenantData.support_email
                    },
                    updated_at: new Date().toISOString()
                })

            if (error) throw error
            toast.success('Tenant settings saved successfully')
            // Refresh to apply changes if they were dynamic
            window.location.reload()
        } catch (error: any) {
            console.error('Error saving tenant:', error)
            toast.error(error.message || 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-surface-400">Loading tenant configuration...</div>
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Tenant Onboarding & Branding</h1>
                    <p className="page-subtitle">Configure your organization identity and system-wide styles</p>
                </div>
                <button
                    className="btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Visual Identity */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Palette size={20} color="#ef4444" />
                        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Visual Identity</h2>
                    </div>

                    <div className="form-group">
                        <label className="label">Tenant Name</label>
                        <input
                            type="text"
                            className="input-field"
                            value={tenantData.name}
                            onChange={e => setTenantData({ ...tenantData, name: e.target.value })}
                            placeholder="e.g. Apache Pizza"
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Logo URL</label>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <input
                                type="text"
                                className="input-field"
                                value={tenantData.logo_url}
                                onChange={e => setTenantData({ ...tenantData, logo_url: e.target.value })}
                                placeholder="https://example.com/logo.png"
                            />
                            <div style={{ width: 42, height: 42, background: 'white', borderRadius: 8, padding: 4, flexShrink: 0, border: '1px solid #334155' }}>
                                <img src={tenantData.logo_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </div>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="label">Primary Color</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="color"
                                    style={{ width: 42, height: 42, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                                    value={tenantData.primary_color}
                                    onChange={e => setTenantData({ ...tenantData, primary_color: e.target.value })}
                                />
                                <input
                                    type="text"
                                    className="input-field"
                                    value={tenantData.primary_color}
                                    onChange={e => setTenantData({ ...tenantData, primary_color: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">Secondary Color</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="color"
                                    style={{ width: 42, height: 42, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                                    value={tenantData.secondary_color}
                                    onChange={e => setTenantData({ ...tenantData, secondary_color: e.target.value })}
                                />
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

                {/* Organization Details */}
                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Globe size={20} color="#ef4444" />
                        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>System Settings</h2>
                    </div>

                    <div className="form-group">
                        <label className="label">Organization Domain</label>
                        <input
                            type="text"
                            className="input-field"
                            value={tenantData.domain}
                            onChange={e => setTenantData({ ...tenantData, domain: e.target.value })}
                            placeholder="apachepizza.ie"
                        />
                    </div>

                    <div className="form-group">
                        <label className="label">Support Email</label>
                        <input
                            type="email"
                            className="input-field"
                            value={tenantData.support_email}
                            onChange={e => setTenantData({ ...tenantData, support_email: e.target.value })}
                            placeholder="support@apachepizza.ie"
                        />
                    </div>

                    <div style={{
                        marginTop: '2rem',
                        padding: '1rem',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem'
                    }}>
                        <ShieldCheck size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                            <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '0.875rem' }}>Tenant Isolation Active</div>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>
                                All data uploaded to this CMS is automatically tagged and isolated for the <strong>{tenantData.name}</strong> organization.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
