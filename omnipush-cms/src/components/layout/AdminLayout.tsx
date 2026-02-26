import React from 'react'
import { Outlet } from 'react-router-dom'
import { Moon, Sun, Bell } from 'lucide-react'
import Sidebar from './Sidebar'
import { useTheme } from '../../contexts/ThemeContext'

export default function AdminLayout() {
    const { theme, toggleTheme } = useTheme()

    return (
        <div style={{ display: 'flex' }}>
            <Sidebar />
            <div className="main-content" style={{ flex: 1 }}>
                {/* Top bar */}
                <header className="topbar">
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                        <span style={{
                            fontSize: '1.125rem',
                            fontWeight: 800,
                            background: 'linear-gradient(90deg, #ef4444, #f97316)',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            color: 'transparent',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            display: 'inline-block'
                        }}>
                            OMNIPUSH SMART RETAIL DISPLAY
                        </span>
                        <span style={{ margin: '0 0.75rem', color: '#334155', fontSize: '1.25rem', fontWeight: 300 }}>|</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '6px',
                                background: 'white', display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                padding: '3px', overflow: 'hidden',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <img
                                    src="https://i.ibb.co/vzB7K8N/apache-pizza-logo.png"
                                    alt="Apache Pizza"
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    onError={(e) => {
                                        const parent = e.currentTarget.parentElement;
                                        if (parent) {
                                            parent.innerHTML = '<span style="color: #ef4444; font-size: 10px; font-weight: 900;">AP</span>';
                                        }
                                    }}
                                />
                            </div>
                            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.02em' }}>
                                Apache Pizza
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={toggleTheme}
                        style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                    >
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <button
                        style={{ background: 'none', border: '1px solid #334155', borderRadius: 8, padding: '0.375rem 0.625rem', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', position: 'relative' }}
                    >
                        <Bell size={16} />
                        <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                    </button>
                    <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 600, color: 'white'
                    }}>
                        A
                    </div>
                </header>
                <main className="page-content fade-in">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
