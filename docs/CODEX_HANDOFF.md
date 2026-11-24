# Theva Live — Codex handoff

Updated: 2026-11-24

## Repository and Git state

- Repository: `https://github.com/Cosmius-SK/theva-landslide_warning_system`
- Active branch: `development/esp32-telemetry`
- Latest application implementation commit at handoff: `ef90bfb2ce8f69a9fce7483c3913ac995d1647fb` (`Add ESP32-first sensor controls with virtual override`). Handoff documentation may be committed after this implementation commit.
- The branch was fetched from `origin`; it matched GitHub with no ahead/behind commits.
- Existing stash `stash@{0}` is preserved. Do not apply, drop, or rewrite it without a specific request.
- A local, untracked root certificate exists on the personal laptop. It was not inspected, copied, or committed. The office laptop needs its own securely obtained trusted root CA value in the ignored firmware secrets file.
- Production Vercel and Supabase were not accessed. Production project ref is out of scope; telemetry API code accepts only Preview Supabase ref `qgmvlsgzpvqabiupmnki` and the Preview branch.

## Project overview and architecture

Theva Live is an educational landslide-warning demonstration, not a calibrated or real-world warning service. The React/Vite UI is under `src/`; Vercel Node API handlers are under `api/`; Supabase SQL is under `supabase/`; the ESP32 Arduino sketch is under `firmware/esp32_simulated_telemetry/`.

The operator publishes shared demonstration state through the server API to Supabase. `/display` and time-limited audience sessions read that state using Realtime with polling fallback. Device telemetry is read from `GET /api/telemetry`; the browser never receives a service-role key. Operator synchronization continues to publish the operator's virtual slider values and mode as before.

### Current sensor source behavior

- In the default mode (`auto`), a fresh, valid device packet supplies moisture, rainfall, and movement. The operator sliders mirror those readings and are disabled. The active source reads **ESP32 DEVICE**.
- Device freshness uses the API's 45-second online window. If no configured, reachable, fresh device readings exist, the source is **AUTOMATIC VIRTUAL FALLBACK** and the saved virtual inputs feed the model.
- Selecting **Virtual override** copies the latest device values into the manual slider state once, then enables the sliders. Manual virtual values drive risk, scene, public display, and the synced audience view. The source is visibly **VIRTUAL OVERRIDE**.
- Switching out of override returns to fresh ESP32 values; if they are offline/stale, automatic virtual fallback resumes.
- Device status remains distinct from operator/cloud status. The 45-second offline threshold and risk thresholds are unchanged.
- Every generated device reading and all dashboard device/override reading groups retain **SIMULATED TEST ONLY** labeling. Potentiometer integration is not implemented.

## Telemetry protocol and firmware

`POST /api/telemetry` uses HTTPS with `Authorization: Bearer <device token>`. JSON fields are `deviceId`, monotonically increasing `sequence`, UTC `sentAt`, fixed `label: "SIMULATED TEST ONLY"`, and three integer readings (`moisture`, `rainfall`, `movement`) from 0–100. API checks include token validation and timing-safe comparison, device ID, timestamp, payload size, Preview project/environment/branch, rate-limit RPC, and atomic sequence ingestion. Duplicate or older sequence packets return HTTP 409. `GET /api/telemetry` returns only the latest configured device's display fields and computes online status.

Firmware uses built-in ESP32 Arduino libraries (`WiFi`, `WiFiClientSecure`, `HTTPClient`, `Preferences`, `time`). It generates values every 10 seconds, stores sequence in NVS, retries with capped backoff, reconnects Wi-Fi in bounded batches, synchronizes UTC, requires an `https://` URL, and verifies a configured CA with `setCACert`. It has no insecure TLS fallback and does not print credentials. `arduino-cli` was not found on PATH in this checkout, so firmware compilation has not been confirmed here.

Board: ESP32-S3 DevKitC-1 N16R8 — 16 MB Flash, 8 MB OPI PSRAM. Previous hardware checks reported chip detection, Flash, PSRAM, memory read/write, Wi-Fi and Internet TCP success. These checks do not by themselves prove a physical telemetry packet reached the dashboard.

### Potentiometer wiring for a later phase

When the pots arrive, the specified wiring is **Brown → 3V3**, **Red → GPIO4**, **Black → GND**. Potentiometer readings are not connected to this firmware or API in this phase. Do not start that integration until the simulated device-to-dashboard verification is complete and the hardware owner authorizes it.

## Preview configuration and isolation

The intended data project is Supabase Preview `qgmvlsgzpvqabiupmnki` (`theva-live-preview`). The telemetry endpoint is `https://<Preview deployment host>/api/telemetry`. The API enforces the exact Supabase project ref, rejects Production, and requires deployed requests to come from Vercel Preview branch `development/esp32-telemetry`. A local development override is opt-in and does not bypass the project-ref check.

Required Preview environment-variable **names**:

- Browser/public: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable/anon value; never use for service access).
- Server-only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPERATOR_ACCESS_TOKEN`, `TELEMETRY_DEVICE_ID`, `TELEMETRY_DEVICE_TOKEN`.
- Optional: `APP_ORIGIN`; local-only `TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE=true` (only with the exact Preview URL and non-production environment).
- Vercel supplies `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=development/esp32-telemetry`; do not set these manually.

Use project-specific Preview values. Never copy Production credentials, place server keys under `VITE_`, put secrets in the device, or paste credentials in Codex. The ESP32 receives only Wi-Fi credentials, device ID/token, Preview API URL, and a verified root CA in its ignored local `secrets.h`.

The migration `supabase/device_telemetry_hardening.sql` defines persistent rate limiting and least-privilege grants; its application status was not checked in this handoff. Confirm that the Preview project has the needed RPCs before physical ingestion. If it is missing, an authorized operator must review and apply the SQL to Preview only. No SQL was executed for this handoff. Do not run it in Production.

Vercel settings/deployments and Supabase project state were not inspected remotely for this handoff. Confirm Preview configuration with the project owner before device testing. No deployment or Production changes are part of this handoff.

## Serial monitor and startup status

The operator reports that serial startup and monitoring were working during the morning hardware test, with no errors. There is no current unresolved serial-monitor issue or recorded corrective workaround. The repository's setup guide documents 115200 baud, opening the monitor and resetting after upload, closing it before flashing, and the BOOT/RESET download-mode sequence if upload mode is needed. If symptoms return on the office laptop, note the COM port, selected board options, upload result, and exact Serial Monitor output before changing firmware or TLS settings.

## Validation and limits

Latest local validation on the handoff branch: `npm.cmd test` passed 40/40; `npm.cmd run build` passed; `npm.cmd run test:e2e -- --timeout=180000` passed 4/4; `git diff --check` passed; the documentation credential-pattern scan passed. These browser tests use the local handler-backed test harness; they do not independently validate Preview Vercel/Supabase configuration.

Physical integration status: the operator reports successful board startup/serial checks and earlier telemetry ingestion/persistence. The handoff agent did not independently verify a current ESP32-origin packet in Preview. Confirm the device ID, increasing sequence, readings and receive time on `/display` and in the Preview row before declaring physical end-to-end verification complete.

## Remaining work, in priority order

1. On the office laptop, check out this branch, install Node 22+, install Arduino CLI/Espressif core, and run the software validations.
2. Securely configure the Vercel Preview variables for `development/esp32-telemetry`; confirm Supabase URL/ref is `qgmvlsgzpvqabiupmnki`. Verify the rate-limit and ingestion RPCs exist in Preview; apply the reviewed hardening SQL there only if needed and approved.
3. Create the ignored local `secrets.h`, obtain the current Preview host URL and verified root CA securely, compile and flash the board.
4. Verify an actual device packet and increasing sequence on Preview `/display` and in `public.device_telemetry`; test duplicate rejection and >45-second offline/reconnect behavior.
5. Potentiometer wiring/integration is future work. Wiring when authorized/available: Brown→3V3, Red→GPIO4, Black→GND.

## Resume through Codex on the office laptop

Clone or update the repo, switch to `development/esp32-telemetry`, and then start a Codex task with this prompt:

> Continue Theva Live on `development/esp32-telemetry`. Read `docs/CODEX_HANDOFF.md`, `docs/LAPTOP_SETUP.md`, and `docs/ESP32_TELEMETRY_SETUP.md` first. Preserve existing changes and stashes. Use only Supabase Preview `qgmvlsgzpvqabiupmnki` and Vercel Preview for this branch; do not access Production, deploy, apply SQL, or expose secrets without explicit authorization. Do not implement potentiometer support. First verify this laptop's Node/Arduino/COM-port setup and Preview prerequisites, then continue physical packet verification. Keep all generated readings visibly labelled **SIMULATED TEST ONLY**.
