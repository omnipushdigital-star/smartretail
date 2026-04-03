import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Plus, Clock, MoreVertical, Edit2, Play, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { Rule } from '../../types'
import { format } from 'date-fns'

interface TimeSlot {
    id: string
    time: string
    content: string
    color: string
    type: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
    const navigate = useNavigate()
    const { currentTenantId } = useTenant()
    const [selectedLocation] = useState('All Infrastructure')
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

    const activeRulesCount = rules.length
    const dayPartsCount = rules.filter(r => r.schedules && r.schedules.length > 0).length

    // Detect currently active rule
    const now = new Date()
    const dayBit = now.getDay() // 0=Sun, 1=Mon...
    const timeStr = format(now, 'HH:mm:ss')

    const currentRule = rules.find(r => {
        const sched = r.schedules?.[0]
        if (!sched) return false
        if (!(sched.days_mask & (1 << dayBit))) return false
        if (sched.start_time && timeStr < sched.start_time) return false
        if (sched.end_time && timeStr > sched.end_time) return false
        return true
    })

    const slots: TimeSlot[] = rules.map(r => {
        const sched = r.schedules?.[0]
        return {
            id: r.id,
            time: sched ? `${sched.start_time?.substring(0, 5)} - ${sched.end_time?.substring(0, 5)}` : 'Always',
            content: r.name,
            color: r.target_type === 'GLOBAL' ? 'purple' : r.target_type === 'STORE' ? 'orange' : 'blue',
            type: (r as any).layout?.name || 'Layout'
        }
    }).sort((a, b) => a.time.localeCompare(b.time))

    const colors: any = {
        purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20',
        orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20',
        blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
        green: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/20',
    }

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
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{dayPartsCount} Slots</div>
                        <div className="text-sm font-medium text-text-2">Daily Dayparts</div>
                    </div>
                </div>
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-green-500/10 text-green-500"><CheckCircle2 size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{activeRulesCount > 0 ? 'Active' : 'Idle'}</div>
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
                        Weekly Schedule — <span className="text-brand-500">{selectedLocation}</span>
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
                        {slots.length === 0 ? (
                            <div className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                                <Calendar size={48} className="mx-auto text-text-3 mb-4 opacity-20" />
                                <h4 className="text-white font-bold mb-1">No Active Dayparts</h4>
                                <p className="text-text-3 text-sm">Define rules in the Rules section to see them here.</p>
                            </div>
                        ) : slots.map(slot => {
                            const rule = rules.find(r => r.id === slot.id);
                            const mask = rule?.schedules?.[0]?.days_mask || 0;
                            return (
                                <div key={slot.id} className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 items-center group">
                                    <div className="text-[10px] font-black text-text-2 bg-slate-100 dark:bg-surface-800 py-2 rounded-xl text-center border border-slate-200 dark:border-white/10 shadow-sm uppercase tracking-tighter">
                                        {slot.time}
                                    </div>
                                    {DAYS.map((day, idx) => {
                                        const bit = idx === 6 ? 0 : idx + 1; // 0=Mon...5=Sat -> 1..6, 6=Sun -> 0
                                        const isActive = mask & (1 << bit);
                                        return (
                                            <div key={day} className="h-10 rounded-xl border border-white/5 flex items-center justify-center transition-all bg-white/[0.01] group-hover:bg-white/[0.03]">
                                                {isActive ? (
                                                    <div className={`w-full h-full rounded-xl border-2 flex items-center justify-center text-[10px] font-bold ${colors[slot.color]}`} title={slot.content}>
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
                        <span className="text-xs font-black text-text-3 tracking-widest uppercase">{selectedLocation}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
