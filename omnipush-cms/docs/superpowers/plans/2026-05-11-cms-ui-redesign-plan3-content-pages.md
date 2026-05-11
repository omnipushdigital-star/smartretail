# CMS UI Redesign — Plan 3: Content Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle and enhance the Devices, Media, Playlists, and Publish pages per the redesign spec, and add a global ⌘K command palette.

**Architecture:** Extract shared device-state logic into a util, refactor each content page in-place (no new pages), and wire a new `CommandPalette.tsx` into `AdminLayout.tsx`. All changes are style and UX-only — no DB schema changes, no new routes.

**Tech Stack:** React + TypeScript, Tailwind CSS v4 (CSS custom properties), Supabase, lucide-react, react-router-dom v6

---

## Context (read before touching any file)

This is the **third plan** in the CMS UI redesign series.

- **Plan 1** established the new design token system (`src/index.css`), `useTheme` hook, `ThemeToggle`, and the Sidebar icon rail.
- **Plan 2** rewrote `DashboardPage.tsx` (4-state device health, stat cards, filter tabs, device grid) and created `ActivityFeed.tsx`.

**Key design tokens** (from `src/index.css`):
```
--color-bg-base      page background
--color-surface-1    card/sidebar background
--color-surface-2    hover/dropdown
--color-border       all borders
--color-text-primary headings/labels
--color-text-muted   timestamps/subtitles
--color-accent       active nav / CTAs  (#00c4d4 dark, #0098a8 light)
--color-success      #22c55e (playing/online)
--color-warning      #f59e0b (idle)
--color-danger       #ef4444 (offline/error)
--color-info         #3b82f6 (stale)
```

**Device 4-state logic** (currently duplicated in DashboardPage — Task 1 moves it to a shared util):
- `FRESH_THRESHOLD_MS = 2 * 60 * 1000`  → age < 2 min = online
- `STALE_THRESHOLD_MS = 5 * 60 * 1000`  → 2–5 min = stale, > 5 min = offline
- `status === 'playing'` → Playing (green dot), otherwise → Idle (amber)

**Heartbeat meta shape** (from DeviceHealthModal in DevicesPage):
```typescript
const meta = (heartbeat?.meta as any) || {}
meta.current_media?.title   // currently playing media name
meta.hdmi_status             // 'connected' | 'disconnected'
```

---

## File Map

| Task | Action | File |
|------|--------|------|
| 1 | Create | `src/utils/deviceState.ts` |
| 1 | Modify | `src/pages/admin/DashboardPage.tsx` (swap local defs → import from util) |
| 1 | Modify | `src/pages/admin/DevicesPage.tsx` (status dot col, what's-playing col, slim actions) |
| 2 | Modify | `src/pages/admin/MediaPage.tsx` (tab strip filter, list/grid toggle) |
| 3 | Modify | `src/pages/admin/PlaylistsPage.tsx` (last pushed indicator) |
| 4 | Modify | `src/pages/admin/PublishPage.tsx` (3-step wizard) |
| 5 | Create | `src/components/common/CommandPalette.tsx` |
| 5 | Modify | `src/components/layout/AdminLayout.tsx` (⌘K listener + render palette) |

---

## Task 1: Extract device state utility + update Devices page

**Files:**
- Create: `src/utils/deviceState.ts`
- Modify: `src/pages/admin/DashboardPage.tsx` lines ~1–50 (remove local type/const defs, add import)
- Modify: `src/pages/admin/DevicesPage.tsx`

### Step 1.1 — Create `src/utils/deviceState.ts`

- [ ] Create the file with this exact content:

```typescript
// src/utils/deviceState.ts
// Shared device-state logic used by DashboardPage and DevicesPage.

export type DeviceState = 'playing' | 'idle' | 'stale' | 'offline'

export const FRESH_THRESHOLD_MS = 2 * 60 * 1000   // < 2 min  → online
export const STALE_THRESHOLD_MS = 5 * 60 * 1000   // 2–5 min  → stale; > 5 min → offline

export interface StateConfig {
    dot: string
    label: string
    bg: string
    text: string
}

export const STATE_CONFIG: Record<DeviceState, StateConfig> = {
    playing: { dot: '#22c55e', label: 'Playing',           bg: 'rgba(34,197,94,0.1)',  text: '#22c55e' },
    idle:    { dot: '#f59e0b', label: 'Idle / No Content', bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
    stale:   { dot: '#3b82f6', label: 'Stale',             bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    offline: { dot: '#ef4444', label: 'Offline',           bg: 'rgba(239,68,68,0.1)',  text: '#ef4444' },
}

/**
 * Derive the 4-state device status from heartbeat data.
 * @param lastSeen  ISO timestamp string from device_heartbeats.last_seen_at
 * @param status    Raw status string from device_heartbeats.status (e.g. 'playing')
 */
export function getDeviceState(
    lastSeen: string | null | undefined,
    status: string | null | undefined
): DeviceState {
    if (!lastSeen) return 'offline'
    try {
        const age = Date.now() - new Date(lastSeen).getTime()
        if (age > STALE_THRESHOLD_MS) return 'offline'
        if (age > FRESH_THRESHOLD_MS) return 'stale'
        return status === 'playing' ? 'playing' : 'idle'
    } catch {
        return 'offline'
    }
}
```

- [ ] Run the dev server (`npm run dev`) — no errors expected yet since this file isn't imported anywhere.

### Step 1.2 — Update `DashboardPage.tsx` to import from util

- [ ] Open `src/pages/admin/DashboardPage.tsx`
- [ ] Find and **remove** these local definitions (they are currently at the top of the file):
  - `export type DeviceState = ...`
  - `export type FilterTab = ...`
  - `const FRESH_THRESHOLD_MS = ...`
  - `const STALE_THRESHOLD_MS = ...`
  - `export const STATE_CONFIG: Record<DeviceState, ...> = { ... }`
  - `export function getDeviceState(...): DeviceState { ... }`
- [ ] Add this import at the top of the file (after React imports, before other imports):

```typescript
import { DeviceState, getDeviceState, STATE_CONFIG, FRESH_THRESHOLD_MS, STALE_THRESHOLD_MS } from '../../utils/deviceState'

export type FilterTab = 'all' | DeviceState
```

- [ ] Confirm the file still compiles — run `npm run dev` and check no TypeScript errors.

- [ ] Run: `npm run dev` in terminal and confirm `/admin/dashboard` still loads with all 4 stat cards and device grid showing.

- [ ] Commit:
```bash
git add src/utils/deviceState.ts src/pages/admin/DashboardPage.tsx
git commit -m "refactor: extract getDeviceState + STATE_CONFIG to shared util"
```

### Step 1.3 — Update `DevicesPage.tsx`: status dot column + "What's playing" column

The Devices page currently has this column order:
`checkbox | Device Code | Display Name | Store | Role | Orientation | Secret | Connection | Last Seen | Version | Actions`

The spec requires:
- Add **Status** as the first data column (before Device Code) — an 8px colored dot + state label, using `getDeviceState` (same 4-state logic as Dashboard).
- Add **"What's playing"** as a column after Connection — shows `(meta as any).current_media?.title` if playing, otherwise `'—'`.
- Keep Secret column (it's important for operations).
- **Actions**: slim to **Edit | Reboot | View** as the 3 primary inline buttons; move Diagnostics, Clear Cache, Check Update, QR Code, and Delete into a `⋮` dropdown menu (see Step 1.4).

- [ ] Open `src/pages/admin/DevicesPage.tsx`
- [ ] Add import at the top:
```typescript
import { getDeviceState, STATE_CONFIG } from '../../utils/deviceState'
```
- [ ] Remove the existing `isOnline` function (lines ~20–23) — it is replaced by `getDeviceState`.
- [ ] In the `<thead>` replace the `<th>Connection</th>` and `<th>Last Seen</th>` block. The full new thead (keep checkbox col, add Status, keep others, add What's Playing):

```tsx
<thead>
    <tr>
        <th style={{ width: 40 }}>
            <input type="checkbox"
                checked={selectedIds.length > 0 && selectedIds.length === paginated.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900"
            />
        </th>
        <th style={{ width: 100 }}>Status</th>
        <th style={{ textAlign: 'left', paddingLeft: '1rem' }}>Device Code</th>
        <th style={{ textAlign: 'left' }}>Display Name</th>
        <th style={{ textAlign: 'left' }}>Store</th>
        <th style={{ textAlign: 'left' }}>Role</th>
        <th style={{ textAlign: 'left' }}>What's Playing</th>
        <th style={{ textAlign: 'left' }}>Secret</th>
        <th style={{ textAlign: 'left' }}>Last Seen</th>
        <th style={{ textAlign: 'center' }}>Version</th>
        <th style={{ textAlign: 'center' }}>Actions</th>
    </tr>
</thead>
```

- [ ] In the `<tbody>` row, inside the `.map(d => { ... })` callback, compute the device state at the start:

```typescript
const hb = heartbeats[d.device_code]
const deviceState = getDeviceState(hb?.last_seen_at, hb?.status)
const stateCfg = STATE_CONFIG[deviceState]
const meta = (hb?.meta as any) || {}
const isSelected = selectedIds.includes(d.id)
```

- [ ] Add the **Status** cell as the second `<td>` (after the checkbox `<td>`):

```tsx
<td style={{ width: 100 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: stateCfg.dot, flexShrink: 0,
            boxShadow: deviceState === 'playing' ? `0 0 6px ${stateCfg.dot}` : 'none'
        }} />
        <span style={{ fontSize: '0.75rem', color: stateCfg.text, fontWeight: 500 }}>
            {stateCfg.label}
        </span>
    </div>
    {meta.hdmi_status === 'disconnected' && (
        <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 700, display: 'flex',
            alignItems: 'center', gap: 2, background: 'rgba(239,68,68,0.1)',
            padding: '1px 4px', borderRadius: 4, marginTop: 2, width: 'fit-content' }}>
            <Monitor size={10} /> NO SIGNAL
        </span>
    )}
</td>
```

- [ ] Remove the old **Connection** `<td>` (the one that renders `badge-green` / `badge-red` / `badge-gray` based on `isOnline`).

- [ ] Add the **"What's playing"** `<td>` after the **Role** `<td>`:

```tsx
<td style={{ fontSize: '0.8125rem', maxWidth: 180, overflow: 'hidden' }}>
    {deviceState === 'playing' ? (
        <span style={{
            color: '#22c55e', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block'
        }}>
            {meta.current_media?.title || 'Playing'}
        </span>
    ) : (
        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
    )}
</td>
```

- [ ] Remove the old **Orientation** column from thead and tbody (it's low-value in the redesigned table — orientation is available in the Edit modal).

- [ ] Confirm the table compiles with `npm run dev` — no TypeScript errors.

- [ ] Commit:
```bash
git add src/pages/admin/DevicesPage.tsx
git commit -m "feat: add 4-state status dot and what's-playing column to devices table"
```

### Step 1.4 — Slim DevicesPage actions to Edit | Reboot | View + ⋮ dropdown

The current action cell has 6–7 buttons. Replace with 3 primary buttons + a dropdown.

- [ ] Add `openMenuId` state to the DevicesPage component:

```typescript
const [openMenuId, setOpenMenuId] = useState<string | null>(null)
```

- [ ] Replace the entire `viewMode === 'active'` actions fragment with this:

```tsx
{viewMode === 'active' ? (
    <>
        {/* Primary: Edit */}
        <button
            onClick={() => openEdit(d)}
            className="btn-secondary"
            style={{ padding: '0.375rem 0.625rem' }}
            title="Edit device"
        >
            <Edit2 size={13} />
        </button>
        {/* Primary: Reboot */}
        <button
            onClick={() => handleReboot(d.id, d.device_code)}
            className="btn-secondary"
            style={{ padding: '0.375rem 0.625rem' }}
            title="Remote Reboot"
        >
            <RotateCcw size={13} />
        </button>
        {/* Primary: View (screenshot) */}
        <button
            onClick={() => handleScreenshot(d.id, d.device_code)}
            className="btn-secondary"
            style={{ padding: '0.375rem 0.625rem' }}
            title="Request Screenshot"
        >
            <Camera size={13} />
        </button>
        {/* Secondary: ⋮ dropdown */}
        <div style={{ position: 'relative' }}>
            <button
                onClick={() => setOpenMenuId(openMenuId === d.id ? null : d.id)}
                className="btn-secondary"
                style={{ padding: '0.375rem 0.5rem' }}
                title="More actions"
            >
                <MoreVertical size={13} />
            </button>
            {openMenuId === d.id && (
                <div
                    style={{
                        position: 'absolute', right: 0, top: '100%', zIndex: 50,
                        background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
                        borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        minWidth: 160, padding: '0.25rem', marginTop: '0.25rem'
                    }}
                    onMouseLeave={() => setOpenMenuId(null)}
                >
                    {[
                        { label: 'Diagnostics', icon: <Activity size={13} />, action: () => { setSelectedHealthDevice(d); setOpenMenuId(null) } },
                        { label: 'Clear Cache', icon: <Eraser size={13} />, action: () => { handleClearCache(d.id, d.device_code); setOpenMenuId(null) } },
                        { label: 'Check Update', icon: <Download size={13} />, action: () => { handleCheckUpdate(d.id, d.device_code); setOpenMenuId(null) } },
                        { label: 'Show QR Code', icon: <QrCode size={13} />, action: () => { setPairingInfo({ device_code: d.device_code, device_secret: d.device_secret }); setShowPairingModal(true); setOpenMenuId(null) } },
                    ].map(item => (
                        <button
                            key={item.label}
                            onClick={item.action}
                            style={{
                                width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--color-text-primary)', fontSize: '0.8125rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                borderRadius: 6
                            }}
                            className="hover:bg-elevated"
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                        >
                            {item.icon} {item.label}
                        </button>
                    ))}
                    <div style={{ height: 1, background: 'var(--color-border)', margin: '0.25rem 0' }} />
                    <button
                        onClick={() => { handleDelete(d.id, d.device_code); setOpenMenuId(null) }}
                        style={{
                            width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-danger)', fontSize: '0.8125rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: 6
                        }}
                        disabled={deleting === d.id}
                    >
                        {deleting === d.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                        Move to Bin
                    </button>
                </div>
            )}
        </div>
    </>
) : (
    /* Bin mode: Restore + Delete Permanently */
    <>
        <button
            onClick={() => handleRestore(d.id, d.device_code)}
            className="btn-secondary"
            style={{ padding: '0.375rem 0.625rem', color: 'var(--color-success)' }}
            title="Restore Device"
        >
            <RotateCcw size={13} />
        </button>
        <button
            onClick={() => handleDelete(d.id, d.device_code)}
            className="btn-danger"
            style={{ padding: '0.375rem 0.625rem' }}
            disabled={deleting === d.id}
            title="Delete permanently"
        >
            {deleting === d.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
        </button>
    </>
)}
```

- [ ] Verify the table renders correctly at `npm run dev` — no TypeScript or React errors.

- [ ] Commit:
```bash
git add src/pages/admin/DevicesPage.tsx
git commit -m "feat: slim devices page actions to Edit/Reboot/View + more dropdown"
```

---

## Task 2: Media Library — horizontal filter strip + list/grid toggle

**File:** `src/pages/admin/MediaPage.tsx`

The current page has:
- A **left sidebar panel** with type filter buttons, a "Folders" placeholder, and Library Stats.
- A **right grid** (220px min-col auto-fill).

The redesign removes the sidebar and adds:
- A **horizontal tab strip** filter bar below the search/action row.
- A **list/grid toggle** button in the header.
- A **list view** (table format) as an alternative to the grid.
- Stats condensed into a small summary line below the filter tabs.

### Step 2.1 — Add `viewMode` state + list/grid toggle button

- [ ] Open `src/pages/admin/MediaPage.tsx`
- [ ] Add `viewMode` state after the existing state declarations:

```typescript
const [mediaViewMode, setMediaViewMode] = useState<'grid' | 'list'>('grid')
```

- [ ] Add `LayoutGrid, List` to the lucide-react import line. The current import is:
```typescript
import { Plus, Search, Upload, Trash2, Image as ImageIcon, Film, Globe, Filter, Loader2, X, Link, CloudUpload, Presentation } from 'lucide-react'
```
Change to:
```typescript
import { Plus, Search, Upload, Trash2, Image as ImageIcon, Film, Globe, Filter, Loader2, X, Link, CloudUpload, Presentation, LayoutGrid, List as ListIcon } from 'lucide-react'
```

### Step 2.2 — Replace the sidebar + grid layout with a flat single-column layout

The current JSX structure is:
```
<div>                                  ← page root
  <div class="page-header">...</div>
  <div class="card" ...>search bar</div>
  <div style="display:flex; gap:1.25rem">  ← two-column
    <div style="width:160px">sidebar</div>
    <div style="flex:1">grid</div>
  </div>
  modals...
</div>
```

Replace the two-column `<div style={{ display: 'flex', gap: '1.25rem', ... }}>` block (everything from that wrapper through its closing `</div>`) with:

```tsx
{/* Filter tab strip */}
<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
    {([
        { value: '', label: 'All', count: assets.length },
        { value: 'image', label: 'Images', count: assets.filter(a => a.type === 'image').length },
        { value: 'video', label: 'Videos', count: assets.filter(a => a.type === 'video').length },
        { value: 'web_url', label: 'Web URLs', count: assets.filter(a => a.type === 'web_url' || a.type === 'html').length },
        { value: 'ppt', label: 'PowerPoint', count: assets.filter(a => a.type === 'ppt').length },
    ] as { value: string; label: string; count: number }[]).map(tab => (
        <button
            key={tab.value}
            onClick={() => { setFilterType(tab.value); setPage(1) }}
            style={{
                padding: '0.375rem 0.875rem',
                borderRadius: 9999,
                border: `1px solid ${filterType === tab.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: filterType === tab.value ? 'rgba(0,196,212,0.1)' : 'transparent',
                color: filterType === tab.value ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontSize: '0.8125rem', fontWeight: filterType === tab.value ? 600 : 400,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}
        >
            {tab.label}
            <span style={{
                background: filterType === tab.value ? 'var(--color-accent)' : 'var(--color-surface-2)',
                color: filterType === tab.value ? 'white' : 'var(--color-text-muted)',
                borderRadius: 9999, fontSize: '0.7rem', fontWeight: 700,
                padding: '0.1rem 0.4rem', minWidth: 20, textAlign: 'center'
            }}>
                {tab.count}
            </span>
        </button>
    ))}

    {/* Spacer + view toggle */}
    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
        <button
            onClick={() => setMediaViewMode('grid')}
            style={{
                padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
                background: mediaViewMode === 'grid' ? 'var(--color-surface-2)' : 'transparent',
                color: mediaViewMode === 'grid' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer', display: 'flex'
            }}
            title="Grid view"
        >
            <LayoutGrid size={15} />
        </button>
        <button
            onClick={() => setMediaViewMode('list')}
            style={{
                padding: '0.375rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)',
                background: mediaViewMode === 'list' ? 'var(--color-surface-2)' : 'transparent',
                color: mediaViewMode === 'list' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                cursor: 'pointer', display: 'flex'
            }}
            title="List view"
        >
            <ListIcon size={15} />
        </button>
    </div>
</div>

{/* Stats summary */}
<div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
    {assets.length} items · {formatBytes(assets.reduce((sum, a) => sum + (a.bytes || 0), 0))} total ·{' '}
    {assets.filter(a => a.type === 'image').length} images,{' '}
    {assets.filter(a => a.type === 'video').length} videos,{' '}
    {assets.filter(a => a.type === 'ppt').length} slides,{' '}
    {assets.filter(a => a.type === 'web_url' || a.type === 'html').length} web URLs
</div>

{/* Main content area */}
{loading ? (
    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
        <Loader2 size={32} style={{ margin: '0 auto' }} />
    </div>
) : paginated.length === 0 ? (
    <div className="empty-state" style={{ marginTop: '2rem' }}>
        <ImageIcon size={48} />
        <h3>No media found</h3>
        <p>{search || filterType ? 'Try different search terms or filters.' : 'Upload your first image or video to get started.'}</p>
    </div>
) : mediaViewMode === 'grid' ? (
    <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            {paginated.map(a => (
                /* KEEP the existing card JSX exactly as-is — copy it here */
                <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setPreview(a)}>
                    {/* Thumbnail */}
                    <div style={{ height: 130, background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        {a.type === 'image' && a.url ? (
                            <img src={a.url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : a.type === 'video' && a.url ? (
                            <video src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                        ) : a.type === 'ppt' ? (
                            <div style={{ textAlign: 'center', color: '#f59e0b' }}>
                                <Presentation size={48} />
                                <div style={{ fontSize: '0.65rem', marginTop: '0.5rem', fontWeight: 600 }}>POWERPOINT</div>
                            </div>
                        ) : (
                            <Globe size={36} color="#34d399" />
                        )}
                        <div style={{ position: 'absolute', top: 8, right: 8 }}>
                            <span style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.7rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <TypeIcon type={a.type} /> {a.type}
                            </span>
                        </div>
                        {isR2Url(a.url) && (
                            <div style={{ position: 'absolute', bottom: 6, left: 6, background: 'rgba(99,102,241,0.85)', borderRadius: 4, padding: '0.1rem 0.4rem', fontSize: '0.625rem', color: '#fff', fontWeight: 600 }}>
                                ☁ R2
                            </div>
                        )}
                    </div>
                    <div style={{ padding: '0.75rem' }}>
                        <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                            {timeAgo((a as any).updated_at || (a as any).created_at)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{formatBytes(a.bytes)}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', display: 'flex', padding: 0 }}
                                disabled={deleting === a.id}
                            >
                                {deleting === a.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        <div className="card" style={{ padding: 0 }}>
            <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
    </>
) : (
    /* LIST VIEW */
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th style={{ width: 40 }}></th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Uploaded</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {paginated.map(a => (
                        <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setPreview(a)}>
                            <td style={{ width: 40, textAlign: 'center' }}>
                                {a.type === 'image' && a.url
                                    ? <img src={a.url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />
                                    : <div style={{ width: 32, height: 32, background: 'var(--color-surface-2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <TypeIcon type={a.type} />
                                      </div>
                                }
                            </td>
                            <td style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{a.name}</td>
                            <td>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                                    <TypeIcon type={a.type} /> {a.type}
                                </span>
                            </td>
                            <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{formatBytes(a.bytes)}</td>
                            <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>
                                {timeAgo((a as any).updated_at || (a as any).created_at)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(a) }}
                                    className="btn-danger"
                                    style={{ padding: '0.375rem 0.625rem' }}
                                    disabled={deleting === a.id}
                                    title="Delete"
                                >
                                    {deleting === a.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
)}
```

**Important:** The `filtered` array needs to match the new "Web URLs" tab (which covers both `web_url` and `html` types). Update the filter logic:

```typescript
const filtered = assets.filter(a => {
    const matchSearch = a.name.toLowerCase().includes(search.toLowerCase())
    // 'web_url' tab also matches 'html' type
    const matchType = !filterType ||
        a.type === filterType ||
        (filterType === 'web_url' && a.type === 'html')
    return matchSearch && matchType
})
```

- [ ] Verify the page renders — grid view and list view both work, filter tabs correctly filter.

- [ ] Commit:
```bash
git add src/pages/admin/MediaPage.tsx
git commit -m "feat: media library horizontal filter tabs, list/grid toggle, stats summary bar"
```

---

## Task 3: Playlists — "Last pushed" indicator

**File:** `src/pages/admin/PlaylistsPage.tsx`

Add a "Last pushed" column showing the most recent date any device was assigned this playlist (via `devices.playlist_id`). This is a client-side join using the existing Supabase device data — no schema change needed.

### Step 3.1 — Load device-by-playlist data

- [ ] Open `src/pages/admin/PlaylistsPage.tsx`

- [ ] Add `devicePushMap` state to track last-pushed per playlist ID:

```typescript
const [devicePushMap, setDevicePushMap] = useState<Record<string, string | null>>({})
```

- [ ] In `loadAll`, after the existing parallel queries, add a device query and build the map. Replace the current `loadAll` function body with:

```typescript
const loadAll = async () => {
    if (!currentTenantId) return
    setLoading(true)
    const [plRes, mediaRes, menuRes, deviceRes] = await Promise.all([
        supabase.from('playlists').select('*').eq('tenant_id', currentTenantId).order('name'),
        supabase.from('media_assets').select('*').eq('tenant_id', currentTenantId).order('name'),
        supabase.from('menus').select('id, name').eq('tenant_id', currentTenantId).order('name'),
        supabase.from('devices').select('playlist_id, updated_at')
            .eq('tenant_id', currentTenantId)
            .is('deleted_at', null)
            .not('playlist_id', 'is', null),
    ])
    setPlaylists(plRes.data || [])
    setMediaAssets(mediaRes.data || [])
    setMenus(menuRes.data || [])
    setLoading(false)

    // Build { [playlistId]: mostRecentUpdatedAt } from device assignments
    const pushMap: Record<string, string | null> = {}
    for (const device of (deviceRes.data || [])) {
        if (!device.playlist_id) continue
        const existing = pushMap[device.playlist_id]
        if (!existing || new Date(device.updated_at) > new Date(existing)) {
            pushMap[device.playlist_id] = device.updated_at
        }
    }
    setDevicePushMap(pushMap)
}
```

### Step 3.2 — Add "Last pushed" column to playlists table

- [ ] Add a `formatPushedDate` helper function near the top of the component file (above the `PlaylistsPage` component):

```typescript
function formatPushedDate(isoDate: string | null | undefined): string {
    if (!isoDate) return 'Never'
    const diff = (Date.now() - new Date(isoDate).getTime()) / 1000
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
    return new Date(isoDate).toLocaleDateString()
}
```

- [ ] In the `<thead>`, add a "Last pushed" column between "Description" and "Actions":

```tsx
<thead>
    <tr>
        <th style={{ width: 40 }}></th>
        <th>Name</th>
        <th>Description</th>
        <th>Last pushed</th>
        <th style={{ textAlign: 'right', paddingRight: '2.5rem' }}>Actions</th>
    </tr>
</thead>
```

- [ ] In each `<tr>`, add the "Last pushed" `<td>` after the Description `<td>`:

```tsx
<td style={{ fontSize: '0.8125rem', color: devicePushMap[p.id] ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
    {formatPushedDate(devicePushMap[p.id])}
</td>
```

- [ ] Verify the table renders with the new column and no TypeScript errors.

- [ ] Commit:
```bash
git add src/pages/admin/PlaylistsPage.tsx
git commit -m "feat: playlists table shows last-pushed date from device assignment"
```

---

## Task 4: Publish page — 3-step wizard

**File:** `src/pages/admin/PublishPage.tsx`

Replace the single-form publish modal with a 3-step wizard. The 3 steps are:
1. **Layout & Bundle** — pick which layout and bundle version
2. **Scope & Target** — pick role, scope (GLOBAL/STORE/DEVICE), and the specific target
3. **Confirm** — summary of choices + Publish button

The existing `handlePublish`, `loadAll`, `handleDeactivate`, `handleEdit`, and `forceRepair` logic is **unchanged**. Only the modal JSX changes.

### Step 4.1 — Add `wizardStep` state and helper components

- [ ] Open `src/pages/admin/PublishPage.tsx`

- [ ] Add `wizardStep` state to the component (inside `PublishPage`):

```typescript
const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1)
```

- [ ] When the modal opens, reset to step 1. Find all `setShowPublishModal(true)` calls and wrap them:

In the header "Publish Layout" button:
```typescript
onClick={() => { setWizardStep(1); setShowPublishModal(true) }}
```

In `handleEdit`:
```typescript
const handleEdit = (p: ActivePub) => {
    setEditingId(p.id)
    setForm({
        role_id: p.role_id || '',
        scope: p.scope,
        store_id: p.store_id || '',
        device_id: p.device_id || '',
        layout_id: p.layout_id,
        bundle_id: p.bundle_id,
    })
    setWizardStep(1)
    setShowPublishModal(true)
}
```

- [ ] Add `Check` to the lucide-react import:
```typescript
import { Upload, FileCheck, Loader2, Globe, Store as StoreIcon, Monitor, ChevronDown, ChevronRight, Package, ArrowUpRight, Check } from 'lucide-react'
```

### Step 4.2 — Replace the modal form with the 3-step wizard JSX

Find the `{showPublishModal && ( <Modal ...> ... </Modal> )}` block and replace it entirely with:

```tsx
{showPublishModal && (
    <Modal
        title={editingId ? 'Update Publication' : 'Publish Layout'}
        onClose={() => { setShowPublishModal(false); setEditingId(null) }}
        maxWidth="560px"
    >
        {/* Step progress indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.75rem' }}>
            {([
                { n: 1, label: 'Layout & Bundle' },
                { n: 2, label: 'Scope & Target' },
                { n: 3, label: 'Confirm' },
            ] as { n: 1 | 2 | 3; label: string }[]).map(({ n, label }, i) => (
                <React.Fragment key={n}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: wizardStep > n
                                ? 'var(--color-success)'
                                : wizardStep === n
                                    ? 'var(--color-accent)'
                                    : 'var(--color-surface-2)',
                            color: wizardStep >= n ? 'white' : 'var(--color-text-muted)',
                            fontSize: '0.8125rem', fontWeight: 700, flexShrink: 0,
                            transition: 'background 0.2s',
                        }}>
                            {wizardStep > n ? <Check size={14} /> : n}
                        </div>
                        <span style={{
                            fontSize: '0.75rem', fontWeight: wizardStep === n ? 600 : 400,
                            color: wizardStep === n ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            whiteSpace: 'nowrap'
                        }}>
                            {label}
                        </span>
                    </div>
                    {i < 2 && (
                        <div style={{ flex: 1, height: 1, background: 'var(--color-border)', margin: '0 0.625rem' }} />
                    )}
                </React.Fragment>
            ))}
        </div>

        <form onSubmit={handlePublish}>
            {/* ── STEP 1: Layout & Bundle ─────────────────────────────── */}
            {wizardStep === 1 && (
                <div>
                    <div className="form-group">
                        <label className="label">Layout *</label>
                        {layouts.length === 0 ? (
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                No layouts found. <a href="/admin/layouts" style={{ color: 'var(--color-accent)' }}>Create one first.</a>
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 240, overflowY: 'auto' }}>
                                {layouts.map(l => (
                                    <label
                                        key={l.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.75rem 1rem', borderRadius: 8, cursor: 'pointer',
                                            border: `1px solid ${form.layout_id === l.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
                                            background: form.layout_id === l.id ? 'rgba(0,196,212,0.08)' : 'var(--color-surface-2)',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="layout_id"
                                            value={l.id}
                                            checked={form.layout_id === l.id}
                                            onChange={() => setForm(f => ({ ...f, layout_id: l.id }))}
                                            style={{ accentColor: 'var(--color-accent)' }}
                                        />
                                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{l.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="form-group">
                        <label className="label">Bundle version *</label>
                        <select className="input-field" value={form.bundle_id} onChange={e => setForm(f => ({ ...f, bundle_id: e.target.value }))}>
                            <option value="">— Select bundle —</option>
                            {bundles.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.version}{b.notes ? ` — ${b.notes}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={!form.layout_id || !form.bundle_id}
                            onClick={() => setWizardStep(2)}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 2: Scope & Target ──────────────────────────────── */}
            {wizardStep === 2 && (
                <div>
                    <div className="form-group">
                        <label className="label">Role *</label>
                        <select className="input-field" value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
                            <option value="">— Select role —</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.key ? ` (${r.key})` : ''}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="label">Scope *</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {SCOPE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, scope: opt.value, store_id: '', device_id: '' }))}
                                    style={{
                                        flex: 1, padding: '0.75rem 0.5rem', borderRadius: 8, cursor: 'pointer',
                                        border: `1px solid ${form.scope === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                                        background: form.scope === opt.value ? 'rgba(0,196,212,0.1)' : 'var(--color-surface-2)',
                                        color: form.scope === opt.value ? 'var(--color-accent)' : 'var(--color-text-muted)',
                                        fontSize: '0.8125rem', display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', gap: '0.375rem', transition: 'all 0.15s',
                                    }}
                                >
                                    {opt.icon}
                                    <span style={{ fontWeight: 600 }}>{opt.label}</span>
                                    <span style={{ fontSize: '0.7rem', textAlign: 'center', lineHeight: 1.3 }}>{opt.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    {form.scope === 'STORE' && (
                        <div className="form-group">
                            <label className="label">Store *</label>
                            <select className="input-field" value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                                <option value="">— Select store —</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                            </select>
                        </div>
                    )}
                    {form.scope === 'DEVICE' && (
                        <div className="form-group">
                            <label className="label">Device *</label>
                            <select className="input-field" value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                                <option value="">— Select device —</option>
                                {devices.map(d => <option key={d.id} value={d.id}>{d.device_code}{d.display_name ? ` — ${d.display_name}` : ''}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginTop: '1.25rem' }}>
                        <button type="button" className="btn-secondary" onClick={() => setWizardStep(1)}>← Back</button>
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={!form.role_id || (form.scope === 'STORE' && !form.store_id) || (form.scope === 'DEVICE' && !form.device_id)}
                            onClick={() => setWizardStep(3)}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 3: Confirm ─────────────────────────────────────── */}
            {wizardStep === 3 && (
                <div>
                    <div style={{ background: 'var(--color-surface-2)', borderRadius: 10, padding: '1.25rem', marginBottom: '1.25rem', border: '1px solid var(--color-border)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                            Publication summary
                        </h3>
                        {[
                            { label: 'Layout', value: layouts.find(l => l.id === form.layout_id)?.name || '—' },
                            { label: 'Bundle', value: bundles.find(b => b.id === form.bundle_id)?.version || '—' },
                            { label: 'Role', value: roles.find(r => r.id === form.role_id)?.name || '—' },
                            { label: 'Scope', value: form.scope },
                            ...(form.scope === 'STORE' ? [{ label: 'Store', value: stores.find(s => s.id === form.store_id)?.name || '—' }] : []),
                            ...(form.scope === 'DEVICE' ? [{ label: 'Device', value: devices.find(d => d.id === form.device_id)?.device_code || '—' }] : []),
                        ].map(row => (
                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>{row.label}</span>
                                <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                        ⚠️ Publishing will <strong style={{ color: '#f59e0b' }}>deactivate the current active publication</strong> for the same target automatically.
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                        <button type="button" className="btn-secondary" onClick={() => setWizardStep(2)}>← Back</button>
                        <button type="submit" className="btn-primary" disabled={publishing}>
                            {publishing && <Loader2 size={14} />}
                            {publishing ? 'Publishing…' : editingId ? 'Update Publication' : '🚀 Publish'}
                        </button>
                    </div>
                </div>
            )}
        </form>
    </Modal>
)}
```

- [ ] Verify the wizard opens, all 3 steps render, back/next navigation works, and the final publish submits correctly.

- [ ] Commit:
```bash
git add src/pages/admin/PublishPage.tsx
git commit -m "feat: replace publish modal form with 3-step wizard (layout → scope → confirm)"
```

---

## Task 5: Command Palette (⌘K)

**Files:**
- Create: `src/components/common/CommandPalette.tsx`
- Modify: `src/components/layout/AdminLayout.tsx`

The palette is a modal overlay triggered by `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). It searches devices, media, and playlists by name in parallel, groups results by type, and navigates on click.

### Step 5.1 — Create `CommandPalette.tsx`

- [ ] Create `src/components/common/CommandPalette.tsx` with the following content:

```typescript
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Monitor, Image as ImageIcon, ListVideo, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'

interface ResultItem {
    id: string
    label: string
    sub?: string
    type: 'device' | 'media' | 'playlist'
    href: string
}

const TYPE_CONFIG = {
    device: { label: 'Devices', icon: Monitor, color: 'var(--color-info)' },
    media: { label: 'Media', icon: ImageIcon, color: 'var(--color-warning)' },
    playlist: { label: 'Playlists', icon: ListVideo, color: 'var(--color-success)' },
} as const

interface Props {
    open: boolean
    onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
    const navigate = useNavigate()
    const { currentTenantId } = useTenant()
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ResultItem[]>([])
    const [loading, setLoading] = useState(false)
    const [activeIdx, setActiveIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setQuery('')
            setResults([])
            setActiveIdx(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [open])

    const search = useCallback(async (q: string) => {
        if (!currentTenantId || q.trim().length < 1) {
            setResults([])
            return
        }
        setLoading(true)
        const term = `%${q.trim()}%`
        const [devRes, mediaRes, plRes] = await Promise.all([
            supabase
                .from('devices')
                .select('id, device_code, display_name, store:stores(name)')
                .eq('tenant_id', currentTenantId)
                .is('deleted_at', null)
                .or(`device_code.ilike.${term},display_name.ilike.${term}`)
                .limit(5),
            supabase
                .from('media_assets')
                .select('id, name, type')
                .eq('tenant_id', currentTenantId)
                .ilike('name', term)
                .limit(5),
            supabase
                .from('playlists')
                .select('id, name')
                .eq('tenant_id', currentTenantId)
                .ilike('name', term)
                .limit(5),
        ])
        const items: ResultItem[] = [
            ...(devRes.data || []).map(d => ({
                id: d.id,
                label: d.display_name || d.device_code,
                sub: `${d.device_code}${(d as any).store?.name ? ` · ${(d as any).store.name}` : ''}`,
                type: 'device' as const,
                href: '/admin/devices',
            })),
            ...(mediaRes.data || []).map(m => ({
                id: m.id,
                label: m.name,
                sub: m.type,
                type: 'media' as const,
                href: '/admin/media',
            })),
            ...(plRes.data || []).map(p => ({
                id: p.id,
                label: p.name,
                type: 'playlist' as const,
                href: '/admin/playlists',
            })),
        ]
        setResults(items)
        setActiveIdx(0)
        setLoading(false)
    }, [currentTenantId])

    // Debounce search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => search(query), 200)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [query, search])

    const go = (item: ResultItem) => {
        navigate(item.href)
        onClose()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIdx(i => Math.min(i + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIdx(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results[activeIdx]) go(results[activeIdx])
        } else if (e.key === 'Escape') {
            onClose()
        }
    }

    if (!open) return null

    // Group results by type
    const grouped = (['device', 'media', 'playlist'] as const).map(type => ({
        type,
        items: results.filter(r => r.type === type),
    })).filter(g => g.items.length > 0)

    // Flat index for keyboard navigation
    let flatIdx = 0

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '10vh',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div
                style={{
                    width: '100%', maxWidth: 560,
                    background: 'var(--color-surface-1)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                }}
                onKeyDown={handleKeyDown}
            >
                {/* Search input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                    {loading
                        ? <Loader2 size={18} style={{ color: 'var(--color-accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                        : <Search size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    }
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search devices, media, playlists…"
                        style={{
                            flex: 1, background: 'none', border: 'none', outline: 'none',
                            fontSize: '1rem', color: 'var(--color-text-primary)',
                        }}
                    />
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '0.25rem' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Results */}
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {query.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                            Type to search devices, media, and playlists
                        </div>
                    ) : results.length === 0 && !loading ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                            No results for "{query}"
                        </div>
                    ) : (
                        <div style={{ padding: '0.5rem' }}>
                            {grouped.map(group => {
                                const cfg = TYPE_CONFIG[group.type]
                                const Icon = cfg.icon
                                return (
                                    <div key={group.type} style={{ marginBottom: '0.25rem' }}>
                                        {/* Group header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.375rem 0.625rem',
                                            fontSize: '0.7rem', fontWeight: 700,
                                            color: 'var(--color-text-muted)',
                                            textTransform: 'uppercase', letterSpacing: '0.08em'
                                        }}>
                                            <Icon size={12} style={{ color: cfg.color }} />
                                            {cfg.label}
                                        </div>
                                        {group.items.map(item => {
                                            const isActive = flatIdx === activeIdx
                                            const currentFlatIdx = flatIdx++
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => go(item)}
                                                    onMouseEnter={() => setActiveIdx(currentFlatIdx)}
                                                    style={{
                                                        width: '100%', textAlign: 'left',
                                                        padding: '0.625rem 0.875rem',
                                                        borderRadius: 8, border: 'none', cursor: 'pointer',
                                                        background: isActive ? 'var(--color-surface-2)' : 'transparent',
                                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                        transition: 'background 0.1s',
                                                    }}
                                                >
                                                    <Icon size={15} style={{ color: cfg.color, flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ color: 'var(--color-text-primary)', fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.label}
                                                        </div>
                                                        {item.sub && (
                                                            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                                                                {item.sub}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>↵</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '0.625rem 1rem', borderTop: '1px solid var(--color-border)',
                    display: 'flex', gap: '1rem', fontSize: '0.7rem', color: 'var(--color-text-muted)'
                }}>
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>Esc Close</span>
                </div>
            </div>
        </div>
    )
}
```

- [ ] Run `npm run dev` — no TypeScript errors expected.

### Step 5.2 — Wire CommandPalette into `AdminLayout.tsx`

- [ ] Open `src/components/layout/AdminLayout.tsx`

- [ ] Add import at the top:

```typescript
import CommandPalette from '../common/CommandPalette'
```

- [ ] Add `paletteOpen` state inside `AdminLayout`:

```typescript
const [paletteOpen, setPaletteOpen] = useState(false)
```

- [ ] Add a `useEffect` for the keyboard shortcut (after the existing useEffects):

```typescript
useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault()
            setPaletteOpen(prev => !prev)
        }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

- [ ] Add `<CommandPalette>` at the bottom of the `AdminLayout` return, just before the closing `</div>`:

```tsx
<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
```

- [ ] In the topbar, update the search bar placeholder/button to trigger the palette on click. Find the `<div>` that contains the search area in the topbar (the existing search input or placeholder) and make it a button that opens the palette:

```tsx
{/* Global search trigger */}
<button
    onClick={() => setPaletteOpen(true)}
    style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.375rem 0.875rem',
        background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        color: 'var(--color-text-muted)',
        fontSize: '0.875rem', cursor: 'pointer',
        minWidth: 200,
    }}
>
    <Search size={14} />
    <span>Search…</span>
    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', background: 'var(--color-border)', borderRadius: 4, padding: '0.1rem 0.4rem' }}>⌘K</span>
</button>
```

Note: The current topbar may or may not have an existing search element. If it has a `<input>` for search already, replace it with this button. If there's already a `Search` icon import, it's already in scope.

- [ ] Verify:
  - Press `Cmd+K` (or `Ctrl+K`) — palette opens
  - Type in the search box — results appear grouped
  - Click a result — navigates to the correct page
  - Press `Esc` — palette closes
  - Click outside the palette box — palette closes

- [ ] Commit:
```bash
git add src/components/common/CommandPalette.tsx src/components/layout/AdminLayout.tsx
git commit -m "feat: add global command palette with Cmd+K shortcut, search devices/media/playlists"
```

---

## Final verification

- [ ] Run `npm run dev` and walk through each changed page:
  - `/admin/devices` — status dot column visible, "What's playing" column visible, 3 primary action buttons + ⋮ dropdown
  - `/admin/media` — horizontal filter tabs visible, grid/list toggle works, list view shows a table
  - `/admin/playlists` — "Last pushed" column shows dates or "Never"
  - `/admin/publish` — "Publish Layout" opens 3-step wizard; all 3 steps navigate correctly; publish submits
  - `Cmd+K` anywhere — command palette opens with grouped search results

- [ ] Confirm light mode works (toggle ThemeToggle in topbar) — no white-on-white or black-on-black text in any of the new/modified pages.

- [ ] Final commit:
```bash
git add -A
git commit -m "chore: plan 3 final verification pass"
```
