import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { Zap, Loader, Mail, ChevronRight, RefreshCw, Unlink } from 'lucide-react'
import { extractJobRequirements } from '../lib/groq'
import { signInMicrosoft, getMicrosoftToken, getMicrosoftAccount, signOutMicrosoft, fetchOutlookEmails } from '../lib/microsoft'
import { useNavigate } from 'react-router-dom'

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }

function decodeBase64(str) {
  try { return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))) }
  catch { return atob(str.replace(/-/g, '+').replace(/_/g, '/')) }
}

function extractBody(payload) {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data)
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }
  return ''
}

function ProviderBadge({ provider }) {
  return provider === 'outlook'
    ? <span style={{ background: '#dbeafe', color: '#1e40af', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>Outlook</span>
    : <span style={{ background: '#fce7f3', color: '#9d174d', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>Gmail</span>
}

export default function JobInbox() {
  const navigate = useNavigate()
  const [gmailToken, setGmailToken] = useState(localStorage.getItem('gmail_token') || '')
  const [outlookConnected, setOutlookConnected] = useState(!!getMicrosoftAccount())
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [scanningId, setScanningId] = useState(null)
  const [error, setError] = useState('')
  const [extracted, setExtracted] = useState({})
  const [activeProvider, setActiveProvider] = useState(getMicrosoftAccount() ? 'outlook' : 'gmail')

  const gmailLogin = useGoogleLogin({
    onSuccess: async (res) => {
      setGmailToken(res.access_token)
      localStorage.setItem('gmail_token', res.access_token)
      setActiveProvider('gmail')
      await fetchGmailEmails(res.access_token)
    },
    onError: () => setError('Gmail login failed.'),
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose',
    prompt: 'select_account',
  })

  async function connectOutlook() {
    try {
      const result = await signInMicrosoft()
      localStorage.setItem('outlook_token', result.accessToken)
      localStorage.setItem('outlook_account', result.account || 'outlook_user')
      setOutlookConnected(true)
      setActiveProvider('outlook')
      await fetchOutlookEmailsList()
    } catch (e) {
      setError('Outlook login failed: ' + e.message)
    }
  }

  function disconnectGmail() {
    setGmailToken('')
    localStorage.removeItem('gmail_token')
    setEmails(emails.filter(e => e.provider !== 'gmail'))
  }

  function disconnectOutlook() {
    signOutMicrosoft()
    setOutlookConnected(false)
    setEmails(emails.filter(e => e.provider !== 'outlook'))
  }

  async function fetchGmailEmails(token) {
    setLoading(true)
    setError('')
    try {
      const t = token || gmailToken
      const searchRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=subject:(job OR requirement OR position OR opening OR hiring OR consultant OR "looking for" OR urgent)`,
        { headers: { Authorization: `Bearer ${t}` } }
      )
      const searchData = await searchRes.json()
      if (searchData.error) { setError('Gmail session expired. Reconnect Gmail.'); setGmailToken(''); localStorage.removeItem('gmail_token'); setLoading(false); return }
      if (!searchData.messages?.length) { setError('No job-related emails found in Gmail.'); setLoading(false); return }

      const details = await Promise.all(
        searchData.messages.slice(0, 20).map(async msg => {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, { headers: { Authorization: `Bearer ${t}` } })
          return res.json()
        })
      )
      const parsed = details.map(msg => {
        const headers = msg.payload?.headers || []
        const get = name => headers.find(h => h.name.toLowerCase() === name)?.value || ''
        return {
          id: `gmail_${msg.id}`,
          provider: 'gmail',
          subject: get('subject') || '(No subject)',
          from: get('from'),
          date: new Date(parseInt(msg.internalDate)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          body: extractBody(msg.payload),
          snippet: msg.snippet,
        }
      }).filter(e => e.body.length > 50)

      setEmails(prev => [...prev.filter(e => e.provider !== 'gmail'), ...parsed])
    } catch (err) { setError('Failed to fetch Gmail: ' + err.message) }
    setLoading(false)
  }

  async function fetchOutlookEmailsList() {
    setLoading(true)
    setError('')
    try {
      const token = await getMicrosoftToken()
      if (!token) { setError('Outlook session expired. Reconnect.'); setLoading(false); return }
      const data = await fetchOutlookEmails(token)
      if (data.error) { setError('Outlook error: ' + data.error.message); setLoading(false); return }
      if (!data.value?.length) { setError('No job-related emails found in Outlook.'); setLoading(false); return }

      const parsed = data.value.map(msg => ({
        id: `outlook_${msg.id}`,
        provider: 'outlook',
        subject: msg.subject || '(No subject)',
        from: msg.from?.emailAddress ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>` : '',
        date: new Date(msg.receivedDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        body: msg.body?.content?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || msg.bodyPreview,
        snippet: msg.bodyPreview,
      })).filter(e => e.body?.length > 50)

      setEmails(prev => [...prev.filter(e => e.provider !== 'outlook'), ...parsed])
    } catch (err) { setError('Failed to fetch Outlook: ' + err.message) }
    setLoading(false)
  }

  async function refresh() {
    if (gmailToken) await fetchGmailEmails()
    if (outlookConnected) await fetchOutlookEmailsList()
  }

  async function extractFromEmail(email) {
    setScanningId(email.id)
    try {
      const req = await extractJobRequirements(email.body || email.snippet)
      setExtracted(prev => ({ ...prev, [email.id]: req }))
    } catch { setExtracted(prev => ({ ...prev, [email.id]: null })) }
    setScanningId(null)
  }

  function sendToMatcher(email) {
    sessionStorage.setItem('matcher_jd', email.body || email.snippet)
    navigate('/matcher')
  }

  const isConnected = gmailToken || outlookConnected

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>Job Inbox</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Scan Gmail and Outlook for job requirements from vendors</p>
        </div>
        {isConnected && (
          <button onClick={refresh} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={14} /> Refresh All
          </button>
        )}
      </div>

      {/* Connection Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        {/* Gmail */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #ea4335, #fbbc04)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={18} color="#fff" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Gmail</p>
              <p style={{ fontSize: 12, color: gmailToken ? '#10b981' : '#9ca3af' }}>{gmailToken ? '● Connected' : '○ Not connected'}</p>
            </div>
          </div>
          {gmailToken ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => fetchGmailEmails()} disabled={loading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#ede9fe', color: '#6c63ff', border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <RefreshCw size={13} /> Scan
              </button>
              <button onClick={disconnectGmail}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Unlink size={13} /> Disconnect
              </button>
            </div>
          ) : (
            <button onClick={() => gmailLogin()}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Connect Gmail
            </button>
          )}
        </div>

        {/* Outlook */}
        <div style={{ ...card, padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #0078d4, #00b4d8)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M24 7.387v10.478L19.2 21V9.778L24 7.387zM0 7.387l4.8 2.391V21L0 17.865V7.387zM13.2 3L24 7.387 19.2 9.778 12 6.196 4.8 9.778 0 7.387 13.2 3zM4.8 10.696L12 14.278l7.2-3.582v10.478L12 24.556l-7.2-3.382V10.696z"/>
              </svg>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Outlook</p>
              <p style={{ fontSize: 12, color: outlookConnected ? '#10b981' : '#9ca3af' }}>
                {outlookConnected ? `● ${getMicrosoftAccount()?.username || 'Connected'}` : '○ Not connected'}
              </p>
            </div>
          </div>
          {outlookConnected ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchOutlookEmailsList} disabled={loading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: 8, padding: '9px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <RefreshCw size={13} /> Scan
              </button>
              <button onClick={disconnectOutlook}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Unlink size={13} /> Disconnect
              </button>
            </div>
          ) : (
            <button onClick={connectOutlook}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078d4">
                <path d="M24 7.387v10.478L19.2 21V9.778L24 7.387zM0 7.387l4.8 2.391V21L0 17.865V7.387zM13.2 3L24 7.387 19.2 9.778 12 6.196 4.8 9.778 0 7.387 13.2 3zM4.8 10.696L12 14.278l7.2-3.582v10.478L12 24.556l-7.2-3.382V10.696z"/>
              </svg>
              Connect Outlook
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 18px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {loading && (
        <div style={{ ...card, padding: '48px', textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #ede9fe', borderTop: '3px solid #6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>Scanning emails...</p>
        </div>
      )}

      {!loading && emails.length > 0 && (
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14, fontWeight: 500 }}>
            {emails.length} job-related email{emails.length !== 1 ? 's' : ''} found
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {emails.map(email => {
              const req = extracted[email.id]
              const isScanning = scanningId === email.id
              return (
                <div key={email.id} style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 38, height: 38, background: email.provider === 'outlook' ? '#dbeafe' : '#fce7f3', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Mail size={17} color={email.provider === 'outlook' ? '#1e40af' : '#9d174d'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{email.subject}</p>
                        <ProviderBadge provider={email.provider} />
                      </div>
                      <p style={{ fontSize: 12, color: '#6b7280' }}>{email.from} · {email.date}</p>
                      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, lineHeight: 1.5 }}>{email.snippet?.slice(0, 140)}...</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {!req && (
                        <button onClick={() => extractFromEmail(email)} disabled={isScanning}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, background: isScanning ? '#f3f4f6' : '#ede9fe', color: isScanning ? '#9ca3af' : '#6c63ff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: isScanning ? 'not-allowed' : 'pointer' }}>
                          {isScanning ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Extracting...</> : <><Zap size={12} /> Extract</>}
                        </button>
                      )}
                      <button onClick={() => sendToMatcher(email)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Send to Matcher <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>

                  {req && (
                    <div style={{ padding: '14px 20px', background: '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Extracted Requirements</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        {[['Role', req.title], ['Skills', req.skills?.join(', ')], ['Location', req.location], ['Rate', req.rate], ['Visa', Array.isArray(req.visaRequired) ? req.visaRequired.join(', ') : req.visaRequired], ['Experience', req.experience]].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #e5e7eb' }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{k}</p>
                            <p style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {req === null && (
                    <div style={{ padding: '10px 20px', background: '#fef2f2', borderTop: '1px solid #fecaca' }}>
                      <p style={{ fontSize: 12, color: '#991b1b' }}>Could not extract requirements. Try "Send to Matcher" instead.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loading && !isConnected && emails.length === 0 && (
        <div style={{ ...card, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, color: '#374151', fontSize: 15 }}>Connect Gmail or Outlook above to scan for job emails</p>
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Both can be connected simultaneously</p>
        </div>
      )}
    </div>
  )
}
