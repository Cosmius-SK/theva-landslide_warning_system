export const ALERT_ANNOUNCEMENTS = {
  high: {
    ta: "இது ஒரு கல்வி மாதிரி எச்சரிக்கை. இந்தப் பகுதியில் நிலச்சரிவு அபாயம் அதிகரிப்பதாக மாதிரி காட்டுகிறது. மலைச்சரிவுப் பகுதிக்குச் செல்ல வேண்டாம். பாதுகாப்பு வழிமுறைகளைப் பின்பற்றுங்கள்.",
    en: "This is an educational simulation. The model indicates elevated landslide risk. Stay away from the vulnerable hillside and follow safety instructions."
  },
  evacuation: {
    ta: "இது ஒரு கல்வி மாதிரி அவசர எச்சரிக்கை. நிலச்சரிவு அபாயம் மிக அதிகமாக இருப்பதாக மாதிரி காட்டுகிறது. பாதிக்கப்பட்ட மலைச்சரிவுப் பகுதியிலிருந்து விலகி, பாதுகாப்பான இடத்திற்குச் செல்லுங்கள். உள்ளூர் அதிகாரிகளின் அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.",
    en: "This is an educational simulation emergency alert. The model is showing its highest landslide warning level. Move away from the affected hillside to a safe location and follow instructions from local authorities."
  },
  allClear: {
    ta: "கல்வி மாதிரியின் எச்சரிக்கை நிலை குறைந்துள்ளது. அதிகாரிகள் பாதுகாப்பை உறுதி செய்யும் வரை பாதிக்கப்பட்ட பகுதிக்குத் திரும்ப வேண்டாம்.",
    en: "The educational model's alert level has reduced. Do not return to an affected area until local authorities confirm it is safe."
  }
};

const AUDIO_PATHS = {
  high: { ta: "/audio/high-ta.wav", en: "/audio/high-en.wav" },
  evacuation: { ta: "/audio/evacuation-ta.wav", en: "/audio/evacuation-en.wav" },
  allClear: { ta: "/audio/all-clear-ta.wav", en: "/audio/all-clear-en.wav" }
};

export function getAudioAlertForTransition(previous, next) {
  if (next === "Evacuation" && previous !== "Evacuation") return "evacuation";
  if (next === "High" && previous !== "High" && previous !== "Evacuation") return "high";
  if (next === "Safe" && (previous === "High" || previous === "Evacuation")) return "allClear";
  return null;
}

let audioContext = null;
let audioUnlocked = false;
let activeAudio = null;
let activeOscillator = null;
let alertGeneration = 0;

function emitStatus(status, detail = "") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("theva-audio-status", { detail: { status, detail } }));
  }
}

export async function unlockAudio() {
  if (typeof window === "undefined") return false;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
      if (audioContext.state !== "running") await audioContext.resume();

      // Web Audio is the primary playback path for the siren. On iOS,
      // a separate silent HTMLAudioElement can be rejected even after
      // AudioContext.resume() succeeds, so do not let that optional probe
      // incorrectly keep the whole display locked.
      audioUnlocked = audioContext.state === "running";
      if (!audioUnlocked) throw new Error("Browser audio context did not start");
    } else {
      // Older browsers without Web Audio still need a successful media
      // playback gesture before announcement clips can be played.
      const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
      silent.volume = 0;
      await silent.play();
      silent.pause();
      silent.currentTime = 0;
      audioUnlocked = true;
    }
    emitStatus("ready");
    return true;
  } catch (error) {
    audioUnlocked = false;
    emitStatus("blocked", error && error.message ? error.message : "Browser did not allow audio");
    return false;
  }
}

export function stopAudioAlert() {
  alertGeneration += 1;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (activeOscillator) {
    try { activeOscillator.stop(); } catch {}
    activeOscillator = null;
  }
}

function playSiren(kind) {
  if (!audioContext || audioContext.state !== "running") return 0;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900;
  filter.Q.value = 1.1;
  oscillator.type = "square";
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  const duration = kind === "evacuation" ? 6 : 4;
  const cycles = kind === "evacuation" ? 6 : 4;
  const cycleDuration = duration / cycles;
  const now = audioContext.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const begin = now + cycle * cycleDuration;
    const midpoint = begin + cycleDuration * 0.5;
    const finish = begin + cycleDuration;
    gain.gain.setValueAtTime(0.0001, begin);
    gain.gain.linearRampToValueAtTime(0.16, begin + 0.05);
    oscillator.frequency.setValueAtTime(740, begin);
    oscillator.frequency.linearRampToValueAtTime(1040, midpoint);
    oscillator.frequency.setValueAtTime(1040, midpoint);
    oscillator.frequency.linearRampToValueAtTime(740, finish - 0.04);
    gain.gain.setValueAtTime(0.14, finish - 0.08);
    gain.gain.linearRampToValueAtTime(0.0001, finish);
  }
  activeOscillator = oscillator;
  oscillator.start(now);
  oscillator.stop(now + duration + 0.05);
  oscillator.onended = () => { if (activeOscillator === oscillator) activeOscillator = null; };
  return duration * 1000 + 200;
}

function playClip(url) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    activeAudio = audio;
    audio.preload = "auto";
    audio.volume = 1;
    audio.onended = () => { if (activeAudio === audio) activeAudio = null; resolve(); };
    audio.onerror = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error("Unable to load announcement audio: " + url));
    };
    audio.play().catch(error => {
      if (activeAudio === audio) activeAudio = null;
      reject(error);
    });
  });
}

export async function playAudioAlert(kind) {
  if (!AUDIO_PATHS[kind]) throw new Error("Unknown alert type: " + kind);
  if (!audioUnlocked) {
    emitStatus("needs-unlock", "Tap Enable sound before automatic alerts can play.");
    throw new Error("Audio is locked. Tap Enable sound first.");
  }
  stopAudioAlert();
  const generation = alertGeneration;
  emitStatus("playing", kind + ": siren, Tamil, then English");
  try {
    const delay = kind === "allClear" ? 0 : playSiren(kind);
    if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
    if (generation !== alertGeneration) return;
    await playClip(AUDIO_PATHS[kind].ta);
    if (generation !== alertGeneration) return;
    await playClip(AUDIO_PATHS[kind].en);
    if (generation === alertGeneration) emitStatus("complete", kind + ": Tamil and English announcements played");
  } catch (error) {
    if (generation === alertGeneration) emitStatus("error", error && error.message ? error.message : "Audio playback failed");
    throw error;
  }
}
