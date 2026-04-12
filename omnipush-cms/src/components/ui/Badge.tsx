import React from 'react'

export type BadgeStatus = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'offline' | 'draft' | 'published'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    status?: BadgeStatus
    icon?: React.ReactNode
    size?: 'sm' | 'md'
}

export function Badge({ children, status = 'neutral', size = 'md', icon, className = '', ...props }: BadgeProps) {
    let classes = 'inline-flex items-center font-medium rounded-full '

    // Size
    if (size === 'sm') classes += 'px-2 py-0.5 text-[0.65rem] gap-1 '
    if (size === 'md') classes += 'px-2.5 py-0.5 text-xs gap-1.5 '

    // Colors
    switch (status) {
        case 'success':
        case 'published':
            classes += 'bg-success/15 text-success border border-success/20 '
            break
        case 'error':
        case 'offline':
            classes += 'bg-error/15 text-error border border-error/20 '
            break
        case 'warning':
        case 'draft':
            classes += 'bg-warning/15 text-warning border border-warning/20 '
            break
        case 'info':
            classes += 'bg-brand-500/15 text-brand-400 border border-brand-500/20 '
            break
        case 'neutral':
        default:
            classes += 'bg-surface-300 text-text-2 border border-surface-200/20 '
            break
    }

    return (
        <span className={`${classes} ${className}`} {...props}>
            {icon && <span className="flex-shrink-0">{icon}</span>}
            {children}
        </span>
    )
}
