-- PROPOSED POLICY: retain audience feedback for 90 days from created_at.
-- Owner approved the 90-day policy for Preview, subject to Preview validation.
-- Apply only after baseline migrations are approved and verified on Preview.
-- This file only defines the cleanup function; it does not run or schedule it.
create or replace function public.purge_expired_audience_feedback()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  deleted_rows bigint;
begin
  delete from public.audience_feedback
   where created_at < pg_catalog.clock_timestamp() - interval '90 days';
  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$function$;

revoke all on function public.purge_expired_audience_feedback() from public, anon, authenticated, service_role;
