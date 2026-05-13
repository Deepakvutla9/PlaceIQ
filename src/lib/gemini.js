import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

export async function extractJobRequirements(jdText) {
  const prompt = `Extract the following from this job description and return ONLY valid JSON, no markdown:
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

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const jsonStr = text.replace(/```json|```/g, '').trim()
  return JSON.parse(jsonStr)
}

export async function matchConsultants(jobReq, consultants) {
  const consultantList = consultants.map((c, i) =>
    `${i + 1}. ${c.name} | Skills: ${c.skills} | Visa: ${c.visa_status} | Location: ${c.location} | Rate: $${c.rate}/hr`
  ).join('\n')

  const prompt = `You are a bench sales recruiter AI. Score each consultant for this job (0-100) and explain why.
Return ONLY valid JSON array, no markdown:
[{"id": "consultant_id", "score": 85, "reason": "Strong match on skills X and Y, visa ok, rate within budget"}]

Job Requirements:
- Title: ${jobReq.title}
- Skills needed: ${jobReq.skills?.join(', ')}
- Visa: ${JSON.stringify(jobReq.visaRequired)}
- Location: ${jobReq.location}
- Rate: ${jobReq.rate}

Consultants:
${consultantList}

Use these exact IDs in your response: ${consultants.map(c => c.id).join(', ')}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const jsonStr = text.replace(/```json|```/g, '').trim()
  return JSON.parse(jsonStr)
}
