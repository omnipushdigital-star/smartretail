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
    { icon: <LayoutDashboard size={18} />, label: 'Dashboard', path: '/admin/dashboard' },

    { type: 'header', label: 'Infrastructure' },
    { icon: <Store size={18} />, label: 'Stores', path: '/admin/stores' },
    { icon: <Shield size={18} />, label: 'Display Roles', path: '/admin/roles' },
    { icon: <Settings size={18} />, label: 'Devices', path: '/admin/devices' },

    { type: 'header', label: 'Content' },
    { icon: <FileVideo size={18} />, label: 'Media Library', path: '/admin/media' },
    { icon: <ListVideo size={18} />, label: 'Playlists', path: '/admin/playlists' },
    { icon: <Layout size={18} />, label: 'Menu Builder', path: '/admin/menu-builder' },

    { type: 'header', label: 'Design' },
    { icon: <LayoutTemplate size={18} />, label: 'Layout Templates', path: '/admin/layout-templates' },
    { icon: <Layers size={18} />, label: 'Layouts', path: '/admin/layouts' },

    { type: 'header', label: 'Planning' },
    { icon: <Calendar size={18} />, label: 'Scheduling', path: '/admin/scheduling' },
    { icon: <CalendarRange size={18} />, label: 'Rules & Scheduling', path: '/admin/rules' },

    { type: 'header', label: 'Distribution' },
    { icon: <Maximize size={18} />, label: 'Publish', path: '/admin/publish' },
    { icon: <Package size={18} />, label: 'Bundles', path: '/admin/bundles' },

    { type: 'header', label: 'Operations' },
    { icon: <Activity size={18} />, label: 'Monitoring', path: '/admin/monitoring' },

    { type: 'header', label: 'System Admin' },
    { icon: <Building2 size={18} />, label: 'Tenant Branding', path: '/admin/branding' },
    { icon: <Globe size={18} />, label: 'Global Management', path: '/admin/global' },
    { icon: <Database size={18} />, label: 'DB Migration', path: '/admin/db-migration' },
    { icon: <Download size={18} />, label: 'App Updates', path: '/admin/app-updates' },
    { icon: <Zap size={18} />, label: 'Edge Functions', path: '/admin/edge-functions' },
    { icon: <Shield size={18} />, label: 'RLS Setup', path: '/admin/rls-setup' },
]

export default function Sidebar() {
    const { signOut } = useAuth()
    const location = useLocation()

    return (
        <aside className="w-64 min-w-64 bg-surface-1 border-r border-border h-screen sticky top-0 z-40 flex flex-col overflow-y-auto overflow-x-hidden">
            {/* Logo */}
            <div className="flex items-center justify-center p-4 min-h-[72px] border-b border-border shrink-0">
                <img
                    src="/assets/omnipush-logo.png"
                    alt="OmniPush Logo"
                    className="h-12 w-full object-contain"
                />
            </div>

            {/* Navigation */}
            <div className="p-3 flex-1">
                <nav>
                    {navItems.map((item, idx) => {
                        if (item.type === 'header') {
                            return (
                                <div key={`header-${idx}`} className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-text-2 px-3.5 pt-6 pb-2 opacity-90">
                                    {item.label}
                                </div>
                            )
                        }

                        const isActive = item.path ? location.pathname === item.path : false

                        return (
                            <NavLink
                                key={item.path || `nav-${idx}`}
                                to={item.path || '#'}
                                isActive={isActive}
                                label={item.label}
                                icon={item.icon}
                            />
                        )
                    })}
                </nav>
            </div>

            {/* Logout */}
            <div className="p-4 border-t border-border shrink-0 bg-surface-1">
                <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-text-2 hover:bg-error/10 hover:text-error transition-all duration-150 outline-none"
                >
                    <LogOut size={18} />
                    Logout
                </button>
            </div>
        </aside>
    )
}

function NavLink({ to, isActive, label, icon }: { to: string, isActive: boolean, label?: string, icon?: React.ReactNode }) {
    return (
        <Link
            to={to}
            className={`
                flex items-center gap-3 px-3.5 py-2 my-px rounded-lg text-sm transition-all duration-150 outline-none group
                border-l-4 
                ${isActive 
                    ? 'bg-brand-500/10 text-brand-500 font-semibold border-brand-500' 
                    : 'text-text-2 border-transparent hover:bg-surface-300 hover:text-text-1 hover:border-transparent'}
            `}
        >
            <span className={`shrink-0 transition-colors duration-150 ${isActive ? 'text-brand-500' : 'text-text-3 group-hover:text-brand-500'}`}>
                {icon}
            </span>
            {label}
            {isActive && <ChevronRight size={13} className="ml-auto opacity-40" />}
        </Link>
    )
}
