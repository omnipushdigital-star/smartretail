import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [loading, setLoading] = useState(false)
    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) { toast.error('Please fill all fields'); return }
        setLoading(true)
        const { error } = await signIn(email, password)
        setLoading(false)
        if (error) {
            toast.error(error.message || 'Invalid credentials')
        } else {
            toast.success('Welcome back!')
            navigate('/admin/dashboard')
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #450a0a 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }}>
            {/* Background orbs */}
            <div style={{ position: 'fixed', top: '20%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.08)', filter: 'blur(80px)', pointerEvents: 'none' }} />
            <div style={{ position: 'fixed', bottom: '20%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'rgba(220, 38, 38, 0.06)', filter: 'blur(60px)', pointerEvents: 'none' }} />

            <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <img
                        src="/logo.png"
                        alt="OmniPush"
                        style={{ height: 72, width: 'auto', margin: '0 auto 1rem', display: 'block', objectFit: 'contain' }}
                    />
                    <p style={{ color: '#64748b', marginTop: '0.375rem', fontSize: '0.875rem' }}>
                        Retail Display CMS — Admin Portal
                    </p>
                </div>

                {/* Card */}
                <div style={{
                    background: 'rgba(30,41,59,0.8)',
                    border: '1px solid #334155',
                    borderRadius: 16,
                    padding: '2rem',
                    backdropFilter: 'blur(12px)'
                }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600, color: '#f1f5f9', margin: '0 0 1.5rem' }}>
                        Sign in to your account
                    </h2>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="label">Email address</label>
                            <input
                                id="login-email"
                                type="email"
                                className="input-field"
                                placeholder="admin@omnipush.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="label">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="login-password"
                                    type={showPass ? 'text' : 'password'}
                                    className="input-field"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={loading}
                                    style={{ paddingRight: '2.5rem' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}
                                >
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <button
                            id="login-submit"
                            type="submit"
                            className="btn-primary"
                            style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem' }}
                            disabled={loading}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>

                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                            🔐 This portal is restricted to authorized administrators only.
                        </p>
                    </div>
                </div>

                <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: '#475569' }}>
                    OmniPush Digital Services © 2026 · All rights reserved
                </p>
            </div>
        </div>
    )
}
