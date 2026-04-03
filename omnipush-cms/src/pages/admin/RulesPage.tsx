import React, { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, CalendarRange, Search, ToggleLeft, ToggleRight, Loader2, Eye, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Rule, RuleSchedule, Layout, Store, Role, Device } from '../../types'
import { useTenant } from '../../contexts/TenantContext'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const PAGE_SIZE = 10
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function maskToDays(mask: number): string {
    return DAYS.filter((_, i) => mask & (1 << i)).join(', ')
}

interface FormState {
    name: string
    enabled: boolean
    priority: number
    target_type: 'GLOBAL' | 'STORE' | 'ROLE' | 'DEVICE'
    target_id: string
    layout_id: string
}

const emptyForm: FormState = { name: '', enabled: true, priority: 0, target_type: 'GLOBAL', target_id: '', layout_id: '' }

export default function RulesPage() {
    const emptyScheduleLocal = { days_mask: 127, start_time: '', end_time: '', date_from: '', date_to: '' }
    const [rules, setRules] = useState<Rule[]>([])
    const [layouts, setLayouts] = useState<Layout[]>([])
    const [stores, setStores] = useState<Store[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [devices, setDevices] = useState<Device[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [showModal, setShowModal] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [editing, setEditing] = useState<Rule | null>(null)
    const [form, setForm] = useState<FormState>(emptyForm)
    const [schedule, setSchedule] = useState(emptyScheduleLocal)
    const [dayToggles, setDayToggles] = useState<boolean[]>(Array(7).fill(true))
    const [saving, setSaving] = useState(false)
    const [previewDevice, setPreviewDevice] = useState('')
    const [previewResult, setPreviewResult] = useState<Rule | null>(null)
    const { currentTenantId } = useTenant()

    const loadAll = async () => {
        if (!currentTenantId) return
        setLoading(true)
        const [rRes, lRes, sRes, roRes, dRes] = await Promise.all([
            supabase.from('rules').select('*, layout:layouts(id,name), schedules:rule_schedules(*)').eq('tenant_id', currentTenantId).order('priority', { ascending: false }),
            supabase.from('layouts').select('*').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('stores').select('*').eq('tenant_id', currentTenantId).eq('active', true).order('name'),
            supabase.from('roles').select('*').eq('tenant_id', currentTenantId).order('name'),
            supabase.from('devices').select('*').eq('tenant_id', currentTenantId).eq('active', true).order('device_code'),
        ])
        setRules(rRes.data || [])
        setLayouts(lRes.data || [])
        setStores(sRes.data || [])
        setRoles(roRes.data || [])
        setDevices(dRes.data || [])
        setLoading(false)
    }

    useEffect(() => { loadAll() }, [currentTenantId])

    const filtered = rules.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const daysFromToggles = (t: boolean[]) => t.reduce((acc, v, i) => acc | (v ? 1 << i : 0), 0)
    const togglesToDays = (mask: number) => Array(7).fill(0).map((_, i) => !!(mask & (1 << i)))

    const openCreate = () => {
        setEditing(null)
        setForm(emptyForm)
        setSchedule(emptyScheduleLocal)
        setDayToggles(Array(7).fill(true))
        setShowModal(true)
    }
    const openEdit = async (r: Rule) => {
        setEditing(r)
        setForm({ name: r.name, enabled: r.enabled, priority: r.priority, target_type: r.target_type, target_id: r.target_id || '', layout_id: r.layout_id || '' })
        const sched = (r as any).schedules?.[0]
        if (sched) {
            setSchedule({ days_mask: sched.days_mask, start_time: sched.start_time || '', end_time: sched.end_time || '', date_from: sched.date_from || '', date_to: sched.date_to || '' })
            setDayToggles(togglesToDays(sched.days_mask))
        } else {
            setSchedule(emptyScheduleLocal)
            setDayToggles(Array(7).fill(true))
        }
        setShowModal(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.name.trim()) { toast.error('Name is required'); return }
        setSaving(true)
        try {
            const mask = daysFromToggles(dayToggles)
            let ruleId = editing?.id
            const rulePayload = {
                name: form.name, enabled: form.enabled, priority: form.priority,
                target_type: form.target_type, target_id: form.target_id || null,
                layout_id: form.layout_id || null, updated_at: new Date().toISOString()
            }
            if (editing) {
                const { error } = await supabase.from('rules').update(rulePayload).eq('id', editing.id)
                if (error) throw error
                // Upsert schedule
                const existingSched = (editing as any).schedules?.[0]
                if (existingSched) {
                    await supabase.from('rule_schedules').update({ days_mask: mask, start_time: schedule.start_time || null, end_time: schedule.end_time || null, date_from: schedule.date_from || null, date_to: schedule.date_to || null }).eq('id', existingSched.id)
                } else {
                    await supabase.from('rule_schedules').insert({ rule_id: editing.id, days_mask: mask, start_time: schedule.start_time || null, end_time: schedule.end_time || null, date_from: schedule.date_from || null, date_to: schedule.date_to || null })
                }
                toast.success('Rule updated')
            } else {
                const { data: newRule, error: ruleErr } = await supabase.from('rules').insert({ ...rulePayload, tenant_id: currentTenantId }).select().single()
                if (ruleErr) throw ruleErr
                const ruleId = newRule.id
                // Insert schedule
                const { error: schErr } = await supabase.from('rule_schedules').insert({
                    rule_id: ruleId,
                    days_mask: mask,
                    start_time: schedule.start_time || '00:00:00',
                    end_time: schedule.end_time || '23:59:59',
                    date_from: schedule.date_from || null,
                    date_to: schedule.date_to || null
                })
                if (schErr) throw schErr
                toast.success('Rule created')
            }
            setShowModal(false)
            loadAll()
        } catch (err: any) {
            toast.error(err.message || 'Failed to save')
        }
        setSaving(false)
    }

    const toggleEnabled = async (rule: Rule) => {
        await supabase.from('rules').update({ enabled: !rule.enabled, updated_at: new Date().toISOString() }).eq('id', rule.id)
        setRules(rs => rs.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this rule?')) return
        await supabase.from('rules').delete().eq('id', id)
        toast.success('Rule deleted')
        loadAll()
    }

    const runPreview = () => {
        if (!previewDevice) { toast.error('Select a device'); return }
        const dev = devices.find(d => d.device_code === previewDevice)
        if (!dev) { toast.error('Device not found'); return }

        // Simple client-side approximation: DEVICE > STORE > ROLE > GLOBAL, then highest priority
        const now = new Date()
        const dayBit = now.getDay() // 0=Sun
        const timeStr = now.toTimeString().substring(0, 5) // HH:MM

        const matchingRules = rules.filter(r => {
            if (!r.enabled) return false
            const sched: any = (r as any).schedules?.[0]
            if (sched) {
                if (!(sched.days_mask & (1 << dayBit))) return false
                if (sched.start_time && timeStr < sched.start_time) return false
                if (sched.end_time && timeStr > sched.end_time) return false
                if (sched.date_from && now.toISOString().slice(0, 10) < sched.date_from) return false
                if (sched.date_to && now.toISOString().slice(0, 10) > sched.date_to) return false
            }
            if (r.target_type === 'GLOBAL') return true
            if (r.target_type === 'DEVICE' && r.target_id === dev.id) return true
            if (r.target_type === 'STORE' && r.target_id === dev.store_id) return true
            if (r.target_type === 'ROLE' && r.target_id === dev.role_id) return true
            return false
        })

        const priority = { DEVICE: 4, STORE: 3, ROLE: 2, GLOBAL: 1 }
        matchingRules.sort((a, b) => {
            const pa = (priority[a.target_type] || 0) * 10000 + a.priority
            const pb = (priority[b.target_type] || 0) * 10000 + b.priority
            return pb - pa
        })

        setPreviewResult(matchingRules[0] || null)
    }

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        Rules &amp; Scheduling
                    </h1>
                    <p className="text-text-2 mt-2 text-lg">Define display layout rules with targeting and scheduling</p>
                </div>
                <div className="flex gap-4">
                    <button className="btn-secondary" onClick={() => setShowPreview(true)}>
                        <Eye size={18} /> Preview Device
                    </button>
                    <button id="create-rule-btn" className="btn-primary shadow-xl shadow-brand-500/20" onClick={openCreate}>
                        <Plus size={18} /> New Rule
                    </button>
                </div>
            </div>

            <div className="card-glass border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-surface-900/50 mb-6 p-4">
                <div className="relative maxWidth-360">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
                    <input type="text" className="input-field pl-12" placeholder="Search rules..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1) }} />
                </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-2)' }}><Loader2 size={24} style={{ margin: '0 auto' }} /></div>
                ) : paginated.length === 0 ? (
                    <div className="empty-state">
                        <CalendarRange size={40} />
                        <h3>No rules</h3>
                        <p>Create rules to assign layouts globally or per store/role/device.</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Enabled</th>
                                        <th>Name</th>
                                        <th>Target</th>
                                        <th>Priority</th>
                                        <th>Layout</th>
                                        <th>Schedule</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginated.map(r => {
                                        const sched: any = (r as any).schedules?.[0]
                                        return (
                                            <tr key={r.id}>
                                                <td>
                                                    <button onClick={() => toggleEnabled(r)} className={`bg-transparent border-none cursor-pointer flex items-center transition-colors ${r.enabled ? 'text-green-500' : 'text-slate-400'}`}>
                                                        {r.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                                                    </button>
                                                </td>
                                                <td className="font-bold text-slate-900 dark:text-white">{r.name}</td>
                                                <td>
                                                    <span className={`badge ${r.target_type === 'GLOBAL' ? 'badge-yellow' : r.target_type === 'DEVICE' ? 'badge-blue' : 'badge-gray'}`}>
                                                        {r.target_type}
                                                    </span>
                                                </td>
                                                <td className="text-text-2 font-medium">{r.priority}</td>
                                                <td className="text-text-2 text-sm italic font-medium">{(r as any).layout?.name || '—'}</td>
                                                <td className="text-xs font-bold tracking-tight text-text-3">
                                                    {sched ? (
                                                        <div className="space-y-0.5">
                                                            <div className="uppercase tracking-widest">{maskToDays(sched.days_mask)}</div>
                                                            {sched.start_time && <div className="text-brand-500">{sched.start_time}–{sched.end_time || '∞'}</div>}
                                                        </div>
                                                    ) : <span className="text-green-500">Always Active</span>}
                                                </td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => openEdit(r)} className="btn-secondary" style={{ padding: '0.375rem 0.625rem' }}>
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button onClick={() => handleDelete(r.id)} className="btn-danger" style={{ padding: '0.375rem 0.625rem' }}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
                    </>
                )}
            </div>

            {/* Rule Modal */}
            {showModal && (
                <Modal title={editing ? 'Edit Rule' : 'New Rule'} onClose={() => setShowModal(false)}>
                    <form onSubmit={handleSave}>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Rule Name *</label>
                                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Lunchtime Menu" />
                            </div>
                            <div className="form-group">
                                <label className="label">Priority (higher = wins)</label>
                                <input type="number" className="input-field" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Target Type</label>
                                <select className="input-field" value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value as any, target_id: '' }))}>
                                    <option value="GLOBAL">Global (all devices)</option>
                                    <option value="STORE">Store</option>
                                    <option value="ROLE">Role</option>
                                    <option value="DEVICE">Device</option>
                                </select>
                            </div>
                            {form.target_type !== 'GLOBAL' && (
                                <div className="form-group">
                                    <label className="label">Select Target</label>
                                    <select className="input-field" value={form.target_id} onChange={e => setForm(f => ({ ...f, target_id: e.target.value }))}>
                                        <option value="">— Select —</option>
                                        {form.target_type === 'STORE' && stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        {form.target_type === 'ROLE' && roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        {form.target_type === 'DEVICE' && devices.map(d => <option key={d.id} value={d.id}>{d.device_code} {d.display_name ? `(${d.display_name})` : ''}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label className="label">Layout</label>
                            <select className="input-field" value={form.layout_id} onChange={e => setForm(f => ({ ...f, layout_id: e.target.value }))}>
                                <option value="">— No Layout —</option>
                                {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="checkbox-label">
                                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
                                Enabled
                            </label>
                        </div>

                        {/* Schedule */}
                        <div style={{ borderTop: '1px solid #334155', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <div className="label" style={{ marginBottom: '0.75rem' }}>Schedule</div>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <div className="label" style={{ marginBottom: '0.5rem' }}>Active Days</div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {DAYS.map((day, i) => (
                                        <button key={day} type="button"
                                            onClick={() => setDayToggles(t => t.map((v, j) => j === i ? !v : v))}
                                            className={`p-2 rounded-xl border-2 text-xs font-black tracking-widest transition-all cursor-pointer ${dayToggles[i] ? 'bg-brand-500 border-brand-500 text-white' : 'bg-transparent border-slate-200 dark:border-white/10 text-text-3 hover:border-brand-500/50'}`}>
                                            {day.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-6 mb-6">
                                <div className="flex-1">
                                    <label className="label">Start Time</label>
                                    <input type="time" className="input-field" value={schedule.start_time} onChange={e => setSchedule(s => ({ ...s, start_time: e.target.value }))} />
                                </div>
                                <div className="flex-1">
                                    <label className="label">End Time</label>
                                    <input type="time" className="input-field" value={schedule.end_time} onChange={e => setSchedule(s => ({ ...s, end_time: e.target.value }))} />
                                </div>
                            </div>
                            <div className="flex gap-4 mb-4">
                                <div className="flex-1">
                                    <label className="label">Date From (optional)</label>
                                    <input type="date" className="input-field" value={schedule.date_from} onChange={e => setSchedule(s => ({ ...s, date_from: e.target.value }))} />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Date To (optional)</label>
                                    <input type="date" className="input-field" value={schedule.date_to} onChange={e => setSchedule(s => ({ ...s, date_to: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn-primary" disabled={saving}>
                                {saving && <Loader2 size={14} />}
                                {saving ? 'Saving…' : editing ? 'Update Rule' : 'Create Rule'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Effective Preview */}
            {showPreview && (
                <Modal title="Effective Layout Preview" onClose={() => setShowPreview(false)}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-2)', marginTop: 0 }}>
                        Select a device to simulate which rule would match right now (client-side approximation).
                    </p>
                    <div className="form-group">
                        <label className="label">Select Device</label>
                        <select className="input-field" value={previewDevice} onChange={e => setPreviewDevice(e.target.value)}>
                            <option value="">— Select Device —</option>
                            {devices.map(d => <option key={d.id} value={d.device_code}>{d.device_code}{d.display_name ? ` — ${d.display_name}` : ''}</option>)}
                        </select>
                    </div>
                    <button className="btn-primary" onClick={runPreview} style={{ marginBottom: '1rem' }}>Run Preview</button>

                    {previewResult !== undefined && (
                        <div className="mt-8 rounded-2xl p-6 bg-slate-900 border border-white/10 shadow-2xl">
                            {previewResult ? (
                                <>
                                    <div className="text-green-400 font-bold mb-4 flex items-center gap-2">
                                        <CheckCircle2 size={18} /> Match Found
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                            <span className="text-slate-400 text-sm">Rule</span>
                                            <span className="text-white font-bold">{previewResult.name}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                            <span className="text-slate-400 text-sm">Target</span>
                                            <span className={`badge ${previewResult.target_type === 'GLOBAL' ? 'badge-yellow' : 'badge-blue'}`}>{previewResult.target_type}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                            <span className="text-slate-400 text-sm">Priority</span>
                                            <span className="text-white font-bold">{previewResult.priority}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                            <span className="text-slate-400 text-sm">Layout</span>
                                            <span className="text-brand-400 font-bold italic">{(previewResult as any).layout?.name || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-400 text-sm">Schedule</span>
                                            {(() => {
                                                const sched: any = (previewResult as any).schedules?.[0]
                                                if (!sched) return <span className="text-green-500 font-bold uppercase tracking-widest text-[10px]">Always active</span>
                                                return (
                                                    <span className="text-text-2 font-bold text-[10px] uppercase tracking-widest">
                                                        {maskToDays(sched.days_mask)}{sched.start_time ? `, ${sched.start_time}–${sched.end_time || '∞'}` : ''}
                                                    </span>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-orange-400 font-medium flex items-center gap-2">
                                    <AlertCircle size={18} /> No matching rule for this device at current time.
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    )
}
