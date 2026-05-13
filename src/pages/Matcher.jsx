import { useState } from 'react'
import { Zap, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { extractJobRequirements, matchConsultants } from '../lib/gemini'

export default function Matcher() {
  const [jdText, setJdText] = useState('')
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

    try {
      const { data: allConsultants } = await supabase
        .from('consultants')
        .select('*')
        .eq('status', 'bench')

      if (!allConsultants?.length) {
        setError('No consultants with "bench" status found. Add some consultants first.')
        setLoading(false)
        return
      }

      setConsultants(allConsultants)
      const req = await extractJobRequirements(jdText)
      setJobReq(req)

      const scores = await matchConsultants(req, allConsultants)

      const enriched = scores
        .map(s => ({ ...s, consultant: allConsultants.find(c => c.id === s.id) }))
        .filter(s => s.consultant)
        .sort((a, b) => b.score - a.score)

      setMatches(enriched)
    } catch (err) {
      setError('AI matching failed. Check your Gemini API key and try again.')
      console.error(err)
    }
    setLoading(false)
  }

  function scoreColor(score) {
    if (score >= 80) return 'text-green-700 bg-green-100'
    if (score >= 60) return 'text-amber-700 bg-amber-100'
    return 'text-red-700 bg-red-100'
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">AI Matcher</h2>
        <p className="text-slate-500 text-sm mt-1">Paste a job requirement and get instant match scores for your bench consultants</p>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left: JD Input */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Job Description / Requirement</label>
            <textarea
              value={jdText}
              onChange={e => setJdText(e.target.value)}
              rows={16}
              placeholder="Paste the full job description here...&#10;&#10;Example:&#10;Looking for a Java Developer with 5+ years experience in Spring Boot, Microservices, AWS. Must be on W2. Location: Dallas, TX (hybrid). Rate: $65-75/hr. Duration: 6 months."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <button
              onClick={handleMatch}
              disabled={loading || !jdText.trim()}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Zap size={15} />
              {loading ? 'Analyzing...' : 'Match Consultants'}
            </button>
          </div>

          {/* Extracted job info */}
          {jobReq && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-2">
              <p className="font-medium text-slate-800 mb-3">Extracted Requirements</p>
              {[['Title', jobReq.title], ['Skills', jobReq.skills?.join(', ')], ['Visa', Array.isArray(jobReq.visaRequired) ? jobReq.visaRequired.join(', ') : jobReq.visaRequired], ['Location', jobReq.location], ['Rate', jobReq.rate], ['Duration', jobReq.duration], ['Experience', jobReq.experience]].map(([k, v]) => v && (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 w-20 shrink-0">{k}</span>
                  <span className="text-slate-700 font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Match results */}
        <div className="col-span-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-4">{error}</div>
          )}

          {matches.length === 0 && !loading && !error && (
            <div className="text-center py-20 text-slate-400">
              <Zap size={40} className="mx-auto mb-3 opacity-30" />
              <p>Paste a job description and click Match</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-20 text-slate-400">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
              <p>AI is analyzing your consultants...</p>
            </div>
          )}

          <div className="space-y-3">
            {matches.map((m, i) => (
              <div key={m.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <span className="text-lg font-bold text-slate-300 w-6">#{i + 1}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{m.consultant.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{m.consultant.skills}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">{m.consultant.visa_status} · ${m.consultant.rate}/hr</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${scoreColor(m.score)}`}>
                      {m.score}%
                    </span>
                    {expanded === i ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                </div>

                {expanded === i && (
                  <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                    <p className="text-sm text-slate-600 mb-3">{m.reason}</p>
                    <div className="grid grid-cols-3 gap-3 text-xs text-slate-500 mb-4">
                      <span>📍 {m.consultant.location}</span>
                      <span>🎯 {m.consultant.experience} yrs exp</span>
                      <span>📧 {m.consultant.email || 'No email'}</span>
                    </div>
                    <a
                      href={`mailto:?subject=Consultant Profile: ${m.consultant.name}&body=Hi,%0A%0APlease find the profile of our consultant:%0A%0AName: ${m.consultant.name}%0ASkills: ${m.consultant.skills}%0AVisa: ${m.consultant.visa_status}%0ALocation: ${m.consultant.location}%0ARate: $${m.consultant.rate}/hr%0A%0APlease let us know if this profile matches your requirement.%0A%0AThank you`}
                      className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Send size={12} /> Submit to Vendor
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
