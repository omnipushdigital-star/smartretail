import React, { useEffect, useState } from 'react'
import { Activity, Wifi, WifiOff, Search, RefreshCw, Tv2, AlertCircle, Eye, EyeOff, Cable, Globe, Unplug } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DeviceHeartbeat, Store, Role } from '../../types'
import { useTenant } from '../../contexts/TenantContext'
import Pagination from '../../components/ui/Pagination'
import { formatDistanceToNow } from 'date-fns'

const ONLINE_THRESHOLD_MS = 10 * 60 * 1000  // 10 minutes (lenient for debugging)
const PAGE_SIZE = 20
const EVENT_PAGE_SIZE = 50

const EVENT_ICON_COLOR: Record<string, string> = {
    lan_connected: '#22c55e',
    lan_disconnected: '#ef4444',
    internet_lost: '#f59e0b',
    internet_restored: '#22c55e',
    hdmi_connected: '#22c55e',
    hdmi_disconnected: '#ef4444',
}

const EVENT_LABEL: Record<string, string> = {
    lan_connected: 'LAN Connected',
    lan_disconnected: 'LAN Disconnected',
    internet_lost: 'ISP Down',
    internet_restored: 'ISP Restored',
    hdmi_connected: 'HDMI Connected',
    hdmi_disconnected: 'HDMI Disconnected',
}

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

interface DeviceEvent {
    id: string
    device_code: string
    event_type: string
    occurred_at: string
    meta: Record<string, unknown>
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
    const { currentTenantId } = useTenant()
    const [activeTab, setActiveTab] = useState<'status' | 'events'>('status')
    const [events, setEvents] = useState<DeviceEvent[]>([])
    const [eventDeviceFilter, setEventDeviceFilter] = useState('')
    const [eventTypeFilter, setEventTypeFilter] = useState('')
    const [eventPage, setEventPage] = useState(1)

    const loadAll = async () => {
        if (!currentTenantId) return
        setLoading(true)
        const [devsRes, storesRes, rolesRes] = await Promise.all([
            supabase.from('devices')
                .select('id, device_code, display_name, store_id, role_id, active, store:stores(name,code), role:roles(name,key)')
                .eq('tenant_id', currentTenantId)
                .is('deleted_at', null),
            supabase.from('stores').select('*').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', currentTenantId).order('name'),
        ])

        const devices = devsRes.data || []
        const deviceIds = devices.map(d => d.id)
        const deviceCodes = devices.map(d => d.device_code)

        let hData: any[] | null = []

        if (deviceIds.length > 0) {
            // Fetch ANY heartbeat for these devices or codes (Manual join fallback)
            const { data, error: hbErr } = await supabase.from('device_heartbeats')
                .select('*')
                .or(`device_id.in.(${deviceIds.map(id => `"${id}"`).join(',')}),device_code.in.(${deviceCodes.map(c => `"${c}"`).join(',')})`)
                .order('last_seen_at', { ascending: false })
                .limit(500)

            hData = data
            if (hbErr) {
                console.error('[Monitoring] Heartbeat Query Failed:', hbErr)
            }
        }

        const dMap: Record<string, DeviceInfo> = {}
        for (const d of devices as unknown as DeviceInfo[]) {
            dMap[d.device_code] = d
        }
        setHeartbeats(hData || [])
        setDeviceMap(dMap)
        setStores(storesRes.data || [])
        setRoles(rolesRes.data || [])
        setLastRefresh(new Date())
        setLoading(false)

        const { data: evData } = await supabase
            .from('device_events')
            .select('id, device_code, event_type, occurred_at, meta')
            .eq('tenant_id', currentTenantId)
            .order('occurred_at', { ascending: false })
            .limit(500)
        setEvents(evData || [])
    }

    useEffect(() => {
        loadAll()

        if (!currentTenantId) return

        // 1. Subscribe to real-time heartbeat updates
        const hbChannel = supabase
            .channel('monitoring_heartbeats')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'device_heartbeats'
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setHeartbeats(prev => [payload.new as DeviceHeartbeat, ...prev].slice(0, 500))
                } else if (payload.eventType === 'UPDATE') {
                    setHeartbeats(prev => prev.map(hb => hb.id === (payload.new as any).id ? (payload.new as DeviceHeartbeat) : hb))
                }
            })
            .subscribe()

        // 2. Subscribe to device changes (metadata updates)
        const devChannel = supabase
            .channel('monitoring_devices')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'devices'
            }, (payload) => {
                if (payload.eventType === 'UPDATE') {
                    const updated = payload.new as DeviceInfo
                    setDeviceMap(prev => ({ ...prev, [updated.device_code]: updated }))
                } else if (payload.eventType === 'INSERT') {
                    loadAll() // Reload all metadata for new device
                }
            })
            .subscribe()

        // 3. Status Tick: Force re-render every 15s to update "Online Status" relative to current time
        const tick = setInterval(() => {
            setHeartbeats(prev => [...prev])
        }, 15000)

        // 4. Subscribe to device_events for real-time Event Log
        const evChannel = supabase
            .channel('monitoring_device_events')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'device_events'
            }, (payload) => {
                setEvents(prev => [payload.new as DeviceEvent, ...prev].slice(0, 500))
            })
            .subscribe()

        return () => {
            supabase.removeChannel(hbChannel)
            supabase.removeChannel(devChannel)
            supabase.removeChannel(evChannel)
            clearInterval(tick)
        }
    }, [currentTenantId])

    // Dedupe: latest heartbeat per device
    const latestHbMap = new Map<string, DeviceHeartbeat>()
    for (const hb of heartbeats) {
        const code = hb.device_code
        if (!latestHbMap.has(code)) {
            // This is the absolute latest heartbeat
            latestHbMap.set(code, { ...hb, meta: hb.meta || {} })
        } else {
            const current = latestHbMap.get(code)!
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
    const latestHbs = Array.from(latestHbMap.values())

    const filteredLatest = latestHbs.filter(hb => {
        const device = deviceMap[hb.device_code]
        if (!device) return false // Only show heartbeats for active, non-deleted devices

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

    const filteredEvents = events.filter(ev => {
        const matchDevice = !eventDeviceFilter || ev.device_code.toLowerCase().includes(eventDeviceFilter.toLowerCase())
        const matchType = !eventTypeFilter || ev.event_type === eventTypeFilter
        return matchDevice && matchType
    })
    const paginatedEvents = filteredEvents.slice((eventPage - 1) * EVENT_PAGE_SIZE, eventPage * EVENT_PAGE_SIZE)

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

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b' }}>
                <button
                    onClick={() => setActiveTab('status')}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: activeTab === 'status' ? 600 : 400, color: activeTab === 'status' ? 'var(--color-brand-500)' : '#64748b', borderBottom: activeTab === 'status' ? '2px solid var(--color-brand-500)' : '2px solid transparent', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Device Status
                </button>
                <button
                    onClick={() => setActiveTab('events')}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: activeTab === 'events' ? 600 : 400, color: activeTab === 'events' ? 'var(--color-brand-500)' : '#64748b', background: 'none', border: 'none', borderBottom: activeTab === 'events' ? '2px solid var(--color-brand-500)' : '2px solid transparent', cursor: 'pointer' }}>
                    Event Log {events.length > 0 && <span style={{ marginLeft: 4, background: '#1e293b', color: '#94a3b8', borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem' }}>{events.length}</span>}
                </button>
            </div>

            {activeTab === 'status' && (<>
                {/* Summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: 'rgba(var(--color-brand-rgb), 0.1)' }}>
                            <Activity size={22} color="var(--color-brand-500)" />
                        </div>
                        <div>
                            <div className="stat-value">{latestHbs.filter(hb => deviceMap[hb.device_code]).length + unseenDevices.length}</div>
                            <div className="stat-label">Total Devices</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)' }}>
                            <Wifi size={22} color="#22c55e" />
                        </div>
                        <div>
                            <div className="stat-value" style={{ color: '#22c55e' }}>{latestHbs.filter(hb => deviceMap[hb.device_code] && isOnline(hb.last_seen_at)).length}</div>
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
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                            <RefreshCw size={22} color="#f59e0b" />
                        </div>
                        <div>
                            <div className="stat-value" style={{ color: '#f59e0b' }}>
                                {latestHbs.filter(hb => {
                                    const m = hb.meta as any || {};
                                    return isOnline(hb.last_seen_at) && (m.is_rendering === false || (m.consecutive_errors ?? 0) > 0);
                                }).length}
                            </div>
                            <div className="stat-label">Playback Issues</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>
                            <Tv2 size={22} color="#ef4444" />
                        </div>
                        <div>
                            <div className="stat-value" style={{ color: '#ef4444' }}>
                                {latestHbs.filter(hb => {
                                    const m = hb.meta as any || {};
                                    return isOnline(hb.last_seen_at) && m.hdmi_status === 'disconnected';
                                }).length}
                            </div>
                            <div className="stat-label">HDMI Disconnected</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.15)' }}>
                            <Unplug size={22} color="#ef4444" />
                        </div>
                        <div>
                            <div className="stat-value" style={{ color: '#ef4444' }}>
                                {latestHbs.filter(hb => {
                                    const m = hb.meta as any || {}
                                    return isOnline(hb.last_seen_at) && m.lan_connected === false
                                }).length}
                            </div>
                            <div className="stat-label">LAN Disconnected</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                            <Globe size={22} color="#f59e0b" />
                        </div>
                        <div>
                            <div className="stat-value" style={{ color: '#f59e0b' }}>
                                {latestHbs.filter(hb => {
                                    const m = hb.meta as any || {}
                                    return isOnline(hb.last_seen_at) && m.lan_connected === true && m.internet_reachable === false
                                }).length}
                            </div>
                            <div className="stat-label">ISP Down</div>
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
                    <div className="card-header pb-0 border-b-0">
                        <h2 className="text-sm font-semibold text-surface-400">Device Status Overview</h2>
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
                                        <th>Store / Role</th>
                                        <th>Status</th>
                                        <th>Health (Disk/RAM)</th>
                                        <th>Last Seen</th>
                                        <th>Model & IP</th>
                                        <th>Link</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLatest.map(hb => {
                                        const device = deviceMap[hb.device_code]
                                        const online = isOnline(hb.last_seen_at)
                                        const meta = hb.meta || {}

                                        // Health metrics
                                        const diskPercent = meta.storage_total_gb ? Math.round(((meta.storage_total_gb - meta.storage_free_gb) / meta.storage_total_gb) * 100) : null
                                        const ramPercent = meta.ram_total_mb ? Math.round(((meta.ram_total_mb - meta.ram_free_mb) / meta.ram_total_mb) * 100) : null

                                        return (
                                            <tr key={hb.device_code}>
                                                <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text-primary)' }}>{hb.device_code}</td>
                                                <td>
                                                    <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{device?.display_name || 'Unlabeled'}</div>
                                                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>v{hb.current_version || '?.?'}</div>
                                                </td>
                                                <td>
                                                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{(device?.store as any)?.name || '—'}</div>
                                                    {device?.role && <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '0 4px', marginTop: 4 }}>{(device.role as any).key}</span>}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span className={`badge ${online ? (hb.status === 'playing' ? 'badge-green' : 'badge-blue') : 'badge-red'}`}>
                                                            {online ? (hb.status === 'playing' ? 'Playing' : 'Online') : 'Offline'}
                                                        </span>

                                                        {online && meta.is_rendering === false && (
                                                            <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                <AlertCircle size={10} /> CRASHED
                                                            </span>
                                                        )}

                                                        {online && (meta.consecutive_errors ?? 0) > 0 && (
                                                            <span title={meta.last_media_error} style={{ color: '#f59e0b', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                <AlertCircle size={10} /> {meta.consecutive_errors} ERRORS
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {(meta.storage_total_gb || meta.ram_total_mb) ? (
                                                        <div style={{ fontSize: '0.75rem' }}>
                                                            {meta.storage_total_gb !== undefined && (
                                                                <div title={`Disk: ${meta.storage_free_gb ?? 0}GB free of ${meta.storage_total_gb}GB`}>
                                                                    💾 <strong>{meta.storage_free_gb ?? '—'}</strong>GB
                                                                    <span style={{ color: 'var(--color-text-2)' }}> / {meta.storage_total_gb}GB</span>
                                                                </div>
                                                            )}
                                                            {meta.storage_quota_unavailable && !meta.storage_total_gb && (
                                                                <div style={{ color: 'var(--color-text-3)', fontSize: '0.7rem' }}>💾 Quota unavailable</div>
                                                            )}
                                                            {meta.ram_total_mb !== undefined && (
                                                                <div title={`RAM: ${meta.ram_free_mb ?? 0}MB free of ${meta.ram_total_mb}MB`}>
                                                                    🧠 <strong>{meta.ram_free_mb ?? '—'}</strong>MB
                                                                    <span style={{ color: 'var(--color-text-2)' }}> / {meta.ram_total_mb}MB</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : meta.storage_quota_unavailable ? (
                                                        <span style={{ color: 'var(--color-text-3)', fontSize: '0.75rem' }}>💾 Restricted</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-surface-500)' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>
                                                    {formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true })}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                                                            {meta.device_model || '—'}
                                                        </div>

                                                        {/* HDMI & Visibility Indicators */}
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            {meta.hdmi_status === 'disconnected' ? (
                                                                <span title="HDMI Disconnected" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', fontWeight: 600 }}>
                                                                    <Tv2 size={12} /> NO HDMI
                                                                </span>
                                                            ) : meta.hdmi_status === 'connected' ? (
                                                                <span title="HDMI Connected" style={{ color: '#22c55e' }}><Tv2 size={12} /></span>
                                                            ) : null}

                                                            {meta.display_visible === false ? (
                                                                <span title="Player Hidden" style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', fontWeight: 600 }}>
                                                                    <EyeOff size={12} /> HIDDEN
                                                                </span>
                                                            ) : meta.display_visible === true ? (
                                                                <span title="Player Visible" style={{ color: '#22c55e' }}><Eye size={12} /></span>
                                                            ) : null}
                                                        </div>

                                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-3)', fontFamily: 'monospace' }}>
                                                            {meta.local_ip || hb.ip_address || '—'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        <span
                                                            title={meta.lan_connected === true ? 'LAN connected' : meta.lan_connected === false ? 'LAN disconnected' : 'LAN unknown'}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: meta.lan_connected === true ? '#22c55e' : meta.lan_connected === false ? '#ef4444' : '#64748b' }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} /> LAN
                                                        </span>
                                                        <span
                                                            title={meta.internet_reachable === true ? 'Internet reachable' : meta.internet_reachable === false ? 'Internet unreachable' : 'Internet unknown'}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: meta.internet_reachable === true ? '#22c55e' : meta.internet_reachable === false ? '#ef4444' : '#64748b' }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} /> NET
                                                        </span>
                                                        <span
                                                            title={meta.hdmi_status === 'connected' ? 'HDMI connected' : meta.hdmi_status === 'disconnected' ? 'HDMI disconnected' : 'HDMI unknown'}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: meta.hdmi_status === 'connected' ? '#22c55e' : meta.hdmi_status === 'disconnected' ? '#ef4444' : '#64748b' }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} /> HDMI
                                                        </span>
                                                    </div>
                                                </td>
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
                                            <tr key={code} style={{ opacity: 0.6 }}>
                                                <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text-primary)' }}>{code}</td>
                                                <td style={{ color: 'var(--color-text-primary)' }}>{device?.display_name || '—'}</td>
                                                <td style={{ color: 'var(--color-text-2)' }}>{(device?.store as any)?.name || '—'}</td>
                                                <td><span className="badge badge-gray">○ Never Seen</span></td>
                                                <td><span style={{ color: 'var(--color-text-3)', fontSize: '0.75rem' }}>Awaiting first heartbeat</span></td>
                                                <td style={{ color: 'var(--color-text-3)' }}>—</td>
                                                <td style={{ color: 'var(--color-text-3)', fontSize: '0.75rem' }}>Open Player URL to pair</td>
                                                <td>—</td>
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
                                        <td style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{hb.device_code}</td>
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
            </>)}

            {activeTab === 'events' && (
                <div>
                    {/* Event Log filters */}
                    <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative', flex: '1 1 200px' }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <input type="text" className="input-field" placeholder="Filter by device code..." value={eventDeviceFilter}
                                    onChange={e => { setEventDeviceFilter(e.target.value); setEventPage(1) }} style={{ paddingLeft: '2rem' }} />
                            </div>
                            <select className="input-field" style={{ width: 'auto' }} value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); setEventPage(1) }}>
                                <option value="">All event types</option>
                                <option value="lan_connected">LAN Connected</option>
                                <option value="lan_disconnected">LAN Disconnected</option>
                                <option value="internet_lost">ISP Down</option>
                                <option value="internet_restored">ISP Restored</option>
                                <option value="hdmi_connected">HDMI Connected</option>
                                <option value="hdmi_disconnected">HDMI Disconnected</option>
                            </select>
                        </div>
                    </div>

                    {/* Event Log table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #1e293b', fontWeight: 600, fontSize: '0.875rem', color: '#94a3b8' }}>
                            Event Log ({filteredEvents.length} events)
                        </div>
                        {filteredEvents.length === 0 ? (
                            <div className="empty-state">
                                <Activity size={40} />
                                <h3>No events yet</h3>
                                <p>Connectivity and HDMI events will appear here in real time.</p>
                            </div>
                        ) : (
                            <>
                                <div className="table-wrapper">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Device</th>
                                                <th>Event</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedEvents.map(ev => {
                                                const color = EVENT_ICON_COLOR[ev.event_type] || '#64748b'
                                                const label = EVENT_LABEL[ev.event_type] || ev.event_type
                                                const EventIcon = ev.event_type.startsWith('lan') ? (ev.event_type === 'lan_disconnected' ? Unplug : Cable)
                                                    : ev.event_type.startsWith('internet') ? (ev.event_type === 'internet_lost' ? WifiOff : Wifi)
                                                    : Tv2
                                                return (
                                                    <tr key={ev.id}>
                                                        <td title={new Date(ev.occurred_at).toISOString()} style={{ fontSize: '0.8125rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                            {formatDistanceToNow(new Date(ev.occurred_at), { addSuffix: true })}
                                                        </td>
                                                        <td style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)', fontSize: '0.8125rem' }}>
                                                            {ev.device_code}
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color, fontWeight: 600, fontSize: '0.8125rem' }}>
                                                                <EventIcon size={14} />
                                                                {label}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination
                                    page={eventPage}
                                    totalPages={Math.ceil(filteredEvents.length / EVENT_PAGE_SIZE)}
                                    totalItems={filteredEvents.length}
                                    pageSize={EVENT_PAGE_SIZE}
                                    onPageChange={setEventPage}
                                />
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
