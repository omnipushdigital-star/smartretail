import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Store, Users, Monitor, Image, ListVideo,
    LayoutTemplate, Layout, CalendarRange, Upload, Activity,
    LogOut, ChevronRight, Database, Zap, Shield, Package, Building2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', to: '/admin/dashboard' },
    { icon: Store, label: 'Stores', to: '/admin/stores' },
    { icon: Users, label: 'Roles', to: '/admin/roles' },
    { icon: Monitor, label: 'Devices', to: '/admin/devices' },
    { icon: Building2, label: 'Onboarding', to: '/admin/onboarding' },
    { icon: Image, label: 'Media Library', to: '/admin/media' },
    { icon: ListVideo, label: 'Playlists', to: '/admin/playlists' },
    { icon: LayoutTemplate, label: 'Layout Templates', to: '/admin/layout-templates' },
    { icon: Layout, label: 'Layouts', to: '/admin/layouts' },
    { icon: CalendarRange, label: 'Rules & Scheduling', to: '/admin/rules' },
    { icon: Upload, label: 'Publish', to: '/admin/publish' },
    { icon: Package, label: 'Bundles', to: '/admin/bundles' },
    { icon: Activity, label: 'Monitoring', to: '/admin/monitoring' },
    { icon: Database, label: 'DB Migration', to: '/admin/db-migration' },
    { icon: Zap, label: 'Edge Functions', to: '/admin/edge-functions' },
    { icon: Shield, label: 'RLS Setup', to: '/admin/rls-setup' },
]

export default function Sidebar() {
    const { user, signOut } = useAuth()
    const navigate = useNavigate()

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
    }

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div style={{ padding: '1rem 1rem 0.875rem', borderBottom: '1px solid #1e293b' }}>
                <img
                    src="/logo.png"
                    alt="OmniPush"
                    style={{ height: 40, width: 'auto', display: 'block', objectFit: 'contain' }}
                />
            </div>

            {/* Navigation */}
            <nav style={{ flex: 1, padding: '0.75rem 0', overflow: 'auto' }}>
                <div style={{ padding: '0 0.75rem 0.375rem', fontSize: '0.6875rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    CMS Administration
                </div>
                {navItems.map(({ icon: Icon, label, to }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                        <Icon size={16} />
                        <span style={{ flex: 1 }}>{label}</span>
                        <ChevronRight size={12} style={{ opacity: 0.4 }} />
                    </NavLink>
                ))}
            </nav>

            {/* User section */}
            <div style={{ padding: '0.75rem', borderTop: '1px solid #1e293b' }}>
                <div style={{ padding: '0.75rem', borderRadius: 8, background: 'rgba(90,100,246,0.05)', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#f1f5f9', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user?.email}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Administrator</div>
                </div>
                <button
                    onClick={handleSignOut}
                    className="btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                >
                    <LogOut size={14} />
                    Sign Out
                </button>
            </div>
        </aside>
    )
}
