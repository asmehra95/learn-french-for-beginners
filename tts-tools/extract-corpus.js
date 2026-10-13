#!/usr/bin/env node
/* Build tts-tools/corpus.json: every French string a Listen button in the verb trainer can speak.
   Loads the real site scripts (no copies), enumerates the Listen call sites, and normalizes with
   VT_LOGIC.ttsSpeak / VT_LOGIC.ttsKey, the single source of truth shared with the browser.
   Usage: node tts-tools/extract-corpus.js [--out <file>] [--site <verb-trainer dir>]
   Exports collect(siteDir) for the site's Node tests. No dependencies. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_SITE = path.join(__dirname, "..", "verb-trainer");
const NORMALIZATION = "v1";
// English-only topic answers: never spoken by a French voice.
const EXCLUDED = new Set(["formal", "standard", "casual"]);
const PREVIEW_TEXT = "Bonjour, nous avons deux frères."; // speech.js PREVIEW_TEXT

function hashKey(key) {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

/** Load the site's data + logic scripts in index.html order into a sandbox object. */
function loadSite(siteDir) {
  const vm = require("vm");
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ["data.js", "data-100.js", "verb-types.js", "topics-data.js", "merge-data.js", "logic.js", "topics.js"].forEach(f => {
    const file = path.join(siteDir, "js", f);
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
  });
  return sandbox;
}

/** Returns { items:[{key, speak, texts, categories, hash}], excluded:[...] } sorted by key. */
function collect(siteDir) {
  const w = loadSite(siteDir || DEFAULT_SITE);
  const D = w.VERB_DATA, T = w.TOPICS_DATA, L = w.VT_LOGIC, TOP = w.VT_TOPICS;
  const map = new Map();
  const excluded = new Set();
  function add(cat, raw) {
    if (raw == null || raw === "") return;
    const key = L.ttsKey(raw);
    if (!key) return;
    if (EXCLUDED.has(key)) { excluded.add(key); return; }
    let it = map.get(key);
    if (!it) { it = { key, speak: L.ttsSpeak(raw), texts: [], categories: [] }; map.set(key, it); }
    if (it.texts.indexOf(String(raw)) === -1) it.texts.push(String(raw));
    if (it.categories.indexOf(cat) === -1) it.categories.push(cat);
  }
  D.verbs.forEach(v => {
    add("verb-infinitive", v.infinitive);
    v.present.forEach(r => add("verb-present", r.french));
    if (v.past) add("verb-past", v.past.french);
    if (v.future) add("verb-future", v.future.french);
    if (v.sentence) add("verb-sentence", v.sentence.french);
  });
  T.topics.forEach(t => t.exercises.forEach(ex => ex.items.forEach(item => {
    if (TOP.hasParts(item)) {
      item.parts.forEach(pt => add("topic-part-answer", pt.answer));
      add("topic-summary-joined", TOP.answerText(item));
    } else {
      add("topic-listen", TOP.speakText(item));
      add("topic-summary-answer", TOP.answerText(item));
    }
  })));
  add("settings-preview", PREVIEW_TEXT);

  const items = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const seen = new Map();
  items.forEach(it => {
    it.hash = hashKey(it.key);
    if (seen.has(it.hash)) throw new Error("hash collision: " + JSON.stringify(seen.get(it.hash)) + " vs " + JSON.stringify(it.key));
    seen.set(it.hash, it.key);
  });
  return { items, excluded: [...excluded].sort() };
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; };
  const site = path.resolve(opt("--site", DEFAULT_SITE));
  const out = path.resolve(opt("--out", path.join(__dirname, "corpus.json")));
  const { items, excluded } = collect(site);
  const byCat = {};
  items.forEach(it => { byCat[it.categories[0]] = (byCat[it.categories[0]] || 0) + 1; });
  const doc = { normalization: NORMALIZATION, generatedAt: new Date().toISOString(), count: items.length, excluded, items };
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
  console.log(JSON.stringify({ out, count: items.length, collisions: 0, excluded: excluded.length, byFirstCategory: byCat,
    chars: items.reduce((a, it) => a + it.key.length, 0) }, null, 1));
}

module.exports = { collect, hashKey, NORMALIZATION, EXCLUDED };
if (require.main === module) main();
