import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
    LayoutDashboard, Store, Users, Monitor, Image, ListVideo,
    LayoutTemplate, Layout, CalendarRange, Upload, Activity,
    LogOut, ChevronRight, Database, Zap, Shield, Package, Building2,
    Settings, FileVideo, LayoutList, Layers, Calendar, Maximize, Palette, Globe
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
    { icon: <LayoutDashboard size={20} />, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: <Store size={20} />, label: 'Stores', path: '/admin/stores' },
    { icon: <Shield size={20} />, label: 'Display Roles', path: '/admin/roles' },
    { icon: <Settings size={20} />, label: 'Devices', path: '/admin/devices' },
    { icon: <Building2 size={20} />, label: 'Tenant Branding', path: '/admin/branding' },
    { icon: <Globe size={20} />, label: 'Global Management', path: '/admin/global' },
    { icon: <FileVideo size={20} />, label: 'Media Library', path: '/admin/media' },
    { icon: <LayoutList size={20} />, label: 'Playlists', path: '/admin/playlists' },
    { icon: <LayoutTemplate size={20} />, label: 'Layout Templates', path: '/admin/layout-templates' },
    { icon: <Layers size={20} />, label: 'Layouts', path: '/admin/layouts' },
    { icon: <Layout size={20} />, label: 'Menu Builder', path: '/admin/menu-builder' },
    { icon: <Calendar size={20} />, label: 'Scheduling', path: '/admin/scheduling' },
    { icon: <CalendarRange size={20} />, label: 'Rules & Scheduling', path: '/admin/rules' },
    { icon: <Maximize size={20} />, label: 'Publish', path: '/admin/publish' },
    { icon: <Activity size={20} />, label: 'Monitoring', path: '/admin/monitoring' },
    { icon: <Package size={20} />, label: 'Bundles', path: '/admin/bundles' },
    { icon: <Database size={20} />, label: 'DB Migration', path: '/admin/db-migration' },
    { icon: <Zap size={20} />, label: 'Edge Functions', path: '/admin/edge-functions' },
    { icon: <Shield size={20} />, label: 'RLS Setup', path: '/admin/rls-setup' },
]

export default function Sidebar() {
    const { signOut } = useAuth()
    const location = useLocation()

    return (
        <aside className="sidebar">
            <div className="flex items-center justify-center p-2 mb-4 bg-white/5 border-b border-white/5">
                <img
                    src="/assets/omnipush-logo.png"
                    alt="OmniPush Logo"
                    className="h-16 w-full object-contain px-2"
                />
            </div>
            <div className="p-6 pt-2">

                <nav className="space-y-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all group ${isActive
                                    ? 'bg-brand-600/10 text-brand-400'
                                    : 'text-surface-400 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className={`${isActive ? 'text-brand-400' : 'text-surface-500 group-hover:text-surface-300'}`}>
                                    {item.icon}
                                </span>
                                {item.label}
                                {isActive && <ChevronRight size={14} className="ml-auto" />}
                            </Link>
                        )
                    })}
                </nav>
            </div>

            <div className="mt-auto p-6 border-t border-white/5">
                <button
                    onClick={() => signOut()}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-surface-400 hover:bg-red-500/10 hover:text-red-400 transition-all w-full"
                >
                    <LogOut size={20} />
                    Logout
                </button>
            </div>
        </aside>
    )
}
