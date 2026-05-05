create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null unique,
  prompt_markdown text not null,
  meta_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_one_active_idx
  on public.profiles ((is_active))
  where is_active = true;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'creator')),
  created_at timestamptz not null default now()
);

create table if not exists public.web_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  genre text not null,
  draft_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists web_sessions_user_idx on public.web_sessions (user_id, created_at desc);

create table if not exists public.session_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_sessions(id) on delete cascade,
  round_number int not null,
  suggestions_json jsonb not null,
  selected_indices int[] not null default '{}',
  feedback_text text not null default '',
  direction_tags text[] not null default '{}',
  user_revision_text text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists session_rounds_unique_round
  on public.session_rounds (session_id, round_number);

create table if not exists public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  payload_json jsonb not null,
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists feedback_submissions_status_idx
  on public.feedback_submissions (status, created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id text not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.web_sessions enable row level security;
alter table public.session_rounds enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "user_roles readable by self"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "web_sessions owner read"
  on public.web_sessions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "session_rounds owner read"
  on public.session_rounds for select
  to authenticated
  using (
    exists (
      select 1 from public.web_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

create policy "feedback_submissions owner read"
  on public.feedback_submissions for select
  to authenticated
  using (auth.uid() = user_id);
