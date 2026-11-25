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

export function getAudioAlertForTransition(previous, next) {
  if (next === "Evacuation" && previous !== "Evacuation") return "evacuation";
  if (next === "High" && previous !== "High" && previous !== "Evacuation") return "high";
  if (next === "Safe" && (previous === "High" || previous === "Evacuation")) return "allClear";
  return null;
}

const ANNOUNCEMENT_AUDIO = {
  high: "https://resource2.heygen.ai/text_to_speech/90c4ff85a1d944c793f69bfe9c020e16/910d15fbaf0c43edb2df86d64c4dfeff/id=3ab5f5828f864c5bb7e22053fdc0b1c9.wav",
  evacuation: "https://resource2.heygen.ai/text_to_speech/90c4ff85a1d944c793f69bfe9c020e16/910d15fbaf0c43edb2df86d64c4dfeff/id=0ccae4919b0a4be792861e9673664d8c.wav",
  allClear: "https://resource2.heygen.ai/text_to_speech/90c4ff85a1d944c793f69bfe9c020e16/910d15fbaf0c43edb2df86d64c4dfeff/id=227eba57aefe44afa94bcc24b73b602b.wav"
};

let activeContext = null;
let activeOscillators = [];
let alertTimer = null;
let activeAudio = null;

export function stopAudioAlert() {
  if (typeof window !== "undefined" && alertTimer !== null) window.clearTimeout(alertTimer);
  alertTimer = null;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  activeOscillators.forEach(oscillator => { try { oscillator.stop(); } catch {} });
  activeOscillators = [];
  if (activeContext) {
    const context = activeContext;
    activeContext = null;
    context.close().catch(() => {});
  }
}

function playSiren(kind) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return 0;
  const context = new AudioContextClass();
  activeContext = context;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.connect(gain);
  gain.connect(context.destination);

  const duration = kind === "evacuation" ? 6.0 : 3.8;
  const cycles = kind === "evacuation" ? 3 : 2;
  const cycleDuration = duration / cycles;
  const low = kind === "evacuation" ? 560 : 640;
  const high = kind === "evacuation" ? 980 : 920;
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.22);
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const begin = now + cycle * cycleDuration;
    const midpoint = begin + cycleDuration / 2;
    oscillator.frequency.setValueAtTime(low, begin);
    oscillator.frequency.linearRampToValueAtTime(high, midpoint);
    oscillator.frequency.linearRampToValueAtTime(low, begin + cycleDuration);
  }
  gain.gain.setValueAtTime(0.16, now + duration - 0.35);
  gain.gain.linearRampToValueAtTime(0.0001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.05);
  activeOscillators = [oscillator];
  oscillator.onended = () => {
    if (activeContext === context) {
      activeContext = null;
      context.close().catch(() => {});
    }
    activeOscillators = activeOscillators.filter(item => item !== oscillator);
  };
  return duration * 1000 + 250;
}

function speakFallbackAnnouncement(kind) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(voice => voice.lang?.toLowerCase() === "en-in")
    || voices.find(voice => voice.lang?.toLowerCase().startsWith("en"));
  const utterance = new SpeechSynthesisUtterance(ALERT_ANNOUNCEMENTS[kind].en);
  utterance.lang = preferred?.lang || "en-IN";
  if (preferred) utterance.voice = preferred;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}
function playRecordedAnnouncement(kind) {
  const audio = new Audio(ANNOUNCEMENT_AUDIO[kind]);
  activeAudio = audio;
  audio.preload = "auto";
  audio.volume = 1;
  audio.onended = () => {
    if (activeAudio === audio) activeAudio = null;
  };
  audio.onerror = () => {
    if (activeAudio === audio) activeAudio = null;
    // Best-effort on-device Tamil fallback if the browser has a Tamil voice.
    speakFallbackAnnouncement(kind);
  };
  const playback = audio.play();
  if (playback && typeof playback.catch === "function") playback.catch(() => {
    if (activeAudio === audio) activeAudio = null;
    speakFallbackAnnouncement(kind);
  });
}

export function playAudioAlert(kind) {
  if (typeof window === "undefined" || !ANNOUNCEMENT_AUDIO[kind]) return;
  stopAudioAlert();
  const delay = kind === "allClear" ? 0 : playSiren(kind);
  alertTimer = window.setTimeout(() => {
    alertTimer = null;
    playRecordedAnnouncement(kind);
  }, delay);
}
