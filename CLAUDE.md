# PlaceIQ — AI-Powered Bench Sales Platform

## Project Vision
A web app that automates the bench sales recruiter workflow. Recruiters add their bench consultants, paste a job requirement, and get instant AI match scores — then submit to vendors in one click.

## Tech Stack
- **Frontend**: React + Vite + TailwindCSS v4
- **Backend/DB**: Supabase (Postgres + Auth + RLS)
- **AI**: Google Gemini 1.5 Flash
- **Router**: React Router v6
- **Icons**: Lucide React

## Project Structure
```
src/
  context/AuthContext.jsx   — Supabase auth state
  lib/supabase.js           — Supabase client
  lib/gemini.js             — Gemini API: JD extraction + matching
  components/Layout.jsx     — Sidebar + nav shell
  pages/
    Login.jsx               — Auth page (sign in / sign up)
    Dashboard.jsx           — Stats overview
    Consultants.jsx         — Add/edit/list bench consultants
    Matcher.jsx             — AI JD matcher
```

## Environment Variables (.env.local)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GEMINI_API_KEY=
```

## Database Setup
Run `supabase_schema.sql` in Supabase SQL editor.

## Running Locally
```bash
npm install
npm run dev
```

## Roadmap
- [x] Phase 1: Auth + Consultant Manager + AI Matcher
- [ ] Phase 2: Vendor DB + Email outreach + follow-up sequences
- [ ] Phase 3: Submission tracker (Kanban)
- [ ] Phase 4: Dashboard analytics + team mode
