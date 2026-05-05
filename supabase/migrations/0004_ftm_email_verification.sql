create table if not exists public.user_ftm_verification (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ftm_email text,
  ftm_verified_at timestamptz,
  pending_ftm_email text,
  code_hash text,
  code_expires_at timestamptz,
  attempts int not null default 0,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_ftm_verification_ftm_email_unique
  on public.user_ftm_verification (ftm_email)
  where ftm_email is not null;

alter table public.user_ftm_verification enable row level security;

create policy "user_ftm_verification self read"
  on public.user_ftm_verification for select
  to authenticated
  using (auth.uid() = user_id);
