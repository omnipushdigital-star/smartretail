import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
    LayoutDashboard, Store, Users, Monitor, Image, ListVideo,
    LayoutTemplate, Layout, CalendarRange, Upload, Activity,
    LogOut, ChevronRight, Database, Zap, Shield, Package, Building2,
    Settings, FileVideo, LayoutList, Layers, Calendar, Maximize, Palette, Globe, Download
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

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
    const { theme } = useTheme()
    const location = useLocation()
    const isDark = theme === 'dark'

    // ── Design tokens ─────────────────────────────────────────────────────────
    const sidebarBg = isDark ? '#0f172a' : '#ffffff'
    const borderColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,218,243,0.1)'
    const headerColor = isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8'
    const itemColor = isDark ? 'rgba(255,255,255,0.65)' : '#475569'
    const itemHoverBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,218,243,0.06)'
    const itemHoverColor = isDark ? '#ffffff' : '#0f172a'
    const iconColor = isDark ? '#64748b' : '#94a3b8'
    const activeBg = isDark ? 'rgba(0,218,243,0.08)' : 'rgba(0,218,243,0.08)'
    const activeColor = '#00daf3'
    const activeIconColor = '#00daf3'
    const logoutBg = isDark ? '#0f172a' : '#ffffff'

    return (
        <aside style={{
            width: 256,
            minWidth: 256,
            background: sidebarBg,
            borderRight: `1px solid ${borderColor}`,
            height: '100vh',
            position: 'sticky',
            top: 0,
            zIndex: 40,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
        }}>
            {/* ── Logo ──────────────────────────────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem 1.25rem',
                minHeight: 72,
                borderBottom: `1px solid ${borderColor}`,
                flexShrink: 0,
            }}>
                <img
                    src="/assets/omnipush-logo.png"
                    alt="OmniPush Logo"
                    style={{ height: 48, width: '100%', objectFit: 'contain' }}
                />
            </div>

            {/* ── Navigation ────────────────────────────────────────────────── */}
            <div style={{ padding: '0.75rem 0.5rem', flex: 1 }}>
                <nav>
                    {navItems.map((item, idx) => {
                        if (item.type === 'header') {
                            return (
                                <div key={`header-${idx}`} style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.14em',
                                    color: headerColor,
                                    padding: '1.25rem 0.875rem 0.4rem',
                                }}>
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
                                itemColor={itemColor}
                                itemHoverBg={itemHoverBg}
                                itemHoverColor={itemHoverColor}
                                iconColor={iconColor}
                                activeBg={activeBg}
                                activeColor={activeColor}
                                activeIconColor={activeIconColor}
                                borderColor={borderColor}
                                label={item.label}
                                icon={item.icon}
                            />
                        )
                    })}
                </nav>
            </div>

            {/* ── Logout ────────────────────────────────────────────────────── */}
            <div style={{
                padding: '1rem',
                borderTop: `1px solid ${borderColor}`,
                flexShrink: 0,
                background: logoutBg,
            }}>
                <button
                    onClick={() => signOut()}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        width: '100%', padding: '0.625rem 0.875rem',
                        background: 'transparent',
                        border: 'none', borderRadius: 8,
                        cursor: 'pointer', transition: 'all 0.15s',
                        fontSize: '0.875rem', fontWeight: 500,
                        color: isDark ? '#64748b' : '#94a3b8',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                        e.currentTarget.style.color = '#ef4444'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = isDark ? '#64748b' : '#94a3b8'
                    }}
                >
                    <LogOut size={18} />
                    Logout
                </button>
            </div>
        </aside>
    )
}

// ── Inline NavLink with hover state ──────────────────────────────────────────
function NavLink({ to, isActive, label, icon, itemColor, itemHoverBg, itemHoverColor,
    iconColor, activeBg, activeColor, activeIconColor, borderColor }: any) {
    const [hovered, setHovered] = React.useState(false)

    return (
        <Link
            to={to}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.55rem 0.875rem',
                margin: '1px 0',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: '0.875rem', fontWeight: isActive ? 600 : 500,
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                background: isActive ? activeBg : hovered ? itemHoverBg : 'transparent',
                color: isActive ? activeColor : hovered ? itemHoverColor : itemColor,
                borderLeft: `3px solid ${isActive ? '#00daf3' : 'transparent'}`,
            }}
        >
            <span style={{
                display: 'flex',
                color: isActive ? activeIconColor : hovered ? '#00daf3' : iconColor,
                transition: 'color 0.15s',
                flexShrink: 0,
            }}>
                {icon}
            </span>
            {label}
            {isActive && (
                <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: 0.4 }} />
            )}
        </Link>
    )
}
