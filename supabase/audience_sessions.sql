-- Theva Live: one server-validated, seven-minute audience session.
create table if not exists public.audience_session (
  id integer primary key check (id = 1),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  operator_owner_id uuid not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

alter table public.audience_session enable row level security;
revoke all on public.audience_session from public, anon, authenticated, service_role;
grant select, insert, update on public.audience_session to service_role;
