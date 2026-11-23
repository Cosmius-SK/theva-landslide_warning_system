-- Theva Live Preview: revocable, persistent operator sessions.
-- Apply only to the Preview project after reviewing the paired API change.
-- The browser receives a signed HttpOnly cookie; only its SHA-256 session hash
-- is stored on the existing single-operator lock row.

alter table public.operator_lock
  add column if not exists session_hash text;

comment on column public.operator_lock.session_hash is
  'SHA-256 hash of the signed operator session identifier; used for revocation without storing the cookie.';

do $$ begin
  alter table public.operator_lock
    add constraint operator_lock_session_hash_format
    check (session_hash is null or session_hash ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null;
end $$;

-- Keep the legacy single-argument RPC overloads during the Preview rollout.
-- The currently deployed application still calls them. Deploy the new API,
-- verify it, and retire these overloads in a later cleanup migration.

-- Recreate the legacy overloads if an earlier deployment removed them. Legacy
-- callers may manage only rows without a signed-session hash, so an old Preview
-- function cannot renew or release a lock owned by the new signed-cookie API.
create or replace function public.acquire_operator_lock(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare affected_rows integer;
begin
  if p_owner is null then return false; end if;
  insert into public.operator_lock(id, owner_id, session_hash, expires_at, updated_at)
  values (1, p_owner, null, now() + interval '30 seconds', now())
  on conflict (id) do update
    set owner_id = excluded.owner_id,
        session_hash = null,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.operator_lock.expires_at <= now()
       or (public.operator_lock.owner_id = p_owner and public.operator_lock.session_hash is null);
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.renew_operator_lock(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare affected_rows integer;
begin
  update public.operator_lock
     set expires_at = now() + interval '30 seconds', updated_at = now()
   where id = 1 and owner_id = p_owner and session_hash is null and expires_at > now();
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.release_operator_lock(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare affected_rows integer;
begin
  update public.operator_lock
     set expires_at = now(), updated_at = now()
   where id = 1 and owner_id = p_owner and session_hash is null;
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.acquire_operator_lock(uuid) from public, anon, authenticated;
revoke all on function public.renew_operator_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_operator_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_operator_lock(uuid) to service_role;
grant execute on function public.renew_operator_lock(uuid) to service_role;
grant execute on function public.release_operator_lock(uuid) to service_role;

create or replace function public.acquire_operator_lock(p_owner uuid, p_session_hash text, p_new_session boolean)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare affected_rows integer;
begin
  if p_owner is null or p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' or p_new_session is null then return false; end if;
  if not p_new_session and not exists (select 1 from public.operator_lock where id = 1) then return false; end if;
  insert into public.operator_lock(id, owner_id, session_hash, expires_at, updated_at)
  values (1, p_owner, p_session_hash, now() + interval '30 seconds', now())
  on conflict (id) do update
    set owner_id = excluded.owner_id,
        session_hash = excluded.session_hash,
        expires_at = excluded.expires_at,
        updated_at = now()
    where (p_new_session and public.operator_lock.expires_at <= now())
       or (public.operator_lock.owner_id = p_owner and public.operator_lock.session_hash = p_session_hash);
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.renew_operator_lock(p_owner uuid, p_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare affected_rows integer;
begin
  update public.operator_lock
     set expires_at = now() + interval '30 seconds', updated_at = now()
   where id = 1 and owner_id = p_owner and session_hash = p_session_hash and expires_at > now();
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.release_operator_lock(p_owner uuid, p_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare affected_rows integer;
begin
  update public.operator_lock
     set expires_at = now(), session_hash = null, updated_at = now()
   where id = 1 and owner_id = p_owner and session_hash = p_session_hash;
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

revoke all on function public.acquire_operator_lock(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.renew_operator_lock(uuid, text) from public, anon, authenticated;
revoke all on function public.release_operator_lock(uuid, text) from public, anon, authenticated;
grant execute on function public.acquire_operator_lock(uuid, text, boolean) to service_role;
grant execute on function public.renew_operator_lock(uuid, text) to service_role;
grant execute on function public.release_operator_lock(uuid, text) to service_role;
