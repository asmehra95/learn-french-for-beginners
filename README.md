# Say it in French

A free, open-source French learning suite for English speakers. It covers 125 common French verbs
across 25 lessons, with flashcards, conjugation practice, quizzes, grammar topic lessons, an
AI-powered Explain feature, printable guides and workbooks, and high-quality synthetic voice plus
native-speaker audio clips.

## Live demo

[https://asmehra95.github.io/say-it-in-french/](https://asmehra95.github.io/say-it-in-french/)
<!-- TODO: update username if different -->

## Three ways to use it

1. **Hosted site** — open the link above. No install, no account. Everything works except Explain
   (which needs a local AI for privacy; see the Explain section below).

2. **Download / clone and open offline** — clone the repo or download a ZIP, then open
   `verb-trainer/index.html` directly in Chrome, Safari, Firefox or Edge. Keep the `verb-trainer/`
   folder intact; everything except Explain works without an internet connection.

   ```sh
   git clone https://github.com/asmehra95/say-it-in-french.git
   # then open verb-trainer/index.html in your browser
   ```

3. **Run the local helper for Explain** — start the helper once to unlock the Explain feature:

   ```sh
   cd explainer && ./start.sh
   ```

   Then open the address it prints (`http://127.0.0.1:<port>/trainer/`). The helper needs
   [Ollama](https://ollama.com) with the `mistral` model installed; see the Explain section.

## Features

- **125 verbs across 25 lessons** — regular -er / -ir / -re, spelling-change, and irregular verbs,
  grouped by lesson and ordered from the most common.
- **Flashcard conjugation peek** — cards don't show whether a verb is regular or irregular, so you
  can guess first. The conjugation table opens only when you press the small button, and shows the
  verb type inside (e.g. "Regular -er", "Irregular · conjugates like venir", "Reflexive").
- **Foldable Browse section** — every verb grouped by lesson, with present-tense tables, past, future,
  example sentences, pronunciation tips, and Regular / Irregular / Reflexive badges.
- **Learn → Practice → Quiz flow** — each lesson guides you through three steps: Browse the tables,
  Practice conjugations, then take a Quiz (pass at 80% to complete the lesson).
- **Review my mistakes** — items you got wrong come back until you answer them correctly three times.
- **Progress** with Export / Import — stats, mastery rings, 7-day goal chart, and backup to a JSON
  file so you can move your progress between browsers.
- **Topics modules** — grammar lessons with exercises: Asking Questions and Reflexive Verbs, each
  with six short lessons, multiple-choice, fill-in-the-gap and rewrite drills.
- **Voice Settings** — choose between the recorded synthetic voice, your device's French voice, and
  native-speaker word clips; adjust the speech rate.

## Printable materials

These PDFs are in the repo and served from the site:

| File | Contents |
|---|---|
| [25-most-common-french-verbs.pdf](25-most-common-french-verbs.pdf) | Reference guide for lessons 1–5 (25 verbs) |
| [french-verbs-workbook.pdf](french-verbs-workbook.pdf) | Workbook with answer key for lessons 1–5 |
| [100-more-common-french-verbs.pdf](100-more-common-french-verbs.pdf) | Reference guide for lessons 6–25 (100 verbs) |
| [100-more-french-verbs-workbook.pdf](100-more-french-verbs-workbook.pdf) | Workbook with answer key for lessons 6–25 |
| [topics/01-asking-questions.pdf](topics/01-asking-questions.pdf) | Topic guide: Asking Questions |
| [topics/01-asking-questions-workbook.pdf](topics/01-asking-questions-workbook.pdf) | Workbook: Asking Questions |
| [topics/02-reflexive-verbs.pdf](topics/02-reflexive-verbs.pdf) | Topic guide: Reflexive Verbs |
| [topics/02-reflexive-verbs-workbook.pdf](topics/02-reflexive-verbs-workbook.pdf) | Workbook: Reflexive Verbs |

## Audio

Three layers, selectable in Settings → Voice:

1. **Pre-recorded synthetic voice (default)** — 1,604 phrases generated with the open-source
   Qwen3-TTS 1.7B Base model (`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16`, Apache-2.0). One
   consistent designed voice (not a real person's voice). Covers every present-tense form, past,
   future, example sentences and topic answers. The Credits view has a download link for the
   native-speaker recordings zip.

2. **869 Lingua Libre native-speaker clips** — recorded by volunteer native French speakers on
   [Lingua Libre](https://lingualibre.org/) / Wikimedia Commons, under CC0, CC BY, or CC BY-SA
   licences. A smaller "Word" button plays the single verb form; the main Listen button uses the
   voice above. Full attribution is in `verb-trainer/audio/CREDITS.md`.

3. **Device voice fallback** — your browser's built-in French voice, used when a clip is not
   available or when you choose it in Settings.

## Explain feature

Paste any French sentence or short paragraph and get:

- an English translation
- a word-by-word chunk breakdown with English glosses and parts of speech
- grammar notes (tenses, agreement, negation…)
- verbs checked against the 125-verb tables (regular/irregular badge, pronunciation guide)
- Listen buttons that use the voice from your Settings

**Why it needs a local AI:** to keep your text private, Explain sends it only to Ollama running on
your own computer — nothing leaves your machine.

### Setup

1. Install [Ollama](https://ollama.com) and open the app.
2. Run `ollama pull mistral` in Terminal (downloads ~4.4 GB, done once).
3. Clone this repo and start the helper:
   ```sh
   cd explainer && ./start.sh
   ```
4. Open the address the helper prints in your browser (e.g. `http://127.0.0.1:8775/trainer/`).

> **Note:** AI-generated content may contain errors — tenses can be mislabelled, lemmas invented.
> Every result says "AI-generated — may contain errors". Verb facts are cross-checked against the
> guide and disagreements are shown as "Check:" lines.

## Running the tests

Requires Node.js 18+ (21+ for the explainer tests).

```sh
# Verb trainer unit tests
cd verb-trainer && node --test tests/*.test.js

# Explainer unit + integration tests
cd explainer && npm test
```

## Regenerating audio

See [tts-tools/README.md](tts-tools/README.md). The short version: activate the Python venv and run
`python generate.py` from the `tts-tools/` folder. Only missing or changed texts are generated;
the process is incremental.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to sync from source, run the tests, and submit
changes.

## Licences and credits

- **Code** — MIT licence (see [LICENSE](LICENSE)). Copyright © 2026 Avtar Singh.
- **Written content** (guides, workbooks, topic lessons) — CC BY-SA 4.0 (see
  [LICENSE-CONTENT.md](LICENSE-CONTENT.md)). Copyright © 2026 Avtar Singh.
- **Lingua Libre native-speaker clips** — CC0, CC BY 4.0, CC BY-SA 3.0, or CC BY-SA 4.0 per clip,
  as recorded by volunteer contributors. Full attribution in
  [verb-trainer/audio/CREDITS.md](verb-trainer/audio/CREDITS.md).
- **Synthetic voice clips** — Apache License 2.0, generated with the open-source model
  `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16` (Qwen3-TTS 1.7B Base, Qwen team / Alibaba Cloud).
  These clips are **not** a recording of any real person's voice. Details in
  [verb-trainer/audio/tts/qwen3-fr-bf16/CREDITS.md](verb-trainer/audio/tts/qwen3-fr-bf16/CREDITS.md).
- **Lucide icons** — ISC licence, bundled as an inline SVG sprite
  (`verb-trainer/licenses/LUCIDE-LICENSE.txt`).
