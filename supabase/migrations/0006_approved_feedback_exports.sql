create table if not exists public.approved_feedback_exports (
  id uuid primary key default gen_random_uuid(),
  generated_at timestamptz not null default now(),
  markdown_text text not null,
  source_count integer not null default 0,
  last_submission_at timestamptz null
);

create index if not exists approved_feedback_exports_generated_at_idx
  on public.approved_feedback_exports (generated_at desc);

