# Learn French for Beginners

A small offline website for learning 125 common French verbs in 25 lessons, lesson by lesson, plus grammar topic lessons (asking questions, reflexive verbs).

## Two ways to open the site

1. **Double-click `index.html`** (or drag it into Chrome, Safari, Firefox or Edge). Nothing needs to be installed and no internet connection is required: every file the site uses (scripts, styles, audio, icons) is in this folder. Everything works this way **except Explain**, which shows how to start the helper instead. Keep the folder together (`index.html` needs the `css/`, `js/`, `audio/` and `licenses/` folders next to it). The Topics pages link to the printable guides and workbooks in `../topics/`.
2. **Through the local helper**, which you need for Explain. In Terminal:

   ```sh
   cd explainer && ./start.sh  # from the repo root
   ```

   Then open the address it prints, `http://127.0.0.1:<port>/trainer/` (add `--open` to `./start.sh` and it opens the Explain page for you). The port is chosen automatically: the helper tries 8765 first and, if something else already uses it, takes 8775 or the next free port and says so (`Port 8765 is busy, using 8775.`). On this Mac 8765 is taken by another app, so expect 8775. After that the helper remembers its port (in `explainer/.last-port`) and uses the same one next time when it is free, so your progress stays at the same address. The helper needs Ollama with the `mistral` model running; see `../explainer/README.md`.

The helper serves this folder read-only on 127.0.0.1 only. It has no login, so don't expose it beyond your own computer.

## Views

- **Home**: today's suggestion ("Today"), your daily goal and day streak, how many items are waiting in Review, every lesson as a card with a progress ring, and the topic lessons.
- **Lesson path** (`#lesson/<n>`): each lesson walks you through three steps, **Learn → Practice → Quiz**, with a "Recommended next" marker and the patterns the lesson's verbs share.
- **Learn** (Browse): every verb grouped by lesson, with the present-tense table (stems and endings marked), past, future, example sentence, pronunciation, tips and a **Regular / Regular (spelling change) / Irregular** badge, plus a separate **Reflexive** badge for pronominal verbs. Search by infinitive, any form (`prennent`, `j'ai`) or English meaning, or jump to a lesson. In a lesson's Learn step the search still covers all lessons; clearing it shows that lesson again.
- **Search** (`/` or Ctrl/⌘+K anywhere outside a text box, the Search button in the header, or Search in the bottom bar on phones): one box for all verbs and the topic lessons. It finds infinitives (`se lever`, `s'appeler`), every present-tense form with or without the pronouns (`suis`, `je suis`, `j'ai`, `me lève`, `nous nous levons`), the past participle and phrase (`allé`, `je suis allé`), the future form in the tables (`ferai`), English meanings (`to eat`, `eat`), lesson numbers (`lesson 3`), example sentences and topic-lesson titles and lines (`quel`, `est-ce que`). Accents, capitals and straight or curly apostrophes don't matter, results update as you type, and one typo is forgiven in words of four letters or more. Ranking: exact infinitive, then exact form, English meaning, beginnings of words, near misses, and example sentences last. Each verb result shows the infinitive, the meaning, why it matched (for example "je suis · present, 1st person singular") and the lesson, with **Listen** (the matched form, recorded voice first, then the device voice) and **Go to lesson**; choosing the result opens the verb card. Results are grouped into Verbs, Tables, Expressions and Topics, 20 verbs and 5 of each of the others shown with "Show all". Searching a grammar word (`cette`, `le mien`, `celui`, `quatre-vingts`, `au`, `y`) adds a **Tables** group that opens the right table; Tables comes first (so Enter goes there) when a table matches a keyword or a whole row exactly and no verb matches as strongly, so `du` still shows *devoir* first. English or French phrases (`excuse me`, `hate`, `lapin`, `addition`, `en avoir marre`) add an **Expressions** group; it comes first when an expression matches its French, a keyword or its whole English exactly and no verb form matches as strongly. Like the flashcards, results never show a verb's type unless you search for one by its full name (`irregular`, `regular`, `spelling change`, `reflexive`, optionally followed by "verbs"); a partial word such as `refl` is searched as an ordinary word. Arrow keys move through the results, Enter opens one, Escape closes. On phones it opens as a full-screen sheet.
- **Practice** hub: Flashcards, Conjugate, Sentences and Multiple choice, each limited to a **Practice set** (tick whole lessons or single verbs; the lesson list folds so all lessons fit).
  - **Flashcards**: three decks (infinitive → meaning, meaning → infinitive, pronoun + verb → conjugation). The cards don't show whether a verb is regular or irregular, so you can guess it first. To check, press the small **Conjugation** button: it opens the present-tense table with one quiet line above it giving the type (for example "Irregular · conjugates like venir", "Regular -er · spelling change (g→ge before o)", "… · Reflexive"). The table opens only from that button, not on hover. Escape, the close button or a click outside closes it. On the meaning → infinitive and conjugation decks the button appears after you flip, because the table would give the answer away. Flip with Space (or the Show answer button), then "I knew it" or "Not yet".
  - **Conjugate**: type the present-tense form, for example `nous · (parler)`. `parlons` or `nous parlons` both work. For reflexive verbs the reflexive pronoun is part of the answer: `je me lève` or `me lève`, not `lève`. *falloir* and *pleuvoir* are only asked in the *il* form.
  - **Sentences**: fill in the missing verb form in the example sentence.
  - **Multiple choice**: conjugations, meanings, blanked sentences and *être* or *avoir*.
- **Review my mistakes**: everything you got wrong that you haven't since answered right three times in a row, as one session. Also reachable per lesson and for "mistakes from your last session".
- **Topics**: grammar lessons beyond single verbs. Each topic has six short lessons with what-you'll-be-able-to-do lists and checkable exercises (multiple choice, fill in the gap, rewrite). Rewrite drills that ask for several registers (casual / est-ce que / inversion) have one box per register and each box is checked on its own. Accepted alternatives are shown with the answer. An exercise counts as done once you score 80% or more; your best score is kept. Exercise ids match the paper workbooks.
  Links from the explainer use `#topic/<topic>/<lesson>` (for example `#topic/reflexive/R2`); the site treats that as an alias and rewrites the address to `#topics/reflexive/R2`. A finished exercise's "To review" list shows the question, the answer and what you wrote.
- **Everyday expressions** (`#expressions`, `#expressions/<theme>`, `#expressions/<theme>/<id>`; top menu Phrases, More → Everyday expressions on phones, a card on Home and in the Practice hub): 100 phrases in 10 folding themes. Each card shows the French, its register as a text pill (Formal, Neutral, Informal), the respelling with **Listen**, the English, the literal meaning where it helps, an example with its own **Listen**, a note and "See also" links to verbs, grammar tables and related expressions. Phrases with a "…" gap (*Je voudrais…*) speak a filled-in example (*Je voudrais un café.*). There are links to the printable PDF (`reference/french-expressions.pdf`) and the Markdown (`reference/french-expressions.md`), and **Print** prints just this view.
- **Expression flashcards** (`#flashcards/expressions`, `#flashcards/expressions/<theme>`, or the Expressions group of the Flashcards deck menu): three decks, **French → English**, **English → French** (the front shows the register and, for near-synonyms such as *pardon* / *excusez-moi*, a short situation cue) and **Listen → meaning** (press Listen or L; after you grade a card the next one plays once by itself). Same buttons and keys as the verb cards (Space/F to flip, 1 Not yet, 2 I knew it) and the same spaced repetition. In the practice set (Flashcards and the Practice hub) an **Expression themes** box picks which themes the expression decks use. Missed expressions come back in **Review my mistakes** as four-option questions; **Progress** has an Expressions block (answers, accuracy, cards mastered out of 300) and accuracy per theme.
- **Grammar tables** (`#tables`, `#tables/<category>`, `#tables/<category>/<table>`; top menu Tables, More → Grammar tables on phones, a card on Home, and the first link in the header's Reference dialog): a quick reference in ten categories — articles, pronouns, possessives, demonstratives, questions, negation, adjectives, prepositions, a verb summary (present, être verbs, future, imparfait, conditional; linking to Learn, not repeating the tables) and everyday basics (numbers, days, months, the time). Each category folds open; each table says when to use it, then lists every French item with its pronunciation, its English and, where it matters, gender and number as text (m., f., pl.), with a **Listen** button on every French cell, two to four examples, and a **Watch out** note with the usual mistakes. Tables marked **Preview** go a little beyond A2 (pronoun order, celui, lequel). Wide tables scroll sideways inside a labelled region on a phone. **Print** prints just the tables (every category opens for printing, and the site chrome is hidden); **Pronunciation key** opens the Reference dialog; there are links to the printable PDF (`reference/french-grammar-tables.pdf`) and the Markdown (`reference/french-grammar-tables.md`). Rows for verbs link to the verb card, and categories link to the related topic lessons.
- **Dialogues** (`#dialogues`, `#dialogues/<id>`, `#dialogues/<id>/roleplay`, `#dialogues/<id>/quiz`; top menu Dialogues, More → Dialogues on phones, a card on Home): 20 short conversations between two speakers, from *Au café* (1) to *Les loisirs* (20). The index groups them by level, A1 · Beginner (1–6), A2 · Elementary (7–16) and B1 · Intermediate (17–20), with a level filter (All · A1 · A2 · B1, "Showing n of 20 dialogues") and an overall line ("3 of 20 started"); the Home card links to the first dialogue not yet listened or quizzed ("Continue: …"). Every card shows that dialogue's progress (best quiz score, best role-play score per speaker, listened, or "Not started"). Each line shows the speaker's name, role and initial, sits on that speaker's side and has its own **Listen** in that speaker's voice: every dialogue has one female speaker, who uses the usual recorded voice, and one male speaker, who uses a second synthetic recorded voice (in *Au café*, the server Julien is male and the customer Camille female); a speaker whose clip is missing uses the device voice, never the other speaker's voice. Under each line are the respelling (‿ marks a liaison) and the English (Show English hides it). Three modes: **Listen & read** (Play all plays the lines in order with a short pause, Pause/Resume and Stop; the line playing is marked "Now playing"; the key vocabulary links to verbs, expressions and grammar tables; "Notice this" explains one grammar point), **Role-play** (choose a role, type your lines or say them and mark yourself; the other speaker's lines play automatically if you want; natural alternatives and, with Accent-tolerant on, missing accents are accepted; the summary has Swap roles and Try again) and the **Comprehension quiz** (multiple choice; misses come back in Review my mistakes with the dialogue named). Role-play results count towards the daily goal but don't go to Review. Progress has a Dialogues block with a row per dialogue, in level order (listened, best role-play score per speaker, best quiz score); the quiz answers of all 20 dialogues (80 questions) count in its totals and in Review my mistakes. Search covers every dialogue (titles, keywords, vocabulary, lines and scene) and shows each result's level. There are links to the printable PDF (`reference/french-dialogues.pdf`) and the Markdown (`reference/french-dialogues.md`). **Stories:** below the level groups, a Stories section lists *La Lettre de Lyon*, a 20-episode story in 4 acts (A2 → B1, dialogue numbers 21–40), with its cover picture: a Start / Continue / Read again link to the first episode not yet started, "n of 20 episodes started", links to its own printable (`reference/la-lettre-de-lyon.pdf`, `reference/la-lettre-de-lyon.md`) and, per act, the episodes with a small thumbnail and their progress. Episode pages (`#dialogues/lyon-01-moving-in` …) are ordinary dialogue pages plus a picture under the title (19 of the 20 episodes; each has alt text), "Episode n of 20 · Act k", a "Story so far" recap (from episode 2), Previous / Next episode links and a Next episode link in the quiz and role-play summaries; the back link reads "All episodes". The level filter and the "n of 20" counts cover the 20 everyday dialogues only. Home adds a "Story: Continue: Episode n · …" link, Progress has a second table with a row per episode, the episode quizzes count in the Dialogues totals and in Review my mistakes (named "La Lettre de Lyon, episode n"), and search shows story results as "Story: La Lettre de Lyon · Episode n of 20".
- **Explain** (`#explain`, top menu or More → Explain a sentence, and a card on Home): paste a French sentence or a short paragraph and get the English translation, a chunk-by-chunk breakdown with the grammar explained, the verbs checked against this site's verb tables (with links to the verb and topic pages), and Listen buttons that use the voice and rate from Settings (changes apply straight away). It runs on this Mac with the Mistral model through the local helper, so it only works when the site is opened through the helper (see above). Opened as a file, the page shows the command to start the helper, a Copy command button and the helper addresses, and makes no network requests.
- **Progress**: totals, a 7-day chart, per-lesson rings ("x of y items mastered"), topic-lesson progress, accuracy per verb, and **Back up or move your progress** (Export / Import).
- **Credits**: who recorded the native-speaker audio, with licences and sources, and the icon licence.

## Sessions, hints and the spaced repetition

Practice runs in short **sessions** (5, 10, 15 or 20 questions, set in Settings; the lesson path's Practice and Quiz steps use 10). A session ends with a summary: score, daily-goal count and a "To review" list with Listen buttons. Questions you get wrong come back more often; ones you know come back less often (Leitner boxes). An item counts as **mastered** after three correct answers in a row. The lesson Quiz is passed at 80%.

Typed questions have up to two **hints** (first the first letter and the length, then the stem and the ending pattern). A correct answer after a hint counts as correct for your score and streak, but the item does not move up a box, so it comes back soon. **Show answer** counts as a wrong answer.

## Keyboard shortcuts

Press `?` (outside a text box) to see this list in the site. Single-key shortcuts can be turned off in Settings.

| Key | Where | Action |
|---|---|---|
| Enter | Typed questions | Check; after checking, next question |
| Enter | Multiple choice | Check the selected option, or next after checking |
| 1 – 4 | Multiple choice | Pick option 1–4 and check it |
| Space or F | Flashcards | Flip the card |
| 1 / 2 | Flashcard back | Not yet / I knew it |
| H (Alt+H in a text box) | Typed questions | Hint |
| L (Alt+L in a text box) | Any practice page | Listen to the current item |
| S (Alt+S in a text box) | Typed questions | Show the answer |
| N or → | After answering | Next question |
| / or Ctrl+K (⌘+K on a Mac) | Anywhere outside a text box | Search verbs, tables and topics |
| ↑ / ↓, Enter | Search | Move through the results, open one |
| ? | Anywhere outside a text box | Open the list |
| Esc | Dialogs and search | Close |

Everything also works with Tab, Shift+Tab, Enter and Space. A **Skip to main content** link is the first Tab stop.

## Themes

The header's **Theme** button cycles System → Light → Dark (also under Settings → Appearance). System follows your computer's light or dark mode. Both themes keep text contrast at WCAG AA, and animations are switched off when your system asks for reduced motion.

## Accents

- **Accent buttons** under each answer box insert é è ê ë à â ç î ï ô û ù œ and ' where the cursor is. With the keyboard, Tab to the toolbar and use the arrow keys to move between letters. In Topics, the toolbar types into whichever box you used last.
- **Accent-tolerant** (on by default) accepts answers typed without accents, such as `connait` for `connaît`, and then shows you the correct spelling. Turn it off to require exact accents. The setting is remembered.

## Listening

### Recorded voice (default)

**Listen** now plays a **recorded voice** first: a natural-sounding French clip of the full phrase ("vous avez", "j'ai", "je me lève", every example sentence and topic answer, and the Grammar tables: each table word and example), made in advance and shipped in `audio/tts/qwen3-fr-bf16/`. The voice is **synthetic**: it was generated on this Mac with the open text-to-speech model Qwen3-TTS 1.7B (Apache-2.0), using one designed voice (no real person was cloned). The Listen button is outlined in blue when it will play a recording, and the message at the bottom of the screen says "Recorded voice (synthetic)".

- The order is: (1) the recorded clip for exactly that text, (2) otherwise the **device voice**, the computer voice described below, exactly as before. Texts without a clip (and any clip that fails to load) fall back to the device voice automatically. The "Native speaker (word only)" button is unchanged.
- **Settings → Voice → Listen plays**: **Recorded voice (recommended)** or **Device voice** (everything with the browser's computer voice, as in earlier versions). The choice is saved with your other settings (a new `voiceSource` field in schema version 2; older saved progress and export files get the recorded voice).
- **Dialogues** use a second recorded voice (a synthetic male French voice, `audio/tts/qwen3-fr-m-bf16/`) for the male speaker of each dialogue, so you can tell who is talking; Settings → Voice says so under the choice. With Device voice on, every speaker uses the device voice. Everything outside the Dialogues uses the first voice. Both voices are synthetic: neither is a recording or a clone of a real person.
- The **speech rate** applies to the recordings too: at 0.85× they play at their natural speed, slower or faster rates change their playback speed (pitch is kept).
- The **Explain** page always uses the device voice: its text is written on the fly by the helper, so it can't be recorded in advance. The page says so.
- Works the same opened as a file and through the helper (the clips are ordinary same-folder MP3 files, so the Content-Security-Policy is unchanged). After adding new clips, restart the helper so it serves them.

Where the rest of this section says "computer voice", it applies to texts without a recording, or to everything when Device voice is chosen.

To add or regenerate recordings after the verb, topic or Grammar tables data changes, see `../tts-tools/README.md` (`python generate.py` only makes the clips that are missing or whose text changed; it checks each clip with speech recognition and lists doubtful ones on a review page). The recorded voice's credits are in `audio/tts/qwen3-fr-bf16/CREDITS.md` and the Credits view.

### Computer voice and native recordings

Every **Listen** button speaks the **full phrase** with your browser's **computer voice** (the voice you pick in Settings → Voice), so you always hear the pronoun and the liaison: "vous avez", "j'ai", "je me lève". When a native-speaker recording is bundled for that form, a smaller button sits next to Listen: **Native speaker** ("Native" in tables) when the recording says the full phrase, or **Native speaker (word only)** ("Word") when it says only the verb form ("avez", "crois"). Listen itself stays the computer voice. A small message at the bottom of the screen says which one you heard. If your browser has no computer voice at all, Listen plays the recording instead and says whether it is word only.

<!-- native-audio:start (generated by tts-tools/native-audio/fetch-lingualibre.mjs) -->
Native recordings come from [Lingua Libre](https://lingualibre.org/) volunteers via Wikimedia Commons: 869 recordings by 24 speakers, about 8.5 MB in total, under CC BY 4.0, CC BY-SA 3.0, CC BY-SA 4.0, CC0. Coverage per lesson range ("full-phrase clips" include the pronoun):

| Lessons | Infinitives | Present forms | Full-phrase clips | Past | Future | Sentences |
|---|---|---|---|---|---|---|
| Lessons 1–5 | 25 / 25 | 147 / 150 | 33 | 24 / 25 | 0 / 25 | 0 / 25 |
| Lessons 6–10 | 25 / 25 | 139 / 145 | 26 | 25 / 25 | 0 / 25 | 0 / 25 |
| Lessons 11–15 | 25 / 25 | 138 / 150 | 25 | 24 / 25 | 0 / 25 | 0 / 25 |
| Lessons 16–20 | 25 / 25 | 131 / 150 | 26 | 24 / 25 | 0 / 25 | 0 / 25 |
| Lessons 21–25 | 25 / 25 | 71 / 145 | 27 | 21 / 25 | 0 / 25 | 0 / 25 |
| All lessons | 125 / 125 | 626 / 740 | 137 | 118 / 125 | 0 / 125 | 0 / 125 |

The 698 recordings added after the first download (Lessons 1–5) were trimmed of silence and loudness-normalised with ffmpeg. The topic lessons use the computer voice only. Full attribution is in the Credits view and in `audio/CREDITS.md`. The Credits view also has a **Download native recordings (.zip)** link (`audio/downloads/native-recordings.zip`: every clip plus CREDITS.md and the licence terms; the synthetic recorded voice is not included). To fetch more recordings, run `../tts-tools/native-audio/update-native-audio.sh`.
<!-- native-audio:end -->

### Choosing the computer voice

Open **Settings** (header button, or More → Settings on a phone) and use the **Voice** section. The header shows the current voice next to the Settings button.

- **Computer voice** lists every French voice your browser offers, by region and quality, for example "Amélie — French (Canada) · Premium" or "Thomas — French (France)". **Automatic** picks the best one for you: a Premium or Enhanced French (France) voice first, then a Premium or Enhanced voice from any region, then a standard French (France) voice (novelty voices such as Grandma or Rocko are skipped).
- **Speech rate** goes from 0.6 (slow) to 1.2 (fast). The default is 0.85.
- **Preview** says "Bonjour, nous avons deux frères." with the current voice and rate.
- **Show native-speaker word recordings** (on by default; this replaces the old "Prefer native recordings" setting and keeps your saved choice). Turn it off to hide the "Native speaker (word only)" buttons.
- **Play the correct answer after a mistake** (in Settings → Practice, off by default).

Your choices are remembered. If the voice you picked is not available later (another browser, or the voice was removed), the automatic choice is used until it comes back. A Canadian voice such as Amélie has a Québec accent; a note says so, because the pronunciations in this guide follow France French.

### Getting a better French computer voice on a Mac

For the most natural sound, install a **Premium** or **Enhanced** French (France) voice: **System Settings → Accessibility → Spoken Content → System Voice → Manage Voices**, open French, tick a French (France) voice marked Premium or Enhanced, wait for the download, then reload the page and pick it in Settings → Voice.

Chrome may not list every macOS Premium voice. Safari usually does, so if a voice you installed is missing from the list, open the trainer in Safari.

## Your progress

Progress and settings are saved in this browser only (localStorage key `verbTrainer.v1`, schema version 2). Opening the site in a different browser or on another computer starts fresh. Expression flashcards add two fields without a schema change: their stats live in the same map under `expr:<id>|<deck>|-` keys, and `settings.selectedExpressionThemes` holds the chosen themes (older saves and exports load with all themes selected). An older copy of the site opened on the same address drops the `expr:` stats the next time it saves. Opening an older cached copy of the site after using Dialogues on the same device drops your dialogue progress (quiz answers and role-play scores) on its first save. Reload to get the current version, or Export a backup first. Dialogues add two fields the same way: `state.dialogues` (listened, best quiz score, best role-play score per speaker) and `settings.dialogueShowEnglish`; the quiz answers live in the stats map under `dlg:<dialogue>.<question>|dlg-quiz|-` keys. To start over, open **Progress** and press **Reset progress**. If the browser blocks storage for local files, the site still works but forgets your progress when you close it, and a notice says so.

**Progress is kept per address.** The browser stores progress separately for the double-clicked file (`file://…`), for the helper's address (`http://127.0.0.1:8775/trainer/`), and for each helper port (8765 and 8775 count as different sites). The helper reuses the port from last time to keep the address stable. When the helper's address has no progress yet, a small note on the page says so and links to the import button; close it with its × button and it stays closed for that address. To move your progress from one to the other:

1. Open the version that has your progress, go to **Progress → Back up or move your progress** and press **Export progress**. A file named `french-verb-trainer-progress-YYYY-MM-DD.json` lands in Downloads.
2. Open the other version, go to the same panel and choose that file under **Import progress from a file**.
3. Confirm the question. Your progress in that browser is replaced by the file's progress.

Import accepts only files made by Export (up to 1 MB). The file is read as JSON and every field is checked and cleaned the same way stored progress is; anything else is refused with a message and nothing changes.

**Upgrade from the first version.** The first time this version opens, it upgrades your saved progress in place (answers, accuracy, streaks and per-verb stats are unchanged) and keeps an untouched copy of the old data under the key `verbTrainer.v1.backup`. Lesson percentages may drop by a point or two after the upgrade, because each verb gained an *être or avoir* question (for example 23 of 115 items mastered, 20%, becomes 23 of 120, 19%).

To restore the old data by hand: open the browser's developer console on the trainer page and run

```js
localStorage.setItem("verbTrainer.v1", localStorage.getItem("verbTrainer.v1.backup"));
```

then reload. It is upgraded again on load. Reset progress never removes the backup.

## Extending: AI evaluation

No AI evaluator ships. `js/dialogues.js` has an inert registry, `VT_DLG.evaluators` (`register`, `list`, `available`, `validateResult`), so a later "Evaluate with AI" button for role-play can plug in without rework. An evaluator is `{ id, label, isAvailable(env), evaluate(request) }`; `env` is `{ protocol, method }`, the request carries the dialogue, line, speaker, level, the expected line, the accepted alternatives, the English and the learner's typed text (or a recorded audio blob), and the result is `{ verdict: "correct" | "close" | "incorrect", feedback, suggestion?, transcript? }`, rendered as text only and never changing what is recorded. The slot in the role-play turn appears only when an evaluator is available. The intended plug-in would call the local helper (same origin, so the Content-Security-Policy already allows it) and only over `http:` with the helper running, so the file:// copy and GitHub Pages never make a request. The helper listens on 127.0.0.1 only and has **no authentication**: any new endpoint must keep that binding, check `Origin`/`Host`, cap the body size and be documented as local-only.

## Where the content comes from

- `js/data.js` is generated from `../25-most-common-french-verbs.md` (lessons 1–5) and `js/data-100.js` from `../100-more-common-french-verbs.md` (lessons 6–25), so the website, the reference PDFs and the workbooks use the same verb tables. `js/verb-types.js` holds the Regular/Irregular category and the reflexive flag for all 125 verbs, and `js/merge-data.js` joins the files when the page loads. Do not edit these files by hand.
- `js/topics-data.js` holds the topic exercises exported from the topic workbooks (`../topics/`). The site copy carries a few small review corrections, noted in its header.
- `js/audio-manifest.js` and the `audio/` folder were generated by `../tts-tools/native-audio/fetch-lingualibre.mjs` (see its README); the first 25 verbs came from an earlier run of the same approach.
- `js/verb-meta.js` holds the derived teaching data (ending families, hints).

### Data contract for future verbs

Anything that adds verbs must keep to these rules (design §8.0):

1. `lessons[]` entries have a numeric `id` unique across all files, a `title` and `verbIds[]`. Ids need not be contiguous; the site shows "Lesson {id}".
2. `verb.present` has 1 to 6 rows, each with a unique `person` from `1s 2s 3s 1p 2p 3p`, in that order. Impersonal verbs have one `3s` row with pronoun `il`.
3. `row.pronoun` is the subject (`je`, `j'`, `tu`, `il/elle`, `il`, `nous`, `vous`, `ils/elles`), optionally followed by a space and a reflexive part (`me te se nous vous m' t' s'`); `row.form` is the verb word only; `row.french` is the full string.
4. `sentence`, `past`, `future` and `tips` are optional; questions that need a missing field are skipped.
5. `verb.type` (optional) is the guide's `Type:` line, for example "Irregular (conjugates like venir)" or "Regular (-er, spelling change: e→è), Pronominal".
6. A verb's lesson is the lesson that lists it in `verbIds` (`verb.lesson` is not read). Verb ids are unique, lowercase, accent-free slugs (`se-lever`, `s-asseoir`).

## Running the tests

With Node.js 18 or later, from this folder:

```sh
node --test tests/*.test.js
```

The tests cover the answer checking, the mistake classifier, stems and endings for all 125 verbs, sessions, streaks and the daily goal, the storage upgrade, the merged data (125 verbs, 25 lessons, type badges), the topic exercise grading, the routes (including `#explain` and the `#topic` alias) and the progress Export/Import checks.

`tests/search.test.js` covers the global search: forms, meanings, accents, apostrophes, typos, type and topic queries, ranking, coverage of all 125 verbs and that results never reveal a verb's type unless asked.

`tests/tts.test.js` covers the recorded voice: text normalization, the clip lookup, the Listen order (recording, then device voice, including when a file fails), and that every Listen text on the site either has a clip on disk or is listed as excluded in `audio/tts/qwen3-fr-bf16/manifest.json`. It also checks the end signal that hides the audio message.

`tests/audio-status.test.js` covers when the audio message hides (after the end, safety timeout, new Listen, hover/focus, Escape). `tests/cache-busting.test.js` covers the `?v=__BUILD__` asset URLs, the deploy stamp in `pages.yml` and `js/build-check.js`.

## Security

The page's Content-Security-Policy allows only this site's own scripts, styles, images and audio. `connect-src 'self'` lets the Explain view talk to the helper that served the page, and nothing else. Opened as a file, the site makes no network requests at all (the explainer module is never started). `js/explainer.js` and `css/explainer.css` are exact copies of the files in `../explainer/`; copy them again after changing the originals (a test in `../explainer/tests/site-copy.test.js` checks they match).

## Small fixes in this version

- At phone width, the "Native speaker / Computer voice" message now sits above the sticky "Practice them now" bar and above the open conjugation sheet, instead of covering them.
- The Topics summary lists the question, the answer and what you wrote for each item to review.
- The audio message (native speaker name, "Recorded voice" or "Device voice") now hides about 3 seconds after the sound ends, or after a few seconds if the browser never reports the end. Error messages hide after 4 seconds. Pointing at it with a mouse keeps it; Escape closes it.
- Phones showing an old version after an update: every script and stylesheet is now loaded as `file.js?v=<commit>`. The token `__BUILD__` in `index.html` is replaced with the short commit id by the deploy (`.github/workflows/pages.yml`), so each deploy gets new URLs (it stays `__BUILD__` when opened as a file or through the helper, where the query is ignored). `js/build-check.js` also reloads a tab restored from the back/forward cache when a newer version has been opened in the same browser, or when it is over an hour old (never offline, no network request). GitHub Pages caches every file for 10 minutes and ignores `<meta>` cache tags, so none are used. Audio and PDFs keep plain URLs: recorded clips are named by a content hash, and the rest rarely change.
- One-time fix on a phone that still shows the old site: close the tab and open the site again, or clear the site's data (iPhone: Settings › Safari › Advanced › Website Data; Android Chrome: the site settings › Clear & reset). Your progress is in the site's storage, so export it first (Progress › Export) if you clear site data. After this version, new deploys appear on the next reload.

## Licences

- Native recordings: Lingua Libre speakers, CC0 / CC BY / CC BY-SA (see Credits and `audio/CREDITS.md`).
- Recorded voice: synthetic speech generated with Qwen3-TTS 1.7B Base (Apache-2.0); see `audio/tts/qwen3-fr-bf16/CREDITS.md`.
- Icons: [Lucide](https://lucide.dev/), ISC licence, bundled as an inline SVG sprite (`licenses/LUCIDE-LICENSE.txt`).
- Story illustrations (`images/story/`): AI-generated with Stability AI models via Amazon Bedrock (Stable Diffusion 3.5 Large); character designs by the project author. Separate terms, not CC BY-SA (see Credits and `LICENSE-CONTENT.md`).
