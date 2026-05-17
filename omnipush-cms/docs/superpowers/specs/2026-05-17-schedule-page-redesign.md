# Schedule Page Redesign — Design Spec

**Date:** 2026-05-17
**Status:** Approved

---

## Goal

Replace the current weekly-grid schedule page with a Hero-First Dashboard layout (Layout A) that makes "what is playing right now" the primary information, followed by today's full timeline, weekly day coverage, and stats.

---

## Architecture

Single file change: `src/pages/admin/SchedulePage.tsx`.

No new Supabase queries. All data comes from the existing `loadData()` call:
```ts
supabase
  .from('rules')
  .select('*, layout:layouts(name), schedules:rule_schedules(*)')
  .eq('tenant_id', currentTenantId)
  .eq('enabled', true)
```

No new routes, no new components, no schema changes.

---

## Page Structure — 5 Vertical Zones

```
┌─────────────────────────────────────────┐
│  1. Page Header                         │
├─────────────────────────────────────────┤
│  2. Now Playing hero card               │
│  3. Next Up bar                         │
├─────────────────────────────────────────┤
│  4. Today's Timeline (24h bar)          │
├─────────────────────────────────────────┤
│  5. Weekly Coverage (7 day pills)       │
├─────────────────────────────────────────┤
│  6. Stats strip (3 mini cards)          │
└─────────────────────────────────────────┘
```

Full-width, no sidebar. Responsive: single column on mobile.

---

## Zone Specifications

### Zone 1 — Page Header
- Left: Calendar icon + "Schedule Manager" title + subtitle "Set dayparting rules and automated content rotation"
- Right: "Add Screen" (btn-secondary → navigates to `/admin/devices`) + "Push Content" (btn-primary → navigates to `/admin/publish`)
- Identical to current header — no change needed

### Zone 2 — Now Playing Hero Card
- Background: gradient from `rgba(124,107,248,0.12)` to `var(--color-surface-1)`, border `1px solid var(--color-accent)`
- Border-radius: 14px, padding: 24px
- Left side:
  - Indigo icon circle with ▶ play icon
  - Label: "NOW PLAYING" (10px, uppercase, `var(--color-accent)`)
  - Rule name: 22px, font-weight 800, `var(--color-text-primary)`
  - Subtitle line: `{scope} · Layout: {layout.name} · {start_time} – {end_time}`
- Right side: green LIVE badge (`● Live`) — green background, green text
- **When no rule is active:** Show "No Active Rule" with muted styling and grey "Idle" badge instead

### Zone 3 — Next Up Bar
- Slim row: amber dot + "NEXT UP" label + rule name + right-aligned time ("in Xh Ym → HH:MM")
- Background: `var(--color-surface-2)`, border: `var(--color-border)`, border-radius: 10px, padding: 12px 16px
- **Next rule logic:** From `rules` with schedules, find the rule whose `start_time` is the earliest time strictly after `now` (current `HH:mm:ss`) on today's day bit. If none today, show "No more rules today" muted text.
- Time display: compute `Math.floor(diffMinutes / 60)` hours and `diffMinutes % 60` minutes from now to `start_time`

### Zone 4 — Today's Timeline
- Section label: "Today's Timeline — {DAY_NAME}" (11px uppercase muted)
- A full-width horizontal bar, height 40px, border-radius 10px, background `var(--color-surface-2)`
- Each rule that is active today renders as a proportional coloured block inside the bar:
  - Block left offset = `(startMinutes / 1440) * 100%`
  - Block width = `((endMinutes - startMinutes) / 1440) * 100%`
  - Where `startMinutes` = hours×60 + minutes from `start_time`, `endMinutes` from `end_time`
  - Block shows rule name as text if width > 8%, otherwise just colour
  - Colour per scope: GLOBAL = indigo (`rgba(124,107,248,0.4)`), STORE = amber (`rgba(245,158,11,0.3)`), DEVICE = blue (`rgba(59,130,246,0.3)`)
- White vertical NOW line at `(currentMinutes / 1440) * 100%` left position, with "NOW" label above it
- If no rules today: bar shows empty state "No slots scheduled today"

### Zone 5 — Weekly Coverage Pills
- Row of 7 pill buttons: Mon Tue Wed Thu Fri Sat Sun
- Each pill: border-radius 10px, flex: 1, padding 10px, text-align center
- Day name (10px uppercase) + dot indicator below
- **Active state** (at least one rule has this day in `days_mask`): indigo background + indigo dot
- **Inactive state**: surface-2 background + muted dot
- Day bit mapping: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0 (matches JS `getDay()`)

### Zone 6 — Stats Strip
- 3 equal-width mini cards in a row:
  - **Active Rules** — `rules.length` value
  - **Engine Status** — "Active" (green) if `rules.length > 0`, "Idle" (muted) if 0
  - **Conflicts** — hardcoded "0" (conflict detection not yet implemented)
- Each card: `var(--color-surface-2)` background, `var(--color-border)` border, border-radius 10px, padding 12px 14px
- Value: 18px bold `var(--color-text-primary)`. Label: 10px muted below

---

## Data Computation (all inside the component, no new queries)

```ts
// Current time info
const now = new Date()
const todayBit = now.getDay()           // 0=Sun, 1=Mon ... 6=Sat
const timeStr = format(now, 'HH:mm:ss') // for rule matching
const currentMinutes = now.getHours() * 60 + now.getMinutes()

// Today's active rules (have today's bit set in days_mask)
const todayRules = rules.filter(r => {
  const mask = r.schedules?.[0]?.days_mask ?? 0
  return mask & (1 << todayBit)
}).sort((a, b) =>
  (a.schedules?.[0]?.start_time ?? '').localeCompare(b.schedules?.[0]?.start_time ?? '')
)

// Currently playing rule
const currentRule = todayRules.find(r => {
  const sched = r.schedules?.[0]
  if (!sched) return false
  if (sched.start_time && timeStr < sched.start_time) return false
  if (sched.end_time && timeStr > sched.end_time) return false
  return true
})

// Next rule (first rule starting after now)
const nextRule = todayRules.find(r => {
  const sched = r.schedules?.[0]
  return sched?.start_time && sched.start_time > timeStr
})

// Weekly day coverage (OR all masks)
const combinedMask = rules.reduce((acc, r) => acc | (r.schedules?.[0]?.days_mask ?? 0), 0)
const isDayActive = (dayIndex: number) => !!(combinedMask & (1 << dayIndex))
// dayIndex: 0=Sun,1=Mon,...,6=Sat — DAYS array uses Mon-first display order

// Next up countdown string
function formatCountdown(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  const targetMins = h * 60 + m
  const diffMins = targetMins - currentMinutes
  if (diffMins <= 0) return ''
  const hrs = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  return hrs > 0 ? `in ${hrs}h ${mins}m` : `in ${mins}m`
}
```

---

## Styling Tokens Used

All from `src/index.css` custom properties — no hardcoded colours except the rgba overlay values:

| Purpose | Token |
|---|---|
| Accent / indigo | `var(--color-accent)` = `#7c6bf8` |
| Accent subtle bg | `var(--color-accent-subtle)` = `rgba(124,107,248,0.1)` |
| Surface cards | `var(--color-surface-1)` |
| Surface rows | `var(--color-surface-2)` |
| Borders | `var(--color-border)` |
| Primary text | `var(--color-text-primary)` |
| Muted text | `var(--color-text-muted)` |
| Success/Live | `var(--color-success)` = `#22c55e` |
| Warning/Next | `var(--color-warning)` = `#f59e0b` |

---

## What Is Removed

- The old weekly grid (`grid-cols-[120px_repeat(7,1fr)]` with checkmark cells)
- The two bottom info cards ("Current Rule" and "Timeline Context")
- `const [selectedLocation]` state (replaced by "All Infrastructure" label in section titles)
- `slots` array and `colors` object (replaced by `todayRules` + inline scope colours)

The `TimeSlot` interface is removed. The `Rule` type and all imports remain.

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/admin/SchedulePage.tsx` | Full rewrite of JSX render. Data logic updated in-component. |

No other files modified.

---

## Out of Scope

- Conflict detection (stays hardcoded 0)
- Clicking a rule to edit it (no interaction on hero/pills/timeline — navigates to `/admin/rules` via "Add Rule" only)
- Animations on the NOW line
- Real-time clock refresh (page reflects time at load; no interval timer)
