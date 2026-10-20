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
var PENDING = require("./fixtures/pending-recording.js");
function pendingKeys(voice) {
  return PENDING.onlyPendingKeys(require("../js/dialogues-data.js"), require("../js/dialogues.js"), L, voice, "qwen3-fr-bf16");
}

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
  var log = { audios: [], utterances: [], utts: [], plays: [] };
  function FakeAudio(src) {
    this.src = src || "";
    this.listeners = {};
    this.playbackRate = 1;
    this.defaultPlaybackRate = 1;
    log.audios.push(this);
  }
  FakeAudio.prototype.addEventListener = function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); };
  FakeAudio.prototype.removeEventListener = function (t, fn) {
    this.listeners[t] = (this.listeners[t] || []).filter(function (f) { return f !== fn; });
  };
  FakeAudio.prototype.fire = function (t) { (this.listeners[t] || []).slice().forEach(function (fn) { fn(); }); };
  FakeAudio.prototype.pause = function () {};
  FakeAudio.prototype.play = function () {
    log.plays.push({ el: this, src: this.src, rate: this.playbackRate });
    return opts.reject ? Promise.reject(opts.reject) : Promise.resolve();
  };
  var w = {
    VT_LOGIC: L,
    Audio: FakeAudio,
    setTimeout: function () { return 0; },
    VERB_AUDIO: { items: { "avoir|2p": { file: "audio/avoir-present-2p.mp3", said: "avez", speaker: "X", license: "CC0" } } },
    VT_TTS_VOICES: opts.extra,
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
      speak: function (u) { log.utterances.push(u.text); log.utts.push(u); },
      cancel: function () {},
      addEventListener: function () {}
    };
  }
  global.window = w;
  delete require.cache[require.resolve("../js/speech.js")];
  require("../js/speech.js");
  return { S: w.VT_SPEECH, log: log };
}

function playWith(S, text, opts) {
  var r = { calls: [], ends: 0 };
  S.play(text, null, function (x) { r.calls.push(x); }, function () { r.ends += 1; }, opts);
  return r;
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

/* ---------- end signal (onEnd): lets the audio message hide after the sound ---------- */
function playEnd(S, text, key) {
  var r = { calls: [], ends: 0 };
  S.play(text, key || null, function (x) { r.calls.push(x); }, function () { r.ends += 1; });
  return r;
}

test("onEnd: a recorded clip ends once on its ended event, not before", function () {
  var t = loadSpeech();
  var r = playEnd(t.S, "vous avez");
  assert.equal(r.ends, 0);
  t.log.audios[0].fire("ended");
  t.log.audios[0].fire("ended");
  assert.equal(r.ends, 1);
});

test("onEnd: the device voice ends once on end or on error", function () {
  var t = loadSpeech();
  var r = playEnd(t.S, "nous avons");
  assert.equal(r.calls[0].source, "computer");
  assert.equal(r.ends, 0);
  t.log.utts[0].onend();
  t.log.utts[0].onerror();
  assert.equal(r.ends, 1);
  var r2 = playEnd(t.S, "nous avons");
  t.log.utts[1].onerror();
  assert.equal(r2.ends, 1);
});

test("onEnd: a replaced play() never reports its end; the newer one still does", function () {
  var t = loadSpeech();
  var a = playEnd(t.S, "vous avez");
  var b = playEnd(t.S, "nous avons");
  t.log.audios[0].fire("ended");
  assert.equal(a.ends, 0, "stale clip end ignored");
  t.log.utts[0].onend();
  assert.equal(b.ends, 1);
  var c = playEnd(t.S, "il est");
  t.log.utts[0].onerror(); // the cancelled utterance of b fires late
  assert.equal(c.ends, 0);
  t.log.plays[1].el.fire("ended");
  assert.equal(c.ends, 1);
});

test("onEnd: nothing can play -> called right away (after the report)", function () {
  var t = loadSpeech({ noSynth: true });
  var order = [];
  t.S.play("nous avons", null, function (x) { order.push(x.source); }, function () { order.push("end"); });
  assert.deepEqual(order, ["none", "end"]);
});

test("onEnd: a clip that fails falls back to the device voice, whose end is the end", function () {
  var t = loadSpeech();
  var r = playEnd(t.S, "il/elle est");
  t.log.audios[0].fire("error");
  assert.equal(r.calls[1].source, "computer");
  assert.equal(r.ends, 0);
  t.log.utts[0].onend();
  assert.equal(r.ends, 1);
  var t2 = loadSpeech({ noSynth: true });
  var r2 = playEnd(t2.S, "vous avez");
  t2.log.audios[0].fire("error");
  assert.equal(r2.calls[1].source, "none");
  assert.equal(r2.ends, 1, "no device voice: ends at once");
});

test("onEnd: preview(onEnd) fires on the utterance end; a newer play() silences it", function () {
  var t = loadSpeech();
  var ends = 0;
  t.S.preview(function () { ends += 1; });
  t.log.utts[0].onend();
  assert.equal(ends, 1);
  t.S.preview(function () { ends += 10; });
  playEnd(t.S, "nous avons");
  t.log.utts[1].onend();
  assert.equal(ends, 1);
});

/* ---------- one shared audio element (design §5.4) ---------- */
var MALE = { "qwen3-fr-m-bf16": { version: 1, normalization: "v1",
  voice: { id: "qwen3-fr-m-bf16", label: "Recorded voice 2 (synthetic French male, Qwen3-TTS)", license: "Apache-2.0", synthetic: true },
  coverage: { total: 2, recorded: 2 },
  items: {
    "Vous avez choisi ?": { file: "audio/tts/qwen3-fr-m-bf16/mmmm.mp3", voiceId: "qwen3-fr-m-bf16", duration: 1.4 },
    "vous avez": { file: "audio/tts/qwen3-fr-m-bf16/nnnn.mp3", voiceId: "qwen3-fr-m-bf16", duration: 0.8 }
  } } };
test("shared element: two plays reuse one Audio, src updated, rate reset to 1 for a native clip after a recorded one", function () {
  var t = loadSpeech();
  t.S.configure({ rate: 1.02 });
  playOnce(t.S, "vous avez");
  playOnce(t.S, "x", "avoir|2p");
  assert.equal(t.log.audios.length, 1);
  assert.equal(t.log.plays.length, 2);
  assert.equal(t.log.plays[0].src, "audio/tts/v1voice/aaaa.mp3");
  assert.equal(t.log.plays[0].rate, 1.2);
  assert.equal(t.log.plays[1].src, "audio/avoir-present-2p.mp3");
  assert.equal(t.log.plays[1].rate, 1);
  assert.equal(t.log.audios[0].defaultPlaybackRate, 1);
});
test("shared element: an ended from the first call's detached listener after the second play starts calls neither onEnd", function () {
  var t = loadSpeech();
  var a = playEnd(t.S, "vous avez");
  var aFinish = t.log.audios[0].listeners.ended[0];
  var b = playEnd(t.S, "il est");
  assert.equal(t.log.audios[0].listeners.ended.length, 1, "the first call's listener was detached");
  aFinish();
  assert.equal(a.ends, 0);
  assert.equal(b.ends, 0);
  t.log.audios[0].fire("ended");
  assert.equal(b.ends, 1);
});
test("shared element: an error after the source swap triggers only the current call's fallback", function () {
  var t = loadSpeech();
  var a = playEnd(t.S, "vous avez");
  var b = playEnd(t.S, "il est");
  t.log.audios[0].fire("error");
  assert.equal(a.calls.length, 1, "the first call never falls back");
  assert.equal(b.calls[1].source, "computer");
  assert.equal(t.log.utterances.length, 1);
});
test("voices: recordedFor without a voice is unchanged; an extra voice uses its own manifest; unknown/missing -> null", function () {
  var t = loadSpeech({ extra: MALE });
  assert.equal(t.S.recordedFor("vous avez").file, "audio/tts/v1voice/aaaa.mp3");
  assert.equal(t.S.recordedFor("vous avez", "v1voice").file, "audio/tts/v1voice/aaaa.mp3");
  var m = t.S.recordedFor("vous avez", "qwen3-fr-m-bf16");
  assert.equal(m.file, "audio/tts/qwen3-fr-m-bf16/nnnn.mp3");
  assert.equal(m.voice.id, "qwen3-fr-m-bf16");
  assert.equal(t.S.recordedFor("il est", "qwen3-fr-m-bf16"), null, "never the default voice's clip");
  assert.equal(t.S.recordedFor("vous avez", "nope"), null);
  assert.equal(t.S.recordedFor("vous avez", "__proto__"), null);
  assert.equal(loadSpeech().S.recordedFor("vous avez", "qwen3-fr-m-bf16"), null, "no extra manifest loaded");
  t.S.configure({ voiceSource: "device" });
  assert.equal(t.S.recordedToPlay("vous avez", "qwen3-fr-m-bf16"), null);
  t.S.configure({ voiceSource: "recorded" });
  assert.equal(t.S.recordedToPlay("Vous avez choisi ?", "qwen3-fr-m-bf16").voiceId, "qwen3-fr-m-bf16");
  assert.equal(t.S.defaultVoiceId(), "v1voice");
  assert.equal(t.S.voiceMeta("qwen3-fr-m-bf16").label, "Recorded voice 2 (synthetic French male, Qwen3-TTS)");
  assert.equal(t.S.voiceMeta(null).id, "v1voice");
  assert.equal(t.S.voiceMeta("nope"), null);
  assert.deepEqual(t.S.extraVoices().map(function (v) { return v.id; }), ["qwen3-fr-m-bf16"]);
  assert.deepEqual(loadSpeech().S.extraVoices(), []);
  assert.equal(t.S.canPlay(null, "il est", "qwen3-fr-m-bf16"), true, "device voice still available");
});
test("voices: play(…, { voiceId }) plays that voice's clip; a male text without a clip uses the device voice", function () {
  var t = loadSpeech({ extra: MALE });
  var c = playWith(t.S, "Vous avez choisi ?", { voiceId: "qwen3-fr-m-bf16" });
  assert.equal(c.calls[0].source, "recorded");
  assert.equal(t.log.plays[0].src, "audio/tts/qwen3-fr-m-bf16/mmmm.mp3");
  var d = playWith(t.S, "il est", { voiceId: "qwen3-fr-m-bf16" });
  assert.equal(d.calls[0].source, "computer");
  assert.equal(t.log.plays.length, 1);
});
/* ui.js decorateListen against the fake speech.js (no DOM needed beyond a button-shaped object). */
function loadUi(opts) {
  var t = loadSpeech(opts);
  var w = global.window;
  global.document = { createElement: function () { return {}; }, getElementById: function () { return null; } };
  delete require.cache[require.resolve("../js/ui.js")];
  require("../js/ui.js");
  return {
    S: t.S, UI: w.VT_UI,
    fakeButton: function (text, o) {
      var attrs = { "data-text": text, "data-key": null, "data-voice": o.voice || null, "data-who": o.who || null };
      var cls = {};
      return {
        attrs: attrs,
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
        setAttribute: function (k, v) { attrs[k] = String(v); },
        classList: { contains: function (c) { return !!cls[c]; }, toggle: function (c, on) { cls[c] = !!on; } }
      };
    }
  };
}
test("decorateListen: Listen to <who> labels for the recorded and the device voice; no who = unchanged", function () {
  var U = loadUi({ extra: MALE });
  var b = U.fakeButton("Vous avez choisi ?", { voice: "qwen3-fr-m-bf16", who: "Julien" });
  U.UI.decorateListen(b);
  assert.equal(b.attrs["aria-label"], "Listen to Julien: Vous avez choisi ? (recorded voice)");
  assert.equal(b.title, "Second recorded voice, full phrase");
  var d = U.fakeButton("Vous avez choisi ?", { voice: "qwen3-fr-m-bf16", who: "Julien" });
  U.S.configure({ voiceSource: "device" });
  U.UI.decorateListen(d);
  assert.equal(d.attrs["aria-label"], "Listen to Julien: Vous avez choisi ? (device voice)");
  U.S.configure({ voiceSource: "recorded" });
  var e = U.fakeButton("vous avez", {});
  U.UI.decorateListen(e);
  assert.equal(e.attrs["aria-label"], "Listen: vous avez (recorded voice)");
  assert.equal(e.title, "Recorded voice, full phrase");
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
  var voice = T.defaultVoice;
  // texts only an unrecorded story series uses wait for the recording step (fixtures/pending-recording.js)
  var pend = pendingKeys(voice);
  var corpus = collect(ROOT).items.filter(function (it) { return T.items[it.key] || !pend[it.key]; });
  assert.equal(T.coverage.total, corpus.length);
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
  var a = html.indexOf('<script src="js/tts-manifest.js?v=__BUILD__"></script>');
  var b = html.indexOf('<script src="js/speech.js?v=__BUILD__"></script>');
  assert.ok(a !== -1 && a < b);
  assert.ok(html.indexOf("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'\">") !== -1);
});

/* ---------- the second recorded voice (js/tts-manifest-qwen3-fr-m-bf16.js) ---------- */
function loadMale() {
  var w = {};
  new Function("window", fs.readFileSync(path.join(ROOT, "js", "tts-manifest-qwen3-fr-m-bf16.js"), "utf8"))(w);
  return w.VT_TTS_VOICES["qwen3-fr-m-bf16"];
}
test("js/tts-manifest-qwen3-fr-m-bf16.js: entries exist (> 1 KB), keys normalized, names are the key hash, synthetic voice meta", function () {
  var M = loadMale();
  assert.equal(M.normalization, "v1");
  assert.equal(M.voice.id, "qwen3-fr-m-bf16");
  assert.equal(M.voice.synthetic, true);
  assert.equal(M.voice.license, "Apache-2.0");
  var keys = Object.keys(M.items);
  assert.ok(keys.length > 0);
  keys.forEach(function (k) {
    var it = M.items[k];
    assert.equal(L.ttsKey(k), k);
    var hash = crypto.createHash("sha256").update(k, "utf8").digest("hex").slice(0, 16);
    assert.equal(it.file, "audio/tts/qwen3-fr-m-bf16/" + hash + ".mp3");
    assert.equal(it.voiceId, "qwen3-fr-m-bf16");
    assert.ok(fs.statSync(path.join(ROOT, it.file)).size > 1024, it.file);
    assert.ok(it.duration > 0);
  });
  assert.equal(M.coverage.recorded, keys.length);
});
test("coverage (second voice): every male corpus text is recorded or failed-excluded in its voice manifest", function () {
  var M = loadMale();
  var pend = pendingKeys("qwen3-fr-m-bf16");   // see fixtures/pending-recording.js
  var corpus = require("../../tts-tools/extract-corpus.js").collect(ROOT, { voice: "qwen3-fr-m-bf16" }).items
    .filter(function (it) { return M.items[it.key] || !pend[it.key]; });
  assert.equal(M.coverage.total, corpus.length);
  var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", "qwen3-fr-m-bf16", "manifest.json"), "utf8"));
  var missing = corpus.filter(function (it) {
    if (M.items[it.key]) return false;
    var rec = man.items[it.hash];
    return !(rec && (rec.status === "failed-excluded" || rec.excludedByUser));
  }).map(function (it) { return it.key; });
  assert.deepEqual(missing, []);
});
test("index.html loads tts-manifest-qwen3-fr-m-bf16.js after tts-manifest.js and before speech.js", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var a = html.indexOf('<script src="js/tts-manifest.js?v=__BUILD__"></script>');
  var m = html.indexOf('<script src="js/tts-manifest-qwen3-fr-m-bf16.js?v=__BUILD__"></script>');
  var b = html.indexOf('<script src="js/speech.js?v=__BUILD__"></script>');
  assert.ok(a !== -1 && a < m && m < b);
});
