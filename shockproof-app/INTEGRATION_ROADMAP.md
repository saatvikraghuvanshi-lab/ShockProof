# ShockProof Integration Roadmap

This is the step-by-step path from the current shadcn prototype to a real Supabase + Gemini + Vercel app.

## 1. Capture Flow

Current UI supports:

- Take photo: `accept="image/*"` with `capture="environment"`
- Record video: `accept="video/*"` with `capture="environment"`
- Upload from gallery: `accept="image/*,video/*"`

Next implementation:

1. Store the selected file in React state.
2. Validate file type and size.
3. Create a `meter_readings` row with status `uploading`.
4. Upload file to Supabase Storage.
5. Update row status to `processing`.
6. Trigger the Gemini extraction route/function.

## 2. Gemini Models

Recommended split:

- Meter OCR/extraction: `gemini-2.5-flash-lite`
- Advice generation: `gemini-3.1-flash-lite`

Current official notes:

- Gemini 2.5 Flash-Lite is designed for fast, low-cost multimodal extraction.
- Gemini 3.1 Flash-Lite is stable, low-latency, cost-effective, and supports text, image, video, audio, and PDF inputs.
- Gemini video input is supported through the File API / file input methods.

Important rule:

- Never call Gemini directly from the browser. Keep `GEMINI_API_KEY` server-side only.

## 3. Gemini Extraction Route

Create:

```txt
app/api/readings/extract/route.ts
```

Flow:

1. Receive `readingId`.
2. Fetch reading row from Supabase.
3. Create signed URL or download Storage object server-side.
4. Send image/video to Gemini.
5. Ask for strict JSON:

```json
{
  "reading_kwh": 0,
  "confidence": 0,
  "display_type": "kWh",
  "notes": ""
}
```

Suggested extraction prompt:

```txt
You are reading an Indian digital electricity meter.
Find the frame or image where the display label is kWh, import energy, or total active energy.
Ignore date, time, max demand, voltage, current, and power factor screens.
Return only strict JSON with reading_kwh as a number.
If unsure, return confidence below 0.75 and explain briefly in notes.
```

## 4. Advice Generation Route

Create:

```txt
app/api/readings/advice/route.ts
```

Input:

- current reading
- billing cycle day
- days left
- selected Discom
- current slab threshold
- projected units
- estimated bill delta
- preferred language

Use `gemini-3.1-flash-lite` for short localized advice.

Suggested advice prompt:

```txt
Generate concise household electricity-saving advice.
Tone: calm, practical, non-alarming.
Language preference: {language}.
Mention rupee impact only if provided by backend math.
Do not invent tariff rules or amounts.
Return JSON: title, message, actions[].
```

## 5. Supabase Setup

Create a Supabase project.

Run the full SQL setup in:

```txt
supabase/schema.sql
```

Tables:

```sql
profiles
- id uuid primary key references auth.users(id)
- full_name text
- phone text
- preferred_language text
- created_at timestamptz default now()

households
- id uuid primary key default gen_random_uuid()
- owner_id uuid references auth.users(id)
- state text
- discom text
- billing_cycle_day int
- consumer_number text
- created_at timestamptz default now()

meter_readings
- id uuid primary key default gen_random_uuid()
- household_id uuid references households(id)
- captured_by uuid references auth.users(id)
- file_path text
- file_type text
- reading_kwh numeric
- confidence numeric
- status text default 'draft'
- captured_at timestamptz default now()
- processed_at timestamptz
- error_message text

tariff_slabs
- id uuid primary key default gen_random_uuid()
- state text
- discom text
- consumer_category text
- slab_start numeric
- slab_end numeric
- rate numeric
- fixed_charge numeric
- effective_from date

reading_projections
- id uuid primary key default gen_random_uuid()
- reading_id uuid references meter_readings(id)
- projected_units numeric
- next_slab_at numeric
- units_to_next_slab numeric
- estimated_bill numeric
- estimated_delta numeric
- advice_json jsonb
- created_at timestamptz default now()
```

Storage buckets:

- `meter-captures`

RLS:

- Users can read/write only their own profile.
- Users can access households where `owner_id = auth.uid()`.
- Users can access readings through their own households.
- Storage objects should be scoped by `user_id/household_id/reading_id`.

## 6. GitHub Repo

From `shockproof-app`:

```bash
git init
git add .
git commit -m "Initial ShockProof shadcn prototype"
gh repo create shockproof-tariff-guard --private --source=. --remote=origin --push
```

If you do not use GitHub CLI:

1. Create an empty repo on GitHub.
2. Copy the repo URL.
3. Run:

```bash
git remote add origin <repo-url>
git branch -M main
git push -u origin main
```

## 7. Vercel Deployment

1. Push to GitHub.
2. Import the repo in Vercel.
3. Framework preset: Next.js.
4. Add environment variables:

```txt
GEMINI_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
```

5. Deploy.
6. Add the Vercel production URL to Supabase Auth redirect URLs.

## 8. Build Order

Recommended order:

1. Finish UI flow and legal pages.
2. Create Supabase schema and Storage bucket.
3. Add Supabase client/server helpers.
4. Implement auth.
5. Implement upload to Storage.
6. Implement Gemini extraction route.
7. Implement tariff calculation function.
8. Implement advice route.
9. Add Realtime subscription for reading status.
10. Deploy to Vercel.

## References

- Gemini video understanding: https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini file input methods: https://ai.google.dev/gemini-api/docs/interactions/file-input-methods
- Gemini model list: https://ai.google.dev/gemini-api/docs/models
- Gemini 2.5 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
- Gemini 3.1 Flash-Lite: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
