import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOff, Tv2, Lock, RefreshCw, Clock, Image as ImageIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, DEFAULT_TENANT_ID, callEdgeFn } from '../lib/supabase'
import { downloadAndCache, hydrateAssetsFromCache } from '../lib/cache'

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
    playback_speed?: number
    // Scheduling fields
    is_scheduled?: boolean
    start_date?: string | null
    end_date?: string | null
    start_time?: string | null
    end_time?: string | null
    days_of_week?: number[]
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
  /* 1. Force root level elements to cover exact viewport - Essential for signage */
  html, body, #root {
    margin: 0 !important;
    padding: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    min-height: 100vh !important;
    max-height: 100vh !important;
    overflow: hidden !important;
    position: fixed !important;
    top: 0; left: 0; right: 0; bottom: 0;
    -webkit-text-size-adjust: 100%;
    -moz-text-size-adjust: 100%;
    text-size-adjust: 100%;
    background: #000 !important;
  }

  /* 2. Force all media to fill their region boxes without scaling artifacts */
  video, img, iframe {
    object-fit: fill !important;
    border: none !important;
    outline: none !important;
    margin: 0 !important;
    padding: 0 !important;
    display: block !important;
    pointer-events: none;
    background: transparent !important;
    -webkit-transform: translate3d(0,0,0);
    transform: translate3d(0,0,0);
  }

  /* 3. Kill all default browser controls/icons */
  video::-webkit-media-controls { display:none !important; }
  video::-webkit-media-controls-enclosure { display:none !important; }
  video::-webkit-media-controls-panel { display:none !important; }
  
  /* 4. Kill scrollbars */
  ::-webkit-scrollbar { display: none !important; }
  * { 
    scrollbar-width: none !important; 
    box-sizing: border-box !important; 
    -webkit-tap-highlight-color: transparent !important; 
  }
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
    const v1 = useRef<HTMLVideoElement>(null)
    const v2 = useRef<HTMLVideoElement>(null)
    const videoRefs = [v1, v2]
    const [slotUrls, setSlotUrls] = useState<[string, string]>(['', ''])
    const [slotOpacity, setSlotOpacity] = useState<[number, number]>([1, 0])
    const idxRef = useRef(0)
    const [debug, setDebug] = useState<string>('Init')
    const watchdogRef = useRef<any>(null)
    const initialSyncDone = useRef(false)

    const sorted = React.useMemo(
        () => [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        [items]
    )
    const memoizedAssets = React.useMemo(() => assets, [JSON.stringify(assets)])

    const getUrl = useCallback((item: ManifestItem) => {
        const asset = memoizedAssets.find(a => a.media_id === item.media_id)
        return asset?.url || item.web_url || ''
    }, [memoizedAssets])

    function triggerWatchdog(delay = 10000) {
        if (watchdogRef.current) clearTimeout(watchdogRef.current)
        watchdogRef.current = setTimeout(() => {
            if (sorted.length > 1) {
                setDebug("WD Skip")
                advanceBuffer(true)
            }
        }, delay)
    }

    function advanceBuffer(forceNext = false) {
        if (sorted.length === 0) return

        // Single video loop optimization
        if (sorted.length === 1) {
            const v = videoRefs[activeSlot].current
            if (v) {
                v.currentTime = 0
                v.play().catch(e => setDebug(`Loop Err`))
            }
            onAdvance()
            return
        }

        const currentSlot = activeSlot
        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0
        const nextIdx = (idxRef.current + 1) % sorted.length
        const nextVideo = videoRefs[nextSlot].current

        // PROACTIVE RECOVERY
        if (nextVideo && nextVideo.error && !forceNext) {
            setDebug(`Err Skip V${nextIdx}`)
            idxRef.current = nextIdx
            onAdvance()
            setTimeout(() => advanceBuffer(), 500)
            return
        }

        const performSwitch = () => {
            if (!nextVideo) return

            setDebug(`${idxRef.current}→${nextIdx} | SWAP`)
            nextVideo.playbackRate = sorted[nextIdx].playback_speed || 1

            setActiveSlot(nextSlot)
            setSlotOpacity(nextSlot === 0 ? [1, 0] : [0, 1])
            idxRef.current = nextIdx
            onAdvance()

            const attemptPlay = () => {
                triggerWatchdog(12000)
                nextVideo.currentTime = 0
                nextVideo.play().then(() => {
                    setDebug(`${nextIdx} Play OK`)
                    const preloadIdx = (nextIdx + 1) % sorted.length
                    const preloadUrl = getUrl(sorted[preloadIdx])

                    setTimeout(() => {
                        setSlotUrls(prev => {
                            const updated: [string, string] = [...prev] as [string, string]
                            updated[currentSlot] = preloadUrl
                            return updated
                        })
                    }, 500)
                }).catch(e => {
                    setDebug(`P.Err`)
                })
            }
            setTimeout(attemptPlay, 50)
        }

        if (nextVideo && nextVideo.readyState >= 2) {
            performSwitch()
        } else if (nextVideo) {
            setDebug(`Wait S${nextSlot} R:${nextVideo.readyState}`)
            const onCanPlay = () => {
                nextVideo.removeEventListener('canplay', onCanPlay)
                performSwitch()
            }
            nextVideo.addEventListener('canplay', onCanPlay)
            setTimeout(() => {
                nextVideo.removeEventListener('canplay', onCanPlay)
                if (activeSlot === currentSlot) performSwitch()
            }, 5000)
        }
    }

    // Effect to call .load() whenever a slot URL changes
    useEffect(() => {
        if (v1.current && slotUrls[0]) v1.current.load()
    }, [slotUrls[0]])
    useEffect(() => {
        if (v2.current && slotUrls[1]) v2.current.load()
    }, [slotUrls[1]])

    // Browser priming
    useEffect(() => {
        videoRefs.forEach(ref => {
            if (ref.current) {
                ref.current.muted = true
                ref.current.volume = 0
            }
        })
    }, [])

    // Initialize
    useEffect(() => {
        if (sorted.length > 0 && !initialSyncDone.current) {
            const firstId = getUrl(sorted[0])
            const nextId = sorted.length > 1 ? getUrl(sorted[1]) : ''
            setSlotUrls([firstId, nextId])

            if (videoRefs[0].current) videoRefs[0].current.playbackRate = sorted[0].playback_speed || 1
            if (videoRefs[1].current && sorted.length > 1) videoRefs[1].current.playbackRate = sorted[1].playback_speed || 1

            initialSyncDone.current = true
            const v = v1.current
            if (v) {
                const startPlay = () => {
                    v.currentTime = 0
                    v.play().then(() => setDebug("Start OK")).catch(e => setDebug(`Start Err`))
                    triggerWatchdog(15000)
                }
                if (v.readyState >= 2) startPlay()
                else v.addEventListener('canplay', startPlay, { once: true })
            }
        }
    }, [sorted, getUrl, triggerWatchdog])

    // Autoplay heartbeat
    useEffect(() => {
        const interval = setInterval(() => {
            const v = videoRefs[activeSlot].current
            if (v && v.paused && v.readyState >= 2 && !v.ended) {
                v.play().catch(() => { })
            }
        }, 1500)
        return () => clearInterval(interval)
    }, [activeSlot])

    if (sorted.length === 0) return null

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
            {[0, 1].map(i => (
                <video
                    key={i}
                    ref={videoRefs[i]}
                    src={slotUrls[i]}
                    style={{
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                        objectFit: 'fill', background: '#000', display: 'block',
                        opacity: slotOpacity[i],
                        zIndex: slotOpacity[i] > 0 ? 10 : 1,
                        pointerEvents: 'none',
                    }}
                    muted playsInline crossOrigin="anonymous" preload="auto"
                    onTimeUpdate={() => { if (i === activeSlot) triggerWatchdog(12000) }}
                    onEnded={() => { if (i === activeSlot) advanceBuffer() }}
                    onError={() => { if (i === activeSlot) setTimeout(() => advanceBuffer(true), 1500) }}
                />
            ))}
            {/* Debug Overlay */}
            <div style={{
                position: 'absolute', bottom: 5, right: 5, zIndex: 9999,
                fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace',
                background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px',
                pointerEvents: 'none'
            }}>
                ID:{idxRef.current}/{sorted.length} | {debug}
            </div>
        </div>
    )
}


// ─── Playback Engine ──────────────────────────────────────────────────────────

function PlaybackEngine({ items, assets, region }: PlaybackProps) {
    const [idx, setIdx] = useState(0)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [fade, setFade] = useState(true)
    const [currentTime, setCurrentTime] = useState(new Date())

    // Perodic re-evaluation for schedules
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 10000)
        return () => clearInterval(t)
    }, [])

    const activeItems = useMemo(() => {
        const filtered = items
            .filter(item => {
                if (!item.is_scheduled) return true

                // 1. Date Range Check
                if (item.start_date) {
                    const start = new Date(item.start_date)
                    // If device time is way off (e.g. 1970), ignore date filter to prevent 永久 black screen
                    if (currentTime.getFullYear() > 2000 && currentTime < start) return false
                }
                if (item.end_date) {
                    const end = new Date(item.end_date)
                    end.setHours(23, 59, 59, 999)
                    if (currentTime.getFullYear() > 2000 && currentTime > end) return false
                }

                // 2. Day of Week Check
                if (item.days_of_week && item.days_of_week.length > 0) {
                    if (!item.days_of_week.includes(currentTime.getDay())) return false
                }

                // 3. Time Check (Dayparting)
                if (item.start_time || item.end_time) {
                    const nowSecs = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds()
                    if (item.start_time) {
                        const [h, m, s] = item.start_time.split(':').map(Number)
                        if (nowSecs < (h * 3600 + (m || 0) * 60 + (s || 0))) return false
                    }
                    if (item.end_time) {
                        const [h, m, s] = item.end_time.split(':').map(Number)
                        if (nowSecs > (h * 3600 + (m || 0) * 60 + (s || 0))) return false
                    }
                }

                return true
            })
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

        // SAFETY: If we filtered everything out but there WERE items, 
        // fallback to the first item rather than showing a black screen 
        // unless it's a strict schedule (user can override this later)
        if (filtered.length === 0 && items.length > 0) {
            console.warn('[PlaybackEngine] All items filtered by schedule. Falling back to first item to avoid black screen.')
            return [items[0]]
        }
        return filtered
    }, [items, currentTime])

    // Safety: Reset index if active list changes significantly
    useEffect(() => {
        if (idx >= activeItems.length && activeItems.length > 0) {
            setIdx(0)
        }
    }, [activeItems.length, idx])

    // Update Android Status on content change
    useEffect(() => {
        if (activeItems.length > 0) {
            const currentItem = activeItems[idx]
            const label = currentItem.web_url || currentItem.media_id || 'unnamed'
            const win = window as any
            if (win.AndroidHealth?.setPlayerState) {
                win.AndroidHealth.setPlayerState('playing', label)
            }
        }
    }, [idx, activeItems])

    const advance = useCallback(() => {
        // Critical: If only 1 item, NEVER advance/refresh (prevents reload flashes)
        if (activeItems.length <= 1) return

        const nextIdx = (idx + 1) % activeItems.length
        // If we are about to switch to the SAME item, skip the fade cycle
        if (nextIdx === idx) return

        setFade(false)
        setTimeout(() => {
            setIdx(nextIdx)
            setFade(true)
        }, 300)
    }, [idx, activeItems.length])

    const memoizedAssets = React.useMemo(() => assets, [JSON.stringify(assets)])

    useEffect(() => {
        if (activeItems.length === 0) return
        if (timerRef.current) clearTimeout(timerRef.current)

        const item = activeItems[idx]
        const asset = memoizedAssets.find(a => a.media_id === item.media_id)
        const url = asset?.url || item.web_url
        const type = asset?.type || item.type || (item.media_id ? 'video' : 'image')

        if (!url) {
            if (activeItems.length > 1) advance()
            return
        }

        // Videos are handled by DoubleBufferVideo's own onEnded
        if (type === 'video') return

        // If only 1 item, we don't set a timer to advance
        if (activeItems.length <= 1) return

        const dur = (item.duration_seconds ?? (type === 'web_url' ? DEFAULT_WEB_DURATION : DEFAULT_IMAGE_DURATION)) * 1000
        timerRef.current = setTimeout(advance, dur)
        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [idx, activeItems.length, advance, memoizedAssets, region.id])

    if (activeItems.length === 0) return (
        <div style={{
            position: 'absolute',
            top: `${region.y}%`, left: `${region.x}%`,
            width: `${region.width}%`, height: `${region.height}%`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#0a0a0f', border: '1px solid #1e293b'
        }}>
            <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Region: {region.id}</div>
            <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem' }}>No Active Content (Scheduled)</div>
        </div>
    )

    const item = activeItems[idx]
    const asset = memoizedAssets.find(a => a.media_id === item.media_id)
    const url = asset?.url || item.web_url
    const type = asset?.type || item.type || (item.media_id ? 'video' : 'image')

    // Use double buffer for videos to ensure smooth looping and better recovery
    const allVideos = useMemo(() => {
        if (activeItems.length === 0) return false
        return activeItems.every(item => {
            const asset = memoizedAssets.find(a => a.media_id === item.media_id)
            const type = asset?.type || item.type || (item.media_id ? 'video' : 'image')
            return type === 'video'
        })
    }, [activeItems, memoizedAssets])

    // Preload next image
    const nextItem = activeItems[(idx + 1) % activeItems.length]
    const nextAsset = memoizedAssets.find(a => a.media_id === nextItem?.media_id)
    const nextUrl = nextAsset?.url || nextItem?.web_url
    const nextType = nextAsset?.type || nextItem?.type

    const videoRef = useRef<HTMLVideoElement>(null)

    // Explicitly handle video playback startup for mixed content
    useEffect(() => {
        if (type === 'video' && videoRef.current) {
            const v = videoRef.current
            const attempt = () => {
                v.currentTime = 0
                v.play().catch(e => console.warn("[PlaybackEngine] Video play failed:", e))
            }
            if (v.readyState >= 2) {
                attempt()
            } else {
                v.addEventListener('canplay', attempt, { once: true })
            }
        }
    }, [idx, type, url])

    if (!url) return (
        <div style={{
            position: 'absolute',
            top: `${region.y}%`, left: `${region.x}%`,
            width: `${region.width}%`, height: `${region.height}%`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: '#1a1a2e', border: '2px dashed #334155'
        }}>
            <div style={{ color: '#475569', fontSize: '0.65rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Region: {region.id}</div>
            <div style={{ color: '#f87171', fontSize: '0.8rem' }}>Missing Content URL</div>
            <div style={{ color: '#475569', fontSize: '0.6rem', marginTop: '0.4rem' }}>{item.playlist_item_id}</div>
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
                    key={activeItems.map(i => i.playlist_item_id + i.media_id).join(',')}
                    items={activeItems}
                    assets={memoizedAssets}
                    onAdvance={advance}
                />
            ) : (
                /* Mixed content: use fade-based switching */
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    opacity: fade ? 1 : 0,
                    transition: 'none',
                }}>
                    {type === 'image' && url && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
                            <img
                                key={item.playlist_item_id}
                                src={url}
                                alt="Playlist Content"
                                style={{
                                    position: 'absolute', top: 0, left: 0,
                                    width: '100%', height: '100%',
                                    objectFit: 'fill', display: 'block',
                                }}
                                onError={(e) => {
                                    console.error(`[PlaybackEngine] Image Load Failure: ${url}`)
                                    const parent = e.currentTarget.parentElement
                                    if (parent) {
                                        parent.style.background = '#450a0a'
                                        parent.innerHTML += `<div style="color: #ef4444; font-size: 10px; z-index: 10">⚠️ Image Load Error</div>`
                                    }
                                }}
                            />
                        </div>
                    )}
                    {type === 'video' && url && (
                        <video
                            key={item.playlist_item_id}
                            ref={videoRef}
                            src={url}
                            style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                objectFit: 'fill', background: '#000', display: 'block',
                            }}
                            muted playsInline
                            disableRemotePlayback
                            webkit-playsinline="true"
                            preload="auto"
                            loop={activeItems.length === 1}
                            onPlay={(e) => e.currentTarget.playbackRate = item.playback_speed || 1}
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
                    {type === 'ppt' && url && (
                        <iframe
                            key={item.playlist_item_id}
                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
                            style={{
                                position: 'absolute', top: 0, left: 0,
                                width: '100%', height: '100%',
                                border: 'none', display: 'block',
                                background: '#fff',
                            }}
                            title="ppt"
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
                        onChange={e => e.target.value.length <= 50 && setVal(e.target.value)}
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
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                        {msg}
                    </div>
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
        </div >
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

const MAX_LOGS = 50
const consoleLogs: string[] = []
const originalLog = console.log
const originalError = console.error
const originalWarn = console.warn

console.log = (...args) => {
    const msg = args.map(a => {
        try {
            if (a instanceof HTMLElement) return `[${a.tagName} Element]`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch (e) {
            return String(a);
        }
    }).join(' ')
    const log = `[${new Date().toLocaleTimeString()}] ${msg}`
    consoleLogs.push(log)
    if (consoleLogs.length > MAX_LOGS) consoleLogs.shift()
    originalLog.apply(console, args)

    const win = window as any
    if (win.AndroidHealth?.logLine) {
        win.AndroidHealth.logLine(msg)
    }
}
console.error = (...args) => {
    const msg = args.map(a => {
        try {
            if (a instanceof HTMLElement) return `[${a.tagName} Element]`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch (e) {
            return String(a);
        }
    }).join(' ')
    const log = `[${new Date().toLocaleTimeString()}] ERROR: ${msg}`
    consoleLogs.push(log)
    if (consoleLogs.length > MAX_LOGS) consoleLogs.shift()
    originalError.apply(console, args)

    const win = window as any
    if (win.AndroidHealth?.reportError) {
        win.AndroidHealth.reportError(msg)
    }
}
console.warn = (...args) => {
    const msg = args.map(a => {
        try {
            if (a instanceof HTMLElement) return `[${a.tagName} Element]`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch (e) {
            return String(a);
        }
    }).join(' ')
    const log = `[${new Date().toLocaleTimeString()}] WARN: ${msg}`
    consoleLogs.push(log)
    if (consoleLogs.length > MAX_LOGS) consoleLogs.shift()
    originalWarn.apply(console, args)

    const win = window as any
    if (win.AndroidHealth?.logLine) {
        win.AndroidHealth.logLine(`⚠️ WARN: ${msg}`)
    }
}

export default function PlayerPage() {
    const { device_code } = useParams<{ device_code: string }>()
    const dc = device_code || ''

    // Dynamic Viewport Sync for Browser and WebViews
    useEffect(() => {
        const syncViewport = () => {
            let meta = document.querySelector('meta[name="viewport"]')
            if (!meta) {
                meta = document.createElement('meta')
                meta.setAttribute('name', 'viewport')
                document.head.appendChild(meta)
            }
            meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, viewport-fit=cover')

            // Force browser to visible area only
            document.documentElement.style.height = '100vh';
            document.body.style.height = '100vh';
        }

        syncViewport()
        window.addEventListener('resize', syncViewport)
        return () => window.removeEventListener('resize', syncViewport)
    }, [])

    const [phase, setPhase] = useState<Phase>('loading')
    const [secret, setSecret] = useState<string>('')
    const [manifest, setManifest] = useState<Manifest | null>(null)
    const [offline, setOffline] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [version, setVersion] = useState<string | null>(null)
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)
    const versionRef = useRef(version)
    const manifestTimerRef = useRef<any>(null)
    const hbTimerRef = useRef<any>(null)

    useEffect(() => {
        versionRef.current = version
    }, [version])

    const [pairingPin, setPairingPin] = useState('')
    const [showDiagnostics, setShowDiagnostics] = useState(false)
    const secretRef = useRef(secret)
    useEffect(() => { secretRef.current = secret }, [secret])

    // Android Status Sync
    const updateAndroidStatus = useCallback((p: string, content?: string | null) => {
        const win = window as any
        if (win.AndroidHealth?.setPlayerState) {
            win.AndroidHealth.setPlayerState(p, content || null)
        }
    }, [])

    useEffect(() => {
        updateAndroidStatus(phase)
    }, [phase, updateAndroidStatus])

    // ── Hidden Admin Panel (5-tap top-right corner) ──
    const ADMIN_PIN = '2580'
    const tapCountRef = useRef(0)
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [showPinPrompt, setShowPinPrompt] = useState(false)
    const [showAdminPanel, setShowAdminPanel] = useState(false)
    const [pinInput, setPinInput] = useState('')
    const [pinError, setPinError] = useState(false)

    const handleCornerTap = () => {
        tapCountRef.current += 1
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
        // Reset counter after 3s of inactivity
        tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 3000)
        if (tapCountRef.current >= 5) {
            tapCountRef.current = 0
            setShowPinPrompt(true)
            setPinInput('')
            setPinError(false)
        }
    }

    const handlePinSubmit = (pin: string) => {
        if (pin === ADMIN_PIN) {
            setShowPinPrompt(false)
            setShowAdminPanel(true)
            setPinError(false)
        } else {
            setPinError(true)
            setPinInput('')
        }
    }

    // Keyboard shortcut for diagnostics
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.shiftKey && e.key === 'D') setShowDiagnostics(prev => !prev)
        }
        window.addEventListener('keydown', handleKeys)
        return () => window.removeEventListener('keydown', handleKeys)
    }, [])

    // ── Command Processing ──
    const processIncomingCommands = useCallback(async (commands: any[]) => {
        for (const cmd of commands) {
            console.log(`[Player] Processing command: ${cmd.command} (${cmd.id})`)

            try {
                // 1. Mark as EXECUTED immediately in Supabase
                await supabase.from('device_commands').update({
                    status: 'EXECUTED',
                    executed_at: new Date().toISOString()
                }).eq('id', cmd.id)

                // 2. Perform the actual logic
                if (cmd.command === 'REBOOT' || cmd.command === 'RELOAD') {
                    console.warn('[Player] Remote Reload/Reboot triggered. Reloading page...')
                    window.location.reload()
                } else if (cmd.command === 'CLEAR_CACHE') {
                    console.warn('[Player] Remote Clear Cache triggered. Purging local storage...')
                    localStorage.removeItem(manifestKey(dc))
                    window.location.reload()
                } else if (cmd.command === 'SCREENSHOT') {
                    console.log('[Player] Remote Screenshot requested...')
                    const win = window as any
                    if (win.AndroidHealth && win.AndroidHealth.takeScreenshot) {
                        win.AndroidHealth.takeScreenshot(cmd.id)
                    } else {
                        // Fallback: In browser, we can't easily screenshot, but we record the attempt
                        console.error('[Player] Native screenshot bridge NOT available.')
                    }
                }
            } catch (err: any) {
                console.error(`[Player] Command ${cmd.id} execution failed:`, err.message)
            }
        }
    }, [dc])

    // Keep checkCommands for legacy/backup or direct REST usage
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
                } else if (cmd.command === 'CLEAR_CACHE') {
                    console.warn('[Player] Remote Clear Cache triggered. Purging local storage...')
                    localStorage.removeItem(manifestKey(dc))
                    // We keep the secretKey so the device stays paired
                    window.location.reload()
                } else if (cmd.command === 'SCREENSHOT') {
                    console.log('[Player] Remote Screenshot requested...')
                    const win = window as any
                    if (win.AndroidHealth && win.AndroidHealth.takeScreenshot) {
                        // The Android app will handle the upload to Supabase Storage
                        win.AndroidHealth.takeScreenshot(cmd.id)
                    } else {
                        console.error('[Player] Native screenshot bridge NOT available.')
                    }
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

    // ── Asset Sync (Offline Cache) ──
    const syncAssets = useCallback(async (assetsToSync: ManifestAsset[]) => {
        if (!assetsToSync || assetsToSync.length === 0) return

        console.log(`[Cache] Syncing ${assetsToSync.length} assets...`)
        setSyncProgress({ current: 0, total: assetsToSync.length })

        const updatedAssets = [...assetsToSync]
        let completed = 0

        for (let i = 0; i < updatedAssets.length; i++) {
            const asset = updatedAssets[i]
            if (!asset.url) {
                completed++
                setSyncProgress({ current: completed, total: updatedAssets.length })
                continue
            }

            try {
                // Determine if it's already a blob URL (unlikely at start)
                if (asset.url.startsWith('blob:')) {
                    completed++
                    setSyncProgress({ current: completed, total: updatedAssets.length })
                    continue
                }

                const blobUrl = await downloadAndCache({
                    media_id: asset.media_id,
                    url: asset.url,
                    type: asset.type,
                    checksum_sha256: asset.checksum_sha256
                })
                updatedAssets[i] = { ...asset, url: blobUrl }
            } catch (err) {
                console.error(`[Cache] Failed to sync ${asset.media_id}`, err)
            } finally {
                completed++
                setSyncProgress({ current: completed, total: updatedAssets.length })
            }
        }

        // Update manifest with blob URLs
        setManifest(prev => prev ? { ...prev, assets: updatedAssets } : null)
        setTimeout(() => setSyncProgress(null), 2000)
    }, [])

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

            // ── Handling "Up to Date" response ──
            if (data.up_to_date) {
                console.log(`[Player] Content ${data.version} is up to date. Keep loop playing.`)
                setOffline(false)
                return true
            }

            const newVersion = data.resolved?.version || null
            const wasPlaying = phase === 'playing' || phase === 'standby'

            // ── Auto version-change detection (mid-playback) ──
            if (wasPlaying && newVersion && versionRef.current && newVersion !== versionRef.current) {
                console.log(`[Player] 🔄 New version detected: ${versionRef.current} → ${newVersion}`)
                if (data.assets) syncAssets(data.assets)
                setManifest(data)
                setVersion(newVersion)
                versionRef.current = newVersion
                localStorage.setItem(manifestKey(dc), JSON.stringify(data))
                setOffline(false)
                return true
            }

            // ── Regular Load ──
            setManifest(data)
            setVersion(newVersion)
            versionRef.current = newVersion
            localStorage.setItem(manifestKey(dc), JSON.stringify(data))
            setOffline(false)

            if (data.assets) syncAssets(data.assets)

            const win = window as any
            if (win.AndroidHealth?.setStoreInfo) {
                win.AndroidHealth.setStoreInfo(data.device?.store_id || null, data.device?.store_name || null)
            }

            return true
        } catch (err: any) {
            const msg: string = (err.message || '').toLowerCase()

            if (msg.includes('invalid credentials') || msg.includes('inactive device')) {
                localStorage.removeItem(secretKey(dc))
                localStorage.removeItem(manifestKey(dc))
                setSecret('')
                setPhase('pairing')
                initPairing()
                return false
            }

            if (msg.includes('no active publication') || msg.includes('no publication') || msg.includes('not found')) {
                setPhase('standby')
                if (err.data?.device) {
                    setManifest({ resolved: { role: err.data.device.role_name, scope: 'Standby' } } as any)
                }
                return true
            }

            const cached = localStorage.getItem(manifestKey(dc))
            if (cached) {
                try {
                    const c = JSON.parse(cached)
                    setManifest(c)
                    if (c.resolved?.version) {
                        setVersion(c.resolved.version)
                        versionRef.current = c.resolved.version
                    }
                    setOffline(true)
                    return true
                } catch { /* ignore */ }
            }

            setErrorMsg(err.message || 'Fetch failed')
            setPhase('error')
            return false
        }
    }, [dc, version, phase, syncAssets, initPairing])

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
                logs: [...consoleLogs], // Send buffered logs
                ...meta
            }
            consoleLogs.length = 0 // Clear after sending

            console.log('[Player] Sending heartbeat...')
            const res = await callEdgeFn('device-heartbeat', payload)

            if (res.error) {
                console.error('[Player] Heartbeat Server Error:', res.error)
            } else {
                console.log(`[Player] Heartbeat Recorded ✅ (${phase})`)
                // Handle commands returned in heartbeat
                if (res.commands && res.commands.length > 0) {
                    processIncomingCommands(res.commands)
                }
            }
        } catch (err: any) {
            console.warn('[Player] Heartbeat non-fatal:', err.message)
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
        if ((phase !== 'playing' && phase !== 'standby') || !secret) {
            if (manifestTimerRef.current) clearInterval(manifestTimerRef.current)
            if (hbTimerRef.current) clearInterval(hbTimerRef.current)
            return
        }

        const pollSec = manifest?.poll_seconds ?? 30
        const pollMs = phase === 'standby' ? 30_000 : pollSec * 1000

        console.log(`[Player] Starting polling timers. Phase: ${phase}, Poll: ${pollSec}s`)

        // Clear existing to avoid duplicates on re-run
        if (manifestTimerRef.current) clearInterval(manifestTimerRef.current)
        if (hbTimerRef.current) clearInterval(hbTimerRef.current)

        manifestTimerRef.current = setInterval(async () => {
            const ok = await fetchManifest(secretRef.current)
            if (ok && phase === 'standby') setPhase('playing')
        }, pollMs)

        hbTimerRef.current = setInterval(() => {
            sendHeartbeat(secretRef.current)
        }, HEARTBEAT_INTERVAL_MS)

        // Initial heartbeat (debounced/prevented if just sent)
        const lastHb = localStorage.getItem('last_hb_sent') || '0'
        if (Date.now() - parseInt(lastHb) > 5000) {
            sendHeartbeat(secretRef.current)
            localStorage.setItem('last_hb_sent', Date.now().toString())
        }

        return () => {
            if (manifestTimerRef.current) clearInterval(manifestTimerRef.current)
            if (hbTimerRef.current) clearInterval(hbTimerRef.current)
        }
    }, [phase, !!secret, manifest?.poll_seconds]) // Stable dependencies

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

    // ── Admin panel button style helper ──
    const btnStyle = (bg: string, color = '#f1f5f9'): React.CSSProperties => ({
        padding: '0.875rem 1.25rem', borderRadius: 12, fontSize: '0.9rem',
        fontWeight: 600, background: bg, border: '1px solid rgba(255,255,255,0.08)',
        color, cursor: 'pointer', textAlign: 'center' as const,
    })

    // ── Hidden Admin Panel overlay ──
    const AdminPanel = () => (
        <>
            {/* PIN Prompt */}
            {showPinPrompt && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99999,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 20, padding: '2rem', width: 280, textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔐</div>
                        <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: '0.25rem' }}>Admin Access</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.25rem' }}>Enter PIN to continue</div>
                        {/* PIN dots display */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} style={{
                                    width: 14, height: 14, borderRadius: '50%',
                                    background: pinInput.length > i ? '#ef4444' : '#1e293b',
                                    border: '2px solid ' + (pinError ? '#ef4444' : '#334155'),
                                    transition: 'all 0.2s'
                                }} />
                            ))}
                        </div>
                        {pinError && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.75rem' }}>Incorrect PIN</div>}
                        {/* Numpad */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
                                <button key={i} onClick={() => {
                                    if (!k) return
                                    if (k === '⌫') { setPinInput(p => p.slice(0, -1)); setPinError(false); return }
                                    const next = pinInput + k
                                    setPinInput(next)
                                    if (next.length === 4) handlePinSubmit(next)
                                }} style={{
                                    padding: '0.85rem', borderRadius: 10, fontSize: '1.1rem', fontWeight: 600,
                                    background: k ? '#1e293b' : 'transparent',
                                    border: '1px solid ' + (k ? '#334155' : 'transparent'),
                                    color: '#f1f5f9', cursor: k ? 'pointer' : 'default',
                                    transition: 'background 0.15s'
                                }}>{k}</button>
                            ))}
                        </div>
                        <button onClick={() => { setShowPinPrompt(false); setPinInput('') }}
                            style={{ marginTop: '1rem', width: '100%', padding: '0.5rem', background: 'transparent', border: '1px solid #334155', borderRadius: 8, color: '#64748b', cursor: 'pointer', fontSize: '0.875rem' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Admin Panel */}
            {showAdminPanel && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99999,
                    background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* Header */}
                    <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>⚙️ Admin Panel</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>Device: {dc} · v{version || 'unknown'}</div>
                        </div>
                        <button onClick={() => setShowAdminPanel(false)}
                            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#94a3b8', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                            ✕ Close
                        </button>
                    </div>

                    {/* Info grid */}
                    <div style={{ padding: '1.5rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {[
                            { label: 'Device Code', value: dc },
                            { label: 'Connection', value: offline ? '🔴 Offline' : '🟢 Online' },
                            { label: 'Content Version', value: version || '—' },
                            { label: 'Assets Cached', value: String(manifest?.assets?.length || 0) },
                            { label: 'Regions', value: Object.keys(manifest?.region_playlists || {}).join(', ') || '—' },
                            { label: 'Pub Scope', value: manifest?.resolved?.scope || 'Global' },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '0.875rem 1rem' }}>
                                <div style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>{label}</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9', wordBreak: 'break-all' }}>{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div style={{ padding: '0 2rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <button onClick={() => { setShowAdminPanel(false); window.location.reload() }} style={btnStyle('#1e293b')}>
                            🔄 Force Reload
                        </button>
                        <button onClick={() => {
                            localStorage.removeItem(manifestKey(dc))
                            setShowAdminPanel(false)
                            window.location.reload()
                        }} style={btnStyle('#1e293b')}>
                            🗑️ Clear Cache &amp; Reload
                        </button>
                        <button onClick={() => {
                            localStorage.removeItem(secretKey(dc))
                            localStorage.removeItem(manifestKey(dc))
                            setShowAdminPanel(false)
                            window.location.reload()
                        }} style={btnStyle('#7f1d1d', '#fca5a5')}>
                            ⚠️ Unpair Device
                        </button>
                        <button onClick={() => {
                            window.dispatchEvent(new CustomEvent('omnipush_force_play'))
                            setShowAdminPanel(false)
                        }} style={btnStyle('#14532d', '#86efac')}>
                            ▶ Force Play
                        </button>
                    </div>
                    <div style={{ padding: '1.5rem 2rem', fontSize: '0.7rem', color: '#334155', textAlign: 'center' }}>
                        OmniPush Admin · Tap anywhere outside or press Close to exit
                    </div>
                </div>
            )}
        </>
    )

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

                {showDiagnostics && <BottomBar device_code={dc} version={version} offline={offline} />}
            </div>
        )
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            background: '#000',
            overflow: 'hidden',
            margin: 0, padding: 0,
            zIndex: 1,
            display: 'block',
        }}>
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



            <AdminPanel />

            {/* Invisible 60×60 tap zone — top-right corner triggers admin panel */}
            <div
                onClick={handleCornerTap}
                style={{
                    position: 'fixed', top: 0, right: 0,
                    width: 60, height: 60, zIndex: 99998,
                    cursor: 'default',
                }}
            />

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

            {/* Sync Overlay removed as per user request to avoid playback jitter/noise */}

            {/* Styles for animation */}
            <style>{`
                @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    )
}
