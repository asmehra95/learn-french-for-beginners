#!/usr/bin/env node
/*
 * build-download-zip.mjs: build verb-trainer/audio/downloads/native-recordings.zip from the bundled Lingua Libre
 * clips (audio/*.mp3 listed in js/audio-manifest.js) plus audio/CREDITS.md and a README.txt with the licence
 * terms. The pre-recorded synthetic voice (audio/tts/) is NOT included. Reproducible: files are staged in sorted
 * order with a fixed timestamp and zipped with /usr/bin/zip -X, so the same inputs give the same bytes.
 * Then records { file, bytes, files } as `download` in js/audio-manifest.js for the Credits-view link.
 * Usage: node build-download-zip.mjs [--site <dir>]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf("--site");
const SITE = ai > 0 ? path.resolve(process.argv[ai + 1]) : path.resolve(scriptDir, "../../verb-trainer");
const MANIFEST = path.join(SITE, "js", "audio-manifest.js");
const ZIP_REL = "audio/downloads/native-recordings.zip";
const ZIP = path.join(SITE, ZIP_REL);
const DIR = "native-recordings";
const STAMP = "202601010000.00"; // fixed mtime for every entry

const src = fs.readFileSync(MANIFEST, "utf8");
const w = {};
new Function("window", src)(w);
const VA = w.VERB_AUDIO;
const items = Object.values(VA.items);
const licenses = [...new Set(items.map((it) => it.license))].sort();

const readme = `Native-speaker recordings of French verbs (Lingua Libre)
=======================================================

${items.length} MP3 recordings by ${new Set(items.map((it) => it.speaker)).size} volunteer speakers of Lingua Libre (https://lingualibre.org/),
from Wikimedia Commons (https://commons.wikimedia.org/), as bundled with the French verb trainer.
CREDITS.md lists every file with what it says, the speaker, its licence and its Commons source page.

Licences in this download: ${licenses.join(", ")}.
Each file keeps its own licence; the zip as a whole has no single licence.
- CC0: no conditions.
- CC BY: you may reuse and adapt the file if you credit the speaker, link the licence and say if you changed it.
- CC BY-SA: as CC BY, and anything you share that adapts the file must use the same licence.
When you reuse a recording, keep its attribution (speaker, licence, source link from CREDITS.md).

Changes: the files are the MP3 versions that Wikimedia Commons generates from the original WAV uploads,
renamed to short ASCII names. Files added after the first download (marked in CREDITS.md) were also trimmed
of silence and loudness-normalised with ffmpeg.

File names: <verb>-infinitive.mp3, <verb>-present-<1s|2s|3s|1p|2p|3p>.mp3, <verb>-past.mp3.
`;

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "vt-zip-"));
try {
  const root = path.join(stage, DIR);
  fs.mkdirSync(root);
  const names = items.map((it) => path.basename(it.file)).sort();
  for (const n of names) fs.copyFileSync(path.join(SITE, "audio", n), path.join(root, n));
  fs.copyFileSync(path.join(SITE, "audio", "CREDITS.md"), path.join(root, "CREDITS.md"));
  fs.writeFileSync(path.join(root, "README.txt"), readme);
  const entries = ["README.txt", "CREDITS.md"].concat(names).map((n) => DIR + "/" + n);
  const t = spawnSync("touch", ["-t", STAMP, root].concat(entries.map((e) => path.join(stage, e))));
  if (t.status !== 0) throw new Error("touch failed");
  fs.mkdirSync(path.dirname(ZIP), { recursive: true });
  const tmpZip = path.join(stage, "out.zip");
  const z = spawnSync("/usr/bin/zip", ["-X", "-q", "-9", tmpZip].concat(entries), { cwd: stage, env: Object.assign({}, process.env, { TZ: "UTC" }), encoding: "utf8" });
  if (z.status !== 0) throw new Error("zip failed: " + z.stderr);
  fs.copyFileSync(tmpZip, ZIP + ".partial");
  fs.renameSync(ZIP + ".partial", ZIP);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

const bytes = fs.statSync(ZIP).size;
VA.download = { file: ZIP_REL, bytes, files: items.length };
const header = src.split("\n")[0];
const out = { coverage: VA.coverage, items: VA.items, download: VA.download };
fs.writeFileSync(MANIFEST + ".tmp", header + "\nwindow.VERB_AUDIO = " + JSON.stringify(out, null, 2) + ";\n");
fs.renameSync(MANIFEST + ".tmp", MANIFEST);
console.log(`Wrote ${ZIP} (${items.length} recordings + CREDITS.md + README.txt, ${(bytes / 1048576).toFixed(1)} MB)`);
