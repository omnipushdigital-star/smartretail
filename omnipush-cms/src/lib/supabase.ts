import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qxialnmorewjgpmpcswr.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw'

// Detect if running on an Android WebView / Signage device to optimize network behavior
const isHardwarePlayer = navigator.userAgent.toLowerCase().includes('android') ||
    window.location.pathname.startsWith('/player/');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'public' },
    auth: {
        persistSession: !isHardwarePlayer,
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
})

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * callEdgeFn: Robust wrapper for Supabase Edge Functions with timeout.
 * Uses direct fetch() to avoid supabase.functions.invoke wrapping errors.
 */
export async function callEdgeFn(fnName: string, payload: any, timeoutMs = 30000, useAuth = true): Promise<any> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        let authToken = SUPABASE_ANON_KEY
        if (useAuth) {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.access_token) authToken = session.access_token
            } catch (e) {
                console.warn(`[EdgeFn] Session fetch failed for ${fnName}, using anon key`)
            }
        }

        const url = `${SUPABASE_URL}/functions/v1/${fnName}`
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${authToken}`,
                'x-app-version': '1.0.0',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        })

        clearTimeout(timer)

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
            const msg = data?.error || `Server error ${response.status}`
            console.error(`[EdgeFn] ${fnName} HTTP ${response.status}:`, msg)
            return { error: msg }
        }

        return data
    } catch (err: any) {
        clearTimeout(timer)
        if (err.name === 'AbortError') {
            console.warn(`[EdgeFn] ${fnName} timed out after ${timeoutMs}ms`)
            return { error: 'Request timed out' }
        }
        console.error(`[EdgeFn] ${fnName} network error:`, err.message)
        return { error: `Cannot reach server — check if Supabase project is active` }
    }
}
