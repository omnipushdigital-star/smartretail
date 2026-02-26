import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOff, Tv2, Lock, RefreshCw, Clock } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestAsset {
    media_id: string
    type: 'image' | 'video' | 'web_url'
    url: string | null
    checksum_sha256: string | null
    bytes: number | null
}

interface ManifestItem {
    playlist_item_id: string
    media_id: string | null
    sort_order: number
    type: string
    web_url: string | null
    duration_seconds: number | null
}

interface Manifest {
    device: {
        id: string
        tenant_id: string
        store_id: string
        role_id: string
        device_code: string
        orientation: string
        resolution: string
    }
    resolved: {
        scope: string;
        role: string | null;
        bundle_id: string | null;
        version: string | null;
        debug?: any;
    }
    layout: { layout_id: string; template_id: string; regions: any[] }
    region_playlists: Record<string, ManifestItem[]>
    assets: ManifestAsset[]
    poll_seconds: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_IMAGE_DURATION = 8
const DEFAULT_WEB_DURATION = 15

function secretKey(code: string) { return `omnipush_device_secret:${code}` }
function manifestKey(code: string) { return `omnipush_manifest:${code}` }

// ─── API helpers ─────────────────────────────────────────────────────────────

async function callEdgeFn(fn: string, body: object): Promise<any> {
    if (!SUPABASE_URL || SUPABASE_URL === 'undefined') {
        throw new Error('VITE_SUPABASE_URL is not set. Check your .env file and restart the dev server.')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

    let res: Response
    try {
        res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        })
        clearTimeout(timeoutId)
    } catch (networkErr: any) {
        clearTimeout(timeoutId)
        if (networkErr.name === 'AbortError') {
            throw new Error('Connection timed out. Checking network...')
        }
        throw new Error(`Network error — check internet connection. (${networkErr.message})`)
    }

    // Read as text first so we never crash on empty / HTML responses
    const text = await res.text()
    let json: any = null
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        if (res.status === 404) {
            throw new Error(
                `Edge Function "${fn}" is not deployed. Go to Admin → Edge Functions and follow the deploy steps.`
            )
        }
        throw new Error(
            `Server returned an unexpected response (HTTP ${res.status}). ` +
            `Make sure the Edge Functions are deployed in your Supabase project.`
        )
    }

    if (!res.ok) {
        const err: any = new Error(json?.error || json?.message || `HTTP ${res.status}`)
        err.data = json // Attach payload for diagnostics
        throw err
    }
    return json
}

// ─── Live Clock ───────────────────────────────────────────────────────────────

function LiveClock() {
    const [time, setTime] = useState(new Date())
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(t)
    }, [])
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)' }}>
            <Clock size={12} />
            {time.toLocaleTimeString()} — {time.toLocaleDateString()}
        </div>
    )
}

// ─── Playback Engine ─────────────────────────────────────────────────────────

interface PlaybackProps {
    items: ManifestItem[]
    assets: ManifestAsset[]
}

function PlaybackEngine({ items, assets }: PlaybackProps) {
    const [idx, setIdx] = useState(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const nextVideoRef = useRef<HTMLVideoElement>(null) // preload
    const [fade, setFade] = useState(true)

    const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const advance = useCallback(() => {
        setFade(false)
        setTimeout(() => {
            setIdx(i => (i + 1) % sorted.length)
            setFade(true)
        }, 300)
    }, [sorted.length])

    useEffect(() => {
        if (sorted.length === 0) return
        if (timerRef.current) clearTimeout(timerRef.current)
        const item = sorted[idx]
        const asset = assets.find(a => a.media_id === item.media_id)
        if (!asset) { advance(); return }

        if (asset.type === 'video') {
            // Wait for video to end — handled by onEnded
            return
        }
        const dur = (item.duration_seconds ?? (asset.type === 'web_url' ? DEFAULT_WEB_DURATION : DEFAULT_IMAGE_DURATION)) * 1000
        timerRef.current = setTimeout(advance, dur)
        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [idx, sorted.length]) // eslint-disable-line

    if (sorted.length === 0) return null

    const item = sorted[idx]
    const asset = assets.find(a => a.media_id === item.media_id)

    // Preload next asset
    const nextItem = sorted[(idx + 1) % sorted.length]
    const nextAsset = assets.find(a => a.media_id === nextItem?.media_id)

    if (!asset || !asset.url) return null

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            background: '#000',
            overflow: 'hidden',
            margin: 0, padding: 0,
        }}>
            {/* Current item */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                opacity: fade ? 1 : 0,
                transition: 'opacity 0.3s ease',
            }}>
                {asset.type === 'image' && (
                    <img
                        key={item.playlist_item_id}
                        src={asset.url}
                        alt=""
                        style={{
                            position: 'absolute',
                            top: 0, left: 0,
                            width: '100%', height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                        }}
                    />
                )}
                {asset.type === 'video' && (
                    <video
                        key={item.playlist_item_id}
                        ref={videoRef}
                        src={asset.url}
                        style={{
                            position: 'absolute',
                            top: 0, left: 0,
                            width: '100%', height: '100%',
                            objectFit: 'contain',
                            background: '#000',
                            display: 'block',
                        }}
                        autoPlay
                        muted
                        playsInline
                        loop={sorted.length === 1} // Smooth loop for single-video ads
                        onEnded={advance}
                        onError={advance}
                    />
                )}
                {asset.type === 'web_url' && (
                    <iframe
                        key={item.playlist_item_id}
                        src={asset.url}
                        style={{
                            position: 'absolute',
                            top: 0, left: 0,
                            width: '100%', height: '100%',
                            border: 'none',
                            display: 'block',
                        }}
                        sandbox="allow-scripts allow-same-origin"
                        title="content"
                    />
                )}
            </div>

            {/* Preload next video */}
            {nextAsset?.type === 'video' && nextAsset.url && (
                <video
                    ref={nextVideoRef}
                    src={nextAsset.url}
                    style={{ display: 'none' }}
                    preload="auto"
                    muted
                />
            )}
            {nextAsset?.type === 'image' && nextAsset.url && (
                <img src={nextAsset.url} alt="" style={{ display: 'none' }} />
            )}
        </div>
    )
}

// ─── UI States ────────────────────────────────────────────────────────────────

function LoadingState({ device_code }: { device_code: string }) {
    return (
        <div style={bgStyle}>
            <AmbientOrbs />
            <div style={{ textAlign: 'center', zIndex: 1, position: 'relative' }}>
                <Logo />
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #1e293b', borderTopColor: '#5a64f6', animation: 'spin 0.8s linear infinite', margin: '2rem auto 1rem' }} />
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Connecting to network…</div>
                <div style={{ fontFamily: 'monospace', color: '#7a8aff', fontSize: '0.8rem', marginTop: '0.5rem' }}>{device_code}</div>
            </div>
            <BottomBar device_code={device_code} />
        </div>
    )
}

function SecretPrompt({ device_code, onSubmit }: { device_code: string; onSubmit: (s: string) => void }) {
    const [val, setVal] = useState('')
    return (
        <div style={bgStyle}>
            <AmbientOrbs />
            <div style={{ zIndex: 1, position: 'relative', textAlign: 'center', padding: '2rem', maxWidth: 420 }}>
                <Logo />
                <div style={{ marginTop: '2.5rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#7a8aff' }}>
                        <Lock size={18} />
                        <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '1rem' }}>Device Authentication</span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                        Enter the <strong style={{ color: '#94a3b8' }}>Device Secret</strong> for <br />
                        <code style={{ fontFamily: 'monospace', color: '#7a8aff', fontSize: '0.875rem' }}>{device_code}</code>
                    </div>
                    <input
                        type="password"
                        value={val}
                        onChange={e => setVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && val && onSubmit(val)}
                        placeholder="Paste device secret…"
                        style={{
                            width: '100%', padding: '0.75rem 1rem', borderRadius: 8,
                            background: '#0f172a', border: '1px solid #334155',
                            color: '#f1f5f9', fontSize: '0.875rem', fontFamily: 'monospace',
                            outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem',
                        }}
                        autoFocus
                    />
                    <button
                        onClick={() => val && onSubmit(val)}
                        disabled={!val}
                        style={{
                            width: '100%', padding: '0.75rem', borderRadius: 8,
                            background: val ? 'linear-gradient(135deg,#5a64f6,#4347ea)' : '#1e293b',
                            border: 'none', color: val ? 'white' : '#475569',
                            fontWeight: 600, fontSize: '0.9rem', cursor: val ? 'pointer' : 'not-allowed',
                            transition: 'all 0.15s',
                        }}
                    >
                        Connect
                    </button>
                    <p style={{ fontSize: '0.6875rem', color: '#334155', marginTop: '0.75rem' }}>
                        Secret is saved locally for this device and never sent to the CMS.
                    </p>
                </div>
            </div>
            <BottomBar device_code={device_code} />
        </div>
    )
}

function ErrorState({ device_code, msg, onRetry }: { device_code: string; msg: string; onRetry: () => void }) {
    return (
        <div style={bgStyle}>
            <AmbientOrbs />
            <div style={{ zIndex: 1, position: 'relative', textAlign: 'center', padding: '2rem' }}>
                <Logo />
                <div style={{ marginTop: '2.5rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '1.5rem 2rem', maxWidth: 380 }}>
                    <WifiOff size={28} color="#ef4444" style={{ margin: '0 auto 0.75rem' }} />
                    <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.5rem' }}>Connection Failed</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>{msg}</div>
                    <button
                        onClick={onRetry}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center',
                            width: '100%', padding: '0.75rem', borderRadius: 8,
                            background: 'rgba(90,100,246,0.15)', border: '1px solid rgba(90,100,246,0.3)',
                            color: '#7a8aff', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
                        }}
                    >
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            </div>
            <BottomBar device_code={device_code} />
        </div>
    )
}

// ─── Shared UI helpers ───────────────────────────────────────────────────────

const bgStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(135deg, #020617 0%, #0f172a 60%, #1a1a5c 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: 'white', overflow: 'hidden',
}

function AmbientOrbs() {
    return (
        <>
            <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(90,100,246,0.06)', filter: 'blur(100px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(67,71,234,0.05)', filter: 'blur(80px)', pointerEvents: 'none' }} />
        </>
    )
}

function Logo() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#5a64f6,#4347ea)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(90,100,246,0.5)' }}>
                <Tv2 size={24} color="white" />
            </div>
            <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#f1f5f9' }}>OmniPush</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Retail Display System</div>
            </div>
        </div>
    )
}

function BottomBar({ device_code, version, offline }: { device_code: string; version?: string | null; offline?: boolean }) {
    return (
        <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '0.625rem 1.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>OmniPush Digital Services</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#475569' }}>{device_code}</span>
                {version && <span style={{ fontSize: '0.7rem', color: '#5a64f6' }}>{version}</span>}
                {offline && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', color: '#ef4444' }}>
                        <WifiOff size={11} /> Offline — cached content
                    </span>
                )}
            </div>
            <LiveClock />
        </div>
    )
}

// ─── Main PlayerPage ──────────────────────────────────────────────────────────

type Phase = 'loading' | 'secret' | 'playing' | 'standby' | 'error'

export default function PlayerPage() {
    const { device_code } = useParams<{ device_code: string }>()
    const dc = device_code || ''

    const [phase, setPhase] = useState<Phase>('loading')
    const [secret, setSecret] = useState<string>('')
    const [manifest, setManifest] = useState<Manifest | null>(null)
    const [offline, setOffline] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [version, setVersion] = useState<string | null>(null)

    const secretRef = useRef(secret)
    useEffect(() => { secretRef.current = secret }, [secret])

    // ── Fetch manifest ──
    const fetchManifest = useCallback(async (sec: string): Promise<boolean> => {
        try {
            const data = await callEdgeFn('device-manifest', {
                device_code: dc,
                device_secret: sec,
                current_version: version,
            })
            setManifest(data)
            setVersion(data.resolved?.version || null)
            localStorage.setItem(manifestKey(dc), JSON.stringify(data))
            setOffline(false)
            return true
        } catch (err: any) {
            // "No active publication" is not a real error — show standby
            const msg: string = (err.message || '').toLowerCase()
            if (
                msg.includes('no active publication') ||
                msg.includes('no publication') ||
                msg.includes('not found for this device')
            ) {
                setPhase('standby')
                // Use diagnostic device info if returned by the Edge Function
                if (err.data?.device) {
                    setManifest({
                        resolved: {
                            role: err.data.device.role_name,
                            scope: 'Standby',
                            debug: err.data.debug
                        }
                    } as any)
                }
                return true // authenticated OK, just no content yet
            }
            // Try cache for real network errors
            const cached = localStorage.getItem(manifestKey(dc))
            if (cached) {
                try {
                    setManifest(JSON.parse(cached))
                    setOffline(true)
                    return true
                } catch { /* ignore */ }
            }
            setErrorMsg(err.message || 'Failed to reach server')
            return false
        }
    }, [dc, version])

    // ── Send heartbeat ──
    const sendHeartbeat = useCallback(async (sec: string) => {
        if (!dc || !sec) return
        try {
            const res = await callEdgeFn('device-heartbeat', {
                device_code: dc,
                device_secret: sec,
                current_version: version,
            })
            if (res.error) {
                console.error('[Player] Heartbeat Server Error:', res.error)
            } else {
                console.log('[Player] Heartbeat Recorded ✅')
            }
        } catch (err: any) {
            console.error('[Player] Heartbeat Network Error:', err.message)
        }
    }, [dc, version])

    // ── Init: check for stored secret ──
    useEffect(() => {
        if (!dc) return
        const stored = localStorage.getItem(secretKey(dc))
        if (stored) {
            setSecret(stored)
            // Attempt manifest immediately with stored secret
            setPhase('loading')
            fetchManifest(stored).then(ok => {
                // Only go to 'playing' if we aren't already moved to 'standby' by fetchManifest
                if (ok) {
                    setPhase(p => p === 'standby' ? 'standby' : 'playing')
                } else {
                    setPhase('error')
                }
            })
        } else {
            setPhase('secret')
        }
    }, [dc]) // eslint-disable-line

    // ── Polling: manifest every poll_seconds, heartbeat every 30s ──
    useEffect(() => {
        if ((phase !== 'playing' && phase !== 'standby') || !secret) return

        // In standby poll every 30s to detect when content is published
        const pollMs = phase === 'standby' ? 30_000 : (manifest?.poll_seconds ?? 30) * 1000

        const manifestTimer = setInterval(async () => {
            const ok = await fetchManifest(secretRef.current)
            if (ok && phase === 'standby') setPhase('playing')
        }, pollMs)

        const hbTimer = setInterval(() => {
            sendHeartbeat(secretRef.current)
        }, HEARTBEAT_INTERVAL_MS)

        // First heartbeat immediately
        if (phase === 'playing') sendHeartbeat(secretRef.current)

        return () => {
            clearInterval(manifestTimer)
            clearInterval(hbTimer)
        }
    }, [phase, secret, manifest?.poll_seconds]) // eslint-disable-line

    // ── Handle secret submission ──
    const handleSecret = async (s: string) => {
        setPhase('loading')
        setSecret(s)
        secretRef.current = s
        localStorage.setItem(secretKey(dc), s)
        const ok = await fetchManifest(s)
        if (ok) {
            setPhase(p => p === 'standby' ? 'standby' : 'playing')
        } else {
            setPhase('error')
        }
    }

    // ── Retry ──
    const handleRetry = () => {
        // Clear stored secret on auth errors
        if (errorMsg.toLowerCase().includes('invalid')) {
            localStorage.removeItem(secretKey(dc))
            setSecret('')
            setPhase('secret')
        } else {
            setPhase('loading')
            fetchManifest(secretRef.current).then(ok => {
                if (ok) setPhase('playing')
                else setPhase('error')
            })
        }
    }

    // ── Resolve playlist items for playback ──
    const getPlaylistItems = (): ManifestItem[] => {
        if (!manifest) return []
        const rp = manifest.region_playlists
        // Use first available region (prefer 'full')
        const regionKey = rp['full'] ? 'full' : Object.keys(rp)[0]
        return rp[regionKey] || []
    }

    // ── Render ──
    if (phase === 'loading') return <LoadingState device_code={dc} />
    if (phase === 'secret') return <SecretPrompt device_code={dc} onSubmit={handleSecret} />
    if (phase === 'error') return <ErrorState device_code={dc} msg={errorMsg} onRetry={handleRetry} />

    // ── Standby: authenticated but no content published yet ──
    if (phase === 'standby') {
        return (
            <div style={bgStyle}>
                <AmbientOrbs />
                <div style={{ zIndex: 1, position: 'relative', textAlign: 'center' }}>
                    <Logo />
                    <div style={{ marginTop: '2.5rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', lineHeight: 1.8 }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📺</div>
                        <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.25rem' }}>Display is Online</div>
                        <div style={{ color: '#94a3b8' }}>Connected as <strong style={{ color: '#7a8aff' }}>{manifest?.resolved?.role || 'Unassigned'}</strong> role</div>
                        <div style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>No active publication found for this role.</div>

                        {manifest?.resolved?.debug && (
                            <div style={{ marginTop: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 8, textAlign: 'left', display: 'inline-block', maxWidth: '90%' }}>
                                <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>🔌 Database Link Diagnostics</div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace', lineHeight: 1.5 }}>
                                    Device Tenant: {manifest.resolved.debug.device_tenant}<br />
                                    Device Role:   {manifest.resolved.debug.device_role_id}<br />
                                    <hr style={{ border: 'none', borderTop: '1px solid #1e293b', margin: '0.75rem 0' }} />
                                    Pubs in Tenant: {manifest.resolved.debug.total_tenant_pubs}<br />
                                    Role Pub Status: {manifest.resolved.debug.found_role_pub?.active ? '✅ Active' : '❌ Inactive'}<br />
                                    Pub Scope: {manifest.resolved.debug.found_role_pub?.scope || 'N/A'}<br />
                                    Pub Tenant: {manifest.resolved.debug.found_role_pub?.tenant || 'N/A'}
                                    {manifest.resolved.debug.resolution_error && (
                                        <div style={{ marginTop: '0.5rem', color: '#f87171', fontWeight: 600 }}>
                                            ⚠️ Resolution Error: {manifest.resolved.debug.resolution_error}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div style={{ marginTop: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#444' }}>
                            {dc} · Polling for updates every 30s
                        </div>
                    </div>
                    <div style={{ marginTop: '2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.25rem', borderRadius: 999, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e', fontSize: '0.8rem' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e', animation: 'pulse 2s infinite' }} />
                        Device Online · Awaiting Content
                    </div>
                    <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#1e293b' }}>
                        Publish a layout via Admin → Publish to start displaying content.
                    </div>
                </div>
                <BottomBar device_code={dc} version={version} offline={offline} />
            </div>
        )
    }

    // Playing
    const items = getPlaylistItems()

    if (!manifest || items.length === 0) {
        // No content — show standby screen
        return (
            <div style={bgStyle}>
                <AmbientOrbs />
                <div style={{ zIndex: 1, position: 'relative', textAlign: 'center' }}>
                    <Logo />
                    <div style={{ marginTop: '2.5rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                        <div>Display is registered and online.</div>
                        <div>No content has been published to this screen yet.</div>
                        <div style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
                            Role: {manifest?.device.role_id} · Scope: {manifest?.resolved.scope || '—'}
                        </div>
                    </div>
                    <div style={{ marginTop: '2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 999, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: '0.8rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e', animation: 'pulse 2s infinite' }} />
                        Device Online · Awaiting content
                    </div>
                </div>
                <BottomBar device_code={dc} version={version} offline={offline} />
            </div>
        )
    }

    return (
        <>
            <PlaybackEngine items={items} assets={manifest.assets} />
            {/* Offline indicator overlay */}
            {offline && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 999,
                    background: 'rgba(239,68,68,0.85)', padding: '0.5rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500, color: 'white',
                    backdropFilter: 'blur(4px)',
                }}>
                    <WifiOff size={14} /> Offline — playing cached content
                </div>
            )}
            {/* Bottom bar on top of content */}
            <BottomBar device_code={dc} version={version} offline={offline} />
        </>
    )
}
