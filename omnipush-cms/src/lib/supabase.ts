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

// ─── BOOT-CRITICAL: DO NOT MODIFY TIMEOUT VALUES ──────────────────────────
// Root cause fix for Amlogic Android TV box (Chromium 87) boot freeze.
// Chromium 87 has a silent blackhole bug where AbortController.abort() fires
// but the fetch promise NEVER resolves or rejects — hanging the JS thread.
// Fix: manualTimeout (25s) MUST fire strictly before controller.abort() (28s)
// so that Promise.race() resolves via the JS timer, bypassing the broken abort.
// DO NOT change 25000 or 28000. DO NOT make them equal. DO NOT remove manualTimeout.
// Tested on: Amlogic S905W2 / Android 11 / Chromium 87 / Android Studio emulator.
// ─────────────────────────────────────────────────────────────────────────────
export async function callEdgeFn(fn: string, body: object): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 28000) // MUST be > 25000

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

        // BOOT-CRITICAL: manualTimeout MUST fire at 25s, strictly before abort() at 28s.
        // This is the ONLY reliable way to unblock a hung fetch on Chromium 87 WebView.
        // DO NOT change this value. DO NOT remove this. DO NOT make equal to timeoutId.
        const manualTimeout = new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timed out.')), 25000)
        )

        const res = await Promise.race([fetchPromise, manualTimeout])
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
