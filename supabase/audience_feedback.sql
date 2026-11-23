-- Theva Live: persistent feedback from server-validated audience sessions.
create table if not exists public.audience_feedback (
  id uuid primary key default gen_random_uuid(),
  session_started_at timestamptz not null,
  created_at timestamptz not null default now(),
  rating integer not null check (rating between 1 and 5),
  learning text not null check (learning in ('Yes', 'A little', 'No')),
  comment text not null default '' check (char_length(comment) <= 1000)
);

create index if not exists audience_feedback_created_at_idx
  on public.audience_feedback (created_at desc);

alter table public.audience_feedback enable row level security;
revoke all on public.audience_feedback from public, anon, authenticated, service_role;
grant select, insert on public.audience_feedback to service_role;
