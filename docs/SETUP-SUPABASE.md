# Setting up Supabase and logins

The code is ready; these steps need your own accounts, so only you can do them. Until they are
done, the app works exactly as before, with accounts hidden.

You need **two Supabase projects**: `staging` (used by `/next/` and dev previews) and `production`.
The free tier allows two projects.

## 1. Create the projects

1. Sign in at <https://supabase.com> and create a project called `sjakkverkstedet-staging`, region
   *Stockholm (eu-north-1)* or *Frankfurt*. Save the database password somewhere safe.
2. Do the same for `sjakkverkstedet-production`.
3. For each project, note from **Project Settings → API**: the **Project URL**, the **anon public**
   key and the **project ref** (the id in the URL).

## 2. Allow the app's addresses to sign in

In each project: **Authentication → URL Configuration**
- Site URL: `https://bentarne-jpg.github.io/ClaudeChess/` (production) or
  `https://bentarne-jpg.github.io/ClaudeChess/next/` (staging).
- Redirect URLs: `https://bentarne-jpg.github.io/ClaudeChess/**`

## 3. Logins

Every provider asks for a *callback URL*; it is `https://<project-ref>.supabase.co/auth/v1/callback`.

- **Google:** Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* →
  Web application. Add the callback URL. Paste the client ID and secret into Supabase under
  **Authentication → Sign In / Providers → Google**.
- **Facebook:** <https://developers.facebook.com> → *Create app* → *Authenticate and request data
  from users with Facebook Login*. Add the callback URL under Facebook Login → Settings. Paste the
  App ID and App Secret into Supabase under **Facebook**.
- **Vipps:** order *Vipps Login* from Vipps MobilePay (needs a business agreement). In the Vipps
  portal, add the callback URL as a redirect URI. In Supabase, **Authentication → Sign In / Providers
  → Custom Providers → New Provider**: type OIDC, identifier `vipps`, issuer
  `https://api.vipps.no/access-management-1.0/access/` (test: `https://apitest.vipps.no/…`), scopes
  `openid name email`, and the client ID and secret from Vipps.

## 4. Tell GitHub about the projects

In the repository: **Settings → Environments**.
- Create `supabase-staging` and `supabase-production`. In each, add:
  - secret `SUPABASE_ACCESS_TOKEN`: supabase.com → Account → Access Tokens → a token scoped to that
    one project with **Edge Functions: Read-write** and **Edge Function Secrets: Read-write** (nothing else);
  - secret `SUPABASE_DB_PASSWORD`: the project's database password;
  - variable `SUPABASE_PROJECT_REF`: the project id;
  - variable `SUPABASE_POOLER_HOST`: from the project's **Connect → Connection string → Session pooler**,
    the host part, e.g. `aws-1-eu-central-1.pooler.supabase.com`.

  Protect `supabase-production` with yourself as required reviewer.

In **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
|---|---|
| `STAGING_SUPABASE_URL` / `PROD_SUPABASE_URL` | the Project URL |
| `STAGING_SUPABASE_ANON_KEY` / `PROD_SUPABASE_ANON_KEY` | the anon public key (it is public by design; row-level security protects the data) |
| `STAGING_AUTH_PROVIDERS` / `PROD_AUTH_PROVIDERS` | e.g. `google,facebook` – add `custom:vipps` when Vipps is ready |

## 5. Deploy

1. **Actions → Supabase → Run workflow → staging.** It backs up the database, applies the
   migrations and deploys the `api` function.
2. Push anything to `main` (or re-run the latest Deploy) so `/next/` is rebuilt with the staging
   settings. Sign in on `/next/` and try it.
3. When you are happy: **Supabase → production**, then **Deploy → release** a new version.

The service-role key is never needed in GitHub or the app; Edge Functions get it from Supabase.
