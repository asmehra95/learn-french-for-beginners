/* Recorded voice (pre-generated TTS clips): text normalization, manifest lookup, Listen fallback order,
   and the shipped manifest/corpus consistency (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var ROOT = path.join(__dirname, "..");
var L = require("../js/logic.js");

/* ---------- normalization (rule v1) ---------- */
test("ttsSpeak strips learner notation: slash pronouns, (e), liaison ties, [brackets], other notes, · joins", function () {
  assert.equal(L.ttsSpeak("il/elle est"), "il est");
  assert.equal(L.ttsSpeak("ils/elles sont"), "ils sont");
  assert.equal(L.ttsSpeak("Je suis fatigué(e) aujourd'hui."), "Je suis fatigué aujourd'hui.");
  assert.equal(L.ttsSpeak("vous‿avez"), "vous avez");
  assert.equal(L.ttsSpeak("Il a [deux] frères."), "Il a deux frères.");
  assert.equal(L.ttsSpeak("Tu viens ? (informal)"), "Tu viens ?");
  assert.equal(L.ttsSpeak("Tu viens ? · Est-ce que tu viens ? · Viens-tu ?"), "Tu viens ?. Est-ce que tu viens ?. Viens-tu ?");
});

test("ttsKey: NFC, curly apostrophes and no-break spaces unified, case and punctuation kept, idempotent", function () {
  assert.equal(L.ttsKey("j’ai"), "j'ai");
  assert.equal(L.ttsKey("jʼai"), "j'ai");
  assert.equal(L.ttsKey("j‘ai"), "j'ai");
  assert.equal(L.ttsKey("Tu viens\u00A0?"), "Tu viens ?");
  assert.equal(L.ttsKey("Tu viens\u202F?"), "Tu viens ?");
  assert.equal(L.ttsKey("e\u0301te\u0301"), "\u00E9t\u00E9", "decomposed accents become NFC");
  assert.equal(L.ttsKey("  vous   avez "), "vous avez");
  assert.notEqual(L.ttsKey("Quelle"), L.ttsKey("quelle"), "case is preserved");
  assert.notEqual(L.ttsKey("Tu viens ?"), L.ttsKey("Tu viens."), "punctuation is preserved");
  ["il/elle s’appelle", "Je suis fatigué(e).", "A · B", "[x] y", "vous‿êtes\u00A0!"].forEach(function (s) {
    assert.equal(L.ttsKey(L.ttsKey(s)), L.ttsKey(s), "idempotent: " + s);
  });
});

test("speakableText (device voice path) is unchanged by the recorded-voice work", function () {
  assert.equal(L.speakableText("il/elle est"), "il est");
  assert.equal(L.speakableText("ils/elles sont"), "ils sont");
  assert.equal(L.speakableText("Je suis fatigué(e)."), "Je suis fatigué.");
  assert.equal(L.speakableText("vous‿avez [deux] (note)"), "vous‿avez [deux] (note)");
  assert.equal(L.speakableText("j’ai"), "j’ai");
});

/* ---------- speech.js with fakes ---------- */
function loadSpeech(opts) {
  opts = opts || {};
  var log = { audios: [], utterances: [] };
  function FakeAudio(src) {
    this.src = src;
    this.listeners = {};
    this.playbackRate = 1;
    log.audios.push(this);
  }
  FakeAudio.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
  FakeAudio.prototype.fire = function (t) { (this.listeners[t] || []).forEach(function (fn) { fn(); }); };
  FakeAudio.prototype.pause = function () {};
  FakeAudio.prototype.play = function () { return opts.reject ? Promise.reject(opts.reject) : Promise.resolve(); };
  var w = {
    VT_LOGIC: L,
    Audio: FakeAudio,
    setTimeout: function () { return 0; },
    VERB_AUDIO: { items: { "avoir|2p": { file: "audio/avoir-present-2p.mp3", said: "avez", speaker: "X", license: "CC0" } } },
    VT_TTS: opts.noTts ? undefined : {
      version: 1, normalization: "v1", defaultVoice: "v1voice",
      voices: { v1voice: { id: "v1voice", label: "Recorded voice", model: "M (bf16)", license: "Apache-2.0" } },
      coverage: { total: 3, recorded: 2 },
      items: {
        "vous avez": { file: "audio/tts/v1voice/aaaa.mp3", voiceId: "v1voice", duration: 0.9 },
        "il est": { file: "audio/tts/v1voice/bbbb.mp3", voiceId: "v1voice", duration: 0.7 },
        "j'ai": { file: "audio/tts/v1voice/cccc.mp3", voiceId: "v1voice", duration: 0.6 }
      }
    }
  };
  if (!opts.noSynth) {
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    w.speechSynthesis = {
      getVoices: function () { return []; },
      speak: function (u) { log.utterances.push(u.text); },
      cancel: function () {},
      addEventListener: function () {}
    };
  }
  global.window = w;
  delete require.cache[require.resolve("../js/speech.js")];
  require("../js/speech.js");
  return { S: w.VT_SPEECH, log: log };
}

function playOnce(S, text, key) {
  var calls = [];
  S.play(text, key || null, function (r) { calls.push(r); });
  return calls;
}

test("manifest lookup: exact normalized text finds the clip (slash pronouns, curly apostrophe, NBSP); unknown text does not", function () {
  var S = loadSpeech().S;
  assert.equal(S.recordedFor("vous avez").file, "audio/tts/v1voice/aaaa.mp3");
  assert.equal(S.recordedFor("il/elle est").file, "audio/tts/v1voice/bbbb.mp3");
  assert.equal(S.recordedFor("j’ai").file, "audio/tts/v1voice/cccc.mp3");
  assert.equal(S.recordedFor(" vous\u00A0avez ").key, "vous avez");
  assert.equal(S.recordedFor("vous avez").voice.license, "Apache-2.0");
  assert.equal(S.recordedFor("Vous avez"), null, "case matters");
  assert.equal(S.recordedFor("nous avons"), null);
  assert.equal(S.recordedFor(null), null);
  assert.deepEqual(S.recordedCoverage(), { total: 3, recorded: 3 });
  assert.equal(S.recordedVoice().id, "v1voice");
});

test("Listen order: recorded clip first, device voice when the text has no clip", function () {
  var t = loadSpeech();
  var calls = playOnce(t.S, "vous avez");
  assert.equal(calls[0].source, "recorded");
  assert.equal(t.log.audios.length, 1);
  assert.equal(t.log.audios[0].src, "audio/tts/v1voice/aaaa.mp3");
  assert.equal(t.log.audios[0].playbackRate, 1, "default rate 0.85 = natural speed");
  assert.equal(t.log.utterances.length, 0);
  calls = playOnce(t.S, "nous avons");
  assert.equal(calls[0].source, "computer");
  assert.deepEqual(t.log.utterances, ["nous avons"]);
  assert.equal(t.log.audios.length, 1, "no Audio for a text without a clip");
});

test("Listen with \"Device voice\" chosen never plays a recording", function () {
  var t = loadSpeech();
  t.S.configure({ voiceSource: "device" });
  assert.equal(t.S.recordedToPlay("vous avez"), null);
  var calls = playOnce(t.S, "vous avez");
  assert.equal(calls[0].source, "computer");
  assert.deepEqual(t.log.utterances, ["vous avez"]);
  assert.equal(t.log.audios.length, 0);
  t.S.configure({ voiceSource: "bogus" });
  assert.equal(t.S.preferences().voiceSource, "device", "invalid values are ignored");
  t.S.configure({ voiceSource: "recorded" });
  assert.equal(playOnce(t.S, "vous avez")[0].source, "recorded");
});

test("a recording that fails to load falls back to the device voice (reported with failed)", function () {
  var t = loadSpeech();
  var calls = playOnce(t.S, "il/elle est");
  assert.equal(calls[0].source, "recorded");
  t.log.audios[0].fire("error");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].source, "computer");
  assert.equal(calls[1].failed.file, "audio/tts/v1voice/bbbb.mp3");
  assert.deepEqual(t.log.utterances, ["il est"]);
});

test("a rejected play() falls back to the device voice; AbortError (newer click) does not", async function () {
  var t = loadSpeech({ reject: { name: "NotAllowedError" } });
  var calls = playOnce(t.S, "vous avez");
  await new Promise(function (r) { setImmediate(r); });
  assert.deepEqual(calls.map(function (c) { return c.source; }), ["recorded", "computer"]);
  var t2 = loadSpeech({ reject: { name: "AbortError" } });
  var calls2 = playOnce(t2.S, "vous avez");
  await new Promise(function (r) { setImmediate(r); });
  assert.deepEqual(calls2.map(function (c) { return c.source; }), ["recorded"]);
});

test("the native word-only path is unchanged: a key plays the Lingua Libre clip, not the recording", function () {
  var t = loadSpeech();
  var calls = playOnce(t.S, "vous avez", "avoir|2p");
  assert.equal(calls[0].source, "native");
  assert.equal(t.log.audios[0].src, "audio/avoir-present-2p.mp3");
  assert.equal(t.log.audios[0].playbackRate, 1);
});

test("rate slider maps onto recorded playback (0.85 = 1x, clamped 0.7..1.4); no synth still plays recordings", function () {
  var t = loadSpeech({ noSynth: true });
  t.S.configure({ rate: 1.2 });
  assert.equal(t.S.playbackRate(), 1.4);
  t.S.configure({ rate: 0.6 });
  assert.equal(t.S.playbackRate(), 0.71);
  assert.equal(t.S.canPlay(null, "vous avez"), true);
  assert.equal(t.S.canPlay(null, "nous avons"), false);
  assert.equal(playOnce(t.S, "nous avons")[0].source, "none");
});

test("no tts-manifest.js: everything uses the device voice as before", function () {
  var t = loadSpeech({ noTts: true });
  assert.equal(t.S.recordedFor("vous avez"), null);
  assert.equal(t.S.recordedCoverage(), null);
  assert.equal(playOnce(t.S, "vous avez")[0].source, "computer");
});

/* ---------- the shipped manifest ---------- */
function loadShipped() {
  global.window = {};
  var src = fs.readFileSync(path.join(ROOT, "js", "tts-manifest.js"), "utf8");
  new Function("window", src)(global.window); // plain data assignment, same as the browser
  return global.window.VT_TTS;
}

test("js/tts-manifest.js: every entry's file exists (> 1 KB), keys are normalized, names are the key hash", function () {
  var T = loadShipped();
  assert.equal(T.normalization, "v1");
  var keys = Object.keys(T.items);
  assert.ok(keys.length > 0);
  keys.forEach(function (k) {
    var it = T.items[k];
    assert.equal(L.ttsKey(k), k, "normalized key: " + k);
    var hash = crypto.createHash("sha256").update(k, "utf8").digest("hex").slice(0, 16);
    assert.equal(it.file, "audio/tts/" + it.voiceId + "/" + hash + ".mp3");
    assert.ok(T.voices[it.voiceId], "voice metadata for " + it.voiceId);
    var st = fs.statSync(path.join(ROOT, it.file));
    assert.ok(st.size > 1024, it.file + " is " + st.size + " bytes");
    assert.ok(it.duration > 0);
  });
  assert.equal(T.coverage.recorded, keys.length);
});

test("coverage: every Listen text from the live data is recorded or listed as failed-excluded in the voice manifest", function () {
  var T = loadShipped();
  var collect = require("../../tts-tools/extract-corpus.js").collect;
  var corpus = collect(ROOT).items;
  assert.equal(T.coverage.total, corpus.length);
  var voice = T.defaultVoice;
  var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", voice, "manifest.json"), "utf8"));
  var missing = [];
  corpus.forEach(function (it) {
    if (T.items[it.key]) return;
    var rec = man.items[it.hash];
    if (rec && (rec.status === "failed-excluded" || rec.excludedByUser)) return;
    missing.push(it.key);
  });
  assert.deepEqual(missing, []);
});

/* Every text a Grammar tables Listen button speaks, exactly as views-tables.js passes it. */
function tablesListenTexts() {
  var REF = require("../js/reference-data.js");
  var out = [];
  REF.categories.forEach(function (c) {
    c.tables.forEach(function (t) {
      if (t.kind === "grid") t.rows.forEach(function (r) { r.cells.forEach(function (cell) { out.push(cell.say || cell.fr); }); });
      else t.rows.forEach(function (r) { out.push(r.say || r.fr); });
      (t.examples || []).forEach(function (e) { out.push(e.fr); });
    });
  });
  return out;
}

test("Grammar tables: every Listen text has a clip or is a documented failed/excluded entry, and is in the corpus", function () {
  var T = loadShipped();
  var corpus = require("../../tts-tools/extract-corpus.js").collect(ROOT).items;
  var byKey = {};
  corpus.forEach(function (it) { byKey[it.key] = it; });
  var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", T.defaultVoice, "manifest.json"), "utf8"));
  var texts = tablesListenTexts();
  assert.ok(texts.length > 400, "tables have " + texts.length + " Listen texts");
  var missing = [], notInCorpus = [];
  texts.forEach(function (text) {
    var key = L.ttsKey(text);
    var it = byKey[key];
    if (!it || !it.categories.some(function (c) { return c.indexOf("table-") === 0; })) notInCorpus.push(key);
    if (T.items[key]) return;
    var hash = crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
    var rec = man.items[hash];
    if (rec && (rec.status === "failed-excluded" || rec.excludedByUser)) return;
    missing.push(key);
  });
  assert.deepEqual(notInCorpus, []);
  assert.deepEqual(missing, []);
});

test("views-tables.js Listen call sites match the corpus extractor", function () {
  var src = fs.readFileSync(path.join(ROOT, "js", "views-tables.js"), "utf8");
  var calls = src.match(/\blisten\([^)]*\)/g).filter(function (c) { return c !== "listen(text)"; });
  assert.deepEqual(calls, ["listen(row.say || row.fr)", "listen(cell.say || cell.fr)", "listen(e.fr)"]);
});

test("je me suis assis stays removed: no manifest entry, no clip, record kept as excludedByUser", function () {
  var T = loadShipped();
  var key = "je me suis assis";
  assert.equal(T.items[key], undefined);
  var hash = crypto.createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  assert.equal(hash, "53492a77289c954c");
  var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", T.defaultVoice, "manifest.json"), "utf8"));
  assert.equal(man.items[hash].excludedByUser, true);
  assert.equal(fs.existsSync(path.join(ROOT, "audio", "tts", T.defaultVoice, hash + ".mp3")), false);
});

test("index.html loads tts-manifest.js before speech.js; the CSP is unchanged (media-src 'self')", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var a = html.indexOf('<script src="js/tts-manifest.js"></script>');
  var b = html.indexOf('<script src="js/speech.js"></script>');
  assert.ok(a !== -1 && a < b);
  assert.ok(html.indexOf("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'\">") !== -1);
});
