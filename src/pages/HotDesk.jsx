import { useState, useEffect } from 'react'
import { Zap, ChevronDown, ChevronUp, Send, Loader, Sparkles, Users, Building2, CheckCircle, Mail, ArrowRight, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { extractJobRequirements, matchConsultants, chat } from '../lib/groq'
import { signInMicrosoft } from '../lib/microsoft'

const card = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb' }

function ScoreBadge({ score }) {
  const color = score >= 80 ? '#065f46' : score >= 60 ? '#92400e' : '#991b1b'
  const bg = score >= 80 ? '#d1fae5' : score >= 60 ? '#fef3c7' : '#fee2e2'
  const bar = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ background: bg, color, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{score}%</span>
      <div style={{ width: 52, height: 3, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: bar, borderRadius: 99 }} />
      </div>
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

function getFileName(url, consultantName) {
  if (!url) return `${consultantName || 'Resume'}_Resume.pdf`
  const raw = decodeURIComponent(url.split('/').pop()) || ''
  // Extract just the "Name_Resume.ext" portion after the consultantId prefix
  const match = raw.match(/_(.+_Resume\.\w+)$/)
  if (match) return match[1]
  return `${(consultantName || 'Resume').replace(/\s+/g, '_')}_Resume.pdf`
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

export default function HotDesk() {
  // Step: 'match' | 'send'
  const [step, setStep] = useState('match')

  // Step 1 — Match
  const [jdText, setJdText] = useState(() => {
    const prefilled = sessionStorage.getItem('matcher_jd')
    if (prefilled) { sessionStorage.removeItem('matcher_jd'); return prefilled }
    return ''
  })
  const [jobReq, setJobReq] = useState(null)
  const [matches, setMatches] = useState([])
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [expanded, setExpanded] = useState(null)

  // Step 2 — Send
  const [gmailToken] = useState(localStorage.getItem('gmail_token') || '')
  const [outlookToken, setOutlookToken] = useState(localStorage.getItem('outlook_token') || '')
  const [sendVia, setSendVia] = useState(localStorage.getItem('outlook_token') ? 'outlook' : localStorage.getItem('gmail_token') ? 'gmail' : 'outlook')
  const [reconnecting, setReconnecting] = useState(false)
  const [vendors, setVendors] = useState([])
  const [selectedConsultants, setSelectedConsultants] = useState([])
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')

  const gmailConnected = !!gmailToken
  const outlookConnected = !!outlookToken

  async function reconnectOutlook() {
    setReconnecting(true)
    setSendError('')
    try {
      localStorage.removeItem('outlook_token')
      localStorage.removeItem('outlook_account')
      const result = await signInMicrosoft()
      localStorage.setItem('outlook_token', result.accessToken)
      localStorage.setItem('outlook_account', result.account || 'outlook_user')
      setOutlookToken(result.accessToken)
    } catch (e) {
      setSendError('Reconnect failed: ' + e.message)
    }
    setReconnecting(false)
  }

  useEffect(() => {
    supabase.from('vendors').select('*').then(({ data }) => setVendors(data || []))
  }, [])

  async function handleMatch() {
    if (!jdText.trim()) return
    setMatching(true)
    setMatchError('')
    setMatches([])
    setJobReq(null)
    setExpanded(null)
    setSelectedConsultants([])
    try {
      const { data: all } = await supabase.from('consultants').select('*').eq('status', 'bench')
      if (!all?.length) { setMatchError('No consultants with "bench" status found.'); setMatching(false); return }
      const req = await extractJobRequirements(jdText)
      setJobReq(req)
      const scores = await matchConsultants(req, all)
      const enriched = scores
        .map(s => ({ ...s, consultant: all.find(c => c.id === s.id) }))
        .filter(s => s.consultant)
        .sort((a, b) => b.score - a.score)
      setMatches(enriched)
    } catch {
      setMatchError('AI matching failed. Check your Groq API key and try again.')
    }
    setMatching(false)
  }

  function toggleConsultant(c) {
    setSelectedConsultants(prev =>
      prev.find(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]
    )
  }

  function goToSend() {
    setStep('send')
    setSendError('')
    setSubject('')
    setBody('')
    setSelectedVendor(null)
  }

  async function generateEmail() {
    if (!selectedConsultants.length) { setSendError('Select at least one consultant'); return }
    setGenerating(true)
    setSendError('')
    const profiles = selectedConsultants.map(c =>
      `• ${c.name} | ${c.visa_status} | ${c.location} | $${c.rate}/hr | ${c.experience} yrs exp | Skills: ${c.skills}`
    ).join('\n')
    const vendorInfo = selectedVendor ? `Vendor: ${selectedVendor.company}${selectedVendor.contact_name ? `, Contact: ${selectedVendor.contact_name}` : ''}` : ''
    const jdContext = jobReq ? `Job Role: ${jobReq.title || ''}\nRequired Skills: ${jobReq.skills?.join(', ') || ''}` : ''
    const prompt = `Write a professional bench sales recruiter email to send to a vendor/prime with the following consultant profiles available for immediate placement. Keep it concise, professional, and highlight the key skills.

${jdContext}
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
    if (!selectedVendor?.email) { setSendError('Selected vendor has no email address.'); return }
    if (!subject || !body) { setSendError('Subject and body are required.'); return }
    setSending(true)
    setSendError('')
    try {
      const attachments = []
      for (const c of selectedConsultants) {
        if (c.resume_url) {
          try {
            const data = await fetchFileAsBase64(c.resume_url)
            const name = getFileName(c.resume_url, c.name)
            const mimeType = name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            attachments.push({ name, data, mimeType })
          } catch { /* skip */ }
        }
      }

      if (sendVia === 'gmail') {
        if (!gmailToken) { setSendError('Gmail not connected. Go to Job Inbox to connect.'); setSending(false); return }
        const result = await sendGmailEmail(gmailToken, selectedVendor.email, subject, body, attachments)
        if (result.error) { setSendError('Send failed: ' + result.error.message); setSending(false); return }
      } else {
        if (!outlookToken) { setSendError('Outlook not connected. Go to Job Inbox to connect.'); setSending(false); return }
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
        if (res.status === 401) {
          localStorage.removeItem('outlook_token')
          setOutlookToken('')
          setSendError('Outlook token expired. Click "Reconnect Outlook" below to sign in again.')
          setSending(false); return
        }
        if (res.status !== 202) {
          let errMsg = `Outlook send failed (${res.status}).`
          try { const j = await res.json(); errMsg += ' ' + (j?.error?.message || JSON.stringify(j)) } catch {}
          setSendError(errMsg); setSending(false); return
        }
      }
      setSent(true)
      setTimeout(() => setSent(false), 4000)
      setBody('')
      setSubject('')
      setSelectedVendor(null)
    } catch (e) {
      setSendError('Send failed: ' + e.message)
    }
    setSending(false)
  }

  const canSend = (sendVia === 'gmail' ? gmailConnected : outlookConnected) && !!body && !!subject && !!selectedVendor

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>HotDesk</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Match consultants to a job, then send to vendors — all in one flow</p>
        </div>
        {/* Send via toggle (always visible) */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, gap: 4 }}>
          {[
            { key: 'gmail', label: 'Gmail', connected: gmailConnected, color: '#ea4335' },
            { key: 'outlook', label: 'Outlook', connected: outlookConnected, color: '#0078d4' },
          ].map(({ key, label, connected }) => (
            <button key={key} onClick={() => setSendVia(key)}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                background: sendVia === key ? '#fff' : 'transparent',
                color: sendVia === key ? '#111827' : '#6b7280',
                boxShadow: sendVia === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#10b981' : '#d1d5db', flexShrink: 0 }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Step tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'match', label: '1. Match Consultants', icon: Zap },
          { key: 'send', label: '2. Compose & Send', icon: Send },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key}
            onClick={() => key === 'send' && matches.length > 0 ? goToSend() : key === 'match' ? setStep('match') : null}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: step === key ? '#fff' : 'transparent',
              color: step === key ? '#6c63ff' : '#9ca3af',
              boxShadow: step === key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {sent && (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 12, padding: '13px 18px', color: '#065f46', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} /> Email sent successfully via {sendVia === 'gmail' ? 'Gmail' : 'Outlook'}!
        </div>
      )}

      {/* ── STEP 1: MATCH ── */}
      {step === 'match' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ padding: '20px 20px 0' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Job Description / Requirement
                </label>
                <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={14}
                  placeholder={"Paste the full job description here...\n\nExample:\nLooking for a Java Developer with 5+ years of experience in Spring Boot, Microservices, AWS. Must be on W2. Location: Dallas, TX. Rate: $65-75/hr."}
                  style={{ resize: 'none', fontSize: 13, lineHeight: 1.7, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', color: '#374151', background: '#fafafa', width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={{ padding: '16px 20px 20px' }}>
                <button onClick={handleMatch} disabled={matching || !jdText.trim()} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: matching || !jdText.trim() ? '#a5b4fc' : '#6c63ff',
                  color: '#fff', border: 'none', borderRadius: 10, padding: '13px',
                  fontSize: 14, fontWeight: 600, cursor: matching || !jdText.trim() ? 'not-allowed' : 'pointer', transition: 'background 0.15s'
                }}>
                  {matching ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Zap size={15} /> Match Consultants</>}
                </button>
              </div>
            </div>

            {jobReq && (
              <div style={{ ...card, padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Sparkles size={14} color="#6c63ff" />
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Extracted Requirements</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Role', jobReq.title],
                    ['Skills', jobReq.skills?.join(', ')],
                    ['Visa', Array.isArray(jobReq.visaRequired) ? jobReq.visaRequired.join(', ') : jobReq.visaRequired],
                    ['Location', jobReq.location],
                    ['Rate', jobReq.rate],
                    ['Duration', jobReq.duration],
                    ['Experience', jobReq.experience],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#9ca3af', width: 70, flexShrink: 0, paddingTop: 1 }}>{k}</span>
                      <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Results */}
          <div>
            {matchError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 18px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>{matchError}</div>
            )}

            {!matching && !matchError && matches.length === 0 && (
              <div style={{ ...card, padding: '64px 32px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Zap size={24} color="#6c63ff" />
                </div>
                <p style={{ fontWeight: 600, fontSize: 15, color: '#374151' }}>Ready to match</p>
                <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Paste a job description and click Match Consultants</p>
              </div>
            )}

            {matching && (
              <div style={{ ...card, padding: '64px 32px', textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, border: '3px solid #ede9fe', borderTop: '3px solid #6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>Analyzing consultants...</p>
                <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>AI is scoring each consultant for this role</p>
              </div>
            )}

            {matches.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{matches.length} consultant{matches.length !== 1 ? 's' : ''} ranked · {selectedConsultants.length} selected</p>
                  {selectedConsultants.length > 0 && (
                    <button onClick={goToSend}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Send to Vendor <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {matches.map((m, i) => {
                    const isSelected = selectedConsultants.find(x => x.id === m.id)
                    return (
                      <div key={m.id} style={{ ...card, overflow: 'hidden', outline: isSelected ? '2px solid #6c63ff' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>
                          {/* Checkbox */}
                          <div onClick={() => toggleConsultant(m.consultant)}
                            style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? '#6c63ff' : '#d1d5db'}`, background: isSelected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </div>
                          {/* Rank */}
                          <div style={{ width: 30, height: 30, background: i === 0 ? '#fef3c7' : '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#92400e' : '#6b7280', flexShrink: 0 }}>
                            #{i + 1}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setExpanded(expanded === i ? null : i)}>
                            <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{m.consultant.name}</p>
                            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.consultant.visa_status} · {m.consultant.location} · ${m.consultant.rate}/hr
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <ScoreBadge score={m.score} />
                            <div onClick={() => setExpanded(expanded === i ? null : i)} style={{ cursor: 'pointer', color: '#9ca3af' }}>
                              {expanded === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </div>
                        </div>

                        {expanded === i && (
                          <div style={{ padding: '0 20px 18px', borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>AI Analysis</p>
                            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: '#f9fafb', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>{m.reason}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                              {[
                                ['Skills', m.consultant.skills],
                                ['Experience', m.consultant.experience ? `${m.consultant.experience} years` : '—'],
                                ['Email', m.consultant.email || '—'],
                              ].map(([label, val]) => (
                                <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
                                  <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</p>
                                  <p style={{ fontSize: 12, color: '#374151', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {selectedConsultants.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={goToSend}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Continue to Send ({selectedConsultants.length} selected) <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 2: SEND ── */}
      {step === 'send' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Selected consultants */}
            <div style={card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={14} color="#6c63ff" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Consultants</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6c63ff', fontWeight: 600 }}>{selectedConsultants.length} selected</span>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {matches.map((m) => {
                  const isSelected = !!selectedConsultants.find(x => x.id === m.id)
                  return (
                    <div key={m.id} onClick={() => toggleConsultant(m.consultant)}
                      style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f9fafb', background: isSelected ? '#f5f3ff' : 'transparent' }}
                      onMouseOver={e => !isSelected && (e.currentTarget.style.background = '#fafafa')}
                      onMouseOut={e => !isSelected && (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isSelected ? '#6c63ff' : '#d1d5db'}`, background: isSelected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{m.consultant.name}</p>
                        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{m.consultant.visa_status} · ${m.consultant.rate}/hr</p>
                      </div>
                      <ScoreBadge score={m.score} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Vendor selector */}
            <div style={card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={14} color="#6c63ff" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Select Vendor</span>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {vendors.length === 0 ? (
                  <p style={{ padding: '18px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No vendors found. <a href="/vendors" style={{ color: '#6c63ff' }}>Add vendors →</a></p>
                ) : vendors.map(v => {
                  const selected = selectedVendor?.id === v.id
                  return (
                    <div key={v.id} onClick={() => setSelectedVendor(selected ? null : v)}
                      style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f9fafb', background: selected ? '#f5f3ff' : 'transparent' }}
                      onMouseOver={e => !selected && (e.currentTarget.style.background = '#fafafa')}
                      onMouseOut={e => !selected && (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${selected ? '#6c63ff' : '#d1d5db'}`, background: selected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
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
              {generating ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : <><Sparkles size={14} /> Generate Email with AI</>}
            </button>

            <button onClick={() => setStep('match')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              ← Back to Match Results
            </button>
          </div>

          {/* Right: Compose */}
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
                  via <strong style={{ color: sendVia === 'gmail' ? '#ea4335' : '#0078d4' }}>{sendVia === 'gmail' ? 'Gmail' : 'Outlook'}</strong>
                </div>
                {selectedConsultants.filter(c => c.resume_url).length > 0 && (
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                    📎 {selectedConsultants.filter(c => c.resume_url).length} resume{selectedConsultants.filter(c => c.resume_url).length > 1 ? 's' : ''} will be attached
                  </span>
                )}
              </div>
            </div>

            {sendVia === 'gmail' && !gmailConnected && (
              <div style={{ margin: '16px 20px 0', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', color: '#92400e', fontSize: 13 }}>
                Gmail not connected. Go to <a href="/inbox" style={{ color: '#6c63ff', fontWeight: 600 }}>Job Inbox</a> to connect.
              </div>
            )}
            {sendVia === 'outlook' && !outlookConnected && (
              <div style={{ margin: '16px 20px 0', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', color: '#1e40af', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span>Outlook token expired or not connected.</span>
                <button onClick={reconnectOutlook} disabled={reconnecting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0078d4', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: reconnecting ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                  {reconnecting ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                  {reconnecting ? 'Connecting...' : 'Reconnect Outlook'}
                </button>
              </div>
            )}

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Consultant profiles for your open requirements..."
                  style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: '#374151', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Email Body</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={16}
                  placeholder="Select consultants and click 'Generate Email with AI' to auto-draft, or type manually..."
                  style={{ resize: 'none', lineHeight: 1.7, fontSize: 13, width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '10px 12px', color: '#374151', boxSizing: 'border-box' }} />
              </div>

              {sendError && <p style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>{sendError}</p>}

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
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
