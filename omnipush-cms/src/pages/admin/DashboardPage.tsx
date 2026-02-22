import React, { useEffect, useState } from 'react'
import { Monitor, Store, Users, Wifi, WifiOff, AlertTriangle, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DeviceHeartbeat } from '../../types'
import { formatDistanceToNow } from 'date-fns'

interface Stats {
    stores: number
    devices: number
    online: number
    offline: number
}

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

function isOnline(lastSeen: string) {
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats>({ stores: 0, devices: 0, online: 0, offline: 0 })
    const [heartbeats, setHeartbeats] = useState<DeviceHeartbeat[]>([])
    const [alerts, setAlerts] = useState<DeviceHeartbeat[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            setLoading(true)
            const [storesRes, devicesRes, heartbeatsRes] = await Promise.all([
                supabase.from('stores').select('id', { count: 'exact' }).eq('active', true),
                supabase.from('devices').select('id', { count: 'exact' }).eq('active', true),
                supabase.from('device_heartbeats').select('*').order('last_seen_at', { ascending: false }).limit(50),
            ])

            // Get latest heartbeat per device
            const hbMap = new Map<string, DeviceHeartbeat>()
            for (const hb of (heartbeatsRes.data || [])) {
                if (!hbMap.has(hb.device_code)) hbMap.set(hb.device_code, hb)
            }
            const latest = Array.from(hbMap.values())

            const online = latest.filter(h => isOnline(h.last_seen_at)).length
            const offline = latest.length - online
            const alertList = latest.filter(h => !isOnline(h.last_seen_at))

            setStats({
                stores: storesRes.count || 0,
                devices: devicesRes.count || 0,
                online,
                offline,
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
                    <h1 className="page-title">Dashboard</h1>
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
                            {alerts.length} device{alerts.length > 1 ? 's' : ''} offline — not seen in the last 15 minutes
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                            {alerts.slice(0, 3).map(a => a.device_code).join(', ')}{alerts.length > 3 ? ` and ${alerts.length - 3} more` : ''}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <StatCard icon={<Store size={22} />} label="Active Stores" value={loading ? '—' : stats.stores} color="#5a64f6" />
                <StatCard icon={<Monitor size={22} />} label="Total Devices" value={loading ? '—' : stats.devices} color="#7a8aff" />
                <StatCard icon={<Wifi size={22} />} label="Online" value={loading ? '—' : stats.online} color="#22c55e" />
                <StatCard icon={<WifiOff size={22} />} label="Offline" value={loading ? '—' : stats.offline} color="#ef4444" />
            </div>

            {/* Recent heartbeats */}
            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Clock size={16} color="#5a64f6" />
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
                                                    <span className={online ? 'online-dot' : 'offline-dot'} style={{ marginRight: 4 }} />
                                                    {online ? 'Online' : 'Offline'}
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
    return (
        <div className="stat-card">
            <div className="stat-icon" style={{ background: `${color}20` }}>
                <span style={{ color }}>{icon}</span>
            </div>
            <div>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
            </div>
        </div>
    )
}
