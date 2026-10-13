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
