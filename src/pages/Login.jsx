import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Zap } from 'lucide-react'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = isSignUp ? await signUp(email, password) : await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#0f1117' }}>
      {/* Left panel */}
      <div style={{
        width: '45%', background: 'linear-gradient(135deg, #1a1d2e 0%, #0f1117 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '64px',
        borderRight: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '48px' }}>
          <div style={{ width: 36, height: 36, background: '#6c63ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} color="#fff" />
          </div>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>PlaceIQ</span>
        </div>

        <h1 style={{ color: '#fff', fontSize: 36, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-1px', marginBottom: 16 }}>
          Automate your<br />bench sales workflow
        </h1>
        <p style={{ color: '#6b7280', fontSize: 16, lineHeight: 1.7, marginBottom: 48 }}>
          AI-powered platform for IT staffing companies. Match consultants to jobs, automate outreach, and close placements faster.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {[
            ['🎯', 'AI Matching', 'Instantly match bench consultants to job requirements'],
            ['⚡', 'Auto Outreach', 'Automated vendor emails and follow-up sequences'],
            ['📊', 'Pipeline Tracking', 'Track every submission from bench to placement'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div>
                <p style={{ color: '#e5e7eb', fontWeight: 600, fontSize: 14 }}>{title}</p>
                <p style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h2 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.5px' }}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 32 }}>
            {isSignUp ? 'Start your free trial today' : 'Sign in to your PlaceIQ dashboard'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@company.com"
                style={{ background: '#1e2130', border: '1.5px solid #2d3148', color: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: 14 }} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                style={{ background: '#1e2130', border: '1.5px solid #2d3148', color: '#fff', borderRadius: 10, padding: '12px 16px', fontSize: 14 }} />
            </div>

            {error && (
              <div style={{ background: '#2d1b1b', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              background: loading ? '#4c45b3' : '#6c63ff', color: '#fff', border: 'none',
              borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', marginTop: 4,
              transition: 'background 0.15s', letterSpacing: '0.01em'
            }}>
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 24, textAlign: 'center' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => setIsSignUp(!isSignUp)} style={{
              background: 'none', border: 'none', color: '#6c63ff', fontWeight: 600,
              cursor: 'pointer', fontSize: 13
            }}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
