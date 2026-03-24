import React, { useState, useEffect, useCallback } from 'react'
import {
    Tv2, Layout, Activity, Shield, ArrowRight, PlayCircle, Layers, Settings,
    Plus, Monitor, Search, MoreVertical, Edit2, Trash2, RefreshCw, Smartphone,
    Copy, Check, Info, AlertCircle, Loader2, Link, ArrowLeftRight, Wifi,
    RotateCcw, History, Trash, Database, Eraser, Camera, QrCode, Eye, EyeOff, Download
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, callEdgeFn } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { Device, Store, Role, DeviceHeartbeat } from '../../types'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'

const PAGE_SIZE = 10
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes (lenient for debugging)

function isOnline(lastSeen?: string) {
    if (!lastSeen) return false
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

function generateDeviceCode(storeName?: string, roleName?: string) {
    const slugify = (s: string) => s.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '').substring(0, 6);

    if (storeName || roleName) {
        const p1 = storeName ? slugify(storeName) : 'UNK';
        const p2 = roleName ? slugify(roleName) : 'DEV';
        // Add a small 3-char random suffix to ensure uniqueness while keeping it identifyable
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const suffix = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `${p1}_${p2}_${suffix}`;
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    return Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') +
        '-' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function generateSecret() {
    return crypto.randomUUID()
}

const emptyForm = {
    device_code: '',
    display_name: '', store_id: '', role_id: '',
    orientation: 'landscape' as 'landscape' | 'portrait',
    resolution: '1920x1080', active: true
}

interface PairingInfo { device_code: string; device_secret: string }

export default function DevicesPage() {
    const { currentTenantId } = useTenant()
    const [devices, setDevices] = useState<Device[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [heartbeats, setHeartbeats] = useState<Record<string, DeviceHeartbeat>>({})
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [filterStore, setFilterStore] = useState('')
    const [filterRole, setFilterRole] = useState('')
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [showPairingModal, setShowPairingModal] = useState(false)
    const [showClaimModal, setShowClaimModal] = useState(false)
    const [claimPin, setClaimPin] = useState('')
    const [claiming, setClaiming] = useState(false)
    const [editing, setEditing] = useState<Device | null>(null)
    const [form, setForm] = useState(emptyForm)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [pairingInfo, setPairingInfo] = useState<PairingInfo | null>(null)
    const [revealedId, setRevealedId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'active' | 'bin'>('active')
    const [autoSyncCode, setAutoSyncCode] = useState(true)
    const [screenshotModal, setScreenshotModal] = useState<{
        deviceCode: string
        commandId: string
        imageUrl: string | null
        polling: boolean
    } | null>(null)

    const slugify = (s: string) => s.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '').substring(0, 20);

    const handleNameChange = (name: string) => {
        setForm(f => {
            const newForm = { ...f, display_name: name };
            if (autoSyncCode) {
                newForm.device_code = slugify(name);
            }
            return newForm;
        });
    }

    const loadData = useCallback(async () => {
        if (!currentTenantId) return
        setLoading(true)
        let query = supabase.from('devices').select('*, store:stores(id,code,name), role:roles(id,name,key)')
            .eq('tenant_id', currentTenantId)
            .order('display_name')

        if (viewMode === 'bin') {
            query = query.not('deleted_at', 'is', null)
        } else {
            query = query.is('deleted_at', null)
        }

        const [devicesRes, storesRes, rolesRes] = await Promise.all([
            query,
            supabase.from('stores').select('*').eq('tenant_id', currentTenantId).eq('active', true).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', currentTenantId).order('name'),
        ])
        setDevices(devicesRes.data || [])
        setStores(storesRes.data || [])
        setRoles(rolesRes.data || [])
        setLoading(false)

        const deviceIds = devicesRes.data?.map(d => d.id) || []
        const deviceCodes = devicesRes.data?.map(d => d.device_code) || []

        // Fetch ANY heartbeat for these devices or codes (Manual join fallback)
        const { data: hbData } = await supabase.from('device_heartbeats')
            .select('*')
            .or(`device_id.in.(${deviceIds.map(id => `"${id}"`).join(',')}), device_code.in.(${deviceCodes.map(c => `"${c}"`).join(',')})`)
            .order('last_seen_at', { ascending: false })

        const hbMap: Record<string, DeviceHeartbeat> = {}
        // Only keep the most recent heartbeat for each device_code, preferring 'playing'
        if (hbData) {
            for (const hb of hbData) {
                const code = hb.device_code
                if (!hbMap[code]) {
                    hbMap[code] = { ...hb, meta: hb.meta || {} }
                } else {
                    const current = hbMap[code]
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
        }
        setHeartbeats(hbMap)
    }, [currentTenantId, viewMode])

    const fetchDevices = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.from('devices').select('*, store:stores(id,code,name), role:roles(id,name,key)')
                .eq('tenant_id', currentTenantId).order('display_name')
            if (error) throw error
            setDevices(data || [])
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleClaim = async () => {
        if (claimPin.length !== 6) return toast.error('Please enter a 6-digit PIN')
        setClaiming(true)
        try {
            const res = await callEdgeFn('device-pairing', { action: 'CLAIM', pairing_pin: claimPin })
            if (res.error) throw new Error(res.error)

            toast.success(`Device "${res.device.display_name}" paired!`)
            setShowClaimModal(false)
            setClaimPin('')

            // Immediately open edit modal for the new device so user can assign store/role
            await loadData()
            openEdit(res.device)

            toast('Please assign a Store and Role to start displaying content.', {
                icon: '📺',
                duration: 5000
            })
        } catch (err: any) {
            toast.error(err.message || 'Invalid or expired PIN')
        } finally {
            setClaiming(false)
        }
    }

    useEffect(() => { loadData() }, [loadData])

    const filtered = devices.filter(d => {
        const matchSearch = (d.device_code + (d.display_name || '') + ((d as any).store?.name || '')).toLowerCase().includes(search.toLowerCase())
        const matchStore = !filterStore || d.store_id === filterStore
        const matchRole = !filterRole || d.role_id === filterRole
        return matchSearch && matchStore && matchRole
    })
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const openCreate = () => { setEditing(null); setForm(emptyForm); setAutoSyncCode(true); setShowModal(true) }
    const openEdit = (d: Device) => {
        setEditing(d)
        setForm({
            device_code: d.device_code,
            display_name: d.display_name || '',
            store_id: d.store_id || '', role_id: d.role_id || '',
            orientation: d.orientation, resolution: d.resolution, active: d.active
        })
        setAutoSyncCode(false) // Don't auto-sync by default when editing existing
        setShowModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            if (editing) {
                const { error } = await supabase.from('devices').update({
                    device_code: form.device_code,
                    display_name: form.display_name || null,
                    store_id: form.store_id || null, role_id: form.role_id || null,
                    orientation: form.orientation, resolution: form.resolution,
                    active: form.active, updated_at: new Date().toISOString(),
                }).eq('id', editing.id)
                if (error) throw error
                toast.success('Device updated')
                setShowModal(false)
                loadData()
            } else {
                // Auto-generate device_code + secret
                const selectedStore = stores.find(s => s.id === form.store_id);
                const selectedRole = roles.find(r => r.id === form.role_id);

                const device_code = generateDeviceCode(selectedStore?.name, selectedRole?.name)
                const device_secret = generateSecret()
                const { error } = await supabase.from('devices').insert({
                    ...form,
                    device_code: device_code,
                    device_secret: device_secret,
                    tenant_id: currentTenantId,
                })
                if (error) throw error
                toast.success('Device registered')
                setShowModal(false)
                setPairingInfo({ device_code, device_secret })
                setShowPairingModal(true)
                loadData()
            }
        } catch (err: any) {
            if (err.message?.includes('unique_device_code')) {
                toast.error('This device code is already in use by another screen.')
            } else {
                toast.error(err.message || 'Failed to save')
            }
        }
        setSaving(false)
    }

    const handleDelete = async (id: string, code: string) => {
        if (viewMode === 'active') {
            if (!confirm(`Move "${code}" to the Trash Bin? It will go offline immediately.`)) return
            setDeleting(id)
            try {
                const { error } = await supabase.from('devices').update({ deleted_at: new Date().toISOString() }).eq('id', id)
                if (error) throw error
                toast.success('Device moved to Bin')
                loadData()
            } catch (err: any) {
                toast.error(err.message)
            }
        } else {
            if (!confirm(`PERMANENTLY DELETE "${code}"? This cannot be undone.`)) return
            setDeleting(id)
            try {
                // Clear referenced rows to avoid basic foreign key constraint blocks
                await supabase.from('device_commands').delete().eq('device_id', id)
                await supabase.from('device_heartbeats').delete().eq('device_id', id)
                await supabase.from('layout_publications').delete().eq('device_id', id)

                const { error } = await supabase.from('devices').delete().eq('id', id)
                if (error) throw error
                toast.success('Device deleted permanently')
                loadData()
            } catch (err: any) {
                toast.error("Failed to delete device: " + err.message)
            }
        }
        setDeleting(null)
    }

    const handleRestore = async (id: string, code: string) => {
        setDeleting(id) // use deleting state for loader
        try {
            const { error } = await supabase.from('devices').update({ deleted_at: null }).eq('id', id)
            if (error) throw error
            toast.success(`Device "${code}" restored!`)
            loadData()
        } catch (err: any) {
            toast.error(err.message)
        }
        setDeleting(null)
    }


    const copyText = (text: string, label: string, id?: string) => {
        navigator.clipboard.writeText(text)
        if (id) setCopiedId(id)
        toast.success(`${label} copied`)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const handleReboot = async (deviceId: string, deviceCode: string) => {
        if (!confirm(`Send reboot command to device ${deviceCode}?`)) return
        try {
            const { error } = await supabase.from('device_commands').insert({
                device_id: deviceId,
                command: 'REBOOT',
                status: 'PENDING'
            })
            if (error) throw error
            toast.success(`Reboot command queued for ${deviceCode}`)
        } catch (err: any) {
            toast.error(`Failed to queue reboot: ${err.message} `)
        }
    }

    const handleClearCache = async (deviceId: string, deviceCode: string) => {
        if (!confirm(`Force ${deviceCode} to clear its local storage and cache? This will cause a full re-download of all media.`)) return
        try {
            const { error } = await supabase.from('device_commands').insert({
                device_id: deviceId,
                command: 'CLEAR_CACHE',
                status: 'PENDING'
            })
            if (error) throw error
            toast.success(`Clear cache command sent to ${deviceCode}`)
        } catch (err: any) {
            toast.error(`Failed to send command: ${err.message}`)
        }
    }

    const handleCheckUpdate = async (deviceId: string, deviceCode: string) => {
        try {
            const { error } = await supabase.from('device_commands').insert({
                device_id: deviceId,
                command: 'CHECK_UPDATE',
                status: 'PENDING'
            })
            if (error) throw error
            toast.success(`Update check requested for ${deviceCode}`)
        } catch (err: any) {
            toast.error(`Failed to request update: ${err.message}`)
        }
    }

    const handleScreenshot = async (deviceId: string, deviceCode: string) => {
        try {
            const { data, error } = await supabase.from('device_commands').insert({
                device_id: deviceId,
                command: 'SCREENSHOT',
                status: 'PENDING'
            }).select('id').single()
            if (error) throw error
            const commandId = data.id
            setScreenshotModal({ deviceCode, commandId, imageUrl: null, polling: true })
            toast.success(`Screenshot requested from ${deviceCode}. Waiting for device...`)

            // Poll Supabase Storage for the uploaded image
            const pollInterval = setInterval(async () => {
                const fileName = `${deviceCode}_${commandId}.jpg`
                const { data: files } = await supabase.storage
                    .from('device-screenshots')
                    .list('screenshots', { search: fileName })

                if (files && files.length > 0) {
                    // Check if exact file exists
                    const match = files.find(f => f.name === fileName)
                    if (match) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('device-screenshots')
                            .getPublicUrl(`screenshots/${fileName}`)

                        clearInterval(pollInterval)
                        setScreenshotModal(prev => prev ? { ...prev, imageUrl: publicUrl, polling: false } : null)
                    }
                }
            }, 3000)

            // Stop polling after 2 minutes regardless
            setTimeout(() => {
                clearInterval(pollInterval)
                setScreenshotModal(prev => prev ? { ...prev, polling: false } : null)
            }, 120_000)

        } catch (err: any) {
            toast.error(`Failed to request screenshot: ${err.message}`)
        }
    }

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Devices</h1>
                    <p className="page-subtitle">Manage display devices across store locations</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" onClick={loadData} title="Refresh"><RefreshCw size={14} /></button>
                    <button className="btn-secondary" onClick={() => setShowClaimModal(true)}>
                        <Tv2 size={16} />
                        Pair with Code
                    </button>
                    <button id="create-device-btn" className="btn-primary" onClick={openCreate}><Plus size={16} /> Add Device</button>
                </div>
            </div>

            {/* Player Auth note */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem 1.25rem', marginBottom: '1rem', background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 10 }}>
                <Info size={15} color="#06b6d4" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    <strong style={{ color: '#67e8f9' }}>Player Auth:</strong> The Player calls <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: 3, color: '#7a8aff' }}>/device/manifest</code> with <code>device_code</code> + <code>device_secret</code> to fetch the active bundle (resolved by priority: <strong>DEVICE &gt; STORE &gt; GLOBAL</strong>).
                </p>
            </div>

            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>

                    {/* View Mode Toggle */}
                    <div className="btn-group-glass">
                        <button
                            className={`btn-tab-glass ${viewMode === 'active' ? 'active' : ''}`}
                            onClick={() => setViewMode('active')}
                        >
                            Active
                        </button>
                        <button
                            className={`btn-tab-glass error-tab ${viewMode === 'bin' ? 'active' : ''}`}
                            onClick={() => setViewMode('bin')}
                        >
                            <Trash2 size={12} /> Bin
                        </button>
                    </div>

                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-surface-200)' }} />
                        <input type="text" className="input-field" placeholder={`Search ${viewMode === 'bin' ? 'bin' : 'devices'}...`} value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem' }} />
                    </div>
                    {viewMode === 'active' && (
                        <>
                            <select className="input-field" style={{ width: 'auto' }} value={filterStore} onChange={e => { setFilterStore(e.target.value); setPage(1) }}>
                                <option value="">All stores</option>
                                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select className="input-field" style={{ width: 'auto' }} value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1) }}>
                                <option value="">All roles</option>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </>
                    )}
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <Monitor size={40} />
                        <h3>No devices found</h3>
                        <p>{search || filterStore || filterRole ? 'Try adjusting filters.' : 'Register your first display device.'}</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Device Code</th>
                                        <th>Display Name</th>
                                        <th>Store</th>
                                        <th>Role</th>
                                        <th>Orientation</th>
                                        <th>Device Secret</th>
                                        <th>Status</th>
                                        <th>Last Seen</th>
                                        <th>Version</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(d => {
                                        const hb = heartbeats[d.device_code]
                                        const online = isOnline(hb?.last_seen_at)
                                        return (
                                            <tr key={d.id}>
                                                <td><span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)', letterSpacing: '0.05em' }}>{d.device_code}</span></td>
                                                <td style={{ color: 'var(--color-text-primary)' }}>{d.display_name || '—'}</td>
                                                <td style={{ color: 'var(--color-surface-400)', fontSize: '0.8125rem' }}>{(d as any).store?.name || '—'}</td>
                                                <td>
                                                    {(d as any).role?.key
                                                        ? <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>{(d as any).role.key}</span>
                                                        : <span style={{ color: 'var(--color-surface-600)' }}>—</span>
                                                    }
                                                </td>
                                                <td style={{ color: 'var(--color-surface-500)', fontSize: '0.8125rem' }}>{d.orientation}</td>
                                                {/* ── Device Secret cell ── */}
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                        <span style={{
                                                            fontFamily: 'monospace', fontSize: '0.7rem',
                                                            color: revealedId === d.id ? 'var(--color-brand-400)' : 'var(--color-surface-600)',
                                                            maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            letterSpacing: revealedId === d.id ? undefined : '0.1em',
                                                        }}>
                                                            {revealedId === d.id ? d.device_secret : '••••••••••••'}
                                                        </span>
                                                        <button
                                                            onClick={() => setRevealedId(revealedId === d.id ? null : d.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '0.2rem', display: 'flex' }}
                                                            title={revealedId === d.id ? 'Hide secret' : 'Reveal secret'}
                                                        >
                                                            {revealedId === d.id ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        </button>
                                                        <button
                                                            onClick={() => copyText(d.device_secret, 'Secret', d.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === d.id ? '#22c55e' : '#475569', padding: '0.2rem', display: 'flex' }}
                                                            title="Copy secret"
                                                        >
                                                            {copiedId === d.id ? <Check size={12} /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${online ? 'badge-green' : hb ? 'badge-red' : 'badge-gray'} `}>
                                                        {online ? '● Online' : hb ? '● Offline' : '○ Never'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: '0.8125rem', color: 'var(--color-surface-500)' }}>
                                                    {hb ? formatDistanceToNow(new Date(hb.last_seen_at), { addSuffix: true }) : '—'}
                                                </td>
                                                <td>
                                                    {hb?.current_version
                                                        ? <span className="badge badge-blue">{hb.current_version}</span>
                                                        : <span style={{ color: 'var(--color-surface-600)' }}>—</span>
                                                    }
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        {viewMode === 'active' ? (
                                                            <>
                                                                <button onClick={() => openEdit(d)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }} title="Edit device">
                                                                    <Edit2 size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReboot(d.id, d.device_code)}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '0.375rem 0.625rem' }}
                                                                    title="Remote Reboot"
                                                                >
                                                                    <RotateCcw size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleClearCache(d.id, d.device_code)}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '0.375rem 0.625rem' }}
                                                                    title="Clear Device Cache"
                                                                >
                                                                    <Eraser size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleCheckUpdate(d.id, d.device_code)}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '0.375rem 0.625rem' }}
                                                                    title="Check for App Update"
                                                                >
                                                                    <Download size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleScreenshot(d.id, d.device_code)}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '0.375rem 0.625rem' }}
                                                                    title="Request Screenshot"
                                                                >
                                                                    <Camera size={13} />
                                                                </button>
                                                                <button
                                                                    onClick={() => { setPairingInfo({ device_code: d.device_code, device_secret: d.device_secret }); setShowPairingModal(true) }}
                                                                    className="btn-secondary"
                                                                    style={{ padding: '0.375rem 0.625rem' }}
                                                                    title="Show pairing info"
                                                                >
                                                                    <QrCode size={13} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleRestore(d.id, d.device_code)}
                                                                className="btn-secondary"
                                                                style={{ padding: '0.375rem 0.625rem', color: '#10b981' }}
                                                                title="Restore Device"
                                                            >
                                                                <RotateCcw size={13} />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(d.id, d.device_code)}
                                                            className="btn-danger"
                                                            style={{ padding: '0.375rem 0.625rem' }}
                                                            disabled={deleting === d.id}
                                                            title={viewMode === 'bin' ? "Delete permanently" : "Move to Bin"}
                                                        >
                                                            {deleting === d.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </>
                )}
            </div>

            {/* Register Device Modal */}
            {showModal && (
                <Modal title={editing ? 'Edit Device' : 'Register Device'} onClose={() => setShowModal(false)}>
                    {!editing ? (
                        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(90,100,246,0.08)', border: '1px solid rgba(90,100,246,0.2)', borderRadius: 8, fontSize: '0.8125rem', color: '#94a3b8' }}>
                            ✨ <strong style={{ color: '#c7d2fe' }}>Device Secret will be auto-generated</strong> — shown after creation for pairing.
                        </div>
                    ) : (
                        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.8125rem', color: '#fbbf24' }}>
                            ⚠️ <strong style={{ color: '#fbbf24' }}>Renaming the Device Code</strong> will require you to update the URL on the physical screen (TV).
                        </div>
                    )}
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label className="label">Device Code *</label>
                            <input className="input-field"
                                value={form.device_code}
                                onChange={e => {
                                    const val = e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
                                    setForm(f => ({ ...f, device_code: val }));
                                    setAutoSyncCode(false); // Stop auto-sync if manually edited
                                }}
                                placeholder="e.g. SHOP01_SCREEN01"
                                required
                            />
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#64748b' }}>
                                This forms the Device URL: <code>/player/{form.device_code || '...'}</code>
                            </p>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Store</label>
                                <select className="input-field" value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}>
                                    <option value="">— Unassigned —</option>
                                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Role</label>
                                <select className="input-field" value={form.role_id} onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}>
                                    <option value="">— Unassigned —</option>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name} {r.key ? `(${r.key})` : ''}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                                <label className="label" style={{ marginBottom: 0 }}>Display Name</label>
                                <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={autoSyncCode} onChange={e => setAutoSyncCode(e.target.checked)} style={{ width: 12, height: 12 }} />
                                    Auto-sync URL
                                </label>
                            </div>
                            <input
                                className="input-field"
                                value={form.display_name}
                                onChange={e => handleNameChange(e.target.value)}
                                placeholder="e.g. Front Counter Screen"
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Orientation</label>
                                <select className="input-field" value={form.orientation} onChange={e => setForm(f => ({ ...f, orientation: e.target.value as any }))}>
                                    <option value="landscape">Landscape</option>
                                    <option value="portrait">Portrait</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Resolution</label>
                                <select className="input-field" value={form.resolution} onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}>
                                    <option value="1920x1080">1920×1080 (Full HD)</option>
                                    <option value="3840x2160">3840×2160 (4K)</option>
                                    <option value="1280x720">1280×720 (HD)</option>
                                    <option value="1080x1920">1080×1920 (Portrait FHD)</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                                Active
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Saving…' : editing ? 'Update Device' : 'Register Device'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Pairing Instructions Modal */}
            {showPairingModal && pairingInfo && (
                <Modal title="📺 Device Pairing Instructions" onClose={() => setShowPairingModal(false)}>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
                        Device registered! Use the credentials below to configure the Player app on the screen.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#0f172a', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid #1e293b' }}>
                        <div style={{ background: 'white', padding: '1rem', borderRadius: 8, marginBottom: '1rem' }}>
                            <QRCodeSVG
                                id="pairing-qr"
                                value={pairingInfo.device_code.includes('code=') ? pairingInfo.device_code : `${window.location.origin}/player/${pairingInfo.device_code}?secret=${pairingInfo.device_secret}`}
                                size={180}
                                level="H"
                                includeMargin={false}
                            />
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                            Scan this QR code with the display's camera <br /> to auto-configure instantly.
                        </div>
                    </div>

                    {[
                        { label: 'Device Code', value: pairingInfo.device_code, mono: true, highlight: true },
                        { label: 'Device Secret', value: pairingInfo.device_secret, mono: true },
                        { label: 'Auto-Pair URL', value: `${window.location.origin}/player/${pairingInfo.device_code}?secret=${pairingInfo.device_secret}`, mono: true },
                    ].map(row => (
                        <div key={row.label} style={{ marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.375rem' }}>
                                {row.label}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#0f172a', borderRadius: 8, border: `1px solid ${row.highlight ? 'rgba(90,100,246,0.4)' : '#1e293b'} ` }}>
                                <span style={{ flex: 1, fontFamily: row.mono ? 'monospace' : undefined, fontSize: row.highlight ? '1.125rem' : '0.8125rem', color: row.highlight ? '#c7d2fe' : '#cbd5e1', letterSpacing: row.highlight ? '0.15em' : undefined, fontWeight: row.highlight ? 700 : undefined, wordBreak: 'break-all' }}>
                                    {row.value}
                                </span>
                                <button
                                    onClick={() => copyText(row.value, row.label)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex', flexShrink: 0 }}
                                    title={`Copy ${row.label} `}
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.8125rem', color: '#92400e', marginTop: '0.5rem' }}>
                        ⚠️ <strong style={{ color: '#fbbf24' }}>Save the Device Secret now.</strong> It will not be shown again. Manual entry is also supported on the Player.
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                        <button className="btn-primary" onClick={() => setShowPairingModal(false)}>Done</button>
                    </div>
                </Modal>
            )}
            {/* Claim Device via PIN Modal */}
            {showClaimModal && (
                <Modal title="🔗 Pair Screen with Code" onClose={() => setShowClaimModal(false)}>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                        Enter the 6-digit code displayed on your player screen to securely link it to this account.
                    </div>

                    <div className="form-group">
                        <label>Pairing Code</label>
                        <input
                            type="text"
                            placeholder="000000"
                            maxLength={6}
                            value={claimPin}
                            onChange={(e) => setClaimPin(e.target.value.replace(/[^0-9]/g, ''))}
                            style={{
                                textAlign: 'center',
                                fontSize: '2rem',
                                letterSpacing: '0.3em',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                height: 'auto',
                                padding: '1rem'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                        <button className="btn-secondary" onClick={() => setShowClaimModal(false)}>Cancel</button>
                        <button
                            className="btn-primary"
                            disabled={claiming || claimPin.length !== 6}
                            onClick={handleClaim}
                        >
                            {claiming ? 'Pairing…' : 'Pair Device'}
                        </button>
                    </div>

                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#0f172a', borderRadius: 8, fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                        The code is unique and expires every 10 minutes for security.
                    </div>
                </Modal>
            )}
            {/* Screenshot Viewer Modal */}
            {screenshotModal && (
                <Modal title={`📸 Screenshot — ${screenshotModal.deviceCode}`} onClose={() => setScreenshotModal(null)}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', minHeight: 200 }}>
                        {screenshotModal.polling && !screenshotModal.imageUrl && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '2rem' }}>
                                <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
                                <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center' }}>
                                    Waiting for the device to capture and upload the screenshot…<br />
                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>This may take up to 30 seconds.</span>
                                </p>
                            </div>
                        )}
                        {!screenshotModal.polling && !screenshotModal.imageUrl && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', paddingTop: '2rem', color: '#f87171' }}>
                                <AlertCircle size={36} />
                                <p style={{ fontSize: '0.875rem', textAlign: 'center', color: '#94a3b8' }}>
                                    No screenshot received. The device may be offline<br />or does not support native screenshots.
                                </p>
                            </div>
                        )}
                        {screenshotModal.imageUrl && (
                            <>
                                <img
                                    src={screenshotModal.imageUrl}
                                    alt={`Screenshot of ${screenshotModal.deviceCode}`}
                                    style={{ width: '100%', borderRadius: 8, border: '1px solid #1e293b', objectFit: 'contain', maxHeight: 500 }}
                                />
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <a
                                        href={screenshotModal.imageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-secondary"
                                        style={{ fontSize: '0.8125rem', textDecoration: 'none' }}
                                    >
                                        Open Full Size ↗
                                    </a>
                                    <a
                                        href={screenshotModal.imageUrl}
                                        download={`${screenshotModal.deviceCode}_screenshot.jpg`}
                                        className="btn-primary"
                                        style={{ fontSize: '0.8125rem', textDecoration: 'none' }}
                                    >
                                        Download
                                    </a>
                                </div>
                            </>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    )
}

