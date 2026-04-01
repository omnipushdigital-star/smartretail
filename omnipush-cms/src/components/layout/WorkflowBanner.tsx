import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { MapPin, Users, Film, Layout, Send, CheckCircle2 } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

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
    const { theme } = useTheme()
    const isDark = theme === 'dark'
    const activeIndex = STAGES.findIndex(s => location.pathname.startsWith(s.path))

    const bannerBg = isDark ? 'rgba(8,12,20,0.9)' : 'rgba(255,255,255,0.95)'
    const borderColor = isDark ? 'rgba(0,218,243,0.08)' : 'rgba(0,218,243,0.12)'
    const connectorBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'

    return (
        <div style={{
            position: 'sticky',
            top: 72,
            zIndex: 90,
            width: '100%',
            background: bannerBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${borderColor}`,
            overflowX: 'auto',
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '10px 24px',
                minWidth: 'max-content',
            }}>
                {STAGES.map((stage, idx) => {
                    const isCompleted = idx < activeIndex
                    const isActive = idx === activeIndex
                    const Icon = stage.icon

                    // Per-stage tokens
                    const linkBg = isActive
                        ? 'rgba(0,218,243,0.08)'
                        : 'transparent'
                    const linkBorder = isActive
                        ? '1px solid rgba(0,218,243,0.3)'
                        : '1px solid transparent'
                    const linkShadow = isActive
                        ? '0 0 16px rgba(0,218,243,0.12)'
                        : 'none'

                    const dotBg = isActive
                        ? '#00daf3'
                        : isCompleted
                            ? 'rgba(34,197,94,0.15)'
                            : isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
                    const dotBorder = isActive
                        ? '1.5px solid #00daf3'
                        : isCompleted
                            ? '1.5px solid rgba(34,197,94,0.5)'
                            : isDark ? '1.5px solid rgba(255,255,255,0.08)' : '1.5px solid rgba(0,0,0,0.1)'
                    const dotColor = isActive
                        ? '#fff'
                        : isCompleted
                            ? '#22c55e'
                            : isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8'

                    const labelColor = isActive
                        ? '#00daf3'
                        : isCompleted
                            ? '#22c55e'
                            : isDark ? 'rgba(255,255,255,0.35)' : '#94a3b8'
                    const nameColor = isActive
                        ? isDark ? '#f1f5f9' : '#0f172a'
                        : isCompleted
                            ? '#22c55e'
                            : isDark ? 'rgba(255,255,255,0.45)' : '#64748b'

                    return (
                        <React.Fragment key={stage.id}>
                            <Link
                                to={stage.path}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '7px 14px',
                                    borderRadius: 10,
                                    textDecoration: 'none',
                                    background: linkBg,
                                    border: linkBorder,
                                    boxShadow: linkShadow,
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer',
                                }}
                            >
                                {/* Stage dot */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 26,
                                    height: 26,
                                    borderRadius: 7,
                                    background: dotBg,
                                    border: dotBorder,
                                    color: dotColor,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    flexShrink: 0,
                                    transition: 'all 0.2s',
                                }}>
                                    {isCompleted ? <CheckCircle2 size={14} /> : idx + 1}
                                </div>

                                {/* Labels */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={{
                                        fontSize: '0.6rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.15em',
                                        color: labelColor,
                                        lineHeight: 1,
                                    }}>
                                        Stage {String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        color: nameColor,
                                        lineHeight: 1.2,
                                    }}>
                                        {stage.name}
                                    </span>
                                </div>
                            </Link>

                            {idx < STAGES.length - 1 && (
                                <div style={{
                                    width: 20,
                                    height: 1,
                                    background: connectorBg,
                                    flexShrink: 0,
                                }} />
                            )}
                        </React.Fragment>
                    )
                })}
            </div>
        </div>
    )
}
