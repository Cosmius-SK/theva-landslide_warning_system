# Chariot prerecorded alert audio

Theva Live uses Chariot's multilingual TTS API to create the six fixed alert announcements as WAV files during a controlled Vercel build. The API key remains server-side and is never exposed to browser code.

## Voice

Default voice: **Karthik**, listed by Chariot as a Tamil male calm-presenter voice. Chariot's multilingual model allows the same voice identity to speak both Tamil and English. The voice is a candidate until the generated clips have been listened to and approved.

The voice can be changed with `CHARIOT_TAMIL_VOICE_NAME` (for example, `Nithya`) without changing the script. The generator resolves the selected name through Chariot's authenticated `GET /v1/voices` catalogue, then sends the text to `POST /v1/tts` with model type `chariot-multilingual-v1`.

## Generated files

The build generates these six static assets under `public/audio/`:

- `high-ta.wav`, `high-en.wav`
- `evacuation-ta.wav`, `evacuation-en.wav`
- `all-clear-ta.wav`, `all-clear-en.wav`

Chariot returns WAV audio at 44.1 kHz mono, PCM 16-bit. The browser plays the Tamil clip first and the English clip second, after the existing siren where applicable.

## Controlled generation

1. Keep `CHARIOT_API_KEY` as a Vercel **Sensitive** environment variable. Never use a `VITE_*` prefix.
2. Set `CHARIOT_GENERATE_AUDIO=true` only for the specific Preview branch being tested. Do not set it in Production until the clips are reviewed and production deployment is explicitly approved.
3. Optionally set `CHARIOT_TAMIL_VOICE_NAME=Karthik` (the default).
4. Trigger a Preview deployment. The npm `prebuild` hook generates the WAVs before Vite builds the static site. If the flag is absent or false, generation is skipped and the build does not call Chariot.
5. Listen to all six clips in the Preview deployment and verify the served files return HTTP 200.
6. After approval, decide how to persist the approved WAVs for future builds. A build-generated file is part of that deployment artifact, not automatically committed back to Git.

## API and limits

- Endpoint: `POST https://api.chariot.in/v1/tts`
- Authentication header: `chariotai-api-key`
- Model: `chariot-multilingual-v1`
- Each request supports up to 1,000 characters.
- The API returns a WAV file. The generator checks the RIFF/WAVE header before writing it.
- Generation is sequential to stay within free-tier concurrency limits.
- The generator does not log or print the API key.

## Safety

- All announcements explicitly describe Theva as an educational simulation.
- These clips are demonstration audio, not a real public-warning service.
- Preview generation only; no production deployment, merge, or production environment change is performed by this workflow.
