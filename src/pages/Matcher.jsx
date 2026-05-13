import { useState } from 'react'
import { Zap, ChevronDown, ChevronUp, Send, Loader, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { extractJobRequirements, matchConsultants } from '../lib/groq'

const card = {
  background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb'
}

function ScoreBadge({ score }) {
  const color = score >= 80 ? '#065f46' : score >= 60 ? '#92400e' : '#991b1b'
  const bg = score >= 80 ? '#d1fae5' : score >= 60 ? '#fef3c7' : '#fee2e2'
  const bar = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ background: bg, color, borderRadius: 99, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>{score}%</span>
      <div style={{ width: 64, height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: bar, borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

export default function Matcher() {
  const [jdText, setJdText] = useState(() => {
    const prefilled = sessionStorage.getItem('matcher_jd')
    if (prefilled) { sessionStorage.removeItem('matcher_jd'); return prefilled }
    return ''
  })
  const [jobReq, setJobReq] = useState(null)
  const [matches, setMatches] = useState([])
  const [consultants, setConsultants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  async function handleMatch() {
    if (!jdText.trim()) return
    setLoading(true)
    setError('')
    setMatches([])
    setJobReq(null)
    setExpanded(null)
    try {
      const { data: all } = await supabase.from('consultants').select('*').eq('status', 'bench')
      if (!all?.length) { setError('No consultants with "bench" status found.'); setLoading(false); return }
      setConsultants(all)
      const req = await extractJobRequirements(jdText)
      setJobReq(req)
      const scores = await matchConsultants(req, all)
      const enriched = scores
        .map(s => ({ ...s, consultant: all.find(c => c.id === s.id) }))
        .filter(s => s.consultant)
        .sort((a, b) => b.score - a.score)
      setMatches(enriched)
    } catch (err) {
      setError('AI matching failed. Check your Groq API key and try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#111827', letterSpacing: '-0.5px' }}>AI Matcher</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>Paste a job requirement and get instant AI-powered match scores</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <div style={{ padding: '20px 20px 0' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Job Description / Requirement
              </label>
              <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={14}
                placeholder={"Paste the full job description here...\n\nExample:\nLooking for a Java Developer with 5+ years of experience in Spring Boot, Microservices, AWS. Must be on W2. Location: Dallas, TX. Rate: $65-75/hr."}
                style={{ resize: 'none', fontSize: 13, lineHeight: 1.7, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', color: '#374151', background: '#fafafa' }} />
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <button onClick={handleMatch} disabled={loading || !jdText.trim()} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: loading || !jdText.trim() ? '#a5b4fc' : '#6c63ff',
                color: '#fff', border: 'none', borderRadius: 10, padding: '13px',
                fontSize: 14, fontWeight: 600, cursor: loading || !jdText.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s'
              }}>
                {loading ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Zap size={15} /> Match Consultants</>}
              </button>
            </div>
          </div>

          {/* Extracted requirements */}
          {jobReq && (
            <div style={{ ...card, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Sparkles size={14} color="#6c63ff" />
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Extracted Requirements</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '14px 18px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          {!loading && !error && matches.length === 0 && (
            <div style={{ ...card, padding: '64px 32px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, background: '#ede9fe', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Zap size={24} color="#6c63ff" />
              </div>
              <p style={{ fontWeight: 600, fontSize: 15, color: '#374151' }}>Ready to match</p>
              <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Paste a job description and click Match Consultants</p>
            </div>
          )}

          {loading && (
            <div style={{ ...card, padding: '64px 32px', textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, border: '3px solid #ede9fe', borderTop: '3px solid #6c63ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>Analyzing consultants...</p>
              <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>AI is scoring each consultant for this role</p>
            </div>
          )}

          {matches.length > 0 && (
            <div>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, fontWeight: 500 }}>{matches.length} consultant{matches.length !== 1 ? 's' : ''} ranked by match score</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {matches.map((m, i) => (
                  <div key={m.id} style={{ ...card, overflow: 'hidden', transition: 'box-shadow 0.15s' }}>
                    <div onClick={() => setExpanded(expanded === i ? null : i)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer' }}>
                      <div style={{ width: 32, height: 32, background: i === 0 ? '#fef3c7' : '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#92400e' : '#6b7280', flexShrink: 0 }}>
                        #{i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{m.consultant.name}</p>
                        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.consultant.visa_status} · {m.consultant.location} · ${m.consultant.rate}/hr
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ScoreBadge score={m.score} />
                        {expanded === i ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                      </div>
                    </div>

                    {expanded === i && (
                      <div style={{ padding: '0 20px 20px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ paddingTop: 16 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>AI Analysis</p>
                          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: '#f9fafb', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>{m.reason}</p>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
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

                          <div style={{ display: 'flex', gap: 10 }}>
                            <a href={`mailto:?subject=Consultant Profile: ${m.consultant.name}&body=Hi,%0A%0APlease find the profile of our consultant:%0A%0AName: ${m.consultant.name}%0ASkills: ${m.consultant.skills}%0AVisa: ${m.consultant.visa_status}%0ALocation: ${m.consultant.location}%0ARate: $${m.consultant.rate}/hr%0A%0APlease let us know if this profile matches your requirement.%0A%0AThank you`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#6c63ff', color: '#fff', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                              <Send size={13} /> Submit to Vendor
                            </a>
                            {m.consultant.resume_url && (
                              <a href={m.consultant.resume_url} target="_blank" rel="noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f3f4f6', color: '#374151', padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid #e5e7eb' }}>
                                View Resume
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
