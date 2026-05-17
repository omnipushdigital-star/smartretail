# Schedule Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the weekly-grid scheduling page with a Hero-First Dashboard showing Now Playing, Next Up, a 24h timeline, weekly day pills, and stats.

**Architecture:** Single file rewrite of `src/pages/admin/SchedulePage.tsx`. No new Supabase queries — all data comes from the existing `loadData()` call. No new components, no new routes, no schema changes.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS v4, Supabase, date-fns, lucide-react

---

## File Structure

| File | Change |
|---|---|
| `omnipush-cms/src/pages/admin/SchedulePage.tsx` | Full rewrite — remove old grid JSX, add 6 new zones |

No other files change.

---

### Task 1: Add helper functions and replace data computations

**Files:**
- Modify: `omnipush-cms/src/pages/admin/SchedulePage.tsx`

Remove `TimeSlot` interface, `slots` array, `colors` object, `selectedLocation` useState. Add two pure helper functions above the component and replace the in-component data derivations.

- [ ] **Step 1: Open the file and verify current state**

Run:
```bash
head -70 omnipush-cms/src/pages/admin/SchedulePage.tsx
```
Expected: see `interface TimeSlot`, `const DAYS`, `useState('All Infrastructure')`, `const slots`, `const colors`.

- [ ] **Step 2: Replace the top of the file — imports, helpers, constants**

Replace everything from line 1 through the end of `const colors` block (lines 1–75) with:

```tsx
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Plus, Clock, Play, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { Rule } from '../../types'
import { format } from 'date-fns'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Bit values matching JS Date.getDay(): Sun=0, Mon=1 ... Sat=6
const DAY_BITS = [1, 2, 3, 4, 5, 6, 0]

function formatCountdown(startTime: string, currentMinutes: number): string {
    const [h, m] = startTime.split(':').map(Number)
    const targetMins = h * 60 + m
    const diffMins = targetMins - currentMinutes
    if (diffMins <= 0) return ''
    const hrs = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return hrs > 0 ? `in ${hrs}h ${mins}m` : `in ${mins}m`
}

function scopeColor(targetType: string): string {
    if (targetType === 'GLOBAL') return 'rgba(124,107,248,0.4)'
    if (targetType === 'STORE') return 'rgba(245,158,11,0.3)'
    return 'rgba(59,130,246,0.3)'
}
```

- [ ] **Step 3: Replace the component's state and data derivations**

Replace the component opening (from `export default function SchedulePage()` down through `const slots` and `const colors`, ending just before the `if (loading)` block) with:

```tsx
export default function SchedulePage() {
    const navigate = useNavigate()
    const { currentTenantId } = useTenant()
    const [rules, setRules] = useState<Rule[]>([])
    const [loading, setLoading] = useState(true)

    const loadData = async () => {
        if (!currentTenantId) return
        setLoading(true)
        const { data, error } = await supabase
            .from('rules')
            .select('*, layout:layouts(name), schedules:rule_schedules(*)')
            .eq('tenant_id', currentTenantId)
            .eq('enabled', true)
        if (!error) setRules(data || [])
        setLoading(false)
    }

    useEffect(() => { loadData() }, [currentTenantId])

    // Time context (computed at render time — no interval needed)
    const now = new Date()
    const todayBit = now.getDay()            // 0=Sun, 1=Mon ... 6=Sat
    const timeStr = format(now, 'HH:mm:ss')
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // Rules active today, sorted by start_time ascending
    const todayRules = rules
        .filter(r => {
            const mask = r.schedules?.[0]?.days_mask ?? 0
            return !!(mask & (1 << todayBit))
        })
        .sort((a, b) =>
            (a.schedules?.[0]?.start_time ?? '').localeCompare(b.schedules?.[0]?.start_time ?? '')
        )

    // Currently active rule (time window overlaps now)
    const currentRule = todayRules.find(r => {
        const sched = r.schedules?.[0]
        if (!sched) return false
        if (sched.start_time && timeStr < sched.start_time) return false
        if (sched.end_time && timeStr > sched.end_time) return false
        return true
    })

    // Next rule starting after now
    const nextRule = todayRules.find(r => {
        const sched = r.schedules?.[0]
        return sched?.start_time && sched.start_time > timeStr
    })

    // OR all days_mask values to determine weekly coverage
    const combinedMask = rules.reduce((acc, r) => acc | (r.schedules?.[0]?.days_mask ?? 0), 0)
    const isDayActive = (bit: number) => !!(combinedMask & (1 << bit))
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd omnipush-cms && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors, or only pre-existing errors unrelated to SchedulePage.

- [ ] **Step 5: Commit**

```bash
cd omnipush-cms
git add src/pages/admin/SchedulePage.tsx
git commit -m "refactor(schedule): replace old data derivations with hero-dashboard helpers"
```

---

### Task 2: Now Playing hero card and Next Up bar

**Files:**
- Modify: `omnipush-cms/src/pages/admin/SchedulePage.tsx`

Replace the old `return (...)` JSX entirely. This task implements the page wrapper, the header, the Now Playing hero card, and the Next Up bar.

- [ ] **Step 1: Replace the full return block with the new JSX skeleton + first three zones**

Find the `return (` at the start of the JSX (currently `<div className="p-6">`) and replace everything from `return (` to the closing `</div>` of the entire component with:

```tsx
    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                <Loader2 className="animate-spin" style={{ color: 'var(--color-accent)' }} size={32} />
                <span style={{ marginLeft: '0.75rem', color: 'var(--color-text-muted)' }}>Synchronizing Schedule Data...</span>
            </div>
        )
    }

    return (
        <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* ── Zone 1: Header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                        <Calendar style={{ color: 'var(--color-accent)' }} size={30} />
                        Schedule Manager
                    </h1>
                    <p style={{ color: 'var(--color-text-muted)', marginTop: '0.375rem', fontSize: '0.9375rem', margin: '0.375rem 0 0' }}>
                        Set dayparting rules and automated content rotation
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn-secondary" onClick={() => navigate('/admin/devices')}>
                        <Plus size={16} /> Add Screen
                    </button>
                    <button className="btn-primary" onClick={() => navigate('/admin/publish')}>
                        Push Content
                    </button>
                </div>
            </div>

            {/* ── Zone 2: Now Playing Hero ── */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(124,107,248,0.12) 0%, var(--color-surface-1) 100%)',
                border: '1px solid var(--color-accent)',
                borderRadius: 14,
                padding: '1.25rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: 52, height: 52,
                        background: 'rgba(124,107,248,0.15)',
                        borderRadius: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--color-accent)', flexShrink: 0,
                    }}>
                        <Play size={22} fill="currentColor" />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
                            Now Playing
                        </div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                            {currentRule ? currentRule.name : 'No Active Rule'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {currentRule
                                ? `${currentRule.target_type} · Layout: ${(currentRule as any).layout?.name ?? '—'} · ${currentRule.schedules?.[0]?.start_time?.substring(0, 5) ?? ''} – ${currentRule.schedules?.[0]?.end_time?.substring(0, 5) ?? ''}`
                                : 'No rule is scheduled for this time slot'
                            }
                        </div>
                    </div>
                </div>
                <div style={{
                    background: currentRule ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)',
                    color: currentRule ? 'var(--color-success)' : 'var(--color-text-muted)',
                    border: `1px solid ${currentRule ? 'rgba(34,197,94,0.3)' : 'var(--color-border)'}`,
                    fontSize: '0.6875rem', fontWeight: 700,
                    padding: '0.375rem 0.875rem',
                    borderRadius: 20,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    whiteSpace: 'nowrap',
                }}>
                    {currentRule ? '● Live' : '○ Idle'}
                </div>
            </div>

            {/* ── Zone 3: Next Up Bar ── */}
            <div style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 10,
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
            }}>
                <div style={{ width: 8, height: 8, background: 'var(--color-warning)', borderRadius: '50%', flexShrink: 0 }} />
                {nextRule ? (
                    <>
                        <div>
                            <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Next Up</div>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{nextRule.name}</div>
                        </div>
                        <div style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: 'var(--color-warning)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {formatCountdown(nextRule.schedules?.[0]?.start_time ?? '', currentMinutes)} → {nextRule.schedules?.[0]?.start_time?.substring(0, 5) ?? ''}
                        </div>
                    </>
                ) : (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>No more rules scheduled today</div>
                )}
            </div>

            {/* ── Zones 4-6 placeholder — added in next tasks ── */}

        </div>
    )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd omnipush-cms && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 3: Run dev server and verify visually**

```bash
cd omnipush-cms && npm run dev
```
Open `http://localhost:5173/admin/scheduling`. Expected:
- Header with title + two buttons ✓
- Indigo gradient hero card with play icon ✓
- "Now Playing" label + rule name (or "No Active Rule") ✓
- LIVE / IDLE badge on the right ✓
- Amber next-up bar below ✓

- [ ] **Step 4: Commit**

```bash
cd omnipush-cms
git add src/pages/admin/SchedulePage.tsx
git commit -m "feat(schedule): add Now Playing hero card and Next Up bar"
```

---

### Task 3: Today's 24-hour Timeline

**Files:**
- Modify: `omnipush-cms/src/pages/admin/SchedulePage.tsx`

Replace the `{/* ── Zones 4-6 placeholder ── */}` comment with the timeline zone and a new placeholder for zones 5-6.

- [ ] **Step 1: Replace the placeholder comment with Zone 4**

Find the line `{/* ── Zones 4-6 placeholder — added in next tasks ── */}` and replace it with:

```tsx
            {/* ── Zone 4: Today's Timeline ── */}
            <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '0.625rem' }}>
                    Today's Timeline — {DAYS[todayBit === 0 ? 6 : todayBit - 1]}
                </div>
                <div style={{ position: 'relative' }}>
                    <div style={{ position: 'relative', height: 40, background: 'var(--color-surface-2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                        {todayRules.length === 0 && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                No slots scheduled today
                            </div>
                        )}
                        {todayRules.map(r => {
                            const sched = r.schedules?.[0]
                            if (!sched?.start_time || !sched?.end_time) return null
                            const [sh, sm] = sched.start_time.split(':').map(Number)
                            const [eh, em] = sched.end_time.split(':').map(Number)
                            const startMins = sh * 60 + sm
                            const endMins = eh * 60 + em
                            const startPct = (startMins / 1440) * 100
                            const widthPct = ((endMins - startMins) / 1440) * 100
                            const showLabel = widthPct > 8
                            return (
                                <div key={r.id} title={r.name} style={{
                                    position: 'absolute',
                                    left: `${startPct}%`,
                                    width: `${widthPct}%`,
                                    top: 0, bottom: 0,
                                    background: scopeColor(r.target_type),
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.5625rem', fontWeight: 700, color: '#fff',
                                    overflow: 'hidden',
                                    borderRight: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                    {showLabel ? r.name : ''}
                                </div>
                            )
                        })}
                        {/* NOW line */}
                        <div style={{
                            position: 'absolute',
                            left: `${(currentMinutes / 1440) * 100}%`,
                            top: 0, bottom: 0, width: 2,
                            background: '#fff', zIndex: 10,
                        }} />
                    </div>
                    {/* NOW label above bar */}
                    <div style={{
                        position: 'absolute',
                        left: `${(currentMinutes / 1440) * 100}%`,
                        top: -16,
                        fontSize: '0.5rem', color: '#fff', fontWeight: 700,
                        transform: 'translateX(-50%)',
                        pointerEvents: 'none',
                    }}>NOW</div>
                </div>
                {/* Hour markers */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                    {['00:00', '06:00', '12:00', '18:00', '24:00'].map(t => (
                        <div key={t} style={{ fontSize: '0.5625rem', color: 'var(--color-text-muted)' }}>{t}</div>
                    ))}
                </div>
            </div>

            {/* ── Zones 5-6 placeholder — added in next task ── */}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd omnipush-cms && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 3: Verify visually in browser**

With dev server running, reload `http://localhost:5173/admin/scheduling`. Expected:
- A dark bar spanning full width below the Next Up row ✓
- If rules exist: coloured blocks proportional to their time windows ✓
- White vertical NOW line at the correct position (e.g. ~58% across for 14:00) ✓
- "NOW" label above the line ✓
- Hour markers 00:00 06:00 12:00 18:00 24:00 below ✓
- If no rules: "No slots scheduled today" text centered in bar ✓

- [ ] **Step 4: Commit**

```bash
cd omnipush-cms
git add src/pages/admin/SchedulePage.tsx
git commit -m "feat(schedule): add 24h proportional timeline bar with NOW line"
```

---

### Task 4: Weekly Coverage Pills, Stats Strip, and Final Cleanup

**Files:**
- Modify: `omnipush-cms/src/pages/admin/SchedulePage.tsx`

Replace the final placeholder with zones 5 and 6. Remove unused imports. Close out the component cleanly.

- [ ] **Step 1: Replace the placeholder with Zones 5 and 6**

Find `{/* ── Zones 5-6 placeholder — added in next task ── */}` and replace it with:

```tsx
            {/* ── Zone 5: Weekly Coverage Pills ── */}
            <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
                    Weekly Coverage — All Infrastructure
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {DAYS.map((day, idx) => {
                        const bit = DAY_BITS[idx]
                        const active = isDayActive(bit)
                        const isToday = bit === todayBit
                        return (
                            <div key={day} style={{
                                flex: 1,
                                borderRadius: 10,
                                border: `1px solid ${active ? 'rgba(124,107,248,0.35)' : 'var(--color-border)'}`,
                                background: active ? 'rgba(124,107,248,0.1)' : 'var(--color-surface-2)',
                                padding: '0.625rem 0.25rem',
                                textAlign: 'center',
                                outline: isToday ? '2px solid var(--color-accent)' : 'none',
                                outlineOffset: 2,
                            }}>
                                <div style={{ fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: active ? 'var(--color-accent)' : 'var(--color-text-muted)', marginBottom: 6 }}>
                                    {day}
                                </div>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', margin: '0 auto', background: active ? 'var(--color-accent)' : 'var(--color-border)' }} />
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── Zone 6: Stats Strip ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {[
                    { value: String(rules.length), label: 'Active Rules', color: 'var(--color-text-primary)' },
                    { value: rules.length > 0 ? 'Active' : 'Idle', label: 'Engine Status', color: rules.length > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' },
                    { value: '0', label: 'Conflicts', color: 'var(--color-text-primary)' },
                ].map(stat => (
                    <div key={stat.label} style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.75rem 0.875rem' }}>
                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                        <div style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{stat.label}</div>
                    </div>
                ))}
            </div>
```

- [ ] **Step 2: Remove unused imports**

In the import line at the top of the file, `MoreVertical`, `Edit2`, `Trash2`, `toast` are no longer used. Remove them:

```tsx
import { Calendar, Plus, Play, Loader2 } from 'lucide-react'
```

Also remove `import toast from 'react-hot-toast'` — it is no longer called anywhere in this file.

- [ ] **Step 3: Verify TypeScript compiles with zero errors**

```bash
cd omnipush-cms && npx tsc --noEmit 2>&1
```
Expected: no output (zero errors). If there are unused-variable warnings, fix them.

- [ ] **Step 4: Full visual verification in browser**

With dev server at `http://localhost:5173/admin/scheduling`, verify all 6 zones render correctly:

1. **Header** — "Schedule Manager" title, calendar icon in indigo, two buttons top-right ✓
2. **Now Playing** — indigo gradient card, play icon, rule name or "No Active Rule", LIVE/IDLE badge ✓
3. **Next Up** — amber dot, next rule name + countdown, or "No more rules today" ✓
4. **Timeline** — 24h bar with coloured blocks, white NOW line, hour markers ✓
5. **Day pills** — 7 pills Mon–Sun, indigo filled for active days, today has accent outline ✓
6. **Stats** — 3 mini cards: rule count, Active/Idle, 0 Conflicts ✓

Also verify loading state: temporarily add `await new Promise(r => setTimeout(r, 2000))` to `loadData`, confirm spinner shows, then remove it.

- [ ] **Step 5: Commit**

```bash
cd omnipush-cms
git add src/pages/admin/SchedulePage.tsx
git commit -m "feat(schedule): complete Hero-First Dashboard — day pills, stats, cleanup"
```

- [ ] **Step 6: Push**

```bash
cd omnipush-cms && git push origin master
```
