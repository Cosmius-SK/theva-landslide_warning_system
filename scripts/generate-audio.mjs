import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiKey = process.env.SARVAM_API_KEY;
if (!apiKey) {
  console.error("Missing SARVAM_API_KEY. Set it in your shell before running this script.");
  process.exit(1);
}

const alerts = {
  high: {
    ta: "இது ஒரு கல்வி மாதிரி எச்சரிக்கை. இந்தப் பகுதியில் நிலச்சரிவு அபாயம் அதிகரிப்பதாக மாதிரி காட்டுகிறது. மலைச்சரிவுப் பகுதிக்குச் செல்ல வேண்டாம். பாதுகாப்பு வழிமுறைகளைப் பின்பற்றுங்கள்.",
    en: "This is an educational simulation. The model indicates elevated landslide risk. Stay away from the vulnerable hillside and follow safety instructions."
  },
  evacuation: {
    ta: "இது ஒரு கல்வி மாதிரி அவசர எச்சரிக்கை. நிலச்சரிவு அபாயம் மிக அதிகமாக இருப்பதாக மாதிரி காட்டுகிறது. பாதிக்கப்பட்ட மலைச்சரிவுப் பகுதியிலிருந்து விலகி, பாதுகாப்பான இடத்திற்குச் செல்லுங்கள். உள்ளூர் அதிகாரிகளின் அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.",
    en: "This is an educational simulation emergency alert. The model is showing its highest landslide warning level. Move away from the affected hillside to a safe location and follow instructions from local authorities."
  },
  "all-clear": {
    ta: "கல்வி மாதிரியின் எச்சரிக்கை நிலை குறைந்துள்ளது. அதிகாரிகள் பாதுகாப்பை உறுதி செய்யும் வரை பாதிக்கப்பட்ட பகுதிக்குத் திரும்ப வேண்டாம்.",
    en: "The educational model's alert level has reduced. Do not return to an affected area until local authorities confirm it is safe."
  }
};

const outputDir = resolve("public/audio");
await mkdir(outputDir, { recursive: true });

for (const [alert, languages] of Object.entries(alerts)) {
  for (const [language, text] of Object.entries(languages)) {
    const tamil = language === "ta";
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        language_code: tamil ? "ta-IN" : "en-IN",
        model: "bulbul:v4-flash",
        speaker: tamil ? "gokul_ta_narration" : "simran_en_customer",
        pace: 0.94,
        loudness: 1.15,
        output_audio_codec: "wav",
        speech_sample_rate: 24000
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error("Sarvam failed for " + alert + "-" + language + ": " + JSON.stringify(payload));
    }
    if (!Array.isArray(payload.audios) || !payload.audios[0]) {
      throw new Error("Sarvam returned no audio for " + alert + "-" + language);
    }
    const file = resolve(outputDir, alert + "-" + language + ".wav");
    await writeFile(file, Buffer.from(payload.audios[0], "base64"));
    console.log("Generated " + file);
  }
}
console.log("Generated all six prerecorded announcement clips.");
