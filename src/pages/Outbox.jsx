import { useState, useEffect } from 'react'
import { Send, Loader, Users, Building2, CheckCircle, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { chat } from '../lib/groq'
import { sendOutlookEmail, getMicrosoftToken } from '../lib/microsoft'

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

async function fetchFileAsBase64(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getFileName(url) {
  if (!url) return 'resume.pdf'
  const parts = url.split('/')
  return decodeURIComponent(parts[parts.length - 1]) || 'resume.pdf'
}

async function sendGmailEmail(token, to, subject, body, attachments = []) {
  const boundary = 'boundary_' + Math.random().toString(36).slice(2)
  let mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ]
  for (const att of attachments) {
    mime = mime.concat([
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.name}"`,
      '',
      att.data,
    ])
  }
  mime.push(`--${boundary}--`)
  const raw = mime.join('\r\n')
  const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })
  return res.json()
}

export default function Outbox() {
  const [gmailToken] = useState(localStorage.getItem('gmail_token') || '')
  const [outlookToken] = useState(localStorage.getItem('outlook_token') || '')
  const [sendVia, setSendVia] = useState(localStorage.getItem('gmail_token') ? 'gmail' : outlookToken ? 'outlook' : 'gmail')
  const [consultants, setConsultants] = useState([])
  const [vendors, setVendors] = useState([])
  const [selectedConsultants, setSelectedConsultants] = useState([])
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const gmailConnected = !!gmailToken
  const outlookConnected = !!outlookToken

  useEffect(() => {
    supabase.from('consultants').select('*').eq('status', 'bench').then(({ data }) => setConsultants(data || []))
    supabase.from('vendors').select('*').then(({ data }) => setVendors(data || []))
  }, [])

  function toggleConsultant(c) {
    setSelectedConsultants(prev =>
      prev.find(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]
    )
  }

  async function generateEmail() {
    if (!selectedConsultants.length) { setError('Select at least one consultant'); return }
    setGenerating(true)
    setError('')
    const profiles = selectedConsultants.map(c =>
      `• ${c.name} | ${c.visa_status} | ${c.location} | $${c.rate}/hr | ${c.experience} yrs exp | Skills: ${c.skills}`
    ).join('\n')
    const vendorInfo = selectedVendor ? `Vendor: ${selectedVendor.company}${selectedVendor.contact_name ? `, Contact: ${selectedVendor.contact_name}` : ''}` : ''
    const prompt = `Write a professional bench sales recruiter email to send to a vendor/prime with the following consultant profiles available for immediate placement. Keep it concise, professional, and highlight the key skills.

${vendorInfo}

Consultant Profiles:
${profiles}

Write subject line on first line starting with "Subject: ", then leave a blank line, then write the email body. Sign off as "PlaceIQ Recruiting Team".`

    const result = await chat(prompt)
    const lines = result.split('\n')
    const subjectLine = lines.find(l => l.startsWith('Subject:'))
    if (subjectLine) setSubject(subjectLine.replace('Subject:', '').trim())
    const bodyStart = lines.findIndex(l => l.startsWith('Subject:')) + 2
    setBody(lines.slice(bodyStart).join('\n').trim())
    setGenerating(false)
  }

  async function handleSend() {
    if (!selectedVendor?.email) { setError('Selected vendor has no email address.'); return }
    if (!subject || !body) { setError('Subject and body are required.'); return }
    setSending(true)
    setError('')
    try {
      // Build attachments from consultant resumes
      const attachments = []
      for (const c of selectedConsultants) {
        if (c.resume_url) {
          try {
            const data = await fetchFileAsBase64(c.resume_url)
            const name = getFileName(c.resume_url)
            const mimeType = name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            attachments.push({ name, data, mimeType })
          } catch { /* skip if resume fetch fails */ }
        }
      }

      if (sendVia === 'gmail') {
        if (!gmailToken) { setError('Gmail not connected. Go to Job Inbox to connect.'); setSending(false); return }
        const result = await sendGmailEmail(gmailToken, selectedVendor.email, subject, body, attachments)
        if (result.error) { setError('Send failed: ' + result.error.message); setSending(false); return }
      } else {
        if (!outlookToken) { setError('Outlook not connected. Go to Job Inbox to connect.'); setSending(false); return }
        // Build Outlook attachments format
        const outlookAttachments = attachments.map(a => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.mimeType,
          contentBytes: a.data,
        }))
        const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
          method: 'POST',
          headers: { Authorization: `Bearer ${outlookToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject,
              body: { contentType: 'Text', content: body },
              toRecipients: [{ emailAddress: { address: selectedVendor.email } }],
              attachments: outlookAttachments,
            }
          }),
        })
        if (res.status !== 202) { setError('Outlook send failed. Try reconnecting Outlook.'); setSending(false); return }
      }
      setSent(true)
      setTimeout(() => setSent(false), 4000)
      setBody('')
      setSubject('')
      setSelectedConsultants([])
      setSelectedVendor(null)
    } catch (e) {
      setError('Send failed: ' + e.message)
    }
    setSending(false)
  }

  const canSend = (sendVia === 'gmail' ? gmailConnected : outlookConnected) && !!body && !!subject && !!selectedVendor

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>Outbox</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Compose and send emails to vendors</p>
        </div>

        {/* Send via toggle */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, gap: 4 }}>
          {[
            { key: 'gmail', label: 'Gmail', connected: gmailConnected, color: '#ea4335' },
            { key: 'outlook', label: 'Outlook', connected: outlookConnected, color: '#0078d4' },
          ].map(({ key, label, connected, color }) => (
            <button key={key} onClick={() => setSendVia(key)}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                background: sendVia === key ? '#fff' : 'transparent',
                color: sendVia === key ? '#111827' : '#6b7280',
                boxShadow: sendVia === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#10b981' : '#d1d5db', flexShrink: 0 }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Connection warning */}
      {sendVia === 'gmail' && !gmailConnected && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', color: '#92400e', fontSize: 13, marginBottom: 20 }}>
          Gmail not connected. Go to <a href="/inbox" style={{ color: '#6c63ff', fontWeight: 600 }}>Job Inbox</a> and click Connect Gmail.
        </div>
      )}
      {sendVia === 'outlook' && !outlookConnected && (
        <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', color: '#1e40af', fontSize: 13, marginBottom: 20 }}>
          Outlook not connected. Go to <a href="/inbox" style={{ color: '#6c63ff', fontWeight: 600 }}>Job Inbox</a> and click Connect Outlook.
        </div>
      )}

      {sent && (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 12, padding: '14px 18px', color: '#065f46', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} /> Email sent successfully via {sendVia === 'gmail' ? 'Gmail' : 'Outlook'}!
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Consultant selector */}
          <div style={card}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={15} color="#6c63ff" />
                <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Select Consultants</span>
              </div>
              <span style={{ fontSize: 12, color: '#6c63ff', fontWeight: 600 }}>{selectedConsultants.length} selected</span>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {consultants.length === 0 ? (
                <p style={{ padding: '20px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No bench consultants found</p>
              ) : consultants.map(c => {
                const selected = selectedConsultants.find(x => x.id === c.id)
                return (
                  <div key={c.id} onClick={() => toggleConsultant(c)}
                    style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f9fafb', background: selected ? '#f5f3ff' : 'transparent' }}
                    onMouseOver={e => !selected && (e.currentTarget.style.background = '#fafafa')}
                    onMouseOut={e => !selected && (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${selected ? '#6c63ff' : '#d1d5db'}`, background: selected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{c.name}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.visa_status} · ${c.rate}/hr · {c.location}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Vendor selector */}
          <div style={card}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={15} color="#6c63ff" />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Select Vendor</span>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {vendors.length === 0 ? (
                <p style={{ padding: '20px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No vendors found. <a href="/vendors" style={{ color: '#6c63ff' }}>Add vendors →</a></p>
              ) : vendors.map(v => {
                const selected = selectedVendor?.id === v.id
                return (
                  <div key={v.id} onClick={() => setSelectedVendor(selected ? null : v)}
                    style={{ padding: '12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f9fafb', background: selected ? '#f5f3ff' : 'transparent' }}
                    onMouseOver={e => !selected && (e.currentTarget.style.background = '#fafafa')}
                    onMouseOut={e => !selected && (e.currentTarget.style.background = 'transparent')}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? '#6c63ff' : '#d1d5db'}`, background: selected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{v.company}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{v.contact_name || ''} {v.email ? `· ${v.email}` : '· No email'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <button onClick={generateEmail} disabled={generating || !selectedConsultants.length}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: generating || !selectedConsultants.length ? '#a5b4fc' : '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: generating || !selectedConsultants.length ? 'not-allowed' : 'pointer' }}>
            {generating ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : '✨ Generate Email with AI'}
          </button>
        </div>

        {/* Right — Compose */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Compose Email</p>
              {selectedVendor && (
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>To: {selectedVendor.contact_name || selectedVendor.company} {selectedVendor.email ? `<${selectedVendor.email}>` : '(no email)'}</p>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                <Mail size={13} />
                Sending via <strong style={{ color: sendVia === 'gmail' ? '#ea4335' : '#0078d4' }}>{sendVia === 'gmail' ? 'Gmail' : 'Outlook'}</strong>
              </div>
              {selectedConsultants.filter(c => c.resume_url).length > 0 && (
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                  📎 {selectedConsultants.filter(c => c.resume_url).length} resume{selectedConsultants.filter(c => c.resume_url).length > 1 ? 's' : ''} will be attached
                </span>
              )}
            </div>
          </div>

          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <Field label="Subject">
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Consultant profiles for your open requirements..." />
            </Field>
            <Field label="Email Body">
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={16}
                placeholder="Select consultants and click 'Generate Email with AI' to auto-draft, or type manually..."
                style={{ resize: 'none', lineHeight: 1.7, fontSize: 13 }} />
            </Field>

            {error && <p style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setSubject(''); setBody('') }}
                style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 9, cursor: 'pointer' }}>
                Clear
              </button>
              <button onClick={handleSend} disabled={sending || !canSend}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: 14, fontWeight: 600, color: '#fff', background: sending || !canSend ? '#a5b4fc' : '#6c63ff', border: 'none', borderRadius: 9, cursor: sending || !canSend ? 'not-allowed' : 'pointer' }}>
                {sending ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</> : <><Send size={14} /> Send via {sendVia === 'gmail' ? 'Gmail' : 'Outlook'}</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
