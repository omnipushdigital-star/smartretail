import React from 'react'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    padding?: 'none' | 'sm' | 'md' | 'lg'
    glass?: boolean
}

export function Card({ children, padding = 'md', glass = false, className = '', ...props }: CardProps) {
    let classes = 'rounded-xl overflow-hidden '
    
    // Glassmorphism or solid
    if (glass) {
        classes += 'bg-surface-500/70 backdrop-blur-xl border border-white/5 shadow-2xl '
    } else {
        classes += 'bg-surface-500 border border-white/5 shadow-lg '
    }

    // Padding
    if (padding === 'sm') classes += 'p-4 '
    if (padding === 'md') classes += 'p-6 '
    if (padding === 'lg') classes += 'p-8 '

    return (
        <div className={`${classes} ${className}`} {...props}>
            {children}
        </div>
    )
}

export function CardHeader({ children, className = '' }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={`mb-4 flex items-center justify-between ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className={`font-display font-semibold text-text-1 text-lg ${className}`}>{children}</h3>
}

export function CardDescription({ children, className = '' }: React.HTMLAttributes<HTMLParagraphElement>) {
    return <p className={`text-text-2 text-sm mt-1 ${className}`}>{children}</p>
}
