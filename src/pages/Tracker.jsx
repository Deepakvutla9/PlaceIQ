import { useState, useEffect } from 'react'
import { Plus, X, ChevronDown, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'

const COLUMNS = [
  { key: 'submitted',    label: 'Submitted',    color: '#3b82f6', bg: '#dbeafe', light: '#eff6ff' },
  { key: 'interviewing', label: 'Interviewing', color: '#8b5cf6', bg: '#ede9fe', light: '#f5f3ff' },
  { key: 'offer',        label: 'Offer',        color: '#f59e0b', bg: '#fef3c7', light: '#fffbeb' },
  { key: 'placed',       label: 'Placed',       color: '#10b981', bg: '#d1fae5', light: '#ecfdf5' },
  { key: 'rejected',     label: 'Rejected',     color: '#ef4444', bg: '#fee2e2', light: '#fef2f2' },
]

function Avatar({ name, color = '#6c63ff', bg = '#ede9fe', size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700, color, flexShrink: 0 }}>
      {(name || '?').slice(0, 2).toUpperCase()}
    </div>
  )
}

function Card({ sub, consultants, vendors, onMove, onDelete }) {
  const consultant = consultants.find(c => c.id === sub.consultant_id)
  const vendor = vendors.find(v => v.id === sub.vendor_id)
  const col = COLUMNS.find(c => c.key === sub.status)

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Avatar name={consultant?.name} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{consultant?.name || 'Unknown'}</p>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{consultant?.visa_status} · ${consultant?.rate}/hr</p>
          </div>
        </div>
        <button onClick={() => onDelete(sub.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 2, lineHeight: 1 }}>
          <X size={14} />
        </button>
      </div>

      {sub.job_title && (
        <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub.job_title}
        </p>
      )}

      {vendor && (
        <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          @ {vendor.company}
        </p>
      )}

      {sub.notes && (
        <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, lineHeight: 1.5 }}>{sub.notes}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>
          {new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <select
          value={sub.status}
          onChange={e => onMove(sub.id, e.target.value)}
          style={{ fontSize: 11, fontWeight: 600, color: col?.color, background: col?.bg, border: 'none', borderRadius: 99, padding: '3px 8px', cursor: 'pointer', outline: 'none' }}
        >
          {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
    </div>
  )
}

function AddModal({ consultants, vendors, onClose, onSave }) {
  const [form, setForm] = useState({ consultant_id: '', vendor_id: '', job_title: '', status: 'submitted', notes: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.consultant_id) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Add Submission</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Consultant *</label>
            <select value={form.consultant_id} onChange={e => setForm(f => ({ ...f, consultant_id: e.target.value }))}>
              <option value="">Select consultant...</option>
              {consultants.map(c => <option key={c.id} value={c.id}>{c.name} — {c.visa_status}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Vendor</label>
            <select value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
              <option value="">Select vendor...</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.company}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Job Title</label>
            <input value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Senior .NET Developer" />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Initial Stage</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Rate, requirements, contact info..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 9, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving || !form.consultant_id}
            style={{ padding: '10px 22px', fontSize: 14, fontWeight: 600, color: '#fff', background: saving || !form.consultant_id ? '#a5b4fc' : '#6c63ff', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : 'Add Submission'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Tracker() {
  const [submissions, setSubmissions] = useState([])
  const [consultants, setConsultants] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: subs }, { data: cons }, { data: vens }] = await Promise.all([
        supabase.from('submissions').select('*').order('submitted_at', { ascending: false }),
        supabase.from('consultants').select('*').order('name'),
        supabase.from('vendors').select('*').order('company'),
      ])
      setSubmissions(subs || [])
      setConsultants(cons || [])
      setVendors(vens || [])
      setLoading(false)
    }
    load()
  }, [])

  async function addSubmission(form) {
    const { data } = await supabase.from('submissions').insert([{
      consultant_id: form.consultant_id,
      vendor_id: form.vendor_id || null,
      job_title: form.job_title,
      status: form.status,
      notes: form.notes,
    }]).select().single()
    if (data) setSubmissions(prev => [data, ...prev])
  }

  async function moveSubmission(id, status) {
    await supabase.from('submissions').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  async function deleteSubmission(id) {
    await supabase.from('submissions').delete().eq('id', id)
    setSubmissions(prev => prev.filter(s => s.id !== id))
  }

  const byStatus = key => submissions.filter(s => s.status === key)

  return (
    <div style={{ padding: '32px 36px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>Submission Tracker</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Track consultant submissions through the hiring pipeline</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> Add Submission
        </button>
      </div>

      {/* Summary pills */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {COLUMNS.map(col => (
          <div key={col.key} style={{ background: col.bg, borderRadius: 99, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: col.color }}>{col.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: col.color, background: 'rgba(0,0,0,0.08)', borderRadius: 99, padding: '1px 7px' }}>{byStatus(col.key).length}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af', alignSelf: 'center' }}>
          Total: <strong style={{ color: '#374151' }}>{submissions.length}</strong> submissions
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <Loader size={24} color="#6c63ff" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, alignItems: 'start' }}>
          {COLUMNS.map(col => (
            <div key={col.key}>
              {/* Column header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 14px', background: col.light, borderRadius: 10, border: `1px solid ${col.bg}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: col.color }}>{col.label}</span>
                <span style={{ marginLeft: 'auto', background: col.bg, color: col.color, borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 8px' }}>{byStatus(col.key).length}</span>
              </div>

              {/* Cards */}
              <div style={{ minHeight: 100 }}>
                {byStatus(col.key).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 10px', color: '#d1d5db', fontSize: 12 }}>No submissions</div>
                ) : byStatus(col.key).map(sub => (
                  <Card key={sub.id} sub={sub} consultants={consultants} vendors={vendors} onMove={moveSubmission} onDelete={deleteSubmission} />
                ))}
              </div>

              {/* Add button per column */}
              <button onClick={() => setShowAdd(true)}
                style={{ width: '100%', padding: '8px', background: 'none', border: `1px dashed ${col.bg}`, borderRadius: 10, color: '#9ca3af', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                <Plus size={12} /> Add
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddModal consultants={consultants} vendors={vendors} onClose={() => setShowAdd(false)} onSave={addSubmission} />}
    </div>
  )
}
