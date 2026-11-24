-- Run in the Supabase SQL Editor.
create table if not exists public.demo_state (
  id integer primary key check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.demo_state enable row level security;
drop policy if exists "Public can read demo state" on public.demo_state;
create policy "Public can read demo state" on public.demo_state for select to anon, authenticated using (true);
revoke all on public.demo_state from public, anon, authenticated, service_role;
grant select on public.demo_state to anon, authenticated;
grant select, insert, update on public.demo_state to service_role;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='demo_state') then
    alter publication supabase_realtime add table public.demo_state;
  end if;
end $$;
insert into public.demo_state(id,state) values(1,'{"sensors":[{"id":"moisture","value":22,"healthy":true},{"id":"rainfall","value":18,"healthy":true},{"id":"movement","value":12,"healthy":true}],"espOnline":false,"source":"virtual-fallback","mode":"auto","scene":"panorama"}'::jsonb) on conflict(id) do nothing;
