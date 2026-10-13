# tts-tools: the verb trainer's recorded voice

These scripts make the pre-recorded clips that the verb trainer's Listen buttons play
(`verb-trainer/audio/tts/<voice-id>/<hash>.mp3`, indexed by `verb-trainer/js/tts-manifest.js`).
The audio is synthetic speech from a local text-to-speech model. It is generated once and committed
with the site; nobody who uses the site needs any of this.

| File | What it does |
|---|---|
| `extract-corpus.js` | Loads the live site data (`verb-trainer/js/*.js`) in Node and lists every French string a Listen button can speak, normalized with `VT_LOGIC.ttsSpeak` / `VT_LOGIC.ttsKey` (rule `v1`, the same code the browser uses). Writes `corpus.json`. |
| `generate.py` | Builds whatever is missing or changed, with QA and retries, then writes the site manifest, `CREDITS.md` and a review page. Incremental and idempotent: a second run with no data change generates nothing. |
| `ttsqa.py` | QA: Whisper large-v3-turbo transcription (French, temperature 0, no prompt), homophone-aware scoring, silence / clipping / truncation / runaway-length checks. |
| `engines/qwen3_tts.py` | The Qwen3-TTS adapter used in the Phase 1 comparison, unchanged. |
| `voices/qwen3-fr-bf16/reference.wav` | The designed synthetic voice (no real person). Qwen3 Base clones it for every clip. **Don't regenerate it**, or the voice changes. |
| `requirements.txt`, `requirements-lock.txt` | Pinned Python packages. |

## When the site's text changes

```sh
cd tts-tools  # from the repo root
source venv/bin/activate          # see "Setting up" below
python generate.py --dry-run      # what would be generated
python generate.py                # generate it (only new or changed texts)
```

Then reload the site. If you use the Explain helper (`explainer/start.sh`), restart it so it serves the new files.

Texts with no clip keep working: the site falls back to the device voice for them.

## What generate.py does per text

1. Synthesizes the text with Qwen3-TTS 1.7B Base (bf16, MLX), the reference voice above,
   temperature 0.7, seed 1234 + the text's position in the corpus. A final "." is added when the text has
   no ending punctuation (short inputs get cut off less often).
2. Transcribes the clip with Whisper and scores it against the text:
   - 4+ words: loose CER ≤ 0.10 and WER ≤ 0.20 (or sound-key CER ≤ 0.05);
   - 2-3 words: loose CER ≤ 0.15 (or identical sound key);
   - 1 word (stricter): only an exact match or an identical sound key passes; anything else is
     "single word: listen";
   - signal checks: silent, too short, clipping, internal gap, runaway length, last word missing.
   "Loose" means lowercase, no punctuation or accents. The "sound key" collapses silent endings and
   equal-sounding spellings (parle/parles/parlent, sait/c'est), so homophones are not counted as errors.
3. A failed clip is regenerated with a new seed (`base + 7919·n`) and a different temperature
   (0.6, 0.5, 0.8, 0.6, 0.45 …): up to 3 retries, 5 for single words. The best attempt is kept.
4. Outcome: `pass`, `short-unverified` (shipped, listed for a listen), `failed-kept` (minor issue,
   shipped) or `failed-excluded` (truncated, silent or wrong: not shipped, the site uses the device voice).
5. The kept clip is trimmed (silence below -45 dBFS, 80 ms kept), normalized with two-pass EBU R128
   loudnorm to -16 LUFS / -1.5 dBTP, and encoded as MP3 64 kbps mono 24 kHz. MP3 because every browser
   plays it and the Explain helper's static server already serves `.mp3` with Range support.

The model and Whisper are never in memory at the same time: each round synthesizes every open text,
unloads the model, then runs QA. That keeps an 18 GB Mac out of swap. A killed run resumes where it
stopped (`work/inflight-<voice>.json`, and the voice manifest is saved every 25 items).

## Reviewing clips by ear

`generate.py` writes `.agents/tts/clip-review/index.html` (or `--review-dir`). Open it as a file. It lists
every clip worst first, with what Whisper heard. Tick **Bad** on any clip that sounds wrong, press
**Export marked** and save the JSON, then:

```sh
python generate.py --marks tts-marks-qwen3-fr-bf16.json                  # regenerate them (new seeds)
python generate.py --marks tts-marks-qwen3-fr-bf16.json --exclude-marked # or drop them (device voice)
```

Other options: `--retry-failed` (retry failed and single-word-unverified clips), `--only <hash…>`,
`--limit N`, `--report-only` (rebuild the manifest, credits and review page), `--prune` (delete clips
whose text left the site). `python generate.py --help` lists them all.

## Outputs

- `verb-trainer/audio/tts/<voice-id>/<hash>.mp3`: the clips. `<hash>` = first 16 hex characters of
  SHA-256 of the normalized text (computed by `extract-corpus.js`; the browser never hashes).
- `verb-trainer/audio/tts/<voice-id>/manifest.json`: every text with its QA transcript, scores, seeds and
  attempts, plus a log of runs.
- `verb-trainer/audio/tts/<voice-id>/CREDITS.md`: model, license and the synthetic-speech statement.
- `verb-trainer/js/tts-manifest.js`: what the site loads. `window.VT_TTS.items` maps the normalized text to
  `{ file, voiceId, duration }`.

## Setting up (recreating the deleted venv and model caches)

After the first full run, the Python environment and the model downloads were deleted to free disk
space. To recreate them (Apple Silicon Mac, about 8 GB of downloads and disk):

```sh
cd tts-tools  # from the repo root
/opt/homebrew/bin/python3.11 -m venv venv       # Python 3.11 (brew install python@3.11 if missing)
source venv/bin/activate
pip install -r requirements.txt
# keep the model caches next to the tools instead of ~/.cache (optional):
export HF_HOME="$PWD/hf_home"
python generate.py --dry-run                    # downloads nothing yet
python generate.py --limit 1 --only <any hash>  # first real run downloads the two pinned models
```

The two models are downloaded automatically, at pinned revisions, on the first run:

- `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16` @ `a6eb4f68e4b056f1215157bb696209bc82a6db48` (≈ 4.2 GB, Apache-2.0)
- `mlx-community/whisper-large-v3-turbo` @ `a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb` (≈ 1.6 GB, MIT)

To fetch them by hand instead:

```sh
python -c "from huggingface_hub import snapshot_download as d; d('mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16', revision='a6eb4f68e4b056f1215157bb696209bc82a6db48'); d('mlx-community/whisper-large-v3-turbo', revision='a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb')"
```

Also needed: Node.js (for `extract-corpus.js`) and `ffmpeg` with libmp3lame on the PATH.

Keep `voices/qwen3-fr-bf16/reference.wav`. It is the voice. It was made once, with
`mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit` and the instruction "Voix féminine native de Paris,
claire et posée, diction de professeure de français, accent standard de France, débit modéré." (seed 7);
a re-run of VoiceDesign would not give the same voice, so new clips would not match the old ones.

The settings fingerprint (model, revision, reference voice, normalization) is stored with every clip. If
any of them changes, `generate.py` regenerates every clip, so all clips keep one consistent voice.
