import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { MapPin, Users, Film, Layout, Send, ChevronRight } from 'lucide-react'

const STAGES = [
    { id: 'stores', name: 'Stores', path: '/admin/stores', icon: MapPin },
    { id: 'roles', name: 'Roles', path: '/admin/roles', icon: Users },
    { id: 'media', name: 'Media', path: '/admin/media', icon: Film },
    { id: 'playlists', name: 'Playlists', path: '/admin/playlists', icon: Film },
    { id: 'layouts', name: 'Layouts', path: '/admin/layouts', icon: Layout },
    { id: 'publish', name: 'Publish', path: '/admin/publish', icon: Send },
]

export default function WorkflowBanner() {
    const location = useLocation()

    // Find the current stage index
    const currentPath = location.pathname
    const activeIndex = STAGES.findIndex(s => currentPath.startsWith(s.path))

    return (
        <div className="w-full bg-surface-950/80 border-b border-white/5 backdrop-blur-xl overflow-x-auto no-scrollbar" style={{ position: 'sticky', top: '72px', zIndex: 90 }}>
            <div className="flex items-center justify-center min-w-max px-8 py-4 gap-4">
                {STAGES.map((stage, idx) => {
                    const Icon = stage.icon
                    const isCompleted = idx < activeIndex
                    const isActive = idx === activeIndex
                    const isPending = idx > activeIndex

                    return (
                        <React.Fragment key={stage.id}>
                            <Link
                                to={stage.path}
                                className={`flex items-center gap-3 px-4 py-2 rounded-xl transition-all duration-300 group ${isActive
                                    ? 'bg-brand-500/10 text-white ring-1 ring-brand-500/50 shadow-[0_0_15px_rgba(var(--color-brand-500-rgb),0.15)]'
                                    : isCompleted
                                        ? 'text-emerald-500 hover:text-emerald-400'
                                        : 'text-surface-500 hover:text-surface-300'
                                    }`}
                            >
                                <div className={`flex items-center justify-center w-7 h-7 rounded-lg text-[11px] font-black border transition-all duration-300 ${isActive
                                    ? 'bg-brand-500 border-brand-400 text-white shadow-[0_0_10px_rgba(var(--color-brand-500-rgb),0.5)]'
                                    : isCompleted
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                                        : 'bg-surface-900 border-white/5 text-surface-500 group-hover:border-white/10'
                                    }`}>
                                    {isCompleted ? '✓' : idx + 1}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] opacity-40 leading-none mb-1 ${isActive ? 'text-brand-400' : ''}`}>
                                        Stage 0{idx + 1}
                                    </span>
                                    <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                                        {stage.name}
                                    </span>
                                </div>
                            </Link>

                            {idx < STAGES.length - 1 && (
                                <div className="w-4 h-px bg-white/5 mx-1 opacity-50" />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
