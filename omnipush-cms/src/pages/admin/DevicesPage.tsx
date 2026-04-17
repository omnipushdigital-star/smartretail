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
const ONLINE_THRESHOLD_MS = 1 * 60 * 1000 // 1 minute threshold as requested

function isOnline(lastSeen?: string) {
    if (!lastSeen) return false
    return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS
}

function formatShorthandTime(dateStr?: string) {
    if (!dateStr) return '—'
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
    if (diff < 60) return '< 1m'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
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
    const [playlists, setPlaylists] = useState<any[]>([])
    const [heartbeats, setHeartbeats] = useState<Record<string, DeviceHeartbeat>>({})
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
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
    const [selectedHealthDevice, setSelectedHealthDevice] = useState<Device | null>(null)

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

        const [devicesRes, storesRes, rolesRes, playlistsRes] = await Promise.all([
            query,
            supabase.from('stores').select('*').eq('tenant_id', currentTenantId).eq('active', true).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('playlists').select('id, name').eq('tenant_id', currentTenantId).order('name'),
        ])
        setDevices(devicesRes.data || [])
        setStores(storesRes.data || [])
        setRoles(rolesRes.data || [])
        setPlaylists(playlistsRes.data || [])
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

                        // 2. Merge 'current_version' if newest is null but recent has it
                        if (!current.current_version && hb.current_version) {
                            current.current_version = hb.current_version
                        }

                        // 3. Merge meta: if current is missing health stats but previous (recent) has them, merge
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
            const res = await callEdgeFn('device-pairing', { action: 'CLAIM', pairing_pin: claimPin, tenant_id: currentTenantId })
            if (res.error) throw new Error(res.error)

            toast.success(`Device "${res.device.display_name}" paired!`)
            setShowClaimModal(false)
            setClaimPin('')

            // Immediately open edit modal for the new device so user can assign store/role
            await loadData()
            openEdit(res.device)

            toast('Please assign a Store and Role to start displaying content.', {
                icon: 'ðŸ“º',
                duration: 5000
            })
        } catch (err: any) {
            toast.error(err.message || 'Invalid or expired PIN')
        } finally {
            setClaiming(false)
        }
    }

    useEffect(() => { loadData() }, [loadData])
    
    // ─── Real-time Heartbeats & Status Tick ──────────────────────────────────
    useEffect(() => {
        if (!currentTenantId) return

        // 1. Subscribe to real-time heartbeat updates
        const channel = supabase
            .channel('realtime_heartbeats')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'device_heartbeats' 
            }, (payload) => {
                const newHb = payload.new as DeviceHeartbeat
                if (newHb && newHb.device_code) {
                    setHeartbeats(prev => ({
                        ...prev,
                        [newHb.device_code]: { ...newHb, meta: newHb.meta || {} }
                    }))
                }
            })
            .subscribe()

        // 2. Subscribe to device changes (metadata updates)
        const devChannel = supabase
            .channel('realtime_devices')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'devices' 
            }, (payload) => {
                // If a device is deleted or moved to bin, we should just reload for simplicity
                // but for updates we can merge into existing state
                if (payload.eventType === 'UPDATE') {
                    const up = payload.new as Device
                    setDevices(prev => prev.map(d => d.id === up.id ? { ...d, ...up } : d))
                } else {
                    loadData()
                }
            })
            .subscribe()

        // 3. Force re-render every 15s to update "Last Seen" and "Online" status
        const tick = setInterval(() => {
            setHeartbeats(prev => ({ ...prev })) 
        }, 15000)

        return () => {
            supabase.removeChannel(channel)
            supabase.removeChannel(devChannel)
            clearInterval(tick)
        }
    }, [currentTenantId])

    const filtered = devices.filter(d => {
        const matchSearch = (d.device_code + (d.display_name || '') + ((d as any).store?.name || '')).toLowerCase().includes(search.toLowerCase())
        const matchStore = !filterStore || d.store_id === filterStore
        const matchRole = !filterRole || d.role_id === filterRole
        return matchSearch && matchStore && matchRole
    })
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    useEffect(() => {
        setSelectedIds([])
    }, [viewMode])

    const toggleSelectAll = () => {
        if (selectedIds.length === paginated.length) {
            setSelectedIds([])
        } else {
            setSelectedIds(paginated.map(d => d.id))
        }
    }

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const handleBulkDelete = async () => {
        if (!selectedIds.length) return
        const count = selectedIds.length
        const isBin = viewMode === 'bin'
        if (!confirm(isBin ? `Permanently delete ${count} selected devices?` : `Move ${count} devices to Bin?`)) return

        setLoading(true)
        try {
            if (isBin) {
                // Permanent
                await supabase.from('device_commands').delete().in('device_id', selectedIds)
                await supabase.from('device_heartbeats').delete().in('device_id', selectedIds)
                await supabase.from('layout_publications').delete().in('device_id', selectedIds)
                const { error } = await supabase.from('devices').delete().in('id', selectedIds)
                if (error) throw error
            } else {
                // Soft delete
                const { error } = await supabase.from('devices').update({ deleted_at: new Date().toISOString() }).in('id', selectedIds)
                if (error) throw error
            }
            toast.success(isBin ? 'Permanently deleted' : 'Moved to Bin')
            setSelectedIds([])
            loadData()
        } catch (err: any) {
            toast.error(err.message)
        }
        setLoading(false)
    }

    const handleBulkAssignPlaylist = async (playlistId: string) => {
        if (!playlistId || selectedIds.length === 0) return
        setLoading(true)
        try {
            const updates: any = { updated_at: new Date().toISOString() }
            if (playlistId === 'NULL') updates.playlist_id = null
            else updates.playlist_id = playlistId

            const { error } = await supabase.from('devices')
                .update(updates)
                .in('id', selectedIds)
            if (error) throw error
            toast.success(`Updated ${selectedIds.length} screens`)
            setSelectedIds([])
            loadData()
        } catch (err: any) {
            toast.error(err.message)
        }
        setLoading(false)
    }
    const handleBulkRestore = async () => {
        if (!selectedIds.length) return
        const count = selectedIds.length
        try {
            const { error } = await supabase.from('devices').update({ deleted_at: null }).in('id', selectedIds)
            if (error) throw error
            toast.success(`${count} devices restored`)
            setSelectedIds([])
            loadData()
        } catch (err: any) {
            toast.error(err.message)
        }
    }

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
                    display_name: form.display_name || null,
                    store_id: form.store_id || null,
                    role_id: form.role_id || null,
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

                // Clear associated screenshots from storage
                try {
                    const { data: files } = await supabase.storage.from('device-screenshots').list('screenshots', { search: code })
                    if (files && files.length > 0) {
                        const paths = files.map(f => `screenshots/${f.name}`)
                        await supabase.storage.from('device-screenshots').remove(paths)
                    }
                } catch (e) { console.error('Screenshot cleanup failed', e) }

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

    const handleToggleDebug = async (deviceId: string, deviceCode: string) => {
        try {
            const { error } = await supabase.from('device_commands').insert({
                device_id: deviceId,
                command: 'TOGGLE_DEBUG',
                status: 'PENDING'
            })
            if (error) throw error
            toast.success(`Debug overlay toggle requested for ${deviceCode}`)
        } catch (err: any) {
            toast.error(`Failed to request debug toggle: ${err.message}`)
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
                <Info size={15} color="#0891b2" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-soft)', lineHeight: 1.5 }}>
                    <strong style={{ color: '#0891b2' }}>Player Auth:</strong> The Player calls <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: 3, color: '#7a8aff' }}>/device/manifest</code> with <code>device_code</code> + <code>device_secret</code> to fetch the active bundle (resolved by priority: <strong>DEVICE &gt; STORE &gt; GLOBAL</strong>).
                </p>
            </div>

            {/* TOP FILTERS & TOOLBAR */}
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>

                    {/* Status Tabs */}
                    <div className="btn-group-glass">
                        <button className={`btn-tab-glass ${viewMode === 'active' ? 'active' : ''}`} onClick={() => setViewMode('active')}>Active</button>
                        <button className={`btn-tab-glass error-tab ${viewMode === 'bin' ? 'active' : ''}`} onClick={() => setViewMode('bin')}><Trash2 size={12} /> Bin</button>
                    </div>

                    <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

                    {/* Store Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-soft)', fontWeight: 800 }}>Store:</span>
                        <select
                            className="input-field"
                            style={{ width: 'auto', height: 36, fontSize: '0.8125rem', padding: '0 2rem 0 0.75rem', background: 'var(--color-surface-900)' }}
                            value={filterStore}
                            onChange={(e) => { setFilterStore(e.target.value); setPage(1) }}
                        >
                            <option value="">All Stores</option>
                            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    {/* Role Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-soft)', fontWeight: 800 }}>Role:</span>
                        <select
                            className="input-field"
                            style={{ width: 'auto', height: 36, fontSize: '0.8125rem', padding: '0 2rem 0 0.75rem', background: 'var(--color-surface-900)' }}
                            value={filterRole}
                            onChange={(e) => { setFilterRole(e.target.value); setPage(1) }}
                        >
                            <option value="">All Roles</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)' }} />
                        <input type="text" className="input-field" placeholder={`Search ${viewMode === 'bin' ? 'bin' : 'devices'}...`} value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ paddingLeft: '2rem', height: 36 }} />
                    </div>

                    <button className="btn-secondary" onClick={loadData} title="Refresh" style={{ height: 36 }}><RefreshCw size={14} /></button>
                </div>

                {/* Selection Counter & Batch Actions */}
                {selectedIds.length > 0 && (
                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(var(--color-brand-rgb), 0.1)', border: '1px solid rgba(var(--color-brand-rgb), 0.2)', padding: '0.625rem 1rem', borderRadius: 12 }}>
                        <span style={{ color: 'var(--color-brand-400)', fontWeight: 700, fontSize: '0.8rem' }}>{selectedIds.length} Selected</span>
                        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />

                        {viewMode === 'active' ? (
                            <>
                                <select
                                    className="input-field"
                                    style={{ width: 'auto', height: '28px', fontSize: '0.75rem', padding: '0 0.5rem', background: 'var(--color-surface-900)' }}
                                    onChange={(e) => {
                                        if (e.target.value) handleBulkAssignPlaylist(e.target.value)
                                        e.target.value = ''
                                    }}
                                >
                                    <option value="">Batch Assign Playlist...</option>
                                    <option value="NULL">— No Playlist —</option>
                                    {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <button onClick={handleBulkDelete} className="btn-danger" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>
                                    <Trash2 size={12} /> Move to Bin
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={handleBulkRestore} className="text-emerald-400 hover:text-emerald-300 text-sm font-bold flex items-center gap-1.5 transition-colors"><RotateCcw size={14} /> Restore Selected</button>
                                <button onClick={handleBulkDelete} className="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-1.5 transition-colors"><Trash2 size={14} /> Delete Selected Permanently</button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '0rem', alignItems: 'flex-start' }}>
                {/* RIGHT: Devices content */}
                <div style={{ flex: 1, minWidth: 0 }}>


                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-2)' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
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
                                                <th style={{ width: 40 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.length > 0 && selectedIds.length === paginated.length}
                                                        onChange={toggleSelectAll}
                                                        className="w-4 h-4 rounded border-slate-700 bg-slate-900"
                                                    />
                                                </th>
                                                <th style={{ textAlign: 'left', paddingLeft: '1rem', color: 'var(--color-text-primary)', fontWeight: 900 }}>Device Code</th>
                                                <th style={{ textAlign: 'left', color: 'var(--color-text-primary)', fontWeight: 900 }}>Display Name</th>
                                                <th style={{ textAlign: 'left', color: 'var(--color-text-primary)', fontWeight: 900 }}>Store</th>
                                                <th style={{ textAlign: 'left', color: 'var(--color-text-primary)', fontWeight: 900 }}>Role</th>
                                                <th style={{ textAlign: 'left', color: 'var(--color-text-primary)', fontWeight: 900 }}>Orientation</th>
                                                <th style={{ textAlign: 'left', color: 'var(--color-text-primary)', fontWeight: 900 }}>Secret</th>
                                                <th style={{ textAlign: 'center', color: 'var(--color-text-primary)', fontWeight: 900 }}>Connection</th>
                                                <th style={{ textAlign: 'left', color: 'var(--color-text-primary)', fontWeight: 900 }}>Last Seen</th>
                                                <th style={{ textAlign: 'center', color: 'var(--color-text-primary)', fontWeight: 900 }}>Version</th>
                                                <th style={{ textAlign: 'center', color: 'var(--color-text-primary)', fontWeight: 900 }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginated.map(d => {
                                                const hb = heartbeats[d.device_code]
                                                const online = isOnline(hb?.last_seen_at)
                                                const isSelected = selectedIds.includes(d.id)
                                                return (
                                                    <tr key={d.id} className={isSelected ? 'bg-brand-500/5' : ''}>
                                                        <td style={{ width: 40 }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIds.includes(d.id)}
                                                                onChange={() => toggleSelect(d.id)}
                                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900"
                                                            />
                                                        </td>
                                                        <td><span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.875rem', color: isSelected ? 'var(--color-brand-500)' : 'var(--color-text-primary)', letterSpacing: '0.05em' }}>{d.device_code}</span></td>
                                                        <td style={{ color: 'var(--color-text-primary) !important' }}><span className="force-visible" style={{ fontWeight: 900 }}>{d.display_name || '—'}</span></td>
                                                        <td style={{ fontSize: '0.925rem' }}>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.875rem', color: isSelected ? 'var(--color-brand-500)' : 'var(--color-text-primary)', letterSpacing: '0.05em' }}>{(d as any).store?.name || '—'}</span>
                                                        </td>
                                                        <td>
                                                            {(d as any).role?.key
                                                                ? <span className="badge badge-blue" style={{ fontFamily: 'monospace' }}>{(d as any).role.key}</span>
                                                                : <span style={{ color: 'var(--color-text-primary) !important' }}>—</span>
                                                            }
                                                        </td>
                                                        <td style={{ fontSize: '0.925rem', textTransform: 'capitalize' }}>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.875rem', color: isSelected ? 'var(--color-brand-500)' : 'var(--color-text-primary)', letterSpacing: '0.05em' }}>{d.orientation}</span>
                                                        </td>
                                                        {/* â”€â”€ Device Secret cell â”€â”€ */}
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                 <span style={{
                                                                    fontFamily: 'monospace', fontSize: '0.875rem',
                                                                    color: revealedId === d.id ? 'var(--color-brand-500)' : 'var(--color-text-primary)',
                                                                     maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                                     letterSpacing: revealedId === d.id ? '0.05em' : '0.1em',
                                                                     fontWeight: 900
                                                                 }}>
                                                                     {revealedId === d.id ? d.device_secret : '••••••••••••'}
                                                                 </span>
                                                                 <button
                                                                     onClick={() => setRevealedId(revealedId === d.id ? null : d.id)}
                                                                     style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', padding: '0.2rem', display: 'flex' }}
                                                                     title={revealedId === d.id ? 'Hide secret' : 'Reveal secret'}
                                                                 >
                                                                     {revealedId === d.id ? <EyeOff size={13} /> : <Eye size={13} />}
                                                                 </button>
                                                                 <button
                                                                     onClick={() => copyText(d.device_secret, 'Secret', d.id)}
                                                                     style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === d.id ? 'var(--color-success)' : 'var(--color-text-primary)', padding: '0.2rem', display: 'flex' }}
                                                                    title="Copy secret"
                                                                >
                                                                    {copiedId === d.id ? <Check size={13} /> : <Copy size={13} />}
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                                <span className={`badge ${online ? 'badge-green' : hb ? 'badge-red' : 'badge-gray'}`}>
                                                                    {online ? '• Online' : hb ? '• Offline' : 'Never'}
                                                                </span>
                                                                {hb?.meta && (hb.meta as any).hdmi_status === 'disconnected' && (
                                                                    <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(239, 68, 68, 0.1)', padding: '1px 4px', borderRadius: '4px' }} title="HDMI Cable Unplugged!">
                                                                        <Monitor size={10} /> NO SIGNAL
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ textAlign: 'left', fontSize: '0.925rem' }}>
                                                            <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.875rem', color: isSelected ? 'var(--color-brand-500)' : 'var(--color-text-primary)', letterSpacing: '0.05em' }}>{formatShorthandTime(hb?.last_seen_at)}</span>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {hb?.current_version
                                                                ? <span className="badge badge-blue">{hb.current_version}</span>
                                                                : <span style={{ color: 'var(--color-text-3)' }}>—</span>
                                                            }
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                                {viewMode === 'active' ? (
                                                                    <>
                                                                        <button onClick={() => openEdit(d)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }} title="Edit device">
                                                                            <Edit2 size={13} />
                                                                        </button>
                                                                        {/* Promoted primary actions */}
                                                                        <button
                                                                            onClick={() => setSelectedHealthDevice(d)}
                                                                            className="btn-secondary"
                                                                            style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-brand-400)' }}
                                                                            title="Device Health & Diagnostics"
                                                                        >
                                                                            <Activity size={12} /> Diagnostics
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleScreenshot(d.id, d.device_code)}
                                                                            className="btn-secondary"
                                                                            style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                                                            title="Request Screenshot"
                                                                        >
                                                                            <Camera size={12} /> Preview
                                                                        </button>
                                                                        {/* Secondary icon-only actions */}
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
                                                                        style={{ padding: '0.375rem 0.625rem', color: 'var(--color-success)' }}
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
                </div> {/* end right col */}
            </div> {/* end two-column layout */}

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
                                {saving ? 'Saving...' : editing ? 'Update Device' : 'Register Device'}
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

                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="label">Pairing Code</label>
                        <input
                            type="text"
                            className="input-field"
                            value={claimPin}
                            onChange={e => setClaimPin(e.target.value.toUpperCase().slice(0, 6))}
                            placeholder="000000"
                            style={{ textAlign: 'center', fontSize: '2rem', letterSpacing: '0.5em', fontWeight: 800, height: '4rem' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button className="btn-secondary" onClick={() => setShowClaimModal(false)}>Cancel</button>
                        <button className="btn-primary" onClick={handleClaim} disabled={claiming || claimPin.length !== 6}>
                            {claiming && <Loader2 size={14} />}
                            {claiming ? 'Pairing...' : 'Pair Device'}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Screenshot Viewer Modal */}
            {screenshotModal && (
                <Modal title={`📷 Screenshot — ${screenshotModal.deviceCode}`} onClose={() => setScreenshotModal(null)}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', minHeight: 200 }}>
                        {screenshotModal.polling && !screenshotModal.imageUrl && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '2rem' }}>
                                <Loader2 size={40} style={{ animation: 'spin 1s linear infinite', color: '#6366f1' }} />
                                <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center' }}>
                                    Waiting for the device to capture and upload the screenshot...<br />
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

            {selectedHealthDevice && (
                <DeviceHealthModal
                    device={selectedHealthDevice}
                    heartbeat={heartbeats[selectedHealthDevice.device_code]}
                    onClose={() => setSelectedHealthDevice(null)}
                    onToggleDebug={() => handleToggleDebug(selectedHealthDevice.id, selectedHealthDevice.device_code)}
                    onScreenshot={() => handleScreenshot(selectedHealthDevice.id, selectedHealthDevice.device_code)}
                    onReload={() => handleCheckUpdate(selectedHealthDevice.id, selectedHealthDevice.device_code)}
                />
            )}
        </div>
    )
}

function DeviceHealthModal({ device, heartbeat, onClose, onToggleDebug, onScreenshot, onReload }: {
    device: Device,
    heartbeat?: DeviceHeartbeat,
    onClose: () => void,
    onToggleDebug: () => void,
    onScreenshot: () => void,
    onReload: () => void
}) {
    if (!device) return null;
    const meta = (heartbeat?.meta as any) || {};

    const stats = [
        { label: 'HDMI Status', value: meta.hdmi_status ? (meta.hdmi_status === 'connected' ? 'Connected' : 'Unplugged') : 'N/A', icon: Monitor, color: meta.hdmi_status === 'disconnected' ? '#ef4444' : undefined },
        { label: 'Battery', value: meta.battery_level !== undefined && meta.battery_level !== -1 ? `${meta.battery_level}%` : 'N/A', icon: Smartphone },
        { label: 'Uptime', value: meta.uptime_hours ? `${meta.uptime_hours.toFixed(1)} hrs` : 'N/A', icon: History },
        { label: 'Local IP', value: meta.local_ip || 'N/A', icon: Link },
        { label: 'Network', value: meta.network_type || 'N/A', icon: Wifi },
    ];

    const storageUsage = meta.storage_total_gb ? (1 - (meta.storage_free_gb / meta.storage_total_gb)) * 100 : 0;
    const ramUsage = meta.ram_total_mb ? (1 - (meta.ram_free_mb / meta.ram_total_mb)) * 100 : 0;

    return (
        <Modal title={`Health Monitoring: ${device.device_code}`} onClose={onClose} maxWidth="800px">
            <div className="fade-in">
                {/* Status Bar */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <div className="card" style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(34, 197, 94, 0.05)', borderColor: 'rgba(34, 197, 94, 0.2)' }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 600 }}>Storage Usage</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${storageUsage}%`, height: '100%', background: storageUsage > 90 ? '#ef4444' : '#10b981', borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, minWidth: 40 }}>{storageUsage.toFixed(0)}%</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-1)' }}>{meta.storage_free_gb?.toFixed(2) || 0}GB free of {meta.storage_total_gb?.toFixed(2) || 0}GB</span>
                    </div>

                    <div className="card" style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.05)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#3b82f6', fontWeight: 600 }}>RAM Usage</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${ramUsage}%`, height: '100%', background: ramUsage > 90 ? '#ef4444' : '#3b82f6', borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, minWidth: 40 }}>{ramUsage.toFixed(0)}%</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-1)' }}>{meta.ram_free_mb || 0}MB free of {meta.ram_total_mb || 0}MB</span>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    {stats.map(s => (
                        <div key={s.label} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ background: (s as any).color ? `${(s as any).color}15` : 'var(--color-surface-400)', padding: '0.5rem', borderRadius: 8, color: (s as any).color || 'var(--color-brand-200)', border: (s as any).color ? `1px solid ${(s as any).color}40` : 'none' }}>
                                <s.icon size={16} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>{s.label}</div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: (s as any).color || '#f1f5f9' }}>{s.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ margin: 0 }}>
                        <tbody style={{ border: 'none' }}>
                            {[
                                { label: 'Device Model', value: meta.device_model || 'Unknown' },
                                { label: 'Android Version', value: meta.android_version ? `${meta.android_version} (API ${meta.sdk_int})` : 'Unknown' },
                                { label: 'Screen Resolution', value: meta.screen || 'Unknown' },
                                { label: 'WebView Version', value: meta.webview_version || 'Unknown', wrap: true },
                                { label: 'App Version', value: heartbeat?.current_version || 'v1.0.0' },
                                { label: 'Public IP', value: heartbeat?.ip_address || 'Unknown' },
                                { label: 'Last Error', value: meta.last_error || 'None', color: meta.last_error ? '#ef4444' : undefined },
                                { label: 'Active URL', value: meta.webview_url || 'N/A', wrap: true },
                                { label: 'Currently Playing', value: meta.current_media?.title || 'Unknown', color: meta.current_media ? '#10b981' : '#64748b' },
                            ].map((row, i) => (
                                <tr key={row.label} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, width: '30%' }}>{row.label}</td>
                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: row.color, wordBreak: row.wrap ? 'break-all' : undefined }}>{row.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn-secondary" onClick={onToggleDebug} style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={14} /> Toggle Debug Overlay
                        </button>
                        <button className="btn-secondary" onClick={onScreenshot} style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Camera size={14} /> Force Screenshot
                        </button>
                        <button className="btn-secondary" onClick={onReload} style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <RefreshCw size={14} /> Check for Updates
                        </button>
                    </div>
                    <button className="btn-primary" onClick={onClose}>Close</button>
                </div>
            </div>
        </Modal>
    );
}

