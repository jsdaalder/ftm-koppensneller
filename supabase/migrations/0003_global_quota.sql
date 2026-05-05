create table if not exists public.daily_global_usage (
  usage_date date primary key,
  generation_calls int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_global_usage enable row level security;

create policy "daily_global_usage creator read"
  on public.daily_global_usage for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'creator'
    )
  );

create or replace function public.consume_generation_quota(
  p_user_id uuid,
  p_user_limit int,
  p_global_limit int
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_today date := current_date;
  v_user_calls int;
  v_global_calls int;
begin
  insert into public.daily_usage (user_id, usage_date, generation_calls, updated_at)
  values (p_user_id, v_today, 0, now())
  on conflict (user_id, usage_date) do nothing;

  insert into public.daily_global_usage (usage_date, generation_calls, updated_at)
  values (v_today, 0, now())
  on conflict (usage_date) do nothing;

  select generation_calls into v_user_calls
  from public.daily_usage
  where user_id = p_user_id and usage_date = v_today
  for update;

  select generation_calls into v_global_calls
  from public.daily_global_usage
  where usage_date = v_today
  for update;

  if v_user_calls >= p_user_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'user_limit',
      'user_calls', v_user_calls,
      'global_calls', v_global_calls
    );
  end if;

  if v_global_calls >= p_global_limit then
    return jsonb_build_object(
      'ok', false,
      'reason', 'global_limit',
      'user_calls', v_user_calls,
      'global_calls', v_global_calls
    );
  end if;

  update public.daily_usage
  set generation_calls = generation_calls + 1, updated_at = now()
  where user_id = p_user_id and usage_date = v_today;

  update public.daily_global_usage
  set generation_calls = generation_calls + 1, updated_at = now()
  where usage_date = v_today;

  return jsonb_build_object(
    'ok', true,
    'reason', 'ok',
    'user_calls', v_user_calls + 1,
    'global_calls', v_global_calls + 1
  );
end;
$$;
