import React, { useEffect, useState } from 'react'
import { Monitor, Store, Users, Wifi, WifiOff, AlertTriangle, Clock, FileCheck, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { DeviceHeartbeat } from '../../types'
import { formatDistanceToNow } from 'date-fns'

interface Stats {
    stores: number
    devices: number
    online: number
    playing: number
    offline: number
    activePubs: number
    roles: number
}

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000 // 3 minutes (matches Monitoring & Devices pages)

function isOnline(lastSeen: string) {
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats>({ stores: 0, devices: 0, online: 0, playing: 0, offline: 0, activePubs: 0, roles: 0 })
    const [heartbeats, setHeartbeats] = useState<DeviceHeartbeat[]>([])
    const [alerts, setAlerts] = useState<DeviceHeartbeat[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            setLoading(true)
            const [storesRes, devicesRes, heartbeatsRes, pubsRes, rolesRes] = await Promise.all([
                supabase.from('stores').select('id', { count: 'exact' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true),
                supabase.from('devices').select('id', { count: 'exact' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true),
                supabase.from('device_heartbeats').select('*').order('last_seen_at', { ascending: false }).limit(50),
                supabase.from('layout_publications').select('id', { count: 'exact' }).eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true),
                supabase.from('roles').select('id', { count: 'exact' }).eq('tenant_id', DEFAULT_TENANT_ID),
            ])

            // Get latest heartbeat per device
            const hbMap = new Map<string, DeviceHeartbeat>()
            for (const hb of (heartbeatsRes.data || [])) {
                if (!hbMap.has(hb.device_code)) hbMap.set(hb.device_code, hb)
            }
            const latest = Array.from(hbMap.values())

            const totalDevices = devicesRes.count || 0
            const onlineList = latest.filter(h => isOnline(h.last_seen_at))
            const online = onlineList.length
            const playing = onlineList.filter(h => h.status === 'playing').length
            const offline = Math.max(0, totalDevices - online)
            const alertList = latest.filter(h => !isOnline(h.last_seen_at))

            setStats({
                stores: storesRes.count || 0,
                devices: totalDevices,
                online,
                playing,
                offline,
                activePubs: pubsRes.count || 0,
                roles: rolesRes.count || 0,
            })
            setHeartbeats(heartbeatsRes.data || [])
            setAlerts(alertList)
            setLoading(false)
        }
        load()
        const interval = setInterval(load, 30000)
        return () => clearInterval(interval)
    }, [])

    const recentHbs = heartbeats.slice(0, 20)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Network Overview</h1>
                    <p className="page-subtitle">Real-time overview of your retail display network</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }} />
                    Live · Updates every 30s
                </div>
            </div>

            {/* Alert banner */}
            {alerts.length > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.5rem'
                }}>
                    <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                        <div style={{ fontWeight: 500, color: '#ef4444', fontSize: '0.875rem' }}>
                            {alerts.length} device{alerts.length > 1 ? 's' : ''} offline — not seen in the last 3 minutes
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                            {alerts.slice(0, 3).map(a => a.device_code).join(', ')}{alerts.length > 3 ? ` and ${alerts.length - 3} more` : ''}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard icon={<Store size={22} />} label="Active Stores" value={loading ? '—' : stats.stores} color="#ef4444" to="/admin/stores" />
                <StatCard icon={<Monitor size={22} />} label="Total Devices" value={loading ? '—' : stats.devices} color="#f87171" to="/admin/devices" />
                <StatCard icon={<Users size={22} />} label="Screen Roles" value={loading ? '—' : stats.roles} color="#dc2626" to="/admin/roles" />
                <StatCard
                    icon={<Wifi size={22} />}
                    label="Online"
                    value={loading ? '—' : stats.online}
                    subValue={loading ? undefined : `${stats.playing} playing`}
                    color="#22c55e"
                    to="/admin/monitoring"
                />
                <StatCard icon={<WifiOff size={22} />} label="Offline" value={loading ? '—' : stats.offline} color="#ef4444" to="/admin/monitoring" />
                <StatCard icon={<FileCheck size={22} />} label="Active Publns" value={loading ? '—' : stats.activePubs} color="#ea580c" to="/admin/publish" />
            </div>

            {/* Recent heartbeats */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Clock size={16} color="#ef4444" />
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>Recent Device Heartbeats</h2>
                </div>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading…</div>
                ) : recentHbs.length === 0 ? (
                    <div className="empty-state">
                        <Monitor size={40} />
                        <h3>No heartbeats recorded</h3>
                        <p>Player devices will appear here once they connect.</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Device Code</th>
                                    <th>Status</th>
                                    <th>Last Seen</th>
                                    <th>Version</th>
                                    <th>IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentHbs.map(hb => {
                                    const online = isOnline(hb.last_seen_at)
                                    return (
                                        <tr key={hb.id}>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#f1f5f9' }}>{hb.device_code}</span>
                                            </td>
                                            <td>
                                                <span className={`badge ${online ? 'badge-green' : 'badge-red'}`}>
                                                    <span style={{
                                                        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                                                        background: online ? '#22c55e' : '#ef4444',
                                                        marginRight: 4,
                                                        boxShadow: online ? '0 0 6px #22c55e' : 'none',
                                                        animation: online && hb.status === 'playing' ? 'pulse 2s infinite' : 'none'
                                                    }} />
                                                    {online
                                                        ? (hb.status === 'playing' ? 'Playing' : hb.status === 'standby' ? 'Standby' : hb.status ? hb.status.charAt(0).toUpperCase() + hb.status.slice(1) : 'Online')
                                                        : 'Offline'
                                                    }
                                                </span>
                                            </td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                                                {formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true })}
                                            </td>
                                            <td>
                                                {hb.current_version ? (
                                                    <span className="badge badge-blue">{hb.current_version}</span>
                                                ) : <span style={{ color: '#475569' }}>—</span>}
                                            </td>
                                            <td style={{ color: '#64748b', fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                                                {hb.ip_address || '—'}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
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
