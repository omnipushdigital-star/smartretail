import React from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Moon, Sun, Bell, Check, Plus, ChevronDown, MapPin, Building2, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useTenant } from '../../contexts/TenantContext'
import { supabase } from '../../lib/supabase'
import WorkflowBanner from './WorkflowBanner'

interface TenantSettings {
    name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
}

export default function AdminLayout() {
    const navigate = useNavigate()
    const { theme, toggleTheme } = useTheme()
    const { user, signOut } = useAuth()
    const { currentTenant, tenants, switchTenant, loading: tenantLoading } = useTenant()
    const currentTenantId = currentTenant?.id
    const [tenant, setTenant] = React.useState<TenantSettings | null>(null)
    const [showSwitcher, setShowSwitcher] = React.useState(false)
    const [showUserMenu, setShowUserMenu] = React.useState(false)

    React.useEffect(() => {
        console.log('[AdminLayout] Current Tenant:', currentTenant, 'Loading:', tenantLoading)
        if (currentTenant) {
            setTenant({
                name: currentTenant.name || 'OmniPush',
                logo_url: currentTenant.settings?.logo_url || 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                primary_color: currentTenant.settings?.primary_color || '#00daf3',
                secondary_color: currentTenant.settings?.secondary_color || '#007e8c'
            })
        } else if (!tenantLoading) {
            // If not loading and no tenant found, use default fallback name
            setTenant({
                name: 'System Root',
                logo_url: 'https://i.ibb.co/vzB7K8N/apache-pizza-logo.png',
                primary_color: '#00daf3',
                secondary_color: '#007e8c'
            })
        }
    }, [currentTenant, tenantLoading])

    function hexToRgb(hex: string) {
        if (!hex || typeof hex !== 'string') return '0, 218, 243'
        let h = hex.replace('#', '')
        if (h.length === 3) h = h.split('').map(c => c + c).join('')
        if (h.length !== 6) return '0, 218, 243'

        const r = parseInt(h.slice(0, 2), 16)
        const g = parseInt(h.slice(2, 4), 16)
        const b = parseInt(h.slice(4, 6), 16)
        return `${r}, ${g}, ${b}`
    }


    return (
        <div style={{ display: 'flex' }}>
            {/* Dynamic CSS Overrides for Tenant Branding with Theme Awareness */}
            {tenant && (
                <style dangerouslySetInnerHTML={{
                    __html: `
                    :root {
                        --color-brand-500: ${tenant.primary_color};
                        --color-brand-500-rgb: ${hexToRgb(tenant.primary_color)};
                        --color-brand-600: ${tenant.secondary_color};
                        --color-brand-400: ${tenant.primary_color}dd;
                        --color-brand-300: ${tenant.primary_color}aa;
                        
                        /* Automatically tinted backgrounds based on theme */
                        --color-surface-900: ${theme === 'dark'
                            ? `color-mix(in srgb, ${tenant.primary_color} 5%, #131b2e)`
                            : `#ffffff`};
                        --color-surface-950: ${theme === 'dark'
                            ? `color-mix(in srgb, ${tenant.primary_color} 7%, #0a0f1d)`
                            : `#f8fafc`};
                    }
                    
                    body {
                        background-color: var(--color-surface-950);
                        transition: background-color 0.3s ease;
                    }

                    .main-content, .sidebar, .topbar {
                        background-color: var(--color-surface-950);
                    }

                    .card, .modal-box, .stat-card {
                        background-color: var(--color-surface-900);
                    }

                    /* Topbar button refinement */
                    .topbar button {
                        border-color: ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'} !important;
                        color: ${theme === 'dark' ? '#94a3b8' : '#64748b'} !important;
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
                            color: tenant?.primary_color || '#00daf3',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            display: 'inline-block',
                            textShadow: theme === 'dark' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                        }}>
                            SMART RETAIL DISPLAY
                        </span>
                        {(import.meta.env.VITE_APP_ENV !== 'production' || window.location.hostname.includes('smartretail-plum')) && (
                            <span style={{
                                marginLeft: '1rem',
                                background: 'rgba(var(--color-brand-rgb), 0.1)',
                                border: '1px solid var(--color-brand-500)',
                                color: 'var(--color-brand-500)',
                                fontSize: '0.625rem',
                                padding: '2px 8px',
                                borderRadius: '100px',
                                fontWeight: 900,
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                            }}>
                                Staging
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {/* Multi-Tenant Switcher (Redesigned) */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowSwitcher(!showSwitcher)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.875rem',
                                    background: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                    border: '1px solid currentColor',
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
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                }}>
                                    <img
                                        src={tenant?.logo_url || "https://i.ibb.co/vzB7K8N/apache-pizza-logo.png"}
                                        alt={tenant?.name || "Tenant"}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.7rem', color: theme === 'dark' ? '#94a3b8' : '#64748b', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Active Instance</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem' }}>
                                        <span style={{ fontSize: '1rem', fontWeight: 800, color: theme === 'dark' ? '#f1f5f9' : '#1e1e2d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {tenant?.name || 'Loading...'}
                                        </span>
                                        <ChevronDown size={14} color={tenant?.primary_color || "#00daf3"} />
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
                                        background: theme === 'dark' ? '#0f172a' : '#ffffff',
                                        border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
                                        borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                                        zIndex: 50, overflow: 'hidden'
                                    }}>
                                        <div style={{ padding: '1rem', borderBottom: `1px solid ${theme === 'dark' ? '#1e293b' : '#f1f5f9'}`, background: 'rgba(255,255,255,0.02)' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Switch Organization</div>
                                        </div>
                                        <div style={{ maxHeight: 300, overflowY: 'auto', padding: '0.5rem' }}>
                                            {tenants.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => { switchTenant(t.id); setShowSwitcher(false); }}
                                                    style={{
                                                        width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                        padding: '0.75rem',
                                                        background: t.id === currentTenantId
                                                            ? 'rgba(var(--color-brand-rgb), 0.1)'
                                                            : 'transparent',
                                                        border: 'none', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                                                        color: t.id === currentTenantId
                                                            ? 'var(--color-brand-500)'
                                                            : (theme === 'dark' ? '#94a3b8' : '#475569'),
                                                        textAlign: 'left'
                                                    }}
                                                >
                                                    <div style={{
                                                        width: 24, height: 24, borderRadius: 6,
                                                        background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        padding: 3, flexShrink: 0, border: '1px solid #e2e8f0'
                                                    }}>
                                                        <Building2 size={14} color="#1e293b" />
                                                    </div>
                                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                                        {t.id === currentTenantId && <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-brand-500)' }}>Current Active</div>}
                                                    </div>
                                                    {t.id === currentTenantId && <Check size={14} color="var(--color-brand-500)" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <button
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            style={{ background: 'none', border: '1px solid currentColor', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>

                        <button
                            title="Notifications"
                            style={{ background: 'none', border: '1px solid currentColor', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', display: 'flex', alignItems: 'center', position: 'relative' }}
                        >
                            <Bell size={16} />
                            <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: tenant?.primary_color || '#00daf3' }} />
                        </button>

                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${tenant?.primary_color || '#00daf3'}, ${tenant?.secondary_color || '#007e8c'})`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.85rem', fontWeight: 700, color: 'white',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    border: 'none', cursor: 'pointer', outline: 'none',
                                    transition: 'transform 0.2s', padding: 0
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                {user?.email?.charAt(0).toUpperCase() || 'A'}
                            </button>

                            {showUserMenu && (
                                <>
                                    <div
                                        onClick={() => setShowUserMenu(false)}
                                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                    />
                                    <div style={{
                                        position: 'absolute', top: '120%', right: 0, width: 220,
                                        background: theme === 'dark' ? '#0f172a' : '#ffffff',
                                        border: `1px solid ${theme === 'dark' ? '#1e293b' : '#e2e8f0'}`,
                                        borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                                        zIndex: 50, overflow: 'hidden', padding: '0.5rem'
                                    }}>
                                        <div style={{ padding: '0.75rem', borderBottom: `1px solid ${theme === 'dark' ? '#1e293b' : '#f1f5f9'}`, marginBottom: '0.5rem' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Signed in as</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: theme === 'dark' ? '#f1f5f9' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {user?.email}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => signOut()}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                padding: '0.75rem', background: 'transparent',
                                                border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s',
                                                color: '#ef4444', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = theme === 'dark' ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <LogOut size={16} />
                                            Log Out
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>
                <main className="page-content fade-in relative">
                    <WorkflowBanner />
                    <div className="p-6">
                        <Outlet />
                    </div>
                </main>
            </div >
        </div >
    )
}
