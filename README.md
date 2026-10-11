# JanDraft

A multilingual drafting assistant that turns a citizen's informal complaint into a clear, respectful, formal administrative grievance in English, Hindi, Bengali or Tamil.

JanDraft is an independent drafting tool. It is **not** a government service, it does **not** submit anything to any authority, and it has **no database**: complaints are sent to Sarvam AI only to generate the draft and are not stored.

## What it produces

For each complaint, JanDraft returns:

- a subject line and a neutral summary
- a **suggested recipient** (a recommendation the user must verify) and why
- an editable formal draft, with `[placeholders]` for details the user didn't provide
- the key facts the user actually stated
- missing information that would strengthen the grievance
- an evidence checklist and practical next steps

The prompt tells the model never to invent dates, names, addresses, laws, contacts or reference numbers, and never to claim the grievance has already been submitted.

## Tech stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- One server route, `POST /api/draft`, which calls the Sarvam AI Chat Completions API (`sarvam-105b`, JSON mode)
- No database, no authentication, no other AI providers

```
src/
  app/
    api/draft/route.ts   # input validation + error mapping (server only)
    layout.tsx           # fonts (incl. Noto Devanagari/Bengali/Tamil), metadata
    page.tsx
    globals.css          # design tokens
  components/JanDraftApp.tsx  # the client UI
  lib/
    grievance.ts         # shared types, limits, languages, categories
    sarvam.ts            # Sarvam call, prompt, JSON parsing, language checks (server only)
```

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Open `.env.local` and set your real key:

```
SARVAM_API_KEY=your_real_sarvam_key
```

```bash
npm run dev
```

Open http://localhost:3000.

Other useful commands:

```bash
npm run lint
```

```bash
npm run build
```

```bash
npm start
```

`.env.local` is gitignored. Only `.env.example` (with a placeholder) is committed. Never prefix the key with `NEXT_PUBLIC_`; it must stay server-side.

## Deploy to Vercel

1. **Push the project to GitHub** (or GitLab/Bitbucket). Check that `.env.local` is *not* in the commit (`git status` should not list it).
2. Go to https://vercel.com/new and **import** the repository. Vercel auto-detects Next.js; leave the build settings at their defaults.
3. Before deploying, open **Environment Variables** and add:
   - **Key:** `SARVAM_API_KEY`
   - **Value:** your Sarvam API subscription key
   - **Environments:** Production, Preview (and Development if you use `vercel dev`)
4. Click **Deploy**.
5. Open the deployment URL, click **Try a sample**, then **Generate Draft** to confirm the end-to-end flow.

If you add or change `SARVAM_API_KEY` after deploying, go to **Deployments → ⋯ → Redeploy**, because environment variables are applied at build/deploy time.

Using the Vercel CLI instead:

```bash
npm i -g vercel
```

```bash
vercel link
```

```bash
vercel env add SARVAM_API_KEY production
```

```bash
vercel --prod
```

The `/api/draft` route sets `maxDuration = 60` seconds. A typical draft takes 4–15 seconds.

## API

`POST /api/draft`

```json
{
  "complaint": "string, 30–4000 characters (required)",
  "location": "string, up to 120 characters (optional)",
  "category": "one of the categories in src/lib/grievance.ts (optional)",
  "language": "same | english | hindi | bengali | tamil (default: same)"
}
```

On success it returns `200` with `subject`, `suggested_recipient`, `recipient_rationale`, `summary`, `formal_draft`, `key_facts`, `missing_information`, `evidence_checklist`, `next_steps` and `output_language`. On error it returns `{ "error": "message" }` with a 4xx/5xx status. Upstream failures are mapped to user-safe messages, and the API key is never echoed.

## Implementation notes

- **Reasoning disabled.** `sarvam-105b` is a reasoning model, and its reasoning tokens share the `max_tokens` budget. With reasoning on, Indic-language drafts sometimes used the whole budget and returned empty content after ~35s. Setting `reasoning_effort: null` gives complete drafts in ~5s.
- **Language enforcement.** For "Same as my complaint", the server detects the complaint's script (Devanagari/Bengali/Tamil/Latin) and gives the model an explicit target language. If the draft comes back in the wrong script, it retries once.
- **Resilient parsing.** Code fences and stray text around the JSON are tolerated, fields are normalised, and a transient or malformed response is retried once if there's time left.
