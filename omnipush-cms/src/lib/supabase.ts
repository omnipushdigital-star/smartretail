import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://qxialnmorewjgpmpcswr.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aWFsbm1vcmV3amdwbXBjc3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODE0MTcsImV4cCI6MjA4NzM1NzQxN30.lVAQwqlWNURA2b7jfaL46OaU69BG5h1VOBQLT-8ZzJw'

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
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        })
        clearTimeout(timeoutId)

        const text = await res.text()
        const json = text ? JSON.parse(text) : null

        if (!res.ok) {
            if (res.status === 404) {
                throw new Error(`Edge Function "${fn}" is not deployed. Please follow the instructions in the Developer Portal.`)
            }
            throw new Error(json?.error || `Server error (HTTP ${res.status})`)
        }
        return json
    } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') throw new Error('Connection timed out.')
        throw err
    }
}
