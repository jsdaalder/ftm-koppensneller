# Migration + Deploy Plan (Python -> Next.js)

## 1. Parallel run
- Keep archived prototype as fallback reference only.
- Build and run Next.js from repository root (`Projects/ftm_headline_coach`).

## 2. Database
- Maak Supabase project.
- Run `supabase/migrations/0001_init.sql`.
- Voeg minimaal 1 creator-rol toe in `user_roles`.

## 3. Prompt profile seed
- Optie A: laat fallback naar `../prompt_profiles` werken.
- Optie B: seed `profiles` met je actuele profiel en `is_active=true`.

## 4. Environment variabelen (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `HEADLINE_MODEL` (`gpt-4.1`)
- `BUILD_PROFILE_MODEL` (`gpt-5.5`)
- `OPENAI_TIMEOUT_MS`
- `OPENAI_MAX_RETRIES`
- `ALLOWED_EMAIL_DOMAINS` (bijv. `followthemoney.nl,ftm.nl`)
- `DAILY_GENERATION_LIMIT` (bijv. `60`)
- `GLOBAL_DAILY_GENERATION_LIMIT` (bijv. `400`)
- Optioneel: `PROMPT_PROFILES_DIR`, `GUIDELINES_DIR`

## 5. Vercel deploy
1. Push repository to GitHub.
2. Connect repo to Vercel.
3. Set Vercel root directory to repository root.
4. Add environment variables in Vercel Project Settings.
5. Deploy.

## 8. Optional workforce verification layer
- If users log in with personal accounts, require proof of FTM mailbox access:
  - apply `supabase/migrations/0004_ftm_email_verification.sql`
  - configure `RESEND_API_KEY` and `FTM_VERIFICATION_FROM_EMAIL`
  - users verify a code sent to `@ftm.nl` / `@followthemoney.nl` before usage.

## 9. Weekly feedback digest
- apply migration: `supabase/migrations/0005_weekly_feedback_digests.sql`
- set env vars:
  - `WEEKLY_DIGEST_RECIPIENTS`
  - `DIGEST_MODEL`
  - `CRON_SECRET`
- Vercel cron calls `/api/cron/weekly-feedback-digest` weekly.

## 6. Auth-ready nu, uitbreidbaar later
- v1 gebruikt Supabase magic link login.
- Rolmodel (`user`, `creator`) is al aanwezig.
- Later kun je SSO/OAuth toevoegen zonder API contractbreuk.

## 7. Governance flow
- User doet sessies en submit feedback.
- Creator keurt queue-items goed/af.
- Creator triggert handmatig `POST /api/creator/rebuild-profile`.
- Nieuwe actieve profile wordt atomair gezet in `profiles`.
