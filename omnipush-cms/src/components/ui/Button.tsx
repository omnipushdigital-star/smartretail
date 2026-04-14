import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'glass' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    icon?: React.ReactNode
    isLoading?: boolean
}

export function Button({
    children,
    variant = 'primary',
    size = 'md',
    icon,
    isLoading,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    // Base classes
    let classes = 'inline-flex items-center justify-center font-medium transition-all duration-200 outline-none rounded-lg disabled:opacity-50 disabled:cursor-not-allowed '

    // Size classes
    if (size === 'sm') classes += 'text-xs px-3 py-1.5 gap-1.5 '
    if (size === 'md') classes += 'text-sm px-4 py-2 gap-2 '
    if (size === 'lg') classes += 'text-base px-6 py-3 gap-2 '

    // Variant classes
    if (variant === 'primary') {
        classes += 'bg-gradient-to-br from-brand-500 to-brand-600 text-brand-900 border-none shadow-md hover:shadow-brand-500/40 hover:-translate-y-px active:translate-y-0 '
    } else if (variant === 'secondary') {
        classes += 'bg-surface-300 text-text-1 border border-surface-200/20 hover:bg-surface-200/30 '
    } else if (variant === 'danger') {
        classes += 'bg-error text-white border-none hover:bg-error/80 hover:-translate-y-px '
    } else if (variant === 'glass') {
        classes += 'bg-white/5 backdrop-blur-md text-text-2 hover:text-text-1 hover:bg-white/10 border border-white/5 '
    } else if (variant === 'ghost') {
        classes += 'bg-transparent text-text-2 hover:text-text-1 hover:bg-surface-300 '
    }

    return (
        <button
            disabled={disabled || isLoading}
            className={`${classes} ${className}`}
            {...props}
        >
            {isLoading ? (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            ) : icon}
            {children}
        </button>
    )
}
