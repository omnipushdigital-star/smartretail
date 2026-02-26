import React, { useEffect, useState } from 'react'
import { Activity, Wifi, WifiOff, Search, RefreshCw } from 'lucide-react'
import { supabase, DEFAULT_TENANT_ID } from '../../lib/supabase'
import { DeviceHeartbeat, Store, Role } from '../../types'
import Pagination from '../../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000  // 3 minutes to match DevicesPage
const PAGE_SIZE = 20

function isOnline(lastSeen: string) {
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

interface DeviceInfo {
    id: string
    device_code: string
    display_name?: string
    store_id?: string
    role_id?: string
    active: boolean
    store?: { name: string; code: string }
    role?: { name: string; key: string }
}

export default function MonitoringPage() {
    const [heartbeats, setHeartbeats] = useState<DeviceHeartbeat[]>([])
    const [deviceMap, setDeviceMap] = useState<Record<string, DeviceInfo>>({})
    const [stores, setStores] = useState<Store[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [loading, setLoading] = useState(true)
    const [filterStore, setFilterStore] = useState('')
    const [filterRole, setFilterRole] = useState('')
    const [filterDevice, setFilterDevice] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [page, setPage] = useState(1)
    const [lastRefresh, setLastRefresh] = useState(new Date())

    const loadAll = async () => {
        setLoading(true)
        const [hbRes, devsRes, storesRes, rolesRes] = await Promise.all([
            supabase.from('device_heartbeats').select('*').order('last_seen_at', { ascending: false }).limit(500),
            supabase.from('devices')
                .select('id, device_code, display_name, store_id, role_id, active, store:stores(name,code), role:roles(name,key)')
                .eq('tenant_id', DEFAULT_TENANT_ID),
            supabase.from('stores').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
        ])
        const dMap: Record<string, DeviceInfo> = {}
        for (const d of (devsRes.data || []) as unknown as DeviceInfo[]) {
            dMap[d.device_code] = d
        }
        setHeartbeats(hbRes.data || [])
        setDeviceMap(dMap)
        setStores(storesRes.data || [])
        setRoles(rolesRes.data || [])
        setLastRefresh(new Date())
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [])
    useEffect(() => {
        const interval = setInterval(loadAll, 30000)
        return () => clearInterval(interval)
    }, [])

    // Dedupe: latest heartbeat per device
    const latestHbMap = new Map<string, DeviceHeartbeat>()
    for (const hb of heartbeats) {
        if (!latestHbMap.has(hb.device_code)) latestHbMap.set(hb.device_code, hb)
    }
    const latestHbs = Array.from(latestHbMap.values())

    const filteredLatest = latestHbs.filter(hb => {
        const device = deviceMap[hb.device_code]
        const matchDevice = !filterDevice || hb.device_code.toLowerCase().includes(filterDevice.toLowerCase()) ||
            ((device?.display_name || '').toLowerCase().includes(filterDevice.toLowerCase()))
        const matchStatus = !filterStatus || (filterStatus === 'online' ? isOnline(hb.last_seen_at) : !isOnline(hb.last_seen_at))
        const matchStore = !filterStore || device?.store_id === filterStore
        const matchRole = !filterRole || device?.role_id === filterRole
        return matchDevice && matchStatus && matchStore && matchRole
    })

    // Also show registered devices with no heartbeat ever
    const allDeviceCodes = Object.keys(deviceMap)
    const unseenDevices = allDeviceCodes.filter(code => !latestHbMap.has(code))

    const online = latestHbs.filter(h => isOnline(h.last_seen_at)).length
    const offline = latestHbs.length - online

    // Log
    const filteredLog = heartbeats.filter(hb =>
        !filterDevice || hb.device_code.toLowerCase().includes(filterDevice.toLowerCase())
    )
    const paginatedLog = filteredLog.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Monitoring</h1>
                    <p className="page-subtitle">Real-time device status and heartbeat logs (3-min online threshold)</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}</span>
                    <button className="btn-secondary" onClick={loadAll} title="Refresh" disabled={loading}>
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(90,100,246,0.15)' }}>
                        <Activity size={22} color="#5a64f6" />
                    </div>
                    <div>
                        <div className="stat-value">{latestHbs.length + unseenDevices.length}</div>
                        <div className="stat-label">Total Devices</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)' }}>
                        <Wifi size={22} color="#22c55e" />
                    </div>
                    <div>
                        <div className="stat-value" style={{ color: '#22c55e' }}>{online}</div>
                        <div className="stat-label">Online (&lt;3 min)</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>
                        <WifiOff size={22} color="#ef4444" />
                    </div>
                    <div>
                        <div className="stat-value" style={{ color: '#ef4444' }}>{offline + unseenDevices.length}</div>
                        <div className="stat-label">Offline / Never seen</div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input type="text" className="input-field" placeholder="Filter by device code / name..." value={filterDevice}
                            onChange={e => { setFilterDevice(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                    </div>
                    <select className="input-field" style={{ width: 'auto' }} value={filterStore} onChange={e => { setFilterStore(e.target.value); setPage(1) }}>
                        <option value="">All stores</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select className="input-field" style={{ width: 'auto' }} value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}>
                        <option value="">All roles</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
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
                ) : filteredLatest.length === 0 && unseenDevices.length === 0 ? (
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
                                    <th>Display Name</th>
                                    <th>Store</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Last Seen</th>
                                    <th>Version</th>
                                    <th>IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLatest.map(hb => {
                                    const device = deviceMap[hb.device_code]
                                    const online = isOnline(hb.last_seen_at)
                                    return (
                                        <tr key={hb.device_code}>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.05em' }}>{hb.device_code}</td>
                                            <td style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{device?.display_name || '—'}</td>
                                            <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>{(device?.store as any)?.name || '—'}</td>
                                            <td>
                                                {(device?.role as any)?.key
                                                    ? <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>{(device?.role as any).key}</span>
                                                    : <span style={{ color: '#475569' }}>—</span>
                                                }
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
                                            <td style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                                                {formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true })}
                                            </td>
                                            <td>{hb.current_version ? <span className="badge badge-blue">{hb.current_version}</span> : <span style={{ color: '#475569' }}>—</span>}</td>
                                            <td style={{ fontFamily: 'monospace', color: '#64748b', fontSize: '0.8125rem' }}>{hb.ip_address || '—'}</td>
                                        </tr>
                                    )
                                })}
                                {/* Never-seen registered devices */}
                                {unseenDevices.filter(code => {
                                    const d = deviceMap[code]
                                    const matchDevice = !filterDevice || code.toLowerCase().includes(filterDevice.toLowerCase()) || ((d?.display_name || '').toLowerCase().includes(filterDevice.toLowerCase()))
                                    const matchStore = !filterStore || d?.store_id === filterStore
                                    const matchRole = !filterRole || d?.role_id === filterRole
                                    const matchStatus = filterStatus === 'online' ? false : true
                                    return matchDevice && matchStore && matchRole && matchStatus
                                }).map(code => {
                                    const device = deviceMap[code]
                                    return (
                                        <tr key={code} style={{ opacity: 0.55 }}>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>{code}</td>
                                            <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>{device?.display_name || '—'}</td>
                                            <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>{(device?.store as any)?.name || '—'}</td>
                                            <td>
                                                {(device?.role as any)?.key
                                                    ? <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>{(device?.role as any).key}</span>
                                                    : <span style={{ color: '#475569' }}>—</span>
                                                }
                                            </td>
                                            <td><span className="badge badge-gray">○ Never seen</span></td>
                                            <td style={{ color: '#475569' }}>—</td>
                                            <td style={{ color: '#475569' }}>—</td>
                                            <td style={{ color: '#475569' }}>—</td>
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
                                <th>Status</th>
                                <th>Timestamp</th>
                                <th>Version</th>
                                <th>IP</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedLog.map(hb => (
                                <tr key={hb.id}>
                                    <td style={{ fontFamily: 'monospace', color: '#f1f5f9' }}>{hb.device_code}</td>
                                    <td>
                                        <span className={`badge ${hb.status === 'playing' ? 'badge-green' : hb.status === 'standby' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: '0.65rem' }}>
                                            {hb.status ? hb.status.charAt(0).toUpperCase() + hb.status.slice(1) : 'Online'}
                                        </span>
                                    </td>
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
