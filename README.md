# ShockProof

ShockProof is an AI-powered smart meter tariff guard for Indian households. It helps users capture an electricity meter reading, extract the cumulative kWh value with Gemini OCR, calculate slab and bill-risk projections, and generate practical household advice before usage crosses expensive tariff thresholds.
<img width="1917" height="910" alt="Image" src="https://github.com/user-attachments/assets/5cac218f-310a-4119-b7f2-664bd85840aa" />
<img width="1897" height="900" alt="Image" src="https://github.com/user-attachments/assets/df0214a8-fe70-4300-a501-60d3c71ab72c" />
<img width="1682" height="900" alt="Image" src="https://github.com/user-attachments/assets/afd60d48-85cf-4a63-907c-d04bac6a5063" />
<img width="1901" height="912" alt="Image" src="https://github.com/user-attachments/assets/20b35134-ce38-4a4f-a206-5ba0d4a3ba54" />
<img width="1917" height="907" alt="Image" src="https://github.com/user-attachments/assets/1fdc04dd-7b32-4f43-831a-a803f11d20bf" />
Built for the INDIA.RUNS 2026 Ideathon, Challenge 3: Improve Everyday Life with AI. 
Built by team Noble Dawn. 

Live URL: https://shockproof.vercel.app

## Ideathon Context

ShockProof was built as an ideathon prototype for everyday household energy awareness in India. Electricity bills can jump sharply when usage crosses tariff slabs, but most households only discover the risk after the bill arrives. ShockProof uses AI meter reading, tariff math, and simple household advice to make that risk visible earlier.

The project focuses on:

- improving everyday bill awareness for Indian households
- making smart meter readings easier to capture and understand
- using AI for practical, local, non-generic advice
- helping users act before crossing a tariff slab
- keeping the experience mobile-first for real household use

## What It Does

- Upload or capture a meter photo/video.
- Store the capture securely in Supabase Storage.
- Create and process a `meter_readings` row.
- Extract the cumulative kWh reading with Gemini.
- Calculate current usage, projected month-end usage, next slab distance, estimated bill, and bill-risk level.
- Generate projection-aware advice with Gemini.
- Show realtime dashboard updates, reading history, usage tracking, and fallback manual correction.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth, Database, Storage, and Realtime
- Gemini OCR and advice generation
- Vercel deployment

## App Structure

```text
ShockProof/
  shockproof-app/
    app/                  Next.js app routes and API routes
    components/           UI and dashboard components
    lib/                  Supabase, Gemini, tariff, and projection helpers
    public/               ShockProof assets
    supabase/             SQL setup files
```


## Local Development

```bash
cd shockproof-app
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment Variables

Create `shockproof-app/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_OCR_MODEL=gemini-2.5-flash-lite
GEMINI_OCR_REVIEW_MODEL=gemini-3.1-flash-lite
GEMINI_ADVICE_MODEL=gemini-3.1-flash-lite
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For production, set `NEXT_PUBLIC_APP_URL` to:

```env
NEXT_PUBLIC_APP_URL=https://shockproof.vercel.app
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` in client-side code.

## Supabase Setup

Required resources:

- `meter_readings` table
- `tariff_slabs` table
- `ai_usage_events` table for app-tracked model usage
- `meter-captures` storage bucket
- RLS policies for authenticated users
- Supabase Auth providers for email, Google, and optionally passkeys

SQL setup files live in:

```text
shockproof-app/supabase/
```

Recommended production SQL order:

```text
minimal-capture-next.sql
tariff-slabs-rajasthan-2025.sql
production-security-policies.sql
```

For production auth, configure Supabase with:

```text
Site URL:
https://shockproof.vercel.app

Redirect URLs:
https://shockproof.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

For passkeys, set the Supabase relying party ID to:

```text
shockproof.vercel.app
```

## Gemini Pipeline

The app uses Gemini in two stages:

1. OCR: extracts the cumulative active energy reading from Indian meter photos/videos.
2. Advice: turns projection numbers into household-friendly savings guidance.

Advice is expected to reference:

- projected month-end usage
- units remaining before the next slab
- bill-risk level
- practical household load actions

## Verification Commands

```bash
npm run lint
npm run build
```

## Deployment

The production app is deployed on Vercel from the `main` branch.

Vercel project settings:

```text
Root Directory: shockproof-app
Framework: Next.js
Build Command: npm run build
Install Command: npm install
Output Directory: .next
```

## Current Status

Implemented:

- Supabase Auth and protected dashboard flow
- Supabase Storage uploads
- Gemini OCR processing
- projection calculation
- Gemini advice generation
- verified Rajasthan tariff seed data for JVVNL, AVVNL, and JdVVNL
- model usage display
- reading history
- capture delete and manual correction fallback
- Vercel deployment

Next priorities:

- add usage caps before wider public testing
- add more verified tariff slabs beyond Rajasthan
- add automated end-to-end tests for production smoke checks
