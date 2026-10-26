# Learn French for Beginners

A free, open-source French learning suite for English speakers. It covers 125 common French verbs
across 25 lessons, with flashcards, conjugation practice, quizzes, grammar topic lessons, an
AI-powered Explain feature, printable guides and workbooks, and high-quality synthetic voice plus
native-speaker audio clips.

## Live demo

[https://asmehra95.github.io/learn-french-for-beginners/](https://asmehra95.github.io/learn-french-for-beginners/)
<!-- TODO: update username if different -->

## Three ways to use it

1. **Hosted site** — open the link above. No install, no account. Everything works except Explain
   (which needs a local AI for privacy; see the Explain section below).

2. **Download / clone and open offline** — clone the repo or download a ZIP, then open
   `verb-trainer/index.html` directly in Chrome, Safari, Firefox or Edge. Keep the `verb-trainer/`
   folder intact; everything except Explain works without an internet connection.

   ```sh
   git clone https://github.com/asmehra95/learn-french-for-beginners.git
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
- **Grammar tables** — one quick reference for articles, pronouns (including y/en and pronoun order),
  possessives, ce/cette, question words, negation, adjectives, prepositions, a verb summary (present
  endings, être verbs, future stems, the imparfait and the conditional) and numbers, dates and the time:
  41 tables in 10 categories. Each table says when to use it; every French item has a pronunciation
  and a Listen button. Searchable (`cette`, `le mien`, `quatre-vingts`), printable, and available as a
  PDF and as Markdown.
- **Everyday expressions** — 100 useful phrases in 10 themes (greetings, politeness, getting by,
  shops and restaurants, directions, small talk, opinions, plans, a few idioms such as *poser un lapin*,
  and conversation fillers). Each has a pronunciation, a natural English meaning, the literal meaning
  where it helps, its register (formal / neutral / informal, as text), an example, a note and links to
  the related verbs and grammar tables, with Listen buttons. Practise them as flashcards (French →
  English, English → French, or Listen → meaning) with the same spaced repetition as the verbs; misses
  show up in Review my mistakes and Progress has their own totals. Printable as a PDF and as Markdown.
- **Dialogues** — 20 short everyday conversations between two speakers, grouped by level (6 A1, 10 A2,
  4 B1): the café, the bakery, the market, directions, the train station, a hotel, a restaurant, clothes
  shopping, the pharmacy, the doctor's, making plans, the weekend, a phone booking, family, small talk, a
  new colleague, renting a flat, a complaint in a shop and hobbies. Each speaker has their own recorded
  synthetic voice (one female, one male per dialogue), name, avatar letter and side, so they are easy to
  tell apart without colour. Three modes: **Listen & read** (play the whole
  conversation line by line, or any single line, with the English respelling and liaisons marked ‿),
  **Role-play** (take either role and type or say your lines; natural alternatives are accepted) and a
  **Comprehension quiz** whose misses come back in Review my mistakes. Key vocabulary links to the
  verbs, expressions and grammar tables, and each dialogue explains one grammar point. The index and
  Progress show each dialogue's results. Printable as a PDF and as Markdown.
  **Stories:** *La Lettre de Lyon* (The Letter from Lyon) is a 20-episode story in 4 acts, A2 → B1
  (dialogues 21–40, listed under Stories below the everyday dialogues): Maya finds three love letters
  from 1962 in her grandmother's flat and goes looking for the man who wrote them. Each episode is a
  normal dialogue page (same three modes, two recorded voices) with "Episode n of 20", a "Story so far"
  line, Previous/Next episode links and a Next episode link in the quiz and role-play summaries. The
  Stories list shows each episode's progress, Home has a "Story: Continue: Episode n" link, search finds
  the episodes ("traboule", "Lucienne", "la lettre de lyon"), and the episode quizzes count in Progress
  (its own per-episode table) and in Review my mistakes. Printable as its own PDF and Markdown.
  *Le Café des Questions* (The Café of Questions) is a second 20-episode story, A1 → B1 (dialogues 41–60):
  in a tiny Montmartre café, Madame Rose serves you only after you answer one question. It starts genuinely
  easy (present tense, short lines) and rises to the polite conditional. Every line shows an emotion tag
  after the English, such as "(teasing)", which hides with Show English, and every episode ends with a
  *Sagesse du jour*: a real French proverb with a Listen button, its respelling, literal translation,
  meaning and English equivalent. The Stories list shows both series with their own progress and
  Continue link; Home's Story link follows the series you used most recently. Search finds the proverbs
  ("proverbe", "oiseau"). 18 of the 20 episodes have a picture under the title (with alt text), also in
  the PDF; episodes 14 and 18 have none yet.
- **Proverbs deck** — the 20 proverbs as flashcards (French → meaning, meaning → French), with the same
  spaced repetition as the expressions decks, an act filter in the practice set, Review my mistakes and a
  Proverbs block in Progress.
- **Global search** — press `/` or Ctrl/⌘+K (or the Search button; on phones, Search in the bottom
  bar) on any page to search all 125 verbs, every conjugated form (suis, j'ai, je me lève, allé,
  ferai), English meanings ("to eat"), the grammar tables ("cette", "quatre-vingts"), the everyday expressions ("excuse me", "lapin"), the dialogues ("café", "boulangerie", "dialogue") and the topic
  lessons ("quel", "est-ce que"). Accent-, case-, apostrophe- and typo-tolerant. From a result you can open the verb card, listen to the matched
  form, or go to its lesson. A verb's type only shows if you search for it ("irregular", "reflexive").
- **Foldable Browse section** — every verb grouped by lesson, with present-tense tables, past, future,
  example sentences, pronunciation tips, and Regular / Irregular / Reflexive badges. Its search box
  matches any form or meaning and always covers all lessons, also inside a lesson's Learn step.
- **Learn → Practice → Quiz flow** — each lesson guides you through three steps: Browse the tables,
  Practice conjugations, then take a Quiz (pass at 80% to complete the lesson).
- **Review my mistakes** — items you got wrong come back until you answer them correctly three times.
- **Progress** with Export / Import — stats, mastery rings, 7-day goal chart, and backup to a JSON
  file so you can move your progress between browsers.
  Opening an older cached copy of the site after using Dialogues on the same device drops your dialogue
  progress (quiz answers and role-play scores) on its first save. Reload to get the current version, or
  Export a backup first.
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
| [verb-trainer/reference/french-grammar-tables.pdf](verb-trainer/reference/french-grammar-tables.pdf) | Grammar tables quick reference (all 10 categories, 41 tables, including the imparfait and the conditional) |
| [french-grammar-tables.md](french-grammar-tables.md) | Markdown source of the grammar tables |
| [verb-trainer/reference/french-expressions.pdf](verb-trainer/reference/french-expressions.pdf) | 100 everyday expressions in 10 themes |
| [french-expressions.md](french-expressions.md) | Markdown version of the everyday expressions |
| [verb-trainer/reference/french-dialogues.pdf](verb-trainer/reference/french-dialogues.pdf) | Dialogues: all 20 conversations, with contents by level (A1, A2, B1), transcripts, pronunciation, vocabulary and answer key |
| [french-dialogues.md](french-dialogues.md) | Markdown version of the 20 dialogues |
| [verb-trainer/reference/la-lettre-de-lyon.pdf](verb-trainer/reference/la-lettre-de-lyon.pdf) | Story: *La Lettre de Lyon*, 20 episodes in 4 acts (A2–B1), with word lists, questions and answer key |
| [la-lettre-de-lyon.md](la-lettre-de-lyon.md) | Markdown version of the story |
| [verb-trainer/reference/le-cafe-des-questions.pdf](verb-trainer/reference/le-cafe-des-questions.pdf) | Story: *Le Café des Questions*, 20 episodes in 4 acts (A1–B1), with emotion tags, a Sagesse du jour proverb per episode, word lists, questions, answer key and proverb index |
| [le-cafe-des-questions.md](le-cafe-des-questions.md) | Markdown version of the café story |

## Audio

Three layers, selectable in Settings → Voice:

1. **Pre-recorded synthetic voice (default)** — 3,233 of the site's 3,242 Listen texts generated with the open-source
   Qwen3-TTS 1.7B Base model (`mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16`, Apache-2.0). One
   consistent designed voice (not a real person's voice). Covers every present-tense form, past,
   future, example sentences, topic answers, the Grammar tables (cells and examples) and all 100 everyday expressions with
   their examples. In the Dialogues each line plays in its speaker's voice: the female speakers use this
   voice, the male speakers a second designed synthetic voice (`qwen3-fr-m-bf16`). The
   Credits view has a download link for the native-speaker recordings zip. The lines, word lists and
   proverbs of *Le Café des Questions* are recorded in the same two voices (the male voice covers 379 of 379 texts).

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

## Regenerating the grammar tables
The tables live in `verb-trainer/js/reference-data.js`. Regenerate the Markdown with
`node tools/build-grammar-tables.js`; the PDF is printed from that script's `--html` output with
headless Chrome (`--print-to-pdf`).

## Regenerating the expressions
The expressions live in `verb-trainer/js/expressions-data.js`. Regenerate the Markdown with
`node tools/build-expressions.js`; the PDF is printed from that script's `--html` output with
headless Chrome (`--print-to-pdf`).

## Regenerating the dialogues
The dialogues live in `verb-trainer/js/dialogues-data.js`. Adding a dialogue needs no code: append a
record (speakers with their voice, lines with their accepted alternatives, vocabulary, questions and a
"Notice this" block); routes, the index, search, storage, Progress, Review, the audio corpus and the
printables all follow the data. Three non-code steps remain for each new dialogue:
1. Record the audio for **each voice** its speakers use: `node tts-tools/extract-corpus.js` and
   `python generate.py` for the default voice, `--voice qwen3-fr-m-bf16` for the second voice (see
   [tts-tools/README.md](tts-tools/README.md), "Multiple voices"), then commit the clips and manifests.
2. `node tools/build-dialogues.js`, which writes both `french-dialogues.md` files (and, with `--html`,
   the print HTML).
3. Print the PDF from that `--html` output with headless Chrome (`--print-to-pdf`), as for the expressions,
   then strip `/Creator`, `CreationDate` and `ModDate` from it (the tests check). Both outputs open with a
   table of contents grouped by level.

`french-dialogues.md`/`.pdf` hold the 20 everyday conversations only. The story records (those with
`series`, `episode` and `act`) are printed by `node tools/build-story.js`, one series at a time:
`node tools/build-story.js --series <id>` writes `<id>.md` at the repo root and in `verb-trainer/reference/`
(the default is `la-lettre-de-lyon`; `--all` writes every series). With `--html <file>` it also writes that
series' print HTML, which is printed to `verb-trainer/reference/<id>.pdf` with headless Chrome and the
metadata stripped the same way. Pictures are added only for the illustrated series; a series with emotion
tags prints them after the English, and a series with proverbs gets a Sagesse du jour box per episode and a
proverb index.

## Regenerating the story illustrations
The prompts, seeds and alt texts live in `tools/story-images/manifest.json`; `tools/story-images/generate.py`
calls Amazon Bedrock through the AWS CLI (Stable Diffusion 3.5 Large, or Stable Image Ultra where an entry's
`model` says so; only prompts are sent, credentials stay in the CLI profile). `generate` writes PNGs to a
folder outside the repo, `tools/story-images/retouch.py --src DIR` applies the two small retouches (ep16,
ep18) the manifest marks with `raw_suffix`, `webp` writes the 1200×686
(cover 960×1200) WebPs to `verb-trainer/images/story/` without metadata, `site` writes
`verb-trainer/js/story-images.js` (file, size and alt text per episode) and `printjpg` makes the JPEG copies
that `node tools/build-story.js --html out.html --print-images DIR` embeds in the story PDF. Images marked
`"published": false` are skipped (none at the moment: the cover and all 20 episodes are published; episode 8 is
M. Brun alone, made with Stable Diffusion 3.5 Large).

The *Le Café des Questions* pictures (`verb-trainer/images/story/cafe-epNN.webp`) were made with
Qwen-Image-Edit-2511 (Apache-2.0), run on the author's own AWS GPU with the gpu-batch kit, not with
`generate.py generate`. Their prompts, seeds, cast-sheet hashes and model revision are in
`tools/story-images/manifest-cafe.json`; episodes 1, 3, 5, 11, 14, 15, 18 and 20 were regenerated later with
stricter prompts (episode 20 as a multi-image edit), and their entries record the batch, seed and refs used.
All 20 episodes are published, and 40 scene pictures (`cafe-epNN-iK.webp`) sit between dialogue lines.
The *Le Mauvais Colis* pictures (`colis-epNN[-iK].webp`, manifest `tools/story-images/manifest-colis.json`) were
made the same way: 20 episode pictures and 39 scene pictures (`colis-ep07-i2` had no passing take).
From the chosen 1344×768 PNGs (`cafe-epNN__s<seed>.png` in one folder), `generate.py --manifest
tools/story-images/manifest-cafe.json webp --src DIR` and `… printjpg --dest DIR` work as above; `site` reads
every manifest and writes one `series` table per story into `story-images.js`.

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
- **Second synthetic voice (Dialogues)** — Apache License 2.0, the same Base model with a second voice
  designed from a French text description (Qwen3-TTS VoiceDesign); used for some dialogue speakers. It is
  not a recording or clone of any real person. Details in
  [verb-trainer/audio/tts/qwen3-fr-m-bf16/CREDITS.md](verb-trainer/audio/tts/qwen3-fr-m-bf16/CREDITS.md).
- **Lucide icons** — ISC licence, bundled as an inline SVG sprite
  (`verb-trainer/licenses/LUCIDE-LICENSE.txt`).
- **Story illustrations** (*La Lettre de Lyon*, `verb-trainer/images/story/`) — separate terms, not
  CC BY-SA: AI-generated with Stability AI models via Amazon Bedrock (Stable Diffusion 3.5 Large and
  Stable Image Ultra); character designs by the project author. Governed by the Stability AI Amazon
  Bedrock EULA and the AWS Service Terms (not the Stability Community License): the author owns the
  outputs as far as the law allows, public and commercial sharing is not restricted, no attribution is
  required, and outputs must not mislead, infringe others' rights or break the law. They are published
  publicly with the site on GitHub Pages. Summary and what was verified in
  [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
- **Story illustrations** (*Le Café des Questions*, `verb-trainer/images/story/cafe-ep*.webp`) — separate
  terms, not CC BY-SA: AI-generated with Qwen-Image-Edit-2511 (Apache-2.0), run on the author's own AWS GPU;
  character designs by the project author. The Apache License 2.0 covers the model, not the pictures. They
  are published publicly with the site on GitHub Pages. Details in [LICENSE-CONTENT.md](LICENSE-CONTENT.md).
