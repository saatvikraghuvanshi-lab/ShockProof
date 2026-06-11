# Supabase Setup

## 1. Create Project

1. Go to Supabase.
2. Create a new project.
3. Copy:
   - Project URL
   - Anon public key
   - Service role key

Create `.env.local` in `shockproof-app`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client components.

## 2. Run Database Setup

Open Supabase SQL Editor and run:

```txt
supabase/schema.sql
```

This creates:

- `profiles`
- `households`
- `meter_readings`
- `tariff_slabs`
- `reading_projections`
- Storage bucket: `meter-captures`
- RLS policies

## 3. Auth Settings

In Supabase Auth:

- Enable Email provider for now.
- Add Google provider later for Google sign-in.
- Passkeys/WebAuthn will need a dedicated implementation pass.

Redirect URLs:

```txt
http://localhost:3000/**
https://your-vercel-domain.vercel.app/**
```

Site URL:

```txt
http://localhost:3000
```

Update this to your Vercel URL after deployment.

## 4. Storage Rules

The `meter-captures` bucket is private.

Expected object path format:

```txt
{user_id}/{household_id}/{reading_id}/{filename}
```

The included RLS policies allow users to read/write only objects where the first path segment is their `auth.uid()`.

## 5. App Integration Order

1. Replace prototype `localStorage` auth guard with Supabase session guard.
2. On signup, create:
   - `profiles` row
   - `households` row
3. In Capture tab:
   - create `meter_readings` row
   - upload file to `meter-captures`
   - update row to `processing`
4. Add Gemini extraction API route.
5. Update `meter_readings` with extracted kWh.
6. Calculate projection and insert `reading_projections`.
7. Subscribe to row updates with Supabase Realtime.
