import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Menu, MenuCategory, MenuItem } from '../types'
import { Image as ImageIcon } from 'lucide-react'

export default function DisplayMenu() {
    const { menuId } = useParams()
    const [menu, setMenu] = useState<Menu | null>(null)
    const [categories, setCategories] = useState<any[]>([])
    const [tenant, setTenant] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchMenuData = async () => {
            if (!menuId) return
            setLoading(true)
            try {
                // 1. Fetch Menu Metadata
                const { data: menuData, error: mErr } = await supabase
                    .from('menus')
                    .select('*')
                    .eq('id', menuId)
                    .single()

                if (mErr || !menuData) throw mErr || new Error('Menu not found')
                setMenu(menuData)

                // 2. Fetch Tenant Branding
                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('name, settings')
                    .eq('id', menuData.tenant_id)
                    .single()

                if (tenantData) {
                    setTenant({
                        name: tenantData.name,
                        logo_url: tenantData.settings?.logo_url,
                        primary_color: tenantData.settings?.primary_color || '#ef4444'
                    })
                }

                // 3. Fetch Categories and Items
                const { data: catData } = await supabase
                    .from('menu_categories')
                    .select(`
                        id, 
                        name, 
                        sort_order,
                        items:menu_items(*)
                    `)
                    .eq('menu_id', menuId)
                    .order('sort_order', { ascending: true })

                if (catData) {
                    // Sort items within categories
                    const sortedCats = catData.map(cat => ({
                        ...cat,
                        items: (cat.items || []).sort((a: any, b: any) => a.sort_order - b.sort_order)
                    }))
                    setCategories(sortedCats)
                }
            } catch (err) {
                console.error('Error fetching menu display data:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchMenuData()
    }, [menuId])

    if (loading) return <div className="h-screen w-screen bg-black flex items-center justify-center text-white/20">Loading Menu...</div>
    if (!menu) return <div className="h-screen w-screen bg-black flex items-center justify-center text-red-500/50">Menu Not Found</div>

    const config = menu.config || {}
    const aspectRatio = config.aspect_ratio || '16:9'
    const logoPlacement = config.logo_placement || 'center'
    const showPromo = config.show_promo || false
    const promoPosition = config.promo_position || 'right'
    const columns = config.columns || 2

    return (
        <div className="h-screen w-screen bg-black overflow-hidden font-sans">
            <div
                className="h-full w-full bg-gradient-to-br from-[#120a05] to-[#0a0502] relative overflow-hidden flex"
                style={{ flexDirection: showPromo ? (promoPosition === 'left' ? 'row-reverse' : 'row') : 'column' }}
            >
                {/* Menu Area */}
                <div
                    className={`${aspectRatio === '16:9' ? 'p-12' : 'p-12'} h-full flex flex-col text-[#f3e5db] overflow-hidden`}
                    style={{ width: showPromo ? '70%' : '100%' }}
                >
                    <div className={`mb-12 ${aspectRatio === '16:9' ? 'flex items-center gap-10' : 'flex flex-col'} ${logoPlacement === 'center' ? 'justify-center text-center items-center' : logoPlacement === 'left' ? 'justify-start text-left items-start' : 'justify-end text-right items-end'}`}>
                        {tenant?.logo_url ? (
                            <div className="bg-white p-3 rounded-2xl shadow-2xl border border-white/10">
                                <img
                                    src={tenant.logo_url}
                                    alt={tenant.name}
                                    className={`${aspectRatio === '16:9' ? 'h-16' : 'h-24'} w-auto object-contain`}
                                />
                            </div>
                        ) : (
                            <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center border border-brand-500/30">
                                <ImageIcon size={32} className="text-brand-500" />
                            </div>
                        )}

                        <div className={`flex flex-col ${aspectRatio === '16:9' ? 'text-left' : ''} ${logoPlacement === 'center' && aspectRatio !== '16:9' ? 'items-center' : logoPlacement === 'right' && aspectRatio !== '16:9' ? 'items-end' : 'items-start'}`}>
                            <h2 className={`font-display ${aspectRatio === '16:9' ? 'text-4xl' : 'text-5xl'} font-black tracking-[0.2em] uppercase mb-2`} style={{ color: tenant?.primary_color || '#f97316' }}>
                                {tenant?.name || 'OmniPush'}
                            </h2>
                            <div className={`h-1 w-24 mb-4 ${logoPlacement === 'center' && aspectRatio !== '16:9' ? 'mx-auto' : logoPlacement === 'left' || aspectRatio === '16:9' ? 'mr-auto' : 'ml-auto'}`} style={{ background: tenant?.primary_color || '#ea580c' }} />
                            <p className="text-sm text-surface-400 uppercase tracking-[0.4em] font-bold">
                                {menu.name}
                            </p>
                        </div>
                    </div>

                    <div
                        className="grid gap-x-16 gap-y-12 flex-1 content-start overflow-hidden"
                        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                    >
                        {categories.map(cat => (
                            <div key={cat.id} className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 bg-brand-500 rounded-full" />
                                    <h4 className="text-xl font-bold uppercase tracking-[0.2em] text-brand-200">{cat.name}</h4>
                                    <div className="flex-1 h-px bg-white/10" />
                                </div>
                                <div className="space-y-6">
                                    {cat.items.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-baseline group">
                                            <div className="max-w-[80%]">
                                                <div className="text-2xl font-semibold text-[#f3e5db]">{item.name}</div>
                                                {item.description && <div className="text-sm text-surface-500 mt-1">{item.description}</div>}
                                            </div>
                                            <div className="flex-1 mx-4 border-b border-white/10 border-dotted translate-y-[-8px]" />
                                            <div className="text-2xl font-bold text-brand-500">₹{item.price}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 text-center pt-8 border-t border-white/5">
                        <p className="text-xs text-surface-600 uppercase tracking-[0.3em] font-medium">Tax included · Premium Ingredients · Authentic Recipe</p>
                    </div>
                </div>

                {/* Promo Side Area */}
                {showPromo && (
                    <div
                        className="h-full bg-black/40 border-l border-white/5 relative flex items-center justify-center p-8 overflow-hidden"
                        style={{ width: '30%' }}
                    >
                        <div className="absolute inset-0 opacity-10">
                            <div className="absolute inset-0 bg-gradient-to-b from-brand-600 to-transparent" />
                        </div>
                        <div className="relative z-10 text-center animate-pulse">
                            <div className="w-24 h-24 bg-brand-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-brand-500/20 shadow-2xl">
                                <ImageIcon size={48} className="text-brand-500" />
                            </div>
                            <h3 className="text-2xl font-black text-white/30 uppercase tracking-[0.3em]">PROMO</h3>
                        </div>
                    </div>
                )}

                {/* Visual Polish */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
        </div>
    )
}
