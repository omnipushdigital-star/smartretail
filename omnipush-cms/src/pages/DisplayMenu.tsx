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
    const [isSidebarMode, setIsSidebarMode] = useState(false)

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        setIsSidebarMode(params.get('mode') === 'side')
    }, [])

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
    if (!menu) return <div className="h-full w-full bg-black flex items-center justify-center text-red-500/50">Menu Not Found</div>

    const config = menu.config || {}
    const aspectRatio = isSidebarMode ? '9:16' : (config.aspect_ratio || '16:9')
    const logoPlacement = config.logo_placement || 'center'
    const showPromo = isSidebarMode ? false : (config.show_promo || false)
    const promoPosition = config.promo_position || 'right'
    const themeStyles = {
        dark: {
            bg: 'bg-gradient-to-br from-[#120a05] to-[#0a0502]',
            text: 'text-[#f3e5db]',
            categoryText: 'text-brand-200',
            accent: 'text-brand-500',
            dot: 'bg-brand-500'
        },
        glass: {
            bg: 'bg-gradient-to-br from-[#ffffff] to-[#f1f5f9]',
            text: 'text-slate-900',
            categoryText: 'text-brand-600',
            accent: 'text-brand-600',
            dot: 'bg-brand-500'
        },
        elegant: {
            bg: 'bg-gradient-to-tr from-[#1a1c2e] to-[#2e1a1a]',
            text: 'text-[#fdfcfb]',
            categoryText: 'text-amber-200',
            accent: 'text-amber-500',
            dot: 'bg-amber-500'
        }
    };
    const style = themeStyles[config.theme as keyof typeof themeStyles] || themeStyles.dark;
    const columns = isSidebarMode ? 1 : (config.columns || 2)

    return (
        <div className="h-full w-full bg-black overflow-hidden font-sans">
            <div
                className={`h-full w-full ${style.bg} relative overflow-hidden flex`}
                style={{ flexDirection: showPromo ? (promoPosition === 'left' ? 'row-reverse' : 'row') : 'column' }}
            >
                {/* Menu Area */}
                <div
                    className={`${aspectRatio === '16:9' ? 'p-[4%]' : 'p-[6%]'} h-full flex flex-col ${style.text} overflow-hidden`}
                    style={{ width: showPromo ? '70%' : '100%' }}
                >
                    <div className={`mb-8 ${aspectRatio === '16:9' ? 'flex items-center gap-8' : 'flex flex-col'} ${logoPlacement === 'center' ? 'justify-center text-center items-center' : logoPlacement === 'left' ? 'justify-start text-left items-start' : 'justify-end text-right items-end'}`}>
                        {tenant?.logo_url ? (
                            <div className="bg-white p-3 rounded-2xl shadow-xl border border-white/10 shrink-0">
                                <img
                                    src={tenant.logo_url}
                                    alt={tenant.name}
                                    className={`${aspectRatio === '16:9' ? 'h-16' : 'h-20'} w-auto object-contain`}
                                />
                            </div>
                        ) : (
                            <div className={`w-16 h-16 ${style.bg} brightness-125 rounded-2xl flex items-center justify-center border border-white/10`}>
                                <ImageIcon size={32} className={style.accent} />
                            </div>
                        )}

                        <div className={`flex flex-col ${aspectRatio === '16:9' ? 'text-left' : ''} ${logoPlacement === 'center' && aspectRatio !== '16:9' ? 'items-center' : logoPlacement === 'right' && aspectRatio !== '16:9' ? 'items-end' : 'items-start'}`}>
                            <h2 className={`font-display ${aspectRatio === '16:9' ? 'text-4xl' : 'text-5xl'} font-black tracking-[0.2em] uppercase mb-1 leading-tight`} style={{ color: tenant?.primary_color || (style === themeStyles.dark ? '#f97316' : '#ef4444') }}>
                                {tenant?.name || 'OmniPush'}
                            </h2>
                            <div className={`h-1 w-24 mb-3 ${logoPlacement === 'center' && aspectRatio !== '16:9' ? 'mx-auto' : logoPlacement === 'left' || aspectRatio === '16:9' ? 'mr-auto' : 'ml-auto'}`} style={{ background: tenant?.primary_color || (style === themeStyles.dark ? '#ea580c' : '#ef4444') }} />
                            <p className="text-lg text-slate-500 uppercase tracking-[0.3em] font-bold opacity-70">
                                {menu.name}
                            </p>
                        </div>
                    </div>

                    <div
                        className="grid gap-x-12 gap-y-8 flex-1 content-start overflow-hidden pt-2"
                        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                    >
                        {categories.map(cat => (
                            <div key={cat.id} className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 ${style.dot} rounded-full`} />
                                    <h4 className={`text-xl font-bold uppercase tracking-[0.2em] ${style.categoryText}`}>{cat.name}</h4>
                                    <div className="flex-1 h-px bg-white/10" />
                                </div>
                                <div className="space-y-4">
                                    {cat.items.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-baseline group">
                                            <div className="max-w-[70%]">
                                                <div className="text-xl font-bold leading-tight">{item.name}</div>
                                                {item.description && <div className="text-sm text-surface-500 mt-1 leading-snug opacity-80">{item.description}</div>}
                                            </div>
                                            <div className="flex-1 mx-4 border-b border-white/5 border-dotted translate-y-[-6px]" />
                                            <div className={`text-2xl font-black ${style.accent}`}>
                                                <span className="text-base mr-1">{config.currency?.symbol || '₹'}</span>{item.price}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-12 text-center pt-8 border-t border-white/5">
                        <p className="text-xs text-surface-600 uppercase tracking-[0.3em] font-medium">Tax Included • Premium Ingredients • Authentic Recipe</p>
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
