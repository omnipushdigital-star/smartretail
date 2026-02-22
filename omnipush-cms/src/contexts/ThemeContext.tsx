import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggleTheme: () => { } })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem('omnipush-theme') as Theme) || 'dark'
    })

    useEffect(() => {
        document.body.classList.remove('dark', 'light')
        document.body.classList.add(theme)
        localStorage.setItem('omnipush-theme', theme)
    }, [theme])

    const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    return useContext(ThemeContext)
}
