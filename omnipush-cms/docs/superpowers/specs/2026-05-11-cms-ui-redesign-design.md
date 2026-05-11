# CMS UI Redesign — Design Spec

> **Status:** Approved by user — 2026-05-11

---

## Goal

Redesign the OmniPush CMS to be universal and simplistic: clean neutral visual style, icon-rail sidebar, device-health-first dashboard, and light/dark mode toggle — without hiding any functionality or adding mode-switching complexity.

## Architecture

**Approach: Focused SaaS**

- Icon-rail sidebar (56px collapsed → 240px expanded on hover/pin)
- 5 navigation sections (collapsed from current 8)
- Neutral palette (slate/gray tones), no neon glow
- Light/dark toggle with system default
- Device-health-first dashboard with 4 device states

---

## Section 1: Navigation & Architecture

### Sidebar

**Collapsed state (56px):** Icons only. Tooltip on hover shows section name.

**Expanded state (240px):** Triggered on hover or click-to-pin. Icons + labels. Pin icon at top locks it open.

**5 Sections:**

| Icon | Label | Contains (current routes) |
|------|-------|--------------------------|
| 📊 | Home | Dashboard |
| 🎬 | Content | Media Library, Playlists, Menu Builder |
| 🖥️ | Devices | Stores, Roles, Devices, Monitoring |
| 📡 | Publish | Publish, Bundles, Layouts, Layout Templates |
| ⚙️ | Settings | Scheduling, Rules, Branding, App Updates, DB Migration, Edge Functions, RLS Setup, Global Admin |

Settings sub-items appear as an indented list when expanded. System Admin items (DB Migration, Edge Functions, RLS Setup, Global Admin) appear at the bottom with a subtle divider and a 🔧 indicator.

### Topbar

- **Height:** 56px (down from 72px)
- **Left:** App logo/name — no glow effect
- **Center:** Global search bar (`⌘K` shortcut) — searches devices, media, playlists by name
- **Right:** Tenant switcher → Notifications bell → Light/Dark toggle → User avatar

### Dashboard Layout

**4 stat cards (top row):**

| Card | Value |
|------|-------|
| Total Devices | count |
| 🟢 Playing | count |
| 🟡 Idle / Not Playing | count |
| 🔴 Offline | count |

Clicking any stat card filters the device grid to show only devices in that state.

**Device grid (main area):** Each card shows:
- Screen name + store
- Status indicator (see 4-state table below)
- Currently playing content name
- Last seen timestamp
- "View" quick action button

**Filter tab strip (above grid):** All | Playing | Idle | Stale | Offline — with counts on each tab.

**Right panel (collapsible, 280px):** Recent activity feed — last 10 events (device came online, content published, media uploaded).

### Device States

| State | Indicator | Condition |
|-------|-----------|-----------|
| 🟢 Playing | Green | Online + content actively playing |
| 🟡 Idle / No Content | Amber | Online + heartbeat received but nothing playing (HDMI disconnect, no playlist assigned, or player not reporting) |
| 🔵 Stale | Blue | Last heartbeat 2–5 min ago — may be recovering |
| 🔴 Offline | Red | No heartbeat >5 min |

The Idle state covers HDMI disconnect scenarios where the Android app is running but the player WebView is not sending `setPlayerState`. Card label shows a short reason where detectable: "No playlist assigned" or "Player not reporting."

### Global Search (`⌘K`)

Command palette overlay. Searches across:
- Devices (by name, store, code)
- Media (by filename)
- Playlists (by name)

Results grouped by type. Click navigates directly. Replaces navigating to each section to find one item.

---

## Section 2: Visual Design

### Color System

Both modes use the same accent hue — only surfaces flip.

| Token | Dark Mode | Light Mode | Usage |
|-------|-----------|------------|-------|
| `bg-base` | `#0f1117` | `#f8f9fb` | Page background |
| `bg-surface` | `#1a1f2e` | `#ffffff` | Cards, sidebar |
| `bg-elevated` | `#222738` | `#f1f4f9` | Hover states, dropdowns |
| `border` | `#2d3348` | `#e2e6ef` | All borders |
| `text-primary` | `#f0f2f7` | `#111827` | Headings, labels |
| `text-muted` | `#6b7280` | `#6b7280` | Timestamps, subtitles |
| `accent` | `#00c4d4` | `#0098a8` | Active nav, CTAs, badges |
| `success` | `#22c55e` | `#16a34a` | Online / Playing |
| `warning` | `#f59e0b` | `#d97706` | Idle / No content |
| `danger` | `#ef4444` | `#dc2626` | Offline / Error |
| `info` | `#3b82f6` | `#2563eb` | Stale |

**Rules:**
- No neon glow effects
- No gradients on UI chrome
- Gradients allowed only on user avatar and media thumbnails

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Page title | Space Grotesk | 22px | 600 |
| Section heading | Space Grotesk | 16px | 600 |
| Body / labels | Inter | 14px | 400 |
| Small / meta | Inter | 12px | 400 |
| Stat numbers | Space Grotesk | 32px | 700 |
| Button | Inter | 14px | 500 |

### Component Styles

**Cards:** `bg-surface`, `border`, `rounded-xl`, `shadow-sm`. No glassmorphism. Padding 16px.

**Buttons:**
- Primary: `accent` background, white text, `rounded-lg`
- Secondary: transparent, `border`, `text-primary`, hover = `bg-elevated`
- Danger: `danger` background, white text
- Ghost: no border, no background, `text-muted` → `text-primary` on hover

**Sidebar nav item:**
- Default: icon + label, `text-muted`
- Hover: `bg-elevated`, `text-primary`
- Active: left border 2px `accent`, `text-accent`, `bg-elevated`

**Device status indicator:** Colored dot (8px circle) + text label. No filled pill badges.

**Tables:** Zebra striping using `bg-elevated` on alternating rows. Sentence-case headers (not uppercase), `text-muted`, 12px. Clean separator lines using `border`.

**Inputs:** `bg-elevated` fill, `border` outline, focus ring = 2px `accent`. Fixed labels above the field (no floating labels).

**Modals:** Centered, max-width 560px, `bg-surface`, `rounded-2xl`, `shadow-xl`. Backdrop: `bg-black/50 blur-sm`.

---

## Section 3: Page-by-Page Changes

### Pages — Significant Rework

**Dashboard (`/admin/dashboard`)**
- Replace current stats row + device list with 4-stat cards + device grid
- Add 4-state device health (Playing / Idle / Stale / Offline)
- Add filter tab strip
- Add collapsible right panel (activity feed)
- Remove heartbeat table format

**Devices (`/admin/devices`)**
- Keep table, apply new styles
- Add status dot as first column
- Add "What's playing" column (from `prefManager.currentContent`)
- Inline quick-actions: Edit | Reboot | View — replace modal-heavy flow

**Media Library (`/admin/media`)**
- Switch to masonry/grid view by default with list view toggle
- Thumbnail previews for images and videos (first frame)
- Filter bar: All | Images | Videos | Web URLs | PowerPoint

**Playlists (`/admin/playlists`)**
- Keep drag-and-drop
- Improve item cards: thumbnail + duration + type icon inline
- Add "Last published" indicator per playlist

**Publish (`/admin/publish`)**
- Wizard-style with 3-step progress indicator:
  - Step 1: Pick layout
  - Step 2: Pick scope (device / store / global)
  - Step 3: Confirm & publish
- Replace current unclear flow with visible breadcrumb

### Pages — Minor Cleanup Only

| Page | Change |
|------|--------|
| Stores | New table styles only |
| Roles | New table styles only |
| Layout Templates | New card/grid styles |
| Layouts | New card/grid styles |
| Monitoring | New device status indicators |
| Menu Builder | Minor style pass |

### Pages — Moved to Settings

Hidden from main nav, accessible via ⚙️ Settings sub-list:
- Scheduling / Rules
- Tenant Branding
- App Updates
- DB Migration
- Edge Functions
- RLS Setup
- Global Admin (visible only to super-admin role)

---

## Out of Scope

- No changes to PlayerPage.tsx or any device-side player logic
- No changes to Supabase Edge Functions or database schema
- No changes to authentication or multi-tenant logic
- No new features — redesign only

---

## Tech Notes

- Tailwind CSS v4 — use CSS variables for the color tokens (already partially in place in `src/index.css`)
- Light/dark toggle: store preference in `localStorage`, apply `class="dark"` on `<html>` (Tailwind dark mode strategy)
- Sidebar pin state: store in `localStorage`
- `⌘K` search: implement as a new `CommandPalette.tsx` component using a modal overlay + filtered results from existing Supabase queries
- Device state logic: `setPlayerState(phase, currentContent)` already bridges from Android → `prefManager`. Dashboard reads this via device heartbeat rows to determine Idle vs Playing.
