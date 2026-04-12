import React from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Bell, Check, Plus, ChevronDown, MapPin, Building2, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
 
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
        <div className="flex min-h-screen bg-bg text-text-1 transition-colors duration-200">
            <Sidebar />
            <div className="main-content flex-1 min-w-0 overflow-auto flex flex-col min-h-screen bg-bg transition-colors duration-200">
                
                {/* Topbar */}
                <header className="topbar h-[72px] px-7 flex items-center justify-between gap-4 bg-bg/85 backdrop-blur-xl border-b border-border sticky top-0 z-50 shrink-0">
                    <div className="flex-1 flex items-center">
                        <span className="text-base font-black tracking-[0.2em] uppercase text-brand-500 drop-shadow-[0_0_8px_rgba(0,218,243,0.3)]">
                            SMART RETAIL DISPLAY
                        </span>
                        {(import.meta.env.VITE_APP_ENV !== 'production' || window.location.hostname.includes('smartretail-plum')) && (
                            <span className="ml-4 bg-brand-500/10 border border-brand-500 text-brand-500 text-[0.625rem] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                                Staging
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Multi-Tenant Switcher */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSwitcher(!showSwitcher)}
                                className="flex items-center gap-3 bg-surface-300/30 hover:bg-surface-300/50 border border-border px-4 py-2.5 rounded-xl mr-2 outline-none transition-all duration-200 pr-5"
                            >
                                <div className="w-9 h-9 rounded-xl bg-white border border-border flex items-center justify-center p-1.5 overflow-hidden shadow-lg shadow-black/10">
                                    <img
                                        src={tenant?.logo_url || "https://i.ibb.co/vzB7K8N/apache-pizza-logo.png"}
                                        alt={tenant?.name || "Tenant"}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <div className="text-left">
                                    <div className="text-[0.7rem] text-text-3 font-semibold tracking-wider uppercase">Active Instance</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-base font-extrabold text-text-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                                            {tenant?.name || 'Loading...'}
                                        </span>
                                        <ChevronDown size={14} color={tenant?.primary_color || "#00daf3"} />
                                    </div>
                                </div>
                            </button>

                            {showSwitcher && (
                                <>
                                    <div onClick={() => setShowSwitcher(false)} className="fixed inset-0 z-40" />
                                    <div className="absolute top-[120%] right-0 w-72 bg-surface-1 border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                                        <div className="p-4 border-b border-border bg-white/5">
                                            <div className="text-[0.7rem] text-text-3 font-extrabold uppercase tracking-widest">Switch Organization</div>
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto p-2">
                                            {tenants.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => { switchTenant(t.id); setShowSwitcher(false); }}
                                                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 text-left outline-none ${t.id === currentTenantId ? 'bg-brand-500/10 text-brand-500' : 'text-text-2 hover:bg-surface-300 hover:text-text-1'}`}
                                                >
                                                    <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center p-1 shrink-0 border border-border">
                                                        <Building2 size={14} className="text-surface-2" />
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <div className="text-sm font-semibold truncate">{t.name}</div>
                                                        {t.id === currentTenantId && <div className="text-[0.65rem] font-bold text-brand-500 mt-0.5">Current Active</div>}
                                                    </div>
                                                    {t.id === currentTenantId && <Check size={14} className="text-brand-500" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

 
 
 
 
 
 
 
 

                        {/* Notifications */}
                        <button
                            title="Notifications"
                            className="p-2.5 rounded-xl bg-surface-300/30 hover:bg-surface-300/50 border border-border text-text-2 hover:text-text-1 hover:-translate-y-0.5 transition-all outline-none relative"
                        >
                            <Bell size={18} />
                            <span className="absolute -top-[3px] -right-[3px] w-2.5 h-2.5 rounded-full bg-brand-500 border-2 border-surface-1 shadow-[0_0_10px_rgba(0,218,243,0.5)]" />
                        </button>

                        {/* User Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-black/15 outline-none hover:scale-105 transition-transform"
                                style={{ background: `linear-gradient(135deg, ${tenant?.primary_color || '#00daf3'}, ${tenant?.secondary_color || '#007e8c'})` }}
                            >
                                {user?.email?.charAt(0).toUpperCase() || 'A'}
                            </button>

                            {showUserMenu && (
                                <>
                                    <div onClick={() => setShowUserMenu(false)} className="fixed inset-0 z-40" />
                                    <div className="absolute top-[120%] right-0 w-56 bg-surface-1 border border-border rounded-xl shadow-2xl z-50 overflow-hidden p-2">
                                        <div className="p-3 border-b border-border mb-2">
                                            <div className="text-[0.75rem] text-text-3 font-semibold">Signed in as</div>
                                            <div className="text-sm font-bold text-text-1 truncate mt-0.5">
                                                {user?.email}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => signOut()}
                                            className="w-full flex items-center gap-3 p-3 rounded-lg text-sm font-semibold text-error hover:bg-error/10 transition-colors text-left outline-none"
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

                <main className="page-content fade-in relative flex-1">
                    <WorkflowBanner />
                    <div className="p-6">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    )
} 
