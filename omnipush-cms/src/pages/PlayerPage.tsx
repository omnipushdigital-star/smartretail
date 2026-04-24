import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOff, Tv2, Lock, RefreshCw, Clock, Image as ImageIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, DEFAULT_TENANT_ID, callEdgeFn } from '../lib/supabase'
import { downloadAndCache, hydrateAssetsFromCache } from '../lib/cache'
import html2canvas from 'html2canvas'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestAsset {
    media_id: string
    type: 'image' | 'video' | 'web_url' | 'ppt' | 'presentation' | 'html'
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
    playback_speed?: number
    is_scheduled?: boolean
    start_date?: string | null
    end_date?: string | null
    start_time?: string | null
    end_time?: string | null
    days_of_week?: number[]
    settings?: { transition?: 'slide' | 'zoom' | 'fade' | 'none' | 'slide-up' | 'slide-down' }
}

interface Manifest {
    device: {
        id: string
        tenant_id: string
        store_id: string
        store_name: string | null
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
const TRANSPARENT_BASE64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_IMAGE_DURATION = 10
const DEFAULT_WEB_DURATION = 30
const DEFAULT_VIDEO_DURATION = 300
const TRANSITION_DURATION = 800
const READY_TIMING = 500
const IS_ANDROID_NATIVE = !!(window as any).AndroidHealth && (navigator.userAgent.includes('OmniPush') || navigator.userAgent.includes('Electron'))

function secretKey(code: string) { return `omnipush_device_secret:${code}` }
function manifestKey(code: string) { return `omnipush_manifest:${code}` }

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

const globalStyle = `
  :root {
    --color-brand: #00daf3;
    --color-error: #ef4444;
    --glass-bg: rgba(15, 23, 42, 0.7);
    --glass-border: rgba(255, 255, 255, 0.08);
  }
  .glass-card {
    background: var(--glass-bg);
    backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid var(--glass-border);
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }
  .spin { animation: spin 2s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

// ─── Shared Components ───────────────────────────────────────────────────────

const Logo = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
        <div style={{ padding: '0.6rem', background: 'linear-gradient(135deg, #00daf3 0%, #0070f3 100%)', borderRadius: 14, boxShadow: '0 0 20px rgba(0, 218, 243, 0.3)' }}>
            <Tv2 size={24} color="white" strokeWidth={2.5} />
        </div>
        <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>OMNIPUSH</div>
            <div style={{ fontSize: '0.6rem', color: '#00daf3', fontWeight: 800, letterSpacing: '0.3em', marginTop: '0.2rem' }}>CORTEX CORE</div>
        </div>
    </div>
)

const AmbientOrbs = () => (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'radial-gradient(circle, rgba(0, 218, 243, 0.1) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(124, 58, 237, 0.08) 0%, transparent 70%)', filter: 'blur(60px)' }} />
    </div>
)

const GlassCard = ({ children, style = {} }: { children: React.ReactNode, style?: React.CSSProperties }) => (
    <div className="glass-card" style={{ padding: '2.5rem', ...style }}>
        {children}
    </div>
)

// ─── Playback Engine ────────────────────────────────────────────────────────

interface EngineProps {
    region: any;
    items: ManifestItem[];
    assets: ManifestAsset[];
    isNative: boolean;
    showDebug: boolean;
    deviceCode: string;
    consecutiveErrorsRef: React.MutableRefObject<number>;
    lastMediaErrorRef: React.MutableRefObject<string | null>;
}

const PlaybackEngine = React.memo(({ 
    region, items, assets, isNative, showDebug, deviceCode,
    consecutiveErrorsRef, lastMediaErrorRef
}: EngineProps) => {
    const [layers, setLayers] = useState<{ idx: number; key: number }[]>([{ idx: 0, key: Date.now() }])
    const [activeLayer, setActiveLayer] = useState(0)
    const activeIdxRef = useRef(0)
    const itemsRef = useRef(items)

    useEffect(() => { itemsRef.current = items }, [items])

    const getUrl = useCallback((item: ManifestItem) => {
        if (item.type === 'web_url' || item.type === 'html') return item.web_url
        const asset = assets.find(a => a.media_id === item.media_id)
        return asset?.url || null
    }, [assets])

    const advance = useCallback(() => {
        if (!itemsRef.current.length) return
        const nextIdx = (activeIdxRef.current + 1) % itemsRef.current.length
        activeIdxRef.current = nextIdx
        const newLayer = { idx: nextIdx, key: Date.now() }
        
        setLayers(prev => {
            const next = [...prev, newLayer]
            if (next.length > 2) return next.slice(-2)
            return next
        })
        setActiveLayer(1)
        
        setTimeout(() => {
            setLayers(prev => [prev[prev.length - 1]])
            setActiveLayer(0)
        }, TRANSITION_DURATION + 100)
    }, [activeLayer])

    if (!items.length) {
        if (showDebug) {
            return (
                <div style={{ 
                    position: 'absolute', left: `${region.x}%`, top: `${region.y}%`, 
                    width: `${region.width}%`, height: `${region.height}%`, 
                    border: '2px solid red', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'red' 
                }}>
                    REGION EMPTY: {region.id}
                </div>
            )
        }
        return null
    }

    return (
        <div style={{
            position: 'absolute', left: `${region.x}%`, top: `${region.y}%`,
            width: `${region.width}%`, height: `${region.height}%`,
            background: 'transparent', overflow: 'hidden',
            // CORTEX-FIX: Red border to detect if region container is rendering correctly
            border: showDebug ? '2px solid #ef4444' : 'none',
        }}>
            {layers.map((layer, lIdx) => {
                const item = itemsRef.current[layer.idx]
                if (!item) return null
                const isActive = lIdx === activeLayer
                return (
                    <div key={layer.key} style={{
                        position: 'absolute', inset: 0,
                        width: '100%', height: '100%',
                        opacity: isActive ? 1 : 0,
                        visibility: (isActive || lIdx < activeLayer) ? 'visible' : 'hidden',
                        transition: `opacity ${TRANSITION_DURATION}ms linear`,
                        // FIX: Transparent background to allow hardware video punch-through
                        background: 'transparent',
                        zIndex: isActive ? 10 : 5
                    }}>
                        <RegionPlayer
                            item={item}
                            url={getUrl(item) || ''}
                            isActive={isActive}
                            onEnded={advance}
                            onError={(err) => {
                                console.error(`[Engine] Error:`, err)
                                consecutiveErrorsRef.current++
                                lastMediaErrorRef.current = err
                                advance()
                            }}
                            onReady={() => { consecutiveErrorsRef.current = 0 }}
                        />
                    </div>
                )
            })}
        </div>
    )
})

const RegionPlayer = ({ item, url, isActive, onEnded, onError, onReady }: { 
    item: ManifestItem; url: string; isActive: boolean; onEnded: () => void; onError: (msg: string) => void; onReady: () => void 
}) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const timerRef = useRef<any>(null)
    const [statusOverlay, setStatusOverlay] = useState<string | null>(item.type.toUpperCase())
    const [currentUrl, setCurrentUrl] = useState(url)

    useEffect(() => {
        setStatusOverlay(item.type.toUpperCase() + (item.media_id ? `:${item.media_id.slice(0,4)}` : ''))
        const t = setTimeout(() => setStatusOverlay(null), 3000)
        return () => clearTimeout(t)
    }, [item])

    useEffect(() => {
        if (!isActive) {
            if (videoRef.current) videoRef.current.pause()
            if (timerRef.current) clearTimeout(timerRef.current)
            return
        }

        if (item.type === 'video') {
            if (videoRef.current) {
                videoRef.current.load()
                videoRef.current.play().then(() => onReady()).catch(e => { 
                    if (e.name !== 'AbortError') {
                        // CORTEX-FALLBACK: If blob fails, try remote URL (item.web_url contains remote for local assets too)
                        if (currentUrl.startsWith('blob:') && item.type === 'video') {
                            const assetUrl = (item as any)._remote_url || url
                            console.warn("[Player] Blob fail, falling back to remote", assetUrl)
                            setCurrentUrl(assetUrl)
                        }
                        onError(`Playback: ${e.message}`) 
                    }
                })
            }
        } else {
            onReady()
            const duration = item.duration_seconds || (item.type === 'image' ? DEFAULT_IMAGE_DURATION : DEFAULT_WEB_DURATION)
            timerRef.current = setTimeout(onEnded, duration * 1000)
        }
    }, [isActive, item, onEnded, onError, onReady, currentUrl])

    if (item.type === 'image') {
        return (
            <div style={{ width: '100%', height: '100%', background: 'transparent' }}>
                <img 
                    src={currentUrl} 
                    style={{ 
                        width: '100%', height: '100%', 
                        objectFit: 'fill', 
                        background: 'transparent',
                    }} 
                    crossOrigin="anonymous" 
                    alt="" 
                />
                {statusOverlay && (
                    <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,218,243,0.8)', color: 'black', padding: '2px 6px', fontSize: '10px', fontWeight: 900, borderRadius: 4, zIndex: 1000 }}>
                        {statusOverlay}
                    </div>
                )}
            </div>
        )
    }

    if (item.type === 'video') {
        return (
            <div style={{ width: '100%', height: '100%', background: 'transparent' }}>
                <video 
                    ref={videoRef} 
                    src={currentUrl} 
                    muted 
                    playsInline 
                    autoPlay
                    // @ts-ignore
                    webkit-playsinline="true"
                    onEnded={onEnded} 
                    style={{ 
                        width: '100%', height: '100%', 
                        objectFit: 'fill', 
                        background: 'transparent',
                    }}
                    disablePictureInPicture
                    preload="auto"
                    controls={false}
                    onError={() => {
                        const err = videoRef.current?.error
                        const msg = err ? `CODE:${err.code} ${err.message}` : 'Unknown'
                        onError(`VideoError: ${msg}`)
                    }}
                />
                {statusOverlay && (
                    <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(0,218,243,0.8)', color: 'black', padding: '2px 6px', fontSize: '10px', fontWeight: 900, borderRadius: 4, zIndex: 1000 }}>
                        {statusOverlay}
                    </div>
                )}
            </div>
        )
    }


    if (item.type === 'web_url' || item.type === 'html') {
        return (
            <iframe 
                src={url} 
                style={{ width: '100%', height: '100%', border: 'none', background: 'white' }} 
                title="web" 
                sandbox="allow-scripts allow-same-origin"
            />
        )
    }

    return null
}


const LoadingState = ({ progress }: { progress: any }) => (
    <div style={{ position: 'fixed', inset: 0, background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AmbientOrbs />
        <div style={{ zIndex: 1, textAlign: 'center' }}>
            <Logo />
            <div style={{ marginTop: '3rem', width: 240, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>
                <div style={{
                    width: progress ? `${(progress.current / progress.total) * 100}%` : '30%',
                    height: '100%', background: 'linear-gradient(to right, #00daf3, #0070f3)', transition: 'width 0.4s'
                }} />
            </div>
        </div>
    </div>
)

const SecretPrompt = ({ device_code, onSubmit }: { device_code: string; onSubmit: (s: string) => void }) => {
    const [val, setVal] = useState('')
    return (
        <div style={{ position: 'fixed', inset: 0, background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AmbientOrbs />
            <div style={{ zIndex: 1, textAlign: 'center', padding: '2rem' }}>
                <Logo />
                <GlassCard style={{ marginTop: '2.5rem' }}>
                    <input type="password" value={val} onChange={e => setVal(e.target.value)} placeholder="Secret Key" style={{ width: '100%', padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: 'white', marginBottom: '1rem' }} />
                    <button onClick={() => onSubmit(val)} style={{ width: '100%', padding: '1rem', background: 'white', color: 'black', borderRadius: 12, fontWeight: 700 }}>Authorize</button>
                </GlassCard>
            </div>
        </div>
    )
}

const ErrorState = ({ dc, msg, onRetry }: { dc: string; msg: string; onRetry: () => void }) => (
    <div style={{ position: 'fixed', inset: 0, background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ zIndex: 1, textAlign: 'center' }}>
            <Logo />
            <GlassCard style={{ marginTop: '2.5rem', border: '1px solid #ef4444' }}>
                <WifiOff size={48} color="#ef4444" />
                <h2 style={{ color: 'white', marginTop: '1rem' }}>Network Interrupted</h2>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '1rem 0' }}>{msg}</div>
                <button onClick={onRetry} style={{ padding: '1rem 2rem', background: '#ef4444', color: 'white', borderRadius: 12, border: 'none' }}>Reconnect</button>
            </GlassCard>
        </div>
    </div>
)

// ─── Main PlayerPage ──────────────────────────────────────────────────────────

type Phase = 'loading' | 'pairing' | 'secret' | 'playing' | 'error'

export default function PlayerPage() {
    const { device_code } = useParams<{ device_code: string }>()
    const dc = device_code || ''

    const [phase, setPhase] = useState<Phase>('loading')
    const [manifest, setManifest] = useState<Manifest | null>(null)
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)
    const [offline, setOffline] = useState(false)
    const [showDebug, setShowDebug] = useState(false)
    const [pairingCode, setPairingCode] = useState<string | null>(null)
    
    const secretRef = useRef('')
    const versionRef = useRef<string | null>(null)
    const consecutiveErrorsRef = useRef(0)
    const lastMediaErrorRef = useRef<string | null>(null)

    const fetchManifest = useCallback(async (sec: string) => {
        try {
            const data = await callEdgeFn('device-manifest', { device_code: dc, device_secret: sec }, 10000)
            if (data.error) throw new Error(data.error)
            
            if (data.assets?.length) {
                setSyncProgress({ current: 0, total: data.assets.length })
                for (let i = 0; i < data.assets.length; i++) {
                    await downloadAndCache(data.assets[i])
                    setSyncProgress({ current: i + 1, total: data.assets.length })
                }
                setSyncProgress(null)
            }

            // CORTEX-FIX: Swap HTTPS URLs for local Blob URLs after sync completes
            const hydratedData = { ...data }
            if (data.assets?.length) {
                hydratedData.assets = await hydrateAssetsFromCache(data.assets)
            }

            setManifest(hydratedData)
            localStorage.setItem(manifestKey(dc), JSON.stringify(hydratedData))
            setOffline(false)
            return true
        } catch (err) {
            const cached = localStorage.getItem(manifestKey(dc))
            if (cached) { setManifest(JSON.parse(cached)); setOffline(true); return true }
            return false
        }
    }, [dc])

    // --- PAIRING & AUTH LOGIC ---
    useEffect(() => {
        if (IS_ANDROID_NATIVE) return // Native handles auth via its own means/injection

        const storedSecret = localStorage.getItem(`omnipush_secret_${dc}`)
        if (storedSecret) {
            secretRef.current = storedSecret
            fetchManifest(storedSecret).then(ok => setPhase(ok ? 'playing' : 'error'))
        } else {
            setPhase('pairing')
        }
    }, [dc, fetchManifest])

    const handleSecret = (s: string) => {
        localStorage.setItem(`omnipush_secret_${dc}`, s)
        secretRef.current = s
        setPhase('loading')
        fetchManifest(s).then(ok => setPhase(ok ? 'playing' : 'error'))
    }


    if (phase === 'loading') return <LoadingState progress={syncProgress} />
    if (phase === 'secret') return <SecretPrompt device_code={dc} onSubmit={handleSecret} />
    if (phase === 'error') return <ErrorState dc={dc} msg="Pipeline synchronization failed" onRetry={() => window.location.reload()} />
    if (phase === 'pairing') return (
        <div style={{ position: 'fixed', inset: 0, background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AmbientOrbs />
            <div style={{ zIndex: 1, textAlign: 'center' }}>
                <Logo />
                <GlassCard style={{ marginTop: '2.5rem' }}>
                    <div style={{ color: '#00daf3', fontSize: '0.7rem' }}>Pairing Code</div>
                    <div style={{ fontSize: '3rem', fontWeight: 900, color: 'white' }}>{dc.toUpperCase()}</div>
                    <div style={{ color: '#475569', fontSize: '0.6rem', marginTop: '0.5rem' }}>HW-ID: {dc}</div>
                    <button onClick={() => setPhase('secret')} style={{ background: 'none', color: '#475569', fontSize: '0.7rem', textDecoration: 'underline', marginTop: '1rem', border: 'none', cursor: 'pointer' }}>Manual Secret</button>
                </GlassCard>
            </div>
        </div>
    )

    const regions = manifest?.layout?.regions || [{ id: 'full', x: 0, y: 0, width: 100, height: 100 }]

    return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'transparent' }} onClick={e => { if (e.detail === 5) setShowDebug(!showDebug) }}>
            <style>{globalStyle}</style>
            {regions.map(reg => (
                <PlaybackEngine
                    key={reg.id}
                    region={reg}
                    items={manifest?.region_playlists?.[reg.id] || []}
                    assets={manifest!.assets}
                    isNative={IS_ANDROID_NATIVE}
                    showDebug={showDebug}
                    deviceCode={dc}
                    consecutiveErrorsRef={consecutiveErrorsRef}
                    lastMediaErrorRef={lastMediaErrorRef}
                />
            ))}
            {showDebug && (
                <div style={{ position: 'fixed', bottom: 100, right: 20, background: 'rgba(0,0,0,0.9)', padding: '1.5rem', borderRadius: 16, color: 'white', fontSize: '0.75rem', fontFamily: 'monospace', zIndex: 9999, border: '1px solid rgba(255,255,255,0.1)', minWidth: 260 }}>
                    <div style={{ color: '#00daf3', fontWeight: 900, marginBottom: '0.5rem' }}>CORTEX DIAGNOSTICS</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.2rem' }}>
                        <span>Device:</span> <span style={{ color: '#fff' }}>{dc}</span>
                        <span>Phase:</span> <span style={{ color: '#fff' }}>{phase}</span>
                        <span>Regions:</span> <span style={{ color: '#fff' }}>{regions.length}</span>
                        <span>Assets:</span> <span style={{ color: '#fff' }}>{manifest?.assets?.length || 0}</span>
                        <span>Errors:</span> <span style={{ color: consecutiveErrorsRef.current > 0 ? '#ef4444' : '#22c55e' }}>{consecutiveErrorsRef.current}</span>
                        {lastMediaErrorRef.current && (
                            <>
                                <span>Latest:</span> <span style={{ color: '#ef4444', wordBreak: 'break-all' }}>{lastMediaErrorRef.current}</span>
                            </>
                        )}
                    </div>
                    <button onClick={() => { localStorage.clear(); window.location.reload() }} style={{ marginTop: '1rem', width: '100%', background: '#ef4444', color: 'white', border: 'none', padding: '0.75rem', borderRadius: 8, fontWeight: 700 }}>Factory Reset</button>
                    <button onClick={() => setShowDebug(false)} style={{ marginTop: '0.5rem', width: '100%', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '0.75rem', borderRadius: 8 }}>Close</button>
                </div>
            )}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '2rem 3rem', display: 'flex', justifyContent: 'space-between', zIndex: 100, pointerEvents: 'none' }}>
                <LiveClock />
                <div style={{ color: '#475569', fontSize: '0.7rem' }}>CORE-ID: {dc}</div>
            </div>
        </div>
    )
}


