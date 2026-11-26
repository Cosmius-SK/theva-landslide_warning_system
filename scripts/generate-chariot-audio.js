#!/usr/bin/env node
/**
 * Generate Theva Live's six prerecorded bilingual alert clips with Chariot.
 *
 * This runs as an npm prebuild hook but is a no-op unless
 * CHARIOT_GENERATE_AUDIO=true. Keep that flag scoped to the intended Vercel
 * preview branch; never expose CHARIOT_API_KEY to Vite/client-side code.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE = "https://api.chariot.in/v1";
const MODEL_TYPE = "chariot-multilingual-v1";
const VOICE_NAME = process.env.CHARIOT_TAMIL_VOICE_NAME || "Karthik";
const OUTPUT_DIR = resolve("public/audio");

const ALERTS = [
  {
    name: "high",
    ta: "இது ஒரு கல்வி மாதிரி எச்சரிக்கை. இந்தப் பகுதியில் நிலச்சரிவு அபாயம் அதிகரிப்பதாக மாதிரி காட்டுகிறது. மலைச்சரிவுப் பகுதிக்குச் செல்ல வேண்டாம். பாதுகாப்பு வழிமுறைகளைப் பின்பற்றுங்கள்.",
    en: "This is an educational simulation. The model indicates elevated landslide risk. Stay away from the vulnerable hillside and follow safety instructions."
  },
  {
    name: "evacuation",
    ta: "இது ஒரு கல்வி மாதிரி அவசர எச்சரிக்கை. நிலச்சரிவு அபாயம் மிக அதிகமாக இருப்பதாக மாதிரி காட்டுகிறது. பாதிக்கப்பட்ட மலைச்சரிவுப் பகுதியிலிருந்து விலகி, பாதுகாப்பான இடத்திற்குச் செல்லுங்கள். உள்ளூர் அதிகாரிகளின் அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.",
    en: "This is an educational simulation emergency alert. The model is showing its highest landslide warning level. Move away from the affected hillside to a safe location and follow instructions from local authorities."
  },
  {
    name: "all-clear",
    ta: "கல்வி மாதிரியின் எச்சரிக்கை நிலை குறைந்துள்ளது. அதிகாரிகள் பாதுகாப்பை உறுதி செய்யும் வரை பாதிக்கப்பட்ட பகுதிக்குத் திரும்ப வேண்டாம்.",
    en: "The educational model's alert level has reduced. Do not return to an affected area until local authorities confirm it is safe."
  }
];

function authHeaders(apiKey) {
  return { "chariotai-api-key": apiKey, "Content-Type": "application/json" };
}

async function getVoiceId(apiKey) {
  const candidates = [];
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`${API_BASE}/voices`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { "chariotai-api-key": apiKey }
    });
    if (!response.ok) {
      throw new Error(`Chariot voice catalogue failed: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
    }
    const payload = await response.json();
    let pageCursor = null;
    let hasMore = false;
    const visit = (value) => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      const name = value.name ?? value.voice_name ?? value.display_name ?? value.label;
      const id = value.voice_id ?? value.id ?? value.uuid;
      const models = value.models;
      const supportsModel = !Array.isArray(models) || models.length === 0 ||
        models.some(model => (typeof model === "string" ? model : model?.model_type ?? model?.id ?? model?.name) === MODEL_TYPE);
      if (typeof name === "string" && typeof id === "string" && supportsModel) candidates.push({ name, id });
      for (const [key, child] of Object.entries(value)) {
        if (key === "next_cursor" || key === "nextCursor") {
          if (typeof child === "string" && child) pageCursor = child;
        }
        if (key === "has_more" || key === "hasMore") hasMore ||= child === true;
        if (child && typeof child === "object") visit(child);
      }
    };
    visit(payload);
    cursor = pageCursor;
    if (!hasMore || !cursor) break;
  }
  const selected = candidates.find(v => v.name.toLocaleLowerCase() === VOICE_NAME.toLocaleLowerCase());
  if (!selected) {
    const available = [...new Set(candidates.map(v => v.name))].sort();
    throw new Error(`Chariot voice "${VOICE_NAME}" not found in the multilingual voice catalogue. Available names: ${available.join(", ") || "none returned"}`);
  }
  return selected.id;
}

async function generateClip(apiKey, voiceId, text, filename) {
  if (text.length > 1000) throw new Error(`${filename} exceeds Chariot's 1,000-character request limit`);
  const response = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({ voice_id: voiceId, text, model_type: MODEL_TYPE })
  });
  if (!response.ok) {
    throw new Error(`Chariot TTS failed for ${filename}: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Chariot returned a non-WAV response for ${filename}`);
  }
  const destination = resolve(OUTPUT_DIR, filename);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, audio);
  console.log(`Generated public/audio/${filename} (${audio.length} bytes)`);
}

async function main() {
  if (process.env.CHARIOT_GENERATE_AUDIO !== "true") {
    console.log("Skipping Chariot audio generation (CHARIOT_GENERATE_AUDIO is not true).");
    return;
  }
  const apiKey = process.env.CHARIOT_API_KEY;
  if (!apiKey) throw new Error("CHARIOT_GENERATE_AUDIO=true but CHARIOT_API_KEY is missing.");

  const voiceId = await getVoiceId(apiKey);
  console.log(`Generating six Theva alert WAVs with Chariot voice "${VOICE_NAME}"...`);
  for (const alert of ALERTS) {
    await generateClip(apiKey, voiceId, alert.ta, `${alert.name}-ta.wav`);
    await generateClip(apiKey, voiceId, alert.en, `${alert.name}-en.wav`);
  }
  console.log("All six prerecorded alert WAVs are ready in public/audio/.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
