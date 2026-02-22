import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Tv2, WifiOff, Clock } from 'lucide-react'

interface PlayerInfo {
    store?: string
    role?: string
    layoutName?: string
    playlistName?: string
    bundleVersion?: string
}

function LiveClock() {
    const [time, setTime] = useState(new Date())
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(t)
    }, [])
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)', fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)' }}>
            <Clock size={14} />
            {time.toLocaleTimeString()} — {time.toLocaleDateString()}
        </div>
    )
}

export default function PlayerPage() {
    const { device_code } = useParams<{ device_code: string }>()
    const [info, setInfo] = useState<PlayerInfo>({})
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!device_code) return

        async function load() {
            try {
                // Fetch device
                const { data: device, error: devErr } = await supabase
                    .from('devices')
                    .select('*, store:stores(name), role:roles(name)')
                    .eq('device_code', device_code)
                    .single()

                if (devErr || !device) { setError(true); setLoading(false); return }

                const playerInfo: PlayerInfo = {
                    store: (device as any).store?.name,
                    role: (device as any).role?.name,
                }

                // Try to get effective layout via rules (simple GLOBAL first)
                const { data: rules } = await supabase
                    .from('rules')
                    .select('*, layout:layouts(id,name)')
                    .eq('enabled', true)
                    .order('priority', { ascending: false })

                if (rules && rules.length > 0) {
                    // Simple: find first matching rule
                    const matched = rules.find(r => {
                        if (r.target_type === 'GLOBAL') return true
                        if (r.target_type === 'DEVICE' && r.target_id === device.id) return true
                        if (r.target_type === 'STORE' && r.target_id === device.store_id) return true
                        if (r.target_type === 'ROLE' && r.target_id === device.role_id) return true
                        return false
                    })
                    if (matched?.layout) {
                        playerInfo.layoutName = (matched as any).layout.name
                        // Get the publication
                        const { data: pub } = await supabase
                            .from('layout_publications')
                            .select('*, bundle:bundles(version)')
                            .eq('layout_id', (matched as any).layout.id)
                            .single()
                        if (pub) {
                            playerInfo.bundleVersion = (pub as any).bundle?.version
                        }
                        // Get playlist
                        const { data: regions } = await supabase
                            .from('layout_region_playlists')
                            .select('*, playlist:playlists(name)')
                            .eq('layout_id', (matched as any).layout.id)
                            .eq('region_id', 'full')
                            .single()
                        if (regions) {
                            playerInfo.playlistName = (regions as any).playlist?.name
                        }
                    }
                }

                setInfo(playerInfo)
                setError(false)

                // Send heartbeat
                await supabase.from('device_heartbeats').insert({
                    device_id: device.id,
                    device_code: device_code,
                    last_seen_at: new Date().toISOString(),
                    current_version: playerInfo.bundleVersion || null,
                    status: 'online',
                })
            } catch (e) {
                setError(true)
            }
            setLoading(false)
        }

        load()
        const interval = setInterval(async () => {
            // Periodic heartbeat
            await supabase.from('device_heartbeats').insert({
                device_code: device_code!,
                last_seen_at: new Date().toISOString(),
                status: 'online',
            })
        }, 60000)
        return () => clearInterval(interval)
    }, [device_code])

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'linear-gradient(135deg, #020617 0%, #0f172a 60%, #1a1a5c 100%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: 'white', overflow: 'hidden'
        }}>
            {/* Ambient orbs */}
            <div style={{ position: 'absolute', top: '15%', left: '10%', width: 500, height: 500, borderRadius: '50%', background: 'rgba(90,100,246,0.06)', filter: 'blur(100px)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(67,71,234,0.05)', filter: 'blur(80px)', pointerEvents: 'none' }} />

            {/* Offline banner */}
            {error && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    background: 'rgba(239,68,68,0.9)', padding: '0.75rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    fontSize: '0.875rem', fontWeight: 500, zIndex: 10
                }}>
                    <WifiOff size={16} />
                    Offline / Reconnecting… Check device registration.
                </div>
            )}

            {/* Main content */}
            <div style={{ textAlign: 'center', padding: '2rem', position: 'relative', zIndex: 1 }}>
                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '3rem' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: 'linear-gradient(135deg, #5a64f6, #4347ea)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 32px rgba(90,100,246,0.5)'
                    }}>
                        <Tv2 size={28} color="white" />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', color: '#f1f5f9' }}>OmniPush</div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>Retail Display System</div>
                    </div>
                </div>

                {loading ? (
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem' }}>Connecting to network…</div>
                ) : (
                    <>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 4rem)', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.1, marginBottom: '1rem' }}>
                            OmniPush Player
                        </div>
                        <div style={{ fontSize: 'clamp(0.875rem, 2vw, 1.25rem)', color: 'rgba(255,255,255,0.5)', marginBottom: '3rem', fontFamily: 'monospace' }}>
                            Device: <span style={{ color: '#7a8aff', fontWeight: 600 }}>{device_code}</span>
                        </div>

                        {/* Info cards */}
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2rem' }}>
                            {info.store && (
                                <InfoCard label="Store" value={info.store} />
                            )}
                            {info.role && (
                                <InfoCard label="Screen Role" value={info.role} />
                            )}
                            {info.layoutName && (
                                <InfoCard label="Layout" value={info.layoutName} />
                            )}
                            {info.playlistName && (
                                <InfoCard label="Playlist" value={info.playlistName} />
                            )}
                            {info.bundleVersion && (
                                <InfoCard label="Bundle" value={info.bundleVersion} accent />
                            )}
                        </div>

                        {!info.store && !error && (
                            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                This device has not been configured. Please assign it a store and role in the Admin CMS.
                            </div>
                        )}

                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 1rem', borderRadius: 999,
                            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                            color: '#22c55e', fontSize: '0.8125rem'
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
                            Player Ready · Full-screen playback mode coming soon
                        </div>
                    </>
                )}
            </div>

            {/* Bottom bar */}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '0.75rem 1.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)',
                borderTop: '1px solid rgba(255,255,255,0.05)'
            }}>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                    OmniPush Digital Services
                </div>
                <LiveClock />
            </div>
        </div>
    )
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${accent ? 'rgba(90,100,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 12, padding: '0.75rem 1.25rem', minWidth: 140, textAlign: 'center'
        }}>
            <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: '0.375rem' }}>{label}</div>
            <div style={{ fontWeight: 600, color: accent ? '#7a8aff' : '#f1f5f9', fontSize: '0.9375rem' }}>{value}</div>
        </div>
    )
}
