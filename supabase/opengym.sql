create table if not exists public.opengym_kv (
  key text primary key,
  value jsonb not null
);

alter table public.opengym_kv enable row level security;
revoke all on public.opengym_kv from anon, authenticated;
