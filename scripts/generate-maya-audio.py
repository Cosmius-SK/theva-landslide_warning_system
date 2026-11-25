#!/usr/bin/env python3
"""Generate Theva Live bilingual alert WAVs with Maya 2 Native.

Default: create two HIGH audition clips under artifacts/maya-audio-audition/.
Use --all only after approving the voice; this writes the six production-path
assets under public/audio/ (it does not deploy or change production).
Requires Linux, Python 3.10-3.12, CUDA 12.8, and the Maya3 inference package.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import soundfile as sf
from maya3 import Maya3TTS

ALERTS = {
    "high": {
        "ta": "இது ஒரு கல்வி மாதிரி எச்சரிக்கை. இந்தப் பகுதியில் நிலச்சரிவு அபாயம் அதிகரிப்பதாக மாதிரி காட்டுகிறது. மலைச்சரிவுப் பகுதிக்குச் செல்ல வேண்டாம். பாதுகாப்பு வழிமுறைகளைப் பின்பற்றுங்கள்.",
        "en": "This is an educational simulation. The model indicates elevated landslide risk. Stay away from the vulnerable hillside and follow safety instructions.",
    },
    "evacuation": {
        "ta": "இது ஒரு கல்வி மாதிரி அவசர எச்சரிக்கை. நிலச்சரிவு அபாயம் மிக அதிகமாக இருப்பதாக மாதிரி காட்டுகிறது. பாதிக்கப்பட்ட மலைச்சரிவுப் பகுதியிலிருந்து விலகி, பாதுகாப்பான இடத்திற்குச் செல்லுங்கள். உள்ளூர் அதிகாரிகளின் அறிவுறுத்தல்களைப் பின்பற்றுங்கள்.",
        "en": "This is an educational simulation emergency alert. The model is showing its highest landslide warning level. Move away from the affected hillside to a safe location and follow instructions from local authorities.",
    },
    "all-clear": {
        "ta": "கல்வி மாதிரியின் எச்சரிக்கை நிலை குறைந்துள்ளது. அதிகாரிகள் பாதுகாப்பை உறுதி செய்யும் வரை பாதிக்கப்பட்ட பகுதிக்குத் திரும்ப வேண்டாம்.",
        "en": "The educational model's alert level has reduced. Do not return to an affected area until local authorities confirm it is safe.",
    },
}

VOICE = "Kayal"  # trained in both Tamil and English
SAMPLE_DIR = Path("artifacts/maya-audio-audition")
PRODUCTION_DIR = Path("public/audio")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        help="Generate all six clips to public/audio/ after the voice has been approved.",
    )
    parser.add_argument(
        "--voice",
        default=VOICE,
        help="Maya built-in voice. Default Kayal (trained in English and Tamil).",
    )
    args = parser.parse_args()

    output_dir = PRODUCTION_DIR if args.all else SAMPLE_DIR
    output_dir.mkdir(parents=True, exist_ok=True)
    selected = ALERTS if args.all else {"high": ALERTS["high"]}

    print(f"Loading maya-research/maya2-native (voice={args.voice})...")
    tts = Maya3TTS.from_pretrained("maya-research/maya2-native", max_seats=1)

    try:
        for alert_name, language_texts in selected.items():
            for lang, text in language_texts.items():
                waveform = tts.generate(text, lang=lang, voice=args.voice, normalize=True)
                filename = f"{alert_name}-{lang}.wav"
                destination = output_dir / filename
                sf.write(destination, waveform, 24000, subtype="PCM_16")
                print(f"Wrote {destination} ({lang}, 24 kHz mono, PCM-16)")
    finally:
        close = getattr(tts, "close", None)
        if callable(close):
            close()

    print("Done. Listen to both Tamil and English clips before approving the voice.")
    if not args.all:
        print("After approval, rerun with --all to create the six /audio/*.wav assets.")


if __name__ == "__main__":
    main()
