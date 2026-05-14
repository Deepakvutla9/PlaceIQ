import * as pdfjsLib from 'pdfjs-dist'
import { chat } from './groq'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text
}

async function extractTextFromDOCX(file) {
  const { default: mammoth } = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

export async function extractTextFromResume(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'pdf') return extractTextFromPDF(file)
  if (ext === 'doc' || ext === 'docx') return extractTextFromDOCX(file)
  throw new Error('Unsupported file type')
}

export async function parseResumeWithAI(resumeText) {
  const prompt = `Extract the following details from this resume and return ONLY valid JSON, no markdown, no explanation:
{
  "name": "full name",
  "email": "email address or empty string",
  "phone": "phone number or empty string",
  "title": "the person's current or most recent job title exactly as it appears on the resume (e.g. .NET Developer, Java Developer, Product Manager)",
  "skills": "comma separated list of technical skills",
  "experience": "total years of experience as a number or empty string",
  "location": "city, state or empty string"
}

Resume:
${resumeText.slice(0, 4000)}`

  const text = await chat(prompt)
  const jsonStr = text.replace(/```json|```/g, '').trim()
  return JSON.parse(jsonStr)
}
