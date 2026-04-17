import React, { useEffect, useState } from 'react'
import { Monitor, Store, Wifi, WifiOff, AlertTriangle, ArrowUpRight, TrendingUp, Zap, RotateCcw, Camera, Send, Edit3, ShieldCheck, Activity } from 'lucide-react'
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

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000

interface ProjectHeartbeat extends DeviceHeartbeat {
    device?: {
        display_name: string
        store?: { name: string }
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
        if (!currentTenantId) return

        async function load() {
            try {
                const [storesRes, devicesRes, pubsRes, rolesRes] = await Promise.all([
                    supabase.from('stores').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
                    supabase.from('devices').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).is('deleted_at', null),
                    supabase.from('layout_publications').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId).eq('is_active', true).limit(0),
                    supabase.from('roles').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
                ])

                const { data: allDevices } = await supabase.from('devices').select('id, device_code, tenant_id').eq('tenant_id', currentTenantId).is('deleted_at', null)
                const devices = allDevices || []

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
                                if (current.status !== 'playing' && hb.status === 'playing') current.status = 'playing'
                                const curMeta = current.meta as any || {}
                                const oldMeta = hb.meta as any || {}
                                if (!curMeta.storage_total_gb && oldMeta.storage_total_gb) current.meta = { ...oldMeta, ...curMeta }
                            }
                        }
                    }
                    latest = Array.from(hbMap.values())
                }

                const onlineList = latest.filter(h => isOnline(h.last_seen_at))
                const online = onlineList.length

                const activeAlerts = latest.filter(h => !isOnline(h.last_seen_at) || h.status === 'error' || (h.meta as any)?.sync_errors > 0)

                setStats({
                    stores: totalStores, devices: totalDevicesCount, online,
                    playing: onlineList.filter(h => h.status === 'playing').length,
                    offline: Math.max(0, totalDevicesCount - online),
                    activePubs, roles: totalRoles,
                })
                setHeartbeats(latest)
                setAlerts(activeAlerts)
            } catch (err: any) {
                console.error('[Dashboard] Fetch error:', err)
            } finally {
                setLoading(false)
            }
        }

        load()

        // 1. Subscribe to heartbeats
        const hbChannel = supabase
            .channel('dashboard_heartbeats')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'device_heartbeats' 
            }, () => {
                load() 
            })
            .subscribe()

        // 2. Subscribe to devices
        const devChannel = supabase
            .channel('dashboard_devices')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'devices' 
            }, () => {
                load()
            })
            .subscribe()

        // 3. Status Tick: Force re-render every 15s to update "Online" relative to now
        const tick = setInterval(() => {
            setHeartbeats(prev => [...prev]) 
        }, 15000)

        return () => {
            supabase.removeChannel(hbChannel)
            supabase.removeChannel(devChannel)
            clearInterval(tick)
        }
    }, [currentTenantId])

    return (
        <div className="p-6 h-full min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-1 flex items-center gap-3 m-0 tracking-tight">
                        <Monitor className="text-brand-500" size={28} />
                        Network Dashboard
                    </h1>
                    <p className="text-text-2 mt-1.5 text-sm">
                        Real-time overview of your retail display network
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/admin/global')}
                        className="flex items-center gap-2 px-4 py-2 bg-surface-1 border border-border rounded-xl text-text-2 hover:bg-surface-2 hover:text-text-1 font-semibold text-sm cursor-pointer transition-all duration-150 outline-none"
                    >
                        <ShieldCheck size={16} /> Global Hub
                    </button>
                    <button
                        onClick={() => navigate('/admin/publish')}
                        className="flex items-center gap-2.5 px-6 py-2.5 bg-gradient-to-br from-[#ff3d00] to-[#d32f2f] border-none rounded-xl text-white font-extrabold text-sm cursor-pointer shadow-[0_8px_20px_rgba(255,61,0,0.3)] hover:translate-y-[-2px] hover:shadow-[0_12px_24px_rgba(255,61,0,0.4)] transition-all duration-200 uppercase tracking-wider outline-none"
                    >
                        <Send size={18} /> Push All
                    </button>
                </div>
            </div>

            {/* Stat Cards Row */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard icon={<Store size={20} />} label="Total Stores" value={stats.stores} color="text-brand-600 bg-brand-600/10" to="/admin/stores" />
                <StatCard icon={<Monitor size={20} />} label="Total Devices" value={stats.devices} color="text-brand-500 bg-brand-500/10" to="/admin/devices" />
                <StatCard icon={<Wifi size={20} />} label="Online Now" value={stats.online} subValue={`${stats.playing} Playing`} color="text-success bg-success/10 border-success/20" to="/admin/monitoring" />
                <StatCard icon={<WifiOff size={20} />} label="Offline / Idle" value={stats.offline} subValue="Issue" color="text-error bg-error/10 border-error/20" to="/admin/monitoring" />
            </div>

            {/* Metric Tiles Row */}
            <div className="grid grid-cols-4 gap-4 mb-10">
                <MetricTile title="Display Uptime" value={`${((stats.online / (stats.devices || 1)) * 100).toFixed(1)}%`} trend="+0.3% vs last week" icon={<Activity size={20} />} variant="success" to="/admin/monitoring" />
                <MetricTile title="Active Campaigns" value={stats.activePubs} trend="Running layouts" icon={<Zap size={20} />} variant="warning" to="/admin/publish" />
                <MetricTile title="Network Health" value={stats.online === stats.devices && stats.devices > 0 ? 'Optimal' : stats.online > 0 ? 'Good' : 'Critical'} trend={`${stats.playing} out of ${stats.online} playing`} icon={<AlertTriangle size={20} />} variant="info" to="/admin/monitoring" />
                <MetricTile title="System Alerts" value={alerts.length} trend="Click to resolve" icon={<AlertTriangle size={20} />} variant="error" to="/admin/monitoring" />
            </div>

            {/* Bottom Grid */}
            <div className="grid grid-cols-3 gap-6">

                {/* Live Network Status */}
                <div className="col-span-2 bg-surface-1 border border-border rounded-3xl shadow-xl overflow-hidden">
                    <div className="flex justify-between items-center p-6 border-b border-border">
                        <h3 className="m-0 text-lg font-extrabold text-text-1 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                                <Wifi size={18} className="text-brand-500" />
                            </div>
                            Live Displays
                        </h3>
                        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-2 border border-border">
                            {['All', 'Online', 'Issues'].map((label, i) => (
                                <button
                                    key={label}
                                    className={`text-xs font-bold px-3.5 py-1.5 rounded-lg border-none cursor-pointer transition-all duration-150 outline-none ${i === 0 ? 'bg-brand-500 text-white shadow-md' : 'bg-transparent text-text-3 hover:text-text-1'}`}
                                >{label}</button>
                            ))}
                        </div>
                    </div>

                    <div className="p-6 flex flex-col gap-3.5 max-h-[500px] overflow-y-auto">
                        {loading ? (
                            <div className="text-center p-12 text-text-3 text-sm">Loading devices…</div>
                        ) : heartbeats.length === 0 ? (
                            <div className="text-center p-12 text-text-3 text-sm">No devices active yet.</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                {heartbeats.map(hb => {
                                    const online = isOnline(hb.last_seen_at)
                                    return (
                                        <DeviceGridItem key={hb.id} hb={hb} online={online} onEdit={() => navigate('/admin/devices')} />
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-6">

                    {/* Quick Actions */}
                    <div className="bg-surface-1 border border-border rounded-2xl shadow-xl p-6">
                        <h3 className="m-0 mb-5 text-base font-bold text-text-1 flex items-center gap-2">
                            <Zap size={18} className="text-warning" />
                            Quick Actions
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <ActionTile onClick={() => navigate('/admin/menu-builder')} title="Update Menu" sub="Prices & items" icon={<Edit3 size={16} />} />
                            <ActionTile onClick={() => navigate('/admin/publish')} title="Push to All" sub="Broadcast update" icon={<Send size={16} />} />
                            <ActionTile onClick={() => toast.success('Reboot command sent!')} title="Reboot Screens" sub="Remote restart" icon={<RotateCcw size={16} />} />
                            <ActionTile onClick={() => toast.success('Capturing screenshots…')} title="Screenshot" sub="Verify content" icon={<Camera size={16} />} />
                        </div>
                    </div>

                    {/* Alerts */}
                    <div className="bg-surface-1 border border-border rounded-2xl shadow-xl p-6">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="m-0 text-base font-bold text-text-1 flex items-center gap-2">
                                <AlertTriangle size={18} className="text-error" />
                                Alerts
                            </h3>
                            <button className="text-xs font-bold text-brand-500 bg-transparent border-none cursor-pointer outline-none hover:underline">View All</button>
                        </div>
                        {alerts.length > 0 ? (
                            <div className="flex flex-col gap-3">
                                {alerts.slice(0, 3).map((a, i) => {
                                    const isOff = !isOnline(a.last_seen_at);
                                    const hasSyncErr = (a.meta as any)?.sync_errors > 0;
                                    const errText = isOff ? 'Offline' : hasSyncErr ? `${(a.meta as any).sync_errors} Sync Error(s)` : 'Error State';

                                    return (
                                        <div key={i} className="p-3.5 bg-error/10 border border-error/20 rounded-xl flex gap-3">
                                            <AlertTriangle size={14} className="text-error shrink-0 mt-0.5" />
                                            <div>
                                                <div className="text-xs font-bold text-error mb-1">{a.device_code} &middot; {errText}</div>
                                                <div className="text-[0.6875rem] text-text-3">Last seen {formatDistanceToNow(new Date(a.last_seen_at), { addSuffix: true })}</div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-6">
                                <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                                    <ShieldCheck size={18} className="text-success" />
                                </div>
                                <span className="text-[0.8125rem] text-text-3 font-medium">All systems operational</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Sub-components ───────────────────────────────────────────────────────

function DeviceGridItem({ hb, online, onEdit }: { hb: ProjectHeartbeat, online: boolean, onEdit: () => void }) {
    const screenshotUrl = `https://qxialnmorewjgpmpcswr.supabase.co/storage/v1/object/public/device-screenshots/screenshots/${hb.device_code}_latest.jpg`

    return (
        <div className="relative bg-surface-2 hover:bg-surface-3 border border-border hover:border-brand-500/40 rounded-[20px] p-4 transition-all duration-300 cursor-default flex flex-col gap-4 hover:-translate-y-1 hover:shadow-xl group">
            {/* Live Thumbnail / Placeholder */}
            <div className="w-full pt-[56.25%] relative rounded-xl bg-surface-1 overflow-hidden border border-border">
                {online ? (
                    <img
                        src={`${screenshotUrl}?t=${Date.now()}`}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=60&w=400';
                            (e.target as HTMLImageElement).style.opacity = '0.3';
                        }}
                        className="absolute top-0 left-0 w-full h-full object-cover transition-transform duration-500"
                    />
                ) : (
                    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-error/5">
                        <WifiOff size={24} className="text-error/50" />
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                    <div className="text-[0.8125rem] font-extrabold text-text-1 whitespace-nowrap overflow-hidden text-ellipsis">
                        {hb.device_code}
                    </div>
                    <div className="text-[0.6875rem] text-text-3 flex items-center gap-1.5 mt-0.5">
                        {(() => {
                            const hasSyncErr = (hb.meta as any)?.sync_errors > 0;
                            const isOff = !online;
                            const dotClass = isOff ? 'bg-error shadow-[0_0_8px_rgba(255,61,0,0.5)]' : hasSyncErr ? 'bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-brand-500 shadow-[0_0_8px_rgba(0,218,243,0.5)]';
                            const statText = isOff ? 'Offline' : hasSyncErr ? `${(hb.meta as any).sync_errors} Sync Error(s)` : 'Online';
                            return (
                                <>
                                    <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                                    {hb.device?.store?.name || 'Main Office'} &middot; {statText}
                                </>
                            )
                        })()}
                    </div>
                </div>
                <button
                    onClick={onEdit}
                    className="p-1.5 rounded-lg bg-surface-1 border border-border text-text-3 hover:text-brand-500 transition-colors outline-none shrink-0"
                >
                    <ArrowUpRight size={14} />
                </button>
            </div>
        </div>
    )
}

function ActionTile({ title, sub, icon, onClick }: any) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center justify-center p-4 bg-surface-1 hover:bg-surface-2 border border-border rounded-xl gap-2.5 cursor-pointer transition-all duration-200 hover:-translate-y-px outline-none group"
        >
            <div className="p-2 bg-brand-500/10 rounded-lg text-brand-500 flex transform group-hover:scale-110 transition-transform duration-200">
                {icon}
            </div>
            <div className="text-center">
                <div className="text-xs font-bold text-text-1 leading-tight">{title}</div>
                <div className="text-[0.6875rem] text-text-3 mt-0.5">{sub}</div>
            </div>
        </button>
    )
}

function MetricTile({ title, value, trend, icon, variant = 'info', to }: any) {
    const navigate = useNavigate()

    const vClass = {
        success: 'bg-success/5 border-success/20 text-success hover:shadow-[0_15px_35px_rgba(34,197,94,0.12)]',
        warning: 'bg-warning/5 border-warning/20 text-warning hover:shadow-[0_15px_35px_rgba(245,158,11,0.12)]',
        info: 'bg-brand-500/5 border-brand-500/20 text-brand-500 hover:shadow-[0_15px_35px_rgba(0,218,243,0.12)]',
        error: 'bg-error/5 border-error/20 text-error hover:shadow-[0_15px_35px_rgba(255,61,0,0.12)]'
    }[variant as 'success' | 'warning' | 'info' | 'error']

    return (
        <div
            onClick={() => to && navigate(to)}
            className={`p-6 rounded-2xl border backdrop-blur-md cursor-${to ? 'pointer' : 'default'} transition-all duration-300 transform hover:-translate-y-1 ${vClass}`}
        >
            <div className="flex justify-between items-start mb-5">
                <div className="p-2.5 bg-white/5 rounded-xl flex shadow-sm">
                    {icon}
                </div>
                <TrendingUp size={16} className="opacity-30" />
            </div>
            <div className="text-[1.75rem] font-black leading-none mb-2 tracking-tight">{value}</div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest opacity-60 mb-3">{title}</div>
            <div className="text-[0.6875rem] font-bold opacity-80 flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-lg w-fit">
                <ArrowUpRight size={12} /> {trend}
            </div>
        </div>
    )
}

function StatCard({ icon, label, value, subValue, color, to }: {
    icon: React.ReactNode, label: string, value: number | string,
    subValue?: string, color: string, to?: string
}) {
    const navigate = useNavigate()

    return (
        <div
            onClick={() => to && navigate(to)}
            className={`p-6 bg-surface-1 border border-border hover:border-brand-500/40 rounded-3xl backdrop-blur-md flex items-center gap-4 transition-all duration-300 relative group ${to ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl' : 'cursor-default shadow-lg'}`}
        >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${color}`}>
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="text-[1.75rem] font-black text-text-1 tracking-tight leading-none">{value}</div>
                    {subValue && (
                        <div className={`text-[0.65rem] font-black px-2 py-1 rounded-md tracking-widest whitespace-nowrap border ${color}`}>
                            {subValue.toUpperCase()}
                        </div>
                    )}
                </div>
                <div className="text-[0.7rem] font-extrabold text-text-3 uppercase tracking-[0.15em] mt-2 opacity-60">{label}</div>
            </div>
            {to && (
                <div className="absolute top-4 right-4 text-text-3 opacity-30 group-hover:text-brand-500 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex">
                    <ArrowUpRight size={18} />
                </div>
            )}
        </div>
    )
}
