import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileVideo, ListVideo,
  Store, Shield, Monitor, Activity,
  Maximize, Package, Layers, LayoutTemplate,
  Settings, ChevronDown, Pin, PinOff, LogOut,
  Calendar, CalendarRange, Palette, Globe, Database, Download, Zap, UtensilsCrossed
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ────────────────────────────────────────────────────────────────────
interface NavLeaf {
  kind: 'leaf'
  icon: React.ReactNode
  label: string
  path: string
}
interface NavSection {
  kind: 'section'
  icon: React.ReactNode
  label: string
  id: string
  items: NavLeaf[]
}
type NavEntry = NavLeaf | NavSection

// ── Nav definition ────────────────────────────────────────────────────────────
const NAV: NavEntry[] = [
  {
    kind: 'leaf',
    icon: <LayoutDashboard size={18} />,
    label: 'Home',
    path: '/admin/dashboard',
  },
  {
    kind: 'section',
    id: 'content',
    icon: <FileVideo size={18} />,
    label: 'Content',
    items: [
      { kind: 'leaf', icon: <FileVideo size={16} />,       label: 'Media Library', path: '/admin/media' },
      { kind: 'leaf', icon: <ListVideo size={16} />,       label: 'Playlists',     path: '/admin/playlists' },
      { kind: 'leaf', icon: <UtensilsCrossed size={16} />, label: 'Menu Builder',  path: '/admin/menu-builder' },
    ],
  },
  {
    kind: 'section',
    id: 'devices',
    icon: <Monitor size={18} />,
    label: 'Devices',
    items: [
      { kind: 'leaf', icon: <Store size={16} />,    label: 'Stores',        path: '/admin/stores' },
      { kind: 'leaf', icon: <Shield size={16} />,   label: 'Display Roles', path: '/admin/roles' },
      { kind: 'leaf', icon: <Monitor size={16} />,  label: 'Devices',       path: '/admin/devices' },
      { kind: 'leaf', icon: <Activity size={16} />, label: 'Monitoring',    path: '/admin/monitoring' },
    ],
  },
  {
    kind: 'section',
    id: 'publish',
    icon: <Maximize size={18} />,
    label: 'Publish',
    items: [
      { kind: 'leaf', icon: <Maximize size={16} />,       label: 'Publish',          path: '/admin/publish' },
      { kind: 'leaf', icon: <Package size={16} />,        label: 'Bundles',          path: '/admin/bundles' },
      { kind: 'leaf', icon: <LayoutTemplate size={16} />, label: 'Layout Templates', path: '/admin/layout-templates' },
      { kind: 'leaf', icon: <Layers size={16} />,         label: 'Layouts',          path: '/admin/layouts' },
    ],
  },
  {
    kind: 'section',
    id: 'settings',
    icon: <Settings size={18} />,
    label: 'Settings',
    items: [
      { kind: 'leaf', icon: <Calendar size={16} />,      label: 'Scheduling',      path: '/admin/scheduling' },
      { kind: 'leaf', icon: <CalendarRange size={16} />, label: 'Rules',           path: '/admin/rules' },
      { kind: 'leaf', icon: <Palette size={16} />,       label: 'Tenant Branding', path: '/admin/branding' },
      { kind: 'leaf', icon: <Download size={16} />,      label: 'App Updates',     path: '/admin/app-updates' },
      { kind: 'leaf', icon: <Database size={16} />,      label: 'DB Migration',    path: '/admin/db-migration' },
      { kind: 'leaf', icon: <Zap size={16} />,           label: 'Edge Functions',  path: '/admin/edge-functions' },
      { kind: 'leaf', icon: <Shield size={16} />,        label: 'RLS Setup',       path: '/admin/rls-setup' },
      { kind: 'leaf', icon: <Globe size={16} />,         label: 'Global Admin',    path: '/admin/global' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitialOpenSections(pathname: string): Set<string> {
  const open = new Set<string>()
  for (const entry of NAV) {
    if (entry.kind === 'section' && entry.items.some(i => i.path === pathname)) {
      open.add(entry.id)
    }
  }
  return open
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { signOut } = useAuth()
  const location = useLocation()

  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState<boolean>(() =>
    localStorage.getItem('sidebar-pinned') === 'true'
  )
  const [openSections, setOpenSections] = useState<Set<string>>(() =>
    getInitialOpenSections(location.pathname)
  )

  const isExpanded = pinned || hovered

  function togglePin() {
    setPinned(prev => {
      const next = !prev
      localStorage.setItem('sidebar-pinned', String(next))
      return next
    })
  }

  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: isExpanded ? '240px' : '56px',
        minWidth: isExpanded ? '240px' : '56px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo + Pin */}
      <div style={{
        height: '56px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isExpanded ? 'space-between' : 'center',
        padding: isExpanded ? '0 12px' : '0',
        flexShrink: 0,
        overflow: 'hidden',
      }}>
        <img
          src="/assets/omnipush-logo.png"
          alt="OmniPush"
          style={{
            height: isExpanded ? '32px' : '28px',
            width: isExpanded ? 'auto' : '28px',
            maxWidth: isExpanded ? '140px' : '28px',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
        {isExpanded && (
          <button
            onClick={togglePin}
            title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            style={{
              padding: '4px',
              borderRadius: '4px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              opacity: 0.5,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '1')}
            onMouseOut={e => (e.currentTarget.style.opacity = '0.5')}
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 4px' }}>
        {NAV.map(entry => {
          if (entry.kind === 'leaf') {
            const active = location.pathname === entry.path
            return (
              <SidebarLeaf
                key={entry.path}
                to={entry.path}
                icon={entry.icon}
                label={entry.label}
                active={active}
                expanded={isExpanded}
              />
            )
          }

          const sectionActive = entry.items.some(i => i.path === location.pathname)
          const isOpen = openSections.has(entry.id)

          return (
            <div key={entry.id}>
              <SidebarSectionHeader
                icon={entry.icon}
                label={entry.label}
                active={sectionActive}
                isOpen={isOpen}
                expanded={isExpanded}
                onToggle={() => isExpanded && toggleSection(entry.id)}
                title={entry.label}
              />
              {isExpanded && isOpen && (
                <div style={{ paddingLeft: '8px', paddingRight: '4px' }}>
                  {entry.items.map(leaf => (
                    <SidebarLeaf
                      key={leaf.path}
                      to={leaf.path}
                      icon={leaf.icon}
                      label={leaf.label}
                      active={location.pathname === leaf.path}
                      expanded={true}
                      sub
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Logout */}
      <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 4px', flexShrink: 0 }}>
        <button
          onClick={() => signOut()}
          title="Logout"
          style={{
            width: isExpanded ? 'calc(100% - 0px)' : '40px',
            margin: isExpanded ? '0' : '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: isExpanded ? '10px' : '0',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            padding: isExpanded ? '8px 10px' : '8px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--color-text-muted)',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseOver={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
            e.currentTarget.style.color = '#ef4444'
          }}
          onMouseOut={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--color-text-muted)'
          }}
        >
          <LogOut size={18} style={{ flexShrink: 0 }} />
          {isExpanded && <span style={{ whiteSpace: 'nowrap' }}>Logout</span>}
        </button>
      </div>
    </aside>
  )
}

// ── SidebarSectionHeader ──────────────────────────────────────────────────────
function SidebarSectionHeader({
  icon, label, active, isOpen, expanded, onToggle, title
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  isOpen: boolean
  expanded: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <button
      onClick={onToggle}
      title={!expanded ? title : undefined}
      style={{
        width: expanded ? '100%' : '40px',
        margin: expanded ? '1px 0' : '1px auto',
        display: 'flex',
        alignItems: 'center',
        gap: expanded ? '10px' : '0',
        justifyContent: expanded ? 'flex-start' : 'center',
        padding: expanded ? '7px 10px' : '7px',
        borderRadius: '8px',
        border: 'none',
        borderLeft: active && expanded ? '2px solid var(--color-accent)' : '2px solid transparent',
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        cursor: 'pointer',
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
        fontSize: '0.875rem',
        fontWeight: 500,
        transition: 'background 0.15s, color 0.15s',
        textAlign: 'left',
      }}
      onMouseOver={e => {
        if (!active) {
          e.currentTarget.style.background = 'var(--color-surface-2)'
          e.currentTarget.style.color = 'var(--color-text-primary)'
        }
      }}
      onMouseOut={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--color-text-muted)'
        }
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      {expanded && (
        <>
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </span>
          <ChevronDown
            size={14}
            style={{
              flexShrink: 0,
              opacity: 0.5,
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          />
        </>
      )}
    </button>
  )
}

// ── SidebarLeaf ───────────────────────────────────────────────────────────────
function SidebarLeaf({
  to, icon, label, active, expanded, sub = false
}: {
  to: string
  icon: React.ReactNode
  label: string
  active: boolean
  expanded: boolean
  sub?: boolean
}) {
  return (
    <Link
      to={to}
      title={!expanded ? label : undefined}
      style={{
        width: expanded ? '100%' : '40px',
        margin: expanded ? '1px 0' : '1px auto',
        display: 'flex',
        alignItems: 'center',
        gap: expanded ? '10px' : '0',
        justifyContent: expanded ? 'flex-start' : 'center',
        padding: expanded ? (sub ? '6px 8px' : '7px 10px') : '7px',
        borderRadius: '8px',
        borderLeft: active && expanded ? '2px solid var(--color-accent)' : '2px solid transparent',
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
        fontSize: sub ? '0.8125rem' : '0.875rem',
        fontWeight: active ? 600 : 500,
        textDecoration: 'none',
        transition: 'background 0.15s, color 0.15s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
      onMouseOver={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)'
        }
      }}
      onMouseOut={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'
        }
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex' }}>{icon}</span>
      {expanded && (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      )}
    </Link>
  )
}
