import { useEffect, useState } from 'react'
import { Users, Briefcase, TrendingUp, Clock, ArrowUpRight, Mail, Building2, Zap, Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const card = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }

const STATUS_COLORS = {
  bench:        { bg: '#fef3c7', color: '#92400e', label: 'On Bench' },
  submitted:    { bg: '#dbeafe', color: '#1e40af', label: 'Submitted' },
  interviewing: { bg: '#ede9fe', color: '#5b21b6', label: 'Interviewing' },
  placed:       { bg: '#d1fae5', color: '#065f46', label: 'Placed' },
}

function StatCard({ label, value, icon: Icon, color, bg, sub }) {
  return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ width: 42, height: 42, background: bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
        </div>
        <ArrowUpRight size={16} color="#d1d5db" />
      </div>
      <p style={{ fontSize: 32, fontWeight: 700, color: '#111827', letterSpacing: '-1px', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6, fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</p>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [consultants, setConsultants] = useState([])
  const [vendors, setVendors] = useState([])
  const [staleSubmissions, setStaleSubmissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: cons }, { data: vens }, { data: subs }] = await Promise.all([
        supabase.from('consultants').select('*').order('created_at', { ascending: false }),
        supabase.from('vendors').select('*').order('created_at', { ascending: false }),
        supabase.from('submissions').select('*, consultants(name, visa_status), vendors(company, email)').eq('status', 'submitted').order('submitted_at', { ascending: true }),
      ])
      setConsultants(cons || [])
      setVendors(vens || [])

      // Flag submissions stuck in "submitted" for 3+ days
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
      setStaleSubmissions((subs || []).filter(s => new Date(s.submitted_at).getTime() < threeDaysAgo))
      setLoading(false)
    }
    load()
  }, [])

  const stats = {
    total: consultants.length,
    bench: consultants.filter(c => c.status === 'bench').length,
    interviewing: consultants.filter(c => c.status === 'interviewing').length,
    placed: consultants.filter(c => c.status === 'placed').length,
  }

  // Top skills across all bench consultants
  const skillCounts = {}
  consultants.filter(c => c.status === 'bench').forEach(c => {
    (c.skills || '').split(',').forEach(s => {
      const sk = s.trim()
      if (sk) skillCounts[sk] = (skillCounts[sk] || 0) + 1
    })
  })
  const topSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // Pipeline funnel
  const pipeline = [
    { status: 'bench', count: stats.bench },
    { status: 'submitted', count: consultants.filter(c => c.status === 'submitted').length },
    { status: 'interviewing', count: stats.interviewing },
    { status: 'placed', count: stats.placed },
  ]
  const maxPipeline = Math.max(...pipeline.map(p => p.count), 1)

  // Visa breakdown
  const visaCounts = {}
  consultants.forEach(c => { if (c.visa_status) visaCounts[c.visa_status] = (visaCounts[c.visa_status] || 0) + 1 })
  const visaEntries = Object.entries(visaCounts).sort((a, b) => b[1] - a[1])

  const recent = consultants.slice(0, 6)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>Dashboard</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Welcome back — here's your bench pipeline overview</p>
        </div>
        <button onClick={() => navigate('/hotdesk')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Zap size={14} /> Open HotDesk
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Consultants" value={stats.total} icon={Users} color="#6c63ff" bg="#ede9fe" sub="All time" />
        <StatCard label="On Bench" value={stats.bench} icon={Clock} color="#f59e0b" bg="#fef3c7" sub="Available now" />
        <StatCard label="Interviewing" value={stats.interviewing} icon={TrendingUp} color="#3b82f6" bg="#dbeafe" sub="In process" />
        <StatCard label="Placed" value={stats.placed} icon={Briefcase} color="#10b981" bg="#d1fae5" sub="Successfully placed" />
      </div>

      {/* Second row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 20, marginBottom: 20 }}>

        {/* Pipeline Funnel */}
        <div style={{ ...card, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Pipeline Funnel</h3>
          {pipeline.map(({ status, count }) => {
            const { bg, color, label } = STATUS_COLORS[status] || {}
            const width = maxPipeline === 0 ? 0 : Math.round((count / maxPipeline) * 100)
            return (
              <div key={status} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{count}</span>
                </div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )
          })}
          {stats.total > 0 && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16, textAlign: 'center' }}>
              Placement rate: <strong style={{ color: '#10b981' }}>{Math.round((stats.placed / stats.total) * 100)}%</strong>
            </p>
          )}
        </div>

        {/* Top Skills */}
        <div style={{ ...card, padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20 }}>Top Skills on Bench</h3>
          {topSkills.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>No bench consultants yet</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {topSkills.map(([skill, count]) => (
                <span key={skill} style={{ background: '#ede9fe', color: '#6c63ff', borderRadius: 99, padding: '5px 12px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {skill}
                  <span style={{ background: '#6c63ff', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 10 }}>{count}</span>
                </span>
              ))}
            </div>
          )}

          {visaEntries.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 24, marginBottom: 12 }}>Visa Breakdown</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visaEntries.map(([visa, count]) => (
                  <div key={visa} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#374151' }}>{visa}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card, padding: 20, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', border: 'none' }}>
            <Zap size={20} color="rgba(255,255,255,0.8)" style={{ marginBottom: 10 }} />
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>AI Matcher</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>Paste a job description and get instant match scores.</p>
            <button onClick={() => navigate('/hotdesk')} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Open HotDesk →</button>
          </div>

          <div style={{ ...card, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Building2 size={15} color="#6c63ff" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Vendors</span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{vendors.length}</p>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>in your network</p>
            <button onClick={() => navigate('/vendors')} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%' }}>Manage Vendors →</button>
          </div>

          <div style={{ ...card, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Mail size={15} color="#6c63ff" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Job Inbox</span>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Scan Gmail & Outlook for new job requirements from vendors.</p>
            <button onClick={() => navigate('/inbox')} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%' }}>Open Inbox →</button>
          </div>
        </div>
      </div>

      {/* Follow-up Reminders */}
      {staleSubmissions.length > 0 && (
        <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: '#fef3c7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bell size={15} color="#d97706" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>Follow-up Needed — {staleSubmissions.length} submission{staleSubmissions.length > 1 ? 's' : ''} with no update for 3+ days</p>
              <p style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>Consider following up with these vendors</p>
            </div>
            <button onClick={() => navigate('/tracker')} style={{ marginLeft: 'auto', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              View in Tracker →
            </button>
          </div>
          <div>
            {staleSubmissions.slice(0, 5).map((s, i) => {
              const days = Math.floor((Date.now() - new Date(s.submitted_at).getTime()) / (1000 * 60 * 60 * 24))
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 24px', borderBottom: i < Math.min(staleSubmissions.length, 5) - 1 ? '1px solid #f3f4f6' : 'none', background: '#fff' }}>
                  <div style={{ width: 34, height: 34, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6c63ff', flexShrink: 0 }}>
                    {(s.consultants?.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{s.consultants?.name || 'Unknown'}</p>
                    <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{s.job_title || 'Untitled Role'} · {s.vendors?.company || 'Unknown vendor'}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{days}d waiting</span>
                    {s.vendors?.email && (
                      <a href={`mailto:${s.vendors.email}?subject=Follow up: ${s.job_title || 'Consultant Submission'}`}
                        style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#6c63ff', fontWeight: 600, textDecoration: 'none' }}>
                        Follow up →
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
            {staleSubmissions.length > 5 && (
              <div style={{ padding: '10px 24px', background: '#f9fafb', textAlign: 'center' }}>
                <button onClick={() => navigate('/tracker')} style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  +{staleSubmissions.length - 5} more — view in Tracker
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Consultants */}
      <div style={{ ...card, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Recent Consultants</h3>
          <button onClick={() => navigate('/consultants')} style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
        </div>
        {recent.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 14 }}>
            No consultants yet. <button onClick={() => navigate('/consultants')} style={{ color: '#6c63ff', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Add one →</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {recent.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#fafafa', borderRadius: 10, border: '1px solid #f3f4f6' }}>
                <div style={{ width: 38, height: 38, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#6c63ff', flexShrink: 0 }}>
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(c.skills || '').split(',').slice(0, 4).join(', ')}</p>
                </div>
                <span style={{ padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 600, textTransform: 'capitalize', background: STATUS_COLORS[c.status]?.bg || '#f3f4f6', color: STATUS_COLORS[c.status]?.color || '#374151', flexShrink: 0 }}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
