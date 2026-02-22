import React from 'react'
import { X } from 'lucide-react'

interface ModalProps {
    title: string
    onClose: () => void
    children: React.ReactNode
    maxWidth?: string
}

export default function Modal({ title, onClose, children, maxWidth = '600px' }: ModalProps) {
    return (
        <div className="modal-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
        }}>
            <div className="modal-box" style={{ maxWidth }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, fontFamily: 'var(--font-display)', color: '#f1f5f9' }}>{title}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem', display: 'flex', lineHeight: 1 }}>
                        <X size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}
