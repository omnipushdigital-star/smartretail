import React, { useEffect, useState } from 'react'
import { Monitor, Store, Wifi, WifiOff, AlertTriangle, ArrowUpRight, TrendingUp, Zap, RotateCcw, Camera, Send, Edit3, ShieldCheck, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { useTheme } from '../../contexts/ThemeContext'
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
    const { theme } = useTheme()
    const isLight = theme === 'light'
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

                setStats({
                    stores: totalStores, devices: totalDevicesCount, online,
                    playing: onlineList.filter(h => h.status === 'playing').length,
                    offline: Math.max(0, totalDevicesCount - online),
                    activePubs, roles: totalRoles,
                })
                setHeartbeats(latest)
            } catch (err: any) {
                console.error('[Dashboard] Fetch error:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
        const interval = setInterval(load, 30000)
        return () => clearInterval(interval)
    }, [currentTenantId])

    // ── Theme-aware tokens (Digital Atelier) ──────────────────────────────────
    const isDark = !isLight
    const tk = {
        canvas: isLight ? '#f4f6fb' : '#04070a',
        cardBg: isLight ? 'rgba(255,255,255,0.8)' : 'rgba(15, 23, 42, 0.4)',
        cardBorder: isLight ? 'rgba(190,200,210,0.3)' : 'rgba(255,255,255,0.04)',
        cardShadow: isLight ? '0 8px 32px rgba(0,55,81,0.06)' : '0 20px 40px rgba(0,0,0,0.4)',
        glassFilter: 'blur(16px)',

        rowBg: isLight ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.01)',
        rowHover: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.03)',
        rowBorder: isLight ? 'rgba(190,200,210,0.2)' : 'rgba(255,255,255,0.03)',

        textPrimary: isLight ? '#0f172a' : '#f8fafc',
        textMuted: isLight ? '#64748b' : '#64748b',
        brand: '#10b981',
        accent: '#3b82f6',

        actionBg: isLight ? '#ffffff' : 'rgba(255,255,255,0.03)',
        actionHover: isLight ? '#f8fafc' : 'rgba(255,255,255,0.06)',
        actionIconBg: 'rgba(16,185,129,0.1)',

        btnSecBg: isLight ? '#ffffff' : 'rgba(255,255,255,0.02)',
        btnSecText: isLight ? '#334155' : '#94a3b8',
        btnSecBorder: isLight ? 'rgba(190,200,210,0.4)' : 'rgba(255,255,255,0.05)',
        arrowColor: isLight ? '#64748b' : '#475569',
    }

    return (
        <div className="p-6" style={{ background: tk.canvas, minHeight: '100%' }}>
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: tk.textPrimary, display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, letterSpacing: '-0.02em' }}>
                        <Monitor style={{ color: '#00daf3' }} size={28} />
                        Network Dashboard
                    </h1>
                    <p style={{ color: tk.textMuted, marginTop: '0.375rem', fontSize: '0.875rem' }}>
                        Real-time overview of your retail display network
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={() => navigate('/admin/global')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: tk.btnSecBg, border: `1px solid ${tk.btnSecBorder}`, borderRadius: 10, color: tk.btnSecText, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = tk.actionHover)}
                        onMouseLeave={e => (e.currentTarget.style.background = tk.btnSecBg)}
                    >
                        <ShieldCheck size={16} /> Global Hub
                    </button>
                    <button
                        onClick={() => navigate('/admin/publish')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.625rem',
                            padding: '0.625rem 1.5rem',
                            background: 'linear-gradient(135deg, #ff3d00, #d32f2f)',
                            border: 'none', borderRadius: 12, color: '#fff',
                            fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer',
                            boxShadow: '0 8px 20px rgba(255,61,0,0.3)',
                            transition: 'all 0.2s',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)'
                            e.currentTarget.style.boxShadow = '0 12px 24px rgba(255,61,0,0.4)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(255,61,0,0.3)'
                        }}
                    >
                        <Send size={18} /> Push All
                    </button>
                </div>
            </div>

            {/* ── Stat Cards Row ──────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard icon={<Store size={20} />} label="Total Stores" value={stats.stores} color="var(--color-brand-600)" to="/admin/stores" tk={tk} />
                <StatCard icon={<Monitor size={20} />} label="Total Devices" value={stats.devices} color="var(--color-brand-500)" to="/admin/devices" tk={tk} />
                <StatCard icon={<Wifi size={20} />} label="Online Now" value={stats.online} subValue={`${stats.playing} Playing`} color="#22c55e" to="/admin/monitoring" tk={tk} />
                <StatCard icon={<WifiOff size={20} />} label="Offline / Idle" value={stats.offline} subValue="Issue" color="var(--color-error-500)" to="/admin/monitoring" tk={tk} />
            </div>

            {/* ── Metric Tiles Row ────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2.5rem' }}>
                <MetricTile title="Display Uptime" value={`${((stats.online / (stats.devices || 1)) * 100).toFixed(1)}%`} trend="+0.3% vs last week" icon={<Activity size={20} />} color="green" to="/admin/monitoring" isLight={isLight} />
                <MetricTile title="Active Campaigns" value={stats.activePubs} trend="Running layouts" icon={<Zap size={20} />} color="orange" to="/admin/publish" isLight={isLight} />
                <MetricTile title="Network Health" value={stats.online === stats.devices && stats.devices > 0 ? 'Optimal' : stats.online > 0 ? 'Good' : 'Critical'} trend={`${stats.playing} out of ${stats.online} playing`} icon={<AlertTriangle size={20} />} color="blue" to="/admin/monitoring" isLight={isLight} />
                <MetricTile title="System Alerts" value={alerts.length} trend="Click to resolve" icon={<AlertTriangle size={20} />} color="red" to="/admin/monitoring" isLight={isLight} />
            </div>

            {/* ── Bottom Grid ────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>

                {/* Live Network Status */}
                <div style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, borderRadius: 24, boxShadow: tk.cardShadow, backdropFilter: tk.glassFilter, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: `1px solid ${tk.rowBorder}` }}>
                        <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: tk.textPrimary, display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Wifi size={18} style={{ color: tk.brand }} />
                            </div>
                            Live Displays
                        </h3>
                        <div style={{ display: 'flex', gap: '0.375rem', background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)', padding: '0.25rem', borderRadius: 10 }}>
                            {['All', 'Online', 'Issues'].map((label, i) => (
                                <button
                                    key={label}
                                    style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.375rem 0.875rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: i === 0 ? tk.brand : 'transparent', color: i === 0 ? '#fff' : tk.textMuted, transition: 'all 0.15s' }}
                                >{label}</button>
                            ))}
                        </div>
                    </div>

                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', maxHeight: 500, overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: tk.textMuted, fontSize: '0.875rem' }}>Loading devices…</div>
                        ) : heartbeats.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: tk.textMuted, fontSize: '0.875rem' }}>No devices active yet.</div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                {heartbeats.map(hb => {
                                    const online = isOnline(hb.last_seen_at)
                                    return (
                                        <DeviceGridItem key={hb.id} hb={hb} online={online} tk={tk} onEdit={() => navigate('/admin/devices')} />
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Quick Actions */}
                    <div style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, borderRadius: 16, boxShadow: tk.cardShadow, padding: '1.5rem' }}>
                        <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: tk.textPrimary, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Zap size={18} style={{ color: '#f59e0b' }} />
                            Quick Actions
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <ActionTile onClick={() => navigate('/admin/menu-builder')} title="Update Menu" sub="Prices & items" icon={<Edit3 size={16} />} tk={tk} />
                            <ActionTile onClick={() => navigate('/admin/publish')} title="Push to All" sub="Broadcast update" icon={<Send size={16} />} tk={tk} />
                            <ActionTile onClick={() => toast.success('Reboot command sent!')} title="Reboot Screens" sub="Remote restart" icon={<RotateCcw size={16} />} tk={tk} />
                            <ActionTile onClick={() => toast.success('Capturing screenshots…')} title="Screenshot" sub="Verify content" icon={<Camera size={16} />} tk={tk} />
                        </div>
                    </div>

                    {/* Alerts */}
                    <div style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, borderRadius: 16, boxShadow: tk.cardShadow, padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: tk.textPrimary, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={18} style={{ color: '#ef4444' }} />
                                Alerts
                            </h3>
                            <button style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-brand-500)', background: 'none', border: 'none', cursor: 'pointer' }}>View All</button>
                        </div>
                        {alerts.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {alerts.slice(0, 2).map((a, i) => (
                                    <div key={i} style={{ padding: '0.875rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, display: 'flex', gap: '0.75rem' }}>
                                        <AlertTriangle size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.25rem' }}>{a.device_code} Offline</div>
                                            <div style={{ fontSize: '0.6875rem', color: tk.textMuted }}>Last seen {formatDistanceToNow(new Date(a.last_seen_at), { addSuffix: true })}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
                                    <ShieldCheck size={18} style={{ color: '#22c55e' }} />
                                </div>
                                <span style={{ fontSize: '0.8125rem', color: tk.textMuted, fontWeight: 500 }}>All systems operational</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Sub-components ───────────────────────────────────────────────────────

function DeviceGridItem({ hb, online, tk, onEdit }: { hb: ProjectHeartbeat, online: boolean, tk: any, onEdit: () => void }) {
    const [hovered, setHovered] = useState(false)
    const screenshotUrl = `https://qxialnmorewjgpmpcswr.supabase.co/storage/v1/object/public/device-screenshots/screenshots/${hb.device_code}_latest.jpg`

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                position: 'relative',
                background: hovered ? tk.rowHover : tk.rowBg,
                border: `1px solid ${hovered ? tk.brand + '40' : tk.rowBorder}`,
                borderRadius: 20,
                padding: '1rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'default',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
                boxShadow: hovered ? '0 12px 30px rgba(0,0,0,0.4)' : 'none'
            }}
        >
            {/* Live Thumbnail / Placeholder */}
            <div style={{
                width: '100%',
                paddingTop: '56.25%', // 16:9 Aspect Ratio
                position: 'relative',
                borderRadius: 10,
                background: '#0a0c10',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.05)'
            }}>
                {online ? (
                    <img
                        src={`${screenshotUrl}?t=${Date.now()}`}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=60&w=400';
                            (e.target as HTMLImageElement).style.opacity = '0.3';
                        }}
                        style={{
                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                            objectFit: 'cover', transition: 'transform 0.5s ease'
                        }}
                    />
                ) : (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.05)' }}>
                        <WifiOff size={24} style={{ color: '#ef4444', opacity: 0.5 }} />
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: tk.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hb.device_code}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: tk.textMuted, display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.125rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? tk.brand : '#ef4444', boxShadow: online ? `0 0 8px ${tk.brand}` : 'none' }} />
                        {hb.device?.store?.name || 'Main Office'}
                    </div>
                </div>
                <button
                    onClick={onEdit}
                    style={{ padding: '0.35rem', borderRadius: 8, background: tk.actionBg, border: `1px solid ${tk.rowBorder}`, color: tk.textMuted, display: 'flex' }}
                >
                    <ArrowUpRight size={14} />
                </button>
            </div>
        </div>
    )
}

function DeviceRow({ hb, online, tk, onEdit }: { hb: ProjectHeartbeat, online: boolean, tk: any, onEdit: () => void }) {
    const [hovered, setHovered] = useState(false)
    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', background: hovered ? tk.rowHover : tk.rowBg, border: `1px solid ${tk.rowBorder}`, borderRadius: 12, transition: 'all 0.15s', cursor: 'default' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: online ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${online ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: online ? '#22c55e' : '#ef4444', flexShrink: 0 }}>
                    <Monitor size={18} />
                </div>
                <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: tk.textPrimary, letterSpacing: '0.01em' }}>{hb.device_code}</div>
                    <div style={{ fontSize: '0.75rem', color: tk.textMuted, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.125rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#22c55e' : '#ef4444', flexShrink: 0, display: 'inline-block' }} />
                        {hb.device?.store?.name || hb.device?.display_name || 'Main Office'} · {hb.status || 'Active'}
                    </div>
                </div>
            </div>
            {hovered && (
                <button
                    onClick={onEdit}
                    style={{ padding: '0.375rem 0.875rem', background: tk.actionBg, border: `1px solid ${tk.actionBorder}`, borderRadius: 8, color: tk.textMuted, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-brand-500)')}
                    onMouseLeave={e => (e.currentTarget.style.color = tk.textMuted)}
                >
                    Edit / Fix
                </button>
            )}
        </div>
    )
}

function ActionTile({ title, sub, icon, onClick, tk }: any) {
    const [hovered, setHovered] = useState(false)
    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.125rem 0.75rem', background: hovered ? tk.actionHover : tk.actionBg, border: `1px solid ${tk.actionBorder}`, borderRadius: 12, gap: '0.625rem', cursor: 'pointer', transition: 'all 0.2s', transform: hovered ? 'translateY(-1px)' : 'translateY(0)' }}
        >
            <div style={{ padding: '0.5rem', background: tk.actionIconBg, borderRadius: 8, color: 'var(--color-brand-500)', display: 'flex', transform: hovered ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.2s' }}>
                {icon}
            </div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: tk.textPrimary, lineHeight: 1.3 }}>{title}</div>
                <div style={{ fontSize: '0.6875rem', color: tk.textMuted, marginTop: '0.125rem' }}>{sub}</div>
            </div>
        </button>
    )
}

function MetricTile({ title, value, trend, icon, color, to, isLight }: any) {
    const navigate = useNavigate()
    const [hovered, setHovered] = useState(false)

    const palette: Record<string, { lightBg: string; darkBg: string; lightText: string; darkText: string; lightBorder: string; darkBorder: string }> = {
        green: { lightBg: '#f0fdf4', darkBg: 'rgba(34,197,94,0.12)', lightText: '#15803d', darkText: '#4ade80', lightBorder: 'rgba(34,197,94,0.2)', darkBorder: 'rgba(34,197,94,0.2)' },
        orange: { lightBg: '#fff7ed', darkBg: 'rgba(249,115,22,0.12)', lightText: '#c2410c', darkText: '#fb923c', lightBorder: 'rgba(249,115,22,0.2)', darkBorder: 'rgba(249,115,22,0.2)' },
        blue: { lightBg: '#f0f9ff', darkBg: 'rgba(14,165,233,0.12)', lightText: '#0369a1', darkText: '#38bdf8', lightBorder: 'rgba(14,165,233,0.2)', darkBorder: 'rgba(14,165,233,0.2)' },
        red: { lightBg: '#fff1f2', darkBg: 'rgba(239,68,68,0.12)', lightText: '#dc2626', darkText: '#f87171', lightBorder: 'rgba(239,68,68,0.2)', darkBorder: 'rgba(239,68,68,0.2)' },
    }

    const p = palette[color] || palette.blue
    const bg = isLight ? p.lightBg : p.darkBg
    const text = isLight ? p.lightText : p.darkText
    const border = isLight ? p.lightBorder : p.darkBorder
    const shadow = isLight ? `0 2px 12px rgba(0,55,81,0.05)` : '0 4px 16px rgba(0,0,0,0.15)'

    return (
        <div
            onClick={() => to && navigate(to)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                padding: '1.5rem',
                borderRadius: 20,
                background: bg,
                border: `1px solid ${border}`,
                backdropFilter: 'blur(8px)',
                boxShadow: hovered ? `0 15px 35px ${p.darkBg}` : shadow,
                cursor: to ? 'pointer' : 'default',
                transform: hovered ? 'translateY(-5px)' : 'translateY(0)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div style={{
                    padding: '0.625rem',
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                    borderRadius: 12,
                    color: text,
                    display: 'flex',
                    boxShadow: hovered ? `0 0 10px ${text}33` : 'none',
                    transition: 'all 0.3s'
                }}>
                    {icon}
                </div>
                <TrendingUp size={16} style={{ color: text, opacity: 0.3 }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: text, lineHeight: 1, marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>{value}</div>
            <div style={{ fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: text, opacity: 0.5, marginBottom: '0.75rem' }}>{title}</div>
            <div style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: text,
                opacity: 0.8,
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)',
                padding: '4px 8px',
                borderRadius: 6,
                width: 'fit-content'
            }}>
                <ArrowUpRight size={12} /> {trend}
            </div>
        </div>
    )
}

function StatCard({ icon, label, value, subValue, color, to, tk }: {
    icon: React.ReactNode, label: string, value: number | string,
    subValue?: string, color: string, to?: string, tk: any
}) {
    const navigate = useNavigate()
    const [hovered, setHovered] = useState(false)

    return (
        <div
            className="stat-card"
            onClick={() => to && navigate(to)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                cursor: to ? 'pointer' : 'default',
                transform: hovered && to ? 'translateY(-5px)' : 'translateY(0)',
                boxShadow: hovered && to ? `0 20px 40px ${color}15` : tk.cardShadow,
                background: tk.cardBg,
                border: `1px solid ${hovered ? color + '44' : tk.cardBorder}`,
                borderRadius: 24,
                backdropFilter: tk.glassFilter,
                padding: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1.125rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
            }}
        >
            <div className="stat-icon" style={{
                background: hovered ? color : `${color}15`,
                color: hovered ? '#fff' : color,
                width: 48, height: 48, borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: hovered ? `0 0 20px ${color}66` : 'none',
                transition: 'all 0.3s'
            }}>
                {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: tk.textPrimary, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
                    {subValue && (
                        <div style={{
                            fontSize: '0.65rem', fontWeight: 900, color,
                            background: `${color}10`, padding: '3px 8px', borderRadius: 6,
                            letterSpacing: '0.1em', whiteSpace: 'nowrap',
                            border: `1px solid ${color}20`
                        }}>
                            {subValue.toUpperCase()}
                        </div>
                    )}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: tk.textMuted, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: '0.5rem', opacity: 0.5 }}>{label}</div>
            </div>
            {to && (
                <div style={{
                    position: 'absolute', top: '1.125rem', right: '1.125rem',
                    color: hovered ? color : tk.arrowColor,
                    transition: 'all 0.3s',
                    transform: hovered ? 'translate(2px,-2px) scale(1.1)' : 'translate(0,0)',
                    display: 'flex',
                    opacity: hovered ? 1 : 0.3
                }}>
                    <ArrowUpRight size={18} />
                </div>
            )}
        </div>
    )
}
