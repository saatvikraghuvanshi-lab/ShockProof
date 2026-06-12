# ShockProof Auth Setup

## 1. Supabase URL configuration

In Supabase, open **Authentication > URL Configuration**.

Set:

```text
Site URL: http://localhost:3000
Redirect URLs:
http://localhost:3000/auth/callback
```

When deploying to Vercel, add these too:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app
https://YOUR-VERCEL-DOMAIN.vercel.app/auth/callback
```

## 2. Email sign-in

In **Authentication > Providers > Email**, keep email sign-in enabled.

Use the app's **Send sign-in email** button with a real email address. The link should redirect back through:

```text
/auth/callback
```

## 3. Google sign-in

In **Authentication > Providers > Google**, enable Google.

Create OAuth credentials in Google Cloud, then paste the Client ID and Client Secret into Supabase.

Add this authorized redirect URI in Google Cloud:

```text
https://ticugnwskvuhnsbgjrtn.supabase.co/auth/v1/callback
```

## 4. Passkeys

Passkeys are experimental in Supabase and require `@supabase/supabase-js` version `2.105.0` or newer. This app uses `2.108.1`.

In Supabase, enable the Passkeys/WebAuthn provider if it is available in your project Auth settings.

Use flow:

1. Sign in once with Google or email.
2. Open **Settings** in ShockProof.
3. Click **Add passkey**.
4. Next time, use **Continue with passkey** on `/login`.

Passkeys work on `localhost` during development and require HTTPS on deployed domains.
