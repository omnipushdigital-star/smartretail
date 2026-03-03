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
        fetchTenants()
    }, [])

    useEffect(() => {
        const tenant = tenants.find(t => t.id === currentTenantId)
        if (tenant) {
            setCurrentTenant(tenant)
        }
        localStorage.setItem('omnipush_tenant_id', currentTenantId)
    }, [currentTenantId, tenants])

    async function fetchTenants() {
        try {
            console.log('[TenantContext] Fetching tenants...')
            const { data, error } = await supabase
                .from('tenants')
                .select('id, name, settings')
                .eq('active', true)

            if (error) {
                console.error('[TenantContext] Supabase Error:', error)
                throw error
            }

            if (data && data.length > 0) {
                setTenants(data)
                // Use stored ID if it still exists in the fetched list, otherwise default to first active
                const targetId = localStorage.getItem('omnipush_tenant_id') || currentTenantId
                const active = data.find(t => t.id === targetId) || data[0]
                if (active) {
                    setCurrentTenantId(active.id)
                    setCurrentTenant(active)
                }
            } else {
                console.warn('[TenantContext] No active tenants found in DB. Creating dummy fallback.')
                // Fallback virtual tenant if none in DB
                const fallback = { id: DEFAULT_TENANT_ID, name: 'Root Instance', settings: {} }
                setTenants([fallback])
                setCurrentTenant(fallback)
                setCurrentTenantId(DEFAULT_TENANT_ID)
            }
        } catch (err: any) {
            console.error('[TenantContext] Error fetching tenants:', err)
            // Critical recovery fallback
            const fallback = { id: DEFAULT_TENANT_ID, name: 'Recovery Mode', settings: {} }
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
