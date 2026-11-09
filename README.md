# FTM Koppensneller

De [FTM Koppensneller](https://koppensneller.jandaalder.nl) helpt de redactie van Follow the Money om in meerdere rondes betere koppen te maken. Je uploadt een conceptartikel, kiest een kopeditie, beoordeelt de gegenereerde opties en geeft feedback voor een volgende ronde.

De tool is intern afgeschermd. Inloggen gaat via een magic link naar een goedgekeurd FTM-e-mailadres. Gebruikers die met een extern account inloggen, moeten daarnaast hun FTM-mailbox verifiëren.

## Talen en kopedities

De app ondersteunt twee gekoppelde edities:

- `FTM.nl`: Nederlandse interface en Nederlandse headlines.
- `FTM.eu`: Engelse interface en natuurlijke internationale/UK English headlines.

De editie wordt vóór het starten van een sessie gekozen. Daarna blijft de sessie aan die editie gekoppeld, zodat de gebruikte prompt en logging niet halverwege veranderen. De taalkeuze wordt lokaal onthouden en is ook op de loginpagina beschikbaar.

## Hoe de headlineprofielen worden gemaakt

Het Nederlandse profiel wordt opgebouwd uit de redactionele bronnen in `content/` en uit goedgekeurde feedback. Belangrijke bronnen zijn:

- `content/docs/ftm-stijlgids-condensed.md`
- `content/docs/comite-cliche-weg-ermee.md`
- `content/docs/ftm-koppenchecklist.md`
- `content/docs/koppensneller-electric-boogaloo.md`
- `content/training/ftm_headline_training.jsonl`
- `content/training/historical-corpus-insights.md`
- `content/docs/approved-user-feedback-lessons.md`

Het Engelse profiel wordt niet letterlijk vertaald. `scripts/build_ftm_eu_profile.mjs` gebruikt het actuele Nederlandse profiel als uitgangspunt en past het aan voor FTM.eu. Daarbij wordt het beoordeelde Engelse headlinecorpus in `content/training/ftm_english_headlines_scored.csv` gebruikt. De Engelse koppen zijn als zelfstandige headlines beoordeeld, met ruimte voor gecontroleerde schwung, vragen en beeldspraak zolang ze duidelijk en niet-misleidend blijven.

De actuele profielwijzers staan in:

- `prompt_profiles/current_profile.json` voor FTM.nl;
- `prompt_profiles/current_profile_en.json` voor FTM.eu.

Het Nederlandse profiel kan via de creator-workflow opnieuw worden opgebouwd. Het Engelse profiel wordt momenteel via het buildscript gegenereerd en via de Engelse profielwijzer gepubliceerd.

## Technical information

This repository contains the Next.js app that powers the FTM Koppensneller. The active code lives at the repository root (`app/`, `lib/`, `middleware.ts`).

### Stack

- Next.js App Router + TypeScript
- Supabase Auth + Postgres
- OpenAI Responses API, called server-side only
- Vercel Git integration for production deployment

### Main pages

- `GET /login` — public login page with Dutch/English copy and magic-link login.
- `GET /app` — authenticated headline coach.
- `GET /docs` and `GET /docs/[slug]` — authenticated in-app guideline and training documents.
- `GET /creator` — creator control panel.
- `GET /creator/queue` — feedback review queue.
- `GET /creator/users` — known users.
- `GET /creator/usage` — generation usage dashboard.

End-user UI copy is kept in `content/ui_copy.md`, including the Dutch and English login/app sections. The app loads this through `GET /api/ui-copy`.

### API routes

Session and generation:

- `POST /api/sessions`
- `POST /api/sessions/:id/rounds/:n/generate`
- `POST /api/sessions/:id/submit-feedback`

Authentication and verification:

- `GET /auth/callback`
- `POST /api/auth/magiclink/allowed`
- `GET /api/auth/me`
- `POST /api/auth/ftm/start-verification`
- `GET /api/auth/ftm/status`
- `POST /api/auth/ftm/verify-code`

Profiles and creator actions:

- `GET /api/profile/active`
- `GET /api/creator/queue`
- `POST /api/creator/queue/:id/approve`
- `POST /api/creator/queue/:id/reject`
- `POST /api/creator/queue/:id/update-notes`
- `POST /api/creator/rebuild-profile`
- `POST /api/creator/run-weekly-feedback-digest`
- `GET /api/creator/users`

Scheduled jobs:

- `POST /api/cron/weekly-feedback-digest`
- `POST /api/cron/export-approved-feedback`
- `POST /api/cron/export-approved-feedback-lessons`

### Models and configuration

Model names are configurable through environment variables. Current defaults are documented in `.env.example`:

- `HEADLINE_MODEL` — headline generation; default `gpt-5.6-luna`.
- `DRAFT_SUMMARY_MODEL` — draft summarisation; default `gpt-4.1-mini`.
- `BUILD_PROFILE_MODEL` — prompt-profile rebuilds; default `gpt-5.5`.
- `DIGEST_MODEL` — weekly feedback digest; default `gpt-4.1`.

Do not assume the deployed model from the README alone: Vercel environment variables can override these defaults.

### Security and access control

- `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only.
- No secret is exposed through `NEXT_PUBLIC_*` variables.
- `/app`, `/creator/*`, and `/docs/*` require an authenticated user.
- Access is deny-by-default: users need an appropriate `user_roles` record.
- Creator routes additionally require the `creator` role, with optional `CREATOR_EMAILS` support.
- Email access can be restricted with `ALLOWED_EMAILS` and/or `ALLOWED_EMAIL_DOMAINS`.
- Mutating endpoints enforce same-origin checks.
- Draft uploads are limited to `.md` files and are parsed server-side.

### Usage limits and cost control

- `DAILY_GENERATION_LIMIT` limits each user’s generation calls.
- `GLOBAL_DAILY_GENERATION_LIMIT` limits total daily generation calls.
- Quota consumption is atomic in Postgres through `consume_generation_quota`.

### Feedback and prompt governance

User feedback is stored per session and submitted to the creator queue. Creators can approve or reject feedback, add review notes, export approved lessons and rebuild the Dutch profile. The rebuild and review actions are audit-logged.

The weekly digest summarizes recent feedback and stores its result in `weekly_feedback_digests`. It can run through the protected cron endpoint or the creator endpoint:

- Cron: `POST /api/cron/weekly-feedback-digest` with `CRON_SECRET`.
- Manual: `POST /api/creator/run-weekly-feedback-digest?force=true`.

## Local development

1. Copy `.env.example` to `.env.local` and fill in the required values.
2. Install dependencies: `npm install`.
3. Apply the SQL migrations in `supabase/migrations/` in order.
4. Make sure `GUIDELINES_DIR` points to a directory containing `ftm_styleguide/`, `generic_headline_guides/`, and `extra_docs/`. If it is unset, the code looks for `../guidelines` relative to the repository root.
5. Leave `PROMPT_PROFILES_DIR` unset for the repository-local `prompt_profiles/` fallback, or set it to an explicit profile directory.
6. Start the development server: `npm run dev`.

Before finalising a change, run:

```bash
npm run build
git diff --check
```

For a prompt-profile consolidation, compare the working tree with the pre-change Git revision:

```bash
node scripts/evaluate_prompt_profiles.mjs --before-ref HEAD
```

This regression check verifies that the core Dutch and English editorial rules remain present, response templates stay out of the profiles, and the English adapter is injected only once at runtime.

## Repository layout

- `app/` — Next.js pages and API routes.
- `lib/` — server/client helpers for Supabase, OpenAI, security and profiles.
- `supabase/migrations/` — database schema and policies.
- `content/` — UI copy, documents and training inputs.
- `prompt_profiles/` — generated prompt profiles and current-profile pointers.
- `scripts/` — profile, corpus, feedback and export helpers.

## Deployment

The Vercel project deploys from the repository root. Pushing to the connected `main` branch triggers a production deployment. The live domains are:

- [koppensneller.jandaalder.nl](https://koppensneller.jandaalder.nl)
- [ftm-koppensneller.vercel.app](https://ftm-koppensneller.vercel.app), which redirects to the custom domain.

Do not commit `.env`, `.env.local`, `.vercel/`, tokens, or other key material. Review large binary assets before making the repository public.
