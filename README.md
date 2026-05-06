# FTM Koppensneller

Technical explanation in English can be found below.

### Het probleem

Kunstmatige intelligentie kan journalisten helpen met koppen maken. Dat doen veel FTM'ers ook al en soms werkt dat, maar vaak zijn de suggesties:
- te generiek of “Amerikaans”
- niet scherp genoeg op de nieuwswaarde
- niet in FTM-toon (te veel cliché, te weinig concreet, verkeerde focus)
- onvoldoende consistent (de ene keer raak, de volgende keer mis)

### Wat ik gebouwd heb
De **FTM Koppensneller** is een webtool die een concept van je artikel gebruikt om koppen te genereren met een taalmodel (om precies te zijn: gpt-4.1). Je kiest de beste opties, geeft feedback (waarom waren de voorgestelde koppen goed of juist niet goed?), en de generator houdt rekening met die feedback bij een volgende ronde. Zo kom je sneller bij een kop die wél FTM-waardig is.

De tool is hier te vinden: https://ftm-koppensneller.vercel.app/

### Hoe ik dit heb gebouwd
Wat deze tool anders maakt dan ChatGPT is de instructie die gpt4-1 'onder de motorkap' meekrijgt. Daarin staat precies waaraan een FTM-kop moet voldoen. Deze **FTM-specifieke prompt**:
- ...volgt de door team-socials en hoofd- en eindredactie opgestelde koppenrichtlijn (`content/docs/ftm-koppenchecklist.md`),
- ...gebruikt voorbeelden en patronen uit een lijst met bestaande FTM-koppen (`content/training/ftm_headline_training.jsonl` en samenvatting in `content/training/historical-corpus-insights.md`),
- ... is terughoudend met het gebruik van de clichélijst opgesteld door enkele NRC-redacteuren (`content/docs/comite-cliche-weg-ermee.md`)
- ...neemt (een gecomprimeerde versie van) de FTM-stijlgids in ogenschouw (`content/docs/ftm-stijlgids-condensed.md`)
- ...leert van de feedback die jij, de gebruiker, geeft op de kopsuggesties (`content/docs/approved-user-feedback-lessons.md`).


De prompt zelf kun je in het mapje `prompt_profiles` terugvinden. Dat document is ook los van het gebruik van deze tool nuttig, denk ik.

In de toekomst wil ik de prompt verder verbeteren door een analyse te draaien op een lijst met de koppen die de meeste pageviews van externe platformen hebben gekregen.

---

# Technical information (English)

This repository contains the Next.js app that powers the FTM Koppensneller. The active code lives at the repo root (`app/`, `lib/`, `middleware.ts`).

## What it does
- Runs iterative headline generation rounds from an uploaded draft (`.md` in the UI).
- Collects selections + feedback per round and stores them for review.
- Provides a creator workflow to approve/reject feedback and rebuild the active prompt profile.
- Enforces strict access control, quotas, and server-side-only LLM calls.

## Stack
- Next.js App Router + TypeScript
- Supabase (Auth + Postgres)
- OpenAI API calls (server-side only)

## Main pages
- `GET /login`
- `GET /app` (headline coach)
- `GET /docs` and `GET /docs/[slug]` (in-app guideline/training docs)
- `GET /creator` (creator control panel)
- `GET /creator/queue`
- `GET /creator/users`
- `GET /creator/usage`

## API (selected)
User/session
- `POST /api/sessions`
- `POST /api/sessions/:id/rounds/:n/generate`
- `POST /api/sessions/:id/submit-feedback`

Auth / gating
- `POST /api/auth/magiclink/allowed`
- `POST /api/auth/ftm/start-verification`
- `POST /api/auth/ftm/verify-code`
- `GET /api/auth/ftm/status`

Creator
- `GET /api/creator/queue`
- `POST /api/creator/queue/:id/approve`
- `POST /api/creator/queue/:id/reject`
- `POST /api/creator/queue/:id/update-notes`
- `POST /api/creator/rebuild-profile`
- `POST /api/creator/run-weekly-feedback-digest`
- `GET /api/creator/users`

Cron
- `POST /api/cron/weekly-feedback-digest`
- `POST /api/cron/export-approved-feedback`
- `POST /api/cron/export-approved-feedback-lessons`

## Prompt profile sources
The active prompt profile is built from the canonical sources in `content/` and `content/training/` and published via the creator workflow. Key inputs include:
- `content/docs/ftm-koppenchecklist.md`
- `content/docs/ftm-stijlgids-condensed.md`
- `content/docs/comite-cliche-weg-ermee.md`
- `content/training/ftm_headline_training.jsonl`
- `content/training/historical-corpus-insights.md`
- `content/docs/approved-user-feedback-lessons.md`

## Security & access model (high level)
- OpenAI key is never exposed to the browser (`OPENAI_API_KEY` is server-only).
- Supabase anon key is used client-side; Supabase service role key is server-only.
- `/app` and `/creator/*` require an authenticated user.
- Deny-by-default: users must have a row in `user_roles` (and `role=creator` for creator routes).
- Optional email allowlisting via `ALLOWED_EMAILS` and/or `ALLOWED_EMAIL_DOMAINS`.
- Mutating endpoints enforce same-origin checks.

## Usage limits / cost control
- Per-user daily limit via `DAILY_GENERATION_LIMIT`
- Global daily limit via `GLOBAL_DAILY_GENERATION_LIMIT`
- Quota checks are atomic in Postgres (`consume_generation_quota`) to avoid race-condition bypasses.

## Weekly feedback digest
- Summarizes the last week of submitted feedback using an LLM.
- Stores output in `weekly_feedback_digests` for audit/history.
- Cron trigger: `POST /api/cron/weekly-feedback-digest` guarded by `CRON_SECRET` (Bearer or `x-cron-secret`).
- Manual creator trigger: `POST /api/creator/run-weekly-feedback-digest?force=true`

## Local development
1. Copy `.env.example` to `.env.local` and fill in values.
2. Install deps: `npm install`
3. Set up Supabase DB schema by running the SQL migrations in `supabase/migrations/` (in order).
4. Start: `npm run dev`

## Repo layout
- `app/`: Next.js pages + API routes
- `lib/`: server/client helpers (Supabase, OpenAI, security, etc.)
- `supabase/migrations/`: database schema and policies
- `content/`: docs and training inputs (source material)
- `prompt_profiles/`: generated prompt profile artifacts
- `scripts/`: profile build/export helpers

## Notes for publishing
- Do not commit `.env`, `.env.local`, `.vercel/`, or any key material.
- Audit large binary assets under `style_info/` and `content/training/` before making the repo public.
