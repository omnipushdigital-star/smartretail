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
    global: {
        headers: { 'x-app-version': '1.0.0' },
    },
})

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

/**
 * callEdgeFn: Robust wrapper for Supabase Edge Functions with multi-layer timeout
 * specially tuned for legacy Android WebView (Chromium 87).
 */
export async function callEdgeFn(fnName: string, payload: any, timeoutMs = 30000, useAuth = true): Promise<any> {
    try {
        const controller = new AbortController()
        let authHeader = SUPABASE_ANON_KEY

        if (useAuth) {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.access_token) authHeader = session.access_token
            } catch (e) {
                console.warn(`[Supabase] Session fetch failed for ${fnName}, falling back to Anon Key`)
            }
        }

        let hasResolved = false
        const manualTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => {
                if (!hasResolved) {
                    controller.abort() 
                    reject(new Error('OMNIPUSH_TIMEOUT'))
                }
            }, timeoutMs)
        )

        const fetchPromise = supabase.functions.invoke(fnName, {
            body: payload,
            headers: {
                'x-app-version': '1.0.0',
                ...(useAuth ? { 'Authorization': `Bearer ${authHeader}` } : {})
            },
            signal: controller.signal
        })

        const res = await Promise.race([fetchPromise, manualTimeout]) as any
        hasResolved = true

        if (res.error) {
            console.error(`[EdgeFn] ${fnName} internal error:`, res.error)
            return { error: String(res.error) }
        }

        return res.data
    } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'OMNIPUSH_TIMEOUT') {
            console.warn(`[EdgeFn] ${fnName} timed out after ${timeoutMs}ms`)
            return { error: 'Request timed out' }
        }
        console.error(`[EdgeFn] ${fnName} network error:`, err.message)
        return { error: err.message || 'Unknown network error' }
    }
}
