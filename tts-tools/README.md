# tts-tools: the verb trainer's recorded voice

These scripts make the pre-recorded clips that the verb trainer's Listen buttons play
(`verb-trainer/audio/tts/<voice-id>/<hash>.mp3`, indexed by `verb-trainer/js/tts-manifest.js`).
The audio is synthetic speech from a local text-to-speech model. It is generated once and committed
with the site; nobody who uses the site needs any of this.

| File | What it does |
|---|---|
| `extract-corpus.js` | Loads the live site data (`verb-trainer/js/*.js`) in Node and lists every French string a Listen button can speak (verbs, topics and the Grammar tables: list cells, grid cells and examples, `say` used instead of `fr` when a row has one; the everyday expressions: `VT_EXPR.speakText` (the filled-in `say` for "…" phrases) and each example; the dialogues: `VT_DLG.listenEntries`), normalized with `VT_LOGIC.ttsSpeak` / `VT_LOGIC.ttsKey` (rule `v1`, the same code the browser uses). One corpus per voice: writes `corpus.json` for the default voice and, with `--voice <id>`, `corpus-<id>.json` (only the dialogue lines of the speakers mapped to that voice). |
| `generate.py` | Builds whatever is missing or changed, with QA and retries, then writes the site manifest, `CREDITS.md` and a review page. Incremental and idempotent: a second run with no data change generates nothing. |
| `ttsqa.py` | QA: Whisper large-v3-turbo transcription (French, temperature 0, no prompt), homophone-aware scoring, number / clock-time normalization, silence / clipping / truncation / runaway-length checks. |
| `test_ttsqa.py` | Unit tests for the QA text rules and `median_f0`: `python -m unittest -v test_ttsqa`. |
| `test_manifest_js.py` | Unit tests for the site manifest writer (default voice byte-identical, extra voices register into `VT_TTS_VOICES`): `python -m unittest -v test_manifest_js`. |
| `env.example.sh` | Template for the permanent environment (venv, model cache, pip cache) kept outside the repo. |
| `engines/qwen3_tts.py` | The Qwen3-TTS adapter used in the Phase 1 comparison, plus `design()` (VoiceDesign from a pinned local snapshot, used only by `--design-candidates`); `load()` never designs a voice implicitly. |
| `voices/qwen3-fr-bf16/reference.wav` | The designed synthetic voice (no real person). Qwen3 Base clones it for every clip. **Don't regenerate it**, or the voice changes. |
| `voices/qwen3-fr-m-bf16/reference.wav` | The second designed synthetic voice (male, Dialogues speakers; no real person). Same rule: **don't regenerate it**. |
| `requirements.txt`, `requirements-lock.txt` | Pinned Python packages. |

## When the site's text changes

```sh
cd tts-tools  # from the repo root
source <tts-env>/env.sh           # see "Setting up" below
python generate.py --dry-run --strict-short --review-dir <tts-env>/clip-review   # what would be generated
python generate.py --strict-short --max-retries-short 7 --review-dir <tts-env>/clip-review
```

Then reload the site. If you use the Explain helper (`explainer/start.sh`), restart it so it serves the new files.

Texts with no clip keep working: the site falls back to the device voice for them.

Coverage now: 2,886 of 2,896 Listen texts have a clip in the default voice (2,875 pass, 9 `failed-kept`,
2 `short-unverified`; all 198 everyday-expression texts passed QA on the first run). Left to the device voice
(`failed-excluded` in the voice manifest): `il naît`, `m'`, `s'`, `cher, chère`, `ceux`, `longue`, `tes`, and the
dialogue vocabulary items `six euros cinquante` (Whisper hears "6,50 euros", which the scorer can't match) and
`à Étretat` (heard "À être ta."). The dialogue line `Un euro vingt pièce.` is `failed-kept`: Whisper writes "1,20€"
and drops `pièce`, but the word is spoken (the clip's tail alone transcribes as "Une pièce."), so it ships.
`je me suis assis` is excluded by the user (`excludedByUser`). The second voice covers 260 of 260 texts (257 pass,
3 `failed-kept`: the spelled names `L, A, U, R, E, N, T. Laurent.` and `Vincent Roux. R, O, U, X.` run longer than
the length estimate, and `Oui, bien sûr. Ça fait six euros cinquante.` for the same digits reason as above).
## What generate.py does per text

1. Synthesizes the text with Qwen3-TTS 1.7B Base (bf16, MLX), the reference voice above,
   temperature 0.7, seed 1234 + the text's position in the corpus. A final "." is added when the text has
   no ending punctuation (short inputs get cut off less often).
2. Transcribes the clip with Whisper and scores it against the text:
   - 4+ words: loose CER ≤ 0.10 and WER ≤ 0.20 (or sound-key CER ≤ 0.05);
   - 2-3 words: loose CER ≤ 0.15 (or identical sound key);
   - 1 word (stricter): only an exact match or an identical sound key passes; anything else is
     "single word: listen";
   - with `--strict-short`, any text without a space (`dix-sept`, `l'hôtel`, `celui-ci`) also counts as
     one word (same rule and retry budget), and a single word Whisper still hasn't confirmed after all
     retries is `failed-excluded` (flag `single-word-unverified`): not shipped, the site uses the device voice;
   - signal checks: silent, too short, clipping, internal gap, runaway length, last word missing.
   Whisper often writes numbers and times as digits. Before scoring, its transcript is spelled out
   (`21` → vingt et un, `3e` → troisième, `1er` → premier, `75 €` → soixante-quinze euros,
   `6,50 €` / `6,50 euros` → six euros cinquante, `1,20 €` → un euro vingt, `0,50 €` → cinquante centimes,
   `35°` → trente-cinq degrés, `40 m²` → quarante mètres carrés, `500 g` → cinq cents grammes, `1 kg` → un kilo,
   `01 42 18 30 12` → zéro un quarante-deux …,
   `18h30` / `18:30` / `18 h 30` → dix-huit heures trente), and a clock time is also tried in its other
   correct readings (`4 h 15` = quatre heures et quart, `5 h 45` = six heures moins le quart,
   `6 h 50` = sept heures moins dix, `12 h 30` = midi et demi); the best reading counts. Thresholds are unchanged.
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

`generate.py` writes `.agents/tts/clip-review/index.html` by default; pass `--review-dir <folder outside
the repo>` (for example `<tts-env>/clip-review`) so the page is never committed. Open it as a file. It lists
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
- `verb-trainer/js/tts-manifest-<id>.js`: the same for every other voice, registered as
  `window.VT_TTS_VOICES["<id>"] = { version, normalization, voice, coverage, items }`. `index.html` loads it
  right after `tts-manifest.js` and before `speech.js`.

## Multiple voices

The default voice (`qwen3-fr-bf16`, `"default": True` in `VOICES` in `generate.py`) speaks everything. A
second voice, `qwen3-fr-m-bf16` (a synthetic male French voice), speaks the Dialogues lines of the speakers
mapped to it. The mapping is data: `speakers[].voice` in `verb-trainer/js/dialogues-data.js`. Vocabulary and
"Notice this" examples always use the default voice.

- Each voice has a `VOICES` entry (same Base model and revision, its own `settings.ref_dir`, label, voiceNote,
  `median_ratio`, and for a designed voice a `design` block with the VoiceDesign repo, revision, instruction
  and seed).
- One corpus per voice: `python generate.py --voice qwen3-fr-m-bf16 …` extracts `corpus-qwen3-fr-m-bf16.json`
  (the default voice keeps `corpus.json`), writes the clips to `verb-trainer/audio/tts/qwen3-fr-m-bf16/`, its
  own `manifest.json` and `CREDITS.md`, `verb-trainer/js/tts-manifest-qwen3-fr-m-bf16.js`, and its review page
  to `<review-dir>/qwen3-fr-m-bf16/index.html` (so the default voice's page is never overwritten).
- A text spoken by both a male and a female speaker gets one clip per voice. A missing clip for a voice is
  spoken by the device voice, never by the other voice.

Designing a new voice (VoiceDesign, then Whisper; one model in memory at a time):

```sh
python generate.py --voice <id> --design-candidates 3 --design-out <tts-env>/voice-compare   # seeds 7, 11, 23
python generate.py --voice <id> --design-candidates 6 --design-out <tts-env>/voice-compare   # adds 13, 29, 31
python generate.py --voice <id> --design-pick <seed> --design-out <tts-env>/voice-compare    # copies it to voices/<id>/reference.wav
```

`--design-candidates` prints duration, Whisper CER and median pitch (F0) per candidate and writes
`candidates.json` with a recommendation (F0 under 160 Hz for a male voice, then the lowest CER).
`--design-pick` refuses to overwrite an existing reference (`--force` replaces it) and prints the
`seed_ratio`: copy the seed into `design.seed` and the ratio into `median_ratio`, then run the first
generation. Afterwards recalibrate `median_ratio` to the median actual/expected duration of the voice's
`pass` clips and re-apply the QA rules with `python generate.py --voice <id> --rescore --no-extract
--strict-short` (no model). As with the first voice, **don't regenerate a reference** once clips exist: a
new VoiceDesign run gives a different voice, and every clip of that voice would be regenerated.

The second voice was designed with `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit` @
`f90d617701d9f7f4ca499291e0b57f2b3c2fd2ee`, seed 7, from the instruction "Voix masculine native de Paris,
chaleureuse et posée, la trentaine, diction claire et naturelle, accent standard de France, débit modéré."
No real person was recorded or cloned. A third voice needs a `VOICES` entry, a design and pick, a generation
run, one `<script src="js/tts-manifest-<id>.js?v=__BUILD__">` in `index.html` and the id in the dialogue data.

## Setting up (a permanent environment outside the repo)

The Python environment and the two model downloads (about 6 GB) live in one folder **outside the git
repo**, so they survive between runs and can never be committed. Set it up once (Apple Silicon Mac):

```sh
cp tts-tools/env.example.sh <tts-env>/env.sh   # then set TTS_ENV in it to the folder, e.g. /path/to/tts-env
source <tts-env>/env.sh                        # exports TTS_VENV, HF_HOME, PIP_CACHE_DIR
mkdir -p "$TTS_ENV/hf_home" "$TTS_ENV/pip_cache"
/opt/homebrew/bin/python3.11 -m venv "$TTS_VENV"   # Python 3.11 (brew install python@3.11 if missing)
source <tts-env>/env.sh                        # activates the new venv
cd tts-tools && pip install -r requirements.txt -c requirements-lock.txt
```

After that, every session only needs `source <tts-env>/env.sh`. Keep the folder: deleting it means
downloading the models again. `.gitignore` also ignores `.tts-env/`, `tts-tools/venv/` and
`tts-tools/hf_home/` in case one is created inside the repo by mistake.

The two models are downloaded into `$HF_HOME` automatically, at pinned revisions, on the first run:

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
