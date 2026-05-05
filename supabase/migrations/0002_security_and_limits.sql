create table if not exists public.daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  generation_calls int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.daily_usage enable row level security;

create policy "daily_usage self read"
  on public.daily_usage for select
  to authenticated
  using (auth.uid() = user_id);
