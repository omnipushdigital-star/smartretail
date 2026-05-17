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
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-brand-500" size={32} />
                <span className="ml-3 text-text-2">Synchronizing Schedule Data...</span>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Calendar className="text-brand-500" size={32} />
                        Schedule Manager
                    </h1>
                    <p className="text-text-2 mt-2 text-lg">Set dayparting rules and automated content rotation</p>
                </div>
                <div className="flex gap-4">
                    <button className="btn-secondary" onClick={() => navigate('/admin/devices')}>
                        <Plus size={18} /> Add Screen
                    </button>
                    <button onClick={() => navigate('/admin/publish')} className="btn-primary shadow-xl shadow-brand-500/20">
                        Push Content
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-brand-500/10 text-brand-500"><Clock size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{rules.filter(r => r.schedules && r.schedules.length > 0).length} Slots</div>
                        <div className="text-sm font-medium text-text-2">Daily Dayparts</div>
                    </div>
                </div>
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-green-500/10 text-green-500"><CheckCircle2 size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{rules.length > 0 ? 'Active' : 'Idle'}</div>
                        <div className="text-sm font-medium text-text-2">Scheduling Engine</div>
                    </div>
                </div>
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-blue-500/10 text-blue-500"><AlertCircle size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">0 Conflicts</div>
                        <div className="text-sm font-medium text-text-2">Validation Status</div>
                    </div>
                </div>
            </div>

            {/* Weekly Schedule Row View */}
            <div className="card-glass border border-slate-200 dark:border-white/5 rounded-3xl p-8 bg-white/70 dark:bg-surface-900/50 backdrop-blur-xl shadow-xl">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
                    <h3 className="text-xl font-bold text-text-1 flex items-center gap-3">
                        <Calendar size={24} className="text-brand-500" />
                        Weekly Schedule — <span className="text-brand-500">All Infrastructure</span>
                    </h3>
                    <button className="btn-primary text-xs py-2 px-4 rounded-full" onClick={() => navigate('/admin/rules')}>
                        <Plus size={14} /> Add Rule
                    </button>
                </div>

                <div className="relative overflow-x-auto">
                    {/* Header: Days */}
                    <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 mb-6">
                        <div />
                        {DAYS.map(day => (
                            <div key={day} className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-text-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Timeline Rows */}
                    <div className="space-y-6">
                        {rules.length === 0 ? (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                                <Calendar size={48} className="mx-auto text-text-3 mb-4 opacity-20" />
                                <h4 className="text-white font-bold mb-1">No Active Dayparts</h4>
                                <p className="text-text-3 text-sm">Define rules in the Rules section to see them here.</p>
                            </div>
                        ) : rules.map(rule => {
                            const sched = rule.schedules?.[0]
                            const mask = sched?.days_mask ?? 0
                            const timeLabel = sched ? `${sched.start_time?.substring(0, 5)} - ${sched.end_time?.substring(0, 5)}` : 'Always'
                            return (
                                <div key={rule.id} className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 items-center group">
                                    <div className="text-[10px] font-black text-text-2 bg-slate-100 dark:bg-surface-800 py-2 rounded-xl text-center border border-slate-200 dark:border-white/10 shadow-sm uppercase tracking-tighter">
                                        {timeLabel}
                                    </div>
                                    {DAY_BITS.map((bit, idx) => {
                                        const isActive = mask & (1 << bit);
                                        return (
                                            <div key={DAYS[idx]} className="h-10 rounded-xl border border-white/5 flex items-center justify-center transition-all bg-white/[0.01] group-hover:bg-white/[0.03]">
                                                {isActive ? (
                                                    <div
                                                        className="w-full h-full rounded-xl border-2 flex items-center justify-center text-[10px] font-bold"
                                                        style={{ background: scopeColor(rule.target_type), borderColor: 'transparent' }}
                                                        title={rule.name}
                                                    >
                                                        <CheckCircle2 size={12} className="opacity-40" />
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-12 pt-10 border-t border-slate-200 dark:border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-surface-950/50 border border-slate-200 dark:border-white/5 flex items-center justify-between hover:border-brand-500/50 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                <Play size={24} />
                            </div>
                            <div>
                                <div className="text-base font-bold text-text-1">Current Rule</div>
                                <div className="text-sm text-text-2">{currentRule ? currentRule.name : 'No active rule'}</div>
                            </div>
                        </div>
                        <span className={`${currentRule ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-slate-500/10 text-slate-400'} px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider`}>
                            {currentRule ? 'Running' : 'Idle'}
                        </span>
                    </div>
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-surface-950/50 border border-slate-200 dark:border-white/5 flex items-center justify-between hover:border-brand-500/50 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
                                <Clock size={24} />
                            </div>
                            <div>
                                <div className="text-base font-bold text-text-1">Timeline Context</div>
                                <div className="text-sm text-text-2">{rules.length} total scheduled events</div>
                            </div>
                        </div>
                        <span className="text-xs font-black text-text-3 tracking-widest uppercase">All Infrastructure</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
