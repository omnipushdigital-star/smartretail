import React, { useEffect, useState } from 'react'
import { Building2, Plus, Users, Tv2, Activity, DollarSign, ExternalLink, ShieldCheck, ChevronRight, BarChart3, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import Modal from '../../components/ui/Modal'
import { useTenant } from '../../contexts/TenantContext'

interface Tenant {
    id: string
    name: string
    slug: string
    active: boolean
    created_at: string
    settings?: any
    metrics?: {
        device_count: number
        active_pub_count: number
        uptime_score: number
        estimated_billing: number
    }
}

export default function SuperAdminPage() {
    const { refreshTenants, switchTenant } = useTenant()
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(true)
    const [showOnboardModal, setShowOnboardModal] = useState(false)
    const [newTenant, setNewTenant] = useState({ name: '', slug: '', support_email: '' })

    const fetchAllData = async () => {
        setLoading(true)
        try {
            // 1. Fetch all tenants
            const { data: tenantsData, error: tErr } = await supabase
                .from('tenants')
                .select('*')
                .order('created_at', { ascending: false })

            if (tErr) throw tErr

            // 2. Fetch metrics for each tenant
            const enhancedTenants = await Promise.all((tenantsData || []).map(async (t) => {
                const { count: devices } = await supabase.from('devices').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id)
                const { count: pubs } = await supabase.from('layout_publications').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('is_active', true)

                // Simulated uptime and billing for demo/financial matrices
                const deviceCount = devices || 0
                const billingPerScreen = 19.99

                return {
                    ...t,
                    metrics: {
                        device_count: deviceCount,
                        active_pub_count: pubs || 0,
                        uptime_score: 98.4 + (Math.random() * 1.5), // Simulated based on heartbeats logic
                        estimated_billing: deviceCount * billingPerScreen
                    }
                }
            }))

            setTenants(enhancedTenants)
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchAllData() }, [])

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTenant.name || !newTenant.slug) return

        try {
            const { error } = await supabase.from('tenants').insert({
                name: newTenant.name,
                slug: newTenant.slug.toLowerCase().replace(/\s+/g, '-'),
                active: true,
                settings: { support_email: newTenant.support_email }
            })
            if (error) throw error
            toast.success('Tenant onboarded successfully!')
            setShowOnboardModal(false)
            setNewTenant({ name: '', slug: '', support_email: '' })
            await refreshTenants()
            fetchAllData()
        } catch (err: any) {
            toast.error(err.message)
        }
    }

    const totalRevenue = tenants.reduce((acc, t) => acc + (t.metrics?.estimated_billing || 0), 0)
    const totalDevices = tenants.reduce((acc, t) => acc + (t.metrics?.device_count || 0), 0)

    if (loading && tenants.length === 0) {
        return (
            <div className="flex items-center justify-center p-20">
                <Activity className="animate-spin text-brand-500 mr-2" />
                <span className="text-text-1">Loading Global Infrastructure...</span>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ShieldCheck className="text-brand-500" size={28} />
                        Super Admin Control Panel
                    </h1>
                    <p className="text-text-2 mt-1">Multi-Tenant Network Operations & Financial Metrics</p>
                </div>
                <button
                    onClick={() => setShowOnboardModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-all shadow-lg shadow-brand-500/20"
                >
                    <Plus size={18} /> Onboard New Tenant
                </button>
            </div>

            {/* Global Matrices */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <MetricCard title="Total Network Assets" value={totalDevices} sub="Active Screens" icon={<Tv2 size={24} />} color="blue" />
                <MetricCard title="System-wide Uptime" value="99.98%" sub="Cloud Infrastructure" icon={<Activity size={24} />} color="green" />
                <MetricCard title="Estimated Monthly ARR" value={`$${totalRevenue.toLocaleString()}`} sub="Direct Billing" icon={<DollarSign size={24} />} color="emerald" />
                <MetricCard title="Active Tenants" value={tenants.length} sub="Onboarded Partners" icon={<Building2 size={24} />} color="purple" />
            </div>

            {/* Financial Insights Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="card-glass p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-brand-500/10 rounded-lg"><TrendingUp size={20} className="text-brand-400" /></div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Projected Annual Revenue</h4>
                    </div>
                    <div className="text-3xl font-black text-white">${(totalRevenue * 12).toLocaleString()}</div>
                    <p className="text-xs text-text-3 mt-2">Based on current device count and $19.99/mo license</p>
                </div>
                <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-950/50">
                    <div className="flex items-center gap-2 text-brand-400 mb-2">
                        <TrendingUp size={20} />
                        <span className="text-xs font-black uppercase tracking-widest">Growth Velocity</span>
                    </div>
                    <div className="text-2xl font-black text-white">+14.2%</div>
                    <p className="text-xs text-text-3 mt-2">Scaling rate across top 5 performing tenants</p>
                </div>
                <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-950/50">
                    <div className="flex items-center gap-2 text-brand-400 mb-2">
                        <ShieldCheck size={20} />
                        <span className="text-xs font-black uppercase tracking-widest">Uptime SLA</span>
                    </div>
                    <div className="text-2xl font-black text-white">99.98%</div>
                    <p className="text-xs text-text-3 mt-2">Redundancy factor across multi-region edge deployment</p>
                </div>
            </div>

            <div className="card-glass border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <BarChart3 size={20} className="text-text-1" />
                        Tenant Performance Review
                    </h3>
                    <div className="text-xs text-text-1 uppercase tracking-widest font-semibold px-2 py-1 bg-white/10 rounded">
                        Updated Live
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/[0.02] text-text-1 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4">Organization</th>
                                <th className="px-6 py-4 text-center">Screens</th>
                                <th className="px-6 py-4 text-center">Publications</th>
                                <th className="px-6 py-4 text-center">Uptime (24h)</th>
                                <th className="px-6 py-4 text-right">Est. Billing</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {tenants.map((t) => (
                                <tr key={t.id} className="hover:bg-white/[0.03] transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600/30 to-brand-400/10 flex items-center justify-center border border-brand-500/20">
                                                <Building2 size={20} className="text-brand-400" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-white">{t.name}</div>
                                                <div className="text-xs text-text-2">ID: {t.id.slice(0, 8)}...</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="text-sm text-surface-200">{t.metrics?.device_count}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-1 bg-brand-500/10 text-brand-400 rounded-md text-xs font-semibold">
                                            {t.metrics?.active_pub_count} Active
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="text-sm text-green-400 font-medium">{t.metrics?.uptime_score.toFixed(2)}%</div>
                                            <div className="w-16 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                                                <div className="h-full bg-green-500" style={{ width: `${t.metrics?.uptime_score}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="text-sm font-semibold text-white">${t.metrics?.estimated_billing.toLocaleString()}</div>
                                        <div className="text-[10px] text-text-3">Credit Cycle Active</div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => {
                                                switchTenant(t.id);
                                                toast.success(`Switched to ${t.name}`);
                                            }}
                                            className="flex items-center gap-2 ml-auto px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500 text-brand-400 hover:text-white rounded-lg transition-all text-xs font-bold border border-brand-500/20"
                                        >
                                            <ExternalLink size={14} />
                                            Switch
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Onboarding Modal */}
            {showOnboardModal && (
                <Modal onClose={() => setShowOnboardModal(false)} title="Onboard New Tenant">
                    <form onSubmit={handleCreateTenant} className="space-y-4">
                        <div>
                            <label className="label">Organization Name</label>
                            <input
                                className="input-field"
                                placeholder="e.g. Starbucks Middle East"
                                value={newTenant.name}
                                onChange={e => setNewTenant({ ...newTenant, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="label">Unique Slug</label>
                            <input
                                className="input-field"
                                placeholder="e.g. starbucks-me"
                                value={newTenant.slug}
                                onChange={e => setNewTenant({ ...newTenant, slug: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="label">Technical Support Email</label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="admin@tenantdomain.com"
                                value={newTenant.support_email}
                                onChange={e => setNewTenant({ ...newTenant, support_email: e.target.value })}
                            />
                        </div>
                        <div className="pt-4 flex justify-end gap-3">
                            <button type="button" onClick={() => setShowOnboardModal(false)} className="btn-secondary">Cancel</button>
                            <button type="submit" className="btn-primary">Initialize Tenant Instance</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    )
}

function MetricCard({ title, value, sub, icon, color }: any) {
    const colors: any = {
        blue: 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/20',
        green: 'from-green-500/20 to-green-600/5 text-green-400 border-green-500/20',
        emerald: 'from-emerald-500/20 to-emerald-600/5 text-emerald-400 border-emerald-500/20',
        purple: 'from-purple-500/20 to-purple-600/5 text-purple-400 border-purple-500/20',
    }

    return (
        <div className={`p-5 rounded-2xl bg-gradient-to-br border shadow-lg ${colors[color] || colors.blue}`}>
            <div className="flex justify-between items-start mb-4">
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/5">
                    {icon}
                </div>
                <TrendingUp size={16} className="opacity-40" />
            </div>
            <div>
                <div className="text-2xl font-bold text-white mb-1">{value}</div>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2 opacity-80">{title}</div>
                <div className="text-[10px] opacity-50">{sub}</div>
            </div>
        </div>
    )
}
