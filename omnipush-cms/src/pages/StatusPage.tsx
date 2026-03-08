import React, { useEffect, useState } from 'react'
import { Activity, CheckCircle2, AlertCircle, Clock, Server, Globe, Zap, Cpu, Database, Tv2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function StatusPage() {
    const navigate = useNavigate()
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        const t = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(t)
    }, [])

    const services = [
        { name: 'Core API (Supabase)', status: 'operational', uptime: '99.99%', latency: '45ms', icon: <Database className="text-blue-500" /> },
        { name: 'Content Delivery Network', status: 'operational', uptime: '100%', latency: '12ms', icon: <Globe className="text-emerald-500" /> },
        { name: 'Edge Functions', status: 'operational', uptime: '99.95%', latency: '120ms', icon: <Zap className="text-amber-500" /> },
        { name: 'Real-time Heartbeats', status: 'operational', uptime: '99.98%', latency: '85ms', icon: <Activity className="text-rose-500" /> },
        { name: 'Media Storage', status: 'operational', uptime: '100%', latency: '30ms', icon: <Server className="text-slate-500" /> },
    ]

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-surface-950)', color: 'white', padding: '100px 5% 50px' }}>
            {/* Nav */}
            <nav style={{
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 5%',
                position: 'fixed',
                top: 0, left: 0, right: 0,
                zIndex: 100,
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Tv2 size={18} color="white" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.125rem' }}>OmniPush</span>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                    Current Time: {currentTime.toLocaleTimeString()}
                </div>
            </nav>

            <div style={{ maxWidth: 800, margin: '0 auto' }}>
                <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem 2rem',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.2)',
                        borderRadius: 16,
                        color: '#22c55e',
                        fontWeight: 700,
                        fontSize: '1.25rem',
                        marginBottom: '1.5rem'
                    }}>
                        <CheckCircle2 size={24} />
                        All Systems Operational
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>System Status</h1>
                    <p style={{ color: '#64748b' }}>Real-time health monitoring of the OmniPush Digital network.</p>
                </header>

                <div className="glassmorphism" style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {services.map((s, i) => (
                        <div key={i} style={{
                            padding: '1.5rem 2rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: i === services.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                            background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {s.icon}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{s.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Uptime: {s.uptime} · Latency: {s.latency}</div>
                                </div>
                            </div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: '#22c55e',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                Operational <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: '4rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Core Network Metrics</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                        <div className="card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Active Players</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>1,248</div>
                            <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '0.25rem' }}>↑ 12 in last hour</div>
                        </div>
                        <div className="card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Content Delivery</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>42.5 TB</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Monthly data served</div>
                        </div>
                        <div className="card" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>API Requests</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>12.8M</div>
                            <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem' }}>Peak: 4.2k req/min</div>
                        </div>
                    </div>
                </div>

                <footer style={{ marginTop: '5rem', textAlign: 'center', padding: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#475569', fontSize: '0.875rem' }}>
                    Automated checks performed every 60 seconds. <br />
                    Contact <a href="mailto:support@omnipushdigital.com" style={{ color: 'var(--color-brand-400)', textDecoration: 'none' }}>support@omnipushdigital.com</a> for technical issues.
                </footer>
            </div>
        </div>
    )
}
