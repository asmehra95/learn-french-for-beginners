/* Native-speaker audio: js/audio-manifest.js vs the audio/ folder, CREDITS.md, README and the label logic (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
global.window = {};
require("../js/data.js");
require("../js/data-100.js");
require("../js/verb-types.js");
require("../js/topics-data.js");
require("../js/merge-data.js");
var DATA = global.window.VERB_DATA;
var L = require("../js/logic.js");

var ROOT = path.join(__dirname, "..");
var AUDIO_DIR = path.join(ROOT, "audio");
var w = {};
new Function("window", fs.readFileSync(path.join(ROOT, "js", "audio-manifest.js"), "utf8"))(w);
var VA = w.VERB_AUDIO;
var ITEMS = VA.items;
var KEYS = Object.keys(ITEMS);
var FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "audio-manifest-v1.json"), "utf8"));
var LICENSE_RE = /^(CC0( 1\.0)?|CC BY( [0-9.]+)?|CC BY-SA( [0-9.]+)?)$/;
var PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p"];
var COV_KEY = { inf: "inf", past: "past", future: "future", sentence: "sentences" };
PERSONS.forEach(function (p) { COV_KEY[p] = "forms"; });
var verbsById = {};
DATA.verbs.forEach(function (v) { verbsById[v.id] = v; });

function expectedFile(id, kind) {
  if (kind === "inf") return "audio/" + id + "-infinitive.mp3";
  if (PERSONS.indexOf(kind) >= 0) return "audio/" + id + "-present-" + kind + ".mp3";
  return "audio/" + id + "-" + kind + ".mp3";
}
/* "il/elle" -> il | elle, "ils/elles" -> ils | elles, "(e)" -> "" | "e" */
function variants(s) {
  var list = [String(s)];
  [[/\bils\/elles\b/g, "ils", "elles"], [/\bil\/elle\b/g, "il", "elle"], [/\(e\)/g, "", "e"]].forEach(function (r) {
    var next = [];
    list.forEach(function (t) {
      if (r[0].test(t)) { next.push(t.replace(r[0], r[1])); next.push(t.replace(r[0], r[2])); } else next.push(t);
      r[0].lastIndex = 0;
    });
    list = next;
  });
  return list;
}
function n(s) { return L.normalize(String(s).replace(/[\s…]+$/, "")); }
function phraseTerms(key) {
  var parts = key.split("|"), v = verbsById[parts[0]], kind = parts[1];
  if (kind === "inf") return [v.infinitive];
  if (PERSONS.indexOf(kind) >= 0) return L.acceptedForms(v, kind).slice(1);
  return variants(v[kind].french);
}

test("every manifest item points to an existing local MP3", function () {
  assert.ok(KEYS.length >= 173);
  KEYS.forEach(function (k) {
    var it = ITEMS[k], parts = k.split("|");
    assert.match(it.file, /^audio\/[a-z0-9-]+\.mp3$/, k);
    assert.equal(it.file, expectedFile(parts[0], parts[1]), k);
    var f = path.join(ROOT, it.file);
    assert.ok(fs.existsSync(f), k + " → " + it.file + " is missing");
    assert.ok(fs.statSync(f).size > 1000, k + " is too small");
  });
});

test("every item has attribution and an allowed licence", function () {
  KEYS.forEach(function (k) {
    var it = ITEMS[k], parts = k.split("|");
    ["said", "speaker", "title"].forEach(function (f) { assert.ok(String(it[f] || "").trim(), k + " has no " + f); });
    assert.match(it.license, LICENSE_RE, k);
    assert.ok(String(it.licenseUrl).indexOf("https://creativecommons.org/") === 0, k + " licenseUrl");
    assert.ok(String(it.source).indexOf("https://commons.wikimedia.org/wiki/File:LL-Q150_(fra)-") === 0, k + " source");
    assert.ok(String(it.title).indexOf("LL-Q150 (fra)-") === 0, k + " title");
    assert.ok(it.scope === "phrase" || it.scope === "word", k + " scope");
    assert.equal(it.scope === "phrase", it.exact === true, k + " scope/exact");
    var v = verbsById[parts[0]];
    assert.ok(v, k + " verb id");
    var kinds = ["inf", "past", "future", "sentence"].concat(v.present.map(function (r) { return r.person; }));
    assert.ok(kinds.indexOf(parts[1]) >= 0, k + " kind");
  });
});

test("no orphan audio files", function () {
  var refs = {};
  KEYS.forEach(function (k) { var b = path.basename(ITEMS[k].file); refs[b] = (refs[b] || 0) + 1; });
  fs.readdirSync(AUDIO_DIR).filter(function (f) { return /\.mp3$/.test(f); }).forEach(function (f) {
    assert.equal(refs[f], 1, f + " is referenced " + (refs[f] || 0) + " times");
  });
});

test("existing recordings are preserved", function () {
  Object.keys(FIXTURE).forEach(function (k) {
    var old = FIXTURE[k], now = ITEMS[k];
    assert.ok(now, k + " was removed");
    if (now.scope === "phrase" && old.exact === false) return; // allowed upgrade: word only → full phrase
    var copy = {};
    Object.keys(now).forEach(function (f) { if (f !== "scope") copy[f] = now[f]; });
    assert.deepEqual(copy, old, k);
    assert.deepEqual(Object.keys(copy), Object.keys(old), k + " field order");
  });
});

test("coverage matches the items", function () {
  var lessonOf = {};
  DATA.lessons.forEach(function (l) { l.verbIds.forEach(function (id) { lessonOf[id] = l.id; }); });
  function blank() {
    var c = {};
    ["inf", "forms", "past", "future", "sentences"].forEach(function (k) { c[k] = { found: 0, total: 0, exact: 0 }; });
    return c;
  }
  var total = blank(), ranges = [0, 1, 2, 3, 4].map(blank);
  DATA.verbs.forEach(function (v) {
    var rg = ranges[Math.floor((lessonOf[v.id] - 1) / 5)];
    var kinds = ["inf"].concat(v.present.map(function (r) { return r.person; }), ["past", "future", "sentence"]);
    kinds.forEach(function (kind) {
      var it = ITEMS[v.id + "|" + kind];
      [total, rg].forEach(function (c) {
        var x = c[COV_KEY[kind]];
        x.total++;
        if (it) { x.found++; if (it.scope === "phrase") x.exact++; }
      });
    });
  });
  var cov = VA.coverage;
  ["inf", "forms", "past", "future", "sentences"].forEach(function (k) {
    assert.deepEqual(cov[k], total[k], "total " + k);
    ranges.forEach(function (r, i) { assert.deepEqual(cov.ranges[i][k], r[k], cov.ranges[i].label + " " + k); });
  });
  assert.equal(cov.ranges.length, 5);
  assert.equal(cov.files, KEYS.length);
  var bytes = KEYS.reduce(function (s, k) { return s + fs.statSync(path.join(ROOT, ITEMS[k].file)).size; }, 0);
  assert.equal(cov.bytes, bytes);
  assert.equal(cov.speakers, new Set(KEYS.map(function (k) { return ITEMS[k].speaker; })).size);
  assert.equal(cov.edited, KEYS.filter(function (k) { return ITEMS[k].edited === true; }).length);
});

test("CREDITS.md lists every item once", function () {
  var lines = fs.readFileSync(path.join(AUDIO_DIR, "CREDITS.md"), "utf8").split("\n");
  var rows = lines.filter(function (l) { return /^\| `/.test(l); });
  assert.equal(rows.length, KEYS.length);
  KEYS.forEach(function (k, i) {
    var it = ITEMS[k];
    var want = "| `" + path.basename(it.file) + "` | " + it.said + " | " + it.speaker + " | [" + it.license + "](" + it.licenseUrl + ") | [" + it.title + "](" + it.source + ") |";
    assert.equal(rows[i], want, k);
  });
});

test("CREDITS.md change notice covers exactly the edited files", function () {
  var line4 = fs.readFileSync(path.join(AUDIO_DIR, "CREDITS.md"), "utf8").split("\n")[4];
  var m = /This applies to the files from the first download \(Lessons 1–5\)\. The (\d+) files added later \(every clip for verbs 26–125, plus the new and upgraded clips for verbs 1–25\) were also trimmed of leading and trailing silence and loudness-normalised with ffmpeg, except: (.+)\.$/.exec(line4);
  assert.ok(m, "line 4 has the change notice: " + line4);
  var except = m[2] === "none" ? [] : m[2].split(", ").map(function (s) { return s.replace(/`/g, ""); });
  var lessonOf = {};
  DATA.lessons.forEach(function (l) { l.verbIds.forEach(function (id) { lessonOf[id] = l.id; }); });
  // "added later" = not in the first download, or a word→phrase upgrade of a first-download entry
  var later = KEYS.filter(function (k) {
    var old = FIXTURE[k];
    return !old || old.title !== ITEMS[k].title;
  });
  assert.equal(Number(m[1]), later.length, "number of files added later");
  later.forEach(function (k) {
    var b = path.basename(ITEMS[k].file);
    assert.ok(ITEMS[k].edited === true || except.indexOf(b) >= 0, k + " is added later but neither edited nor listed as an exception");
    assert.ok(!(ITEMS[k].edited === true && except.indexOf(b) >= 0), k + " is edited and listed as an exception");
  });
  KEYS.forEach(function (k) {
    if (later.indexOf(k) >= 0) return;
    assert.notEqual(ITEMS[k].edited, true, k + " is from the first download but marked edited");
    assert.ok(lessonOf[k.split("|")[0]] <= 5, k + " is outside Lessons 1–5 but not counted as added later");
  });
  except.forEach(function (b) { assert.ok(later.some(function (k) { return path.basename(ITEMS[k].file) === b; }), b + " in the exception list is not a later file"); });
});

test("phrase scope matches the item text", function () {
  KEYS.forEach(function (k) {
    var it = ITEMS[k];
    if (it.scope !== "phrase") return;
    var terms = phraseTerms(k).map(n);
    assert.ok(terms.indexOf(n(it.said)) >= 0, k + ": “" + it.said + "” is not one of " + JSON.stringify(terms));
  });
});

test("native label: full phrase vs word only", function () {
  global.window.VT_SPEECH = {};
  require("../js/ui.js");
  var UI = global.window.VT_UI;
  assert.equal(UI.nativeLabel({ scope: "phrase" }, false), "Native speaker");
  assert.equal(UI.nativeLabel({ scope: "word" }, false), "Native speaker (word only)");
  assert.equal(UI.nativeLabel({ scope: "phrase" }, true), "Native");
  assert.equal(UI.nativeLabel({ scope: "word" }, true), "Word");
  assert.equal(UI.nativeLabel(null, false), "Native speaker (word only)");
  KEYS.forEach(function (k) {
    var it = ITEMS[k];
    assert.equal(UI.nativeLabel(it, false).indexOf("(word only)") >= 0, it.scope === "word", k);
  });
  var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  var play = app.slice(app.indexOf("function play("), app.indexOf("function play(") + 1500);
  assert.ok(play.indexOf('e.scope === "phrase"') >= 0, "play() reads the clip scope");
});

test("download zip: every clip + CREDITS.md + README.txt, size recorded, no synthetic voice", function () {
  var dl = VA.download;
  assert.ok(dl, "VERB_AUDIO.download is set (run tts-tools/native-audio/build-download-zip.mjs)");
  assert.equal(dl.file, "audio/downloads/native-recordings.zip");
  var zip = path.join(ROOT, dl.file);
  assert.equal(fs.statSync(zip).size, dl.bytes, "zip size matches the manifest (rebuild the zip after a fetch)");
  assert.equal(dl.files, KEYS.length);
  var list = require("child_process").execFileSync("/usr/bin/unzip", ["-Z1", zip], { encoding: "utf8" }).trim().split("\n").sort();
  var want = ["native-recordings/CREDITS.md", "native-recordings/README.txt"].concat(KEYS.map(function (k) { return "native-recordings/" + path.basename(ITEMS[k].file); })).sort();
  assert.deepEqual(list, want);
  var credits = require("child_process").execFileSync("/usr/bin/unzip", ["-p", zip, "native-recordings/CREDITS.md"]);
  assert.ok(credits.equals(fs.readFileSync(path.join(AUDIO_DIR, "CREDITS.md"))), "zipped CREDITS.md is current");
  var readme = require("child_process").execFileSync("/usr/bin/unzip", ["-p", zip, "native-recordings/README.txt"], { encoding: "utf8" });
  ["CC0", "CC BY", "CC BY-SA", "attribution"].forEach(function (t) { assert.ok(readme.indexOf(t) >= 0, "README.txt mentions " + t); });
  var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  assert.ok(app.indexOf('download: "native-recordings.zip"') >= 0 && app.indexOf("Download native recordings (.zip, ") >= 0, "Credits view link");
});

test("README native-audio figures match the manifest", function () {
  var readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  var cov = VA.coverage;
  assert.ok(readme.indexOf(cov.files + " recordings") >= 0, "README mentions " + cov.files + " recordings");
  assert.ok(readme.indexOf("audio/downloads/native-recordings.zip") >= 0, "README mentions the download zip");
  cov.ranges.forEach(function (r) {
    var line = readme.split("\n").filter(function (l) { return l.indexOf("| " + r.label + " |") === 0; })[0];
    assert.ok(line, "README has a row for " + r.label);
    assert.ok(line.indexOf("| " + r.inf.found + " / " + r.inf.total + " |") >= 0, r.label + " infinitives");
    assert.ok(line.indexOf("| " + r.forms.found + " / " + r.forms.total + " |") >= 0, r.label + " present forms");
  });
});

/* ---------- recorded-voice corpora per voice (tts-tools/extract-corpus.js, design §5.3) ---------- */
var CORPUS = require("../../tts-tools/extract-corpus.js");
var DLG_DATA = require("../js/dialogues-data.js");
var DLG = require("../js/dialogues.js");
var L_TTS = require("../js/logic.js");
function dedupe(texts) {
  var seen = {}, out = [];
  texts.forEach(function (t) { var k = L_TTS.ttsKey(t); if (!seen[k]) { seen[k] = true; out.push(k); } });
  return out;
}
test("corpus: each non-default voice gets exactly its speakers' dialogue lines (derived from listenEntries)", function () {
  var entries = DLG.listenEntries(DLG_DATA);
  var voices = {};
  DLG_DATA.dialogues.forEach(function (d) { d.speakers.forEach(function (s) { if (s.voice !== CORPUS.DEFAULT_VOICE) voices[s.voice] = true; }); });
  assert.ok(Object.keys(voices).length >= 1);
  Object.keys(voices).forEach(function (v) {
    var got = CORPUS.collect(path.join(__dirname, ".."), { voice: v }).items.map(function (it) { return it.key; }).sort();
    var want = dedupe(entries.filter(function (e) { return e.voice === v; }).map(function (e) { return e.text; })).sort();
    assert.deepEqual(got, want, v);
  });
});
test("corpus: the default voice has every default-voice dialogue text and no other voice's line (unless shared)", function () {
  var items = CORPUS.collect(path.join(__dirname, "..")).items;
  var keys = {};
  items.forEach(function (it) { keys[it.key] = it; });
  var entries = DLG.listenEntries(DLG_DATA);
  var defaultKeys = {};
  entries.filter(function (e) { return e.voice === null || e.voice === CORPUS.DEFAULT_VOICE; }).forEach(function (e) {
    var k = L_TTS.ttsKey(e.text);
    defaultKeys[k] = true;
    assert.ok(keys[k], "default corpus has " + k);
  });
  entries.filter(function (e) { return e.voice && e.voice !== CORPUS.DEFAULT_VOICE; }).forEach(function (e) {
    var k = L_TTS.ttsKey(e.text);
    var it = keys[k];
    if (!it) return;
    var other = it.categories.some(function (c) { return c.indexOf("dialogue-") !== 0; });
    assert.ok(other || defaultKeys[k], "a male-only line leaked into the default corpus: " + k);
  });
});
test("corpus: the existing (non-dialogue) categories are unchanged: every such text was already in the female manifest", function () {
  var items = CORPUS.collect(path.join(__dirname, "..")).items;
  var man = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "audio", "tts", "qwen3-fr-bf16", "manifest.json"), "utf8"));
  var nonDia = items.filter(function (it) { return it.categories.some(function (c) { return c.indexOf("dialogue-") !== 0; }); });
  nonDia.forEach(function (it) { assert.ok(man.items[it.hash], "pre-existing record for " + it.key); });
  var diaOnlyHashes = {};
  items.forEach(function (it) { if (!it.categories.some(function (c) { return c.indexOf("dialogue-") !== 0; })) diaOnlyHashes[it.hash] = true; });
  var preexisting = Object.keys(man.items).filter(function (h) { return !diaOnlyHashes[h]; });
  assert.equal(nonDia.length, preexisting.length);
});
