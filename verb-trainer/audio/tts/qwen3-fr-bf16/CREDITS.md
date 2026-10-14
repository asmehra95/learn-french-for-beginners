# Recorded voice: credits and license

The clips in this folder (`audio/tts/qwen3-fr-bf16/*.mp3`) are **synthetic speech**: computer-generated
text-to-speech, not recordings of a person. They were generated once, offline, with a local model and
are played by the verb trainer's Listen buttons.

- Model: Qwen3-TTS-12Hz-1.7B-Base (bf16, MLX build mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16), revision `a6eb4f68e4b056f1215157bb696209bc82a6db48` (https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16). Upstream: Qwen3-TTS by the Qwen team, Alibaba Cloud (https://github.com/QwenLM/Qwen3-TTS).
- Model license: Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0).
- Voice: One synthetic voice designed from a text description with Qwen3-TTS VoiceDesign ("native Parisian female voice, clear and calm, teacher's diction"); no real person was cloned.
- Run: mlx-audio 0.5.8 on Apple Silicon; temperature 0.7 (retries 0.45 to 0.8), seed 1234 + item position.
- Post-processing: silence trimmed, loudness normalized to -16 LUFS, MP3 64 kbps mono 24 kHz.
- Quality check: every clip was transcribed by Whisper large-v3-turbo (MIT) and compared with its text;
  clips that failed after retries are not shipped and the site uses the device voice for them.
- Coverage: 2188 of 2196 Listen texts.
- Regenerate or extend: see `tts-tools/README.md`.

`manifest.json` next to this file lists every clip with its text, QA transcript and scores.
