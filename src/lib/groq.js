import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
})

export async function chat(prompt) {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  })
  return res.choices[0].message.content.trim()
}

export async function extractJobRequirements(jdText) {
  const prompt = `Extract the following from this job description and return ONLY valid JSON, no markdown, no explanation:
{
  "title": "job title",
  "skills": ["skill1", "skill2"],
  "visaRequired": ["US Citizen", "GC", "H1B"] or "Any",
  "location": "city, state or Remote",
  "duration": "contract duration",
  "rate": "rate range or null",
  "experience": "years required"
}

Job Description:
${jdText}`

  const text = await chat(prompt)
  const jsonStr = text.replace(/```json|```/g, '').trim()
  return JSON.parse(jsonStr)
}

export async function matchConsultants(jobReq, consultants) {
  const consultantList = consultants.map((c, i) =>
    `${i + 1}. ID:${c.id} | ${c.name} | Title: ${c.title || 'Unknown'} | Skills: ${c.skills} | Visa: ${c.visa_status} | Location: ${c.location} | Rate: $${c.rate}/hr`
  ).join('\n')

  const prompt = `You are a strict bench sales recruiter AI. Score each consultant for this job (0-100) based PRIMARILY on skill and role match.

Scoring rules:
- The consultant's Title is the most important signal. If their title does not match the job role, score must be 0-20 regardless of skills listed.
- A ".NET Developer" title for a "Product Manager" job = 0-10. A "Java Developer" for a "Data Scientist" = 0-10. Be strict.
- Skills listed on a resume do NOT override a mismatched title. People list many skills but their title reflects what they actually do.
- If title matches but skills are partial, score 40-70.
- If title and skills both match well, score 70-90.
- Only score 90+ for an exact match on title, skills, and experience.

Return ONLY a valid JSON array, no markdown, no explanation:
[{"id": "exact_consultant_id", "score": 85, "reason": "brief reason"}]

Job Requirements:
- Title: ${jobReq.title}
- Skills needed: ${jobReq.skills?.join(', ')}
- Visa: ${JSON.stringify(jobReq.visaRequired)}
- Location: ${jobReq.location}
- Rate: ${jobReq.rate}

Consultants (use the exact IDs shown):
${consultantList}`

  const text = await chat(prompt)
  const jsonStr = text.replace(/```json|```/g, '').trim()
  return JSON.parse(jsonStr)
}
