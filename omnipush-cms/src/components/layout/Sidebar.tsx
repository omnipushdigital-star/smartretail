import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
    LayoutDashboard, Store, Users, Monitor, Image, ListVideo,
    LayoutTemplate, Layout, CalendarRange, Upload, Activity,
    LogOut, ChevronRight, Database, Zap, Shield, Package, Building2,
    Settings, FileVideo, LayoutList, Layers, Calendar, Maximize, Palette, Globe, Download
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/admin/dashboard' },

    { type: 'header', label: 'Infrastructure' },
    { icon: <Store size={20} />, label: 'Stores', path: '/admin/stores' },
    { icon: <Shield size={20} />, label: 'Display Roles', path: '/admin/roles' },
    { icon: <Settings size={20} />, label: 'Devices', path: '/admin/devices' },

    { type: 'header', label: 'Content' },
    { icon: <FileVideo size={20} />, label: 'Media Library', path: '/admin/media' },
    { icon: <ListVideo size={20} />, label: 'Playlists', path: '/admin/playlists' },
    { icon: <Layout size={20} />, label: 'Menu Builder', path: '/admin/menu-builder' },

    { type: 'header', label: 'Design' },
    { icon: <LayoutTemplate size={20} />, label: 'Layout Templates', path: '/admin/layout-templates' },
    { icon: <Layers size={20} />, label: 'Layouts', path: '/admin/layouts' },

    { type: 'header', label: 'Planning' },
    { icon: <Calendar size={20} />, label: 'Scheduling', path: '/admin/scheduling' },
    { icon: <CalendarRange size={20} />, label: 'Rules & Scheduling', path: '/admin/rules' },

    { type: 'header', label: 'Distribution' },
    { icon: <Maximize size={20} />, label: 'Publish', path: '/admin/publish' },
    { icon: <Package size={20} />, label: 'Bundles', path: '/admin/bundles' },

    { type: 'header', label: 'Operations' },
    { icon: <Activity size={20} />, label: 'Monitoring', path: '/admin/monitoring' },

    { type: 'header', label: 'System Admin' },
    { icon: <Building2 size={20} />, label: 'Tenant Branding', path: '/admin/branding' },
    { icon: <Globe size={20} />, label: 'Global Management', path: '/admin/global' },
    { icon: <Database size={20} />, label: 'DB Migration', path: '/admin/db-migration' },
    { icon: <Download size={20} />, label: 'App Updates', path: '/admin/app-updates' },
    { icon: <Zap size={20} />, label: 'Edge Functions', path: '/admin/edge-functions' },
    { icon: <Shield size={20} />, label: 'RLS Setup', path: '/admin/rls-setup' },
]

export default function Sidebar() {
    const { signOut } = useAuth()
    const location = useLocation()

    return (
        <aside className="sidebar">
            <div className="flex items-center justify-center p-4 mb-4 border-b border-white/5" style={{ minHeight: '72px' }}>
                <img
                    src="/assets/omnipush-logo.png"
                    alt="OmniPush Logo"
                    className="h-10 w-auto object-contain px-2 opacity-80"
                />
            </div>
            <div className="p-4 pt-2">
                <nav className="space-y-1">
                    {navItems.map((item, idx) => {
                        if (item.type === 'header') {
                            return (
                                <div key={`header-${idx}`} style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                    color: 'rgba(255,255,255,0.3)',
                                    padding: '1.25rem 0.75rem 0.5rem 0.75rem'
                                }}>
                                    {item.label}
                                </div>
                            )
                        }
                        const isActive = item.path ? location.pathname === item.path : false
                        return (
                            <Link
                                key={item.path || `nav-${idx}`}
                                to={item.path || '#'}
                                className={`nav-item ${isActive ? 'active' : ''}`}
                                style={{
                                    position: 'relative',
                                    background: isActive ? 'rgba(var(--color-brand-500-rgb), 0.1)' : 'transparent',
                                    borderLeft: `3px solid ${isActive ? 'var(--color-brand-500)' : 'transparent'}`,
                                    paddingLeft: isActive ? '1.5rem' : '1rem',
                                    borderRadius: '0 8px 8px 0',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    color: isActive ? 'var(--color-brand-500)' : 'rgba(255,255,255,0.6)',
                                    boxShadow: isActive ? 'inset 10px 0 20px -10px rgba(var(--color-brand-500-rgb), 0.2)' : 'none'
                                }}
                            >
                                <span className="nav-icon" style={{
                                    color: isActive ? 'var(--color-brand-500)' : 'inherit',
                                    filter: isActive ? 'drop-shadow(0 0 5px rgba(var(--color-brand-500-rgb), 0.5))' : 'none'
                                }}>
                                    {item.icon}
                                </span>
                                {item.label}
                                {isActive && <ChevronRight size={14} className="ml-auto" style={{ opacity: 0.5 }} />}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="mt-auto p-6 border-t border-white/5">
                <button
                    onClick={() => signOut()}
                    className="nav-item-logout"
                >
                    <LogOut size={20} />
                    Logout
                </button>
            </div>
        </aside>
    )
}
