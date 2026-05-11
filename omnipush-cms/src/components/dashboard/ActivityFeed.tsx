import React, { useEffect, useState } from 'react'
import { Zap, Monitor, Upload, Clock, Activity } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDistanceToNow } from 'date-fns'

interface ActivityItem {
    id: string
    type: 'published' | 'device_seen' | 'media_uploaded'
    label: string
    sub: string
    time: string
    icon: React.ReactNode
}

const TYPE_COLOR: Record<ActivityItem['type'], string> = {
    published:      'var(--color-accent)',
    device_seen:    '#22c55e',
    media_uploaded: '#f59e0b',
}

export default function ActivityFeed({ tenantId }: { tenantId: string }) {
    const [items, setItems] = useState<ActivityItem[]>([])
    const [loading, setLoading] = useState(true)

    async function load() {
        if (!tenantId) return
        try {
            const [pubRes, mediaRes, hbRes] = await Promise.all([
                supabase
                    .from('layout_publications')
                    .select('id, published_at, scope')
                    .eq('tenant_id', tenantId)
                    .eq('is_active', true)
                    .order('published_at', { ascending: false })
                    .limit(5),
                supabase
                    .from('media_assets')
                    .select('id, file_name, created_at, type')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(5),
                // No .eq('tenant_id') here: device_heartbeats has no tenant_id column.
                // Tenant isolation is enforced by the RLS policy, which JOINs through
                // public.devices (device_heartbeats.device_id → devices.tenant_id).
                supabase
                    .from('device_heartbeats')
                    .select('id, device_code, last_seen_at, status')
                    .order('last_seen_at', { ascending: false })
                    .limit(10),
            ])

            const activity: ActivityItem[] = []

            for (const pub of pubRes.data || []) {
                activity.push({
                    id: `pub-${pub.id}`,
                    type: 'published',
                    label: 'Content published',
                    sub: pub.scope || 'Layout updated',
                    time: pub.published_at,
                    icon: <Zap size={14} />,
                })
            }

            for (const media of mediaRes.data || []) {
                activity.push({
                    id: `media-${media.id}`,
                    type: 'media_uploaded',
                    label: 'Media uploaded',
                    sub: (media as any).file_name || (media as any).type || 'New asset',
                    time: media.created_at,
                    icon: <Upload size={14} />,
                })
            }

            for (const hb of hbRes.data || []) {
                if (hb.status === 'playing' || hb.status === 'online') {
                    activity.push({
                        id: `hb-${hb.id}`,
                        type: 'device_seen',
                        label: hb.device_code,
                        sub: hb.status === 'playing' ? 'Now playing' : 'Came online',
                        time: hb.last_seen_at,
                        icon: <Monitor size={14} />,
                    })
                }
            }

            activity.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            setItems(activity.slice(0, 10))
        } catch (err) {
            console.error('[ActivityFeed] load error:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
        const interval = setInterval(load, 30000)
        return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId])

    return (
        <div style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', fontSize: '0.9375rem', fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} style={{ color: 'var(--color-accent)' }} />
                Recent Activity
            </div>

            <div style={{ padding: '0.75rem' }}>
                {loading ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Loading…</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>No recent activity.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {items.map(item => (
                            <div
                                key={item.id}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px', borderRadius: '8px', transition: 'background 0.15s' }}
                                onMouseOver={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'}
                                onMouseOut={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                            >
                                <div style={{ width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0, background: `${TYPE_COLOR[item.type]}18`, color: TYPE_COLOR[item.type], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {item.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.label}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.sub}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px', color: 'var(--color-text-muted)', fontSize: '0.6875rem' }}>
                                        <Clock size={10} />
                                        {formatDistanceToNow(new Date(item.time), { addSuffix: true })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
