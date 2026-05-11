import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Monitor, Image as ImageIcon, ListVideo, X, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'

interface ResultItem {
    id: string
    label: string
    sub?: string
    type: 'device' | 'media' | 'playlist'
    href: string
}

const TYPE_CONFIG = {
    device: { label: 'Devices', icon: Monitor, color: 'var(--color-info)' },
    media: { label: 'Media', icon: ImageIcon, color: 'var(--color-warning)' },
    playlist: { label: 'Playlists', icon: ListVideo, color: 'var(--color-success)' },
} as const

interface Props {
    open: boolean
    onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
    const navigate = useNavigate()
    const { currentTenantId } = useTenant()
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<ResultItem[]>([])
    const [loading, setLoading] = useState(false)
    const [activeIdx, setActiveIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setQuery('')
            setResults([])
            setActiveIdx(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [open])

    const search = useCallback(async (q: string) => {
        if (!currentTenantId || q.trim().length < 1) {
            setResults([])
            return
        }
        setLoading(true)
        try {
            const term = `%${q.trim()}%`
            const [devRes, mediaRes, plRes] = await Promise.all([
                supabase
                    .from('devices')
                    .select('id, device_code, display_name, store:stores(name)')
                    .eq('tenant_id', currentTenantId)
                    .is('deleted_at', null)
                    .or(`device_code.ilike.${term},display_name.ilike.${term}`)
                    .limit(5),
                supabase
                    .from('media_assets')
                    .select('id, name, type')
                    .eq('tenant_id', currentTenantId)
                    .ilike('name', term)
                    .limit(5),
                supabase
                    .from('playlists')
                    .select('id, name')
                    .eq('tenant_id', currentTenantId)
                    .ilike('name', term)
                    .limit(5),
            ])
            const items: ResultItem[] = [
                ...(devRes.data || []).map(d => ({
                    id: d.id,
                    label: d.display_name || d.device_code,
                    sub: `${d.device_code}${(d as any).store?.name ? ` · ${(d as any).store.name}` : ''}`,
                    type: 'device' as const,
                    href: '/admin/devices',
                })),
                ...(mediaRes.data || []).map(m => ({
                    id: m.id,
                    label: m.name,
                    sub: m.type,
                    type: 'media' as const,
                    href: '/admin/media',
                })),
                ...(plRes.data || []).map(p => ({
                    id: p.id,
                    label: p.name,
                    type: 'playlist' as const,
                    href: '/admin/playlists',
                })),
            ]
            setResults(items)
            setActiveIdx(0)
        } catch {
            setResults([])
        } finally {
            setLoading(false)
        }
    }, [currentTenantId])

    // Debounce search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => search(query), 200)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [query, search])

    const go = (item: ResultItem) => {
        navigate(item.href)
        onClose()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIdx(i => Math.min(i + 1, results.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIdx(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (results[activeIdx]) go(results[activeIdx])
        } else if (e.key === 'Escape') {
            onClose()
        }
    }

    if (!open) return null

    // Group results by type
    const grouped = (['device', 'media', 'playlist'] as const).map(type => ({
        type,
        items: results.filter(r => r.type === type),
    })).filter(g => g.items.length > 0)

    // Flat index for keyboard navigation
    let flatIdx = 0

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '10vh',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div
                style={{
                    width: '100%', maxWidth: 560,
                    background: 'var(--color-surface-1)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 16,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                }}
                onKeyDown={handleKeyDown}
            >
                {/* Search input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
                    {loading
                        ? <Loader2 size={18} style={{ color: 'var(--color-accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                        : <Search size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    }
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search devices, media, playlists…"
                        style={{
                            flex: 1, background: 'none', border: 'none', outline: 'none',
                            fontSize: '1rem', color: 'var(--color-text-primary)',
                        }}
                    />
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '0.25rem' }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Results */}
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {query.length === 0 ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                            Type to search devices, media, and playlists
                        </div>
                    ) : results.length === 0 && !loading ? (
                        <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                            No results for "{query}"
                        </div>
                    ) : (
                        <div style={{ padding: '0.5rem' }}>
                            {grouped.map(group => {
                                const cfg = TYPE_CONFIG[group.type]
                                const Icon = cfg.icon
                                return (
                                    <div key={group.type} style={{ marginBottom: '0.25rem' }}>
                                        {/* Group header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.375rem 0.625rem',
                                            fontSize: '0.7rem', fontWeight: 700,
                                            color: 'var(--color-text-muted)',
                                            textTransform: 'uppercase', letterSpacing: '0.08em'
                                        }}>
                                            <Icon size={12} style={{ color: cfg.color }} />
                                            {cfg.label}
                                        </div>
                                        {group.items.map(item => {
                                            const isActive = flatIdx === activeIdx
                                            const currentFlatIdx = flatIdx++
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => go(item)}
                                                    onMouseEnter={() => setActiveIdx(currentFlatIdx)}
                                                    style={{
                                                        width: '100%', textAlign: 'left',
                                                        padding: '0.625rem 0.875rem',
                                                        borderRadius: 8, border: 'none', cursor: 'pointer',
                                                        background: isActive ? 'var(--color-surface-2)' : 'transparent',
                                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                        transition: 'background 0.1s',
                                                    }}
                                                >
                                                    <Icon size={15} style={{ color: cfg.color, flexShrink: 0 }} />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ color: 'var(--color-text-primary)', fontSize: '0.875rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.label}
                                                        </div>
                                                        {item.sub && (
                                                            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                                                                {item.sub}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>↵</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '0.625rem 1rem', borderTop: '1px solid var(--color-border)',
                    display: 'flex', gap: '1rem', fontSize: '0.7rem', color: 'var(--color-text-muted)'
                }}>
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>Esc Close</span>
                </div>
            </div>
        </div>
    )
}
