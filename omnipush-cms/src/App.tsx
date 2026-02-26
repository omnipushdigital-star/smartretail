import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import AdminLayout from './components/layout/AdminLayout'
import LoginPage from './pages/LoginPage'
import PlayerPage from './pages/PlayerPage'
import DashboardPage from './pages/admin/DashboardPage'
import StoresPage from './pages/admin/StoresPage'
import RolesPage from './pages/admin/RolesPage'
import DevicesPage from './pages/admin/DevicesPage'
import MediaPage from './pages/admin/MediaPage'
import PlaylistsPage from './pages/admin/PlaylistsPage'
import LayoutTemplatesPage from './pages/admin/LayoutTemplatesPage'
import LayoutsPage from './pages/admin/LayoutsPage'
import RulesPage from './pages/admin/RulesPage'
import PublishPage from './pages/admin/PublishPage'
import MonitoringPage from './pages/admin/MonitoringPage'
import DbMigrationPage from './pages/admin/DbMigrationPage'
import EdgeFunctionsPage from './pages/admin/EdgeFunctionsPage'
import RlsSetupPage from './pages/admin/RlsSetupPage'
import BundlesPage from './pages/admin/BundlesPage'
import TenantOnboardingPage from './pages/admin/TenantOnboardingPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #334155', borderTopColor: 'var(--color-brand-500)', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
          Loading…
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/player/:device_code" element={<PlayerPage />} />

      {/* Admin (protected) */}
      <Route path="/admin" element={
        <ProtectedRoute>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="stores" element={<StoresPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="layout-templates" element={<LayoutTemplatesPage />} />
        <Route path="layouts" element={<LayoutsPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="publish" element={<PublishPage />} />
        <Route path="bundles" element={<BundlesPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="db-migration" element={<DbMigrationPage />} />
        <Route path="edge-functions" element={<EdgeFunctionsPage />} />
        <Route path="rls-setup" element={<RlsSetupPage />} />
        <Route path="onboarding" element={<TenantOnboardingPage />} />
      </Route>

      {/* Redirect root */}
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/signage">
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid #334155',
                borderRadius: '10px',
                fontSize: '0.875rem',
              },
              success: {
                iconTheme: { primary: '#22c55e', secondary: '#1e293b' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#1e293b' },
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
