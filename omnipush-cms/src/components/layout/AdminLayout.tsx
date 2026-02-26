import React from 'react'
import { Outlet } from 'react-router-dom'
import { Moon, Sun, Bell } from 'lucide-react'
import Sidebar from './Sidebar'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'

interface TenantSettings {
    name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
}

export default function AdminLayout() {
    const { theme, toggleTheme } = useTheme()
    const { user } = useAuth()
    const [tenant, setTenant] = React.useState<TenantSettings | null>(null)

    React.useEffect(() => {
        fetchTenantBranding()
    }, [])

    function hexToRgb(hex: string) {
        if (!hex || typeof hex !== 'string') return '239, 68, 68'
        let h = hex.replace('#', '')
        if (h.length === 3) h = h.split('').map(c => c + c).join('')
        if (h.length !== 6) return '239, 68, 68'

        const r = parseInt(h.slice(0, 2), 16)
        const g = parseInt(h.slice(2, 4), 16)
        const b = parseInt(h.slice(4, 6), 16)
        return `${r}, ${g}, ${b}`
    }

    async function fetchTenantBranding() {
        try {
            console.log('Fetching branding for tenant:', DEFAULT_TENANT_ID)
            const { data, error } = await supabase
                .from('tenants')
                .select('name, settings')
                .eq('id', DEFAULT_TENANT_ID)
                .single()

            if (error) {
                console.warn('Tenant branding fetch error:', error)
                return
            }

            if (data) {
                setTenant({
                    name: data.name || 'OmniPush',
                    logo_url: data.settings?.logo_url || 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                    primary_color: data.settings?.primary_color || '#ef4444',
                    secondary_color: data.settings?.secondary_color || '#991b1b'
                })
            }
        } catch (err) {
            console.error('Error loading branding:', err)
        }
    }

    return (
        <div style={{ display: 'flex' }}>
            {/* Dynamic CSS Overrides for Tenant Branding */}
            {tenant && (
                <style dangerouslySetInnerHTML={{
                    __html: `
                    :root {
                        --color-brand-500: ${tenant.primary_color};
                        --color-brand-500-rgb: ${hexToRgb(tenant.primary_color)};
                        --color-brand-600: ${tenant.secondary_color};
                        --color-brand-400: ${tenant.primary_color}dd;
                        --color-brand-300: ${tenant.primary_color}aa;
                        
                        /* Automatically tinted background based on brand */
                        --color-surface-900: color-mix(in srgb, ${tenant.primary_color} 5%, #0f172a);
                        --color-surface-950: color-mix(in srgb, ${tenant.primary_color} 7%, #020617);
                    }
                    
                    body {
                        background-color: var(--color-surface-950) !important;
                    }
                    .main-content, .sidebar, .topbar {
                        background-color: var(--color-surface-950) !important;
                    }
                    .card, .modal-box, .stat-card {
                        background-color: var(--color-surface-900) !important;
                    }
                `}} />
            )}

            <Sidebar />
            <div className="main-content" style={{ flex: 1 }}>
                {/* Top bar */}
                <header className="topbar">
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <span style={{
                            fontSize: '1.125rem',
                            fontWeight: 800,
                            background: `linear-gradient(90deg, ${tenant?.primary_color || '#ef4444'}, ${tenant?.secondary_color || '#f97316'})`,
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            color: 'transparent',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            display: 'inline-block'
                        }}>
                            OMNIPUSH SMART RETAIL DISPLAY
                        </span>
                        <span style={{ margin: '0 0.75rem', color: '#1e293b', fontSize: '1.25rem', fontWeight: 300 }}>|</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '6px',
                                background: 'white', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                padding: '3px', overflow: 'hidden',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <img
                                    src={tenant?.logo_url || "https://i.ibb.co/vzB7K8N/apache-pizza-logo.png"}
                                    alt={tenant?.name || "Tenant"}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    onError={(e) => {
                                        const parent = e.currentTarget.parentElement;
                                        if (parent) {
                                            parent.innerHTML = `<span style="color: ${tenant?.primary_color || '#ef4444'}; font-size: 10px; font-weight: 900;">${tenant?.name?.substring(0, 2).toUpperCase() || 'AP'}</span>`;
                                        }
                                    }}
                                />
                            </div>
                            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
                                {tenant?.name || 'Apache Pizza'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={toggleTheme}
                        style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                    >
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <button
                        style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', position: 'relative' }}
                    >
                        <Bell size={16} />
                        <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: tenant?.primary_color || '#ef4444' }} />
                    </button>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${tenant?.primary_color || '#ef4444'}, ${tenant?.secondary_color || '#dc2626'})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 600, color: 'white'
                    }}>
                        {user?.email?.charAt(0).toUpperCase() || 'A'}
                    </div>
                </header>
                <main className="page-content fade-in">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
