import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, Building2, Search, Star, Mail, Phone, Inbox, Loader } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { chat } from '../lib/groq'
import { fetchOutlookEmails } from '../lib/microsoft'

const TECH_OPTIONS = ['Java / .NET', 'Python / AI/ML', 'React / Frontend', 'DevOps / Cloud', 'SAP', 'Salesforce', 'Full Stack', 'Data Engineering', 'Mobile', 'QA / Testing', 'Other']
const EMPTY_FORM = { company: '', contact_name: '', email: '', phone: '', tech_stack: '', location: '', notes: '', responsiveness: 3 }

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

function ResponsivenessStars({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
          <Star size={20} fill={n <= value ? '#f59e0b' : 'none'} color={n <= value ? '#f59e0b' : '#d1d5db'} />
        </button>
      ))}
    </div>
  )
}

function decodeBase64(str) {
  try { return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))) }
  catch { return atob(str.replace(/-/g, '+').replace(/_/g, '/')) }
}

function extractEmailBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data)
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }
  }
  return ''
}

function extractSignature(body) {
  // Find phone numbers anywhere in the body first
  const phoneMatch = body.match(/(\+?[\d][\d\s\-().]{7,}[\d])/g)
  const phones = phoneMatch ? phoneMatch.filter(p => p.replace(/\D/g, '').length >= 7).join(' | ') : ''

  // Try to find signature section
  const sigMarkers = [/--+\s*\n/, /thanks[,\s]/i, /regards[,\s]/i, /best regards[,\s]/i, /sincerely[,\s]/i, /cheers[,\s]/i, /warm regards[,\s]/i, /tel:/i, /phone:/i, /cell:/i, /mobile:/i, /direct:/i]
  for (const marker of sigMarkers) {
    const idx = body.search(marker)
    if (idx > 0) {
      const sig = body.slice(Math.max(0, idx - 100)).slice(0, 1000)
      return phones ? `${sig}\nPhone numbers found: ${phones}` : sig
    }
  }
  // fallback: full body with phone hint
  const tail = body.slice(-800)
  return phones ? `${tail}\nPhone numbers found: ${phones}` : tail
}

async function extractVendorsFromEmails(emails) {
  const snippets = emails.slice(0, 20).map(e => {
    const sig = e.body ? extractSignature(e.body) : (e.snippet || '')
    return `From: ${e.from}\nSubject: ${e.subject}\nSignature/Body:\n${sig}`
  }).join('\n\n---\n\n')

  const prompt = `These are job-related emails from recruiters/vendors. Extract the sender's contact details from the email signature.

For each email extract:
- contact_name: full name from the signature (e.g. "Hardik Dekate"). Use From field name if not in signature.
- role: job title/role from signature (e.g. "Sr. Resource Manager", "Technical Recruiter", "Staffing Manager"). Empty string if not found.
- email: sender's email address
- phone: phone/mobile/cell number from the signature. Look for (XXX) XXX-XXXX, +1-XXX-XXX-XXXX, XXX.XXX.XXXX, +91XXXXXXXXXX patterns. Empty string if none.
- company: company name from signature. If not explicit, derive from email domain (john@hiretalent.com → "HireTalent"). Never use gmail/yahoo/hotmail/outlook as company.

Rules:
- One entry per unique email address only
- Skip if no real company can be identified
- Return ONLY a valid JSON array with keys: contact_name, role, email, phone, company
- No markdown, no explanation

Emails:
${snippets}

JSON:`

  try {
    const result = await chat(prompt)
    const json = result.match(/\[[\s\S]*\]/)
    return json ? JSON.parse(json[0]) : []
  } catch {
    return []
  }
}

export default function Vendors() {
  const { user } = useAuth()
  const [vendors, setVendors] = useState([])
  const [filtered, setFiltered] = useState([])
  const [vendorStats, setVendorStats] = useState({}) // { vendor_id: { total, placed } }
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [selectedImports, setSelectedImports] = useState([])

  useEffect(() => { fetchVendors(); fetchStats() }, [])
  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(vendors.filter(v =>
      v.company.toLowerCase().includes(q) ||
      (v.contact_name || '').toLowerCase().includes(q) ||
      (v.tech_stack || '').toLowerCase().includes(q) ||
      (v.location || '').toLowerCase().includes(q)
    ))
  }, [search, vendors])

  async function fetchVendors() {
    const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false })
    if (error) { setFetchError(error.message); return }
    setVendors(data || [])
    setFiltered(data || [])
  }

  async function fetchStats() {
    const { data } = await supabase.from('submissions').select('vendor_id, status')
    if (!data) return
    const stats = {}
    data.forEach(s => {
      if (!stats[s.vendor_id]) stats[s.vendor_id] = { total: 0, placed: 0 }
      stats[s.vendor_id].total++
      if (s.status === 'placed') stats[s.vendor_id].placed++
    })
    setVendorStats(stats)
  }

  async function handleSave() {
    setLoading(true)
    const payload = { ...form, user_id: user.id }
    if (editing) {
      await supabase.from('vendors').update(payload).eq('id', editing)
    } else {
      await supabase.from('vendors').insert(payload)
    }
    setForm(EMPTY_FORM)
    setEditing(null)
    setShowForm(false)
    setLoading(false)
    fetchVendors()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this vendor?')) return
    await supabase.from('vendors').delete().eq('id', id)
    fetchVendors()
  }

  function handleEdit(v) {
    setForm({ company: v.company, contact_name: v.contact_name || '', email: v.email || '', phone: v.phone || '', tech_stack: v.tech_stack || '', location: v.location || '', notes: v.notes || '', responsiveness: v.responsiveness || 3 })
    setEditing(v.id)
    setShowForm(true)
  }

  async function importFromEmails() {
    setImporting(true)
    setFetchError('')
    try {
      const emails = []

      const JOB_KEYWORDS = ['job', 'requirement', 'position', 'opening', 'hiring', 'consultant', 'looking for', 'urgent need', 'immediate need', 'resource', 'staffing', 'placement', 'opportunity', 'role', 'contract', 'fulltime', 'full time', 'w2', 'c2c', 'corp to corp']

      function isJobEmail(subject, body, snippet) {
        const text = `${subject} ${snippet} ${body}`.toLowerCase()
        return JOB_KEYWORDS.some(k => text.includes(k))
      }

      const gmailToken = localStorage.getItem('gmail_token')
      if (gmailToken) {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=subject:(job OR requirement OR position OR opening OR hiring OR consultant OR staffing OR urgent OR opportunity)`,
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        )
        const data = await res.json()
        if (data.messages) {
          const details = await Promise.all(data.messages.slice(0, 30).map(async m => {
            const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
              { headers: { Authorization: `Bearer ${gmailToken}` } })
            return r.json()
          }))
          details.forEach(msg => {
            const headers = msg.payload?.headers || []
            const get = n => headers.find(h => h.name.toLowerCase() === n)?.value || ''
            const from = get('from')
            const subject = get('subject')
            if (from.includes('noreply') || from.includes('no-reply') || from.includes('notifications@')) return
            const body = extractEmailBody(msg.payload)
            if (!isJobEmail(subject, body, msg.snippet || '')) return
            emails.push({ from, subject, snippet: msg.snippet || '', body })
          })
        }
      }

      const outlookToken = localStorage.getItem('outlook_token')
      if (outlookToken) {
        const data = await fetchOutlookEmails(outlookToken)
        if (data.value) {
          data.value.forEach(msg => {
            const body = (msg.body?.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            emails.push({
              from: msg.from?.emailAddress ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>` : '',
              subject: msg.subject || '',
              snippet: msg.bodyPreview || '',
              body,
            })
          })
        }
      }

      if (!emails.length) { setFetchError('No emails found. Connect Gmail or Outlook in Job Inbox first.'); setImporting(false); return }

      const extracted = await extractVendorsFromEmails(emails)
      const unique = extracted.filter((v, i, arr) =>
        v.company && arr.findIndex(x => x.company?.toLowerCase() === v.company?.toLowerCase()) === i
      )
      setImportResults(unique)
      setSelectedImports(unique.map((_, i) => i))
    } catch (e) {
      setFetchError('Import failed: ' + e.message)
    }
    setImporting(false)
  }

  async function saveImports() {
    const toSave = importResults.filter((_, i) => selectedImports.includes(i))
    for (const v of toSave) {
      await supabase.from('vendors').insert({
        company: v.company || '',
        contact_name: v.contact_name || '',
        email: v.email || '',
        phone: v.phone || '',
        tech_stack: '',
        location: '',
        notes: v.role || v.notes || '',
        user_id: user.id
      })
    }
    setImportResults(null)
    setSelectedImports([])
    fetchVendors()
  }

  function companyInitials(name) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  }

  const colors = ['#6c63ff', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899']
  function colorFor(name) { return colors[name.charCodeAt(0) % colors.length] }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>Vendors</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{vendors.length} vendor{vendors.length !== 1 ? 's' : ''} in your network</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={importFromEmails} disabled={importing}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: importing ? '#f3f4f6' : '#fff', color: importing ? '#9ca3af' : '#374151', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: importing ? 'not-allowed' : 'pointer' }}>
            {importing ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Inbox size={15} />}
            {importing ? 'Scanning...' : 'Import from Email'}
          </button>
          <button onClick={() => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={16} /> Add Vendor
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by company, contact, tech stack..."
          style={{ paddingLeft: 36, fontSize: 14, borderRadius: 10 }} />
      </div>

      {fetchError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>{fetchError}</div>
      )}

      {/* Vendor Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 2fr 1.5fr 1.5fr 80px', padding: '12px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
          {['Company', 'Name', 'Role', 'Email', 'Contact', 'Placement Rate', ''].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '64px 32px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Building2 size={24} color="#6c63ff" />
            </div>
            <p style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>No vendors yet</p>
            <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Add vendors manually or import from your emails</p>
          </div>
        ) : filtered.map((v, i) => (
          <div key={v.id}
            style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 2fr 1.5fr 1.5fr 80px', padding: '14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', transition: 'background 0.1s' }}
            onMouseOver={e => e.currentTarget.style.background = '#fafafa'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>

            {/* Company */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, background: colorFor(v.company), borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {companyInitials(v.company)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.company}</p>
                {v.location && <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{v.location}</p>}
              </div>
            </div>

            {/* Name */}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.contact_name || '—'}</p>
            </div>

            {/* Role */}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.notes || '—'}</p>
            </div>

            {/* Email */}
            <div style={{ minWidth: 0 }}>
              {v.email ? (
                <a href={`mailto:${v.email}`} style={{ fontSize: 13, color: '#6c63ff', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                  onMouseOver={e => e.currentTarget.style.textDecoration = 'underline'}
                  onMouseOut={e => e.currentTarget.style.textDecoration = 'none'}>
                  {v.email}
                </a>
              ) : <span style={{ fontSize: 13, color: '#d1d5db' }}>—</span>}
            </div>

            {/* Contact/Phone */}
            <div>
              <p style={{ fontSize: 13, color: '#374151' }}>{v.phone || '—'}</p>
            </div>

            {/* Placement Rate */}
            <div>
              {(() => {
                const s = vendorStats[v.id]
                if (!s || s.total === 0) return <span style={{ fontSize: 12, color: '#d1d5db' }}>No data</span>
                const rate = Math.round((s.placed / s.total) * 100)
                const color = rate >= 50 ? '#065f46' : rate >= 20 ? '#92400e' : '#991b1b'
                const bg = rate >= 50 ? '#d1fae5' : rate >= 20 ? '#fef3c7' : '#fee2e2'
                const barColor = rate >= 50 ? '#10b981' : rate >= 20 ? '#f59e0b' : '#ef4444'
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ background: bg, color, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{rate}%</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{s.placed}/{s.total}</span>
                    </div>
                    <div style={{ height: 3, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', width: 80 }}>
                      <div style={{ height: '100%', width: `${rate}%`, background: barColor, borderRadius: 99 }} />
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button onClick={() => handleEdit(v)} style={{ background: 'none', border: 'none', padding: '6px', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', display: 'flex' }}
                onMouseOver={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#6c63ff' }}
                onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af' }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(v.id)} style={{ background: 'none', border: 'none', padding: '6px', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', display: 'flex' }}
                onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Import Modal */}
      {importResults && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 25px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 620, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>Vendors Found in Emails</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Select which vendors to import into your network</p>
              </div>
              <button onClick={() => setImportResults(null)} style={{ background: '#f3f4f6', border: 'none', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '16px 24px', flex: 1 }}>
              {importResults.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>No vendor contacts could be extracted from your emails.</p>
              ) : importResults.map((v, i) => (
                <div key={i} onClick={() => setSelectedImports(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px', borderRadius: 12, border: `1.5px solid ${selectedImports.includes(i) ? '#6c63ff' : '#e5e7eb'}`, background: selectedImports.includes(i) ? '#f5f3ff' : '#fff', marginBottom: 10, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${selectedImports.includes(i) ? '#6c63ff' : '#d1d5db'}`, background: selectedImports.includes(i) ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    {selectedImports.includes(i) && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{v.company}</p>
                    {v.contact_name && <p style={{ fontSize: 13, color: '#374151', marginTop: 2, fontWeight: 500 }}>{v.contact_name}</p>}
                    {v.role && <p style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{v.role}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                      {v.email && <span style={{ fontSize: 12, color: '#6b7280' }}>✉ {v.email}</span>}
                      {v.phone && <span style={{ fontSize: 12, color: '#6b7280' }}>📞 {v.phone}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f3f4f6', background: '#fafafa', justifyContent: 'space-between', alignItems: 'center', borderRadius: '0 0 18px 18px' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>{selectedImports.length} of {importResults.length} selected</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setImportResults(null)} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 9, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveImports} disabled={!selectedImports.length}
                  style={{ padding: '10px 22px', fontSize: 14, fontWeight: 600, color: '#fff', background: selectedImports.length ? '#6c63ff' : '#a5b4fc', border: 'none', borderRadius: 9, cursor: selectedImports.length ? 'pointer' : 'not-allowed' }}>
                  Import {selectedImports.length} Vendor{selectedImports.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add/Edit Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 25px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>{editing ? 'Edit Vendor' : 'Add Vendor'}</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Add a vendor contact to your network</p>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', border: 'none', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Company Name *">
                    <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Accenture, TCS, Infosys..." />
                  </Field>
                </div>
                <Field label="Contact Name">
                  <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="John Smith" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@company.com" />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                </Field>
                <Field label="Location">
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Dallas, TX" />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Tech Stack (comma separated)">
                    <input value={form.tech_stack} onChange={e => setForm(f => ({ ...f, tech_stack: e.target.value }))} placeholder="Java, React, AWS, Python" />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes">
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any notes about this vendor..." style={{ resize: 'none' }} />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Responsiveness">
                    <div style={{ marginTop: 4 }}>
                      <ResponsivenessStars value={form.responsiveness} onChange={val => setForm(f => ({ ...f, responsiveness: val }))} />
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>How quickly does this vendor typically respond?</p>
                    </div>
                  </Field>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f3f4f6', background: '#fafafa', justifyContent: 'flex-end', borderRadius: '0 0 18px 18px' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 9, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={loading || !form.company}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', fontSize: 14, fontWeight: 600, color: '#fff', background: loading || !form.company ? '#a5b4fc' : '#6c63ff', border: 'none', borderRadius: 9, cursor: loading || !form.company ? 'not-allowed' : 'pointer' }}>
                <Check size={14} /> {loading ? 'Saving...' : 'Save Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
