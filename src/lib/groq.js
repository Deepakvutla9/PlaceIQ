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
    `${i + 1}. ID:${c.id} | ${c.name} | Skills: ${c.skills} | Visa: ${c.visa_status} | Location: ${c.location} | Rate: $${c.rate}/hr`
  ).join('\n')

  const prompt = `You are a strict bench sales recruiter AI. Score each consultant for this job (0-100) based PRIMARILY on skill and role match.

Scoring rules:
- If the consultant's skills and background do NOT match the job role at all, score must be 0-15. Do not give high scores out of generosity.
- If there is partial overlap (some transferable skills), score 20-50.
- If skills mostly match but not perfectly, score 51-79.
- Only score 80+ if the consultant is a strong direct match for the role and required skills.
- A .NET developer should score 0-15 for a Product Manager role. A Java developer should score 0-15 for a Data Scientist role. Be strict.

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
