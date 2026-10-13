# Contributing

## Syncing from source

The verb-trainer site, explainer, topic PDFs and TTS tools are mastered in a sibling folder and
copied here with `tools/sync-from-source.sh`. Run it from the repo root whenever the source
changes:

```sh
bash tools/sync-from-source.sh
```

The script uses `rsync` and is idempotent — running it again when nothing changed leaves the repo
clean. It also copies the topic PDFs into `verb-trainer/topics/` so they are served correctly by
GitHub Pages.

After syncing, review the diff (`git diff --stat`) to confirm what changed, then commit:

```sh
git add -A
git commit -m "chore: sync from source"
```

## Running the tests

Requires Node.js 18+ (21+ for the explainer tests).

```sh
# Verb trainer unit tests (answer checking, sessions, data, audio manifest, topics)
cd verb-trainer && node --test tests/*.test.js

# Explainer unit + integration tests (server, provider, grounding, UI logic)
cd explainer && npm test
```

Run both test suites before opening a pull request.

## What topics/data-100.js contains

`verb-trainer/js/topics-data.js` holds the topic lesson exercises exported from the written topic
guides (`topics/`). The file is generated from the workbooks; the site copy carries a few small
review corrections noted in its header comment. Do not edit it by hand — re-export from the source
and copy it in.

## Structural notes

- `verb-trainer/js/data.js` is generated from `25-most-common-french-verbs.md` (lessons 1–5) and
  `verb-trainer/js/data-100.js` from `100-more-common-french-verbs.md` (lessons 6–25). Do not edit
  these files by hand.
- `verb-trainer/js/explainer.js` and `verb-trainer/css/explainer.css` must be byte-identical copies
  of `explainer/explainer.js` and `explainer/explainer.css`. A test (`explainer/tests/site-copy.test.js`)
  checks this; copy the files after changing the originals.

## PRs welcome

Bug fixes, accessibility improvements, and new tests are all welcome. For larger changes (new
lessons, new features), open an issue first to discuss the approach.
