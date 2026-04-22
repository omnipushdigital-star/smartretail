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
const TRANSITION_DURATION = 800 // 0.8s smooth transition
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
    margin: 0; padding: 0;
    width: 100vw !important; height: 100vh !important;
    min-height: 100vh !important; max-height: 100vh !important;
    overflow: hidden !important;
    background: #000;
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

interface VideoElementProps {
    url: string
    isReady: boolean
    onReady: () => void
    onEnded: () => void
    onError: (msg: string) => void
}

function VideoElement({ url, isReady, onReady, onEnded, onError }: VideoElementProps) {
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (isReady && videoRef.current) {
            videoRef.current.play().catch(err => {
                console.warn('[VideoElement] Play error:', err)
                onError(err.message)
            })
        }
    }, [isReady, url, onError])

    return (
        <video
            ref={videoRef}
            src={url}
            style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
            muted
            playsInline
            preload="auto"
            controls={false}
            onCanPlay={onReady}
            onEnded={onEnded}
            onError={(e) => onError('Video Error')}
        />
    )
}

interface PlaybackProps {
    items: ManifestItem[]
    assets: ManifestAsset[]
    region: { id: string; x: number; y: number; width: number; height: number }
    isNative?: boolean
    showDebug?: boolean
    deviceCode?: string
    consecutiveErrorsRef?: React.MutableRefObject<number>
    lastMediaErrorRef?: React.MutableRefObject<string | null>
}

// ─── Double-Buffer Video Player ──────────────────────────────────────────────
function DoubleBufferVideo({ items, assets, onAdvance, currentIndex, effect = 'slide-up', showDebug = false }: {
    items: ManifestItem[]
    assets: ManifestAsset[]
    onAdvance: (newIdx: number) => void
    currentIndex: number
    effect?: string
    showDebug?: boolean
}): React.ReactElement {
    const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
    const [slotUrls, setSlotUrls] = useState<[string, string]>(['', ''])
    const [isTransitioning, setIsTransitioning] = useState(false)
    const [showNext, setShowNext] = useState(false)
    const [debug, setDebug] = useState('')

    const v1 = useRef<HTMLVideoElement>(null)
    const v2 = useRef<HTMLVideoElement>(null)
    const videoRefs = [v1, v2]
    
    const idxRef = useRef(currentIndex)
    const watchdogRef = useRef<any>(null)
    const initialSyncDone = useRef(false)

    // Sequential Transition Logic (see BUG-001 in BUG_RESOLUTIONS.md)
    useEffect(() => {
        if (isTransitioning) {
            const t = setTimeout(() => setShowNext(true), 100)
            return () => clearTimeout(t)
        } else {
            setShowNext(false)
        }
    }, [isTransitioning])

    const sorted = useMemo(() => [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [items])

    const getUrl = useCallback((item: ManifestItem) => {
        if (!item) return ''
        const asset = assets.find(a => a.media_id === item.media_id)
        return asset?.url || item.web_url || ''
    }, [assets])

    const triggerWatchdog = useCallback((delay = 12000) => {
        if (watchdogRef.current) clearTimeout(watchdogRef.current)
        watchdogRef.current = setTimeout(() => {
            if (sorted.length > 1) {
                setDebug("WD Skip")
                advanceBuffer(true)
            }
        }, delay)
    }, [sorted.length])

    const advanceBuffer = useCallback((forceNext = false) => {
        if (sorted.length === 0) return
        
        if (sorted.length === 1) {
            const v = videoRefs[activeSlot].current
            if (v) {
                v.currentTime = 0
                v.play().catch(() => setDebug('LoopErr'))
            }
            return
        }

        const currentSlot = activeSlot
        const nextSlot: 0 | 1 = activeSlot === 0 ? 1 : 0
        const currentVideo = videoRefs[currentSlot].current
        const nextVideo = videoRefs[nextSlot].current
        const nextIdx = (idxRef.current + 1) % sorted.length

        // Step 1: Start Transition (show mask/overlay-ready state)
        setIsTransitioning(true)
        setShowNext(false)

        // Step 2 & 3: Sequential Swap (BUG-001 Resolution)
        setTimeout(() => {
            // RELEASE OLD DECODER BEFORE PLAYING NEXT
            if (currentVideo) {
                currentVideo.pause()
                currentVideo.removeAttribute('src')
                currentVideo.load()
            }

            // LOAD & PLAY NEXT
            setTimeout(() => {
                if (!nextVideo) return
                
                const nextUrl = getUrl(sorted[nextIdx])
                setSlotUrls(prev => {
                    const up = [...prev] as [string, string]
                    up[nextSlot] = nextUrl
                    return up
                })
                
                nextVideo.muted = true
                nextVideo.currentTime = 0
                nextVideo.play().then(() => {
                    setActiveSlot(nextSlot)
                    idxRef.current = nextIdx
                    onAdvance(nextIdx)
                    triggerWatchdog(12000)
                    setDebug(`${idxRef.current+1}/${sorted.length}`)
                    
                    // Step 4: Stabilize and hide transition overlay
                    setTimeout(() => setIsTransitioning(false), 500)
                }).catch(e => {
                    console.warn('[DBV] Play error:', e)
                    setDebug('PlayErr')
                    // Recovery: try next after a delay
                    setTimeout(() => advanceBuffer(true), 2000)
                })
            }, 50)
        }, 300)
    }, [activeSlot, sorted, videoRefs, onAdvance, triggerWatchdog, getUrl])

    // Initial Startup
    useEffect(() => {
        if (sorted.length > 0 && !initialSyncDone.current) {
            const u0 = getUrl(sorted[0])
            const u1 = sorted.length > 1 ? getUrl(sorted[1]) : ''
            setSlotUrls([u0, u1])
            idxRef.current = 0
            initialSyncDone.current = true
            
            setTimeout(() => {
                const v = videoRefs[0].current
                if (v) v.play().catch(() => setDebug('StartErr'))
            }, 500)
        }
    }, [sorted, getUrl])

    // Playback Monitor Loop (every 1.5s as per stable version BUG-004)
    useEffect(() => {
        const interval = setInterval(() => {
            const v = videoRefs[activeSlot].current
            if (v && v.paused && sorted.length > 0 && !isTransitioning) {
                v.play().catch(() => {})
            }
        }, 1500)
        return () => clearInterval(interval)
    }, [activeSlot, sorted.length, isTransitioning, videoRefs])

    const getSlotStyle = (i: number): React.CSSProperties => {
        const isActive = i === activeSlot
        const isPrev = !isActive
        const item = sorted[idxRef.current];
        const transitionType = item?.settings?.transition || effect || 'fade';

        const base: React.CSSProperties = {
            position: 'absolute', inset: 0, 
            objectFit: 'fill', background: '#000',
            transition: isTransitioning ? 'all 600ms ease-in-out' : 'none',
            zIndex: isActive ? 10 : 5,
            pointerEvents: 'none'
        }

        if (isTransitioning) {
            if (isPrev) {
                // Outgoing
                base.opacity = showNext ? 0 : 1
                if (transitionType === 'slide' || transitionType === 'slide-up') {
                    base.transform = showNext ? 'translate3d(0, -100%, 0)' : 'translate3d(0, 0, 0)'
                } else if (transitionType === 'zoom') {
                    base.transform = showNext ? 'scale(1.2)' : 'scale(1)'
                }
            } else {
                // Incoming
                base.opacity = showNext ? 1 : 0
                if (transitionType === 'slide' || transitionType === 'slide-up') {
                    base.transform = showNext ? 'translate3d(0, 0, 0)' : 'translate3d(0, 100%, 0)'
                } else if (transitionType === 'zoom') {
                    base.transform = showNext ? 'scale(1)' : 'scale(0.8)'
                } else if (transitionType === 'none') {
                    base.transition = 'none'
                    base.opacity = 1
                }
            }
        } else {
            base.opacity = isActive ? 1 : 0
            base.visibility = isActive ? 'visible' : 'hidden'
            // Reset transforms
            base.transform = 'translate3d(0,0,0) scale(1)'
        }
        return base
    }

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
            {[0, 1].map(i => (
                <video
                    key={i}
                    ref={videoRefs[i]}
                    src={slotUrls[i]}
                    style={getSlotStyle(i)}
                    muted playsInline preload="auto"
                    onEnded={() => i === activeSlot && advanceBuffer()}
                    onTimeUpdate={() => i === activeSlot && triggerWatchdog(12000)}
                    onError={() => i === activeSlot && advanceBuffer(true)}
                    poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                />
            ))}
            {showDebug && (
                <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 10, padding: 4, zIndex: 1000 }}>
                    DBV: {debug}
                </div>
            )}
        </div>
    )
}





// ─── Playback Engine ──────────────────────────────────────────────────────────

function PlaybackEngine({ items, assets, region, isNative = false, showDebug = false, consecutiveErrorsRef, lastMediaErrorRef }: PlaybackProps) {
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

    const [activeItems, setActiveItems] = useState<ManifestItem[]>([])
    const lastActiveIdsRef = useRef('')

    useEffect(() => {
        const filtered = (items || []).filter(item => {
            const now = currentTime
            if (!item.is_scheduled) return true
            
            // 1. Date Range Check
            if (item.start_date) {
                const start = new Date(item.start_date + 'T00:00:00')
                if (now < start) return false
            }
            if (item.end_date) {
                const end = new Date(item.end_date + 'T23:59:59')
                if (now > end) return false
            }

            // 2. Day of Week Check
            if (item.days_of_week && item.days_of_week.length > 0) {
                if (!item.days_of_week.includes(now.getDay())) return false
            }

            // 3. Time Check (Dayparting)
            if (item.start_time || item.end_time) {
                const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
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
        }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

        const nextIds = filtered.map(i => `${i.playlist_item_id}-${i.media_id}`).join(',')
        if (nextIds !== lastActiveIdsRef.current) {
            console.log(`[PlaybackEngine] 📋 Active items updated: ${filtered.length} items`)
            lastActiveIdsRef.current = nextIds
            setActiveItems(filtered)
        }
    }, [items, currentTime])

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

    // Safety: Reset index if active list changes significanly
    useEffect(() => {
        if (idx >= activeItems.length && activeItems.length > 0) {
            setIdx(0)
        }
    }, [activeItems.length, idx])

    const activeItemsRef = useRef<ManifestItem[]>([])
    useEffect(() => { activeItemsRef.current = activeItems }, [activeItems])

    const advance = useCallback((forcedIdx?: number) => {
        setIdx(prev => {
            const len = activeItemsRef.current.length
            if (len === 0) return 0
            const next = forcedIdx !== undefined ? forcedIdx : (prev + 1) % len
            console.log(`[Playback] Advance: ${prev} -> ${next}`)
            return next
        })
        setReadyIdx(null)
    }, [])

    // Track state for transitions
    useEffect(() => {
        if (idx !== prevIdx) {
            setIsSwapping(true)
            const t = setTimeout(() => {
                setIsSwapping(false)
                setPrevIdx(idx)
            }, 2500)
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
        const itemDur = (item?.duration_seconds ?? 0) > 0 ? item!.duration_seconds! : 0
        const defaultDur = type === 'video' ? DEFAULT_VIDEO_DURATION : (type === 'web_url' ? DEFAULT_WEB_DURATION : DEFAULT_IMAGE_DURATION)
        const effectiveDur = (itemDur || defaultDur) * 1000

        // Safety Watchdog fallback
        // in case the video tag fails to fire onEnded due to a crash or interruption.
        // CORTEX: If allVideos is true, DoubleBufferVideo handles its own logic and watchdog.
        // We MUST NOT have a competing timer here or it will cause double-play/desync.
        if (allVideos) {
            // No timer here; DoubleBufferVideo is autonomous.
            // We set a very long 10-minute fallback just in case DBV itself dies.
            timerRef.current = setTimeout(() => {
                console.warn('[Watchdog] DBV seems stuck for 10min. Performing emergency advance.')
                advance()
            }, 600000)
        } else {
            timerRef.current = setTimeout(advance, effectiveDur)
        }

        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [idx, activeItems, assets, advance, allVideos])

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

    function getTransitionStyles(isActive: boolean, transitionType?: string): React.CSSProperties {
        // We are ready to move if the new item is ready OR we're not in a swapping state (startup)
        const isTargetReady = readyIdx === idx || !isSwapping

        const styles: React.CSSProperties = {
            opacity: isActive ? (isTargetReady ? 1 : 0) : (isTargetReady ? 0 : 1),
            transform: 'translate3d(0, 0, 0)',
            transition: transitionType === 'none' ? 'none' : `all ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            background: isNative ? 'transparent' : '#000',
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            pointerEvents: isActive ? 'auto' : 'none'
        }

        if (transitionType === 'slide') {
            styles.transform = isActive
                ? (isTargetReady ? 'translate3d(0, 0, 0)' : 'translate3d(100%, 0, 0)')
                : (isTargetReady ? 'translate3d(-100%, 0, 0)' : 'translate3d(0, 0, 0)')
        } else if (transitionType === 'zoom') {
            styles.transform = isActive
                ? (isTargetReady ? 'scale(1)' : 'scale(1.05)')
                : (isTargetReady ? 'scale(0.95)' : 'scale(1)')
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

        // Fetch transition from item settings or default to slide
        const transitionType = (item as any)?.settings?.transition || 'slide'

        return (
            <div key={`${item.playlist_item_id}-${targetIdx}`} style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                zIndex: isActive ? 10 : 5,
                background: isNative ? 'transparent' : '#000',
                margin: 0, padding: 0, overflow: 'hidden',
                visibility: visible ? 'visible' : 'hidden',
                ...getTransitionStyles(isActive, transitionType),
                willChange: 'transform, opacity'
            }}>
                {type === 'image' && url && (
                    <img
                        src={url}
                        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                        onLoad={() => setTimeout(() => setReadyIdx(targetIdx), READY_TIMING)}
                    />
                )}
                {type === 'video' && url && (
                    <VideoElement
                        url={url}
                        isReady={isActive}
                        onReady={() => {
                            setTimeout(() => setReadyIdx(targetIdx), READY_TIMING)
                            if (consecutiveErrorsRef) consecutiveErrorsRef.current = 0
                        }}
                        onEnded={advance}
                        onError={(msg) => {
                            if (consecutiveErrorsRef) consecutiveErrorsRef.current += 1
                            if (lastMediaErrorRef) lastMediaErrorRef.current = msg
                        }}
                    />
                )}
                {(type === 'web_url' || type === 'html') && url && (
                    <iframe 
                        src={getEmbedUrl(url)} 
                        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} 
                        allow="autoplay" 
                        onLoad={() => setTimeout(() => setReadyIdx(targetIdx), READY_TIMING)}
                    />
                )}
                {type === 'presentation' && url && (
                    <iframe
                        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                        style={{ width: '100%', height: '100%', border: 'none', background: '#fff', display: 'block' }}
                        onLoad={() => setTimeout(() => setReadyIdx(targetIdx), READY_TIMING)}
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
            background: isNative ? 'transparent' : '#000',
            overflow: 'hidden',
            margin: 0, padding: 0,
            transform: 'translate3d(0, 0, 0)', // Create containment layer
            backfaceVisibility: 'hidden',
            transformStyle: 'preserve-3d'
        }}>
            {allVideos ? (
                <DoubleBufferVideo
                    key={activeItems.map(i => i.playlist_item_id).join(',')}
                    items={activeItems}
                    assets={assets}
                    onAdvance={(newIdx) => advance(newIdx)}
                    currentIndex={idx}
                    effect={(activeItems[idx] as any)?.settings?.transition || 'slide'}
                    isNative={isNative}
                    showDebug={showDebug}
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

function LoadingState() {
    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: '#0A0A0A',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 99999
        }}>
            <Logo />
            <div style={{
                marginTop: '32px',
                width: 32, height: 32,
                border: '3px solid rgba(255,255,255,0.05)',
                borderTopColor: '#444444',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }} />
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
                    <WifiOff size={20} color="#ef4444" style={{ margin: '0 auto 0.75rem' }} />
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
            <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.03)', filter: 'blur(60px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(220, 38, 38, 0.02)', filter: 'blur(40px)', pointerEvents: 'none' }} />
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
    
    // NEW: Update remote logs state for debug overlay
    if (setRemoteLogsRef.current) {
        setRemoteLogsRef.current((prev: any[]) => [{ time: new Date().toLocaleTimeString(), msg, type: 'info' }, ...prev].slice(0, 5))
    }

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
            if (a instanceof Error) return `[${a.name}] ${a.message}${a.stack ? '\n' + a.stack : ''}`;
            return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch (e) {
            return String(a);
        }
    }).join(' ')

    // STRICT RULE: Silence non-critical playback interruption errors from dashboard
    if (msg.includes('interrupted by a call to pause') || msg.includes('goo.gl/LdLk22')) {
        originalError.apply(console, args) // Log to local devtools only
        return
    }

    const log = `[${new Date().toLocaleTimeString()}] ERROR: ${msg}`
    consoleLogs.push(log)
    if (consoleLogs.length > MAX_LOGS) consoleLogs.shift()

    // NEW: Update remote logs state for debug overlay
    if (setRemoteLogsRef.current) {
        setRemoteLogsRef.current((prev: any[]) => [{ time: new Date().toLocaleTimeString(), msg, type: 'error' }, ...prev].slice(0, 5))
    }

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

// CORTEX: Bridge for global console hijacking to React state
const setRemoteLogsRef = { current: null as any };

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
            document.documentElement.style.height = '100vh';
            document.body.style.height = '100vh';
        }

        syncViewport()
        window.addEventListener('resize', syncViewport)
        return () => window.removeEventListener('resize', syncViewport)
    }, [])

    // ─── BOOT-CRITICAL: DO NOT CHANGE 90000 ───────────────────────────────────
    // This watchdog MUST be 90s minimum. The bootFetch loop below runs 3 attempts,
    // each with a 25s callEdgeFn timeout + internal backoff (1s, 2s).
    // Worst case boot time: 0.5 + 25 + 1 + 25 + 2 + 25 = ~78.5s before cache loads.
    // If this timeout is < 90s, it fires mid-loop and reloads before offline cache
    // activates — causing an infinite reload cycle on boxes without network at boot.
    // DO NOT reduce this value. DO NOT remove this effect.
    // ─────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => {
            if (phaseRef.current === 'loading') {
                console.warn('[Player] 90s boot timeout. Force reloading...')
                window.location.reload()
            }
        }, 90000)
        return () => clearTimeout(t)
    }, [])

    const [phase, setPhase] = useState<Phase>('loading')
    const phaseRef = useRef<Phase>('loading')
    useEffect(() => { phaseRef.current = phase }, [phase])
    const [secret, setSecret] = useState<string>('')
    const [manifest, setManifest] = useState<Manifest | null>(null)
    const [offline, setOffline] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [version, setVersion] = useState<string | null>(null)
    const [inferredHdmi, setInferredHdmi] = useState<'connected' | 'disconnected' | 'unknown'>('unknown')
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null)
    const versionRef = useRef(version)
    const [showDebugOverlay, setShowDebugOverlay] = useState(false)
    const [lastSyncTime, setLastSyncTime] = useState(new Date().toLocaleTimeString())
    const [remoteLogs, setRemoteLogs] = useState<{ time: string, msg: string, type: 'info' | 'error' }[]>([])
    const manifestTimerRef = useRef<any>(null)
    const hbTimerRef = useRef<any>(null)
    const failCountRef = useRef(0)
    const lastErrorRef = useRef<string | null>(null)
    const isTransitioningRef = useRef(false)
    const bootStartedRef = useRef(false)
    const consecutiveErrorsRef = useRef(0)
    const lastMediaErrorRef = useRef<string | null>(null)
    const ackCommandIdRef = useRef<string | null>(null)
    const isRenderingRef = useRef(true)

    // Bridge state to global ref for console hijacking
    useEffect(() => {
        setRemoteLogsRef.current = setRemoteLogs;
        return () => { setRemoteLogsRef.current = null; }
    }, [])

    // Detect Android native video bridge (APK exposing AndroidHealth JS interface)
    // CORTEX: Robust check must include userAgent to prevent Chrome spoofing/mockers
    const isAndroidNative = !!(window as any).AndroidHealth

    useEffect(() => {
        // Global hook for child components to report transition states
        (window as any).setGlobalTransition = (v: boolean) => {
            isTransitioningRef.current = v
        }

        // Standard HDMI Detection Fallback (Amlogic/Rockchip boxes remove audio output on pull)
        const checkHardware = async () => {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const hasOutput = devices.some(d => d.kind === 'audiooutput');
                setInferredHdmi(hasOutput ? 'connected' : 'disconnected');
            } catch {
                setInferredHdmi('unknown');
            }
        };

        checkHardware();
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', checkHardware);
            return () => navigator.mediaDevices.removeEventListener('devicechange', checkHardware);
        }
    }, [])

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

    // ── Native Mode: Make WebView transparent so native SurfaceView video shows through ──
    // When the APK sets webView.setBackgroundColor(Color.TRANSPARENT), the HTML layer
    // must also have transparent backgrounds or the native video remains occluded.
    useEffect(() => {
        if (!isAndroidNative || phase !== 'playing') return
        document.documentElement.style.background = 'transparent'
        document.body.style.background = 'transparent'
        const root = document.getElementById('root')
        if (root) root.style.background = 'transparent'
        return () => {
            document.documentElement.style.background = ''
            document.body.style.background = ''
            if (root) root.style.background = ''
        }
    }, [isAndroidNative, phase])

    // ── Hidden Admin Panel (5-tap top-right corner) ──
    const ADMIN_PIN = '2580'
    const tapCountRef = useRef(0)
    const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [showPinPrompt, setShowPinPrompt] = useState(false)
    const [showAdminPanel, setShowAdminPanel] = useState(false)
    const [showOfflineIndicator, setShowOfflineIndicator] = useState(false)
    const [pinInput, setPinInput] = useState('')
    const [pinError, setPinError] = useState(false)
    const [showDebugManifest, setShowDebugManifest] = useState(false)
    const [showLogs, setShowLogs] = useState(false)
    const [debugJSON, setDebugJSON] = useState('')

    // Reset indicator on offline status change
    useEffect(() => {
        if (offline) {
            setShowOfflineIndicator(true)
            const t = setTimeout(() => setShowOfflineIndicator(false), 10000)
            return () => clearTimeout(t)
        } else {
            setShowOfflineIndicator(false)
        }
    }, [offline])

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

    const debugTapCountRef = useRef(0)
    const debugTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleDebugCornerTap = () => {
        debugTapCountRef.current += 1
        console.log(`[Debug] Corner Tap ${debugTapCountRef.current}/3`)
        if (debugTapTimerRef.current) clearTimeout(debugTapTimerRef.current)
        debugTapTimerRef.current = setTimeout(() => { debugTapCountRef.current = 0 }, 2000)
        if (debugTapCountRef.current >= 3) {
            console.log(`[Debug] Toggling Debug Overlay`)
            debugTapCountRef.current = 0
            setShowDebugOverlay(prev => !prev)
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
            if (e.shiftKey && e.key === 'X') setShowDebugOverlay(prev => !prev)
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
                // We do both: Direct DB update AND heartbeat ACK in next cycle for redundancy on Amlogic
                await supabase.from('device_commands').update({
                    status: 'EXECUTED',
                    executed_at: new Date().toISOString()
                }).eq('id', cmd.id)

                // Store for heartbeat ACK
                ackCommandIdRef.current = cmd.id

                // 2. Perform the actual logic
                const cmdStr = (cmd.command || '').toUpperCase()
                
                if (cmdStr === 'REBOOT' || cmdStr === 'RELOAD' || cmdStr === 'REFRESH') {
                    console.warn('[Player] Remote Reload/Reboot triggered. Delaying for DB update...')
                    // GIVE THE NETWORK STACK 2 SECONDS TO FINISH THE DB UPDATE ABOVE
                    await new Promise(r => setTimeout(r, 2000))
                    window.location.reload()
                    setTimeout(() => { window.location.href = window.location.href }, 500)
                } else if (cmdStr === 'CLEAR_CACHE') {
                    console.warn('[Player] Remote Clear Cache triggered. Purging local storage...')
                    await new Promise(r => setTimeout(r, 2000))
                    localStorage.removeItem(manifestKey(dc))
                    window.location.reload()
                    setTimeout(() => { window.location.href = window.location.href }, 500)
                } else if (cmdStr === 'SCREENSHOT') {
                    console.log('[Player] Remote Screenshot requested...')
                    const win = window as any
                    if (win.AndroidHealth && win.AndroidHealth.takeScreenshot) {
                        win.AndroidHealth.takeScreenshot(cmd.id)
                    } else {
                        await captureBrowserScreenshot(cmd.id)
                    }
                } else if (cmdStr === 'TOGGLE_DEBUG') {
                    console.log('[Player] Remote Toggle Debug requested...')
                    setShowDebugOverlay(prev => !prev)
                }
            } catch (err: any) {
                console.error(`[Player] Command ${cmd.id} execution failed:`, err.message)
            }
        }
    }, [dc, captureBrowserScreenshot])

    // ── Asset Sync (Offline Cache) ──
    const syncAssets = useCallback(async (assetsToSync: ManifestAsset[]) => {
        if (!assetsToSync || assetsToSync.length === 0) return

        const assetsToActuallySync = assetsToSync.filter(a => {
            // HTML assets are always served from origin URL — blob: URLs break relative paths inside the file
            if (a.type === 'html') return false
            return a.url && !a.url.startsWith('blob:')
        })

        if (assetsToActuallySync.length === 0) {
            console.log('[Cache] No cacheable assets (images) found — videos play direct.')
            return
        }

        console.log(`[Cache] Syncing ${assetsToActuallySync.length} assets...`)
        setSyncProgress({ current: 0, total: assetsToActuallySync.length })

        const updatedAssets = [...assetsToSync]
        let completed = 0

        for (const asset of assetsToActuallySync) {
            const idx = updatedAssets.findIndex(a => a.media_id === asset.media_id)
            try {
                const blobUrl = await downloadAndCache({
                    media_id: asset.media_id,
                    url: asset.url!,
                    type: asset.type,
                    checksum_sha256: asset.checksum_sha256
                })

                // Skip blob hydration for PPT/Presentation as documented in stable core
                if (asset.type !== 'ppt' && asset.type !== 'presentation') {
                    if (idx !== -1) updatedAssets[idx] = { ...asset, url: blobUrl }
                }
            } catch (err: any) {
                const reason = err?.message || (typeof err === 'string' ? err : 'Network/CORS blocked')
                console.error(`[Cache] Sync FAILED for ${asset.media_id} (${asset.type}): ${reason} | URL: ${asset.url}`)
                // No alert - just log it and move on to allow playback of other items
            } finally {
                completed++
                setSyncProgress({ current: completed, total: assetsToActuallySync.length })
            }
        }

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
    const fetchManifest = useCallback(async (sec: string, timeoutMs: number = 25000): Promise<boolean> => {
        try {
            console.log(`[Player] [MANIFEST_FETCH_START] DC=${dc} (t=${timeoutMs}ms)`)
            const data = await callEdgeFn('device-manifest', {
                device_code: dc,
                device_secret: sec,
                current_version: versionRef.current,
                origin: window.location.origin
            }, 45000, false) // 45s timeout, no auth

            if (data?.error) {
                console.error(`[Player] Manifest error from EdgeFn: ${data.error}`)
                // Throw so the catch block can run the offline hydration logic.
                throw new Error(String(data.error))
            }
            
            console.log(`[Player] [MANIFEST_FETCH_SUCCESS] v=${data.resolved?.version || 'N/A'}`)

            // ── Handling "Up to Date" response ──
            if (data.up_to_date) {
                console.log(`[Player] Content ${data.version} is up to date. Keep loop playing.`)
                setOffline(false)
                setLastSyncTime(new Date().toLocaleTimeString())
                if (phaseRef.current === 'error') setPhase('playing')
                return true
            }

            const newVersion = data.resolved?.version || null
            const wasPlaying = phase === 'playing' || phase === 'standby'
            const isSameVersion = newVersion === versionRef.current

            // ── Optimize: If version matches and we're already playing, SKIP re-render ──
            if (wasPlaying && isSameVersion && !data.force_update) {
                console.log(`[Player] Version ${newVersion} is current. Skipping manifest state update.`)
                setOffline(false)
                setLastSyncTime(new Date().toLocaleTimeString())
                if (phaseRef.current === 'error') setPhase('playing')
                return true
            }

            // ── Auto version-change detection or first load ──
            if (newVersion && newVersion !== versionRef.current) {
                console.log(`[Player] 🔄 New version/content detected: ${versionRef.current || 'init'} → ${newVersion}`)
                if (data.assets) syncAssets(data.assets)
            }

            // ── Regular Load ──
            const getIds = (m: any) => {
                if (!m?.region_playlists) return ""
                return Object.values(m.region_playlists)
                    .flatMap((list: any) => list.map((i: any) => i.playlist_item_id))
                    .join(',')
            }
            const lastIds = getIds(manifest)
            const nextIds = getIds(data)
            const hasChange = lastIds !== nextIds || versionRef.current !== newVersion

            if (wasPlaying && !hasChange && !data.force_update) {
                console.log(`[Player] Content IDs and version match. Skipping state update.`)
                setOffline(false)
                setLastSyncTime(new Date().toLocaleTimeString())
                return true
            }

            console.log(`[Player] Applying manifest update (diff detected or first load)`)
            setManifest(data)
            setVersion(newVersion)
            versionRef.current = newVersion
            localStorage.setItem(manifestKey(dc), JSON.stringify(data))
            setOffline(false)
            setLastSyncTime(new Date().toLocaleTimeString())
            if (phaseRef.current === 'error') setPhase('playing')

            if (data.assets) syncAssets(data.assets)

            const win = window as any
            if (win.AndroidHealth?.setStoreInfo) {
                win.AndroidHealth.setStoreInfo(data.device?.store_id || null, data.device?.store_name || null)
            }

            failCountRef.current = 0 // Reset failure counter on success
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

            // CORTEX: Sequential Error Counter to prevent flickering offline messages on network jitter
            // ─── BOOT-CRITICAL: DO NOT REMOVE backoff OR failCountRef >= 3 check ─────
            // failCountRef tracks sequential failures across bootFetch loop iterations.
            // The backoff spaces out retries so the Amlogic network stack has time to recover.
            // failCountRef >= 3 is the trigger for offline cache load — this is how the device
            // plays content when rebooted without network. Both pieces MUST stay together.
            // DO NOT remove the await backoff. DO NOT change the >= 3 threshold.
            // ─────────────────────────────────────────────────────────────────────────────
            failCountRef.current += 1
            const backoffMs = Math.min(1000 * Math.pow(2, failCountRef.current - 1), 15000)
            console.warn(`[Player] Manifest fetch failed (attempt ${failCountRef.current}), DC=${dc}`)
            await new Promise(r => setTimeout(r, backoffMs))

            if (failCountRef.current >= 3) {
                const cached = localStorage.getItem(manifestKey(dc))
                if (cached) {
                    try {
                        const c = JSON.parse(cached)
                        
                        // HYDRATION: Vital for reboot-without-internet
                        // This converts remote URLs back into local blob URLs from IndexedDB
                        if (c.assets) {
                            const hydrated = await hydrateAssetsFromCache(c.assets)
                            c.assets = hydrated
                        }

                        setManifest(c)
                        if (c.resolved?.version) {
                            setVersion(c.resolved.version)
                            versionRef.current = c.resolved.version
                        }
                        setOffline(true)
                        setShowOfflineIndicator(true)
                        setTimeout(() => setShowOfflineIndicator(false), 5000)
                        return true
                    } catch { /* ignore */ }
                }
            }

            // Only show a fatal error screen after 30 sequential failures and ONLY if we don't have a manifest to play from cache
            if (failCountRef.current >= 30 && !manifest) {
                setErrorMsg(err.message || 'Connecting to OmniPush Network...')
                setPhase('error')
            } else if (failCountRef.current >= 30) {
                // If we HAVE a manifest (likely playing from cache), don't jump to error phase 
                // as that blanks the screen. Just log it and keep testing the network.
                console.warn('[Player] Network down (30+ failures), but continuing playback from cache.')
            }
            return false
        }
    }, [dc, syncAssets, initPairing])

    // ── Send heartbeat ──
    const sendHeartbeat = useCallback(async (sec: string) => {
        if (!dc || !sec) return

        // ── Rendering Watchdog ──
        // If we are in 'playing' phase but haven't seen a content transition 
        // OR a video tick in a while, we might be frozen.
        // For now, we'll assume rendering is OK if phase is playing and no errors.
        if (phaseRef.current === 'playing' && consecutiveErrorsRef.current > 5) {
            isRenderingRef.current = false
        } else {
            isRenderingRef.current = true
        }

        // Gather basic hardware telemetry
        const ua = navigator.userAgent
        const meta: any = {
            is_rendering: isRenderingRef.current,
            consecutive_errors: consecutiveErrorsRef.current,
            last_media_error: lastMediaErrorRef.current,
            display_visible: document.visibilityState === 'visible',
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
                if (win.AndroidHealth.getHdmiStatus) {
                    meta.hdmi_status = String(win.AndroidHealth.getHdmiStatus()) // Should return 'connected' or 'disconnected'
                } else {
                    meta.hdmi_status = inferredHdmi;
                }
            }
        } catch (e) {
            console.warn('[Telemetry] Error gathering stats:', e)
        }

        try {
            // CORTEX: Jitter/Stagger fix for Amlogic hardware to avoid manifest/heartbeat collisions.
            // When manifest polling (every 3s) and heartbeat (every 30s) collide, the older Amlogic 
            // network stack often cancels one, resulting in 'TypeError: Failed to fetch'.
            const payload = {
                device_code: dc,
                device_secret: sec,
                current_version: 'v1.0.1+health-' + (versionRef.current || 'init'),
                status: phaseRef.current,
                ack_command_id: ackCommandIdRef.current,
                // Sanitize meta to ensure no illegal JSON values (NaN/Infinity)
                ...JSON.parse(JSON.stringify(meta, (k, v) => (typeof v === 'number' && isNaN(v)) ? null : v))
            }

            console.log('[Player] Sending heartbeat...')
            const res = await callEdgeFn('device-heartbeat', payload, 30000, false) // 30s timeout, no auth

            // If heartbeat was successful and contained an ACK for a command, we can clear the ref
            if (!res.error && ackCommandIdRef.current) {
                console.log(`[Player] Command ${ackCommandIdRef.current} ACK confirmed by server.`)
                ackCommandIdRef.current = null
            }

            if (res.error) {
                console.error('[Player] Heartbeat Server Error:', res.error)
            } else {
                console.log(`[Player] Heartbeat Recorded ✅ (${phase})`)
                lastErrorRef.current = null 
                failCountRef.current = 0 // Reset fail count
                
                // Auto-recover from error phase if heartbeat succeeds
                if (phaseRef.current === 'error') {
                    console.log('[Player] Connection restored, auto-recovering...')
                    setPhase('playing')
                }

                if (res.commands && res.commands.length > 0) {
                    processIncomingCommands(res.commands)
                }
            }
        } catch (err: any) {
            console.error('[Player] Heartbeat Network Error Detail:', err.name, '|', err.message)
            const msg = (err.message || '').toLowerCase()
            if (msg.includes('invalid credentials') || msg.includes('inactive device')) {
                localStorage.removeItem(secretKey(dc))
                localStorage.removeItem(manifestKey(dc))
                window.location.reload()
            }
        }
    }, [dc, phase])

    // ── Init: check for stored secret or URL param ──
    useEffect(() => {
        if (!dc || bootStartedRef.current) return
        bootStartedRef.current = true // Lock it immediately


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

            // ─── BOOT-CRITICAL: DO NOT SIMPLIFY OR REMOVE bootFetch LOOP ─────────────
            // This 3-attempt loop exists specifically for Amlogic Android TV boxes where
            // the network stack is not ready when the app starts after reboot.
            // Each attempt uses callEdgeFn which has a 25s manualTimeout (in supabase.ts).
            // After 3 failures, failCountRef >= 3 triggers offline cache load in fetchManifest.
            // This is the ONLY path that gets the device playing from cache when network
            // is unavailable at boot. DO NOT replace with a single fetchManifest() call.
            // DO NOT add waitForNetwork() — navigator.onLine is broken on Chromium 87.
            // DO NOT reduce loop iterations below 3.
            // ─────────────────────────────────────────────────────────────────────────────
            const bootFetch = async () => {
                await new Promise(r => setTimeout(r, 2000)) // Give Amlogic network stack more time to settle
                let bootOk = false

                // Attempt 1: Initial check
                console.log(`[Boot] Manifest attempt 1/3...`)
                if (await fetchManifest(stored, 25000)) {
                    bootOk = true
                } else {
                    // Attempt 2: Retry
                    await new Promise(r => setTimeout(r, 3000))
                    console.log(`[Boot] Manifest attempt 2/3...`)
                    if (await fetchManifest(stored, 25000)) {
                        bootOk = true
                    } else {
                        // Attempt 3: Final retry (will trigger offline cache if network still down)
                        await new Promise(r => setTimeout(r, 4000))
                        console.log(`[Boot] Manifest attempt 3/3 (Triggering offline cache check)...`)
                        if (await fetchManifest(stored, 25000)) {
                            bootOk = true
                        }
                    }
                }

                if (bootOk) {
                    setPhase(p => p === 'standby' ? 'standby' : 'playing')
                } else {
                    // If even the 3rd attempt (cache) fails, show error
                    setPhase('error')
                }
            }

            bootFetch()
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
            if (isTransitioningRef.current) return
            const ok = await fetchManifest(secretRef.current)
            if (ok && phase === 'standby') setPhase('playing')
        }, pollMs)

        // ─── STAGGERED HEARTBEAT FIX ──────────────────────────────────────────
        // Stagger heartbeat by 15s to ensure it perfectly alternates with 
        // the 3s manifest poll on older Amlogic devices.
        const staggerMs = 15000 + (Math.random() * 5000) // Add 5s jitter
        const startHeartbeat = () => {
            hbTimerRef.current = setInterval(() => {
                sendHeartbeat(secretRef.current)
            }, HEARTBEAT_INTERVAL_MS)
        }

        const initialHbTimeout = setTimeout(() => {
            sendHeartbeat(secretRef.current)
            startHeartbeat()
        }, staggerMs)

        return () => {
            if (manifestTimerRef.current) clearInterval(manifestTimerRef.current)
            if (hbTimerRef.current) clearInterval(hbTimerRef.current)
            clearTimeout(initialHbTimeout)
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
                            setShowLogs(false)
                        }} style={btnStyle('rgba(255,255,255,0.05)', '#94a3b8')}>
                            🔍 Debug Manifest
                        </button>
                        <button onClick={() => {
                            setShowLogs(true)
                            setShowDebugManifest(false)
                        }} style={btnStyle('rgba(255,255,255,0.05)', '#f1f5f9')}>
                            📄 View Logs
                        </button>
                        <button onClick={() => {
                            window.dispatchEvent(new CustomEvent('omnipush_force_play'))
                            setShowAdminPanel(false)
                        }} style={btnStyle('#14532d', '#86efac')}>
                            ▶ Force Play (Reset Logic)
                        </button>
                    </div>

                    {showDebugManifest && (
                        <div style={{ padding: '0 2rem 1.5rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.5rem' }}>INTERNAL MANIFEST STATE</div>
                            <pre style={{
                                flex: 1, background: '#020617', padding: '1rem', borderRadius: 8,
                                fontSize: '0.65rem', color: '#64748b', fontFamily: 'monospace',
                                border: '1px solid #1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                overflowY: 'auto'
                            }}>
                                {debugJSON}
                            </pre>
                            <button onClick={() => setShowDebugManifest(false)} style={{ marginTop: '0.75rem', padding: '0.6rem', borderRadius: 6, background: '#1e293b', color: 'white', border: 'none', cursor: 'pointer' }}>Close</button>
                        </div>
                    )}

                    {showLogs && (
                        <div style={{ padding: '0 2rem 1.5rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '0.7rem', color: '#475569', marginBottom: '0.5rem' }}>DEVICE DIAGNOSTIC LOGS (Last 50)</div>
                            <div style={{
                                flex: 1, background: '#020617', padding: '1rem', borderRadius: 8,
                                fontSize: '0.65rem', color: '#94a3b8', fontFamily: 'monospace',
                                border: '1px solid #1e293b', overflowY: 'auto'
                            }}>
                                {consoleLogs.length === 0 ? "No logs available yet." : consoleLogs.map((log, i) => (
                                    <div key={i} style={{ borderBottom: '1px solid #0f172a', padding: '2px 0', color: log.includes('ERR') ? '#ef4444' : log.includes('WARN') ? '#f59e0b' : '#94a3b8' }}>
                                        {log}
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setShowLogs(false)} style={{ marginTop: '0.75rem', padding: '0.6rem', borderRadius: 6, background: '#1e293b', color: 'white', border: 'none', cursor: 'pointer' }}>Close</button>
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
            return <LoadingState />
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
                width: '100%',
                height: '100%',
                background: (isAndroidNative && phase === 'playing') ? 'transparent' : '#000',
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
                            isNative={isAndroidNative}
                            showDebug={showDebugOverlay}
                            deviceCode={dc}
                            consecutiveErrorsRef={consecutiveErrorsRef}
                            lastMediaErrorRef={lastMediaErrorRef}
                        />
                    )
                })}

                {/* Overlays */}
                {offline && (
                    <div style={{
                        position: 'fixed',
                        top: 32,
                        right: 32,
                        zIndex: 10000,
                        color: '#ef4444',
                        opacity: 0.6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                    }}>
                        <WifiOff size={32} strokeWidth={2.5} />
                    </div>
                )}
                <style>{`
                    @keyframes slideIn {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    @keyframes pulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(1.1); opacity: 0.8; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                `}</style>
            </div>
        )
    }

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', overflow: 'hidden', background: (isAndroidNative && phase === 'playing') ? 'transparent' : '#000', touchAction: 'none' }}>
            {renderMain()}
            {cornerTapZone}
            
            {/* Debug Tap Zone (Top-Right) */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    if (offline) {
                        setShowOfflineIndicator(true);
                        setTimeout(() => setShowOfflineIndicator(false), 5000);
                    }
                    handleDebugCornerTap();
                }}
                style={{
                    position: 'fixed', top: 0, right: 0,
                    width: 120, height: 120, zIndex: 9999999,
                    cursor: 'pointer',
                }}
            />

            {/* Debug Overlay UI */}
            {showDebugOverlay && (
                <div style={{
                    position: 'fixed', bottom: 10, right: 10, zIndex: 100000,
                    background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                    padding: '8px 12px', minWidth: 180, pointerEvents: 'none',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                }}>
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 6, paddingBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>📡 Debug Info</span>
                        <span style={{ fontSize: '0.6rem', color: offline ? '#ef4444' : '#22c55e', fontWeight: 700 }}>{offline ? 'OFFLINE' : 'ONLINE'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 12px', fontSize: '10px', fontFamily: 'monospace' }}>
                        <span style={{ color: '#64748b' }}>Last Sync:</span>
                        <span style={{ color: '#f1f5f9', textAlign: 'right' }}>{lastSyncTime}</span>
                        <span style={{ color: '#64748b' }}>Media:</span>
                        <span style={{ color: '#f1f5f9', textAlign: 'right' }}>{manifest?.assets?.length || 0} assets</span>
                        <span style={{ color: '#64748b' }}>Items:</span>
                        <span style={{ color: '#f1f5f9', textAlign: 'right' }}>{Object.values(manifest?.region_playlists || {}).flat().length} in plyst</span>
                        <span style={{ color: '#64748b' }}>Env/UA:</span>
                        <span style={{ color: '#f1f5f9', textAlign: 'right' }}>Signage Web-V1</span>
                    </div>
                    {remoteLogs.length > 0 && remoteLogs[0].type === 'error' && (
                        <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', color: '#ef4444', fontSize: '9px', fontStyle: 'italic' }}>
                            ⚠️ {remoteLogs[0].msg.slice(0, 50)}...
                        </div>
                    )}
                </div>
            )}

            <AdminPanel />
        </div>
    )
}
