import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://qxialnmorewjgpmpcswr.supabase.co'
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw'

// Detect if running on an Android WebView / Signage device to optimize network behavior
const isHardwarePlayer = navigator.userAgent.toLowerCase().includes('android') ||
    window.location.pathname.startsWith('/player/');

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'public' },
    auth: {
        persistSession: !isHardwarePlayer, // Disable persistence on hardware players if storage is restricted
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
    global: {
        headers: { 'x-app-version': '1.0.0' },
        fetch: (...args) => {
            return fetch(...args).catch(err => {
                console.warn('[Supabase] Network error:', err.message)
                throw err;
            });
        }
    },
})

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function callEdgeFn(fn: string, body: object): Promise<any> {
    const controller = new AbortController()
    // abort fires at 28s — AFTER manualTimeout wins the race at 25s
    // This ordering is critical for Chromium 87 where abort() silently hangs
    const timeoutId = setTimeout(() => controller.abort(), 28000)

    try {
        const { data: { session } } = await supabase.auth.getSession()
        const authHeader = session?.access_token
            ? `Bearer ${session.access_token}`
            : `Bearer ${SUPABASE_ANON_KEY}`

        const fetchPromise = fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'apikey': SUPABASE_ANON_KEY!,
                'x-client-info': 'omnipush-player/1.0.0',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        })

        // manualTimeout fires at 25s — strictly BEFORE controller.abort() at 28s
        // On Chromium 87, abort() blackholes silently so manualTimeout MUST win the race
        // 25s is enough for any legitimate slow network; 3s gap guarantees JS resolves this first
        const manualTimeout = new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timed out.')), 25000)
        );

        const res = await Promise.race([fetchPromise, manualTimeout]);
        clearTimeout(timeoutId)

        const text = await res.text()
        const json = text ? JSON.parse(text) : null

        if (!res.ok) {
            // If the function returned a structured JSON error, always use it first
            if (json?.error) {
                const err = new Error(json.error) as any
                err.data = json  // attach full response for debug
                err.status = res.status
                throw err
            }
            // Only show "not deployed" if it's a gateway-level 404 with no body
            if (res.status === 404) {
                throw new Error(`Edge Function "${fn}" is not deployed or cannot be found.`)
            }
            throw new Error(`Server error (HTTP ${res.status})`)
        }
        return json
    } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError' || err.message === 'Connection timed out.') {
            throw new Error('Connection timed out.')
        }
        throw err
    }
}
