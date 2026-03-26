import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { WifiOff, Tv2, Lock, RefreshCw, Clock, Image as ImageIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, DEFAULT_TENANT_ID, callEdgeFn } from '../lib/supabase'
import { downloadAndCache, hydrateAssetsFromCache } from '../lib/cache'
import html2canvas from 'html2canvas'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManifestAsset {
    media_id: string
    type: 'image' | 'video' | 'web_url' | 'ppt' | 'presentation'
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
const DEFAULT_IMAGE_DURATION = 10
const DEFAULT_WEB_DURATION = 30
const DEFAULT_VIDEO_DURATION = 300
const TRANSITION_DURATION = 1000 // 1s smooth transition
const READY_TIMING = 500 // 500ms safety buffer for Android hardware

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
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: 100dvh !important;
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

  /* 3. Kill all default browser controls/icons - CRITICAL for Chromium 87 / Android TV */
  video::-webkit-media-controls { display:none !important; -webkit-appearance: none !important; }
  video::-webkit-media-controls-enclosure { display:none !important; -webkit-appearance: none !important; }
  video::-webkit-media-controls-panel { display:none !important; -webkit-appearance: none !important; }
  video::-webkit-media-controls-play-button { display:none !important; -webkit-appearance: none !important; }
  video::-webkit-media-controls-overlay-play-button { display:none !important; -webkit-appearance: none !important; }
  video::-webkit-media-controls-start-playback-button { display:none !important; -webkit-appearance: none !important; }
  video::-webkit-media-controls-shim { display:none !important; }
  video::-internal-media-controls-overlay-play-button { display:none !important; }
  video::-internal-media-controls-download-button { display:none !important; }
  video::-internal-media-controls-loading-indicator { display:none !important; }
  video::-webkit-media-controls-current-time-display { display:none !important; }
  video::-webkit-media-controls-time-remaining-display { display:none !important; }
  video::-webkit-media-controls-timeline { display:none !important; }
  video::-webkit-media-controls-volume-control-container { display:none !important; }
  video::-webkit-media-controls-toggle-closed-captions-button { display:none !important; }
  
  /* Additional hardware layer hide for Android 11 Droidlogic / System indicators */
  video { 
    pointer-events: none !important; 
    outline: none !important; 
    background: #000 !important;
    mask-image: none !important;
    -webkit-mask-image: none !important;
    -webkit-tap-highlight-color: transparent !important;
  }
  
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

type TransitionEffect = 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'none'

function DoubleBufferVideo({ items, assets, onAdvance, effect = 'slide-up' }: {
    items: ManifestItem[]
    assets: ManifestAsset[]
    onAdvance: () => void
    effect?: TransitionEffect
}) {
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
    const [isTransitioning, setIsTransitioning] = useState(false)
    const v1 = useRef<HTMLVideoElement>(null)
    const v2 = useRef<HTMLVideoElement>(null)
    const videoRefs = [v1, v2]
    const [slotUrls, setSlotUrls] = useState<[string, string]>(['', ''])
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

    const advanceBufferRef = useRef<(force?: boolean) => void>(() => { })

    const triggerWatchdog = useCallback((delay = 10000) => {
        if (watchdogRef.current) clearTimeout(watchdogRef.current)
        watchdogRef.current = setTimeout(() => {
            if (sorted.length > 1) {
                setDebug("WD Skip")
                advanceBufferRef.current(true)
            }
        }, delay)
    }, [sorted.length])

    const advanceBuffer = useCallback((forceNext = false) => {
        if (sorted.length === 0) return

        if (sorted.length === 1) {
            const v = videoRefs[activeSlot].current
            if (v) {
                v.currentTime = 0
                v.play().catch(e => setDebug(`Loop Err: ${e.message.slice(0, 10)}`))
            }
            onAdvance()
            return
        }

        const currentSlot = activeSlot
        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0
        const currentVideo = videoRefs[currentSlot].current
        const nextVideo = videoRefs[nextSlot].current
        const nextIdx = (idxRef.current + 1) % sorted.length

        if (nextVideo && nextVideo.error && !forceNext) {
            setDebug(`Err Skip V${nextIdx}`)
            idxRef.current = nextIdx
            onAdvance()
            setTimeout(() => advanceBuffer(), 500)
            return
        }

        const performSwitch = () => {
            if (!nextVideo) return

            setDebug(`${idxRef.current}→${nextIdx} | SAFE SWAP`)

            const releaseOld = () => {
                if (!currentVideo) return;
                try {
                    console.log('[Player] Releasing O-Slot decoder:', currentSlot);
                    // Crucial: hide old video instantly BEFORE mutating src so native play icon cannot render
                    currentVideo.style.opacity = '0';
                    currentVideo.style.visibility = 'hidden';
                    currentVideo.pause();
                    currentVideo.removeAttribute('src');
                    currentVideo.load();
                } catch (e) { /* ignore */ }
            };

            // Start the next one FIRST, while it is still completely hidden!
            triggerWatchdog(15000)
            nextVideo.muted = true
            nextVideo.currentTime = 0
            if (sorted[nextIdx]) {
                nextVideo.playbackRate = sorted[nextIdx].playback_speed || 1
            }

            nextVideo.play().then(() => {
                console.log('[Player] Playing N-Slot:', nextIdx)
                setDebug(`${nextIdx} PLAYING`)

                // Now that it's confirmed playing, reveal it and trigger the transition CSS
                setIsTransitioning(true)
                setActiveSlot(nextSlot)
                idxRef.current = nextIdx
                onAdvance()

                // Release old video slightly after new one is successfully active and covering the screen
                setTimeout(releaseOld, 250);

                // Keep transition flag true slightly longer for hardware to visually stabilize
                setTimeout(() => {
                    setIsTransitioning(false)

                    // Queue next buffer
                    const pIdx = (nextIdx + 1) % sorted.length
                    const pUrl = getUrl(sorted[pIdx])
                    setTimeout(() => {
                        setSlotUrls(prev => {
                            const up: [string, string] = [...prev] as [string, string]
                            up[currentSlot] = pUrl
                            return up
                        })
                    }, 300)
                }, 850)

            }).catch(e => {
                console.error('[Player] Play Error:', e.message)
                setDebug(`P.Err: ${e.message?.slice(0, 15)}`)
                setIsTransitioning(false)
                releaseOld();
                setTimeout(() => advanceBuffer(true), 1500)
            })
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
    }, [activeSlot, sorted, getUrl, onAdvance, triggerWatchdog])

    useEffect(() => {
        advanceBufferRef.current = advanceBuffer
    }, [advanceBuffer])

    useEffect(() => {
        if (sorted.length > 0) {
            const firstId = getUrl(sorted[0])
            const nextId = sorted.length > 1 ? getUrl(sorted[1]) : ''
            if (initialSyncDone.current) {
                const stillExists = sorted.some(s => getUrl(s) === slotUrls[activeSlot])
                if (stillExists) return
            }
            setSlotUrls([firstId, nextId])
            initialSyncDone.current = true
            setTimeout(() => {
                const v = activeSlot === 0 ? v1.current : v2.current
                if (v) {
                    v.currentTime = 0
                    v.play().catch(() => { })
                }
            }, 100)
        }
    }, [sorted, getUrl])

    useEffect(() => {
        const interval = setInterval(() => {
            const v = videoRefs[activeSlot].current
            if (v && v.paused && v.readyState >= 3 && !v.ended) {
                v.play().catch(() => { })
            }
        }, 1500)
        return () => clearInterval(interval)
    }, [activeSlot])

    const [isReady, setIsReady] = useState<[boolean, boolean]>([false, false])
    const isReadyRef = useRef<boolean[]>([false, false])

    const getTransitionStyle = (slot: number): React.CSSProperties => {
        const isActive = activeSlot === slot
        const ready = isReady[slot]
        const e: TransitionEffect = effect ?? 'slide-up'
        const style: React.CSSProperties = {
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            objectFit: 'fill',
            background: 'transparent', // Crucial: no black background hidden behind frames
            transition: 'transform 800ms cubic-bezier(0.4, 0, 0.2, 1), opacity 600ms ease, visibility 0s',
            zIndex: isActive ? 10 : 5,
            pointerEvents: 'none',
            visibility: (isActive || isTransitioning) ? 'visible' : 'hidden',
            transform: 'translate3d(0, 0, 0)',
            opacity: ready ? 1 : 0, // Keep invisible until first frame
            willChange: 'transform, opacity'
        }

        if (!isActive) {
            switch (e) {
                case 'fade':
                    style.opacity = 0
                    break
                case 'slide-up':
                    style.transform = 'translate3d(0, -100%, 0)'
                    break
                case 'slide-down':
                    style.transform = 'translate3d(0, 100%, 0)'
                    break
                case 'slide-left':
                    style.transform = 'translate3d(-100%, 0, 0)'
                    break
                case 'slide-right':
                    style.transform = 'translate3d(100%, 0, 0)'
                    break
                case 'none':
                    style.transition = 'none'
                    style.opacity = 0
                    break
            }
        }
        return style
    }

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
            {[0, 1].map(i => (
                <video
                    key={i}
                    ref={videoRefs[i]}
                    src={slotUrls[i]}
                    style={getTransitionStyle(i)}
                    controls={false}
                    tabIndex={-1}
                    disableRemotePlayback
                    muted
                    playsInline
                    preload="auto"
                    autoPlay={false}
                    disablePictureInPicture={true}
                    poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                    {...{
                        'webkit-playsinline': 'true',
                        'x-webkit-airplay': 'deny',
                        'controlsList': 'nodownload nofullscreen noremoteplayback'
                    }}
                    onPlaying={() => {
                        console.log(`[DoubleBufferVideo] Video Slot ${i} Playing, waiting ${READY_TIMING}ms buffer...`)
                        setTimeout(() => {
                            setIsReady(prev => {
                                const up = [...prev] as [boolean, boolean]
                                up[i] = true
                                return up
                            })
                        }, READY_TIMING)
                    }}
                    onEnded={() => {
                        setIsReady(prev => {
                            const up = [...prev] as [boolean, boolean]
                            up[i] = false
                            return up
                        })
                        if (i === activeSlot) advanceBuffer()
                    }}
                    onTimeUpdate={() => { if (i === activeSlot) triggerWatchdog(12000) }}
                />
            ))}
            <div style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 9, color: 'rgba(255,255,255,0.2)', zIndex: 110 }}>
                {debug} | {activeSlot === 0 ? 'V1' : 'V2'} | {effect}
            </div>
        </div>
    )
}


// ─── Playback Engine ──────────────────────────────────────────────────────────

function PlaybackEngine({ items, assets, region }: PlaybackProps) {
    const [idx, setIdx] = useState(0)
    const [prevIdx, setPrevIdx] = useState<number | null>(null)
    const [isSwapping, setIsSwapping] = useState(false)
    const [readyIdx, setReadyIdx] = useState<number | null>(null)
    const [currentTime, setCurrentTime] = useState(new Date())

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const idxRef = useRef(0)
    idxRef.current = idx

    // Periodic re-evaluation for schedules
    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 15000)
        return () => clearInterval(t)
    }, [])

    const activeItems = useMemo(() => {
        const filtered = items.filter(item => {
            if (!item.is_scheduled) return true

            // 1. Date Range Check
            if (item.start_date) {
                const start = new Date(item.start_date + 'T00:00:00')
                if (currentTime < start) return false
            }
            if (item.end_date) {
                const end = new Date(item.end_date + 'T23:59:59')
                if (currentTime > end) return false
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

        return filtered.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }, [items, currentTime])

    // Safety: Reset index if active list changes significanly
    useEffect(() => {
        if (idx >= activeItems.length && activeItems.length > 0) {
            setIdx(0)
        }
    }, [activeItems.length, idx])

    const advance = useCallback(() => {
        const len = activeItems.length
        if (len === 0) return
        const nextIdx = len === 1 ? 0 : (idxRef.current + 1) % len
        setIdx(nextIdx)
        setReadyIdx(null) // Reset ready state for next item
    }, [activeItems.length])

    // Track state for transitions
    useEffect(() => {
        if (idx !== prevIdx) {
            setIsSwapping(true)
            const t = setTimeout(() => {
                setIsSwapping(false)
                setPrevIdx(idx)
            }, 1200)
            return () => clearTimeout(t)
        }
    }, [idx, prevIdx])

    // Timing effect
    useEffect(() => {
        if (activeItems.length === 0) return
        if (timerRef.current) clearTimeout(timerRef.current)

        const safeIdx = idx >= activeItems.length ? 0 : idx
        const item = activeItems[safeIdx]
        const asset = assets.find(a => a.media_id === item?.media_id)
        const type = asset?.type || item?.type || (item?.media_id ? 'video' : 'image')

        // Videos in all-video playlists are handled by DoubleBufferVideo's onEnded
        if (type === 'video' && activeItems.every(i => {
            const a = assets.find(as => as.media_id === i.media_id)
            return (a?.type || i.type) === 'video'
        })) return

        const dur = ((item?.duration_seconds ?? 0) > 0
            ? item!.duration_seconds!
            : (type === 'video' ? DEFAULT_VIDEO_DURATION : (type === 'web_url' ? DEFAULT_WEB_DURATION : DEFAULT_IMAGE_DURATION))) * 1000

        timerRef.current = setTimeout(advance, dur)
        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [idx, activeItems, assets, advance])

    // Android Status Sync
    useEffect(() => {
        if (activeItems.length > 0) {
            const safeIdx = idx >= activeItems.length ? 0 : idx
            const currentItem = activeItems[safeIdx]
            if (!currentItem) return
            const label = currentItem.web_url || currentItem.media_id || 'unnamed'
            const win = window as any
            if (win.AndroidHealth?.setPlayerState) {
                win.AndroidHealth.setPlayerState('playing', label)
            }
        }
    }, [idx, activeItems])

    // Specialized All-Video Check
    const allVideos = useMemo(() => {
        return activeItems.length > 0 && activeItems.every(i => {
            const asset = assets.find(a => a.media_id === i.media_id)
            let t = asset?.type || i.type || (i.media_id ? 'video' : 'image')
            const u = asset?.url || i.web_url
            if (u) {
                const ext = u.split('?')[0].split('.').pop()?.toLowerCase()
                if (['mp4', 'webm', 'mov', 'ogg'].includes(ext || '')) t = 'video'
            }
            return t === 'video'
        })
    }, [activeItems, assets])

    function getYouTubeId(url: string) {
        const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|youtube\.com\/v\/)+([\w-]{11})/)
        return m ? m[1] : null
    }

    function getEmbedUrl(url: string) {
        const id = getYouTubeId(url)
        if (id) {
            const origin = encodeURIComponent(window.location.origin)
            return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&rel=0&modestbranding=1&enablejsapi=1&origin=${origin}`
        }
        return url
    }

    function getTransitionStyles(isActive: boolean, ready: boolean, transitionType?: string): React.CSSProperties {
        const isSwappingOut = !isActive

        // Base styles
        const styles: React.CSSProperties = {
            opacity: (isActive && ready) ? 1 : (isSwappingOut ? 0 : 0),
            transform: 'none',
            transition: `all ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }

        if (transitionType === 'slide') {
            styles.transform = isActive
                ? (ready ? 'translateX(0)' : 'translateX(100%)')
                : 'translateX(-100%)'
        } else if (transitionType === 'zoom') {
            styles.transform = isActive
                ? (ready ? 'scale(1)' : 'scale(1.1)')
                : 'scale(0.9)'
        }

        return styles
    }

    function renderItem(targetIdx: number, isActive: boolean) {
        const item = activeItems[targetIdx]
        if (!item) return null
        const asset = assets.find(a => a.media_id === item.media_id)
        const url = asset?.url || item.web_url
        let type = asset?.type || item.type || (item.media_id ? 'video' : 'image')

        if (url) {
            const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
            if (['mp4', 'webm', 'mov', 'ogg'].includes(ext || '')) type = 'video'
            if (['ppt', 'pptx'].includes(ext || '')) type = 'presentation'
        }

        const visible = isActive || (isSwapping && targetIdx === prevIdx)
        const ready = readyIdx === targetIdx || type === 'web_url' || type === 'presentation'

        // Fetch transition from item settings or default to fade
        const transitionType = (item as any)?.settings?.transition

        return (
            <div key={`${item.playlist_item_id}-${targetIdx}`} style={{
                position: 'absolute', inset: 0,
                zIndex: isActive ? 10 : 5,
                background: '#000',
                margin: 0, padding: 0, overflow: 'hidden',
                visibility: visible ? 'visible' : 'hidden',
                ...getTransitionStyles(isActive, ready, transitionType)
            }}>
                {type === 'image' && url && (
                    <img
                        src={url}
                        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                        onLoad={() => setTimeout(() => setReadyIdx(targetIdx), READY_TIMING)}
                    />
                )}
                {type === 'video' && url && (
                    <video
                        src={url}
                        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                        autoPlay muted playsInline
                        poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                        onPlaying={() => {
                            console.log(`[PlaybackEngine] Video Playing, waiting ${READY_TIMING}ms buffer...`)
                            setTimeout(() => setReadyIdx(targetIdx), READY_TIMING)
                        }}
                        onEnded={advance}
                        onError={() => {
                            setReadyIdx(targetIdx)
                            setTimeout(advance, 3000)
                        }}
                    />
                )}
                {type === 'web_url' && url && (
                    <iframe src={getEmbedUrl(url)} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} allow="autoplay" />
                )}
                {type === 'presentation' && url && (
                    <iframe
                        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                        style={{ width: '100%', height: '100%', border: 'none', background: '#fff', display: 'block' }}
                    />
                )}
            </div>
        )
    }

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

    return (
        <div style={{
            position: 'absolute',
            top: `${region.y}%`, left: `${region.x}%`,
            width: `${region.width}%`, height: `${region.height}%`,
            background: '#000', overflow: 'hidden', margin: 0, padding: 0
        }}>
            {allVideos ? (
                <DoubleBufferVideo
                    key={activeItems.map(i => i.playlist_item_id).join(',')}
                    items={activeItems}
                    assets={assets}
                    onAdvance={advance}
                    effect="none"
                />
            ) : (
                <>
                    {/* Layer 1: Previous item (for fading out) */}
                    {prevIdx !== null && prevIdx !== idx && renderItem(prevIdx, false)}
                    {/* Layer 2: Current item (fading in) */}
                    {renderItem(idx, true)}
                </>
            )}

            {/* Preload next item if it's an image */}
            {(() => {
                const nextItem = activeItems[(idx + 1) % activeItems.length]
                const nextAsset = assets.find(a => a.media_id === nextItem?.media_id)
                const nextUrl = nextAsset?.url || nextItem?.web_url
                const nextType = nextAsset?.type || nextItem?.type || (nextItem?.media_id ? 'video' : 'image')
                if (nextType === 'image' && nextUrl && !allVideos) {
                    return <img src={nextUrl} alt="" style={{ display: 'none' }} />
                }
                return null
            })()}
        </div>
    )
}

// ─── UI States ────────────────────────────────────────────────────────────────

function LoadingState({ device_code }: { device_code: string }) {
    const [trouble, setTrouble] = useState(false)
    useEffect(() => {
        const t = setTimeout(() => setTrouble(true), 25000)
        return () => clearTimeout(t)
    }, [])
    return (
        <div style={bgStyle}>
            <AmbientOrbs />
            <div style={{ textAlign: 'center', zIndex: 1, position: 'relative' }}>
                <Logo />
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #1e293b', borderTopColor: 'var(--color-brand-500)', animation: 'spin 0.8s linear infinite', margin: '2rem auto 1rem' }} />
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Connecting to network…</div>
                <div style={{ fontFamily: 'monospace', color: '#f87171', fontSize: '0.8rem', marginTop: '0.5rem' }}>{device_code}</div>
                {trouble && (
                    <div style={{ marginTop: '2rem', animation: 'slideIn 0.5s ease' }}>
                        <button onClick={() => window.location.reload()} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#64748b', padding: '0.5rem 1rem', borderRadius: 8, fontSize: '0.75rem', cursor: 'pointer' }}>
                            Taking too long? Reload
                        </button>
                    </div>
                )}
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
    // Auto-retry every 15 seconds so signage players don't stay dead forever after a short WiFi drop
    useEffect(() => {
        const t = setTimeout(() => {
            onRetry()
        }, 15000)
        return () => clearTimeout(t)
    }, [onRetry])

    return (
        <div style={bgStyle}>
            <AmbientOrbs />
            <div style={{ zIndex: 1, position: 'relative', textAlign: 'center', padding: '2rem' }}>
                <Logo />
                <div style={{ marginTop: '2.5rem', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '1.5rem 2rem', maxWidth: 450 }}>
                    <WifiOff size={28} color="#ef4444" style={{ margin: '0 auto 0.75rem' }} />
                    <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.5rem' }}>Connection Failed</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: 8 }}>
                        DEVICE_CODE: {device_code}
                    </div>
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
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
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
    const dc = (device_code || '').trim()

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
            document.documentElement.style.height = '100dvh';
            document.body.style.height = '100dvh';
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
    const [showDebugManifest, setShowDebugManifest] = useState(false)
    const [debugJSON, setDebugJSON] = useState('')

    const handleCornerTap = () => {
        tapCountRef.current += 1
        console.log(`[Admin] Corner Tap ${tapCountRef.current}/5`)
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current)
        // Reset counter after 3s of inactivity
        tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0 }, 3000)
        if (tapCountRef.current >= 5) {
            console.log(`[Admin] Opening PIN Prompt`)
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
    const captureBrowserScreenshot = useCallback(async (commandId: string) => {
        try {
            console.log(`[Player] Generating browser screenshot for command ${commandId}...`)
            const canvas = await html2canvas(document.body, {
                useCORS: true,
                scale: 0.5,
                logging: false,
                backgroundColor: '#000000',
                ignoreElements: (el) => el.id === 'admin-overlay' || el.id === 'pin-prompt'
            })

            const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
            if (!blob) throw new Error('Failed to create blob')

            const fileName = `screenshots/${dc}_${commandId}.jpg`
            const { error } = await supabase.storage
                .from('device-screenshots')
                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true })

            if (error) throw error
            console.log(`[Player] Browser screenshot uploaded: ${fileName}`)
        } catch (err: any) {
            console.error('[Player] Browser screenshot failed:', err.message)
        }
    }, [dc])

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
                    // Multiple layers of reload to bypass various browser locks
                    window.location.reload()
                    setTimeout(() => { window.location.href = window.location.href }, 500)
                } else if (cmd.command === 'CLEAR_CACHE') {
                    console.warn('[Player] Remote Clear Cache triggered. Purging local storage...')
                    localStorage.removeItem(manifestKey(dc))
                    window.location.reload()
                    setTimeout(() => { window.location.href = window.location.href }, 500)
                } else if (cmd.command === 'SCREENSHOT') {
                    console.log('[Player] Remote Screenshot requested...')
                    const win = window as any
                    if (win.AndroidHealth && win.AndroidHealth.takeScreenshot) {
                        win.AndroidHealth.takeScreenshot(cmd.id)
                    } else {
                        await captureBrowserScreenshot(cmd.id)
                    }
                }
            } catch (err: any) {
                console.error(`[Player] Command ${cmd.id} execution failed:`, err.message)
            }
        }
    }, [dc, captureBrowserScreenshot])

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
                    setTimeout(() => { window.location.href = window.location.href }, 500)
                } else if (cmd.command === 'CLEAR_CACHE') {
                    console.warn('[Player] Remote Clear Cache triggered. Purging local storage...')
                    localStorage.removeItem(manifestKey(dc))
                    window.location.reload()
                    setTimeout(() => { window.location.href = window.location.href }, 500)
                } else if (cmd.command === 'SCREENSHOT') {
                    console.log('[Player] Remote Screenshot requested...')
                    const win = window as any
                    if (win.AndroidHealth && win.AndroidHealth.takeScreenshot) {
                        win.AndroidHealth.takeScreenshot(cmd.id)
                    } else {
                        await captureBrowserScreenshot(cmd.id)
                    }
                }
            }
        } catch (err: any) {
            console.error('[Commands] Polling error:', err.message)
        }
    }, [manifest?.device?.id, dc, captureBrowserScreenshot])

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

                // CRITICAL: Google Docs Viewer (used for PPT) cannot access blob: URLs.
                // We keep the original remote URL for transparency in the manifest for these types.
                if (asset.type !== 'ppt' && asset.type !== 'presentation') {
                    updatedAssets[i] = { ...asset, url: blobUrl }
                } else {
                    console.log(`[Cache] Downloaded ${asset.media_id} for offline redundancy, but using remote URL for rendering.`)
                }
            } catch (err: any) {
                const errorStr = err?.message || JSON.stringify(err) || 'Unknown Error'
                console.error(`[Cache] Failed to sync ${asset.media_id}:`, errorStr)
                setErrorMsg(`[Cache] Sync failed: ${errorStr}`)
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
            console.log(`[Player] Fetching manifest: DC=${dc} | Origin=${window.location.origin}`)
            const data = await callEdgeFn('device-manifest', {
                device_code: dc,
                device_secret: sec,
                current_version: versionRef.current,
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
    }, [dc, syncAssets, initPairing]) // REMOVED version, phase to stop re-triggering loops

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
        console.log('[Player] Manual retry triggered...')
        if (secretRef.current) {
            setPhase('loading')
            fetchManifest(secretRef.current).then(ok => {
                if (ok) setPhase('playing')
                else setPhase('error')
            })
        } else {
            window.location.reload()
        }
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

    // ── Pre-calculate corner tap zone ──
    const cornerTapZone = (
        <div
            onClick={(e) => {
                e.stopPropagation();
                handleCornerTap();
            }}
            style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: 120,
                height: 120,
                zIndex: 9999999,
                cursor: 'pointer',
                // background: 'rgba(255,0,0,0.1)', // debug
            }}
        />
    )

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
                <div id="pin-prompt" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998,
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
                <div id="admin-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999,
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
                                <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>{label}</div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', wordBreak: 'break-all' }}>{value}</div>
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
                            setDebugJSON(JSON.stringify(manifest, null, 2))
                            setShowDebugManifest(true)
                        }} style={btnStyle('rgba(255,255,255,0.05)', '#94a3b8')}>
                            🔍 Debug Manifest
                        </button>
                        <button onClick={() => {
                            window.dispatchEvent(new CustomEvent('omnipush_force_play'))
                            setShowAdminPanel(false)
                        }} style={btnStyle('#14532d', '#86efac')}>
                            ▶ Force Play
                        </button>
                    </div>

                    {showDebugManifest && (
                        <div style={{ padding: '0 2rem 1.5rem', maxHeight: '400px', overflow: 'auto' }}>
                            <pre style={{
                                background: '#020617', padding: '1rem', borderRadius: 8,
                                fontSize: '0.65rem', color: '#64748b', fontFamily: 'monospace',
                                border: '1px solid #1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                            }}>
                                {debugJSON}
                            </pre>
                            <button
                                onClick={() => setShowDebugManifest(false)}
                                style={{
                                    marginTop: '0.75rem', width: '100%', padding: '0.5rem',
                                    borderRadius: 6, background: '#1e293b', color: 'white',
                                    border: 'none', cursor: 'pointer', fontSize: '0.75rem'
                                }}
                            >
                                Close Debug View
                            </button>
                        </div>
                    )}
                    <div style={{ padding: '1.5rem 2rem', fontSize: '0.7rem', color: '#334155', textAlign: 'center' }}>
                        OmniPush Admin · Tap anywhere outside or press Close to exit
                    </div>
                </div>
            )}
        </>
    )

    // ── Main Content Resolver ──
    const regions = manifest?.layout?.regions || [{ id: 'full', x: 0, y: 0, width: 100, height: 100 }]
    const hasAnyContent = manifest ? Object.values(manifest.region_playlists || {}).some(items => items.length > 0) : false

    const renderMain = () => {
        if (phase === 'loading' || (!manifest && phase !== 'pairing' && phase !== 'secret' && phase !== 'error')) {
            return <LoadingState device_code={dc} />
        }
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

        // ── Standby / No Content published yet ──
        if (phase === 'standby' || (manifest && !hasAnyContent)) {
            return (
                <div style={bgStyle}>
                    <AmbientOrbs />
                    <div style={{ zIndex: 1, position: 'relative', textAlign: 'center', padding: '2rem' }}>
                        <Logo />
                        <div style={{ marginTop: '2.5rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem', lineHeight: 1.8 }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📺</div>
                            <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '0.25rem' }}>Display is Online</div>
                            <div style={{ color: '#94a3b8' }}>Connected as <strong style={{ color: '#f87171' }}>{manifest?.resolved?.role || 'Unassigned'}</strong> role</div>

                            {!hasAnyContent ? (
                                <div style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>
                                    No active content published yet.
                                </div>
                            ) : (
                                <div style={{ marginTop: '1rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.8125rem' }}>
                                    Awaiting content stream...
                                </div>
                            )}

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
                    </div>
                </div>
            )
        }

        // ── Normal Playback ──
        return (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                width: '100vw',
                height: '100dvh',
                background: '#000',
                overflow: 'hidden',
                margin: 0, padding: 0,
                zIndex: 1,
            }}>
                {regions.map((reg) => {
                    const regionItems = manifest?.region_playlists?.[reg.id] || []
                    if (regionItems.length === 0) return null
                    return (
                        <PlaybackEngine
                            key={reg.id}
                            region={reg}
                            items={regionItems}
                            assets={manifest!.assets}
                        />
                    )
                })}

                {/* Overlays */}
                {offline && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                        background: 'rgba(239,68,68,0.85)', padding: '0.5rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.5rem', fontSize: '0.8125rem', fontWeight: 500, color: 'white',
                        backdropFilter: 'blur(4px)',
                    }}>
                        <WifiOff size={14} /> Offline — playing cached content
                    </div>
                )}
                <style>{`
                    @keyframes slideIn {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `}</style>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100dvh', overflow: 'hidden', background: '#000' }}>
            {renderMain()}
            {cornerTapZone}
            <AdminPanel />
        </div>
    )
}
