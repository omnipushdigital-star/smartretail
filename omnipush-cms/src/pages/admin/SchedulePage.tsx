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
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Calendar className="text-brand-500" size={28} />
                        Schedule Manager
                    </h1>
                    <p className="text-surface-400 mt-1">Set dayparting rules and automated content rotation</p>
                </div>
                <div className="flex gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-surface-800 border border-surface-700 text-white rounded-lg hover:bg-surface-700 transition-all">
                        <Plus size={18} /> Add Screen
                    </button>
                    <button onClick={() => toast.success('Schedule deployed to 12 screens!')} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-all shadow-lg shadow-brand-500/20">
                        Push Content
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="stat-card border border-white/5 bg-surface-900/50">
                    <div className="stat-icon bg-brand-500/10 text-brand-500"><Clock size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-white">4 Slots</div>
                        <div className="stat-label">Daily Dayparts</div>
                    </div>
                </div>
                <div className="stat-card border border-white/5 bg-surface-900/50">
                    <div className="stat-icon bg-green-500/10 text-green-500"><CheckCircle2 size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-white">Active</div>
                        <div className="stat-label">Scheduling Engine</div>
                    </div>
                </div>
                <div className="stat-card border border-white/5 bg-surface-900/50">
                    <div className="stat-icon bg-blue-500/10 text-blue-500"><AlertCircle size={20} /></div>
                    <div>
                        <div className="text-2xl font-bold text-white">2 Conflicts</div>
                        <div className="stat-label">Automation Errors</div>
                    </div>
                </div>
            </div>

            {/* Weekly Schedule Row View */}
            <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-900/50 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Calendar size={20} className="text-brand-400" />
                        Weekly Schedule — {selectedLocation}
                    </h3>
                    <button className="btn-primary text-xs py-1.5 px-3">
                        <Plus size={14} /> Add Rule
                    </button>
                </div>

                <div className="relative overflow-x-auto">
                    {/* Header: Days */}
                    <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-4 mb-4">
                        <div />
                        {DAYS.map(day => (
                            <div key={day} className="text-center text-xs font-bold uppercase tracking-widest text-surface-500">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Timeline Rows */}
                    <div className="space-y-4">
                        {slots.map(slot => (
                            <div key={slot.id} className="grid grid-cols-[100px_repeat(7,1fr)] gap-4 items-center group">
                                <div className="text-xs font-bold text-surface-400 bg-surface-950/50 py-2 rounded-lg text-center border border-white/5">
                                    {slot.time}
                                </div>
                                <div
                                    className={`col-span-5 relative py-3 px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between font-medium text-sm group-hover:scale-[1.01] ${colors[slot.color]}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-current opacity-60" />
                                        {slot.content}
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-1 hover:bg-current/10 rounded"><Edit2 size={14} /></button>
                                        <button className="p-1 hover:bg-current/10 rounded"><MoreVertical size={14} /></button>
                                    </div>
                                </div>
                                <div
                                    className={`col-span-2 relative py-3 px-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between font-medium text-sm group-hover:scale-[1.01] ${slot.time === '6-11am' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : colors[slot.color]}`}
                                >
                                    <div className="flex items-center gap-3">
                                        {slot.time === '6-11am' ? 'Weekend Special' : slot.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-surface-950/50 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                                <Play size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-white">Current Rule</div>
                                <div className="text-xs text-surface-500">Lunch Menu active across 8 displays</div>
                            </div>
                        </div>
                        <span className="badge badge-green">Running</span>
                    </div>
                    <div className="p-4 rounded-xl bg-surface-950/50 border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center text-brand-400">
                                <Clock size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-white">Next Transition</div>
                                <div className="text-xs text-surface-500">Snacks & Happy Hours at 4:00 PM</div>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-surface-500 tracking-wider">T-MINUS 12M</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
