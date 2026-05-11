# CMS UI Redesign — Plan 1: Foundation & Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the neon cyberpunk design tokens, add light/dark toggle, and rebuild the sidebar as a collapsible icon rail with 5 sections — all other pages use these foundation pieces.

**Architecture:** Update `src/index.css` with new neutral token set, create a `useTheme` hook that persists preference to localStorage and toggles a `dark` class on `<html>`, rewrite `Sidebar.tsx` as an icon rail that expands on hover with a pin toggle, and slim down the topbar in `AdminLayout.tsx`. No new routing. No changes to PlayerPage or any device-side logic.

**Tech Stack:** React 19, Tailwind CSS v4 (CSS variables via `@theme`), Lucide React icons, localStorage for persistence.

**Spec:** `docs/superpowers/specs/2026-05-11-cms-ui-redesign-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/index.css` | New design tokens, sidebar/topbar CSS rules |
| Create | `src/hooks/useTheme.ts` | Read/write theme to localStorage, apply `dark` class to `<html>` |
| Create | `src/components/common/ThemeToggle.tsx` | Sun/Moon icon button, calls `useTheme` |
| Rewrite | `src/components/layout/Sidebar.tsx` | Icon rail (56px collapsed / 240px expanded), 5 sections, pin state |
| Modify | `src/components/layout/AdminLayout.tsx` | Shrink topbar to 56px, add ThemeToggle, wire new Sidebar |

---

## Dev Server

All visual verification steps use:
```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
npm run dev
```
Then open `http://localhost:5173/admin/dashboard` in browser (must be logged in).

---

### Task 1: Update CSS Design Tokens

**Files:**
- Modify: `src/index.css`

Replace the current `@theme` block and global CSS rules with the new neutral token set. The key changes:
- New surface/border/text tokens (neutral slate, not neon)
- Accent stays cyan but toned down (`#00c4d4` dark / `#0098a8` light)
- Remove neon glow from `.topbar` brand text
- Add `dark` class strategy (Tailwind v4 uses `@variant dark`)
- Remove uppercase table headers (keep contrast, remove `text-transform: uppercase`)

- [ ] **Step 1: Open `src/index.css` and replace the entire file with:**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&display=swap');
@import "tailwindcss";
@variant dark (&:where(.dark, .dark *));

/* ═══════════════════════════════════════════════════════════════
   OMNIPUSH DESIGN SYSTEM v2 — Neutral SaaS
═══════════════════════════════════════════════════════════════ */
@theme {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-display: 'Space Grotesk', system-ui, sans-serif;

  /* Accent (cyan, toned down) */
  --color-accent:        #00c4d4;
  --color-accent-dark:   #0098a8;
  --color-accent-subtle: rgba(0, 196, 212, 0.1);

  /* Surfaces — dark mode defaults */
  --color-bg:        #0f1117;
  --color-surface-1: #1a1f2e;
  --color-surface-2: #222738;
  --color-surface-3: #2a3045;
  --color-border:    #2d3348;

  /* Text — dark mode defaults */
  --color-text-primary: #f0f2f7;
  --color-text-muted:   #6b7280;

  /* Semantic */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger:  #ef4444;
  --color-info:    #3b82f6;

  /* Legacy aliases (keep so existing pages don't break) */
  --color-brand-500: #00c4d4;
  --color-brand-600: #0098a8;
  --color-brand-100: rgba(0, 196, 212, 0.1);
  --color-accent-legacy: #ff3d00;
  --color-surface-500: var(--color-surface-1);
  --color-text-1: var(--color-text-primary);
  --color-text-2: var(--color-text-muted);
  --color-text-3: var(--color-text-muted);
  --color-error: var(--color-danger);
}

/* ── Reset ── */
* { box-sizing: border-box; }

/* ── Base (dark mode default) ── */
html, body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  transition: background 0.2s, color 0.2s;
}

/* ── Light Mode: override tokens on <html class="light"> ── */
html.light {
  --color-bg:           #f8f9fb;
  --color-surface-1:    #ffffff;
  --color-surface-2:    #f1f4f9;
  --color-surface-3:    #e8ecf2;
  --color-border:       #e2e6ef;
  --color-text-primary: #111827;
  --color-text-muted:   #6b7280;
  --color-accent:       #0098a8;
  --color-accent-dark:  #007880;
  --color-accent-subtle: rgba(0, 152, 168, 0.1);
  --color-brand-500:    #0098a8;
  --color-brand-600:    #007880;
  --color-brand-100:    rgba(0, 152, 168, 0.1);
  --color-surface-500:  #ffffff;
  --color-text-1:       #111827;
  --color-text-2:       #6b7280;
  --color-text-3:       #6b7280;
}

/* ── Layout ── */
.sidebar-rail {
  width: 56px;
  min-width: 56px;
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--color-surface-1);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  z-index: 40;
}
.sidebar-rail.expanded {
  width: 240px;
  min-width: 240px;
}

.main-content {
  flex: 1;
  background: var(--color-bg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.topbar {
  height: 56px;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-surface-1);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 50;
}

.page-content { padding: 1.5rem 2rem; }

/* ── Cards ── */
.card {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

/* ── Tables ── */
.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }

thead th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}
tbody tr:nth-child(even) { background: var(--color-surface-2); }
tbody td {
  padding: 1rem;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border);
}

/* ── Form ── */
.input-field {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border-radius: 8px;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  outline: none;
  font-size: 0.875rem;
  transition: border-color 0.15s;
}
.input-field:focus { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent-subtle); }

/* ── Buttons ── */
.btn-primary {
  background: var(--color-accent);
  color: #ffffff;
  padding: 0.5rem 1.125rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary:hover { opacity: 0.88; }

.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  padding: 0.5rem 1.125rem;
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.875rem;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: background 0.15s;
}
.btn-secondary:hover { background: var(--color-surface-2); }

/* ── Badges ── */
.badge {
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.7rem;
}
.badge-blue  { background: var(--color-accent-subtle); color: var(--color-accent); }
.badge-green { background: rgba(34,197,94,0.1);  color: var(--color-success); }
.badge-red   { background: rgba(239,68,68,0.1);  color: var(--color-danger); }
.badge-amber { background: rgba(245,158,11,0.1); color: var(--color-warning); }

/* ── Nav ── */
.nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  color: var(--color-text-muted);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  border-radius: 8px;
  border-left: 2px solid transparent;
  transition: all 0.15s;
}
.nav-item:hover { background: var(--color-surface-2); color: var(--color-text-primary); }
.nav-item.active {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  border-left-color: var(--color-accent);
}

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 1.5rem;
}
.modal-box {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 1.75rem;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0,0,0,0.3);
}
```

- [ ] **Step 2: Start dev server and check no build errors**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
npm run dev
```

Expected: Server starts on `http://localhost:5173`. No TypeScript compile errors. The page will look broken (sidebar/topbar haven't been updated yet) — that's expected.

- [ ] **Step 3: Commit**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
git add src/index.css
git commit -m "style: replace design tokens with neutral SaaS palette v2"
```

---

### Task 2: Create `useTheme` Hook

**Files:**
- Create: `src/hooks/useTheme.ts`

Reads `localStorage.getItem('theme')`, falls back to `window.matchMedia('(prefers-color-scheme: dark)')`, applies `dark` or `light` class to `<html>`, and returns a toggle function.

> Note: Tailwind v4 uses `@variant dark (&:where(.dark, .dark *))` — meaning the dark class must be on `<html>` or an ancestor. We use `html.light` for light overrides in CSS (Task 1), and no class for dark (default). So: dark = no class on html, light = `html` has class `light`.

- [ ] **Step 1: Create `src/hooks/useTheme.ts`:**

```typescript
import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light')
    document.documentElement.classList.remove('dark')
  } else {
    document.documentElement.classList.remove('light')
    document.documentElement.classList.remove('dark')
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Apply on first mount
  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  function toggle() {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggle }
}
```

- [ ] **Step 2: Verify no build errors**

In the running dev server terminal, check for TypeScript errors. Expected: none. The hook is not wired up yet — just needs to compile.

- [ ] **Step 3: Commit**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
git add src/hooks/useTheme.ts
git commit -m "feat: add useTheme hook with localStorage + system preference"
```

---

### Task 3: Create `ThemeToggle` Component

**Files:**
- Create: `src/components/common/ThemeToggle.tsx`

A button showing a Sun icon (when in dark mode, click to go light) or a Moon icon (when in light mode, click to go dark).

- [ ] **Step 1: Create `src/components/common/ThemeToggle.tsx`:**

```typescript
import React from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-all outline-none"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
```

- [ ] **Step 2: Verify no build errors in dev server**

Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
git add src/components/common/ThemeToggle.tsx
git commit -m "feat: add ThemeToggle component (sun/moon)"
```

---

### Task 4: Rewrite Sidebar as Icon Rail

**Files:**
- Rewrite: `src/components/layout/Sidebar.tsx`

Replace the current fixed-width sidebar (256px) with an icon rail:
- Collapsed: 56px, icons only, tooltip on hover
- Expanded: 240px, icons + labels, triggered by hover OR clicking the pin button
- Pin state stored in `localStorage` key `sidebar-pinned`
- 5 sections (as per spec): Home, Content, Devices, Publish, Settings
- Settings section is expandable sub-list (not a route itself)
- Logout button at bottom

- [ ] **Step 1: Replace entire `src/components/layout/Sidebar.tsx` with:**

```typescript
import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileVideo, ListVideo, Layout,
  Store, Shield, Monitor, Activity,
  Maximize, Package, Layers, LayoutTemplate,
  Settings, ChevronRight, ChevronDown, Pin, PinOff, LogOut,
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
      { kind: 'leaf', icon: <FileVideo size={16} />,  label: 'Media Library', path: '/admin/media' },
      { kind: 'leaf', icon: <ListVideo size={16} />,  label: 'Playlists',     path: '/admin/playlists' },
      { kind: 'leaf', icon: <UtensilsCrossed size={16} />, label: 'Menu Builder', path: '/admin/menu-builder' },
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
      { kind: 'leaf', icon: <Maximize size={16} />,       label: 'Publish',           path: '/admin/publish' },
      { kind: 'leaf', icon: <Package size={16} />,        label: 'Bundles',           path: '/admin/bundles' },
      { kind: 'leaf', icon: <LayoutTemplate size={16} />, label: 'Layout Templates',  path: '/admin/layout-templates' },
      { kind: 'leaf', icon: <Layers size={16} />,         label: 'Layouts',           path: '/admin/layouts' },
    ],
  },
  {
    kind: 'section',
    id: 'settings',
    icon: <Settings size={18} />,
    label: 'Settings',
    items: [
      { kind: 'leaf', icon: <Calendar size={16} />,       label: 'Scheduling',        path: '/admin/scheduling' },
      { kind: 'leaf', icon: <CalendarRange size={16} />,  label: 'Rules',             path: '/admin/rules' },
      { kind: 'leaf', icon: <Palette size={16} />,        label: 'Tenant Branding',   path: '/admin/branding' },
      { kind: 'leaf', icon: <Download size={16} />,       label: 'App Updates',       path: '/admin/app-updates' },
      { kind: 'leaf', icon: <Database size={16} />,       label: 'DB Migration',      path: '/admin/db-migration' },
      { kind: 'leaf', icon: <Zap size={16} />,            label: 'Edge Functions',    path: '/admin/edge-functions' },
      { kind: 'leaf', icon: <Shield size={16} />,         label: 'RLS Setup',         path: '/admin/rls-setup' },
      { kind: 'leaf', icon: <Globe size={16} />,          label: 'Global Admin',      path: '/admin/global' },
    ],
  },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { signOut } = useAuth()
  const location = useLocation()

  // Hover expand
  const [hovered, setHovered] = useState(false)
  // Pin: persist to localStorage
  const [pinned, setPinned] = useState<boolean>(() => {
    return localStorage.getItem('sidebar-pinned') === 'true'
  })
  // Which section sub-menus are open (only matters when expanded)
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    // Auto-open the section that contains the active route
    const active = new Set<string>()
    for (const entry of NAV) {
      if (entry.kind === 'section') {
        if (entry.items.some(i => i.path === location.pathname)) {
          active.add(entry.id)
        }
      }
    }
    return active
  })

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

  function isLeafActive(path: string) {
    return location.pathname === path
  }

  function isSectionActive(section: NavSection) {
    return section.items.some(i => i.path === location.pathname)
  }

  return (
    <aside
      className="shrink-0 h-screen sticky top-0 z-40 flex flex-col overflow-hidden transition-all duration-200"
      style={{
        width: isExpanded ? '240px' : '56px',
        minWidth: isExpanded ? '240px' : '56px',
        background: 'var(--color-surface-1)',
        borderRight: '1px solid var(--color-border)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Logo + Pin */}
      <div
        className="flex items-center shrink-0 overflow-hidden"
        style={{
          height: '56px',
          borderBottom: '1px solid var(--color-border)',
          padding: isExpanded ? '0 0.75rem' : '0',
          justifyContent: isExpanded ? 'space-between' : 'center',
        }}
      >
        {isExpanded ? (
          <>
            <img
              src="/assets/omnipush-logo.png"
              alt="OmniPush"
              style={{ height: '32px', objectFit: 'contain', maxWidth: '140px' }}
            />
            <button
              onClick={togglePin}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              className="p-1 rounded outline-none opacity-40 hover:opacity-100 transition-opacity"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          </>
        ) : (
          <img
            src="/assets/omnipush-logo.png"
            alt="OmniPush"
            style={{ height: '28px', width: '28px', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV.map((entry, idx) => {
          if (entry.kind === 'leaf') {
            const active = isLeafActive(entry.path)
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

          // Section
          const sectionActive = isSectionActive(entry)
          const isOpen = openSections.has(entry.id)

          return (
            <div key={entry.id}>
              {/* Section header button */}
              <button
                onClick={() => isExpanded && toggleSection(entry.id)}
                title={!isExpanded ? entry.label : undefined}
                className="flex items-center w-full outline-none rounded-lg mx-1 transition-all duration-150"
                style={{
                  width: isExpanded ? 'calc(100% - 8px)' : '40px',
                  margin: isExpanded ? '1px 4px' : '1px auto',
                  padding: isExpanded ? '0.4rem 0.625rem' : '0.4rem',
                  justifyContent: isExpanded ? 'flex-start' : 'center',
                  gap: isExpanded ? '0.625rem' : '0',
                  background: sectionActive ? 'var(--color-accent-subtle)' : 'transparent',
                  color: sectionActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  borderLeft: sectionActive && isExpanded ? '2px solid var(--color-accent)' : '2px solid transparent',
                }}
                onMouseOver={e => {
                  if (!sectionActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'
                }}
                onMouseOut={e => {
                  if (!sectionActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <span className="shrink-0">{entry.icon}</span>
                {isExpanded && (
                  <>
                    <span className="flex-1 text-left text-sm font-medium whitespace-nowrap overflow-hidden">{entry.label}</span>
                    <ChevronDown
                      size={14}
                      className="shrink-0 transition-transform duration-150"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', opacity: 0.5 }}
                    />
                  </>
                )}
              </button>

              {/* Sub-items (only when expanded AND open) */}
              {isExpanded && isOpen && (
                <div className="pl-3 pr-1">
                  {entry.items.map(leaf => (
                    <SidebarLeaf
                      key={leaf.path}
                      to={leaf.path}
                      icon={leaf.icon}
                      label={leaf.label}
                      active={isLeafActive(leaf.path)}
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
      <div
        className="shrink-0 py-2"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <button
          onClick={() => signOut()}
          title="Logout"
          className="flex items-center outline-none rounded-lg transition-all duration-150 hover:bg-red-500/10 hover:text-red-400"
          style={{
            width: isExpanded ? 'calc(100% - 8px)' : '40px',
            margin: isExpanded ? '0 4px' : '0 auto',
            padding: isExpanded ? '0.5rem 0.625rem' : '0.5rem',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            gap: isExpanded ? '0.625rem' : '0',
            color: 'var(--color-text-muted)',
          }}
        >
          <LogOut size={18} className="shrink-0" />
          {isExpanded && <span className="text-sm font-medium">Logout</span>}
        </button>
      </div>
    </aside>
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
      className="flex items-center outline-none rounded-lg transition-all duration-150"
      style={{
        width: expanded ? 'calc(100% - 8px)' : '40px',
        margin: expanded ? '1px 4px' : '1px auto',
        padding: expanded ? (sub ? '0.35rem 0.5rem' : '0.4rem 0.625rem') : '0.4rem',
        justifyContent: expanded ? 'flex-start' : 'center',
        gap: expanded ? '0.625rem' : '0',
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-muted)',
        borderLeft: active && expanded ? '2px solid var(--color-accent)' : '2px solid transparent',
        fontSize: sub ? '0.8125rem' : '0.875rem',
        fontWeight: active ? 600 : 500,
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
      <span className="shrink-0">{icon}</span>
      {expanded && (
        <span className="whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>
      )}
    </Link>
  )
}
```

- [ ] **Step 2: In browser at `http://localhost:5173/admin/dashboard`, verify:**
  - Sidebar shows as 56px rail (icon only)
  - Hovering the sidebar expands it to 240px with labels
  - 5 sections visible: Home, Content, Devices, Publish, Settings
  - Clicking Content/Devices/Publish/Settings expands sub-items
  - Clicking a sub-item navigates correctly
  - Pin button appears when expanded; clicking pins it open
  - Logout button at bottom works

- [ ] **Step 3: Commit**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
git add src/components/layout/Sidebar.tsx
git commit -m "feat: rebuild sidebar as collapsible icon rail with 5 sections"
```

---

### Task 5: Update Topbar in AdminLayout

**Files:**
- Modify: `src/components/layout/AdminLayout.tsx`

Changes:
1. Shrink topbar height from 72px → 56px
2. Remove glow effect from brand text (or remove brand text entirely since logo is in sidebar)
3. Add `ThemeToggle` between notifications and user avatar
4. Remove `Sidebar` import and usage from here (Sidebar is already imported — no change needed, just height)

- [ ] **Step 1: In `src/components/layout/AdminLayout.tsx`, find the `<header>` element and make these changes:**

Change `h-[72px]` → `h-[56px]` on the header:

```typescript
// BEFORE:
<header className="topbar h-[72px] px-7 flex items-center justify-between gap-4 bg-bg/85 backdrop-blur-xl border-b border-border sticky top-0 z-50 shrink-0">

// AFTER:
<header className="topbar h-[56px] px-6 flex items-center justify-between gap-4 sticky top-0 z-50 shrink-0">
```

- [ ] **Step 2: Replace the brand text span (remove neon glow):**

```typescript
// BEFORE:
<span className="text-base font-black tracking-[0.2em] uppercase text-brand-500 drop-shadow-[0_0_8px_rgba(0,218,243,0.3)]">
  SMART RETAIL DISPLAY
</span>

// AFTER:
<span className="text-sm font-semibold tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
  Smart Retail Display
</span>
```

- [ ] **Step 3: Add `ThemeToggle` import at the top of the file:**

```typescript
// Add after existing imports:
import ThemeToggle from '../common/ThemeToggle'
```

- [ ] **Step 4: Add `<ThemeToggle />` inside the right-side `<div className="flex items-center gap-4">`, between the Notifications button and User Menu:**

```typescript
{/* Notifications */}
<button ...>...</button>

{/* Theme Toggle — ADD THIS */}
<ThemeToggle />

{/* User Menu */}
<div className="relative">...</div>
```

- [ ] **Step 5: In browser, verify:**
  - Topbar is 56px tall (matches sidebar header height)
  - Brand text is neutral (no cyan glow)
  - Sun/Moon toggle button appears in topbar between notifications and avatar
  - Clicking toggle switches between dark and light mode
  - Light mode: page background becomes `#f8f9fb`, surfaces become white, text becomes dark
  - Dark mode: page returns to dark slate background
  - Preference persists after page refresh (stored in localStorage)

- [ ] **Step 6: Commit**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
git add src/components/layout/AdminLayout.tsx
git commit -m "feat: slim topbar to 56px, add ThemeToggle, remove neon brand text"
```

---

### Task 6: Final Integration Check

**Files:** None (verification only)

- [ ] **Step 1: Open `http://localhost:5173/admin/dashboard` in browser**

Verify all of the following:

| Check | Expected |
|-------|----------|
| Sidebar collapsed | 56px icon rail visible |
| Sidebar hover | Expands to 240px smoothly |
| Sidebar pin | Click pin → stays open after mouse leaves |
| Sidebar sections | Content, Devices, Publish, Settings each expand sub-items on click |
| Active route | Current page shows cyan left border + cyan text in nav |
| Topbar height | 56px, flush with sidebar header |
| Theme toggle | Sun/Moon icon in topbar right side |
| Dark mode | Default dark — dark slate background, light text |
| Light mode | Click toggle → white surfaces, dark text |
| Persistence | Refresh → theme stays |
| Tables | Sentence-case headers (not uppercase) |
| Cards | Rounded corners, subtle border, no glassmorphism |

- [ ] **Step 2: Navigate to several pages (Devices, Media, Playlists, Stores) and verify:**
  - Active nav item highlights correctly in sidebar
  - The section containing the active page auto-expands
  - Page content uses updated card/table styles
  - No console errors

- [ ] **Step 3: Final commit if any small fixes were needed, then tag the plan complete**

```bash
cd "D:\Antigravity projects\Smart  Retail Display System\omnipush-cms"
git add -A
git commit -m "chore: Plan 1 complete — foundation + shell (tokens, sidebar, topbar, theme)"
```

---

## What's Next

**Plan 2:** `2026-05-11-cms-ui-redesign-plan2-dashboard.md`
- 4 stat cards (Total, Playing, Idle/Not Playing, Offline)
- Device grid with 4 states (Playing 🟢, Idle 🟡, Stale 🔵, Offline 🔴)
- Filter tab strip (All | Playing | Idle | Stale | Offline)
- Activity feed right panel

**Plan 3:** `2026-05-11-cms-ui-redesign-plan3-pages.md`
- Devices page: status column + what's playing
- Media Library: grid view + filter bar
- Playlists: item card improvements
- Publish: 3-step wizard
- ⌘K command palette
- Settings reorganization (already done via sidebar — verify routing)
