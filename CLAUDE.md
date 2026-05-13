# PlaceIQ — AI-Powered Bench Sales Platform

## Project Vision
A web app that automates the bench sales recruiter workflow. Recruiters add their bench consultants, scan job emails from Gmail/Outlook, get AI match scores, and submit consultant profiles to vendors — all in one platform.

## Tech Stack
- **Frontend**: React + Vite + TailwindCSS v4
- **Backend/DB**: Supabase (Postgres + Auth + RLS + Storage)
- **AI**: Groq (LLaMA 3) — JD extraction, consultant matching, email generation, vendor extraction
- **Email**: Gmail API + Microsoft Graph API (OAuth2 PKCE)
- **Router**: React Router v6
- **Icons**: Lucide React

## Project Structure
```
src/
  context/AuthContext.jsx     — Supabase auth state
  lib/supabase.js             — Supabase client
  lib/groq.js                 — Groq AI: JD extraction, matching, email generation, resume parsing
  lib/microsoft.js            — Microsoft PKCE OAuth + Graph API (Outlook read/send)
  lib/resumeParser.js         — Resume text extraction + AI parsing
  components/Layout.jsx       — Sidebar + nav shell
  pages/
    Login.jsx                 — Auth page (sign in / sign up)
    Dashboard.jsx             — Analytics: pipeline funnel, skills, visa breakdown
    Consultants.jsx           — Add/edit/list bench consultants with resume upload
    Vendors.jsx               — Vendor table with AI import from email signatures
    JobInbox.jsx              — Gmail + Outlook inbox for reading job requirement emails
    HotDesk.jsx               — AI match consultants to JD → compose → send to vendor
    Tracker.jsx               — Kanban board: Submitted → Interviewing → Offer → Placed/Rejected
public/
  blank.html                  — OAuth redirect page for Microsoft PKCE popup flow
```

## Environment Variables (.env.local)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GROQ_API_KEY=
VITE_GOOGLE_CLIENT_ID=
VITE_MICROSOFT_CLIENT_ID=
```

## Database Tables
- `consultants` — bench consultant profiles (name, skills, visa, rate, location, resume_url)
- `vendors` — vendor contacts (company, contact_name, role, email, phone)
- `submissions` — Kanban tracker entries (consultant_id, vendor_id, job_title, status, notes)

## Resumes
Stored in Supabase Storage bucket `resumes` under path:
`{user_id}/{consultant_id}_{Consultant_Name}_Resume.{ext}`

## Auth
- Supabase Auth (email/password)
- Google OAuth via `@react-oauth/google` (Gmail API access)
- Microsoft OAuth via manual PKCE flow (no MSAL) → `public/blank.html` redirect

## Running Locally
```bash
npm install
npm run dev
```

## Features Completed
- [x] Auth (Supabase email + Google OAuth)
- [x] Consultant manager with AI resume parsing
- [x] Vendor manager with AI import from email signatures
- [x] Gmail + Outlook inbox (read job emails, filter by keywords)
- [x] HotDesk — AI match JD → select consultants → AI draft email → send via Gmail/Outlook with resume attachments
- [x] Submission Tracker (Kanban board)
- [x] Dashboard analytics (pipeline funnel, top skills, visa breakdown)
