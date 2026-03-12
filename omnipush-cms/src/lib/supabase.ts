import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'public' },
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
    },
    global: {
        headers: { 'x-app-version': '1.0.0' },
    },
})

export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

export async function callEdgeFn(fn: string, body: object): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
        const { data: { session } } = await supabase.auth.getSession()
        const authHeader = session?.access_token
            ? `Bearer ${session.access_token}`
            : `Bearer ${SUPABASE_ANON_KEY}`

        const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        })
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
        if (err.name === 'AbortError') throw new Error('Connection timed out.')
        throw err
    }
}
