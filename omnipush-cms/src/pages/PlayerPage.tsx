import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOff, Tv2, Lock, RefreshCw, Clock, Image as ImageIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, DEFAULT_TENANT_ID, callEdgeFn } from '../lib/supabase'

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
        pub_id: string | null;
        bundle_id: string | null;
        version: string | null;
        item_count?: number;
        debug?: any;
    }
    layout: { layout_id: string; template_id: string; regions: any[] }
    region_playlists: Record<string, ManifestItem[]>
    assets: ManifestAsset[]
    poll_seconds: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_IMAGE_DURATION = 10 // 10s default for images
const DEFAULT_WEB_DURATION = 30   // 30s default for web content

function secretKey(code: string) { return `omnipush_device_secret:${code}` }
function manifestKey(code: string) { return `omnipush_manifest:${code}` }

// Local callEdgeFn removed, imported from lib/supabase

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

// ─── Styles ──────────────────────────────────────────────────────────────────

// CSS to hide the default video "play/icon" flash in Android WebView
const globalStyle = `
  video::-webkit-media-controls { display:none !important; }
  video::-webkit-media-controls-enclosure { display:none !important; }
  video::-webkit-media-controls-start-playback-button { display: none !important; -webkit-appearance: none; }
  video { pointer-events: none !important; outline: none !important; }
  * { -webkit-tap-highlight-color: transparent !important; }
`;

interface PlaybackProps {
    items: ManifestItem[]
    assets: ManifestAsset[]
    region: { id: string; x: number; y: number; width: number; height: number }
}

// ─── Double-Buffer Video Player ──────────────────────────────────────────────
// Uses two persistent <video> elements and crossfades between them.
// This eliminates the browser's default "video icon" flash that appears
// when a <video> element is destroyed and recreated (e.g., on loop restart).

interface VideoBufferProps {
    url: string
    onEnded: () => void
    onError: () => void
    style?: React.CSSProperties
}

function DoubleBufferVideo({ items, assets, onAdvance }: {
    items: ManifestItem[]
    assets: ManifestAsset[]
    onAdvance: () => void
}) {
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
    const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)]
    const [slotUrls, setSlotUrls] = useState<[string, string]>(['', ''])
    const [slotOpacity, setSlotOpacity] = useState<[number, number]>([1, 0])
    const idxRef = useRef(0)

    const sorted = React.useMemo(
        () => [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        [items]
    )
    const memoizedAssets = React.useMemo(() => assets, [JSON.stringify(assets)])

    const getUrl = useCallback((item: ManifestItem) => {
        const asset = memoizedAssets.find(a => a.media_id === item.media_id)
        return asset?.url || item.web_url || ''
    }, [memoizedAssets])

    // Switch sources when state changes
    useEffect(() => {
        if (sorted.length === 0) return
        const currentUrl = getUrl(sorted[0])

        // Always ensure the first slot has the current URL if we only have one item
        if (sorted.length === 1) {
            setSlotUrls([currentUrl, ''])
            setSlotOpacity([1, 0])

            const v = videoRefs[0].current
            if (v && v.src !== currentUrl) {
                v.src = currentUrl
                v.load()
            }
            if (v && v.paused) {
                v.play().catch(e => console.warn("[Video] Single-loop play failed:", e))
            }
            return
        }

        // Multiple items logic...
        if (slotUrls[activeSlot] !== currentUrl) {
            setSlotUrls(prev => {
                const updated = [...prev] as [string, string]
                updated[activeSlot] = currentUrl
                return updated
            })

            const v = videoRefs[activeSlot].current
            if (v) {
                v.load()
                v.play().catch(() => { })
            }
        }
    }, [sorted, getUrl, activeSlot])

    const advanceBuffer = useCallback(() => {
        if (sorted.length === 0) return

        // If only 1 item, just loop it natively
        if (sorted.length === 1) {
            const v = videoRefs[activeSlot].current
            if (v) {
                v.currentTime = 0
                v.play().catch(() => { })
            }
            onAdvance()
            return
        }

        const nextIdx = (idxRef.current + 1) % sorted.length
        idxRef.current = nextIdx

        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0
        const currentSlot: 0 | 1 = activeSlot
        const nextUrl = getUrl(sorted[nextIdx])

        const nextVideo = videoRefs[nextSlot].current
        const currentVideo = videoRefs[currentSlot].current

        if (nextVideo) {
            nextVideo.src = nextUrl
            nextVideo.load()
            nextVideo.currentTime = 0.1

            const onReady = () => {
                setSlotOpacity(activeSlot === 0 ? [0, 1] : [1, 0])
                setActiveSlot(nextSlot)
                setTimeout(() => {
                    if (currentVideo && activeSlot !== nextSlot) {
                        currentVideo.pause()
                    }
                }, 500)
                nextVideo.removeEventListener('playing', onReady)
            }

            nextVideo.addEventListener('playing', onReady)
            nextVideo.play().catch(() => { })
        }

        setSlotUrls(prev => {
            const updated: [string, string] = [...prev] as [string, string]
            updated[nextSlot] = nextUrl
            return updated
        })

        onAdvance()
    }, [activeSlot, sorted, getUrl, onAdvance])

    // Global force-play listener and heartbeat for resilient autoplay
    useEffect(() => {
        const force = () => {
            videoRefs.forEach(ref => {
                if (ref.current && ref.current.paused) {
                    ref.current.play().catch(() => { })
                }
            })
        }

        // Android TV sometimes needs a repeated "poke" to start the first video
        // Faster interval (800ms) for the first 10 seconds to ensure a smooth start
        const interval = setInterval(() => {
            videoRefs.forEach((ref, i) => {
                const v = ref.current
                if (v && v.paused && v.readyState >= 2) {
                    console.log(`[Video] ⚡ Auto-play heartbeat poke for slot ${i}...`)
                    v.play().catch(() => { })
                }
            })
        }, 800)

        window.addEventListener('omnipush_force_play', force)
        return () => {
            clearInterval(interval)
            window.removeEventListener('omnipush_force_play', force)
        }
    }, [])

    if (sorted.length === 0) return null

    const videoStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        objectFit: 'cover',
        background: '#000',
        display: 'block',
        transition: 'opacity 0.6s ease-in-out',
    }

    return (
        <>
            <style>{globalStyle}</style>
            {[0, 1].map(i => (
                <video
                    key={i}
                    ref={videoRefs[i]}
                    src={slotUrls[i]}
                    style={{ ...videoStyle, opacity: slotOpacity[i], zIndex: slotOpacity[i] > 0 ? 10 : 1 }}
                    muted
                    autoPlay
                    playsInline
                    loop={sorted.length === 1}
                    crossOrigin="anonymous"
                    webkit-playsinline="true"
                    preload="auto"
                    onEnded={advanceBuffer}
                    onError={(e) => {
                        console.error("[Video] Error in slot", i, e);
                        setTimeout(advanceBuffer, 2000);
                    }}
                />
            ))}
        </>
    )
}

// ─── Playback Engine ──────────────────────────────────────────────────────────

function PlaybackEngine({ items, assets, region }: PlaybackProps) {
    const [idx, setIdx] = useState(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [fade, setFade] = useState(true)

    const sorted = [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const advance = useCallback(() => {
        // Critical: If only 1 item, NEVER advance/refresh (prevents reload flashes)
        if (sorted.length <= 1) return

        const nextIdx = (idx + 1) % sorted.length
        // If we are about to switch to the SAME item, skip the fade cycle
        if (nextIdx === idx) return

        setFade(false)
        setTimeout(() => {
            setIdx(nextIdx)
            setFade(true)
        }, 300)
    }, [idx, sorted.length])

    const memoizedAssets = React.useMemo(() => assets, [JSON.stringify(assets)])

    useEffect(() => {
        if (sorted.length === 0) return
        if (timerRef.current) clearTimeout(timerRef.current)

        const item = sorted[idx]
        const asset = memoizedAssets.find(a => a.media_id === item.media_id)
        const url = asset?.url || item.web_url
        const type = asset?.type || item.type || (item.media_id ? 'video' : 'image')

        if (!url) {
            if (sorted.length > 1) advance()
            return
        }

        // Videos are handled by DoubleBufferVideo's own onEnded
        if (type === 'video') return

        // If only 1 item, we don't set a timer to advance
        if (sorted.length <= 1) return

        const dur = (item.duration_seconds ?? (type === 'web_url' ? DEFAULT_WEB_DURATION : DEFAULT_IMAGE_DURATION)) * 1000
        timerRef.current = setTimeout(advance, dur)
        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [idx, sorted.length, advance, memoizedAssets, region.id])

    if (sorted.length === 0) return null

    const item = sorted[idx]
    const asset = memoizedAssets.find(a => a.media_id === item.media_id)
    const url = asset?.url || item.web_url
    const type = asset?.type || item.type || (item.media_id ? 'video' : 'image')

    // Use double buffer for videos to ensure smooth looping and better recovery
    const allVideos = useMemo(() => {
        return items.length >= 1 && items.every(i => i.type === 'video')
    }, [items])

    // Preload next image
    const nextItem = sorted[(idx + 1) % sorted.length]
    const nextAsset = memoizedAssets.find(a => a.media_id === nextItem?.media_id)
    const nextUrl = nextAsset?.url || nextItem?.web_url
    const nextType = nextAsset?.type || nextItem?.type

    if (!url) return (
        <div style={{
            position: 'absolute',
            top: `${region.y}%`, left: `${region.x}%`,
            width: `${region.width}%`, height: `${region.height}%`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0f', border: '1px solid #1e293b'
        }}>
            <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Region: {region.id}</div>
            <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem' }}>No Content Assigned</div>
        </div>
    )

    return (
        <div style={{
            position: 'absolute',
            top: `${region.y}%`,
            left: `${region.x}%`,
            width: `${region.width}%`,
            height: `${region.height}%`,
            background: '#000',
            overflow: 'hidden',
            margin: 0, padding: 0,
        }}>
            {/* ✅ All-video playlist: use double buffer for flash-free looping */}
            {allVideos ? (
                <DoubleBufferVideo
                    items={sorted}
                    assets={memoizedAssets}
                    onAdvance={() => { }} // buffer manages its own index
                />
            ) : (
                /* Mixed content: use fade-based switching */
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    opacity: fade ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                }}>
                    {type === 'image' && url && (
                        <img
                            key={item.playlist_item_id}
                            src={url}
                            alt=""
                            style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover', display: 'block',
                            }}
                        />
                    )}
                    {type === 'video' && url && (
                        <video
                            key={item.playlist_item_id}
                            src={url}
                            style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                objectFit: 'cover', background: '#000', display: 'block',
                            }}
                            autoPlay muted playsInline
                            loop={sorted.length === 1}
                            onEnded={advance}
                            onError={() => setTimeout(advance, 5000)}
                        />
                    )}
                    {type === 'web_url' && url && (
                        <iframe
                            key={item.playlist_item_id}
                            src={url}
                            style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                border: 'none', display: 'block',
                            }}
                            sandbox="allow-scripts allow-same-origin"
                            title="content"
                        />
                    )}
                </div>
            )}

            {/* Preload next image in background */}
            {!allVideos && nextType === 'image' && nextUrl && (
                <img src={nextUrl} alt="" style={{ display: 'none' }} />
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
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #1e293b', borderTopColor: 'var(--color-brand-500)', animation: 'spin 0.8s linear infinite', margin: '2rem auto 1rem' }} />
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Connecting to network…</div>
                <div style={{ fontFamily: 'monospace', color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>{device_code}</div>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#f87171' }}>
                        <Lock size={18} />
                        <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '1rem' }}>Device Authentication</span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                        Enter the <strong style={{ color: '#94a3b8' }}>Device Secret</strong> for <br />
                        <code style={{ fontFamily: 'monospace', color: '#f87171', fontSize: '0.875rem' }}>{device_code}</code>
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
                            background: val ? 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))' : '#1e293b',
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
                            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem',
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
    background: 'linear-gradient(135deg, #020617 0%, #0f172a 60%, #450a0a 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: 'white', overflow: 'hidden',
}

function AmbientOrbs() {
    return (
        <>
            <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.06)', filter: 'blur(100px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(220, 38, 38, 0.05)', filter: 'blur(80px)', pointerEvents: 'none' }} />
        </>
    )
}

function Logo() {
    const [logoUrl, setLogoUrl] = useState<string | null>(null)

    useEffect(() => {
        supabase
            .from('tenants')
            .select('settings')
            .eq('id', DEFAULT_TENANT_ID)
            .single()
            .then(({ data }) => {
                if (data?.settings?.logo_url) {
                    setLogoUrl(data.settings.logo_url)
                }
            })
    }, [])

    if (logoUrl) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                <div style={{
                    height: 52,
                    padding: '8px',
                    background: 'white',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                }}>
                    <img src={logoUrl} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(239, 68, 68, 0.5)' }}>
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
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            zIndex: 10000,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>OmniPush Digital Services</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#475569' }}>{device_code}</span>
                {version && <span style={{ fontSize: '0.7rem', color: '#ef4444' }}>{version}</span>}
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

type Phase = 'loading' | 'pairing' | 'secret' | 'playing' | 'standby' | 'error'

export default function PlayerPage() {
    const { device_code } = useParams<{ device_code: string }>()
    const dc = device_code || ''

    const [phase, setPhase] = useState<Phase>('loading')
    const [secret, setSecret] = useState<string>('')
    const [manifest, setManifest] = useState<Manifest | null>(null)
    const [offline, setOffline] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [version, setVersion] = useState<string | null>(null)
    const versionRef = useRef(version)
    useEffect(() => { versionRef.current = version }, [version])

    const [pairingPin, setPairingPin] = useState('')
    const [showDiagnostics, setShowDiagnostics] = useState(false)
    const secretRef = useRef(secret)
    useEffect(() => { secretRef.current = secret }, [secret])

    // Keyboard shortcut for diagnostics
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.shiftKey && e.key === 'D') setShowDiagnostics(prev => !prev)
        }
        window.addEventListener('keydown', handleKeys)
        return () => window.removeEventListener('keydown', handleKeys)
    }, [])

    // ── Command Polling (Reboot, etc) ──
    const checkCommands = useCallback(async () => {
        if (!manifest?.device?.id) return
        try {
            const { data: commands, error } = await supabase
                .from('device_commands')
                .select('*')
                .eq('device_id', manifest.device.id)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true })

            if (error) throw error
            if (!commands || commands.length === 0) return

            for (const cmd of commands) {
                console.log(`[Player] Executing remote command: ${cmd.command}`)

                // Mark as executing/finished
                await supabase.from('device_commands').update({
                    status: 'EXECUTED',
                    executed_at: new Date().toISOString()
                }).eq('id', cmd.id)

                if (cmd.command === 'REBOOT') {
                    console.warn('[Player] Remote Reboot triggered via CMS. Reloading page...')
                    window.location.reload()
                }
            }
        } catch (err: any) {
            console.error('[Commands] Polling error:', err.message)
        }
    }, [manifest?.device?.id])

    useEffect(() => {
        if (!manifest?.device?.id) return
        const timer = setInterval(checkCommands, 10000) // Poll every 10s
        return () => clearInterval(timer)
    }, [manifest?.device?.id, checkCommands])

    const initPairing = useCallback(async () => {
        try {
            const data = await callEdgeFn('device-pairing', { action: 'INIT', device_code: dc })
            if (data.error) throw new Error(data.error)
            setPairingPin(data.pairing_pin)
        } catch (err: any) {
            console.error('[Pairing] Init error:', err.message)
            setErrorMsg(`Pairing Service Error: ${err.message}`)
            setPhase('secret') // Fallback to manual entry
        }
    }, [dc])

    // ── Fetch manifest ──
    const fetchManifest = useCallback(async (sec: string): Promise<boolean> => {
        try {
            const data = await callEdgeFn('device-manifest', {
                device_code: dc,
                device_secret: sec,
                current_version: version,
                origin: window.location.origin
            })

            console.log(`[Player] Manifest received. Assets: ${data.assets?.length || 0}`)
            setManifest(data)
            setVersion(data.resolved?.version || null)
            localStorage.setItem(manifestKey(dc), JSON.stringify(data))
            setOffline(false)
            return true
        } catch (err: any) {
            const msg: string = (err.message || '').toLowerCase()

            // Handle de-authorization (Device deleted or inactive)
            if (msg.includes('invalid credentials') || msg.includes('inactive device')) {
                console.warn('[Player] Device de-authorized by server. Clearing local cache.')
                localStorage.removeItem(secretKey(dc))
                localStorage.removeItem(manifestKey(dc))
                setSecret('')
                setPhase('pairing')
                initPairing()
                return false
            }

            // "No active publication" is not a real error — show standby
            if (
                msg.includes('no active publication') ||
                msg.includes('no publication') ||
                msg.includes('not found for this device')
            ) {
                setPhase('standby')
                if (err.data?.device) {
                    setManifest({
                        resolved: {
                            role: err.data.device.role_name,
                            scope: 'Standby',
                            debug: err.data.debug
                        }
                    } as any)
                }
                return true
            }

            // Try cache ONLY for network/server errors (500, timeout, fetch failure)
            const cached = localStorage.getItem(manifestKey(dc))
            if (cached) {
                try {
                    console.log('[Player] Server unreachable, using cached manifest.')
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

        // Gather basic hardware telemetry
        const ua = navigator.userAgent
        const meta: any = {
            // Capture full OS/device info from user agent
            device_model: (
                ua.match(/\(([^)]+)\)/)?.[1] ||
                ua.split(' ').slice(0, 3).join(' ') ||
                'Unknown Device'
            ).slice(0, 100), // truncate to 100 chars
            local_ip: null,
            platform: navigator.platform || 'unknown',
            screen: `${screen.width}x${screen.height}`,
        }

        try {
            // 1. RAM (navigator.deviceMemory - Chrome/Android only)
            if ((navigator as any).deviceMemory) {
                meta.ram_total_mb = (navigator as any).deviceMemory * 1024
                // Browsers don't expose free RAM for security reasons
            }

            // 2. Storage (Browser Storage Quota API)
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate()
                if (est.quota && est.quota > 0) {
                    // Use 2 decimal places to avoid rounding to 0 on small quotas
                    meta.storage_total_gb = parseFloat((est.quota / (1024 * 1024 * 1024)).toFixed(2))
                    if (est.usage !== undefined) {
                        meta.storage_free_gb = parseFloat(Math.max(0, (est.quota - est.usage) / (1024 * 1024 * 1024)).toFixed(2))
                    }
                } else if (est.quota === 0) {
                    // Some Android WebViews report 0 quota — note it but keep going
                    meta.storage_quota_unavailable = true
                }
            }

            // 3. Android Native Bridge (for custom APK/WebView wrappers)
            // The Android app can expose a JavascriptInterface named 'AndroidHealth'
            const win = window as any
            if (win.AndroidHealth) {
                if (win.AndroidHealth.getRamTotal) meta.ram_total_mb = Number(win.AndroidHealth.getRamTotal())
                if (win.AndroidHealth.getRamFree) meta.ram_free_mb = Number(win.AndroidHealth.getRamFree())
                if (win.AndroidHealth.getStorageTotal) meta.storage_total_gb = parseFloat(Number(win.AndroidHealth.getStorageTotal()).toFixed(2))
                if (win.AndroidHealth.getStorageFree) meta.storage_free_gb = parseFloat(Number(win.AndroidHealth.getStorageFree()).toFixed(2))
                if (win.AndroidHealth.getModel) meta.device_model = String(win.AndroidHealth.getModel())
                if (win.AndroidHealth.getLocalIp) meta.local_ip = String(win.AndroidHealth.getLocalIp())
            }
        } catch (e) {
            console.warn('[Telemetry] Error gathering stats:', e)
        }

        try {
            const payload = {
                device_code: dc,
                device_secret: sec,
                current_version: versionRef.current,
                status: phase,
                ...meta
            }
            console.log('[Player] Sending heartbeat payload:', JSON.stringify(payload))
            const res = await callEdgeFn('device-heartbeat', payload)
            if (res.error) {
                console.error('[Player] Heartbeat Server Error:', res.error)
            } else {
                console.log(`[Player] Heartbeat Recorded ✅ (${phase}) | Meta stored:`, res.meta_keys)
            }
        } catch (err: any) {
            console.error('[Player] Heartbeat Network Error:', err.message)
            const msg = (err.message || '').toLowerCase()
            if (msg.includes('invalid credentials') || msg.includes('inactive device')) {
                localStorage.removeItem(secretKey(dc))
                localStorage.removeItem(manifestKey(dc))
                window.location.reload()
            }
        }
    }, [dc, version, phase])

    // ── Init: check for stored secret or URL param ──
    useEffect(() => {
        if (!dc) return

        // 1. Check for ?reset=true to clear stale data
        const params = new URLSearchParams(window.location.search)
        if (params.get('reset') === 'true') {
            localStorage.removeItem(secretKey(dc))
            setSecret('')
            setPhase('secret')
            return
        }

        // 2. Check for ?secret= in URL for auto-login
        const urlSecret = params.get('secret')
        if (urlSecret) {
            setSecret(urlSecret)
            secretRef.current = urlSecret
            localStorage.setItem(secretKey(dc), urlSecret)
            setPhase('loading')
            fetchManifest(urlSecret).then(ok => {
                if (ok) setPhase(p => p === 'standby' ? 'standby' : 'playing')
                else setPhase('error')
            })
            return
        }

        // 3. Check for stored secret in localStorage
        const stored = localStorage.getItem(secretKey(dc))
        if (stored) {
            setSecret(stored)
            secretRef.current = stored
            setPhase('loading')
            fetchManifest(stored).then(ok => {
                if (ok) setPhase(p => p === 'standby' ? 'standby' : 'playing')
                else setPhase('error')
            })
        } else {
            setPhase('pairing')
            initPairing()
        }
    }, [dc, initPairing]) // eslint-disable-line

    useEffect(() => {
        if (phase !== 'pairing' || !dc) return
        const timer = setInterval(async () => {
            try {
                const data = await callEdgeFn('device-pairing', { action: 'CLAIM_POLL', device_code: dc })
                if (data.device_secret) {
                    handleSecret(data.device_secret)
                }
            } catch { /* wait for next poll */ }
        }, 5000)
        return () => clearInterval(timer)
    }, [phase, dc]) // eslint-disable-line

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
        window.location.reload()
    }

    // ── Resolve playlist items for playback ──
    const getPlaylistItems = (): ManifestItem[] => {
        if (!manifest || !manifest.region_playlists) return []
        const rp = manifest.region_playlists
        // Use first available region (prefer 'full')
        const regions = Object.keys(rp)
        if (regions.length === 0) return []

        const regionKey = rp['full'] ? 'full' : regions[0]
        return rp[regionKey] || []
    }

    // ── Render ──
    if (phase === 'loading') return <LoadingState device_code={dc} />
    if (phase === 'pairing') return (
        <div style={bgStyle}>
            <AmbientOrbs />
            <div style={{ zIndex: 1, position: 'relative', textAlign: 'center', padding: '2rem', maxWidth: 450 }}>
                <Logo />
                <div style={{ marginTop: '2.5rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '2.5rem 2rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.8rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: '0.5rem' }}>Device Pairing Mode</div>
                        <div style={{ color: '#f1f5f9', fontSize: '1.125rem', fontWeight: 600 }}>Get started in 30 seconds</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
                        {(pairingPin || '------').split('').map((char, i) => (
                            <div key={i} style={{
                                width: 48, height: 64, background: '#0f172a', border: '1px solid #1e293b',
                                borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '2rem', fontWeight: 800, color: '#f1f5f9', fontFamily: 'monospace',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)'
                            }}>
                                {char}
                            </div>
                        ))}
                    </div>

                    <div style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                        Go to <strong style={{ color: '#f1f5f9' }}>Admin → Devices</strong> on your CMS <br />
                        and enter this 6-digit code to link this screen.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ background: 'white', padding: '0.75rem', borderRadius: 10 }}>
                            <QRCodeSVG value={`${window.location.origin}/player/${dc}?pairing=${pairingPin}`} size={120} level="M" />
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#475569' }}>
                            Or scan to pair with your mobile phone
                        </div>
                    </div>

                    <button
                        onClick={() => setPhase('secret')}
                        style={{ marginTop: '2rem', background: 'none', border: 'none', color: '#475569', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        I have a secret key - manual entry
                    </button>
                </div>
            </div>
            <BottomBar device_code={dc} />
        </div>
    )
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
                        <div style={{ color: '#94a3b8' }}>Connected as <strong style={{ color: '#f87171' }}>{manifest?.resolved?.role || 'Unassigned'}</strong> role</div>
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
                {showDiagnostics && <BottomBar device_code={dc} version={version} offline={offline} />}
            </div>
        )
    }

    // ── Diagnostic Dashboard for Blank Screens ──
    const DiagnosticOverlay = ({ visible }: { visible: boolean }) => {
        if (!visible) return null
        return (
            <div style={{
                position: 'fixed', bottom: '4rem', left: '1rem', zIndex: 1000,
                background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)',
                padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '0.75rem', maxWidth: '300px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
            }}>
                <div style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🔍 Diagnostics</span>
                    <span style={{ color: offline ? '#ef4444' : '#22c55e' }}>● {offline ? 'Offline' : 'Online'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div><strong>Device:</strong> {manifest?.device?.id?.slice(0, 8)}... ({dc})</div>
                    <div><strong>Scope:</strong> {manifest?.resolved?.scope || 'Global'}</div>
                    <div><strong>Pub ID:</strong> {manifest?.resolved?.pub_id?.slice(0, 8) || 'None'}</div>
                    <div><strong>Layout:</strong> {manifest?.layout?.layout_id?.slice(0, 8)}...</div>
                    <div><strong>Regions:</strong> {Object.keys(manifest?.region_playlists || {}).join(', ')}</div>
                    <div><strong>Total Assets:</strong> {manifest?.assets?.length || 0}</div>
                    <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={{ flex: 1, padding: '4px', background: '#334155', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>
                            Reload
                        </button>
                        <button
                            onClick={() => {
                                // Event based trigger for PlaybackEngines
                                window.dispatchEvent(new CustomEvent('omnipush_force_advance'))
                                window.dispatchEvent(new CustomEvent('omnipush_force_play'))
                            }}
                            style={{ flex: 1, padding: '4px', background: 'var(--color-brand-500)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '10px' }}>
                            Next / Play
                        </button>
                    </div>
                    <div style={{ marginTop: '0.5rem', opacity: 0.6 }}>Press SHIFT+D to toggle</div>
                </div>
            </div>
        )
    }

    // Multi-Region Rendering
    if (!manifest) return <LoadingState device_code={dc} />

    const regions = manifest.layout?.regions || [{ id: 'full', x: 0, y: 0, width: 100, height: 100 }]
    const hasAnyContent = Object.values(manifest.region_playlists || {}).some(items => items.length > 0)

    // If NO content is published anywhere, show the "Awaiting Content" screen instead of black
    if (!hasAnyContent) {
        return (
            <div style={bgStyle}>
                <AmbientOrbs />
                <div style={{ zIndex: 1, position: 'relative', textAlign: 'center', padding: '2rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', padding: '2.5rem', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
                        <div style={{ width: 80, height: 80, borderRadius: '20px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
                            <Tv2 size={40} color="#fff" />
                        </div>
                        <h1 style={{ color: '#fff', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 1rem' }}>No Active Content</h1>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem', maxWidth: 300, margin: '0 auto 2rem', lineHeight: 1.5 }}>
                            This screen is connected, but no content has been assigned to this layout's regions.
                        </p>
                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'left', fontFamily: 'monospace' }}>
                            Layout ID:   {manifest.layout?.layout_id?.slice(0, 8)}...<br />
                            Pub Scope:   {manifest.resolved?.scope || 'N/A'}<br />
                            Bundle ID:   {manifest.resolved?.bundle_id?.slice(0, 8) || 'N/A'}<br />
                            Device Role: {manifest.device?.role_id?.slice(0, 8) || 'None'}
                        </div>
                    </div>
                </div>
                <DiagnosticOverlay visible={showDiagnostics} />
                {showDiagnostics && <BottomBar device_code={dc} version={version} offline={offline} />}
            </div>
        )
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
            {regions.map((reg) => {
                const regionItems = manifest.region_playlists?.[reg.id] || []

                // Fallback for empty region to prevent black hole
                if (regionItems.length === 0) {
                    return (
                        <div key={reg.id} style={{
                            position: 'absolute',
                            top: `${reg.y}%`, left: `${reg.x}%`,
                            width: `${reg.width}%`, height: `${reg.height}%`,
                            background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'column'
                        }}>
                            <div style={{ opacity: 0.2 }}>
                                <ImageIcon size={32} color="#fff" />
                            </div>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.1)', marginTop: '0.5rem' }}>Region: {reg.id}</span>
                        </div>
                    )
                }

                return (
                    <PlaybackEngine
                        key={reg.id}
                        region={reg}
                        items={regionItems}
                        assets={manifest.assets}
                    />
                )
            })}

            <DiagnosticOverlay visible={showDiagnostics} />

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

            {/* Bottom bar on top of content - hidden by default unless diagnostics active */}
            {showDiagnostics && <BottomBar device_code={dc} version={version} offline={offline} />}
        </div>
    )
}
