import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Tv2, Key, Layout, PlayCircle, Monitor, ArrowLeft, ChevronRight } from 'lucide-react'

export default function GuidePage() {
    const navigate = useNavigate()

    const steps = [
        {
            title: "1. Access Admin CMS",
            description: "Log in to the central management portal using your administrator credentials. This is where you control your entire display network.",
            icon: <Key className="text-brand-400" />,
            color: "rgba(239, 68, 68, 0.1)"
        },
        {
            title: "2. Upload Media & Layouts",
            description: "Upload your images and videos to the Media Library. Combine them into dynamic multi-region layouts using the Layout Builder.",
            icon: <Layout className="text-blue-400" />,
            color: "rgba(59, 130, 246, 0.1)"
        },
        {
            title: "3. Create & Publish Playlists",
            description: "Organize your content into playlists. Set scheduling rules and targeting roles, then publish to your devices.",
            icon: <PlayCircle className="text-emerald-400" />,
            color: "rgba(16, 185, 129, 0.1)"
        },
        {
            title: "4. Pair Your Display",
            description: "Open the player URL on your display device. Use the generated pairing PIN or the device secret code to sync it with your CMS.",
            icon: <Monitor className="text-amber-400" />,
            color: "rgba(245, 158, 11, 0.1)"
        }
    ]

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-surface-950)', color: 'white' }}>
            {/* Header */}
            <header style={{
                height: 80,
                display: 'flex',
                alignItems: 'center',
                padding: '0 5%',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
                background: 'rgba(10, 15, 29, 0.8)', backdropFilter: 'blur(12px)'
            }}>
                <button
                    onClick={() => navigate('/')}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}
                >
                    <ArrowLeft size={16} /> Back to Home
                </button>
            </header>

            <main style={{ padding: '140px 5% 100px', maxWidth: 1000, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: 16,
                        background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-brand-600))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                        boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)'
                    }}>
                        <Tv2 size={32} color="white" />
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 900, marginBottom: '1rem' }}>Getting Started Guide</h1>
                    <p style={{ color: '#64748b', fontSize: '1.25rem' }}>Master the OmniPush Digital Signage workflow in 4 simple steps.</p>
                </div>

                <div style={{ display: 'grid', gap: '2rem' }}>
                    {steps.map((s, i) => (
                        <div key={i} className="glassmorphism" style={{
                            display: 'flex', gap: '2rem', padding: '2.5rem', borderRadius: 24,
                            alignItems: 'flex-start', position: 'relative', overflow: 'hidden'
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 6, background: s.color.replace('0.1', '0.5') }} />
                            <div style={{
                                width: 56, height: 56, borderRadius: 14, background: s.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                border: '1px solid rgba(255,255,255,0.05)'
                            }}>
                                {React.cloneElement(s.icon as React.ReactElement<any>, { size: 28 })}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem', color: '#f1f5f9' }}>{s.title}</h3>
                                <p style={{ color: '#94a3b8', lineHeight: 1.7, fontSize: '1.0625rem' }}>{s.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: '5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: 24, padding: '3rem', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>Need technical assistance?</h2>
                    <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Our support team is available 24/7 to help you with hardware setup and network configuration.</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                        <button className="btn-primary" style={{ padding: '0.75rem 2rem' }}>Contact Support</button>
                        <button className="btn-secondary" style={{ padding: '0.75rem 2rem', background: 'rgba(255,255,255,0.05)' }}>Knowledge Base</button>
                    </div>
                </div>
            </main>

            <footer style={{ padding: '50px 5%', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: '#475569', fontSize: '0.875rem' }}>
                © 2026 OmniPush Digital Services · Empowering Retail Spaces
            </footer>
        </div>
    )
}
