import React, { forwardRef } from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className = '', label, error, icon, ...props }, ref) => {
        const id = props.id || props.name

        return (
            <div className="w-full flex flex-col gap-1.5">
                {label && (
                    <label htmlFor={id} className="text-xs font-semibold text-text-2 uppercase tracking-wider">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {icon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3">
                            {icon}
                        </div>
                    )}
                    <input
                        id={id}
                        ref={ref}
                        className={`
                            w-full bg-surface-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 
                            outline-none transition-all duration-200 placeholder:text-text-3
                            focus:border-brand-500 focus:ring-1 focus:ring-brand-500/50
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${icon ? 'pl-9' : ''}
                            ${error ? 'border-error focus:border-error focus:ring-error/50' : ''}
                            ${className}
                        `}
                        {...props}
                    />
                </div>
                {error && <span className="text-xs text-error mt-0.5">{error}</span>}
            </div>
        )
    }
)

Input.displayName = 'Input'
