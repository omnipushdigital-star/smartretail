import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Plus, Play, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { Rule } from '../../types'
import { format } from 'date-fns'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// getDay() shift amounts for days_mask bitmask — Mon=1, Tue=2, ... Sat=6, Sun=0
const DAY_BITS = [1, 2, 3, 4, 5, 6, 0]

function formatCountdown(startTime: string, currentMinutes: number): string {
    if (!startTime) return ''
    const [h, m] = startTime.split(':').map(Number)
    const targetMins = h * 60 + m
    const diffMins = targetMins - currentMinutes
    if (diffMins <= 0) return ''
    const hrs = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return hrs > 0 ? (mins > 0 ? `in ${hrs}h ${mins}m` : `in ${hrs}h`) : `in ${mins}m`
}

function scopeColor(targetType: string): string {
    if (targetType === 'GLOBAL') return 'rgba(124,107,248,0.4)'
    if (targetType === 'STORE') return 'rgba(245,158,11,0.3)'
    return 'rgba(59,130,246,0.3)'
}

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
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9375rem', margin: '0.375rem 0 0' }}>
                        Set dayparting rules and automated content rotation
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn-secondary" onClick={() => navigate('/admin/devices')}>
                        <Plus size={16} aria-hidden="true" /> Add Screen
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
                                ? (() => {
                                    const s = currentRule.schedules?.[0]?.start_time?.substring(0, 5)
                                    const e = currentRule.schedules?.[0]?.end_time?.substring(0, 5)
                                    const timeRange = (!s && !e) ? 'All day' : `${s ?? '?'} – ${e ?? '?'}`
                                    return `${currentRule.target_type} · Layout: ${currentRule.layout?.name ?? '—'} · ${timeRange}`
                                  })()
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
                            const widthPct = Math.max(0, ((endMins - startMins) / 1440) * 100)
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
                        <div aria-hidden="true" style={{
                            position: 'absolute',
                            left: `${(currentMinutes / 1440) * 100}%`,
                            top: 0, bottom: 0, width: 2,
                            background: '#fff', zIndex: 10,
                        }} />
                    </div>
                    {/* NOW label above the bar */}
                    <div aria-hidden="true" style={{
                        position: 'absolute',
                        left: `${Math.max(2, Math.min(98, (currentMinutes / 1440) * 100))}%`,
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

        </div>
    )
}
