/* Unit tests for js/storage.js schema v2 and the v1 migration (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

global.window = {};
require("../js/data.js");
var realData = global.window.VERB_DATA;           // loaded once
var V1 = require("./fixtures/v1-state.js");

function loadStore(fake, data) {
  global.window = { localStorage: fake, VERB_DATA: data || realData };
  delete require.cache[require.resolve("../js/storage.js")];
  require("../js/storage.js");
  return global.window.VT_STORAGE;
}

function fakeStorage(initial) {
  var map = {};
  Object.keys(initial || {}).forEach(function (k) { map[k] = initial[k]; });
  return {
    map: map,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { map[k] = String(v); },
    removeItem: function (k) { delete map[k]; }
  };
}

function throwingStorage() {
  function boom() { throw new Error("SecurityError"); }
  return { getItem: boom, setItem: boom, removeItem: boom };
}

function captureWarn(fn) {
  var orig = console.warn;
  var out = [];
  console.warn = function (m) { out.push(String(m)); };
  try { return { value: fn(), warnings: out }; } finally { console.warn = orig; }
}

var V1_TEXT = JSON.stringify(V1);

test("v1 data migrates in place: stats, totals and settings unchanged, version 2, new fields defaulted", function () {
  var fake = fakeStorage({ "verbTrainer.v1": V1_TEXT });
  var STORE = loadStore(fake);
  var state = STORE.load();
  assert.equal(STORE.wasMigrated(), true);
  assert.equal(state.version, 2);
  assert.equal(JSON.stringify(state.stats), JSON.stringify(V1.stats));
  assert.equal(JSON.stringify(state.totals), JSON.stringify(V1.totals));
  Object.keys(V1.settings).forEach(function (k) {
    assert.equal(JSON.stringify(state.settings[k]), JSON.stringify(V1.settings[k]), "settings." + k);
  });
  var d = STORE.defaults();
  assert.equal(state.settings.theme, "system");
  assert.equal(state.settings.dailyGoal, 20);
  assert.equal(state.settings.sessionLength, 10);
  assert.equal(state.settings.autoPlayWrong, false);
  assert.equal(state.settings.singleKeyShortcuts, true);
  assert.deepEqual(state.daily, d.daily);
  assert.deepEqual(state.streak, { current: 0, best: 0, lastDate: "" });
  assert.deepEqual(state.history, {});
  assert.deepEqual(state.lessons, {});
  assert.deepEqual(state.onboarding, { welcomeDismissed: false, typingTipSeen: false, importHintDismissed: false });
  // app.js saves right after a migrating load; the next load is a plain v2 load
  assert.equal(STORE.save(state), true);
  assert.equal(JSON.parse(fake.map["verbTrainer.v1"]).version, 2);
  var again = STORE.load();
  assert.equal(STORE.wasMigrated(), false);
  assert.deepEqual(again, state);
});

test("the backup is written once with the raw v1 text and never overwritten", function () {
  var fake = fakeStorage({ "verbTrainer.v1": V1_TEXT });
  var STORE = loadStore(fake);
  STORE.load();
  assert.equal(fake.map["verbTrainer.v1.backup"], V1_TEXT);
  var other = JSON.parse(V1_TEXT);
  other.totals.answered = 999;
  fake.map["verbTrainer.v1"] = JSON.stringify(other);
  STORE = loadStore(fake);
  STORE.load();
  assert.equal(STORE.wasMigrated(), true);
  assert.equal(fake.map["verbTrainer.v1.backup"], V1_TEXT, "second load keeps the first backup");
});

test("a failing backup write doesn't stop the migration", function () {
  var fake = fakeStorage({ "verbTrainer.v1": V1_TEXT });
  var setItem = fake.setItem;
  fake.setItem = function (k, v) { if (k === "verbTrainer.v1.backup") throw new Error("quota"); setItem(k, v); };
  var STORE = loadStore(fake);
  var r = captureWarn(function () { return STORE.load(); });
  assert.equal(r.value.version, 2);
  assert.equal(r.value.totals.answered, V1.totals.answered);
  assert.equal(r.warnings.length, 1);
  assert.ok(/^verbTrainer: /.test(r.warnings[0]));
  assert.equal(STORE.isPersistent(), true);
});

test("invalid new fields fall back to their defaults, field by field", function () {
  var raw = JSON.parse(V1_TEXT);
  raw.version = 2;
  raw.settings.theme = "neon";
  raw.settings.dailyGoal = 25;
  raw.settings.sessionLength = "10";
  raw.settings.autoPlayWrong = "yes";
  raw.settings.singleKeyShortcuts = false;
  raw.daily = { date: "10/05/2026", answered: -3, correct: 2.5, goalMet: "true" };
  raw.streak = { current: 4, best: 1e9, lastDate: "2026-05-10" };
  raw.history = { "2026-05-10": 12, "bad": 3, "2026-05-11": -1, "2026-05-12": 1e9 };
  raw.lessons = { "1": { learned: true, practiced: "no", quizBest: 150, quizPassed: true }, "2": { quizBest: 80 }, "3": "x" };
  raw.onboarding = { welcomeDismissed: true, typingTipSeen: 1 };
  var STORE = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) }));
  var s = STORE.load();
  assert.equal(STORE.wasMigrated(), false);
  assert.equal(s.settings.theme, "system");
  assert.equal(s.settings.dailyGoal, 20);
  assert.equal(s.settings.sessionLength, 10);
  assert.equal(s.settings.autoPlayWrong, false);
  assert.equal(s.settings.singleKeyShortcuts, false, "a valid value is kept");
  assert.deepEqual(s.daily, { date: "", answered: 0, correct: 0, goalMet: false });
  assert.deepEqual(s.streak, { current: 4, best: 1e7, lastDate: "2026-05-10" }, "counts are clamped to 1e7");
  assert.deepEqual(s.history, { "2026-05-10": 12, "2026-05-12": 1e7 });
  assert.deepEqual(s.lessons["1"], { learned: true, practiced: false, quizBest: -1, quizPassed: true });
  assert.deepEqual(s.lessons["2"], { learned: false, practiced: false, quizBest: 80, quizPassed: false });
  assert.equal(s.lessons["3"], undefined);
  assert.deepEqual(s.onboarding, { welcomeDismissed: true, typingTipSeen: false, importHintDismissed: false });
});

test("history keeps the 60 most recent days", function () {
  var raw = { version: 2, history: {} };
  for (var i = 0; i < 70; i++) {
    var d = new Date(2026, 0, 1 + i);
    var k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    raw.history[k] = i;
  }
  var s = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) })).load();
  var keys = Object.keys(s.history).sort();
  assert.equal(keys.length, 60);
  assert.equal(s.history[keys[59]], 69);
});

test("unknown lesson ids are dropped", function () {
  var raw = { version: 2, lessons: {
    "2": { learned: true, practiced: true, quizBest: 90, quizPassed: true },
    "99": { learned: true, practiced: false, quizBest: -1, quizPassed: false }
  } };
  var s = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) })).load();
  assert.deepEqual(Object.keys(s.lessons), ["2"]);
  assert.deepEqual(s.lessons["2"], { learned: true, practiced: true, quizBest: 90, quizPassed: true });
  // lessons are checked against the data actually loaded, not against 1..N
  var synthetic = { verbs: realData.verbs, lessons: [{ id: 99, title: "x", verbIds: [] }] };
  s = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) }), synthetic).load();
  assert.deepEqual(Object.keys(s.lessons), ["99"]);
});

test("reset removes only verbTrainer.v1 and keeps the backup", function () {
  var fake = fakeStorage({ "verbTrainer.v1": V1_TEXT });
  var STORE = loadStore(fake);
  STORE.save(STORE.load());
  assert.ok(fake.map["verbTrainer.v1.backup"]);
  var fresh = STORE.reset();
  assert.equal(fake.map["verbTrainer.v1"], undefined);
  assert.equal(fake.map["verbTrainer.v1.backup"], V1_TEXT);
  assert.deepEqual(fresh, STORE.defaults());
  assert.equal(fresh.version, 2);
});

test("storage that throws gives memory mode", function () {
  var STORE = loadStore(throwingStorage());
  var s = STORE.load();
  assert.equal(STORE.isPersistent(), false);
  assert.deepEqual(s, STORE.defaults());
  s.totals.answered = 3;
  assert.equal(STORE.save(s), false);
  assert.equal(STORE.load().totals.answered, 3, "kept in memory");
  assert.equal(STORE.reset().totals.answered, 0);
  assert.equal(STORE.load().totals.answered, 0);
});

test("corrupt JSON and unknown versions warn and start fresh", function () {
  var r = captureWarn(function () { return loadStore(fakeStorage({ "verbTrainer.v1": "{not json" })).load(); });
  assert.equal(r.value.version, 2);
  assert.deepEqual(r.warnings, ["verbTrainer: stored data unreadable, starting fresh"]);
  r = captureWarn(function () { return loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify({ version: 7 }) })).load(); });
  assert.deepEqual(r.warnings, ["verbTrainer: stored data unreadable, starting fresh"]);
  r = captureWarn(function () { return loadStore(fakeStorage({})).load(); });
  assert.deepEqual(r.warnings, [], "no data is not an error");
  assert.equal(r.value.settings.selectedVerbIds.length, realData.verbs.length);
});
test("the renamed 'Show native-speaker word recordings' setting keeps the stored v1 boolean (preferNative) with the same meaning", function () {
  [false, true].forEach(function (val) {
    var v1 = JSON.parse(V1_TEXT);
    v1.settings.preferNative = val;
    var STORE = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(v1) }));
    assert.equal(STORE.load().settings.preferNative, val);
  });
  assert.equal(loadStore(fakeStorage({})).load().settings.preferNative, true, "default on");
});

/* ---------- Export / Import (plan D8) ---------- */
test("export → parseImport round trip gives the same sanitized state", function () {
  var STORE = loadStore(fakeStorage({ "verbTrainer.v1": V1_TEXT }));
  var state = STORE.load();
  state.settings.theme = "dark";
  state.lessons["1"] = { learned: true, practiced: true, quizBest: 90, quizPassed: true };
  var text = STORE.exportText(state, Date.UTC(2026, 4, 10, 12, 0, 0));
  var env = JSON.parse(text);
  assert.equal(env.app, "french-verb-trainer");
  assert.equal(env.kind, "progress");
  assert.equal(env.exportedVersion, 2);
  assert.equal(env.exportedAt, "2026-05-10T12:00:00.000Z");
  assert.deepEqual(env.data, STORE.sanitize(state));
  var res = STORE.parseImport(text);
  assert.equal(res.ok, true);
  assert.deepEqual(res.state, STORE.sanitize(state));
  assert.deepEqual(res.state, state, "a loaded state is already sanitized");
});

test("parseImport rejects other files with a reason and never throws", function () {
  var STORE = loadStore(fakeStorage({}));
  var good = JSON.parse(STORE.exportText(STORE.defaults(), 0));
  function withEnv(patch) { var e = JSON.parse(JSON.stringify(good)); Object.keys(patch).forEach(function (k) { e[k] = patch[k]; }); return JSON.stringify(e); }
  assert.deepEqual(STORE.parseImport(withEnv({ app: "something-else" })), { ok: false, error: "not-an-export" });
  assert.deepEqual(STORE.parseImport(withEnv({ kind: "settings" })), { ok: false, error: "not-an-export" });
  assert.deepEqual(STORE.parseImport(withEnv({ data: null })), { ok: false, error: "not-an-export" });
  assert.deepEqual(STORE.parseImport(withEnv({ data: [1, 2] })), { ok: false, error: "not-an-export" });
  assert.deepEqual(STORE.parseImport("[]"), { ok: false, error: "not-an-export" });
  assert.deepEqual(STORE.parseImport("null"), { ok: false, error: "not-an-export" });
  assert.deepEqual(STORE.parseImport("{"), { ok: false, error: "not-json" });
  assert.deepEqual(STORE.parseImport(""), { ok: false, error: "not-json" });
  assert.deepEqual(STORE.parseImport(undefined), { ok: false, error: "not-json" });
  var big = withEnv({});
  big = big + " ".repeat(1048576 + 1 - big.length);
  assert.equal(big.length, 1048577);
  assert.deepEqual(STORE.parseImport(big), { ok: false, error: "too-large" });
  assert.equal(STORE.parseImport(big.slice(0, 1048576)).ok, true, "exactly 1 MB is allowed");
  var v3 = JSON.parse(JSON.stringify(good)); v3.data.version = 3;
  assert.deepEqual(STORE.parseImport(JSON.stringify(v3)), { ok: false, error: "unsupported-version" });
  var v0 = JSON.parse(JSON.stringify(good)); delete v0.data.version;
  assert.deepEqual(STORE.parseImport(JSON.stringify(v0)), { ok: false, error: "unsupported-version" });
});

test("parseImport of a v1 payload migrates it like a v1 load (new fields defaulted)", function () {
  var STORE = loadStore(fakeStorage({}));
  var text = JSON.stringify({ app: "french-verb-trainer", kind: "progress", exportedVersion: 1, exportedAt: "x", data: V1 });
  var res = STORE.parseImport(text);
  assert.equal(res.ok, true);
  assert.equal(res.state.version, 2);
  assert.equal(JSON.stringify(res.state.stats), JSON.stringify(V1.stats));
  assert.equal(res.state.settings.voiceURI, V1.settings.voiceURI);
  assert.equal(res.state.settings.theme, "system");
  assert.deepEqual(res.state.streak, { current: 0, best: 0, lastDate: "" });
  assert.deepEqual(res.state.lessons, {});
});

test("hostile import values are dropped or clamped by sanitize", function () {
  var STORE = loadStore(fakeStorage({}));
  var text = '{"app":"french-verb-trainer","kind":"progress","exportedVersion":2,"exportedAt":"x","data":{' +
    '"version":2,' +
    '"stats":{"__proto__":{"box":1,"seen":1,"correct":1,"wrong":0,"last":1},' +
      '"constructor":{"box":1,"seen":1,"correct":1,"wrong":0,"last":1},' +
      '"no-such-verb|conjugate|1s":{"box":1,"seen":1,"correct":1,"wrong":0,"last":1},' +
      '"etre|conjugate|1s":{"box":99,"seen":1e400,"correct":-5,"wrong":"7","last":1e400},' +
      '"etre|' + "x".repeat(200) + '":{"box":1,"seen":1,"correct":1,"wrong":0,"last":1}},' +
    '"totals":{"answered":1e300,"correct":-1,"bestStreak":3,"streak":"9"},' +
    '"settings":{"voiceURI":"' + "v".repeat(10000) + '","voiceName":"ok","speechRate":99,"selectedVerbIds":["etre","nope","__proto__"],"theme":"neon","__proto__":{"polluted":true}},' +
    '"lessons":{"__proto__":{"learned":true},"999":{"learned":true}},' +
    '"topics":{"__proto__":{"best":100,"attempts":1},"Z9":{"best":100,"attempts":1}},' +
    '"history":{"__proto__":5,"2026-05-10":1e300}' +
    '}}';
  var res = STORE.parseImport(text);
  assert.equal(res.ok, true);
  var s = res.state;
  assert.deepEqual(Object.keys(s.stats), ["etre|conjugate|1s"]);
  assert.equal(Object.getPrototypeOf(s.stats), Object.prototype, "no prototype swap through __proto__");
  assert.deepEqual(s.stats["etre|conjugate|1s"], { box: 4, seen: 1e7, correct: 0, wrong: 7, last: 0 });
  assert.equal(s.totals.answered, 1e7);
  assert.equal(s.totals.correct, 0);
  assert.equal(s.totals.bestStreak, 3);
  assert.equal(s.totals.streak, 0);
  assert.equal(s.settings.voiceURI, "", "a 10 000-char voiceURI is dropped");
  assert.equal(s.settings.voiceName, "ok");
  assert.equal(s.settings.speechRate, 1.2);
  assert.deepEqual(s.settings.selectedVerbIds, ["etre"]);
  assert.equal(s.settings.theme, "system");
  assert.equal(s.settings.polluted, undefined);
  assert.deepEqual(s.lessons, {});
  assert.deepEqual(s.topics, {});
  assert.deepEqual(s.history, { "2026-05-10": 1e7 });
  assert.equal({}.polluted, undefined, "Object.prototype untouched");
});

test("import hint: only over http(s), only with no progress, only until dismissed (and the dismissal is stored)", function () {
  var STORE = loadStore(fakeStorage());
  var fresh = STORE.defaults();
  assert.equal(STORE.hasProgress(fresh), false);
  assert.equal(STORE.importHintVisible(fresh, "http:"), true);
  assert.equal(STORE.importHintVisible(fresh, "https:"), true);
  assert.equal(STORE.importHintVisible(fresh, "file:"), false, "never for the double-clicked file");
  // Any kind of progress hides it.
  [
    function (s) { s.totals.answered = 1; },
    function (s) { s.stats["etre|conjugate|1s"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1 }; },
    function (s) { s.lessons["1"] = { learned: true }; },
    function (s) { s.topics["Q1-A"] = { best: 50, attempts: 1 }; },
    function (s) { s.history["2026-05-10"] = 3; }
  ].forEach(function (mut, i) {
    var s = STORE.defaults();
    mut(s);
    assert.equal(STORE.hasProgress(s), true, "case " + i);
    assert.equal(STORE.importHintVisible(s, "http:"), false, "case " + i);
  });
  // Dismissed: hidden, and the flag survives a save/load round trip; a non-boolean is ignored.
  var fake = fakeStorage();
  STORE = loadStore(fake);
  var s = STORE.defaults();
  s.onboarding.importHintDismissed = true;
  STORE.save(s);
  var back = STORE.load();
  assert.equal(back.onboarding.importHintDismissed, true);
  assert.equal(STORE.importHintVisible(back, "http:"), false);
  assert.equal(STORE.sanitize({ version: 2, onboarding: { importHintDismissed: "yes" } }).onboarding.importHintDismissed, false);
});
test("storage.js never evaluates text (no eval / new Function)", function () {
  var src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../js/storage.js"), "utf8");
  assert.ok(!/\beval\s*\(/.test(src), "eval(");
  assert.ok(!/new\s+Function/.test(src), "new Function");
  assert.ok(/JSON\.parse\(text\)/.test(src), "imports are parsed with JSON.parse");
});
test("recorded voice setting (voiceSource): default 'recorded', v1 migration and older v2 saves/exports get the default", function () {
  var STORE = loadStore(fakeStorage({ "verbTrainer.v1": V1_TEXT }));
  assert.equal(STORE.defaults().settings.voiceSource, "recorded");
  var migratedState = STORE.load();
  assert.equal(STORE.wasMigrated(), true);
  assert.equal(migratedState.settings.voiceSource, "recorded", "v1 -> v2 migration");
  // an existing v2 save written before the field existed
  var oldV2 = STORE.defaults();
  delete oldV2.settings.voiceSource;
  oldV2.settings.speechRate = 1.1;
  STORE = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(oldV2) }));
  var s = STORE.load();
  assert.equal(STORE.wasMigrated(), false);
  assert.equal(s.settings.voiceSource, "recorded");
  assert.equal(s.settings.speechRate, 1.1, "other settings kept");
  // an older export file without the field
  var exp = JSON.parse(STORE.exportText(oldV2, 0));
  delete exp.data.settings.voiceSource;
  assert.equal(STORE.parseImport(JSON.stringify(exp)).state.settings.voiceSource, "recorded");
});
test("recorded voice setting: 'device' survives save/load and export/import; invalid values fall back to the default", function () {
  var fake = fakeStorage();
  var STORE = loadStore(fake);
  var s = STORE.defaults();
  s.settings.voiceSource = "device";
  STORE.save(s);
  assert.equal(JSON.parse(fake.map["verbTrainer.v1"]).settings.voiceSource, "device");
  assert.equal(STORE.load().settings.voiceSource, "device");
  assert.equal(STORE.parseImport(STORE.exportText(s, 0)).state.settings.voiceSource, "device");
  [null, 1, "studio", "computer", "", { x: 1 }].forEach(function (bad) {
    assert.equal(STORE.sanitize({ version: 2, settings: { voiceSource: bad } }).settings.voiceSource, "recorded", String(bad));
  });
});

/* ---------- Dialogues (additive v2: state.dialogues, settings.dialogueShowEnglish, dlg: stats) ---------- */
var PRE_DLG = require("./fixtures/v2-pre-dialogues-state.js");
var DLG_DATA = require("../js/dialogues-data.js");
function loadFull(fake, withDialogues) {
  global.window = {};
  ["data", "data-100", "verb-types", "topics-data", "merge-data", "expressions-data"].forEach(function (f) {
    delete require.cache[require.resolve("../js/" + f + ".js")];
    require("../js/" + f + ".js");
  });
  var w = global.window;
  w.localStorage = fake || fakeStorage();
  if (withDialogues !== false) w.VT_DIALOGUES = DLG_DATA;
  delete require.cache[require.resolve("../js/storage.js")];
  require("../js/storage.js");
  return w.VT_STORAGE;
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
test("dialogues: a pre-dialogues v2 save loads unchanged plus exactly the two new defaults", function () {
  var STORE = loadFull(fakeStorage({ "verbTrainer.v1": JSON.stringify(PRE_DLG) }));
  var state = STORE.load();
  var want = clone(PRE_DLG);
  want.settings.dialogueShowEnglish = true;
  want.dialogues = {};
  assert.deepEqual(state, want);
  assert.equal(STORE.wasMigrated(), false);
  assert.equal(state.version, 2);
});
test("dialogues: defaults gain dialogues {} and dialogueShowEnglish true; reset returns them", function () {
  var STORE = loadFull();
  var d = STORE.defaults();
  assert.deepEqual(d.dialogues, {});
  assert.equal(d.settings.dialogueShowEnglish, true);
  assert.deepEqual(STORE.reset().dialogues, {});
});
test("dialogues: dlg stat keys survive sanitize with the data loaded and with only the regex", function () {
  var raw = clone(PRE_DLG);
  raw.stats["dlg:at-the-cafe.q1|dlg-quiz|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 1760000400000 };
  raw.stats["dlg:other-dialogue.q2|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1760000500000 };
  raw.stats["dlg:at-the-cafe.q9|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1 };
  raw.stats["dlg:__proto__.q1|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1 };
  raw.stats["dlg:Bad.q1|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1 };
  var withData = loadFull(null, true).sanitize(raw);
  assert.deepEqual(withData.stats["dlg:at-the-cafe.q1|dlg-quiz|-"], raw.stats["dlg:at-the-cafe.q1|dlg-quiz|-"]);
  assert.equal(withData.stats["dlg:other-dialogue.q2|dlg-quiz|-"], undefined, "unknown dialogue dropped when data is loaded");
  assert.equal(withData.stats["dlg:at-the-cafe.q9|dlg-quiz|-"], undefined);
  var regexOnly = loadFull(null, false).sanitize(raw);
  assert.ok(regexOnly.stats["dlg:at-the-cafe.q1|dlg-quiz|-"]);
  assert.ok(regexOnly.stats["dlg:other-dialogue.q2|dlg-quiz|-"], "any safe id kept without the data");
  assert.ok(regexOnly.stats["dlg:at-the-cafe.q9|dlg-quiz|-"]);
  [withData, regexOnly].forEach(function (s) {
    assert.equal(Object.prototype.hasOwnProperty.call(s.stats, "dlg:__proto__.q1|dlg-quiz|-"), false);
    assert.equal(s.stats["dlg:Bad.q1|dlg-quiz|-"], undefined);
    assert.ok(s.stats["etre|conjugate|1s"], "verb stats untouched");
  });
});
test("dialogues: records sanitized: unknown dialogue/speaker ids dropped, malformed fields default, __proto__ ignored, caps", function () {
  var STORE = loadFull();
  var raw = clone(PRE_DLG);
  raw.dialogues = JSON.parse('{"__proto__": {"listened": true}}');
  raw.dialogues["at-the-cafe"] = { listened: true, quizBest: 75, quizAttempts: 2, lastDate: "2026-10-16",
    roles: { customer: { best: 83, attempts: 1 }, server: { best: 101, attempts: 1 }, ghost: { best: 50, attempts: 1 } } };
  raw.dialogues["unknown-one"] = { listened: true, quizBest: 10, quizAttempts: 1, roles: {}, lastDate: "" };
  var s = STORE.sanitize(raw);
  assert.deepEqual(Object.keys(s.dialogues), ["at-the-cafe"]);
  assert.deepEqual(s.dialogues["at-the-cafe"], { listened: true, quizBest: 75, quizAttempts: 2, roles: { customer: { best: 83, attempts: 1 } }, lastDate: "2026-10-16" });
  raw.dialogues = { "at-the-cafe": { listened: "yes", quizBest: 7.5, quizAttempts: -1, lastDate: "yesterday", roles: [1, 2] } };
  assert.deepEqual(STORE.sanitize(raw).dialogues["at-the-cafe"], { listened: false, quizBest: -1, quizAttempts: 0, roles: {}, lastDate: "" });
  raw.dialogues = "nope";
  assert.deepEqual(STORE.sanitize(raw).dialogues, {});
  // caps, with only the regexes (no data loaded): 200 dialogues, 4 roles. The cap was raised from 50 when the
  // 60-dialogue set shipped (a scoped update so real progress is never dropped; overflow is still capped)
  var bare = loadFull(null, false);
  raw.dialogues = {};
  for (var i = 0; i < 210; i++) raw.dialogues["d-" + i] = { listened: true, quizBest: 1, quizAttempts: 1, lastDate: "", roles: {} };
  raw.dialogues["d-0"].roles = { a: { best: 1, attempts: 1 }, b: { best: 2, attempts: 1 }, c: { best: 3, attempts: 1 }, d: { best: 4, attempts: 1 }, e: { best: 5, attempts: 1 } };
  var capped = bare.sanitize(raw);
  assert.equal(Object.keys(capped.dialogues).length, 200);
  assert.equal(Object.keys(capped.dialogues["d-0"].roles).length, 4);
});
test("dialogues: a story episode record (lyon-05-a-closed-door, role berthier) and its quiz stat survive sanitize", function () {
  var STORE = loadFull();
  var raw = clone(PRE_DLG);
  raw.dialogues = { "lyon-05-a-closed-door": { listened: true, quizBest: 50, quizAttempts: 1, lastDate: "2026-10-17",
    roles: { berthier: { best: 80, attempts: 2 } } } };
  raw.stats["dlg:lyon-05-a-closed-door.q1|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1760000600000 };
  var s = STORE.sanitize(raw);
  assert.deepEqual(s.dialogues["lyon-05-a-closed-door"], raw.dialogues["lyon-05-a-closed-door"]);
  assert.deepEqual(s.stats["dlg:lyon-05-a-closed-door.q1|dlg-quiz|-"], raw.stats["dlg:lyon-05-a-closed-door.q1|dlg-quiz|-"]);
});
test("dialogues: export → parseImport round trip keeps dialogues, dlg stats and dialogueShowEnglish; hasProgress", function () {
  var STORE = loadFull();
  var state = STORE.sanitize(clone(PRE_DLG));
  state.stats["dlg:at-the-cafe.q2|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1760000600000 };
  state.dialogues["at-the-cafe"] = { listened: true, quizBest: 50, quizAttempts: 1, roles: { server: { best: 67, attempts: 2 } }, lastDate: "2026-10-16" };
  state.settings.dialogueShowEnglish = false;
  var back = STORE.parseImport(STORE.exportText(state, 1760000000000));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state, state);
  var fresh = STORE.defaults();
  assert.equal(STORE.hasProgress(fresh), false);
  fresh.dialogues["at-the-cafe"] = { listened: true, quizBest: -1, quizAttempts: 0, roles: {}, lastDate: "2026-10-16" };
  assert.equal(STORE.hasProgress(fresh), true);
});
test("dialogues: dialogueShowEnglish survives save/load; invalid values fall back to true", function () {
  var fake = fakeStorage();
  var STORE = loadFull(fake);
  var st = STORE.defaults();
  st.settings.dialogueShowEnglish = false;
  STORE.save(st);
  assert.equal(STORE.load().settings.dialogueShowEnglish, false);
  var raw = clone(PRE_DLG);
  raw.settings.dialogueShowEnglish = "no";
  assert.equal(STORE.sanitize(raw).settings.dialogueShowEnglish, true);
});

/* ---------- Le Café des Questions: lastAt, prov: stats, selectedProverbActs, 60 dialogues ---------- */
var PK = "prov:cafe-03-the-nephew|flash-fr-en|-", PK2 = "prov:cafe-17-like-father|flash-en-fr|-";
function cafeState(STORE) {
  var st = STORE.sanitize(clone(PRE_DLG));
  st.dialogues["lyon-05-a-closed-door"] = { listened: true, quizBest: 50, quizAttempts: 1, roles: { berthier: { best: 80, attempts: 2 } }, lastDate: "2026-10-17" };
  st.dialogues["cafe-03-the-nephew"] = { listened: true, quizBest: 75, quizAttempts: 1, roles: {}, lastDate: "2026-10-18", lastAt: 1760780000000 };
  st.stats[PK] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 1760780000000 };
  st.stats[PK2] = { box: 0, seen: 1, correct: 0, wrong: 1, last: 1760780000001 };
  st.stats["dlg:cafe-03-the-nephew.q1|dlg-quiz|-"] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1760780000002 };
  st.settings.selectedProverbActs = [1, 3];
  return st;
}
test("café storage: an older v2 save plus Lyon and café records loads with nothing lost", function () {
  var STORE0 = loadFull();
  var saved = cafeState(STORE0);
  var STORE = loadFull(fakeStorage({ "verbTrainer.v1": JSON.stringify(saved) }));
  var state = STORE.load();
  assert.deepEqual(state, saved);
  assert.equal(state.dialogues["cafe-03-the-nephew"].lastAt, 1760780000000);
  assert.deepEqual(state.settings.selectedProverbActs, [1, 3]);
  assert.ok(state.stats[PK] && state.stats[PK2]);
  // the pre-dialogues save still gains exactly its two defaults (no selectedProverbActs added)
  var pre = loadFull(fakeStorage({ "verbTrainer.v1": JSON.stringify(PRE_DLG) })).load();
  assert.equal("selectedProverbActs" in pre.settings, false);
  assert.equal("selectedProverbActs" in STORE.defaults().settings, false);
});
test("café storage: the v1 fixture still migrates with data loaded", function () {
  var STORE = loadFull(fakeStorage({ "verbTrainer.v1": V1_TEXT }));
  var state = STORE.load();
  assert.equal(STORE.wasMigrated(), true);
  assert.equal(state.version, 2);
  assert.equal(JSON.stringify(state.stats), JSON.stringify(V1.stats));
});
test("café storage: all 100 dialogue records survive sanitize", function () {
  var STORE = loadFull();
  var raw = clone(PRE_DLG);
  raw.dialogues = {};
  DLG_DATA.dialogues.forEach(function (d) { raw.dialogues[d.id] = { listened: true, quizBest: 50, quizAttempts: 1, roles: {}, lastDate: "2026-10-18" }; });
  assert.equal(Object.keys(raw.dialogues).length, 100);
  assert.equal(Object.keys(STORE.sanitize(raw).dialogues).length, 100);
});
test("café storage: malformed lastAt, prov: keys and selectedProverbActs are dropped", function () {
  var STORE = loadFull();
  var raw = clone(PRE_DLG);
  raw.dialogues = {};
  [1.5, -1, 0, "1760780000000", 9e15, null].forEach(function (v, i) {
    raw.dialogues[DLG_DATA.dialogues[i].id] = { listened: true, quizBest: -1, quizAttempts: 0, roles: {}, lastDate: "", lastAt: v };
  });
  var s = STORE.sanitize(raw);
  Object.keys(s.dialogues).forEach(function (k) { assert.equal("lastAt" in s.dialogues[k], false, k); });
  var st = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1 };
  raw.stats = {};
  ["prov:cafe-03-the-nephew|flash-fr-en|-", "prov:at-the-cafe|flash-fr-en|-", "prov:lyon-01-moving-in|flash-en-fr|-",
    "prov:cafe-03-the-nephew|dlg-quiz|-", "prov:cafe-03-the-nephew|flash-fr-en|x", "prov:__proto__|flash-fr-en|-",
    "prov:Bad|flash-fr-en|-", "prov:nope-not-here|flash-fr-en|-"].forEach(function (k) { raw.stats[k] = clone(st); });
  assert.deepEqual(Object.keys(STORE.sanitize(raw).stats), ["prov:cafe-03-the-nephew|flash-fr-en|-"]);
  var bare = loadFull(null, false).sanitize(raw);
  assert.deepEqual(Object.keys(bare.stats).sort(), ["prov:at-the-cafe|flash-fr-en|-", "prov:cafe-03-the-nephew|flash-fr-en|-",
    "prov:lyon-01-moving-in|flash-en-fr|-", "prov:nope-not-here|flash-fr-en|-"], "shape only without the data");
  raw.settings.selectedProverbActs = [3, 1, 3, 0, 5, 2.5, "2", 4];
  assert.deepEqual(STORE.sanitize(raw).settings.selectedProverbActs, [1, 3, 4]);
  raw.settings.selectedProverbActs = "1,2";
  assert.equal("selectedProverbActs" in STORE.sanitize(raw).settings, false);
  raw.settings.selectedProverbActs = [];
  assert.deepEqual(STORE.sanitize(raw).settings.selectedProverbActs, []);
});
test("café storage: export → parseImport keeps lastAt, prov: stats and selectedProverbActs; an export without them imports with defaults", function () {
  var STORE = loadFull();
  var state = cafeState(STORE);
  var back = STORE.parseImport(STORE.exportText(state, 1760780000000));
  assert.equal(back.ok, true);
  assert.deepEqual(back.state, state);
  var plain = STORE.sanitize(clone(PRE_DLG));
  var b2 = STORE.parseImport(STORE.exportText(plain, 1760780000000));
  assert.equal(b2.ok, true);
  assert.deepEqual(b2.state, plain);
  assert.equal("selectedProverbActs" in b2.state.settings, false);
});
