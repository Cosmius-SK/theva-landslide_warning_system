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

let activeContext = null;
let activeOscillators = [];

export function stopAudioAlert() {
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
  oscillator.type = "sawtooth";
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  const duration = kind === "evacuation" ? 5.2 : 3.2;
  const steps = kind === "evacuation"
    ? [740, 1120, 740, 1120, 740, 1120, 740, 1120, 740, 1120]
    : [620, 900, 620, 900, 620, 900];
  const stepDuration = duration / steps.length;
  steps.forEach((frequency, index) => {
    const start = context.currentTime + index * stepDuration;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(kind === "evacuation" ? 0.13 : 0.085, start + 0.07);
    gain.gain.setValueAtTime(kind === "evacuation" ? 0.13 : 0.085, start + stepDuration * 0.65);
    gain.gain.linearRampToValueAtTime(0.0001, start + stepDuration);
  });
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.05);
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

function speakAnnouncements(kind) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
  const messages = ALERT_ANNOUNCEMENTS[kind];
  const voices = window.speechSynthesis.getVoices();
  const speak = (text, lang) => new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = voices.find(item => item.lang?.toLowerCase() === lang.toLowerCase())
      || voices.find(item => item.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
  speak(messages.ta, "ta-IN").then(() => speak(messages.en, "en-IN"));
}

export function playAudioAlert(kind) {
  if (typeof window === "undefined" || !ALERT_ANNOUNCEMENTS[kind]) return;
  stopAudioAlert();
  const delay = kind === "allClear" ? 0 : playSiren(kind);
  window.setTimeout(() => speakAnnouncements(kind), delay);
}
