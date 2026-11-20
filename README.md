# Theva Live — Landslide Early Warning System

Educational demonstration app. This is not a real landslide warning service.

## Run locally
Requires Node.js 20+. Run `npm install` then `npm run dev`.

## Shared real-time state setup

1. Create a Supabase project.
2. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor.
3. In Vercel → Project → Settings → Environment Variables, add the variables in [.env.example](.env.example).
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the browser client.
5. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPERATOR_ACCESS_TOKEN` as server-only variables. Never prefix these secrets with `VITE_`.
6. Redeploy after adding environment variables.
7. Open `/operator`, enter the operator token, publish a test value. On a second device, start the audience demo and verify it updates.

## API
- `GET /api/state`: public read of current demo state.
- `POST /api/state`: operator-token protected state update.
- Supabase Postgres Changes broadcasts row updates to audience browsers.

RLS permits public reads only. Browser clients cannot write to the state table. All writes pass through the Vercel API and are checked against the server-side operator token.

## Current milestone
This milestone adds shared state and live audience subscription. The seven-minute timer is still client-side; server-enforced sessions, persistent feedback, full operator authentication, and ESP32 telemetry remain later milestones.

## Illustrative risk model
- Evacuation: at least two healthy inputs >= 80
- High: at least one healthy input >= 80, or at least two healthy inputs >= 60
- Watch: any healthy input >= 35
- Safe: otherwise
- Unavailable: no healthy inputs

Not calibrated for real-world prediction or emergency decisions.