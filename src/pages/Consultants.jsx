import { useEffect, useState, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Check, Users, FileText, Upload, Loader, Search, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { extractTextFromResume, parseResumeWithAI } from '../lib/resumeParser'

const VISA_OPTIONS = ['H1B', 'OPT', 'CPT', 'Green Card', 'US Citizen', 'TN', 'L1']
const STATUS_OPTIONS = ['bench', 'submitted', 'interviewing', 'placed', 'upcoming']
const STATUS_STYLE = {
  bench:       { bg: '#fef3c7', color: '#92400e' },
  submitted:   { bg: '#dbeafe', color: '#1e40af' },
  interviewing:{ bg: '#ede9fe', color: '#5b21b6' },
  placed:      { bg: '#d1fae5', color: '#065f46' },
  upcoming:    { bg: '#f3f4f6', color: '#374151' },
}

const EMPTY_FORM = { name: '', email: '', phone: '', skills: '', visa_status: 'H1B', location: '', rate: '', experience: '', status: 'bench', notes: '' }

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

export default function Consultants() {
  const { user } = useAuth()
  const [consultants, setConsultants] = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [resumeFile, setResumeFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState('')
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef()

  useEffect(() => { fetchConsultants() }, [])
  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(consultants.filter(c =>
      c.name.toLowerCase().includes(q) || c.skills.toLowerCase().includes(q) || c.location.toLowerCase().includes(q)
    ))
  }, [search, consultants])

  async function fetchConsultants() {
    const { data, error } = await supabase.from('consultants').select('*').order('created_at', { ascending: false })
    if (error) { setFetchError(error.message); return }
    setConsultants(data || [])
    setFiltered(data || [])
  }

  async function handleResumeUpload(file) {
    if (!file) return
    setResumeFile(file)
    setParsing(true)
    try {
      const text = await extractTextFromResume(file)
      const parsed = await parseResumeWithAI(text)
      setForm(f => ({
        ...f,
        name: parsed.name || f.name,
        email: parsed.email || f.email,
        phone: parsed.phone || f.phone,
        skills: parsed.skills || f.skills,
        experience: parsed.experience || f.experience,
        location: parsed.location || f.location,
      }))
    } catch (err) {
      console.error('Resume parse failed:', err)
    }
    setParsing(false)
  }

  async function uploadResume(consultantId, consultantName) {
    if (!resumeFile) return null
    const ext = resumeFile.name.split('.').pop()
    const safeName = (consultantName || 'Resume').replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')
    const path = `${user.id}/${consultantId}_${safeName}_Resume.${ext}`
    setUploadProgress('Uploading resume...')
    const { error } = await supabase.storage.from('resumes').upload(path, resumeFile, { upsert: true })
    if (error) {
      setUploadProgress('⚠ Resume upload failed: ' + error.message)
      console.error('Storage upload error:', error)
      return null
    }
    const { data } = supabase.storage.from('resumes').getPublicUrl(path)
    setUploadProgress('✓ Resume uploaded successfully')
    setTimeout(() => setUploadProgress(''), 2000)
    return data.publicUrl
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError('Name is required.'); return }
    if (!form.skills.trim()) { setSaveError('Skills are required.'); return }
    if (form.rate === '' || form.rate === null) { setSaveError('Rate is required.'); return }
    setLoading(true)
    setSaveError('')
    const payload = {
      ...form,
      user_id: user.id,
      rate: form.rate !== '' ? Number(form.rate) : null,
      experience: form.experience !== '' ? Number(form.experience) : null,
    }
    if (editing) {
      const resumeUrl = await uploadResume(editing, form.name)
      if (resumeUrl) payload.resume_url = resumeUrl
      const { error } = await supabase.from('consultants').update(payload).eq('id', editing)
      if (error) { setSaveError('Update failed: ' + error.message); setLoading(false); return }
    } else {
      const { data: inserted, error: insertError } = await supabase.from('consultants').insert(payload).select().single()
      if (insertError) { setSaveError('Save failed: ' + insertError.message); setLoading(false); return }
      if (inserted && resumeFile) {
        const resumeUrl = await uploadResume(inserted.id, form.name)
        if (resumeUrl) await supabase.from('consultants').update({ resume_url: resumeUrl }).eq('id', inserted.id)
      }
    }
    setForm(EMPTY_FORM)
    setResumeFile(null)
    setEditing(null)
    setShowForm(false)
    setLoading(false)
    fetchConsultants()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this consultant?')) return
    await supabase.storage.from('resumes').remove([`${user.id}/${id}.pdf`, `${user.id}/${id}.doc`, `${user.id}/${id}.docx`])
    await supabase.from('consultants').delete().eq('id', id)
    fetchConsultants()
  }

  function handleEdit(c) {
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', skills: c.skills, visa_status: c.visa_status, location: c.location, rate: c.rate, experience: c.experience || '', status: c.status, notes: c.notes || '' })
    setEditing(c.id)
    setResumeFile(null)
    setShowForm(true)
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>Consultants</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>{consultants.length} consultant{consultants.length !== 1 ? 's' : ''} in your roster</p>
        </div>
        <button onClick={() => { setForm(EMPTY_FORM); setEditing(null); setResumeFile(null); setSaveError(''); setShowForm(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={16} /> Add Consultant
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, skills, location..."
          style={{ paddingLeft: 36, fontSize: 14, borderRadius: 10 }} />
      </div>

      {fetchError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
          {fetchError}
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Users size={24} color="#6c63ff" />
          </div>
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>No consultants found</p>
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Add your first bench consultant to get started</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Consultant', 'Skills', 'Visa', 'Location', 'Rate/hr', 'Status', 'Resume', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background 0.1s' }}
                  onMouseOver={e => e.currentTarget.style.background = '#fafafa'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6c63ff', flexShrink: 0 }}>
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, color: '#111827' }}>{c.name}</p>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{c.experience ? `${c.experience} yrs exp` : c.email || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', maxWidth: 200 }}>
                    <p style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{c.skills}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: '#f3f4f6', color: '#374151', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 500 }}>{c.visa_status}</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#6b7280', fontSize: 13 }}>{c.location}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111827' }}>${c.rate}<span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>/hr</span></td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, textTransform: 'capitalize', background: STATUS_STYLE[c.status]?.bg || '#f3f4f6', color: STATUS_STYLE[c.status]?.color || '#374151' }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {c.resume_url
                      ? <a href={c.resume_url} download target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6c63ff', fontSize: 12, fontWeight: 600, textDecoration: 'none', background: '#ede9fe', padding: '6px 10px', borderRadius: 6 }}><Download size={13} /></a>
                      : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => handleEdit(c)} style={{ background: 'none', border: 'none', padding: '6px', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', display: 'flex' }}
                        onMouseOver={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#6c63ff' }}
                        onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af' }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} style={{ background: 'none', border: 'none', padding: '6px', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', display: 'flex' }}
                        onMouseOver={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                        onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 25px 60px rgba(0,0,0,0.18)', width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>{editing ? 'Edit Consultant' : 'Add Consultant'}</h3>
                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Upload a resume to auto-fill details</p>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: '#f3f4f6', border: 'none', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', flex: 1 }}>
              {/* Resume upload — first */}
              <div style={{ marginBottom: 20 }}>
                <Field label="Resume (PDF, DOC, DOCX)">
                  <div onClick={() => fileInputRef.current.click()}
                    style={{ border: '2px dashed #c7d2fe', borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', background: resumeFile ? '#fafafe' : '#f9fafb', transition: 'all 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = '#6c63ff'}
                    onMouseOut={e => e.currentTarget.style.borderColor = '#c7d2fe'}>
                    {parsing ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#6c63ff', fontSize: 13, fontWeight: 600 }}>
                        <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Extracting details from resume...
                      </div>
                    ) : resumeFile ? (
                      <div>
                        <p style={{ color: '#6c63ff', fontWeight: 600, fontSize: 13 }}>✓ {resumeFile.name}</p>
                        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Details auto-filled below · Click to change</p>
                      </div>
                    ) : (
                      <div>
                        <Upload size={22} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Click to upload resume</p>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>PDF, DOC, DOCX · AI will auto-fill the form</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
                    onChange={e => handleResumeUpload(e.target.files[0])} />
                </Field>
              </div>

              <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0 20px' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Full Name *">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@email.com" />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
                </Field>
                <Field label="Location">
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Dallas, TX" />
                </Field>
                <Field label="Rate ($/hr) *">
                  <input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="75" />
                </Field>
                <Field label="Experience (years)">
                  <input type="number" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: e.target.value }))} placeholder="5" />
                </Field>
                <Field label="Visa Status">
                  <select value={form.visa_status} onChange={e => setForm(f => ({ ...f, visa_status: e.target.value }))}>
                    {VISA_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Skills * (comma separated)">
                    <input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} placeholder="Java, Spring Boot, AWS, Docker, Kubernetes" />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes">
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any additional info..." style={{ resize: 'none' }} />
                  </Field>
                </div>
              </div>
              {uploadProgress && <p style={{ fontSize: 12, color: '#6c63ff', marginTop: 12 }}>{uploadProgress}</p>}
              {saveError && <p style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>{saveError}</p>}
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f3f4f6', background: '#fafafa', justifyContent: 'flex-end', borderRadius: '0 0 18px 18px' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 9, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={loading || !form.name || !form.skills}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px', fontSize: 14, fontWeight: 600, color: '#fff', background: loading || !form.name || !form.skills ? '#a5b4fc' : '#6c63ff', border: 'none', borderRadius: 9, cursor: loading || !form.name || !form.skills ? 'not-allowed' : 'pointer' }}>
                {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : <><Check size={14} /> Save Consultant</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
