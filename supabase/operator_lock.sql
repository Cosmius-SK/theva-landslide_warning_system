-- Theva Live: one active operator console across all browsers/devices.
create table if not exists public.operator_lock (
  id integer primary key check (id = 1),
  owner_id uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.operator_lock enable row level security;
revoke all on public.operator_lock from anon, authenticated;
grant all on public.operator_lock to service_role;

create or replace function public.acquire_operator_lock(p_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare acquired boolean;
begin
  insert into public.operator_lock(id, owner_id, expires_at, updated_at)
  values (1, p_owner, now() + interval '30 seconds', now())
  on conflict (id) do update
    set owner_id = excluded.owner_id,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.operator_lock.expires_at < now()
       or public.operator_lock.owner_id = p_owner;
  get diagnostics acquired = row_count;
  return acquired;
end;
$$;

create or replace function public.renew_operator_lock(p_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare renewed boolean;
begin
  update public.operator_lock
     set expires_at = now() + interval '30 seconds', updated_at = now()
   where id = 1 and owner_id = p_owner and expires_at > now();
  get diagnostics renewed = row_count;
  return renewed;
end;
$$;

create or replace function public.release_operator_lock(p_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare released boolean;
begin
  update public.operator_lock
     set expires_at = now(), updated_at = now()
   where id = 1 and owner_id = p_owner;
  get diagnostics released = row_count;
  return released;
end;
$$;
revoke all on function public.acquire_operator_lock(uuid) from public, anon, authenticated;
revoke all on function public.renew_operator_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_operator_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_operator_lock(uuid) to service_role;
grant execute on function public.renew_operator_lock(uuid) to service_role;
grant execute on function public.release_operator_lock(uuid) to service_role;
