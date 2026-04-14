import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { MapPin, Users, Film, Layout, Send, CheckCircle2 } from 'lucide-react'

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
    const activeIndex = STAGES.findIndex(s => location.pathname.startsWith(s.path))

    return (
        <div className="sticky top-[72px] z-[90] w-full bg-surface-1/95 backdrop-blur-xl border-b border-white/5 overflow-x-auto">
            <div className="flex items-center justify-center gap-1 py-2.5 px-6 min-w-max">
                {STAGES.map((stage, idx) => {
                    const isCompleted = idx < activeIndex
                    const isActive = idx === activeIndex
                    const Icon = stage.icon

                    return (
                        <React.Fragment key={stage.id}>
                            <Link
                                to={stage.path}
                                className={`flex items-center gap-2.5 py-1.5 px-3.5 rounded-xl transition-all duration-200 outline-none
                                    ${isActive 
                                        ? 'bg-brand-500/10 border-brand-500/30 border shadow-[0_0_16px_rgba(0,218,243,0.12)]' 
                                        : 'border border-transparent hover:bg-surface-2'
                                    }`}
                            >
                                {/* Stage dot */}
                                <div className={`flex items-center justify-center w-[26px] h-[26px] rounded-lg text-[11px] font-extrabold shrink-0 transition-all
                                    ${isActive
                                        ? 'bg-brand-500 border-brand-500 text-white border-[1.5px]'
                                        : isCompleted
                                            ? 'bg-green-500/15 border-green-500/50 text-green-500 border-[1.5px]'
                                            : 'bg-white/5 border-white/10 text-white/25 border-[1.5px]'
                                    }`}
                                >
                                    {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
                                </div>

                                {/* Labels */}
                                <div className="flex flex-col">
                                    <span className={`text-xs font-extrabold uppercase tracking-widest leading-tight
                                        ${isActive
                                            ? 'text-white'
                                            : isCompleted
                                                ? 'text-green-500'
                                                : 'text-white/45'
                                        }`}
                                    >
                                        {stage.name}
                                    </span>
                                </div>
                            </Link>

                            {idx < STAGES.length - 1 && (
                                <div className="w-5 h-[1px] bg-white/10 shrink-0" />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}

