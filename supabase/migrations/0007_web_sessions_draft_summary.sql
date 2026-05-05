alter table public.web_sessions
add column if not exists draft_summary text;

