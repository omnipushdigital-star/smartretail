// src/utils/deviceState.ts
// Shared device-state logic used by DashboardPage and DevicesPage.

export type DeviceState = 'playing' | 'idle' | 'stale' | 'offline'

export const FRESH_THRESHOLD_MS = 2 * 60 * 1000   // < 2 min  → online
export const STALE_THRESHOLD_MS = 5 * 60 * 1000   // 2–5 min  → stale; > 5 min → offline

export interface StateConfig {
    dot: string
    label: string
    bg: string
    text: string
}

export const STATE_CONFIG: Record<DeviceState, StateConfig> = {
    playing: { dot: '#22c55e', label: 'Playing',           bg: 'rgba(34,197,94,0.1)',  text: '#22c55e' },
    idle:    { dot: '#f59e0b', label: 'Idle / No Content', bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
    stale:   { dot: '#3b82f6', label: 'Stale',             bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
    offline: { dot: '#ef4444', label: 'Offline',           bg: 'rgba(239,68,68,0.1)',  text: '#ef4444' },
}

/**
 * Derive the 4-state device status from heartbeat data.
 * @param lastSeen  ISO timestamp string from device_heartbeats.last_seen_at
 * @param status    Raw status string from device_heartbeats.status (e.g. 'playing')
 */
export function getDeviceState(
    lastSeen: string | null | undefined,
    status: string | null | undefined
): DeviceState {
    if (!lastSeen) return 'offline'
    try {
        const age = Date.now() - new Date(lastSeen).getTime()
        if (age > STALE_THRESHOLD_MS) return 'offline'
        if (age > FRESH_THRESHOLD_MS) return 'stale'
        return status === 'playing' ? 'playing' : 'idle'
    } catch {
        return 'offline'
    }
}
