import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Trash2, Download, CheckCircle2, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface AppUpdate {
    id: string
    version_code: number
    version_name: string
    apk_url: string
    force_update: boolean
    notes: string | null
    created_at: string
}

export default function AppUpdatesPage() {
    const [updates, setUpdates] = useState<AppUpdate[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [newUpdate, setNewUpdate] = useState({
        version_code: '',
        version_name: '',
        apk_url: '',
        force_update: false,
        notes: ''
    })

    useEffect(() => {
        fetchUpdates()
    }, [])

    async function fetchUpdates() {
        setLoading(true)
        const { data, error } = await supabase
            .from('app_updates')
            .select('*')
            .order('version_code', { ascending: false })

        if (error) {
            toast.error('Failed to load updates')
        } else {
            setUpdates(data || [])
        }
        setLoading(false)
    }

    async function handleAdd() {
        if (!newUpdate.version_code || !newUpdate.version_name || !newUpdate.apk_url) {
            toast.error('Please fill required fields')
            return
        }

        const { error } = await supabase
            .from('app_updates')
            .insert([{
                version_code: parseInt(newUpdate.version_code),
                version_name: newUpdate.version_name,
                apk_url: newUpdate.apk_url,
                force_update: newUpdate.force_update,
                notes: newUpdate.notes
            }])

        if (error) {
            toast.error('Failed to add update')
        } else {
            toast.success('Update added successfully')
            setShowAdd(false)
            fetchUpdates()
            setNewUpdate({ version_code: '', version_name: '', apk_url: '', force_update: false, notes: '' })
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this update version?')) return

        const { error } = await supabase
            .from('app_updates')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error('Failed to delete update')
        } else {
            toast.success('Update deleted')
            fetchUpdates()
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Android App Updates</h1>
                    <p className="text-slate-400 text-sm mt-1">Manage APK versions and automatic delivery to devices.</p>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-all font-medium shadow-lg shadow-brand-500/20"
                >
                    <Plus size={18} />
                    {showAdd ? 'Cancel' : 'Add New Version'}
                </button>
            </div>

            {showAdd && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Version Code (Number)</label>
                            <input
                                type="number"
                                value={newUpdate.version_code}
                                onChange={e => setNewUpdate({ ...newUpdate, version_code: e.target.value })}
                                placeholder="e.g. 2"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Version Name</label>
                            <input
                                type="text"
                                value={newUpdate.version_name}
                                onChange={e => setNewUpdate({ ...newUpdate, version_name: e.target.value })}
                                placeholder="e.g. 1.0.1"
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-sm font-medium text-slate-300">APK Direct URL (Google Drive/S3)</label>
                            <input
                                type="text"
                                value={newUpdate.apk_url}
                                onChange={e => setNewUpdate({ ...newUpdate, apk_url: e.target.value })}
                                placeholder="https://drive.google.com/uc?export=download&id=..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <label className="text-sm font-medium text-slate-300">Release Notes</label>
                            <textarea
                                value={newUpdate.notes}
                                onChange={e => setNewUpdate({ ...newUpdate, notes: e.target.value })}
                                placeholder="What's new in this version?"
                                rows={3}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="force_update"
                                checked={newUpdate.force_update}
                                onChange={e => setNewUpdate({ ...newUpdate, force_update: e.target.checked })}
                                className="rounded border-slate-700 bg-slate-900 text-brand-500 focus:ring-brand-500"
                            />
                            <label htmlFor="force_update" className="text-sm text-slate-300">Force Update (Immediate)</label>
                        </div>
                    </div>
                    <div className="pt-2">
                        <button
                            onClick={handleAdd}
                            className="w-full md:w-auto px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-all"
                        >
                            Set Active Update
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-700/50">
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Version</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Release Date</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">Loading version history...</td>
                            </tr>
                        ) : updates.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">No updates published yet.</td>
                            </tr>
                        ) : (
                            updates.map((update, i) => (
                                <tr key={update.id} className="hover:bg-slate-700/20 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${i === 0 ? 'bg-brand-500/10 text-brand-400' : 'bg-slate-700/50 text-slate-400'}`}>
                                                <Download size={18} />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-white">v{update.version_name}</div>
                                                <div className="text-xs text-slate-500">Code: {update.version_code}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {i === 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                <CheckCircle2 size={12} />
                                                Active Latest
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-400 border border-slate-700/50">
                                                Legacy
                                            </span>
                                        )}
                                        {update.force_update && (
                                            <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                Forced
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-400">
                                        {new Date(update.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-400 max-w-xs truncate">
                                        {update.notes || 'No notes provided'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(update.id)}
                                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
