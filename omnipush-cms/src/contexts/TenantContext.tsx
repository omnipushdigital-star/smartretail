import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, DEFAULT_TENANT_ID } from '../lib/supabase'

interface Tenant {
    id: string;
    name: string;
    settings: any;
}

interface TenantContextValue {
    currentTenantId: string;
    currentTenant: Tenant | null;
    tenants: Tenant[];
    loading: boolean;
    switchTenant: (id: string) => void;
    refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({ children }: { children: React.ReactNode }) {
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
        return localStorage.getItem('omnipush_tenant_id') || DEFAULT_TENANT_ID
    })
    const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const initializeTenant = async () => {
            // Priority 1: Check Supabase session first
            const { data: { session } } = await supabase.auth.getSession()
            const metaTenantId = session?.user?.user_metadata?.tenant_id || session?.user?.app_metadata?.tenant_id

            if (metaTenantId) {
                console.log('[TenantContext] Found tenant_id in user metadata:', metaTenantId)
                setCurrentTenantId(metaTenantId)
                localStorage.setItem('omnipush_tenant_id', metaTenantId)
            }

            await fetchTenants(metaTenantId)
        }

        initializeTenant()
    }, [])

    useEffect(() => {
        const tenant = tenants.find(t => t.id === currentTenantId)
        if (tenant) {
            setCurrentTenant(tenant)
        }
        if (currentTenantId !== DEFAULT_TENANT_ID) {
            localStorage.setItem('omnipush_tenant_id', currentTenantId)
        }
    }, [currentTenantId, tenants])

    async function fetchTenants(priorityId?: string) {
        try {
            setLoading(true)
            console.log('[TenantContext] Fetching active tenants...')
            const { data, error } = await supabase
                .from('tenants')
                .select('id, name, settings')
                .eq('active', true)

            if (error) throw error

            if (data && data.length > 0) {
                setTenants(data)

                // Priority Order: 
                // 1. the priorityId passed (from user session)
                // 2. localStorage
                // 3. Current state
                // 4. Fallback to first in list
                const storedId = localStorage.getItem('omnipush_tenant_id')
                const targetId = priorityId || storedId || currentTenantId

                const active = data.find(t => t.id === targetId) || data[0]
                if (active) {
                    console.log('[TenantContext] Activating tenant:', active.name, '(', active.id, ')')
                    setCurrentTenantId(active.id)
                    setCurrentTenant(active)
                    localStorage.setItem('omnipush_tenant_id', active.id)
                }
            } else {
                console.warn('[TenantContext] No active tenants found. Using default.')
                const fallback = { id: DEFAULT_TENANT_ID, name: 'Root Instance', settings: {} }
                setTenants([fallback])
                setCurrentTenant(fallback)
                setCurrentTenantId(DEFAULT_TENANT_ID)
            }
        } catch (err: any) {
            console.error('[TenantContext] Load failed:', err)
            const fallback = { id: DEFAULT_TENANT_ID, name: 'Recovery Mode', settings: {} }
            setTenants([fallback])
            setCurrentTenant(fallback)
            setCurrentTenantId(DEFAULT_TENANT_ID)
        } finally {
            setLoading(false)
        }
    }

    const switchTenant = (id: string) => {
        setCurrentTenantId(id)
    }

    return (
        <TenantContext.Provider value={{
            currentTenantId,
            currentTenant,
            tenants,
            loading,
            switchTenant,
            refreshTenants: fetchTenants
        }}>
            {children}
        </TenantContext.Provider>
    )
}

export function useTenant() {
    const ctx = useContext(TenantContext)
    if (!ctx) throw new Error('useTenant must be used within TenantProvider')
    return ctx
}
