# AGENTS.md

Repository-specific instructions for coding agents working on `ftm_headline_coach`.

## Scope
- Active application root is this repository root.
- Primary app is Next.js (`app/`, `lib/`, `supabase/`, `middleware.ts`).
- Deprecated prototype material is archived under `archive/` and is not part of active development.

## Do Not Modify (unless explicitly requested)
- `archive/**`
- Secrets files (`.env`, `.env.local`, any real key material)

## Security Requirements
- Never expose `OPENAI_API_KEY` to client-side code.
- Never introduce `NEXT_PUBLIC_*` variables that contain secrets.
- Keep all OpenAI calls server-side only (route handlers/server modules).
- Keep same-origin checks for mutating endpoints.
- Keep role checks on creator endpoints.

## Auth and Access Control
- `/app` requires authenticated user.
- `/creator/*` requires `creator` role.
- Deny by default: user must have a record in `user_roles`.
- Enforce allowlist policy (`ALLOWED_EMAILS` preferred, domain fallback).

## Usage Limits and Cost Control
- Generation endpoints must enforce:
  - per-user daily limit (`DAILY_GENERATION_LIMIT`)
  - global daily limit (`GLOBAL_DAILY_GENERATION_LIMIT`)
- Quota checks should remain atomic in Postgres (`consume_generation_quota`).

## Data Handling
- Accept only `.docx` uploads for drafts.
- Parse document text server-side only.
- No macro execution or untrusted code execution from uploads.
- Keep request/file size limits in place.

## Prompt Governance
- Prompt profile updates must remain creator-gated.
- Approval flow: user submission -> creator review -> explicit rebuild/publish.
- Preserve auditability for approve/reject/rebuild actions.

## Development and Validation
- Before finalizing changes:
  1. run `npm run build`
  2. ensure API/auth behavior remains intact
  3. verify no secret leakage in logs/responses
- Keep changes minimal and scoped; avoid unrelated refactors.

## Deployment Notes
- Vercel deploy root is repository root.
- Required env vars are documented in `.env.example` and `README.md`.
