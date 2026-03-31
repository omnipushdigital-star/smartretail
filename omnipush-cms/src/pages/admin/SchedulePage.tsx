import React, { useState } from 'react'
import { Calendar, Plus, Clock, MoreVertical, Edit2, Play, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface TimeSlot {
    id: string
    time: string
    content: string
    color: string
    type: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
    const [selectedLocation, setSelectedLocation] = useState('Connaught Place')

    const slots: TimeSlot[] = [
        { id: '1', time: '6-11am', content: 'Breakfast Menu', color: 'purple', type: 'Playlist' },
        { id: '2', time: '11-4pm', content: 'Lunch Menu (All Week)', color: 'orange', type: 'Playlist' },
        { id: '3', time: '4-7pm', content: 'Snacks & Happy Hours', color: 'blue', type: 'Playlist' },
        { id: '4', time: '7-11pm', content: 'Dinner Menu', color: 'green', type: 'Playlist' },
    ]

    const colors: any = {
        purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20',
        orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20',
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
        green: 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20',
    }

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Calendar className="text-brand-500" size={32} />
                        Schedule Manager
                    </h1>
                    <p className="text-slate-500 dark:text-surface-400 mt-2 text-lg">Set dayparting rules and automated content rotation</p>
                </div>
                <div className="flex gap-4">
                    <button className="btn-secondary">
                        <Plus size={18} /> Add Screen
                    </button>
                    <button onClick={() => toast.success('Schedule deployed to 12 screens!')} className="btn-primary shadow-xl shadow-brand-500/20">
                        Push Content
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-brand-500/10 text-brand-500"><Clock size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">4 Slots</div>
                        <div className="text-sm font-medium text-slate-500 dark:text-surface-400">Daily Dayparts</div>
                    </div>
                </div>
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-green-500/10 text-green-500"><CheckCircle2 size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">Active</div>
                        <div className="text-sm font-medium text-slate-500 dark:text-surface-400">Scheduling Engine</div>
                    </div>
                </div>
                <div className="stat-card border border-slate-200 dark:border-white/5 bg-white dark:bg-surface-900/50 shadow-sm">
                    <div className="stat-icon bg-blue-500/10 text-blue-500"><AlertCircle size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">2 Conflicts</div>
                        <div className="text-sm font-medium text-slate-500 dark:text-surface-400">Automation Errors</div>
                    </div>
                </div>
            </div>

            {/* Weekly Schedule Row View */}
            <div className="card-glass border border-slate-200 dark:border-white/5 rounded-3xl p-8 bg-white/70 dark:bg-surface-900/50 backdrop-blur-xl shadow-xl">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                        <Calendar size={24} className="text-brand-500" />
                        Weekly Schedule — <span className="text-brand-500">{selectedLocation}</span>
                    </h3>
                    <button className="btn-primary text-xs py-2 px-4 rounded-full">
                        <Plus size={14} /> Add Rule
                    </button>
                </div>

                <div className="relative overflow-x-auto">
                    {/* Header: Days */}
                    <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 mb-6">
                        <div />
                        {DAYS.map(day => (
                            <div key={day} className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-surface-500">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Timeline Rows */}
                    <div className="space-y-6">
                        {slots.map(slot => (
                            <div key={slot.id} className="grid grid-cols-[120px_repeat(7,1fr)] gap-4 items-center group">
                                <div className="text-xs font-black text-slate-500 dark:text-surface-400 bg-slate-100 dark:bg-surface-950/50 py-3 rounded-2xl text-center border border-slate-200 dark:border-white/5 shadow-sm">
                                    {slot.time}
                                </div>
                                <div
                                    className={`col-span-5 relative py-4 px-6 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between font-bold text-sm group-hover:scale-[1.02] group-hover:shadow-lg ${colors[slot.color]}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-3 h-3 rounded-full bg-current opacity-80" />
                                        {slot.content}
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-2 hover:bg-current/10 rounded-lg"><Edit2 size={16} /></button>
                                        <button className="p-2 hover:bg-current/10 rounded-lg"><MoreVertical size={16} /></button>
                                    </div>
                                </div>
                                <div
                                    className={`col-span-2 relative py-4 px-6 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between font-bold text-sm group-hover:scale-[1.02] group-hover:shadow-lg ${slot.time === '6-11am' ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' : colors[slot.color]}`}
                                >
                                    <div className="flex items-center gap-3">
                                        {slot.time === '6-11am' ? 'Weekend Special' : slot.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-12 pt-10 border-t border-slate-200 dark:border-white/5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-surface-950/50 border border-slate-200 dark:border-white/5 flex items-center justify-between hover:border-brand-500/50 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                <Play size={24} />
                            </div>
                            <div>
                                <div className="text-base font-bold text-slate-800 dark:text-white">Current Rule</div>
                                <div className="text-sm text-slate-500 dark:text-surface-500">Lunch Menu active across 8 displays</div>
                            </div>
                        </div>
                        <span className="bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Running</span>
                    </div>
                    <div className="p-6 rounded-2xl bg-slate-50 dark:bg-surface-950/50 border border-slate-200 dark:border-white/5 flex items-center justify-between hover:border-brand-500/50 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
                                <Clock size={24} />
                            </div>
                            <div>
                                <div className="text-base font-bold text-slate-800 dark:text-white">Next Transition</div>
                                <div className="text-sm text-slate-500 dark:text-surface-500">Snacks & Happy Hours at 4:00 PM</div>
                            </div>
                        </div>
                        <span className="text-xs font-black text-slate-400 dark:text-surface-500 tracking-widest">T-MINUS 12M</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
