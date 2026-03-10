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
        <div className="w-full bg-surface-950/50 border-b border-white/5 backdrop-blur-sm overflow-x-auto no-scrollbar">
            <div className="flex items-center justify-center min-w-max px-6 py-3 gap-2">
                {STAGES.map((stage, idx) => {
                    const Icon = stage.icon
                    const isCompleted = idx < activeIndex
                    const isActive = idx === activeIndex
                    const isPending = idx > activeIndex

                    return (
                        <React.Fragment key={stage.id}>
                            <Link
                                to={stage.path}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${isActive
                                        ? 'bg-brand-600/10 text-brand-500 ring-1 ring-brand-500/50 shadow-lg shadow-brand-500/10'
                                        : isCompleted
                                            ? 'text-emerald-500 hover:text-emerald-400'
                                            : 'text-surface-500 hover:text-surface-300'
                                    }`}
                            >
                                <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black border ${isActive
                                        ? 'bg-brand-600 border-brand-500 text-white'
                                        : isCompleted
                                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500'
                                            : 'bg-surface-900 border-surface-700 text-surface-500'
                                    }`}>
                                    {isCompleted ? '✓' : idx + 1}
                                </div>
                                <span className={`text-xs font-bold uppercase tracking-widest ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                                    {stage.name}
                                </span>
                            </Link>

                            {idx < STAGES.length - 1 && (
                                <ChevronRight size={14} className="text-surface-700 mx-1" />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
