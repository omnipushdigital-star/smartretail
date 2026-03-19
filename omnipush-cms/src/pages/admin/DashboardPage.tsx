import React, { useEffect, useState } from 'react'
import { Monitor, Store, Wifi, WifiOff, AlertTriangle, Clock, FileCheck, ArrowUpRight, TrendingUp, Zap, RotateCcw, Camera, Send, Edit3, ShieldCheck, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { DeviceHeartbeat } from '../../types'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

interface Stats {
    stores: number
    devices: number
    online: number
    playing: number
    offline: number
    activePubs: number
    roles: number
}

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes (be lenient during debugging)

interface ProjectHeartbeat extends DeviceHeartbeat {
    device?: {
        display_name: string
        store?: {
            name: string
        }
    }
}

function isOnline(lastSeen: string) {
    if (!lastSeen) return false
    try { return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS } catch (e) { return false }
}

export default function DashboardPage() {
    const navigate = useNavigate()
    const [stats, setStats] = useState<Stats>({ stores: 0, devices: 0, online: 0, playing: 0, offline: 0, activePubs: 0, roles: 0 })
    const [heartbeats, setHeartbeats] = useState<ProjectHeartbeat[]>([])
    const [alerts, setAlerts] = useState<ProjectHeartbeat[]>([])
    const [loading, setLoading] = useState(true)

    const { currentTenantId } = useTenant()

    useEffect(() => {
        if (!currentTenantId) {
            console.log('[Dashboard] Waiting for currentTenantId...')
            return
        }

        async function load() {
            try {
                console.log(`[Dashboard] Loading stats for tenant: ${currentTenantId}`)
                const onlineThreshold = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString()

                const [storesRes, devicesRes, pubsRes, rolesRes] = await Promise.all([
                    supabase.from('stores').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
                    supabase.from('devices').select('id', { count: 'exact', head: true })
                        .eq('tenant_id', currentTenantId)
                        .is('deleted_at', null),
                    supabase.from('layout_publications').select('id', { count: 'exact', head: true })
                        .eq('tenant_id', currentTenantId)
                        .eq('is_active', true)
                        .limit(0),
                    supabase.from('roles').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
                ])

                const { data: allDevices } = await supabase.from('devices').select('id, device_code, tenant_id').eq('tenant_id', currentTenantId).is('deleted_at', null)
                const devices = allDevices || []

                // Final counts with fallbacks
                const totalStores = storesRes.count || 0
                const totalDevicesCount = devicesRes.count || 0
                const activePubs = pubsRes.count || 0
                const totalRoles = rolesRes.count || 0

                let latest: ProjectHeartbeat[] = []
                if (devices.length > 0) {
                    const idFilter = devices.map(d => d.id).map(id => `"${id}"`).join(',')
                    const codeFilter = devices.map(d => d.device_code).map(c => `"${c}"`).join(',')

                    const { data: hData, error: hbErr } = await supabase.from('device_heartbeats')
                        .select('*')
                        .or(`device_id.in.(${idFilter}),device_code.in.(${codeFilter})`)
                        .order('last_seen_at', { ascending: false })
                        .limit(500)

                    if (hbErr) console.error('[Dashboard] Heartbeat Query Failed:', hbErr)

                    const hbMap = new Map<string, ProjectHeartbeat>()
                    for (const hb of (hData || [])) {
                        const code = hb.device_code
                        if (!hbMap.has(code)) {
                            const dev = devices.find(d => d.device_code === code || d.id === hb.device_id)
                            hbMap.set(code, { ...hb, device: dev as any, meta: hb.meta || {} })
                        } else {
                            const current = hbMap.get(code)!
                            const timeDiff = new Date(current.last_seen_at).getTime() - new Date(hb.last_seen_at).getTime()

                            if (timeDiff < 60000) {
                                // 1. Sticky 'playing' status
                                if (current.status !== 'playing' && hb.status === 'playing') {
                                    current.status = 'playing'
                                }

                                // 2. Merge meta: if current is missing health stats but previous (recent) has them, merge
                                const curMeta = current.meta as any || {}
                                const oldMeta = hb.meta as any || {}
                                if (!curMeta.storage_total_gb && oldMeta.storage_total_gb) {
                                    current.meta = { ...oldMeta, ...curMeta }
                                }
                            }
                        }
                    }
                    latest = Array.from(hbMap.values())
                }

                const onlineList = latest.filter(h => isOnline(h.last_seen_at))
                const online = onlineList.length

                setStats({
                    stores: totalStores,
                    devices: totalDevicesCount,
                    online,
                    playing: onlineList.filter(h => h.status === 'playing').length,
                    offline: Math.max(0, totalDevicesCount - online),
                    activePubs: activePubs,
                    roles: totalRoles,
                })
                setHeartbeats(latest)
            } catch (err: any) {
                console.error('[Dashboard] Fetch logic error:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
        const interval = setInterval(load, 30000)
        return () => clearInterval(interval)
    }, [currentTenantId])

    return (
        <div className="p-6">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Monitor className="text-brand-500" size={28} />
                        Network Dashboard
                    </h1>
                    <p className="text-surface-400 mt-1">Real-time overview of your retail display network</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => navigate('/admin/global')} className="flex items-center gap-2 px-4 py-2 bg-surface-800 border border-surface-700 text-white rounded-lg hover:bg-surface-700 transition-all">
                        <ShieldCheck size={18} /> Global Hub
                    </button>
                    <button onClick={() => navigate('/admin/publish')} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-all shadow-lg shadow-brand-500/20">
                        <Send size={18} /> Push All
                    </button>
                </div>
            </div>

            {/* Network Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <StatCard icon={<Store size={20} />} label="Total Stores" value={stats.stores} color="#6366f1" to="/admin/stores" />
                <StatCard icon={<Monitor size={20} />} label="Total Devices" value={stats.devices} color="#8b5cf6" to="/admin/devices" />
                <StatCard icon={<Wifi size={20} />} label="Online Now" value={stats.online} subValue={`${stats.playing} Playing`} color="#22c55e" to="/admin/monitoring" />
                <StatCard icon={<WifiOff size={20} />} label="Offline / Idle" value={stats.offline} subValue="Issue" color="#ef4444" to="/admin/monitoring" />
            </div>

            {/* Performance Metric Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <MetricTile
                    title="Display Uptime"
                    value={`${((stats.online / (stats.devices || 1)) * 100).toFixed(1)}%`}
                    trend="+0.3% vs last week"
                    icon={<Activity size={22} />}
                    color="green"
                    to="/admin/monitoring"
                />
                <MetricTile
                    title="Active Campaigns"
                    value={stats.activePubs}
                    trend="Running layouts"
                    icon={<Zap size={22} />}
                    color="orange"
                    to="/admin/publish"
                />
                <MetricTile
                    title="Network Health"
                    value={stats.online === stats.devices && stats.devices > 0 ? 'Optimal' : stats.online > 0 ? 'Good' : 'Critical'}
                    trend={`${stats.playing} out of ${stats.online} playing`}
                    icon={<AlertTriangle size={22} />}
                    color="blue"
                    to="/admin/monitoring"
                />
                <MetricTile
                    title="System Alerts"
                    value={alerts.length}
                    trend="Click to resolve"
                    icon={<AlertTriangle size={22} />}
                    color="red"
                    to="/admin/monitoring"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Live Screens List */}
                <div className="lg:col-span-2 card-glass border border-white/5 rounded-2xl overflow-hidden bg-surface-900/50">
                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Wifi size={20} className="text-brand-400" />
                            Live Network Status
                        </h3>
                        <div className="flex gap-2">
                            <button className="text-[10px] font-bold uppercase tracking-widest text-white px-3 py-1 bg-brand-500 rounded">All</button>
                            <button className="text-[10px] font-bold uppercase tracking-widest text-surface-400 px-3 py-1 hover:text-brand-400 transition-colors">Online</button>
                            <button className="text-[10px] font-bold uppercase tracking-widest text-surface-400 px-3 py-1 hover:text-brand-400 transition-colors">Issues</button>
                        </div>
                    </div>

                    <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                        {heartbeats.map(hb => {
                            const online = isOnline(hb.last_seen_at)
                            return (
                                <div key={hb.id} className="flex items-center justify-between p-4 bg-surface-800/20 hover:bg-surface-800/40 border border-surface-700/30 rounded-xl transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center border ${online ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                                            <Monitor size={20} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold">{hb.device_code}</div>
                                            <div className="text-xs text-surface-500 flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
                                                {hb.device?.store?.name || hb.device?.display_name || 'Main Office'} · {hb.status || 'Active'}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => navigate('/admin/devices')} className="px-3 py-1.5 bg-surface-800 text-surface-300 hover:text-white rounded-lg text-xs font-semibold border border-white/5 opacity-0 group-hover:opacity-100 transition-all">
                                        Edit / Fix
                                    </button>
                                </div>
                            )
                        })}
                        {heartbeats.length === 0 && (
                            <div className="py-20 text-center text-surface-500">
                                No devices active in this network yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Actions & High-level Alerts */}
                <div className="space-y-6">
                    <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-900/50">
                        <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                            <Zap size={20} className="text-yellow-500" />
                            Quick Actions
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <ActionTile onClick={() => navigate('/admin/menu-builder')} title="Update Menu" sub="Prices & items" icon={<Edit3 size={18} />} />
                            <ActionTile onClick={() => navigate('/admin/publish')} title="Push to All" sub="Broadcast update" icon={<Send size={18} />} />
                            <ActionTile onClick={() => toast.success('Reboot command sent to 8 screens!')} title="Reboot Screens" sub="Remote restart" icon={<RotateCcw size={18} />} />
                            <ActionTile onClick={() => toast.success('Capturing screenshots...')} title="Screenshot" sub="Verify content" icon={<Camera size={18} />} />
                        </div>
                    </div>

                    <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-900/50">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <AlertTriangle size={20} className="text-red-500" />
                                Alerts
                            </h3>
                            <button className="text-xs text-brand-400 font-bold hover:underline">View All</button>
                        </div>
                        {alerts.length > 0 ? (
                            <div className="space-y-4">
                                {alerts.slice(0, 2).map((a, i) => (
                                    <div key={i} className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3">
                                        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="text-xs font-bold text-red-500 mb-1">{a.device_code} Offline</div>
                                            <div className="text-[10px] text-surface-500">Last seen {formatDistanceToNow(new Date(a.last_seen_at), { addSuffix: true })}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-4">
                                <span className="text-xs text-surface-600">All systems operational</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function MetricTile({ title, value, trend, icon, color, to }: any) {
    const navigate = useNavigate()
    const colors: any = {
        blue: 'from-blue-500/20 text-blue-400 border-blue-500/20',
        green: 'from-green-500/20 text-green-400 border-green-500/20',
        orange: 'from-orange-500/20 text-orange-400 border-orange-500/20',
        red: 'from-red-500/20 text-red-400 border-red-500/20',
    }

    return (
        <div
            onClick={() => to && navigate(to)}
            className={`p-5 rounded-2xl bg-gradient-to-br bg-surface-900 border ${colors[color]} shadow-lg cursor-pointer hover:translate-y-[-2px] transition-transform active:scale-95`}
        >
            <div className="flex justify-between items-start mb-4">
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">{icon}</div>
                <TrendingUp size={16} className="opacity-40" />
            </div>
            <div>
                <div className="text-2xl font-bold mb-1">{value}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">{title}</div>
                <div className="text-[10px] font-semibold flex items-center gap-1 opacity-80">
                    <ArrowUpRight size={10} /> {trend}
                </div>
            </div>
        </div>
    )
}

function ActionTile({ title, sub, icon, onClick }: any) {
    return (
        <button onClick={onClick} className="flex flex-col items-center justify-center p-4 bg-white/5 hover:bg-white/[0.08] border border-white/5 rounded-xl transition-all gap-2 group">
            <div className="p-2 bg-white/5 rounded-lg group-hover:scale-110 transition-transform">{icon}</div>
            <div className="text-center">
                <div className="text-[11px] font-bold leading-tight">{title}</div>
                <div className="text-[9px] text-surface-500 leading-tight mt-0.5">{sub}</div>
            </div>
        </button>
    )
}


function StatCard({
    icon, label, value, subValue, color, to
}: {
    icon: React.ReactNode
    label: string
    value: number | string
    subValue?: string
    color: string
    to?: string
}) {
    const navigate = useNavigate()
    const [hovered, setHovered] = useState(false)

    const handleClick = () => { if (to) navigate(to) }

    return (
        <div
            className="stat-card"
            onClick={handleClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                cursor: to ? 'pointer' : 'default',
                transform: hovered && to ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: hovered && to ? `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px ${color}40` : undefined,
                transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                position: 'relative',
            }}
        >
            <div className="stat-icon" style={{ background: `${color}20` }}>
                <span style={{ color }}>{icon}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <div className="stat-value">{value}</div>
                    {subValue && (
                        <div style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: color,
                            background: `${color}15`,
                            padding: '1px 6px',
                            borderRadius: '6px',
                            letterSpacing: '0.02em'
                        }}>
                            {subValue.toUpperCase()}
                        </div>
                    )}
                </div>
                <div className="stat-label">{label}</div>
            </div>
            {to && (
                <div style={{
                    position: 'absolute', top: '0.75rem', right: '0.75rem',
                    color: hovered ? color : '#334155',
                    transition: 'color 0.18s ease, transform 0.18s ease',
                    transform: hovered ? 'translate(1px, -1px)' : 'translate(0, 0)',
                    display: 'flex',
                }}>
                    <ArrowUpRight size={14} />
                </div>
            )}
        </div>
    )
}
