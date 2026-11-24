# Theva Live — Landslide Early Warning System

Educational exhibition demonstration. This is not a calibrated landslide prediction or real-world warning service.

## Requirements and local setup

Use Node.js 22 or later (`.nvmrc` selects 22 for local version managers; `package.json` requires 22+ for Vercel). Run `npm install`, then `npm test` and `npm run build`.

`npm run dev` starts the Vite frontend only; it does not run the `/api/*` serverless functions. Use `npx vercel dev` with Vercel project configuration and local environment variables to exercise the deployed API handlers. Do not put server-only keys in `VITE_` variables.

## Shared-state and audience-session setup

1. Create or select a **development/preview** Supabase project and confirm its project name before running SQL.
2. Review the existing schema and follow the preflight and ordered execution steps in [Vercel Preview setup](docs/VERCEL_PREVIEW_SETUP.md). Do not run these scripts against Production.
3. Configure Preview-scoped values from `.env.example` in Vercel. Keep local, Preview, and Production values separate.
4. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are browser-visible and used for Realtime; use a Supabase publishable key as the value (legacy anon keys remain compatible). `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPERATOR_ACCESS_TOKEN` are server-only; the service-role variable can hold a Supabase secret key. Never prefix server-only values with `VITE_`.
5. Open `/operator`, connect with the Preview operator token, then start a seven-minute audience session. The operator can share its link or scan-ready QR code, replace the session, or end it early.

The owner approved a 90-day audience-feedback retention window from submission for Preview. Its cleanup function and daily 03:00 UTC Supabase Cron schedule are documented in [Vercel Preview setup](docs/VERCEL_PREVIEW_SETUP.md); neither has been applied or scheduled. Validate Preview schema and migration results before activating cleanup. Production is excluded.

Audience bearer tokens are placed in the URL fragment, validated by the server, and stored only as SHA-256 hashes in Supabase. A refresh reuses the original expiry. Replacing or ending the active session revokes its prior link. Feedback is accepted only during the active session and is listed only to the active operator.

## API routes

- `GET /api/state`: public read of the latest demonstration state.
- `POST /api/state`: validates values and publishes state only for the operator holding the server-side lock.
- `POST /api/operator-lock`: acquires, renews, or releases the single operator lease.
- `POST /api/audience-session`: creates, validates, reports, or ends the active audience session.
- `POST /api/feedback`: accepts feedback from an active audience session or lists it for the locked operator.

Supabase RLS allows public reads of demonstration state only. Browser clients cannot write shared state, session tokens, or feedback. Server writes use the service-role key.

## Risk model and source handling

- **Evacuation:** at least two healthy inputs are >= 80.
- **High:** at least one healthy input is >= 80, or at least two are >= 60.
- **Watch:** any healthy input is >= 35.
- **Safe:** otherwise.
- **Unavailable:** no healthy inputs.

The UI keeps individual sensor faults separate from environmental risk. The default source uses fresh ESP32 telemetry when online; the three sliders mirror those values and remain read-only. If telemetry is unavailable or stale, the dashboard uses its automatic virtual fallback. Selecting **Virtual override** enables manual simulated readings, which drive the model, risk indication, cinematic scene, and synced audience/public views. Switching back returns to fresh device data or the fallback. Existing risk thresholds are unchanged. Every device-generated reading is labelled **SIMULATED TEST ONLY**. The operator heartbeat toggle remains a simulation control and does not indicate a physical connection.

See the [ESP32 telemetry contract](docs/HARDWARE_INTEGRATION.md) and [Preview setup and flashing guide](docs/ESP32_TELEMETRY_SETUP.md). Local tests use mocked persistence; physical integration is not claimed until an ESP32 packet appears on the Preview dashboard.

## Tests and limitations

`npm test` covers risk thresholds, state validation, the hardware payload contract, image mappings and dimensions, session lifecycle, feedback authorization, and API handler behavior with in-memory Supabase doubles. Browser tests use the local handler-backed harness; they do not prove connectivity to an external Supabase project. Apply schema changes only to a development or preview database until separately approved.
