# ESP32-S3 simulated telemetry setup

This phase sends generated values from an ESP32-S3 to the development dashboard. Every generated reading is labelled **SIMULATED TEST ONLY**. They are not potentiometer measurements or calibrated warning inputs, and they never enter the risk calculation.

## Preview configuration and isolation

Use only Preview Supabase project `qgmvlsgzpvqabiupmnki` (`theva-live-preview`) and the Vercel Preview deployment built from branch `development/esp32-telemetry`. The API rejects any other Supabase URL, production Vercel environment, or different Preview branch. Local API work requires `TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE=true`; the override is accepted only in a non-production local environment and never bypasses the fixed Supabase project check.

Set these variables in the Vercel **Preview** scope for the development branch:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://qgmvlsgzpvqabiupmnki.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview project's server-only service-role key; never use a `VITE_` prefix |
| `TELEMETRY_DEVICE_ID` | `theva-esp32-01` (or another configured ID matching firmware) |
| `TELEMETRY_DEVICE_TOKEN` | Unique 32-byte random token, encoded as 43-character base64url |

The public frontend's `VITE_SUPABASE_URL` and publishable/anon key must also refer to Preview. Vercel supplies `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=development/esp32-telemetry`; do not manually set these in Vercel. Never configure device credentials or the service-role key in Production.

Generate a token locally in PowerShell (copy its output directly into server-side Preview environment configuration and the ignored firmware secrets file; never paste it into source control or chat):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The endpoint format is `https://<Preview deployment host>/api/telemetry`. `POST` requires `Authorization: Bearer <device token>` and the configured device ID. `GET /api/telemetry` returns only the configured device ID, sequence, last received time, readings, online flag, and fixed simulated label. The function allows a 2 KiB payload and calls a persistent database token bucket (12 request burst, refilling at 12/minute); the bucket RPC and least-privilege grants are prepared in [device telemetry hardening SQL](../supabase/device_telemetry_hardening.sql). This SQL has **not** been applied. After reviewing it, an authorized operator must apply it to Preview project `qgmvlsgzpvqabiupmnki` before the route can accept packets. Do not run it against Production.

The existing `ingest_device_telemetry` RPC remains the atomic sequence gate: only a strictly increasing sequence is stored. RLS remains enabled and browser roles have no table or RPC access. The service-role key is used only by server-side API code.

For local handler testing, set the exact Preview `SUPABASE_URL`, device ID and a generated device token in `.env.local`, plus `TELEMETRY_LOCAL_DEVELOPMENT_OVERRIDE=true`. Do not use a Production URL/key. Vercel's local development environment is accepted only when it is not marked Preview or Production and the explicit override is enabled.

## Board and firmware prerequisites

- ESP32-S3 DevKitC-1 N16R8 (16 MB Flash, 8 MB OPI PSRAM), verified USB data cable.
- 2.4 GHz Wi-Fi with Internet access.
- Arduino IDE 2.x or Arduino CLI with Espressif `esp32` core.
- Preview endpoint host, device ID/token, and the TLS **root CA certificate** that chains to the Preview host's certificate.
- No ArduinoJson library or potentiometers are needed.

The sketch uses ESP32 Arduino core `WiFi`, `WiFiClientSecure`, `HTTPClient`, `Preferences`, and `time`. HTTPS uses `setCACert(THEVA_ROOT_CA)` and has no insecure TLS fallback. Use the root CA PEM, not a leaf/short-lived server certificate. Identify the chain for the exact deployment host with a trusted certificate viewer or:

```powershell
$PreviewHost = "your-preview-host.vercel.app"
openssl s_client -showcerts -connect "$($PreviewHost):443" -servername $PreviewHost
```

Validate the root against the operating system/browser trust chain and its issuer before embedding it. Keep the complete PEM certificate boundaries. Do not disable TLS verification to work around a mismatch.

## Install and compile with Arduino CLI on Windows

If Arduino CLI is not installed, install the current Windows 64-bit MSI from the [official Arduino CLI installation page](https://arduino.github.io/arduino-cli/dev/installation/), then reopen PowerShell and run:

```powershell
arduino-cli version
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

Create the ignored local secrets file. From the repository root:

```powershell
Copy-Item firmware/esp32_simulated_telemetry/secrets.h.example firmware/esp32_simulated_telemetry/secrets.h
```

Edit only the ignored `secrets.h`: set Wi-Fi SSID/password, configured device ID, generated device token, full Preview endpoint URL, and verified root CA PEM. Do not commit this file. Then compile for ESP32-S3 Dev Module, 16 MB Flash, OPI PSRAM, and hardware CDC:

```powershell
arduino-cli compile --fqbn "esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,USBMode=hwcdc,CDCOnBoot=cdc,UploadMode=default" firmware/esp32_simulated_telemetry
```

The matching Arduino IDE board options are **ESP32S3 Dev Module**, **Flash Size: 16MB**, **PSRAM: OPI PSRAM**, **USB Mode: Hardware CDC and JTAG**, **USB CDC On Boot: Enabled**, **Upload Mode: UART0 / Hardware CDC**. Keep the standard partition setting; the firmware does not need a filesystem. Compile success must be observed locally; it is not inferred from the source review.

## Flash and verify the physical device

1. Connect the board and run `arduino-cli board list` to identify its COM port. Close Serial Monitor before uploading.
2. Upload with the same FQBN settings:

   ```powershell
   arduino-cli upload -p COMx --fqbn "esp32:esp32:esp32s3:FlashSize=16M,PSRAM=opi,USBMode=hwcdc,CDCOnBoot=cdc,UploadMode=default" firmware/esp32_simulated_telemetry
   ```

   Replace `COMx` with the detected port. If download mode is needed, hold **BOOT**, tap **RESET**, then release **BOOT** and retry.
3. Open Serial Monitor at 115200 baud (CLI: `arduino-cli monitor -p COMx -c baudrate=115200`) and reset the board. Expect Wi-Fi connection/reconnect messages, UTC synchronization, generated readings explicitly prefixed `SIMULATED TEST ONLY`, and `HTTPS telemetry accepted.` No passwords or tokens should appear.
4. Open the development Preview `/display` page. Confirm it shows **DEVICE ONLINE**, the matching sequence, last-seen timestamp, readings and visible **SIMULATED TEST ONLY** label. This actual packet appearing on the dashboard is the physical integration success criterion.
5. In the Preview Supabase SQL Editor only, verify the matching latest row without querying any credentials:

   ```sql
   select device_id, sequence, observed_at, received_at, source, readings
   from public.device_telemetry where device_id = 'theva-esp32-01';
   ```

6. Re-send the same packet or an older sequence from a trusted test client; expect HTTP 409 and unchanged stored/dashboard sequence. Do not expose the bearer token in shared logs or browser tools.
7. Power off the board or disable Wi-Fi and wait **more than 45 seconds**. The panel should show **DEVICE OFFLINE**, retaining the last reading and timestamp. Restore Wi-Fi; confirm reconnect, a higher accepted sequence and online status.

Automated tests use a local in-memory Supabase double and source assertions; they cannot prove Preview persistence or a physical packet. No physical integration success is claimed until steps 4–5 are observed.
