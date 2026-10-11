# Switching on Google sign-in

Google sign-in is built but switched off until SAZO has its own Google keys. It takes about 15 minutes.

## 1. Create the Google project (free)

1. Go to https://console.cloud.google.com and sign in with the Google account that should own SAZO's sign-in (a company account is best, not a personal one).
2. Top bar → project picker → **New project** → name it `SAZO` → Create.

## 2. The consent screen (what people see when they choose Google)

1. Menu → **APIs & Services → OAuth consent screen** (on newer consoles: **Google Auth Platform → Branding**).
2. User type **External**. App name `SAZO`, support email, SAZO logo (optional), and the developer contact email.
3. Scopes: only `openid`, `email`, `profile` — SAZO asks for nothing else.
4. While testing, add your own Gmail addresses as **test users**. Before launch, press **Publish app** (Google may ask to verify the domain).

## 3. The keys

1. Menu → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**, name `SAZO website`.
3. **Authorised redirect URIs** — add each website address with `/auth/google/callback`:
   - `http://localhost:3001/auth/google/callback` (your computer)
   - `https://<the real SAZO website>/auth/google/callback` (once hosted)
4. Create. Copy the **Client ID** and **Client secret**.

## 4. Give them to SAZO

Set these where the API runs (never commit them to GitHub):

```
GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret>
PUBLIC_WEB_URL=<the website address, exactly as in the redirect URI, without /auth/google/callback>
```

Restart the API. "Continue with Google" now appears on the log-in and sign-up pages.

## How it behaves

- First time: Google tells SAZO the person's name and email; SAZO still asks surname, gender and date of birth (18+) before the account exists.
- A Google account whose email matches an existing SAZO account (confirmed by Google) is linked to that account.
- SAZO staff, managers and dealers still get the second step on a new device after choosing Google.
- The garage phone app doesn't offer Google yet (phone code or email and password there).
