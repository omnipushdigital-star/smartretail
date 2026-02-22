import React, { useEffect, useState } from 'react'
import { Activity, Wifi, WifiOff, Search, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DeviceHeartbeat, Store } from '../../types'
import Pagination from '../../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000
const PAGE_SIZE = 20

function isOnline(lastSeen: string) {
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

export default function MonitoringPage() {
    const [heartbeats, setHeartbeats] = useState<DeviceHeartbeat[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStore, setFilterStore] = useState('')
    const [filterDevice, setFilterDevice] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [page, setPage] = useState(1)
    const [lastRefresh, setLastRefresh] = useState(new Date())

    const loadAll = async () => {
        setLoading(true)
        const [hbRes, storesRes] = await Promise.all([
            supabase.from('device_heartbeats').select('*').order('last_seen_at', { ascending: false }).limit(500),
            supabase.from('stores').select('*').order('name'),
        ])
        setHeartbeats(hbRes.data || [])
        setStores(storesRes.data || [])
        setLastRefresh(new Date())
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])
    useEffect(() => {
        const interval = setInterval(loadAll, 30000)
        return () => clearInterval(interval)
    }, [])

    // Get latest heartbeat per device
    const latestHbMap = new Map<string, DeviceHeartbeat>()
    for (const hb of heartbeats) {
        if (!latestHbMap.has(hb.device_code)) latestHbMap.set(hb.device_code, hb)
    }
    const latestHbs = Array.from(latestHbMap.values())

    const filteredLatest = latestHbs.filter(hb => {
        const matchDevice = !filterDevice || hb.device_code.toLowerCase().includes(filterDevice.toLowerCase())
        const matchStatus = !filterStatus || (filterStatus === 'online' ? isOnline(hb.last_seen_at) : !isOnline(hb.last_seen_at))
        return matchDevice && matchStatus
    })

    const online = latestHbs.filter(h => isOnline(h.last_seen_at)).length
    const offline = latestHbs.length - online

    // Heartbeats log
    const filteredLog = heartbeats.filter(hb => {
        const matchDevice = !filterDevice || hb.device_code.toLowerCase().includes(filterDevice.toLowerCase())
        return matchDevice
    })
    const paginatedLog = filteredLog.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Monitoring</h1>
                    <p className="page-subtitle">Real-time device status and heartbeat logs</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}</span>
                    <button className="btn-secondary" onClick={loadAll} title="Refresh" disabled={loading}>
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(90,100,246,0.15)' }}>
                        <Activity size={22} color="#5a64f6" />
                    </div>
                    <div>
                        <div className="stat-value">{latestHbs.length}</div>
                        <div className="stat-label">Known Devices</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)' }}>
                        <Wifi size={22} color="#22c55e" />
                    </div>
                    <div>
                        <div className="stat-value" style={{ color: '#22c55e' }}>{online}</div>
                        <div className="stat-label">Online (&lt;15 min)</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>
                        <WifiOff size={22} color="#ef4444" />
                    </div>
                    <div>
                        <div className="stat-value" style={{ color: '#ef4444' }}>{offline}</div>
                        <div className="stat-label">Offline</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input type="text" className="input-field" placeholder="Filter by device code..." value={filterDevice}
                            onChange={e => { setFilterDevice(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                    </div>
                    <select className="input-field" style={{ width: 'auto' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
                        <option value="">All status</option>
                        <option value="online">Online</option>
                        <option value="offline">Offline</option>
                    </select>
                </div>
            </div>

            {/* Device status table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #1e293b', fontWeight: 600, fontSize: '0.875rem', color: '#94a3b8' }}>
                    Device Status Overview
                </div>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading…</div>
                ) : filteredLatest.length === 0 ? (
                    <div className="empty-state">
                        <Activity size={40} />
                        <h3>No device data</h3>
                        <p>Devices will appear here once they send a heartbeat.</p>
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
                                    <th>IP Address</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLatest.map(hb => {
                                    const online = isOnline(hb.last_seen_at)
                                    return (
                                        <tr key={hb.device_code}>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>{hb.device_code}</td>
                                            <td>
                                                <span className={`badge ${online ? 'badge-green' : 'badge-red'}`}>
                                                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: online ? '#22c55e' : '#ef4444', marginRight: 4, boxShadow: online ? '0 0 6px #22c55e' : 'none' }} />
                                                    {online ? 'Online' : 'Offline'}
                                                </span>
                                            </td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                                                {formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true })}
                                            </td>
                                            <td>
                                                {hb.current_version ? <span className="badge badge-blue">{hb.current_version}</span> : <span style={{ color: '#475569' }}>—</span>}
                                            </td>
                                            <td style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.8125rem' }}>{hb.ip_address || '—'}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Heartbeat log */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #1e293b', fontWeight: 600, fontSize: '0.875rem', color: '#94a3b8' }}>
                    Heartbeat Log (last 500)
                </div>
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Device Code</th>
                                <th>Timestamp</th>
                                <th>Version</th>
                                <th>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedLog.map(hb => (
                                <tr key={hb.id}>
                                    <td style={{ fontFamily: 'monospace', color: '#f1f5f9' }}>{hb.device_code}</td>
                                    <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>{new Date(hb.last_seen_at).toLocaleString()}</td>
                                    <td>{hb.current_version ? <span className="badge badge-blue">{hb.current_version}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                                    <td style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.8125rem' }}>{hb.ip_address || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination page={page} totalPages={Math.ceil(filteredLog.length / PAGE_SIZE)} totalItems={filteredLog.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </div>
        </div>
    )
}
