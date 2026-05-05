create table if not exists public.weekly_feedback_digests (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null default now(),
  model text not null,
  source_counts jsonb not null default '{}'::jsonb,
  summary_markdown text not null,
  email_to text[] not null default '{}',
  email_status text not null default 'pending',
  email_error text,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_feedback_digests_unique_period
  on public.weekly_feedback_digests (period_start, period_end);

alter table public.weekly_feedback_digests enable row level security;

create policy "weekly_feedback_digests creator read"
  on public.weekly_feedback_digests for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'creator'
    )
  );
