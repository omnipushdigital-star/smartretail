export interface Tenant {
    id: string
    name: string
    slug: string
    active: boolean
    created_at: string
    updated_at: string
}

export interface Store {
    id: string
    tenant_id: string
    code: string
    name: string
    timezone: string
    active: boolean
    created_at: string
    updated_at: string
}

export interface Role {
    id: string
    tenant_id: string
    name: string
    description?: string
    created_at: string
    updated_at: string
    device_count?: number
}

export interface Device {
    id: string
    tenant_id: string
    store_id?: string
    role_id?: string
    device_code: string
    device_secret: string
    display_name?: string
    orientation: 'landscape' | 'portrait'
    resolution: string
    active: boolean
    created_at: string
    updated_at: string
    store?: Store
    role?: Role
    last_heartbeat?: DeviceHeartbeat
}

export interface MediaAsset {
    id: string
    tenant_id: string
    name: string
    type: 'image' | 'video' | 'web_url'
    storage_path?: string
    url?: string
    bytes?: number
    checksum_sha256?: string
    tags: string[]
    created_at: string
    updated_at: string
}

export interface Playlist {
    id: string
    tenant_id: string
    name: string
    description?: string
    created_at: string
    updated_at: string
    items?: PlaylistItem[]
}

export interface PlaylistItem {
    id: string
    playlist_id: string
    media_id?: string
    type: 'image' | 'video' | 'web_url'
    web_url?: string
    duration_seconds?: number
    sort_order: number
    created_at: string
    updated_at: string
    media?: MediaAsset
}

export interface LayoutTemplate {
    id: string
    tenant_id: string
    name: string
    description?: string
    is_default: boolean
    regions: Region[]
    created_at: string
    updated_at: string
}

export interface Region {
    id: string
    label: string
    x: number
    y: number
    width: number
    height: number
}

export interface Layout {
    id: string
    tenant_id: string
    name: string
    template_id?: string
    created_at: string
    updated_at: string
    template?: LayoutTemplate
    region_playlists?: LayoutRegionPlaylist[]
}

export interface LayoutRegionPlaylist {
    id: string
    layout_id: string
    region_id: string
    playlist_id?: string
    created_at: string
    playlist?: Playlist
}

export interface Rule {
    id: string
    tenant_id: string
    name: string
    enabled: boolean
    priority: number
    target_type: 'GLOBAL' | 'STORE' | 'ROLE' | 'DEVICE'
    target_id?: string
    layout_id?: string
    created_at: string
    updated_at: string
    layout?: Layout
    schedules?: RuleSchedule[]
}

export interface RuleSchedule {
    id: string
    rule_id: string
    days_mask: number
    start_time?: string
    end_time?: string
    date_from?: string
    date_to?: string
    created_at: string
}

export interface Bundle {
    id: string
    tenant_id: string
    version: string
    notes?: string
    created_at: string
    files?: BundleFile[]
}

export interface BundleFile {
    id: string
    bundle_id: string
    media_id: string
    created_at: string
    media?: MediaAsset
}

export interface LayoutPublication {
    id: string
    layout_id: string
    bundle_id: string
    published_at: string
    layout?: Layout
    bundle?: Bundle
}

export interface DeviceHeartbeat {
    id: string
    device_id?: string
    device_code: string
    last_seen_at: string
    current_version?: string
    ip_address?: string
    status: string
    created_at: string
}
