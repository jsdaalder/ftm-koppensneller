# FTM Headline Coach (FTM Koppensneller)

LLM-powered web app for iterating on headlines: upload a draft, get multiple headline options, give feedback, and generate new rounds. Includes a creator workflow to review user feedback and rebuild/publish the active “prompt profile”.

The active app is the Next.js code in this repo root (`app/`, `lib/`, `middleware.ts`). 

## What it does
- Converts a draft into structured headline generation rounds (multiple “directions” per round).
- Collects user selections + freeform feedback for each round.
- Routes learnings to a creator review queue (approve/reject + notes).
- Rebuilds an active prompt profile from canonical sources (style docs + corpus insights + approved lessons).
- Enforces strict access control, quota limits, and server-side-only LLM calls.

## Stack
- Next.js App Router + TypeScript
- Supabase (Auth + Postgres)
- OpenAI API calls (server-side only)

## Main routes
- `GET /login`
- `GET /app` (headline coach)
- `GET /docs` and `GET /docs/[slug]` (in-app guideline/training docs)
- `GET /creator` (creator control panel)
- `GET /creator/queue`
- `GET /creator/users`
- `GET /creator/usage`

## API surface (selected)
User/session:
- `POST /api/sessions`
- `POST /api/sessions/:id/rounds/:n/generate`
- `POST /api/sessions/:id/submit-feedback`

Auth / gating:
- `POST /api/auth/magiclink/allowed`
- `POST /api/auth/ftm/start-verification`
- `POST /api/auth/ftm/verify-code`
- `GET /api/auth/ftm/status`

Creator:
- `GET /api/creator/queue`
- `POST /api/creator/queue/:id/approve`
- `POST /api/creator/queue/:id/reject`
- `POST /api/creator/queue/:id/update-notes`
- `POST /api/creator/rebuild-profile`
- `POST /api/creator/run-weekly-feedback-digest`
- `GET /api/creator/users`

Cron:
- `POST /api/cron/weekly-feedback-digest`
- `POST /api/cron/export-approved-feedback`
- `POST /api/cron/export-approved-feedback-lessons`

## Draft input format
- The app currently accepts `.md` drafts in the UI.
- Draft parsing happens server-side; no client-side document parsing.

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

## Scripts / content
- Canonical docs + training inputs live in `content/`.
- Prompt profile artifacts live in `prompt_profiles/`.
- Build/rebuild helpers live in `scripts/`.

## Notes for publishing
- Do not commit `.env`, `.env.local`, `.vercel/`, or any key material.
- Audit large binary assets under `style_info/` and `content/training/` before making the repo public.
