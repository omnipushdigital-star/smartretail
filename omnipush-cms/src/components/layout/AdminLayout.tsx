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
                            background: 'linear-gradient(90deg, #5a64f6, #06b6d4)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase'
                        }}>
                            OMNIPUSH SMART RETAIL DISPLAY
                        </span>
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
                        background: 'linear-gradient(135deg, #5a64f6, #4347ea)',
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
