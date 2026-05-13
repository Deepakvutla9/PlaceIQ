# PlaceIQ — AI-Powered Bench Sales Platform

PlaceIQ automates the bench sales recruiter workflow. Add consultants, scan job emails, match profiles with AI, and submit to vendors — all in one place.

## Features

- **Dashboard** — Pipeline funnel, top skills, visa breakdown, quick stats
- **Consultants** — Add/edit bench consultants with AI-powered resume parsing
- **Vendors** — Vendor contact table with AI import from email signatures
- **Job Inbox** — Connect Gmail or Outlook to read and filter job requirement emails
- **HotDesk** — Paste a JD → AI matches consultants → draft email with AI → send via Gmail or Outlook with resume attachments
- **Tracker** — Kanban board to track submissions (Submitted → Interviewing → Offer → Placed / Rejected)

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TailwindCSS v4 |
| Database | Supabase (Postgres + Auth + RLS + Storage) |
| AI | Groq — LLaMA 3 (matching, email generation, resume parsing) |
| Email | Gmail API + Microsoft Graph API (OAuth2 PKCE) |
| Router | React Router v6 |
| Icons | Lucide React |

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/Deepakvutla9/PlaceIQ.git
cd PlaceIQ
npm install
```

### 2. Set up environment variables
Create a `.env.local` file in the root:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GROQ_API_KEY=your_groq_api_key
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_MICROSOFT_CLIENT_ID=your_azure_app_client_id
```

### 3. Set up Supabase
Run the schema in your Supabase SQL editor to create the required tables:
- `consultants`
- `vendors`
- `submissions`

Enable a `resumes` storage bucket (public).

### 4. Run locally
```bash
npm run dev
```

## OAuth Setup

### Gmail
- Enable Gmail API in Google Cloud Console
- Create an OAuth 2.0 Client ID (Web application)
- Add `http://localhost:5173` and `http://localhost:5174` as authorized origins

### Outlook
- Register an app in Microsoft Azure (App registrations)
- Add `http://localhost:5173/blank.html` as a redirect URI (Single-page application)
- Grant `Mail.Read`, `Mail.Send`, `User.Read` permissions
