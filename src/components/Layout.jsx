import { NavLink, useNavigate } from 'react-router-dom'
import { Users, Zap, LayoutDashboard, LogOut, Building2, Inbox, Flame, KanbanSquare } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/consultants', label: 'Consultants', icon: Users },
  { to: '/vendors', label: 'Vendors', icon: Building2 },
  { to: '/inbox', label: 'Job Inbox', icon: Inbox },
  { to: '/hotdesk', label: 'HotDesk', icon: Flame },
  { to: '/tracker', label: 'Tracker', icon: KanbanSquare },
]

export default function Layout({ children }) {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() || 'U'

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f4f5f7' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, background: '#0f1117', display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.05)', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: '#6c63ff', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={16} color="#fff" />
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>PlaceIQ</p>
              <p style={{ color: '#4b5063', fontSize: 11, marginTop: 1 }}>Bench Sales Platform</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 10px' }}>
          <p style={{ color: '#3d4155', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 10px', marginBottom: 8 }}>Menu</p>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 8, marginBottom: 2, textDecoration: 'none', transition: 'all 0.15s',
                background: isActive ? 'rgba(108,99,255,0.15)' : 'transparent',
                color: isActive ? '#a5b4fc' : '#6b7280',
                fontWeight: isActive ? 600 : 400, fontSize: 14,
                borderLeft: isActive ? '2px solid #6c63ff' : '2px solid transparent',
              })}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: '#1a1d2e', marginBottom: 4 }}>
            <div style={{ width: 30, height: 30, background: '#6c63ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: '#e5e7eb', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email?.split('@')[0]}</p>
              <p style={{ color: '#4b5063', fontSize: 11 }}>Admin</p>
            </div>
          </div>
          <button onClick={handleSignOut} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            borderRadius: 8, width: '100%', background: 'none', border: 'none',
            color: '#6b7280', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
          }}
            onMouseOver={e => e.currentTarget.style.background = '#1e2130'}
            onMouseOut={e => e.currentTarget.style.background = 'none'}>
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', background: '#f4f5f7' }}>
        {children}
      </main>
    </div>
  )
}
