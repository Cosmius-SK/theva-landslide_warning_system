-- Preview-only hardening for the ESP32 telemetry API.
-- Review and apply manually to project qgmvlsgzpvqabiupmnki only. Do not run in Production.

alter table public.device_telemetry enable row level security;
revoke all privileges on table public.device_telemetry from public, anon, authenticated, service_role;
grant select, insert, update on table public.device_telemetry to service_role;

create table if not exists public.device_telemetry_rate_limit (
  device_id text primary key check (device_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  tokens numeric not null check (tokens >= 0 and tokens <= 12),
  updated_at timestamptz not null
);
alter table public.device_telemetry_rate_limit enable row level security;
revoke all privileges on table public.device_telemetry_rate_limit from public, anon, authenticated, service_role;
grant select, insert, update on table public.device_telemetry_rate_limit to service_role;

create or replace function public.consume_device_telemetry_rate_limit(p_device_id text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_tokens numeric;
  v_updated_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_refilled numeric;
begin
  if p_device_id is null or p_device_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    return false;
  end if;

  insert into public.device_telemetry_rate_limit(device_id, tokens, updated_at)
  values (p_device_id, 12, v_now)
  on conflict (device_id) do nothing;

  select tokens, updated_at into v_tokens, v_updated_at
  from public.device_telemetry_rate_limit
  where device_id = p_device_id
  for update;

  v_refilled := least(12, v_tokens + greatest(0, extract(epoch from (v_now - v_updated_at))) / 5);
  if v_refilled < 1 then
    update public.device_telemetry_rate_limit set tokens = v_refilled, updated_at = v_now where device_id = p_device_id;
    return false;
  end if;

  update public.device_telemetry_rate_limit set tokens = v_refilled - 1, updated_at = v_now where device_id = p_device_id;
  return true;
end;
$$;

revoke all on function public.consume_device_telemetry_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_device_telemetry_rate_limit(text) to service_role;

-- Keep the existing ingest_device_telemetry SECURITY INVOKER function and its
-- atomic sequence predicate. Its EXECUTE grant should remain service_role only.
revoke all on function public.ingest_device_telemetry(text, bigint, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_device_telemetry(text, bigint, timestamptz, text, jsonb) to service_role;
