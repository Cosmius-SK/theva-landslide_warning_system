# Theva Live — Development Handoff

> **Historical snapshot:** the implementation inventory and blocker statements below describe an earlier branch state and are no longer current. For the active ESP32 telemetry branch, use [Codex handoff](CODEX_HANDOFF.md), [laptop setup](LAPTOP_SETUP.md), and [ESP32 telemetry setup](ESP32_TELEMETRY_SETUP.md). Do not use the old “no firmware/API” status below as current.

## Branch and baseline

- Working branch: `development/esp32-telemetry`.
- Branch starting point: `c63fcbb` (`Persist operator sessions and add public display`), the pushed `uiux-redesign-phase1` implementation baseline.
- The `development/esp32-telemetry` branch did not previously exist on GitHub; it was created from that baseline for this laptop handoff.
- This document describes repository state and test evidence. It does not imply a Preview deployment or Production change.

## Completed implementation in this checkout

- React/Vite Theva Live educational demonstration with 16 high-resolution cinematic hillside scenes, state/sensor overlays, four risk levels, and reduced-motion styling.
- Operator lock and signed, HttpOnly session restoration; two-hour genuine inactivity expiry, 48-hour absolute lifetime, explicit logout, and single-operator ownership.
- Shared state through Vercel API handlers and Supabase, with Realtime plus polling fallback.
- Seven-minute audience QR/link sessions with server-side validation, refresh persistence, expiry/revocation, and audience feedback submission/retrieval.
- Read-only public `/display` route that follows shared state and reports stale/offline state.
- SQL files for shared state, operator lock, audience sessions, feedback, 90-day feedback retention, and signed operator-session persistence with guarded legacy RPC compatibility.
- Existing regression and E2E coverage for risk thresholds, hardware payload validation, session lifecycle, feedback authorization, public display, and operator-to-display synchronization.

## Current blockers and deployment state

- **No ESP32 firmware is present.** There is no firmware source, selected board/framework, device provisioning, calibration configuration, or physical device test.
- **No hardware telemetry-ingestion API exists.** The hardware payload validator and `docs/HARDWARE_INTEGRATION.md` are a proposed contract only. Current automatic mode uses virtual fallback; hardware-only reports unavailable inputs.
- Physical sensor units, calibration ranges, transport, device identity, and credential provisioning need hardware-owner decisions before firmware or ingestion work begins.
- At the last Preview review, Vercel Preview still served commit `6985c0c`, while the Preview database exposed the new session-hash RPC signatures without the legacy one-argument overloads used by that deployment. The committed `supabase/operator_session_persistence.sql` restores guarded legacy overloads. Recheck Preview before migration/deployment; do not apply this migration to Production.
- The 90-day retention function is prepared, but the daily 03:00 UTC Cron job is not active. Keep it disabled until Preview migration and retention validation are complete.
- Local E2E uses the repository's in-memory handler harness; it is not proof of cloud or hardware connectivity.

## Next actions

1. Confirm the Preview Supabase project identity and back up its schema.
2. Review and execute `supabase/operator_session_persistence.sql` on Preview only; stop on any error and inspect partial effects before retrying. Verify both RPC generations, service-role-only execution, and lock behavior.
3. Deploy `development/esp32-telemetry` to Vercel Preview after the migration is verified. Validate operator persistence, audience sessions, shared state, and `/display` against the real Preview services.
4. Keep Cron disabled until the retention function has been validated on Preview; schedule only after separate owner confirmation.
5. Before hardware implementation, agree the board, firmware framework, sensor models, calibrated units/ranges, transport, authentication, and failure behavior. Then build the device endpoint and firmware, including monotonic sequence checks and physical end-to-end tests.
6. Keep Production database, variables, and deployment unchanged unless separately approved.

## Software dependencies

- Node.js 22 or newer (`.nvmrc` selects Node 22; `package.json` requires `>=22`).
- npm and the checked-in `package-lock.json` (`npm ci`).
- Playwright with a supported local Chromium/Chrome/Edge browser for E2E tests; set `CHROME_PATH` only if auto-discovery does not find it.
- Vercel CLI and access to the Vercel project for local serverless API development (`npx vercel dev`); plain `npm run dev` starts only Vite.
- Supabase Preview project access for cloud validation and SQL Editor access for approved Preview migrations.
- No ESP32 toolchain is selected or required by the current source tree. Choose Arduino IDE/CLI or PlatformIO only after the hardware owner approves the board/framework.

## Environment variable names

Values are intentionally omitted. Use Preview-specific values; never put server-only keys in browser variables.

Required by the app/API when using Supabase and operator sessions:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (Supabase publishable key; this value is browser-visible)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `OPERATOR_ACCESS_TOKEN` (server-only)

Optional/configuration-specific:

- `APP_ORIGIN` (optional same-origin override)
- `CHROME_PATH` (local E2E browser path)
- `PORT` (local handler test-server port)

Start from `.env.example`. Do not commit `.env`, `.env.local`, keys, or certificates.

## ESP32 configuration and test status

- Firmware files: **none in this repository**.
- Device configuration, board selection, firmware build, flashing, and bench/field tests: **not started/not available**.
- Draft payload contract: `docs/HARDWARE_INTEGRATION.md`; readings are illustrative 0–100 educational indices, not calibrated engineering units.
- Automated validator tests use mock samples in `tests/contracts.test.js`; they do not exercise a physical ESP32 or a network ingestion route.
- Hardware fallback behavior is covered in the browser test harness. It verifies application behavior only.

## Local validation status

Latest reviewed baseline validation used Node.js 24.22.3:

- `npm test`: 30/30 passed.
- `npm run test:e2e`: 3/3 passed.
- `npm run build`: passed.
- `git diff --check`: passed (Git may print line-ending notices on Windows).

These checks are local. They do not certify a live Preview deployment, cloud database integration, or hardware.

## Resume on another laptop

PowerShell:

```powershell
git clone --branch development/esp32-telemetry --single-branch https://github.com/Cosmius-SK/theva-landslide_warning_system.git theva-landslide_warning_system
Set-Location theva-landslide_warning_system
git status --short --branch
```

Install Node.js 22 or newer, then run:

```powershell
npm ci
npm test
npm run build
npm run test:e2e
```

For local API routes, connect/link the correct Vercel project and configure local environment values securely, then use `npx vercel dev`. Do not paste secrets into chat or commit local environment files. Verify that the active Supabase project is the non-Production Preview project before running any migration.
