import React from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Moon, Sun, Bell, Check, Plus } from 'lucide-react'
import Sidebar from './Sidebar'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTenant } from '../../contexts/TenantContext'
import { ChevronDown, MapPin, Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface TenantSettings {
    name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
}
export default function AdminLayout() {
    const navigate = useNavigate()
    const { theme, toggleTheme } = useTheme()
    const { user } = useAuth()
    const { currentTenant, tenants, switchTenant, loading: tenantLoading } = useTenant()
    const currentTenantId = currentTenant?.id
    const [tenant, setTenant] = React.useState<TenantSettings | null>(null)
    const [showSwitcher, setShowSwitcher] = React.useState(false)

    React.useEffect(() => {
        console.log('[AdminLayout] Current Tenant:', currentTenant, 'Loading:', tenantLoading)
        if (currentTenant) {
            setTenant({
                name: currentTenant.name || 'OmniPush',
                logo_url: currentTenant.settings?.logo_url || 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                primary_color: currentTenant.settings?.primary_color || '#ef4444',
                secondary_color: currentTenant.settings?.secondary_color || '#991b1b'
            })
        } else if (!tenantLoading) {
            // If not loading and no tenant found, use default fallback name
            setTenant({
                name: 'System Root',
                logo_url: 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                primary_color: '#ef4444',
                secondary_color: '#991b1b'
            })
        }
    }, [currentTenant, tenantLoading])

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
                        --color-surface-900: color-mix(in srgb, ${tenant.primary_color} 5%, #131b2e);
                        --color-surface-950: color-mix(in srgb, ${tenant.primary_color} 7%, #0a0f1d);
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
                            fontSize: '1.25rem',
                            fontWeight: 900,
                            color: tenant?.primary_color || '#ef4444',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            display: 'inline-block',
                            textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            SMART RETAIL DISPLAY
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {/* Multi-Tenant Switcher (Redesigned) */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowSwitcher(!showSwitcher)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.875rem',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    padding: '0.625rem 1rem',
                                    borderRadius: '12px',
                                    marginRight: '0.5rem',
                                    cursor: 'pointer', outline: 'none',
                                    transition: 'all 0.2s ease',
                                    paddingRight: '1.25rem'
                                }}
                            >
                                <div style={{
                                    width: 36, height: 36, borderRadius: '10px',
                                    background: 'white', border: '2px solid #1e293b',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    padding: '5px', overflow: 'hidden',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                }}>
                                    <img
                                        src={tenant?.logo_url || "https://i.ibb.co/vzB7K8N/apache-pizza-logo.png"}
                                        alt={tenant?.name || "Tenant"}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active Instance</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem' }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
                                            {tenant?.name || 'Loading...'}
                                        </span>
                                        <ChevronDown size={14} color="#6366f1" />
                                    </div>
                                </div>
                            </button>

                            {showSwitcher && (
                                <>
                                    <div
                                        onClick={() => setShowSwitcher(false)}
                                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                    />
                                    <div style={{
                                        position: 'absolute', top: '120%', right: 0, width: 280,
                                        background: '#0f172a', border: '1px solid #1e293b',
                                        borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                        zIndex: 50, overflow: 'hidden'
                                    }}>
                                        <div style={{ padding: '1rem', borderBottom: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Switch Organization</div>
                                        </div>
                                        <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0.5rem' }}>
                                            {tenants.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => { switchTenant(t.id); setShowSwitcher(false); }}
                                                    style={{
                                                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                        padding: '0.75rem', background: t.id === currentTenantId ? 'rgba(99,102,241,0.1)' : 'transparent',
                                                        border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                                                        color: t.id === currentTenantId ? '#a5b4fc' : '#94a3b8',
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: 24, height: 24, borderRadius: 6,
                                                        background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        padding: 3, flexShrink: 0
                                                    }}>
                                                        <Building2 size={14} color="#1e293b" />
                                                    </div>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                                        {t.id === currentTenantId && <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6366f1' }}>Current Active</div>}
                                                    </div>
                                                    {t.id === currentTenantId && <Check size={14} color="#6366f1" />}
                                                </button>
                                            ))}
                                        </div>
                                        <div style={{ padding: '0.5rem', borderTop: '1px solid #1e293b', background: 'rgba(255,255,255,0.01)' }}>
                                            <button
                                                onClick={() => { navigate('/admin/global'); setShowSwitcher(false); }}
                                                style={{
                                                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                    padding: '0.75rem', background: 'rgba(255,255,255,0.03)',
                                                    border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 10, cursor: 'pointer',
                                                    color: '#f1f5f9', fontWeight: 600, fontSize: '0.8125rem'
                                                }}
                                            >
                                                <div style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Plus size={14} color="#818cf8" />
                                                </div>
                                                Manage All Tenants
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
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
                    </div>
                </header>
                <main className="page-content fade-in">
                    <Outlet />
                </main>
            </div >
        </div >
    )
}
