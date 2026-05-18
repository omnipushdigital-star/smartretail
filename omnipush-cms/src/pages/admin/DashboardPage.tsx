import React, { useEffect, useState, useCallback } from 'react'
import { Monitor, Wifi, WifiOff, Clock, Play, AlertCircle, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DeviceState, getDeviceState, STATE_CONFIG, FRESH_THRESHOLD_MS, STALE_THRESHOLD_MS } from '../../utils/deviceState'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { DeviceHeartbeat } from '../../types'
import { formatDistanceToNow } from 'date-fns'
import ActivityFeed from '../../components/dashboard/ActivityFeed'

// ── Device State ──────────────────────────────────────────────────────────────

export type FilterTab = 'all' | DeviceState

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProjectHeartbeat extends DeviceHeartbeat {
    device?: { display_name: string; store?: { name: string } }
}



// ── Main Component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const navigate = useNavigate()
    const { currentTenantId } = useTenant()

    const [totalDevices, setTotalDevices] = useState(0)
    const [heartbeats, setHeartbeats] = useState<ProjectHeartbeat[]>([])
    const [loading, setLoading] = useState(true)
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
    const [tick, setTick] = useState(0)

    const load = useCallback(async () => {
        if (!currentTenantId) return
        try {
            const { count: devCount } = await supabase
                .from('devices')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', currentTenantId)
                .is('deleted_at', null)

            setTotalDevices(devCount || 0)

            const { data: allDevices } = await supabase
                .from('devices')
                .select('id, device_code, tenant_id')
                .eq('tenant_id', currentTenantId)
                .is('deleted_at', null)

            const devices = allDevices || []
            if (devices.length === 0) { setHeartbeats([]); setLoading(false); return }

            const idFilter   = devices.map(d => `"${d.id}"`).join(',')
            const codeFilter = devices.map(d => `"${d.device_code}"`).join(',')

            const { data: hData } = await supabase
                .from('device_heartbeats')
                .select('*')
                .or(`device_id.in.(${idFilter}),device_code.in.(${codeFilter})`)
                .order('last_seen_at', { ascending: false })
                .limit(500)

            const hbMap = new Map<string, ProjectHeartbeat>()
            for (const hb of (hData || [])) {
                const code = hb.device_code
                if (!hbMap.has(code)) {
                    const dev = devices.find(d => d.device_code === code || d.id === hb.device_id)
                    hbMap.set(code, { ...hb, device: dev as any, meta: hb.meta || {} })
                } else {
                    const cur = hbMap.get(code)!
                    const diff = new Date(cur.last_seen_at).getTime() - new Date(hb.last_seen_at).getTime()
                    if (diff < 60000 && cur.status !== 'playing' && hb.status === 'playing') {
                        cur.status = 'playing'
                    }
                }
            }
            // Add phantom offline entries for devices that have never sent a heartbeat
            for (const dev of devices) {
                if (!hbMap.has(dev.device_code)) {
                    hbMap.set(dev.device_code, {
                        id: `phantom-${dev.id}`,
                        device_id: dev.id,
                        device_code: dev.device_code,
                        status: 'offline',
                        last_seen_at: new Date(0).toISOString(),
                        current_version: null,
                        ip_address: null,
                        meta: {},
                        device: dev as any,
                    } as ProjectHeartbeat)
                }
            }
            setHeartbeats(Array.from(hbMap.values()))
        } catch (err) {
            console.error('[Dashboard] load error:', err)
        } finally {
            setLoading(false)
        }
    }, [currentTenantId])

    useEffect(() => {
        load()

        const hbChannel = supabase.channel('dashboard_hb')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'device_heartbeats' }, load)
            .subscribe()

        const devChannel = supabase.channel('dashboard_dev')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, load)
            .subscribe()

        const tickInterval = setInterval(() => setTick(t => t + 1), 15000)

        return () => {
            supabase.removeChannel(hbChannel)
            supabase.removeChannel(devChannel)
            clearInterval(tickInterval)
        }
    }, [load])

    const stateCounts = React.useMemo(() => {
        const counts = { playing: 0, idle: 0, stale: 0, offline: 0 }
        for (const hb of heartbeats) counts[getDeviceState(hb.last_seen_at, hb.status)]++
        return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heartbeats, tick])

    const filteredHeartbeats = React.useMemo(() => {
        if (activeFilter === 'all') return heartbeats
        return heartbeats.filter(hb => getDeviceState(hb.last_seen_at, hb.status) === activeFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [heartbeats, activeFilter, tick])

    function handleStatCardClick(filter: FilterTab) {
        setActiveFilter(prev => prev === filter ? 'all' : filter)
    }

    return (
        <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{
                    margin: 0, fontSize: '1.375rem', fontWeight: 600,
                    fontFamily: 'var(--font-display)',
                    color: 'var(--color-text-primary)',
                    display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                    <Monitor size={22} style={{ color: 'var(--color-accent)' }} />
                    Network Dashboard
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Real-time overview of your retail display network
                </p>
            </div>

            {/* 4 Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard icon={<Monitor size={20} />} label="Total Devices"    value={totalDevices}                             active={activeFilter === 'all'}     color="var(--color-accent)" onClick={() => handleStatCardClick('all')} />
                <StatCard icon={<Play size={20} />}    label="Playing"          value={stateCounts.playing}                      active={activeFilter === 'playing'} color="#22c55e"             onClick={() => handleStatCardClick('playing')} />
                <StatCard icon={<AlertCircle size={20} />} label="Idle / Not Playing" value={stateCounts.idle + stateCounts.stale} active={activeFilter === 'idle' || activeFilter === 'stale'} color="#f59e0b" onClick={() => setActiveFilter(prev => (prev === 'idle' || prev === 'stale') ? 'all' : 'idle')} />
                <StatCard icon={<WifiOff size={20} />} label="Offline"          value={stateCounts.offline}                      active={activeFilter === 'offline'} color="#ef4444"             onClick={() => handleStatCardClick('offline')} />
            </div>

            {/* Main grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start' }}>

                {/* Device panel */}
                <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Wifi size={16} style={{ color: 'var(--color-accent)' }} />
                            Live Displays
                        </span>

                        {/* Filter tabs */}
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--color-surface-2)', borderRadius: '8px', padding: '3px' }}>
                            {(['all', 'playing', 'idle', 'stale', 'offline'] as FilterTab[]).map(tab => {
                                const count = tab === 'all' ? totalDevices : stateCounts[tab as DeviceState]
                                const isActive = activeFilter === tab
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveFilter(isActive ? 'all' : tab)}
                                        style={{
                                            padding: '4px 10px', borderRadius: '6px', border: 'none',
                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                            background: isActive ? 'var(--color-surface-1)' : 'transparent',
                                            color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                            transition: 'all 0.15s', textTransform: 'capitalize',
                                        }}
                                    >
                                        {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                        <span style={{ marginLeft: '4px', opacity: 0.7 }}>({count})</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div style={{ padding: '1.25rem', maxHeight: '600px', overflowY: 'auto' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading devices…</div>
                        ) : filteredHeartbeats.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                                {activeFilter === 'all' ? 'No devices found.' : `No ${activeFilter} devices.`}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
                                {filteredHeartbeats.map(hb => (
                                    <DeviceCard key={hb.id} hb={hb} state={getDeviceState(hb.last_seen_at, hb.status)} onView={() => navigate('/admin/devices')} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Activity feed */}
                <ActivityFeed tenantId={currentTenantId || ''} />
            </div>
        </div>
    )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, active, color, onClick }: {
    icon: React.ReactNode; label: string; value: number
    active: boolean; color: string; onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            style={{
                background: active ? `${color}18` : 'var(--color-surface-1)',
                border: `1px solid ${active ? color + '60' : 'var(--color-border)'}`,
                borderRadius: '12px', padding: '1.25rem', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '1rem', width: '100%',
            }}
            onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = color + '80' }}
            onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)' }}
        >
            <div style={{ width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', lineHeight: 1 }}>
                    {value}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px', fontWeight: 500 }}>
                    {label}
                </div>
            </div>
        </button>
    )
}

// ── DeviceCard ────────────────────────────────────────────────────────────────
function DeviceCard({ hb, state, onView }: {
    hb: ProjectHeartbeat; state: DeviceState; onView: () => void
}) {
    const cfg = STATE_CONFIG[state]
    const currentContent = (hb.meta as any)?.current_content as string | undefined
    const storeName = (hb.device as any)?.store?.name || (hb.meta as any)?.store_name

    return (
        <div
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'border-color 0.15s' }}
            onMouseOver={e => (e.currentTarget as HTMLElement).style.borderColor = cfg.dot + '60'}
            onMouseOut={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.dot, flexShrink: 0, boxShadow: state === 'playing' ? `0 0 6px ${cfg.dot}80` : 'none' }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: cfg.text }}>{cfg.label}</span>
                </div>
                <button
                    onClick={onView}
                    style={{ padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-muted)', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', transition: 'color 0.15s' }}
                    onMouseOver={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-accent)'}
                    onMouseOut={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}
                >
                    View
                </button>
            </div>

            <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hb.device_code}
                </div>
                {storeName && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{storeName}</div>
                )}
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', background: 'var(--color-surface-1)', borderRadius: '6px', padding: '5px 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: currentContent ? 1 : 0.5 }}>
                {currentContent || (state === 'idle' ? 'Player not reporting' : state === 'offline' ? 'No signal' : '—')}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)', fontSize: '0.6875rem' }}>
                <Clock size={11} />
                {hb.last_seen_at ? formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true }) : 'Never'}
            </div>
        </div>
    )
}
