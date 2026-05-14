<div align="center">
  <img src="./public/logo.png" alt="SocialMoon Logo" width="180" />

# SocialMoon AI Chat

  **Private Repository — Internal Use Only**

  AI-powered sales chat for SocialMoon agency. Visitors talk to Avena, our AI assistant, who answers questions about services and case studies — and automatically captures leads into the database.

  ![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
  ![OpenRouter](https://img.shields.io/badge/OpenRouter-Claude%20Sonnet-blueviolet?style=flat-square)
  ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square&logo=supabase)
  ![License](https://img.shields.io/badge/license-Private-red?style=flat-square)

</div>

---

## What It Does

Visitors open the chat, ask about SocialMoon's services (SEO, paid ads, social media, web design), and get instant, knowledgeable responses from Avena. When specific needs emerge, Avena connects them with the team. Contact details shared during the conversation are silently extracted and stored as leads in Supabase — no forms required.

---

## Features

- **Voice Agent** — Users can speak to Avena with browser speech recognition when available, and a recording-based transcription fallback keeps voice usable on unsupported browsers
- **Team Connection** — When users have specific needs, Avena connects them with the team for personalized solutions
- **Auto Session Tracking** — Captures topic, latest query, negotiation flag, and contact details from each conversation
- **Admin Dashboard** — `/leads` view shows tracked conversation sessions and captured contact info
- **Light / Dark / System Theme** — Three-way toggle, respects OS preference by default
- **Hardened Chat API** — Input validation, role injection prevention, message limits, safe error handling

---

## Tech Stack

| Layer                | Technology                                       |
| -------------------- | ------------------------------------------------ |
| **Framework**  | Next.js 15 (App Router, Turbopack)               |
| **AI**         | OpenRouter API —``anthropic/claude-sonnet-4-5`` |
| **Database**   | Supabase (PostgreSQL)                            |
| **Styling**    | Tailwind CSS + CSS Variables                     |
| **Theme**      | next-themes                                      |
| **Deployment** | Vercel                                           |

---

## Project Structure

```
app/
  chat/page.tsx          # Main chat UI
  api/chat/route.ts      # Chat endpoint (AI + lead extraction)
  api/leads/route.ts     # Leads endpoint (currently disabled)
  leads/page.tsx         # Leads dashboard (currently disabled)
components/
  app-logo.tsx           # SocialMoon logo component
  theme-toggle.tsx       # Light / Dark / System toggle
  theme-provider.tsx     # next-themes wrapper
lib/
  openrouter.ts          # OpenRouter client + model constants
  supabase/              # Supabase server + client helpers
public/
  logo.png               # Primary logo
  logo2.png              # Alt logo variant
supabase/
  migrations/            # Database schema
```

---

## Database Schema

```sql
CREATE TABLE leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT,
  email      TEXT,
  phone      TEXT,
  query      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Run this migration once in the Supabase SQL editor or via ``npx supabase db push``.

---

## Local Setup

### 1. Clone and configure environment

```bash
cp .env.example .env.local
```

Fill in your keys in ``.env.local`` (see ``.env.example`` for all required variables).

### 2. Install dependencies

```bash
npm install
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the Avena chat interface.

### 4. Deploy to Vercel

```bash
vercel deploy --prod
```

Add environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Environment Variables

See [.env.example](.env.example) for the full list. Required keys:

| Variable                                         | Description                                       |
| ------------------------------------------------ | ------------------------------------------------- |
| ``OPENROUTER_API_KEY``                           | From[openrouter.ai/keys](https://openrouter.ai/keys) |
| ``NEXT_PUBLIC_SUPABASE_URL``                     | Supabase project URL                              |
| ``NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`` | Supabase publishable key                          |
| ``SUPABASE_SERVICE_ROLE_KEY``                    | Supabase service role key (server-only)           |
| ``DATABASE_URL``                                 | Supabase direct Postgres connection string        |

---

## Security

- All environment files (``.env``, ``.env.local``) are gitignored — never committed
- Chat API validates content-type, sanitizes all input, and blocks system-role injection
- OpenRouter API key is validated at startup — server fails fast if missing
- Error responses never expose internal details or stack traces

---

## AI Models

| Use                | Model                           | Notes                                           |
| ------------------ | ------------------------------- | ----------------------------------------------- |
| Chat (Avena)       | ``anthropic/claude-sonnet-4-5`` | Primary — best quality for sales conversations |
| Fast / background  | ``google/gemini-2.0-flash-001`` | Available for lower-cost tasks                  |
| Advanced reasoning | ``anthropic/claude-opus-4``     | Reserved for future complex workflows           |

---

## Roadmap

- [ ] Re-enable leads dashboard with auth
- [ ] Conversation history persistence
- [ ] Calendar booking integration (discovery calls)
- [ ] Email follow-up automation after lead capture
- [ ] Analytics on common questions and conversion rates
