import { useState, useEffect, useRef } from 'react'
import { Zap, ChevronDown, ChevronUp, Send, Loader, Sparkles, Users, Building2, CheckCircle, Mail, ArrowRight, RefreshCw, BookOpen, Save, Trash2, Paperclip, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { extractJobRequirements, matchConsultants, chat } from '../lib/groq'
import { signInMicrosoft, getValidOutlookToken } from '../lib/microsoft'
import { useAuth } from '../context/AuthContext'

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
  const { user } = useAuth()
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
  const [selectedVendors, setSelectedVendors] = useState([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [emailType, setEmailType] = useState('submission')
  const [submissionType, setSubmissionType] = useState('C2C')
  const [coldContext, setColdContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState('')
  const [sendResults, setSendResults] = useState([])
  const [sendError, setSendError] = useState('')

  // Extra file attachments
  const [extraFiles, setExtraFiles] = useState([])
  const fileInputRef = useRef()

  // Templates
  const [templates, setTemplates] = useState([])
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const templateDropdownRef = useRef()

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
    supabase.from('email_templates').select('*').order('created_at', { ascending: false }).then(({ data }) => setTemplates(data || []))
  }, [])

  function loadTemplate(t) {
    setSubject(t.subject)
    setBody(t.body)
    setShowTemplateDropdown(false)
  }

  async function saveTemplate() {
    if (!saveTemplateName.trim() || !subject || !body) return
    setSavingTemplate(true)
    await supabase.from('email_templates').insert({ user_id: user.id, name: saveTemplateName.trim(), subject, body })
    const { data } = await supabase.from('email_templates').select('*').order('created_at', { ascending: false })
    setTemplates(data || [])
    setShowSaveModal(false)
    setSaveTemplateName('')
    setSavingTemplate(false)
  }

  async function deleteTemplate(id) {
    await supabase.from('email_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  function submissionBlock(c) {
    return `
——————————————————————————————
SUBMISSION FORMAT — ${c.name}
——————————————————————————————
Full Legal Name as on Passport: ${c.legal_name || c.name || ''}
Email: ${c.email || ''}
Contact: ${c.phone || ''}
Current Location: ${c.location || ''}
Open to Relocate: ${c.open_to_relocate || ''}
Available to Start: ${c.available_from || ''}
Last Four Digits of SSN: ${c.ssn_last4 || ''}
Interview Available Timings: ${c.interview_timings || ''}
Rate: ${c.rate ? `$${c.rate}/hr` : ''}
DOB (MM/DD): ${c.dob || ''}
LinkedIn URL: ${c.linkedin_url || ''}

References:
Reference 1: ${c.reference1 || ''}
Reference 2: ${c.reference2 || ''}
——————————————————————————————`.trim()
  }

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

  function toggleVendor(v) {
    setSelectedVendors(prev =>
      prev.find(x => x.id === v.id) ? prev.filter(x => x.id !== v.id) : [...prev, v]
    )
  }

  function goToSend() {
    setStep('send')
    setSendError('')
    setSendResults([])
    setSendProgress('')
    setSubject('')
    setBody('')
    setSelectedVendors([])
  }

  async function generateEmail() {
    if (emailType !== 'cold' && !selectedConsultants.length) { setSendError('Select at least one consultant'); return }
    if (emailType === 'cold' && !coldContext.trim()) { setSendError('Enter context for the cold email'); return }
    setGenerating(true)
    setSendError('')

    const jdContext = jobReq ? `Job Role: ${jobReq.title || ''}\nRequired Skills: ${jobReq.skills?.join(', ') || ''}` : ''
    const SIGN_OFF = 'Write subject line on first line starting with "Subject: ", then leave a blank line, then write the email body. Start with the greeting: "Hi {{VENDOR_NAME}}," on its own line — this placeholder will be replaced with the actual contact name per vendor. Do NOT include any sign-off or signature — end the body after the last sentence.'

    let prompt = ''

    if (emailType === 'submission') {
      const employmentNote = submissionType === 'C2C'
        ? 'This is a C2C (Corp to Corp) submission. Mention that the consultant is available for C2C engagements.'
        : submissionType === 'W2'
        ? 'This is a W2 submission. Mention that the consultant is open for W2 positions.'
        : 'This is a Fulltime submission. Mention that the consultant is open for fulltime/permanent roles.'
      prompt = `Write a short, professional bench sales recruiter email introducing a consultant for submission. Keep it to a brief 2-3 sentence intro — do NOT list consultant details in the body as those are in the submission format below. Invite the vendor to review the profile.

${jdContext}
${employmentNote}
Consultant count: ${selectedConsultants.length}
General skill area: ${selectedConsultants.map(c => c.skills?.split(',')[0]).filter(Boolean).join(', ')}

${SIGN_OFF}`

    } else if (emailType === 'hotlist') {
      prompt = `Write a short, professional bench sales recruiter hotlist email intro to vendors. Keep it to exactly 2-3 sentences. Do NOT include any table, list, or consultant details — just a brief intro saying you are sharing a hotlist of available consultants and inviting them to reach out for matching requirements. The table will be added separately after your response.

${jdContext}

${SIGN_OFF}`

    } else {
      prompt = `Write a professional cold outreach email from a bench sales recruiter to a vendor/prime. Context: ${coldContext}

${jdContext}

${SIGN_OFF}`
    }

    const result = await chat(prompt)
    const lines = result.split('\n')
    const subjectLine = lines.find(l => l.startsWith('Subject:'))
    if (subjectLine) setSubject(subjectLine.replace('Subject:', '').trim())
    const bodyStart = lines.findIndex(l => l.startsWith('Subject:')) + 2
    const aiBody = lines.slice(bodyStart).join('\n').trim()

    const signature = 'Best regards,\nPlaceIQ Recruiting Team'

    if (emailType === 'submission') {
      const submissionForms = selectedConsultants.map(c => submissionBlock(c)).join('\n\n')
      setBody(`${aiBody}\n\n${submissionForms}\n\n${signature}`)
    } else if (emailType === 'hotlist') {
      const cards = selectedConsultants.map((c, i) => [
        `[${i + 1}] ${c.name}`,
        `Skills      : ${c.skills || '—'}`,
        `Experience  : ${c.experience ? `${c.experience} years` : '—'}`,
        `Location    : ${c.location || '—'}`,
        `Visa        : ${c.visa_status || '—'}`,
        c.employment_type ? `Type        : ${c.employment_type}` : null,
      ].filter(Boolean).join('\n')).join('\n\n')
      const hotlist = `-- HOTLIST --\n\n${cards}\n\n-- END OF HOTLIST --`
      setBody(`${aiBody}\n\n${hotlist}\n\n${signature}`)
    } else {
      setBody(`${aiBody}\n\n${signature}`)
    }

    setGenerating(false)
  }

  async function handleBulkSend() {
    if (!selectedVendors.length) { setSendError('Select at least one vendor.'); return }
    if (!subject || !body) { setSendError('Subject and body are required.'); return }

    setSending(true)
    setSendError('')
    setSendResults([])

    // Build attachments once (shared across all vendors)
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
    // Add extra user-picked files
    for (const file of extraFiles) {
      try {
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        attachments.push({ name: file.name, data, mimeType: file.type || 'application/octet-stream' })
      } catch { /* skip */ }
    }

    let freshToken = null
    if (sendVia === 'outlook') {
      freshToken = await getValidOutlookToken()
      if (!freshToken) {
        localStorage.removeItem('outlook_token')
        setOutlookToken('')
        setSendError('Outlook session expired. Click Reconnect Outlook.')
        setSending(false); return
      }
      if (freshToken !== outlookToken) setOutlookToken(freshToken)
    }

    const results = []
    const jobTitle = jobReq?.title || subject || 'Untitled Role'

    for (let i = 0; i < selectedVendors.length; i++) {
      const vendor = selectedVendors[i]
      setSendProgress(`Sending ${i + 1} / ${selectedVendors.length} — ${vendor.company}...`)

      if (!vendor.email) {
        results.push({ vendor, ok: false, error: 'No email address' })
        continue
      }

      try {
        const vendorName = vendor.contact_name?.trim() || 'Team'
        const personalizedBody = body.replace('{{VENDOR_NAME}}', vendorName)

        if (sendVia === 'gmail') {
          if (!gmailToken) { results.push({ vendor, ok: false, error: 'Gmail not connected' }); continue }
          const r = await sendGmailEmail(gmailToken, vendor.email, subject, personalizedBody, attachments)
          if (r.error) { results.push({ vendor, ok: false, error: r.error.message }); continue }
        } else {
          const outlookAttachments = attachments.map(a => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.name, contentType: a.mimeType, contentBytes: a.data,
          }))
          const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
            method: 'POST',
            headers: { Authorization: `Bearer ${freshToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: 'Text', content: personalizedBody },
                toRecipients: [{ emailAddress: { address: vendor.email } }],
                attachments: outlookAttachments,
              }
            }),
          })
          if (res.status === 401) {
            localStorage.removeItem('outlook_token'); setOutlookToken('')
            results.push({ vendor, ok: false, error: 'Token expired' }); continue
          }
          if (res.status !== 202) {
            let msg = `HTTP ${res.status}`
            try { const j = await res.json(); msg = j?.error?.message || msg } catch {}
            results.push({ vendor, ok: false, error: msg }); continue
          }
        }

        // Log to Tracker
        for (const c of selectedConsultants) {
          await supabase.from('submissions').insert({
            consultant_id: c.id,
            vendor_id: vendor.id,
            job_title: jobTitle,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
        }
        results.push({ vendor, ok: true })
      } catch (e) {
        results.push({ vendor, ok: false, error: e.message })
      }
    }

    setSendProgress('')
    setSendResults(results)
    setSending(false)

    // Reset form if all succeeded
    if (results.every(r => r.ok)) {
      setBody('')
      setSubject('')
      setSelectedVendors([])
    }
  }

  const canSend = (sendVia === 'gmail' ? gmailConnected : outlookConnected) && !!body && !!subject && selectedVendors.length > 0

  const successCount = sendResults.filter(r => r.ok).length
  const failCount = sendResults.filter(r => !r.ok).length

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>HotDesk</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Match consultants to a job, then blast to multiple vendors at once</p>
        </div>
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, gap: 4 }}>
          {[
            { key: 'gmail', label: 'Gmail', connected: gmailConnected },
            { key: 'outlook', label: 'Outlook', connected: outlookConnected },
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
      <div style={{ display: 'flex', marginBottom: 24, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'match', label: '1. Match Consultants', icon: Zap },
          { key: 'send', label: '2. Compose & Blast', icon: Send },
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

      {/* Send results banner */}
      {sendResults.length > 0 && (
        <div style={{ marginBottom: 20, borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', background: successCount === sendResults.length ? '#d1fae5' : failCount === sendResults.length ? '#fef2f2' : '#fef3c7',
            display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #e5e7eb' }}>
            <CheckCircle size={15} color={successCount === sendResults.length ? '#065f46' : '#92400e'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: successCount === sendResults.length ? '#065f46' : '#92400e' }}>
              {successCount} sent · {failCount} failed · {successCount * selectedConsultants.length} submissions logged in Tracker
            </span>
          </div>
          <div style={{ background: '#fff' }}>
            {sendResults.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', borderBottom: i < sendResults.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <span style={{ fontSize: 13, color: r.ok ? '#10b981' : '#ef4444', fontWeight: 700 }}>{r.ok ? '✓' : '✗'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.vendor.company}</span>
                {r.vendor.email && <span style={{ fontSize: 12, color: '#9ca3af' }}>{r.vendor.email}</span>}
                {!r.ok && <span style={{ fontSize: 12, color: '#ef4444', marginLeft: 'auto' }}>{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 1: MATCH ── */}
      {step === 'match' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
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
                  fontSize: 14, fontWeight: 600, cursor: matching || !jdText.trim() ? 'not-allowed' : 'pointer'
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

          <div>
            {matchError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 18px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>{matchError}</div>}

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
                  <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{matches.length} ranked · {selectedConsultants.length} selected</p>
                  {selectedConsultants.length > 0 && (
                    <button onClick={goToSend}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      Compose & Blast <ArrowRight size={14} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {matches.map((m, i) => {
                    const isSelected = !!selectedConsultants.find(x => x.id === m.id)
                    return (
                      <div key={m.id} style={{ ...card, overflow: 'hidden', outline: isSelected ? '2px solid #6c63ff' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>
                          <div onClick={() => toggleConsultant(m.consultant)}
                            style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${isSelected ? '#6c63ff' : '#d1d5db'}`, background: isSelected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </div>
                          <div style={{ width: 30, height: 30, background: i === 0 ? '#fef3c7' : '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#92400e' : '#6b7280', flexShrink: 0 }}>
                            #{i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer', overflow: 'hidden' }} onClick={() => setExpanded(expanded === i ? null : i)}>
                            <p style={{ fontWeight: 700, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.consultant.name}</p>
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
                          <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #f3f4f6' }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>AI Analysis</p>
                            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: '#f9fafb', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>{m.reason}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                              {[['Skills', m.consultant.skills], ['Experience', m.consultant.experience ? `${m.consultant.experience} years` : '—'], ['Email', m.consultant.email || '—']].map(([label, val]) => (
                                <div key={label} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', minWidth: 0 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Consultants */}
            <div style={card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={14} color="#6c63ff" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Consultants</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6c63ff', fontWeight: 600 }}>{selectedConsultants.length} selected</span>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
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
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{m.consultant.name}</p>
                        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{m.consultant.visa_status}{m.consultant.employment_type ? ` · ${m.consultant.employment_type}` : ''} · ${m.consultant.rate}/hr</p>
                      </div>
                      <ScoreBadge score={m.score} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Vendors — multi-select */}
            <div style={card}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={14} color="#6c63ff" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Select Vendors</span>
                {selectedVendors.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6c63ff', fontWeight: 600 }}>{selectedVendors.length} selected</span>
                )}
              </div>
              {vendors.length > 1 && (
                <div style={{ padding: '8px 18px', borderBottom: '1px solid #f9fafb', display: 'flex', gap: 8 }}>
                  <button onClick={() => setSelectedVendors(vendors)}
                    style={{ fontSize: 11, fontWeight: 600, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Select all ({vendors.length})
                  </button>
                  <span style={{ color: '#d1d5db' }}>·</span>
                  <button onClick={() => setSelectedVendors([])}
                    style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Clear
                  </button>
                </div>
              )}
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {vendors.length === 0 ? (
                  <p style={{ padding: '18px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No vendors found. <a href="/vendors" style={{ color: '#6c63ff' }}>Add vendors →</a></p>
                ) : vendors.map(v => {
                  const selected = !!selectedVendors.find(x => x.id === v.id)
                  return (
                    <div key={v.id} onClick={() => toggleVendor(v)}
                      style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f9fafb', background: selected ? '#f5f3ff' : 'transparent' }}
                      onMouseOver={e => !selected && (e.currentTarget.style.background = '#fafafa')}
                      onMouseOut={e => !selected && (e.currentTarget.style.background = 'transparent')}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selected ? '#6c63ff' : '#d1d5db'}`, background: selected ? '#6c63ff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{v.company}</p>
                        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{v.contact_name || ''}{v.email ? ` · ${v.email}` : ' · No email'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Email type selector */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Email Type</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: emailType === 'submission' || emailType === 'cold' ? 12 : 0 }}>
                {[
                  { key: 'submission', label: 'Submission' },
                  { key: 'hotlist', label: 'Hotlist' },
                  { key: 'cold', label: 'Cold Email' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setEmailType(key)}
                    style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1.5px solid ${emailType === key ? '#6c63ff' : '#e5e7eb'}`, background: emailType === key ? '#6c63ff' : '#fff', color: emailType === key ? '#fff' : '#6b7280', cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
              {/* Submission: C2C/W2/Fulltime sub-type */}
              {emailType === 'submission' && (
                <div>
                  <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>Applying as</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['C2C', 'W2', 'Fulltime'].map(type => (
                      <button key={type} onClick={() => setSubmissionType(type)}
                        style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, borderRadius: 7, border: `1.5px solid ${submissionType === type ? '#10b981' : '#e5e7eb'}`, background: submissionType === type ? '#d1fae5' : '#f9fafb', color: submissionType === type ? '#065f46' : '#6b7280', cursor: 'pointer', transition: 'all 0.15s' }}>
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Cold email: context input */}
              {emailType === 'cold' && (
                <div>
                  <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>What's the purpose of this email?</p>
                  <textarea value={coldContext} onChange={e => setColdContext(e.target.value)} rows={3}
                    placeholder="e.g. Introducing our bench sales services to a new vendor, following up after a conference, reaching out about a partnership..."
                    style={{ resize: 'none', fontSize: 12, width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', color: '#374151', boxSizing: 'border-box', lineHeight: 1.5 }} />
                </div>
              )}
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
                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {selectedVendors.length === 0 ? 'No vendors selected' : selectedVendors.length === 1 ? `To: ${selectedVendors[0].company}` : `To: ${selectedVendors.length} vendors`}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                  <Mail size={13} />
                  via <strong style={{ color: sendVia === 'gmail' ? '#ea4335' : '#0078d4' }}>{sendVia === 'gmail' ? 'Gmail' : 'Outlook'}</strong>
                </div>
                {(selectedConsultants.filter(c => c.resume_url).length > 0 || extraFiles.length > 0) && (
                  <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                    📎 {selectedConsultants.filter(c => c.resume_url).length + extraFiles.length} file{selectedConsultants.filter(c => c.resume_url).length + extraFiles.length > 1 ? 's' : ''} will be attached
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

              {/* Template toolbar */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative' }} ref={templateDropdownRef}>
                  <button onClick={() => setShowTemplateDropdown(p => !p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                    <BookOpen size={13} /> Load Template {templates.length > 0 && `(${templates.length})`}
                  </button>
                  {showTemplateDropdown && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 260, maxHeight: 280, overflowY: 'auto' }}>
                      {templates.length === 0 ? (
                        <p style={{ padding: '16px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No templates saved yet</p>
                      ) : templates.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                          onMouseOver={e => e.currentTarget.style.background = '#f9fafb'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <div style={{ flex: 1, minWidth: 0 }} onClick={() => loadTemplate(t)}>
                            <p style={{ fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 2, flexShrink: 0 }}
                            onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseOut={e => e.currentTarget.style.color = '#d1d5db'}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {subject && body && (
                  <button onClick={() => setShowSaveModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                    <Save size={13} /> Save as Template
                  </button>
                )}
              </div>

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

              {/* Extra file attachments */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: extraFiles.length > 0 ? 8 : 0 }}>
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                    <Paperclip size={13} /> Attach Files
                  </button>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>Cover letter, ID, or any document</span>
                  <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                    onChange={e => setExtraFiles(prev => [...prev, ...Array.from(e.target.files)])} />
                </div>
                {extraFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {extraFiles.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 7, padding: '4px 10px' }}>
                        <Paperclip size={11} color="#6c63ff" />
                        <span style={{ fontSize: 12, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <button onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex', alignItems: 'center' }}
                          onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                          onMouseOut={e => e.currentTarget.style.color = '#9ca3af'}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {sendError && <p style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>{sendError}</p>}

              {sendProgress && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6c63ff', fontWeight: 600 }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  {sendProgress}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setSubject(''); setBody('') }}
                  style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 9, cursor: 'pointer' }}>
                  Clear
                </button>
                <button onClick={handleBulkSend} disabled={sending || !canSend}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', fontSize: 14, fontWeight: 600, color: '#fff', background: sending || !canSend ? '#a5b4fc' : '#6c63ff', border: 'none', borderRadius: 9, cursor: sending || !canSend ? 'not-allowed' : 'pointer' }}>
                  {sending
                    ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                    : <><Send size={14} /> {selectedVendors.length > 1 ? `Blast to ${selectedVendors.length} Vendors` : 'Send Email'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {showSaveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Save as Template</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Give this email a name so you can reuse it later.</p>
            <input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)}
              placeholder="e.g. Java Developer Intro, Follow-up Email..."
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: '#374151', boxSizing: 'border-box', marginBottom: 16 }}
              onKeyDown={e => e.key === 'Enter' && saveTemplate()} autoFocus />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSaveModal(false); setSaveTemplateName('') }}
                style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveTemplate} disabled={savingTemplate || !saveTemplateName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: '#fff', background: savingTemplate || !saveTemplateName.trim() ? '#a5b4fc' : '#6c63ff', border: 'none', borderRadius: 8, cursor: savingTemplate || !saveTemplateName.trim() ? 'not-allowed' : 'pointer' }}>
                {savingTemplate ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
