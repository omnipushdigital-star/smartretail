import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Tv2, Layout, Database, Activity, Shield, ArrowRight, Monitor, PlayCircle, Layers, Settings } from 'lucide-react'

export default function LandingPage() {
    const navigate = useNavigate()

    const features = [
        {
            icon: <Layout className="text-brand-500" size={24} />,
            title: "Dynamic Layouts",
            description: "Design multi-region layouts with ease. Support for images, videos, and dynamic web content."
        },
        {
            icon: <PlayCircle className="text-brand-500" size={24} />,
            title: "Smart Playlists",
            description: "Schedule content with powerful rules based on roles, locations, and time of day."
        },
        {
            icon: <Activity className="text-brand-500" size={24} />,
            title: "Real-time Monitoring",
            description: "Track your entire display network in real-time. Get instant alerts and heartbeat data."
        },
        {
            icon: <Shield className="text-brand-500" size={24} />,
            title: "Enterprise Security",
            description: "Role-based access control and multi-tenant isolation for global retail chains."
        },
        {
            icon: <Layers className="text-brand-500" size={24} />,
            title: "Edge Delivery",
            description: "Reliable content delivery via Supabase Edge Functions for lightning-fast performance."
        },
        {
            icon: <Settings className="text-brand-500" size={24} />,
            title: "Remote Management",
            description: "Update settings, reboot devices, and push firmware updates from a single dashboard."
        }
    ]

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-surface-950)', color: 'white', overflowX: 'hidden' }}>
            {/* Background Effects */}
            <div style={{ position: 'fixed', top: '-10%', right: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(239, 68, 68, 0.08) 0%, transparent 70%)', filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0 }} />
            <div style={{ position: 'fixed', bottom: '-10%', left: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(239, 68, 68, 0.05) 0%, transparent 70%)', filter: 'blur(100px)', pointerEvents: 'none', zIndex: 0 }} />

            {/* Navigation */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                    }}>
                        <Tv2 size={22} color="white" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>OmniPush</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <a href="#features" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#94a3b8', textDecoration: 'none', transition: 'color 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'white')} onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}>Features</a>
                    <button
                        onClick={() => navigate('/login')}
                        className="btn-primary"
                        style={{ padding: '0.625rem 1.5rem' }}
                    >
                        Admin CMS <ArrowRight size={16} />
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <section style={{
                padding: '160px 5% 100px',
                textAlign: 'center',
                position: 'relative',
                zIndex: 1
            }}>
                <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '99px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: 'var(--color-brand-400)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: '2rem'
                }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-brand-500)', boxShadow: '0 0 10px var(--color-brand-500)' }} />
                    Next-Gen Retail Signage
                </div>

                <h1 style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                    fontWeight: 900,
                    lineHeight: 1.1,
                    maxWidth: 900,
                    margin: '0 auto 1.5rem',
                    background: 'linear-gradient(to bottom, #ffffff 100%, #94a3b8 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                }}>
                    Transform Your Stores into <span style={{ color: 'var(--color-brand-500)', WebkitTextFillColor: 'initial' }}>Digital Experiences</span>
                </h1>

                <p style={{
                    fontSize: '1.25rem',
                    color: '#94a3b8',
                    maxWidth: 700,
                    margin: '0 auto 3rem',
                    lineHeight: 1.6
                }}>
                    The all-in-one Smart Retail Display system to manage global signage networks.
                    Publish content, manage layouts, and monitor health from a unified cloud dashboard.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/login')}
                        className="btn-primary"
                        style={{ padding: '1rem 2.5rem', fontSize: '1rem' }}
                    >
                        Launch CMS <ArrowRight size={20} />
                    </button>
                    <button
                        className="btn-secondary"
                        style={{ padding: '1rem 2.5rem', fontSize: '1rem', background: 'rgba(255,255,255,0.03)' }}
                    >
                        View Public Player
                    </button>
                </div>

                {/* Hero Image / Mockup */}
                <div className="animate-float" style={{
                    marginTop: '5rem',
                    position: 'relative',
                    maxWidth: 1000,
                    margin: '5rem auto 0',
                    padding: '1rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 24,
                    boxShadow: '0 40px 100px rgba(0,0,0,0.5)'
                }}>
                    <div style={{
                        background: '#0a0f1d',
                        borderRadius: 16,
                        aspectRatio: '16/9',
                        overflow: 'hidden',
                        position: 'relative'
                    }}>
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(45deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Monitor size={80} className="text-surface-700 opacity-20" />
                        </div>
                        {/* Placeholder for real screenshot */}
                        <div style={{ position: 'absolute', top: 20, left: 20, right: 20, height: 40, background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 1rem', gap: '0.5rem' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section id="features" style={{ padding: '100px 5%', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, marginBottom: '1rem' }}>
                        Enterprise-Grade Control
                    </h2>
                    <p style={{ color: '#64748b', fontSize: '1.125rem' }}>Everything you need to run a high-performance retail network.</p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '2rem',
                    maxWidth: 1200,
                    margin: '0 auto'
                }}>
                    {features.map((f, i) => (
                        <div key={i} className="glassmorphism" style={{
                            padding: '2.5rem',
                            borderRadius: 20,
                            transition: 'transform 0.3s ease',
                            cursor: 'default'
                        }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-5px)')}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}>
                            <div style={{
                                width: 50, height: 50, borderRadius: 12,
                                background: 'rgba(239, 68, 68, 0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: '1.5rem',
                                border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}>
                                {f.icon}
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', color: '#f1f5f9' }}>{f.title}</h3>
                            <p style={{ color: '#64748b', lineHeight: 1.6, fontSize: '0.9375rem' }}>{f.description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section style={{ padding: '120px 5%', textAlign: 'center' }}>
                <div className="glassmorphism" style={{
                    maxWidth: 1000,
                    margin: '0 auto',
                    padding: '5rem 2rem',
                    borderRadius: 32,
                    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.8) 100%)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(239, 68, 68, 0.5), transparent)' }} />

                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 800, marginBottom: '1.5rem' }}>
                        Ready to elevate your <br /> in-store presence?
                    </h2>
                    <p style={{ fontSize: '1.125rem', color: '#94a3b8', maxWidth: 600, margin: '0 auto 2.5rem' }}>
                        Join leading retailers worldwide using OmniPush to power their digital signage strategy.
                    </p>
                    <button
                        onClick={() => navigate('/login')}
                        className="btn-primary"
                        style={{ padding: '1rem 3rem', fontSize: '1.125rem' }}
                    >
                        Get Started Today <ArrowRight size={20} />
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer style={{ padding: '50px 5% 100px', borderTop: '1px solid rgba(255,255,255,0.05)', color: '#475569', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Tv2 size={24} className="text-brand-500" />
                        <span style={{ fontWeight: 700, color: '#94a3b8' }}>OmniPush Digital</span>
                    </div>
                    <div>
                        © 2026 OmniPush Digital Services. All rights reserved.
                    </div>
                    <div style={{ display: 'flex', gap: '2rem' }}>
                        <a href="/login" style={{ color: 'inherit', textDecoration: 'none' }}>Admin Login</a>
                        <a href="/status" style={{ color: 'inherit', textDecoration: 'none' }}>Network Status</a>
                        <a href="/guide" style={{ color: 'inherit', textDecoration: 'none' }}>Guide</a>
                        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
                    </div>
                </div>
            </footer>
        </div>
    )
}
