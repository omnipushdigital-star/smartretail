import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Suppress Supabase JS internal schema-validation errors that aren't actionable
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e?.reason?.message || e?.reason || '')
  if (msg.includes('querying schema') || msg.includes('Failed to fetch schema')) {
    e.preventDefault()
  }
})

console.log('[System] [BOOT] React main.tsx running...')
const rootEl = document.getElementById('root')
if (rootEl) rootEl.innerHTML = '' // Clear JS Booting... message

createRoot(rootEl!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

