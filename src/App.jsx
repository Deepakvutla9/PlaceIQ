import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Consultants from './pages/Consultants'
import Vendors from './pages/Vendors'
import JobInbox from './pages/JobInbox'
import Tracker from './pages/Tracker'
import HotDesk from './pages/HotDesk'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/consultants" element={<ProtectedRoute><Consultants /></ProtectedRoute>} />
      <Route path="/vendors" element={<ProtectedRoute><Vendors /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><JobInbox /></ProtectedRoute>} />
      <Route path="/tracker" element={<ProtectedRoute><Tracker /></ProtectedRoute>} />
      <Route path="/hotdesk" element={<ProtectedRoute><HotDesk /></ProtectedRoute>} />
      <Route path="/outbox" element={<Navigate to="/hotdesk" replace />} />
      <Route path="/matcher" element={<Navigate to="/hotdesk" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}
