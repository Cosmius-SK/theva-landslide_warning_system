# Vercel Preview setup

This checklist targets a dedicated development/Preview Supabase project and a Vercel Preview deployment. Do not execute these SQL scripts against Production as part of this setup.

## Required access and project configuration

The repository currently has no `.vercel` project link or configured Supabase access. To continue, the owner should:

- Connect this repository to the intended Vercel project and grant project access sufficient to inspect build settings, Git integration, Preview environment-variable names/scopes, and deployment logs. Keep `main` as the Production branch and enable Preview builds for `development/esp32-telemetry`. Do not change the Production branch or use Production environment values for this integration.
- Provide the Preview Supabase project identity (project name/ref and project URL) and grant dashboard/SQL Editor access to that Preview project only. Do not share key values in chat. Production project access is neither needed nor requested.
- Add Preview-scoped values in the Vercel dashboard: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPERATOR_ACCESS_TOKEN`. Use the same Preview project URL for both URL variables, a publishable key as the browser key value, a secret key as the server key value, and a unique Preview operator token. Never expose the server key or operator token through a `VITE_` variable.
- Set `APP_ORIGIN` only if cross-origin state/operator-lock requests are used. This app and its API should stay on the same origin; audience-session and feedback endpoints currently do not emit CORS headers. The Preview QR/link uses the active page origin, so do not hard-code a one-off deployment URL into the app.

Vercel should detect the Vite project with `npm run build` and `dist` output. The root `api/` files are Vercel Node.js function entry points. Use Node.js 22 or newer; confirm Preview build logs show the selected runtime. No Vercel CLI or account integration is available in this checkout, so Dashboard settings and credentials cannot be verified locally.

## 1. Preflight the database

In the Supabase dashboard, confirm that the selected project is the non-Production project. Take a schema backup/export before changing it. The repository defines `demo_state` in `supabase/schema.sql` and `operator_lock` plus its RPC functions in `supabase/operator_lock.sql`. The audience tables are new to the checked-in schema.

Before applying scripts, inspect existing table columns, policies, and grants. `CREATE TABLE IF NOT EXISTS` does not reconcile a pre-existing table with a different shape; stop and compare before proceeding if either audience table already exists.

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('demo_state', 'operator_lock', 'audience_session', 'audience_feedback')
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in ('demo_state', 'operator_lock', 'audience_session', 'audience_feedback')
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('demo_state', 'operator_lock', 'audience_session', 'audience_feedback')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('demo_state', 'operator_lock', 'audience_session', 'audience_feedback')
order by table_name, grantee, privilege_type;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('demo_state', 'operator_lock', 'audience_session', 'audience_feedback')
order by tablename, indexname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result, p.prosecdef as security_definer,
       owner.rolname as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles owner on owner.oid = p.proowner
where n.nspname = 'public'
  and p.proname in ('acquire_operator_lock', 'renew_operator_lock',
                    'release_operator_lock', 'purge_expired_audience_feedback')
order by p.proname;

select p.proname,
       case when acl.grantee = 0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
       acl.privilege_type, acl.is_grantable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where n.nspname = 'public'
  and p.proname in ('acquire_operator_lock', 'renew_operator_lock',
                    'release_operator_lock', 'purge_expired_audience_feedback')
order by p.proname, grantee;

select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'demo_state';
```

## 2. Apply scripts in order

Use the Supabase SQL Editor for the confirmed development/Preview project. Run each whole file separately and check that it completes before moving to the next:

1. `supabase/schema.sql` — creates/seeds the singleton shared demo state and enables its public read/realtime path.
2. `supabase/operator_lock.sql` — creates the private operator lease and its acquire/renew/release RPCs.
3. `supabase/audience_sessions.sql` — creates the singleton hashed-token audience session.
4. `supabase/audience_feedback.sql` — creates restricted feedback storage and its `created_at` ordering index.

These repository scripts are idempotent for their expected schema. `IF NOT EXISTS` will not repair incompatible existing columns, indexes, or grants. Review any conflict rather than dropping or replacing objects. `schema.sql` also replaces the named public-read policy and inserts the initial state only if row `id = 1` is absent.

The optional `supabase/audience_feedback_retention.sql` file is separate from this four-file baseline. The owner approved the 90-day policy for Preview subject to validation. This file only defines a locked-down function; it does not delete rows when created and does not create a scheduled job. Apply it only after the baseline schema is verified and the owner explicitly approves the migration execution.

## 3. Verify access and objects

Re-run the preflight queries. Confirm RLS is enabled on all four tables; the only intended client table policy is public `SELECT` on `demo_state`; `anon`, `authenticated`, and `PUBLIC` have no grants on `operator_lock`, `audience_session`, or `audience_feedback`; and none has write privileges on `demo_state`. `service_role` has only `SELECT` on `operator_lock`, `SELECT/INSERT/UPDATE` on `audience_session` and `demo_state`, and `SELECT/INSERT` on `audience_feedback`. Check function execution grants, confirm the retention function owner can be the `postgres` Cron executor, and check that the `supabase_realtime` publication contains `demo_state`.

Confirm the feedback index exists without selecting any token hash:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'audience_feedback'
order by indexname;

select count(*) as audience_session_rows from public.audience_session;
```

Do not query, copy, or log `token_hash` values. The expected session table is a singleton; replacing or expiring a session leaves at most one row. The proposed feedback retention cutoff is 90 days from `created_at`, followed by the next daily cleanup run (up to roughly 24 hours later). The function definition is prepared but unscheduled and unapplied. Confirm that policy, whether backups must also expire within 90 days, and the Preview-only activation time before applying or scheduling it.

### Preview cleanup activation — owner approval recorded; validation required

After the approved baseline migrations and retention function are applied and verified on Preview, enable Supabase Cron (`pg_cron`) if it is not already available. Schedule the job from the Supabase SQL Editor as the `postgres` role, which must own the function and is the only intended executor. Schedule it daily at 03:00 UTC:

```sql
select cron.schedule(
  'audience-feedback-retention-90d',
  '0 3 * * *',
  $$select public.purge_expired_audience_feedback();$$
);
```

**Do not run this scheduling statement before Preview migration and retention verification.** It is intentionally absent from the migration file. After scheduling, verify the job in `cron.job` and monitor `cron.job_run_details`. To deactivate it, use `cron.unschedule('audience-feedback-retention-90d')`. Supabase Cron uses `pg_cron` and supports SQL/function jobs and run monitoring; check the Preview project’s extension and plan before activation. [Supabase Cron](https://supabase.com/docs/guides/cron), [Cron quickstart](https://supabase.com/docs/guides/cron/quickstart).

## 4. Configure Vercel Preview

In Vercel Project Settings, select Node.js 22.x or newer for builds and functions. The repository pins `.nvmrc` to 22 for local version managers and declares `engines.node: >=22`, which Vercel uses to select a supported deployment runtime on the next deployment.

Add the values from `.env.example` with the **Preview** environment selected. Use Preview-project Supabase credentials and a Preview-only operator secret; do not copy Production credentials into Preview. The `SUPABASE_SERVICE_ROLE_KEY` variable is server-only; use a current Supabase secret key as its value. Never expose it under a `VITE_` name. `APP_ORIGIN` is optional for the intended same-origin deployment; the audience-session and feedback handlers do not currently add CORS headers, so do not split them across origins.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are embedded in the browser bundle for Realtime; put a current Supabase publishable key in the latter (the legacy anon key remains compatible). Treat both as public values and rely on RLS/grants for database access. They are optional for the API polling fallback, but required for Supabase Realtime. `CHROME_PATH` and `PORT` are optional local browser-test settings, not Vercel app settings.

The root `api/` directory contains Node.js function entry points for `state`, `operator-lock`, `audience-session`, and `feedback`; each exports a default Vercel handler. `vercel.json` supplies the SPA deep-link rewrite. Verify those routes on the Preview URL after deployment; local unit/E2E tests use in-memory Supabase doubles and do not verify a live Supabase project.
