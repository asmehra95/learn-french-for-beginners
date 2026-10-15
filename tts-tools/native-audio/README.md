# native-audio: Lingua Libre recordings for the verb trainer

Dev-only tool (not part of the site; project: https://github.com/asmehra95/learn-french-for-beginners). `fetch-lingualibre.mjs` finds native-speaker recordings from [Lingua Libre](https://lingualibre.org/) on Wikimedia Commons for the 125 verbs in `../../verb-trainer`. It downloads them into `verb-trainer/audio/` and regenerates `verb-trainer/js/audio-manifest.js` and `verb-trainer/audio/CREDITS.md`. The site plays only these bundled files and makes no runtime requests.

## Sources and licences

- Only French Lingua Libre files (`File:LL-Q150 (fra)-<speaker>-<words>.wav`) whose words match an item exactly. Matching ignores case, ’ vs ' and trailing punctuation.
- Only CC0, CC BY or CC BY-SA (`LicenseShortName`), with a licence URL. Anything else is rejected.
- For every accepted clip the manifest stores the speaker, the licence, the licence URL, the Commons file page (`source`) and the original title. CREDITS.md lists them all.
- Only the MP3 transcode that Commons generates is downloaded, never the WAV original.

## What it fetches

For every verb: the infinitive, each present form, the past (passé composé), the future and the example sentence.

- Full-phrase clips come first (`scope: "phrase"`, e.g. "j'entends", "se lever", "j'ai entendu").
- Bare-word clips (`scope: "word"`, e.g. "entends") are the fallback, for infinitives, present forms and the past only. Ambiguous bare words are skipped: es, as, fait, est, sens, vis, lis.
- Ties are broken by speaker region (France first: Lingua Libre speaker page → Wikidata country, else Commons text). Next comes a speaker already used for the verb, then one already in the manifest, then the title.
- Existing entries are never replaced. The one exception: a word-only clip is replaced by a full-phrase clip for the same item, which is logged as an upgrade.

## Politeness

- One request at a time, at least 1 s apart. The User-Agent is `LearnFrenchForBeginners/1.0 (https://github.com/asmehra95/learn-french-for-beginners; <contact>) node-fetch`. There is no default contact; set one with `--contact` or `LL_CONTACT` to get a higher Wikimedia rate limit.
- Wikimedia's 2026 limits allow 200 requests/min only with a contact email or URL in the User-Agent, and 10/min without one. If the contact is not an email or URL, requests are spaced 6.5 s apart.
- Every API call sends `maxlag=5`. On `maxlag`, 429 or 503 the script waits for `Retry-After` (or backs off 2, 4, 8, 16, 32 s), with at most 6 attempts. A 429 also doubles that host's gap for a while.
- Searches are cached in `cache/search.json` and speaker regions in `cache/speakers.json`.

## Flags

| Flag | Meaning |
|---|---|
| `--dry-run` | Do every API read, but download and write nothing. Prints the decision table marked `DRY RUN`. |
| `--outputs-only` | Make no requests. Rewrite `js/audio-manifest.js`, `audio/CREDITS.md` and the README block from `state.json` and the current manifest (then rebuild the zip). |
| `--site <dir>` | The site folder (default `../../verb-trainer`). |
| `--only <id,id>` | Limit to some verb ids, for testing. |
| `--no-process` | Skip ffmpeg and keep the downloaded MP3 as is (`edited` is not set). |
| `--contact <email or URL>` | Contact for the User-Agent (or env `LL_CONTACT`). |
| `--report <file>` | Run report (default `last-run.json`; not written in a dry run). |

The easiest way to run it is in your own Terminal, with one command. It fetches (resuming where any earlier run stopped), rebuilds the download zip, then runs the site tests and the headless Chrome check:

```sh
cd "tts-tools/native-audio"
./update-native-audio.sh                             # resumes; fetch, zip, tests, headless check
```

Stop it with Ctrl-C at any time and run it again later. The output is also appended to `run.log`. Or call the fetch script directly:

```sh
node fetch-lingualibre.mjs --dry-run --only entendre,se-lever
node fetch-lingualibre.mjs --contact you@example.org
```

README.md in the site is updated too: the text between its `native-audio` markers is regenerated from the coverage figures.

## Outputs

- `verb-trainer/audio/<verbId>-infinitive.mp3`, `-present-<1s|2s|3s|1p|2p|3p>.mp3`, `-past.mp3`, `-future.mp3`, `-sentence.mp3`.
- `verb-trainer/js/audio-manifest.js`: items in verb and kind order with fields `file, said, exact, scope, speaker, license, licenseUrl, source, title` (plus `edited: true` when processed). It also holds a `coverage` object with totals, per lesson range, `files`, `bytes`, `speakers` and `edited`. Items from the first run keep their fields byte for byte, with `scope` added.
- `verb-trainer/audio/CREDITS.md`: regenerated, one table row per item.
- `state.json` (every clip downloaded by this script), `cache/`, and `last-run.json` (per-target decisions, request counts, time, upgrades, processed and kept files).

## Idempotency and crash safety

- Each clip is written to `audio/` with an atomic rename and recorded in `state.json` right away.
- A rerun skips items whose file exists and that are in the manifest as a full phrase, or in `state.json`.
- A file with neither (an orphan from a crash) is fetched again and overwritten.
- The manifest and CREDITS.md are rewritten only at the end of a non-dry run, from the manifest plus `state.json`.

## Processing

New and upgraded clips go through ffmpeg: leading and trailing silence is trimmed (-45 dB), loudness is normalised (EBU R128, -18 LUFS), 50 ms lead-in and 100 ms tail, mono 44.1 kHz, 96 kbps MP3. The result must last at least 0.2 s. If ffmpeg is missing or fails, the download is kept unchanged and listed in CREDITS.md. CC BY-SA requires stating changes, so CREDITS.md and the site's Credits view say which files were edited.

## Download zip

`build-download-zip.mjs` builds `verb-trainer/audio/downloads/native-recordings.zip`: every bundled clip, plus `CREDITS.md` and a `README.txt` with the CC0 / CC BY / CC BY-SA terms. The synthetic recorded voice in `audio/tts/` is not included. Builds are reproducible: sorted entries, fixed timestamps and `zip -X` give the same bytes from the same inputs. It records `{ file, bytes, files }` as `download` in `audio-manifest.js`. The Credits view uses that for its plain `<a download>` link. Rerun it after every fetch; `update-native-audio.sh` does this for you.
