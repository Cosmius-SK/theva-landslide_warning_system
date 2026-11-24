# Theva Live — office laptop setup checklist

This checklist is for the office laptop on `development/esp32-telemetry`. Read [Codex handoff](CODEX_HANDOFF.md) and [ESP32 setup](ESP32_TELEMETRY_SETUP.md) first. Do not access Production Vercel or Production Supabase. Do not copy secrets into chat, source files, or Git.

## 1. Clone or update the branch

For a new checkout:

```powershell
git clone --branch development/esp32-telemetry --single-branch https://github.com/Cosmius-SK/theva-landslide_warning_system.git theva-landslide_warning_system
Set-Location theva-landslide_warning_system
git status --short --branch
```

For an existing checkout, preserve its work first. Do not stash, reset, clean, or overwrite anything without reviewing it.

```powershell
git status --short --branch
git stash list
git fetch origin development/esp32-telemetry
git switch development/esp32-telemetry
git pull --ff-only origin development/esp32-telemetry
git status --short --branch
```

Confirm the active branch is `development/esp32-telemetry`. Preserve existing stashes and local files. The branch must remain separate from `main`/Production.

## 2. Install Node.js and validate the web app

Install Node.js 22 or newer. Confirm `node --version` and `npm --version`, then from the repository root:

```powershell
npm ci
npm test
npm run build
npm run test:e2e -- --timeout=180000
git diff --check
```

The E2E runner starts a local handler-backed test server. These checks do not prove live Preview persistence or physical device connectivity. Plain `npm run dev` starts Vite only; use Vercel local development if API handlers are needed, and only with the exact Preview project configuration.

## 3. Configure Preview prerequisites

Before any device request, confirm the Vercel deployment is Preview for branch `development/esp32-telemetry` and the Supabase project ref is exactly `qgmvlsgzpvqabiupmnki`. Do not copy any Production environment values. Required variable names and scopes are in `CODEX_HANDOFF.md` and `.env.example`.

Have the project owner provision the following securely:

- Preview: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEMETRY_DEVICE_ID`, `TELEMETRY_DEVICE_TOKEN`, `OPERATOR_ACCESS_TOKEN`.
- Browser Realtime values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public/publishable key only).
- Local development only, if needed: `.env.local` with the exact Preview URL, Preview server key, device ID/token, and `TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE=true`.

Never set `TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE` in Production; it never permits a different Supabase project ref. Vercel controls `VERCEL_ENV` and `VERCEL_GIT_COMMIT_REF`.

The migration in `supabase/device_telemetry_hardening.sql` was not applied by this setup guide. Check the Preview RPCs with an authorized operator. If missing, review and apply that SQL to Preview only. Never execute it in Production.

## 4. Install Arduino CLI and ESP32 core

Install the current Windows x64 Arduino CLI release from the [official Arduino CLI installation page](https://arduino.github.io/arduino-cli/dev/installation/), then open a new PowerShell window:

```powershell
arduino-cli version
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
arduino-cli board list
```

Target board settings:

- Board: `ESP32S3 Dev Module` (`esp32:esp32:esp32s3`)
- Flash: 16 MB
- PSRAM: OPI PSRAM (N16R8)
- USB mode: Hardware CDC and JTAG
- USB CDC On Boot: Enabled
- Upload mode: default/UART0 Hardware CDC

The personal-laptop audit did not find `arduino-cli` on PATH and did not enumerate a Win32 serial port. Re-check the office laptop after connecting the board and use the COM port reported there.

## 5. Create local firmware secrets safely

From the repository root, make a local ignored configuration file:

```powershell
Copy-Item firmware/esp32_simulated_telemetry/secrets.h.example firmware/esp32_simulated_telemetry/secrets.h
```

Edit only `firmware/esp32_simulated_telemetry/secrets.h`. Set Wi-Fi SSID/password, device ID, 43-character device token, full HTTPS Preview endpoint, and the verified root CA PEM. `.gitignore` excludes this file. Do not add, paste, screenshot, or commit it. Obtain credentials and certificate values through an owner-approved secure channel. Never use `setInsecure()` or put a Supabase service-role key on the board.

The device endpoint format is `https://<Preview deployment host>/api/telemetry`. The CA must be a verified root CA for the TLS chain of that host, not a leaf certificate. Do not reuse a personal laptop certificate unless its chain matches and transfer is authorized.

## 6. Compile, upload, and open Serial Monitor

```powershell
$Fqbn = "esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,USBMode=hwcdc,CDCOnBoot=cdc,UploadMode=default"
arduino-cli compile --fqbn $Fqbn firmware/esp32_simulated_telemetry
arduino-cli board list
```

Close Serial Monitor before upload. Replace `COMx` with the port from `board list`:

```powershell
arduino-cli upload -p COMx --fqbn $Fqbn firmware/esp32_simulated_telemetry
arduino-cli monitor -p COMx -c baudrate=115200
```

Reset the board after opening the monitor. Expected output includes Wi-Fi/UTC status, readings prefixed `SIMULATED TEST ONLY`, and `HTTPS telemetry accepted.` No password, device token, or service key should appear. If upload mode is needed, hold BOOT, tap RESET, release BOOT, and retry. The operator reports the previous morning's serial/startup test worked with no errors; this is not a recorded Preview packet verification.

## 7. Hardware and functional verification

Board: ESP32-S3 DevKitC-1 N16R8. Earlier reported checks passed: chip detection, Flash, OPI PSRAM, memory read/write, Wi-Fi, and Internet TCP. Verify the live HTTPS endpoint separately.

1. Confirm first accepted packet on Preview `/display`: **DEVICE ONLINE**, increasing sequence, matching readings, last seen, and **SIMULATED TEST ONLY**.
2. Confirm the same `device_id`, sequence, readings, and timestamps in the Preview `public.device_telemetry` row (read-only query in the Preview SQL Editor only).
3. Confirm sliders track fresh device values and remain disabled. Select **Virtual override**, adjust values, and confirm risk/scene/audience sync follow the simulated values. Switch back and verify device priority resumes.
4. Re-send a duplicate/older sequence from an authorized test client; expect HTTP 409 and unchanged persisted sequence.
5. Stop device Wi-Fi or power it off for more than 45 seconds. Confirm automatic virtual fallback and `DEVICE OFFLINE`; reconnect and confirm a larger sequence and online status.

Potentiometers have not arrived and are out of scope. Later wiring specified by the hardware owner: **Brown → 3V3, Red → GPIO4, Black → GND**. Do not implement their readings in this phase.
