# ESP32 integration contract (draft)

## Audit result

No ESP32 firmware, device-specific protocol, hardware library, or live hardware route exists in this repository. The current operator sliders are virtual inputs. The “controller heartbeat” button only simulates an online/offline signal. Do not interpret either as a physical device connection.

This document defines a **proposed JSON application contract**, not an assertion about existing firmware. The hardware owner should confirm sensor calibration, units, device identity, transport, and authentication before firmware is built. Current values are normalized demonstration indices from 0 through 100, not calibrated engineering units.

## Proposed sample

```json
{
  "deviceId": "theva-esp32-01",
  "sequence": 4,
  "sentAt": "2026-11-22T10:00:00.000Z",
  "controllerOnline": true,
  "readings": [
    { "id": "moisture", "value": 58, "status": "ok" },
    { "id": "rainfall", "value": 42, "status": "ok" },
    { "id": "movement", "value": 3, "status": "fault" }
  ]
}
```

Contract rules:

- `deviceId` is a 1–64 character alphanumeric, underscore, or hyphen identifier.
- `sequence` is a non-negative, monotonically increasing device counter. A production ingestion endpoint must reject duplicate and older values.
- `sentAt` is ISO-8601 UTC. Samples older than 30 seconds or more than 60 seconds in the future are rejected by the current validator.
- `controllerOnline` is a boolean heartbeat state.
- Exactly one reading for each of `moisture`, `rainfall`, and `movement` is required.
- `value` is an integer from 0 to 100 in the current educational model.
- `status` is `ok` or `fault`; faulted channels are excluded from risk calculations while healthy channels continue contributing.
- Missing, stale, malformed, out-of-range, or faulted readings must never overwrite the last known good shared state.
- Hardware authentication must use a dedicated device credential, kept server-side. The operator token and Supabase service-role key must never be embedded in firmware or sent to the browser.

## Required integration work

The repository currently validates the proposed sample shape and freshness in `src/lib/contracts.js`; automated tests use mock samples. There is no HTTP hardware-ingestion endpoint, monotonic sequence store, device credential, calibration configuration, or firmware. Those require owner approval of the transport and credential provisioning model. Until then, Automatic uses the virtual fallback, Virtual override remains available, and Hardware-only reports unavailable readings.

Before a physical exhibition, add an authenticated ingestion endpoint, persist the last accepted device sequence and reading timestamp, test the complete ESP32-to-Supabase path against a development project, and record sensor-specific units and calibration ranges. Do not use these illustrative values for real-world warnings.
