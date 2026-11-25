# Maya 2 Native alert audio generation

This workflow replaces the optional Sarvam generator for Theva Live's prerecorded bilingual alerts. It uses the open-weight `maya-research/maya2-native` model and does not require an API key.

## Voice selected for audition

Use **Kayal** for both languages. The model card lists Kayal as an adult female natural-conversation voice trained in both English and Tamil. This is a starting choice, not a claim that pronunciation or urgency has been validated; listen to the generated clips before approving it.

Model: https://huggingface.co/maya-research/maya2-native  
Inference engine: https://github.com/MayaResearch/maya2-native

## Recommended: Google Colab with a GPU runtime

Maya's reference engine requires Linux, Python 3.10–3.12, an NVIDIA GPU and CUDA 12.8. The checkpoint is about 5 GB and the documented one-seat loading peak is about 9.2 GB of GPU memory. A 12 GB+ GPU runtime is the safer target. Colab GPU availability and runtime limits vary.

1. Open a new Google Colab notebook and select **Runtime → Change runtime type → GPU**.
2. Check the runtime:
   ```bash
   !nvidia-smi
   !python --version
   ```
   Use Python 3.10–3.12 and a CUDA 12.8-compatible NVIDIA runtime. If the Colab runtime does not meet the engine's requirements, use a compatible Linux GPU machine rather than forcing an incompatible install.
3. Install the official inference engine:
   ```bash
   !git clone https://github.com/MayaResearch/maya2-native maya3
   %cd maya3
   !pip install -e ".[server]" --extra-index-url https://download.pytorch.org/whl/cu128
   ```
4. Upload this repository's `scripts/generate-maya-audio.py` into the notebook's working directory, or copy its contents into a Colab cell and save it under that filename.
5. Run the two-clip audition first:
   ```bash
   !python generate-maya-audio.py
   ```
   This generates:
   - `artifacts/maya-audio-audition/high-ta.wav`
   - `artifacts/maya-audio-audition/high-en.wav`

   Listen to both. Check Tamil pronunciation, clarity, naturalness, alert urgency, and whether the same voice identity feels consistent across both languages.
6. Only after approving the voice, generate the complete set:
   ```bash
   !python generate-maya-audio.py --all
   ```
   This writes the six expected files to `public/audio/`:
   - `high-ta.wav`, `high-en.wav`
   - `evacuation-ta.wav`, `evacuation-en.wav`
   - `all-clear-ta.wav`, `all-clear-en.wav`

7. Download the WAV files from Colab and add them to the same feature branch under `public/audio/`. Do not commit the audition files. Then run `npm test` and `npm run build`, verify all six assets are served with HTTP 200 in the PR preview, and test the browser's **Enable sound** action before testing automatic transitions.

## Important

- The default script run generates only the two HIGH audition clips; it does not overwrite the app's production audio paths.
- `--all` writes to `public/audio/`, but it still does not deploy or change production.
- Do not put API keys or credentials in the repository. Maya's self-hosted inference does not require a hosted API key.
- Keep the PR open and production untouched until the clips are reviewed and the complete browser playback flow is verified.
- Model weights are Apache-2.0; the model card also identifies upstream component licences, which should be reviewed before redistribution.
