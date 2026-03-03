import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Layout, Monitor, Save, Send, ChevronDown, ChevronRight, Eye, Smartphone, Tv, Image as ImageIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useTenant } from '../../contexts/TenantContext'
import { Menu, MenuCategory as DBMenuCategory, MenuItem as DBMenuItem } from '../../types'

interface TenantBranding {
    name: string;
    logo_url: string;
    primary_color: string;
}

interface MenuItem {
    id: string
    name: string
    price: string | number
    description?: string
}

interface MenuCategory {
    id: string
    name: string
    items: MenuItem[]
    isOpen: boolean
}

export default function MenuBuilderPage() {
    const navigate = useNavigate()
    const { currentTenantId } = useTenant()
    const [menuId, setMenuId] = useState<string | null>(null)
    const [menuName, setMenuName] = useState('New Menu')
    const [categories, setCategories] = useState<MenuCategory[]>([])
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9')
    const [activeTab, setActiveTab] = useState<'content' | 'design'>('content')
    const [layoutConfig, setLayoutConfig] = useState({
        columns: 2,
        logoPlacement: 'center' as 'left' | 'center' | 'right',
        showPromo: false,
        promoPosition: 'right' as 'left' | 'right',
        theme: 'dark' as 'dark' | 'glass' | 'elegant'
    })
    const [tenant, setTenant] = useState<TenantBranding | null>(null)
    const [loading, setLoading] = useState(false)
    const [showMenuList, setShowMenuList] = useState(false)
    const [savedMenus, setSavedMenus] = useState<Menu[]>([])

    useEffect(() => {
        const fetchBranding = async () => {
            if (!currentTenantId) return
            const { data } = await supabase
                .from('tenants')
                .select('name, settings')
                .eq('id', currentTenantId)
                .single()

            if (data) {
                setTenant({
                    name: data.name || 'OmniPush',
                    logo_url: data.settings?.logo_url || '/assets/omnipush-logo.png',
                    primary_color: data.settings?.primary_color || '#ef4444'
                })
            }
        }
        fetchBranding()

        // Reset local menu state when tenant changes to avoid data cross-pollination
        setMenuId(null)
        setMenuName('New Menu')
        setCategories([])
    }, [currentTenantId])

    const addCategory = () => {
        const id = Math.random().toString(36).substr(2, 9)
        setCategories([...categories, { id, name: 'New Category', items: [], isOpen: true }])
    }

    const addItem = (catId: string) => {
        setCategories(categories.map(cat => {
            if (cat.id === catId) {
                return {
                    ...cat,
                    items: [...cat.items, { id: Math.random().toString(36).substr(2, 9), name: 'New Item', price: '0' }]
                }
            }
            return cat
        }))
    }

    const removeItem = (catId: string, itemId: string) => {
        setCategories(categories.map(cat => {
            if (cat.id === catId) {
                return { ...cat, items: cat.items.filter(i => i.id !== itemId) }
            }
            return cat
        }))
    }

    const updateItem = (catId: string, itemId: string, field: keyof MenuItem, value: string) => {
        setCategories(categories.map(cat => {
            if (cat.id === catId) {
                return {
                    ...cat,
                    items: cat.items.map(i => i.id === itemId ? { ...i, [field]: value } : i)
                }
            }
            return cat
        }))
    }

    const handleSave = async () => {
        setLoading(true)
        try {
            // 1. Save main Menu metadata
            const menuData = {
                tenant_id: currentTenantId,
                name: menuName,
                config: {
                    ...layoutConfig,
                    aspect_ratio: aspectRatio,
                    logo_placement: layoutConfig.logoPlacement,
                    show_promo: layoutConfig.showPromo,
                    promo_position: layoutConfig.promoPosition
                }
            }

            let mId = menuId
            if (mId) {
                await supabase.from('menus').update(menuData).eq('id', mId)
            } else {
                const { data, error } = await supabase.from('menus').insert(menuData).select().single()
                if (error) throw error
                mId = data.id
                setMenuId(mId)
            }

            // 2. Refresh categories (Wipe & Replace for simplicity in this MVP)
            await supabase.from('menu_categories').delete().eq('menu_id', mId)

            for (let i = 0; i < categories.length; i++) {
                const cat = categories[i]
                const { data: newCat, error: catErr } = await supabase
                    .from('menu_categories')
                    .insert({ menu_id: mId, name: cat.name, sort_order: i })
                    .select()
                    .single()

                if (catErr) throw catErr

                if (cat.items.length > 0) {
                    const itemsToInsert = cat.items.map((item, idx) => ({
                        category_id: newCat.id,
                        name: item.name,
                        price: parseFloat(item.price.toString()) || 0,
                        sort_order: idx
                    }))
                    await supabase.from('menu_items').insert(itemsToInsert)
                }
            }

            // 3. Register as Media Asset for Playlist usage
            const displayUrl = `${window.location.origin}/display/menu/${mId}`
            const { data: existingAsset } = await supabase
                .from('media_assets')
                .select('id')
                .eq('tenant_id', currentTenantId)
                .eq('url', displayUrl)
                .maybeSingle()

            if (!existingAsset) {
                await supabase.from('media_assets').insert({
                    tenant_id: currentTenantId,
                    name: `MENU: ${menuName}`,
                    type: 'web_url',
                    url: displayUrl,
                    tags: ['menu-builder']
                })
            } else {
                await supabase.from('media_assets').update({
                    name: `MENU: ${menuName}`,
                    updated_at: new Date().toISOString()
                }).eq('id', existingAsset.id)
            }

            toast.success('Menu saved and registered to Media Library!')
            setMenuId(mId)
        } catch (err: any) {
            toast.error(err.message || 'Failed to save menu')
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const loadSavedMenus = async () => {
        const { data, error } = await supabase.from('menus').select('*').eq('tenant_id', currentTenantId).order('updated_at', { ascending: false })
        if (error) toast.error('Error fetching menus')
        else setSavedMenus(data || [])
        setShowMenuList(true)
    }

    const loadMenu = async (mId: string) => {
        setLoading(true)
        try {
            const { data: menu, error: mErr } = await supabase.from('menus').select('*').eq('id', mId).single()
            if (mErr) throw mErr

            const { data: cats, error: cErr } = await supabase.from('menu_categories').select('*, items:menu_items(*)').eq('menu_id', mId).order('sort_order', { ascending: true })
            if (cErr) throw cErr

            setMenuId(menu.id)
            setMenuName(menu.name)
            setLayoutConfig({
                columns: menu.config.columns || 2,
                logoPlacement: menu.config.logo_placement || 'center',
                showPromo: menu.config.show_promo || false,
                promoPosition: menu.config.promo_position || 'right',
                theme: menu.config.theme || 'dark'
            })
            setAspectRatio(menu.config.aspect_ratio || '16:9')

            setCategories(cats.map((c: any) => ({
                id: c.id,
                name: c.name,
                isOpen: true,
                items: c.items.map((i: any) => ({
                    id: i.id,
                    name: i.name,
                    price: i.price.toString(),
                    description: i.description
                }))
            })))

            setShowMenuList(false)
            toast.success('Menu loaded')
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Layout className="text-brand-500" size={28} />
                        Menu Builder
                    </h1>
                    <p className="text-surface-400 mt-1">Drag-and-drop menu creation with real-time preview</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={loadSavedMenus}
                        className="flex items-center gap-2 px-4 py-2 bg-surface-950 border border-white/5 text-surface-400 rounded-lg hover:text-white transition-all"
                    >
                        <Monitor size={18} /> My Menus
                    </button>
                    <button onClick={handleSave} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-surface-800 border border-surface-700 text-white rounded-lg hover:bg-surface-700 transition-all disabled:opacity-50">
                        <Save size={18} /> {loading ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button onClick={async () => { await handleSave(); toast.success('Menu ready! Redirecting to Publish...'); setTimeout(() => navigate('/admin/publish'), 1500) }} className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-all shadow-lg shadow-brand-500/20">
                        <Send size={18} /> Push Content
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* Editor Column */}
                <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-900/50 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex gap-4">
                            <button
                                onClick={() => setActiveTab('content')}
                                className={`text-sm font-bold uppercase tracking-widest pb-2 transition-all ${activeTab === 'content' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-surface-500 hover:text-surface-300'}`}
                            >
                                Content
                            </button>
                            <button
                                onClick={() => setActiveTab('design')}
                                className={`text-sm font-bold uppercase tracking-widest pb-2 transition-all ${activeTab === 'design' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-surface-500 hover:text-surface-300'}`}
                            >
                                Design & Layout
                            </button>
                        </div>
                        <div className="flex gap-1 p-1 bg-surface-950 rounded-lg border border-white/5 font-display text-[10px] font-bold uppercase tracking-widest">
                            <button className="px-3 py-1 text-surface-400 hover:text-white transition-colors">Draft</button>
                            <button className="px-3 py-1 bg-brand-600 text-white rounded-md shadow-sm">Live</button>
                        </div>
                    </div>

                    {activeTab === 'content' ? (
                        <div className="space-y-6">
                            <div>
                                <label className="label">Menu Name</label>
                                <input
                                    className="input-field bg-surface-950/50 border-white/5 text-lg font-medium"
                                    value={menuName}
                                    onChange={e => setMenuName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="label">Categories</label>
                                {categories.map((cat) => (
                                    <div key={cat.id} className="border border-white/5 rounded-xl bg-surface-950/30 overflow-hidden">
                                        <div
                                            onClick={() => setCategories(categories.map(c => c.id === cat.id ? { ...c, isOpen: !c.isOpen } : c))}
                                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                {cat.isOpen ? <ChevronDown size={18} className="text-surface-500" /> : <ChevronRight size={18} className="text-surface-500" />}
                                                <span className="font-semibold text-white">{cat.name}</span>
                                                <span className="text-xs text-surface-500 bg-white/5 px-2 py-0.5 rounded-full">{cat.items.length} items</span>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); setCategories(categories.filter(c => c.id !== cat.id)) }} className="text-surface-600 hover:text-red-400 p-1">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        {cat.isOpen && (
                                            <div className="p-4 pt-0 space-y-3">
                                                {cat.items.map((item) => (
                                                    <div key={item.id} className="flex gap-2 items-center">
                                                        <input
                                                            className="input-field bg-surface-950/50 border-white/5 flex-1"
                                                            value={item.name}
                                                            onChange={e => updateItem(cat.id, item.id, 'name', e.target.value)}
                                                        />
                                                        <div className="relative w-24">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 text-xs">₹</span>
                                                            <input
                                                                className="input-field bg-surface-950/50 border-white/5 pl-8 text-right"
                                                                value={item.price}
                                                                onChange={e => updateItem(cat.id, item.id, 'price', e.target.value)}
                                                            />
                                                        </div>
                                                        <button onClick={() => removeItem(cat.id, item.id)} className="p-2 text-surface-600 hover:text-red-400">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addItem(cat.id)}
                                                    className="w-full py-2 border border-dashed border-white/10 rounded-lg text-xs text-surface-500 hover:text-brand-400 hover:border-brand-500/50 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Plus size={14} /> Add Item
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={addCategory}
                                className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-sm font-medium text-surface-300 transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={18} /> Add New Category
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Display Zones</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            onClick={() => setLayoutConfig(l => ({ ...l, showPromo: false }))}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${!layoutConfig.showPromo ? 'bg-brand-600/10 border-brand-500 text-white' : 'bg-surface-950/50 border-white/5 text-surface-400 hover:border-white/10'}`}
                                        >
                                            <div className="w-8 h-6 bg-surface-800 rounded border border-white/20" />
                                            <span className="text-sm font-semibold">Full Screen Menu</span>
                                        </button>
                                        <button
                                            onClick={() => setLayoutConfig(l => ({ ...l, showPromo: true }))}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${layoutConfig.showPromo ? 'bg-brand-600/10 border-brand-500 text-white' : 'bg-surface-950/50 border-white/5 text-surface-400 hover:border-white/10'}`}
                                        >
                                            <div className="w-8 h-6 flex gap-1 rounded overflow-hidden border border-white/20">
                                                <div className="flex-1 bg-surface-800" />
                                                <div className="w-1/3 bg-brand-600/40" />
                                            </div>
                                            <span className="text-sm font-semibold">Multi-Zone (Split)</span>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Menu Columns</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3].map(cols => (
                                            <button
                                                key={cols}
                                                onClick={() => setLayoutConfig(l => ({ ...l, columns: cols }))}
                                                className={`flex-1 py-2 rounded-lg border transition-all text-sm font-bold ${layoutConfig.columns === cols ? 'bg-brand-600 text-white border-brand-500' : 'bg-surface-950/50 border-white/5 text-surface-500'}`}
                                            >
                                                {cols} Col
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="label">Logo Placement</label>
                                <div className="flex gap-2">
                                    {(['left', 'center', 'right'] as const).map(pos => (
                                        <button
                                            key={pos}
                                            onClick={() => setLayoutConfig(l => ({ ...l, logoPlacement: pos }))}
                                            className={`flex-1 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-widest ${layoutConfig.logoPlacement === pos ? 'bg-brand-600 text-white border-brand-500' : 'bg-surface-950/50 border-white/5 text-surface-500'}`}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {layoutConfig.showPromo && (
                                <div>
                                    <label className="label">Promo Zone Position</label>
                                    <div className="flex gap-2">
                                        {[
                                            { id: 'left', label: 'Promo Left' },
                                            { id: 'right', label: 'Promo Right' }
                                        ].map(pos => (
                                            <button
                                                key={pos.id}
                                                onClick={() => setLayoutConfig(l => ({ ...l, promoPosition: pos.id as any }))}
                                                className={`flex-1 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-widest ${layoutConfig.promoPosition === pos.id ? 'bg-brand-600 text-white border-brand-500' : 'bg-surface-950/50 border-white/5 text-surface-500'}`}
                                            >
                                                {pos.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="label">Visual Style</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['dark', 'glass', 'elegant'] as const).map(style => (
                                        <button
                                            key={style}
                                            onClick={() => setLayoutConfig(l => ({ ...l, theme: style }))}
                                            className={`py-2 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest ${layoutConfig.theme === style ? 'bg-white/10 text-white border-white/20' : 'bg-surface-950/50 border-white/5 text-surface-500'}`}
                                        >
                                            {style}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview Column */}
                <div className="flex flex-col gap-6">
                    <div className="card-glass border border-white/5 rounded-2xl p-6 bg-surface-900/50 flex-1">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                <Eye size={20} className="text-brand-400" />
                                Live Preview
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAspectRatio('16:9')}
                                    className={`p-2 rounded-lg transition-all ${aspectRatio === '16:9' ? 'bg-brand-600 text-white shadow-lg' : 'bg-surface-950 text-surface-500 border border-white/5'}`}
                                >
                                    <Tv size={18} />
                                </button>
                                <button
                                    onClick={() => setAspectRatio('9:16')}
                                    className={`p-2 rounded-lg transition-all ${aspectRatio === '9:16' ? 'bg-brand-600 text-white shadow-lg' : 'bg-surface-950 text-surface-500 border border-white/5'}`}
                                >
                                    <Smartphone size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Screen Canvas */}
                        <div className="flex justify-center items-center h-[500px] bg-black/40 rounded-3xl border border-white/5 overflow-hidden pattern-dots">
                            <div
                                className={`bg-gradient-to-br from-[#120a05] to-[#0a0502] shadow-2xl transition-all duration-500 overflow-hidden relative border-4 border-[#1e1e1e] rounded-lg`}
                                style={{
                                    width: aspectRatio === '16:9' ? '90%' : '280px',
                                    aspectRatio: aspectRatio === '16:9' ? '16/9' : '9/16',
                                }}
                            >
                                {/* Menu Content */}
                                <div className={`h-full flex ${layoutConfig.showPromo ? (layoutConfig.promoPosition === 'left' ? 'flex-row' : 'flex-row-reverse') : 'flex-col'}`}>
                                    {/* Menu Area */}
                                    <div
                                        className={`${aspectRatio === '16:9' ? 'p-4' : 'p-8'} h-full flex flex-col text-[#f3e5db] overflow-hidden`}
                                        style={{ width: layoutConfig.showPromo ? '70%' : '100%' }}
                                    >
                                        <div className={`mb-4 ${aspectRatio === '16:9' ? 'flex items-center gap-6' : 'flex flex-col'} ${layoutConfig.logoPlacement === 'center' ? 'justify-center text-center items-center' : layoutConfig.logoPlacement === 'left' ? 'justify-start text-left items-start' : 'justify-end text-right items-end'}`}>
                                            {tenant?.logo_url ? (
                                                <div className={`flex ${aspectRatio === '16:9' ? 'mb-0' : 'mb-3'}`}>
                                                    <div className="bg-white p-1.5 rounded-xl shadow-lg border border-white/10">
                                                        <img
                                                            src={tenant.logo_url}
                                                            alt={tenant.name}
                                                            className={`${aspectRatio === '16:9' ? 'h-8' : 'h-10'} w-auto object-contain`}
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={`flex ${aspectRatio === '16:9' ? 'mb-0' : 'mb-3'}`}>
                                                    <div className="w-8 h-8 bg-orange-500/20 rounded-xl flex items-center justify-center border border-orange-500/30">
                                                        <ImageIcon size={18} className="text-orange-500" />
                                                    </div>
                                                </div>
                                            )}

                                            <div className={`flex flex-col ${aspectRatio === '16:9' ? 'text-left' : ''} ${layoutConfig.logoPlacement === 'center' && aspectRatio !== '16:9' ? 'items-center' : layoutConfig.logoPlacement === 'right' && aspectRatio !== '16:9' ? 'items-end' : 'items-start'}`}>
                                                <h2 className={`font-display ${aspectRatio === '16:9' ? 'text-lg' : 'text-xl'} font-black tracking-[0.15em] uppercase mb-0.5`} style={{ color: tenant?.primary_color || '#f97316' }}>
                                                    {tenant?.name || 'OmniPush Digital'}
                                                </h2>
                                                <div className={`h-0.5 w-10 ${aspectRatio === '16:9' ? 'mb-1' : 'mb-3'} ${layoutConfig.logoPlacement === 'center' && aspectRatio !== '16:9' ? 'mx-auto' : layoutConfig.logoPlacement === 'left' || aspectRatio === '16:9' ? 'mr-auto' : 'ml-auto'}`} style={{ background: tenant?.primary_color || '#ea580c' }} />
                                                <p className="text-[8px] text-surface-400 uppercase tracking-[0.3em] font-bold">
                                                    {menuName.split(' — ')[0]}
                                                </p>
                                            </div>
                                        </div>

                                        <div
                                            className="grid gap-x-6 gap-y-4 flex-1 content-start overflow-y-auto scrollbar-hide"
                                            style={{ gridTemplateColumns: `repeat(${layoutConfig.columns}, 1fr)` }}
                                        >
                                            {categories.map(cat => (
                                                <div key={cat.id} className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1 h-1 bg-orange-500 rounded-full" />
                                                        <h4 className="text-[9px] font-bold uppercase tracking-widest text-orange-200 truncate">{cat.name}</h4>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {cat.items.map(item => (
                                                            <div key={item.id} className="flex justify-between items-baseline group">
                                                                <div className="overflow-hidden">
                                                                    <div className="text-[10px] font-semibold text-[#f3e5db] truncate">{item.name}</div>
                                                                    {item.description && <div className="text-[7px] text-surface-500 mt-0.5 truncate">{item.description}</div>}
                                                                </div>
                                                                <div className="flex-1 mx-2 border-b border-white/10 border-dotted translate-y-[-4px]" />
                                                                <div className="text-[10px] font-bold text-orange-500">₹{item.price}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-8 text-center">
                                            <p className="text-[7px] text-surface-600 uppercase tracking-widest">Tax included · Ask staff for allergen info</p>
                                        </div>
                                    </div>

                                    {/* Promo Area */}
                                    {layoutConfig.showPromo && (
                                        <div
                                            className="h-full bg-surface-950/80 border-l border-white/5 relative flex flex-col items-center justify-center p-4"
                                            style={{ width: '30%' }}
                                        >
                                            <div className="absolute inset-0 opacity-20 overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-b from-brand-600/20 to-transparent" />
                                                <div className="grid grid-cols-4 gap-2 h-full p-4 grayscale opacity-30">
                                                    {Array(12).fill(0).map((_, i) => (
                                                        <div key={i} className="aspect-square bg-white/10 rounded" />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="relative z-10 text-center">
                                                <div className="w-12 h-12 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-brand-500/30 animate-pulse">
                                                    <Monitor size={24} className="text-brand-400" />
                                                </div>
                                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white mb-2">PROMO ZONE</div>
                                                <div className="text-[8px] text-surface-400 leading-relaxed max-w-[120px]">
                                                    Drag and drop media here or assign a dynamic video playlist
                                                </div>
                                            </div>

                                            <div className="absolute bottom-4 left-4 right-4 h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-brand-500 w-1/3 animate-[progress_2s_ease-in-out_infinite]" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Gloss effect */}
                                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <button
                                onClick={() => toast.success('Menu published live!')}
                                className="py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-500/20 active:translate-y-0.5 transition-all"
                            >
                                Push to Screens →
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="py-3 bg-surface-800 hover:bg-surface-700 text-white rounded-xl font-bold text-sm border border-white/5 transition-all disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : 'Save Template'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {/* Menu List Modal */}
            {showMenuList && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-2xl bg-surface-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Layout size={24} className="text-brand-500" />
                                My Saved Menus
                            </h2>
                            <button onClick={() => setShowMenuList(false)} className="text-surface-500 hover:text-white">Close</button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                            {savedMenus.length === 0 ? (
                                <div className="text-center py-10 text-surface-500">No menus found. Create your first one!</div>
                            ) : (
                                savedMenus.map(m => (
                                    <div key={m.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-all group border border-white/5 hover:border-brand-500/30">
                                        <div>
                                            <div className="font-semibold text-white">{m.name}</div>
                                            <div className="text-xs text-surface-500">Last updated: {new Date(m.updated_at).toLocaleDateString()}</div>
                                        </div>
                                        <button
                                            onClick={() => loadMenu(m.id)}
                                            className="px-4 py-2 bg-brand-600/10 text-brand-400 group-hover:bg-brand-600 group-hover:text-white rounded-lg text-sm font-bold transition-all"
                                        >
                                            Load Menu
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 bg-surface-950/50 flex justify-end">
                            <button
                                onClick={() => { setMenuId(null); setMenuName('New Menu'); setCategories([]); setShowMenuList(false); }}
                                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all text-sm"
                            >
                                <Plus size={18} /> Create New Menu
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
