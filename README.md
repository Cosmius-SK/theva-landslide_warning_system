# Theva Live — Landslide Early Warning System

An educational demonstration application for Theva's Grade 2 science project.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Vite prints the local development URL. To create a production build:

```bash
npm run build
npm run preview
```

## Current milestone: UI and simulation foundation

- Operator console with three simulated inputs.
- Illustrative risk assessment and separate sensor-health status.
- Sensor fault injection and ESP32-link failure simulation.
- Diagnostics view.
- Audience read-only view with a seven-minute client-side demonstration timer.
- Feedback form and CSV export (currently browser-session memory only).
- Responsive layout.

## Important limitations

This is a UI prototype. It is not connected to an ESP32, Vercel Realtime, a database, or durable session storage. Audience sessions and feedback are currently local client-side state; the seven-minute timer is not server-enforced. Do not present it as a real landslide forecasting or public warning service.

The demonstration thresholds are illustrative only:
- Evacuation: at least two inputs >= 80
- High: at least one input >= 80, or at least two inputs >= 60
- Watch: any input >= 35
- Safe: otherwise

Sensor health and landslide indication are intentionally separate.

## Planned milestones

1. Complete the local operator/audience experience and verify interaction flows.
2. Add ESP32 telemetry ingestion and health/heartbeat monitoring.
3. Add shared realtime state and server-enforced audience sessions.
4. Persist feedback and demonstration history; protect operator/admin routes.
5. Deploy to Vercel and generate the exhibition QR URL.

## Project safety

This is an educational model using simulated inputs. It is not calibrated, validated, or suitable for real-world landslide prediction, evacuation, or emergency response.