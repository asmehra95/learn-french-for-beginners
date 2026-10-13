/* Unit tests for js/learn.js (node --test). TZ is set before any Date use so the DST cases are deterministic. */
process.env.TZ = "Europe/Paris";
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

global.window = {};
require("../js/data.js");
require("../js/verb-meta.js");
require("../js/logic.js");
var DATA = global.window.VERB_DATA;
var META = global.window.VERB_META;
var L = global.window.VT_LOGIC;
var LEARN = require("../js/learn.js");
var SYN = require("./fixtures/synthetic-data.js");

function V(id, data) { return (data || DATA).verbs.filter(function (v) { return v.id === id; })[0]; }
function conj(id, p, data) {
  var v = V(id, data);
  var r = L.presentRow(v, p);
  return { verb: v, person: p, family: "conjugate", expected: r.french, accepted: L.acceptedForms(v, p) };
}
function sent(id) { var v = V(id); return { verb: v, family: "sentence", accepted: [v.sentence.verbForm] }; }
function classify(input, item, tolerant, data) {
  return LEARN.classify(input, item, { data: data || DATA, meta: META, accentTolerant: !!tolerant });
}
function captureWarn(fn) {
  var orig = console.warn;
  var out = [];
  console.warn = function (m) { out.push(String(m)); };
  try { fn(); } finally { console.warn = orig; }
  return out;
}
function day(y, m, d, h) { return new Date(y, m - 1, d, h == null ? 12 : h).getTime(); }
function freshState(goal) {
  return {
    stats: {}, totals: { answered: 0, correct: 0, bestStreak: 0, streak: 0 },
    settings: { dailyGoal: goal || 20, sessionLength: 10 },
    daily: { date: "", answered: 0, correct: 0, goalMet: false },
    streak: { current: 0, best: 0, lastDate: "" },
    history: {}, lessons: {}, onboarding: { welcomeDismissed: false, typingTipSeen: false }
  };
}

/* ---------- constants ---------- */
test("constants", function () {
  assert.equal(LEARN.LESSON_SESSION_LENGTH, 10);
  assert.equal(LEARN.QUIZ_PASS_RATIO, 0.8);
  assert.equal(LEARN.REVIEW_FIRST_AT, 8);
  assert.ok(LEARN.AUX_RE.test("j'ai parlé") && LEARN.AUX_RE.test("je suis allé(e)") && !LEARN.AUX_RE.test("il a fallu"));
});

/* ---------- split / pattern / family / type ---------- */
test("splitForm: stem + ending === form for every real row; only faire 2p/3p and dire 2p are irregular outside unique verbs", function () {
  var irregular = [];
  DATA.verbs.forEach(function (v) {
    var fam = LEARN.familyOf(v);
    LEARN.personsOf(v).forEach(function (p) {
      var s = LEARN.splitForm(v, p);
      assert.equal(s.stem + s.ending, L.presentRow(v, p).form.normalize("NFC"), v.id + " " + p);
      if (fam === "unique") assert.equal(s.irregular, true, v.id + " " + p + " unique forms are irregular");
      else if (s.irregular) irregular.push(v.id + " " + p);
    });
  });
  assert.deepEqual(irregular.sort(), ["dire 2p", "faire 2p", "faire 3p"]);
  assert.deepEqual(LEARN.splitForm(V("parler"), "1p"), { stem: "parl", ending: "ons", irregular: false });
  assert.deepEqual(LEARN.splitForm(V("manger"), "1p"), { stem: "mange", ending: "ons", irregular: false });
  assert.deepEqual(LEARN.splitForm(V("prendre"), "3s"), { stem: "prend", ending: "", irregular: false });
});

test("patternFor and displayStems", function () {
  var pv = LEARN.patternFor(V("pouvoir"));
  assert.deepEqual(pv.stems, ["peu", "pouv", "peuv"]);
  assert.equal(pv.bootNote, true);
  assert.equal(pv.stemChanges, true);
  assert.equal(LEARN.patternFor(V("etre")).stemChanges, false);
  assert.equal(LEARN.patternFor(V("parler")).stemChanges, false);
  var mg = LEARN.patternFor(V("manger"));
  assert.deepEqual(mg.stems, ["mang", "mange"]);
  assert.deepEqual(LEARN.displayStems(V("manger"), mg.stems), ["mang"]);
  assert.equal(mg.stemChanges, false);
  var cn = LEARN.patternFor(V("connaitre"));
  assert.deepEqual(LEARN.displayStems(V("connaitre"), cn.stems), ["connai", "connaiss"]);
  assert.equal(cn.stemChanges, true);

  var commencer = { id: "commencer", infinitive: "commencer", regularEr: true, present: [
    { person: "1s", form: "commence" }, { person: "2s", form: "commences" }, { person: "3s", form: "commence" },
    { person: "1p", form: "commençons" }, { person: "2p", form: "commencez" }, { person: "3p", form: "commencent" }] };
  assert.deepEqual(LEARN.displayStems(commencer, LEARN.patternFor(commencer).stems), ["commenc"]);
  var lever = { id: "lever", infinitive: "lever", regularEr: true, present: [
    { person: "1s", form: "lève" }, { person: "2s", form: "lèves" }, { person: "3s", form: "lève" },
    { person: "1p", form: "levons" }, { person: "2p", form: "levez" }, { person: "3p", form: "lèvent" }] };
  assert.deepEqual(LEARN.displayStems(lever, LEARN.patternFor(lever).stems), ["lèv", "lev"]);
});

test("familyOf fallback for verbs without meta", function () {
  assert.equal(LEARN.familyOf({ id: "finir", infinitive: "finir", type: "Regular (-ir, 2nd group)" }), "ir");
  assert.equal(LEARN.familyOf({ id: "entendre", infinitive: "entendre", type: "Regular (-re)" }), "d");
  assert.equal(LEARN.familyOf({ id: "lever", infinitive: "lever", type: "Regular (-er, spelling change: é→è)" }), "er");
  assert.equal(LEARN.familyOf({ id: "zzz", infinitive: "zzz", type: "Irregular" }), "none");
  assert.equal(LEARN.familyOf({ id: "chanter", infinitive: "chanter", regularEr: true }), "er");
  assert.equal(LEARN.familyOf(V("etre")), "unique");
  var counts = {};
  DATA.verbs.forEach(function (v) { var f = LEARN.familyOf(v); counts[f] = (counts[f] || 0) + 1; });
  assert.deepEqual(counts, { "unique": 3, "s-t": 9, "x-t": 2, "d": 3, "er": 8 });
});

test("verbType: 8 regular / 17 irregular, precedence verb.type → meta.type → regularEr", function () {
  var reg = DATA.verbs.filter(function (v) { return LEARN.verbType(v) === "regular"; }).length;
  assert.equal(reg, 8);
  assert.equal(DATA.verbs.length - reg, 17);
  assert.equal(LEARN.verbType({ id: "x", type: "Regular (-er, spelling change: é→è)", regularEr: false }), "regular");
  assert.equal(LEARN.verbType({ id: "x", type: "Irregular (impersonal: il form only)", regularEr: true }), "irregular");
  assert.equal(LEARN.verbType({ id: "x", regularEr: true }), "regular");
  // meta.type overrides regularEr, verb.type overrides meta.type
  META.verbs.__tmp = { family: "er", type: "irregular" };
  try {
    assert.equal(LEARN.verbType({ id: "__tmp", regularEr: true }), "irregular");
    assert.equal(LEARN.verbType({ id: "__tmp", regularEr: true, type: "Regular (-er)" }), "regular");
  } finally { delete META.verbs.__tmp; }
});

/* ---------- classifier ---------- */
var FIXTURES = [
  ["etes", function () { return conj("etre", "2p"); }, false, "accent", "with ê"],
  ["etes", function () { return conj("etre", "2p"); }, true, "accent-note"],
  ["parlé", function () { return conj("parler", "1s"); }, false, "accent", "no accent on e"],
  ["parlé", function () { return conj("parler", "1s"); }, true, "accent-note"],
  ["tu parle", function () { return conj("parler", "1s"); }, false, "wrong-pronoun"],
  ["tu parle", function () { return conj("parler", "1s"); }, true, "wrong-pronoun"],
  ["parler", function () { return conj("parler", "1s"); }, false, "infinitive"],
  ["je parler", function () { return conj("parler", "1s"); }, false, "infinitive"],
  ["parlé", function () { return conj("parler", "2p"); }, false, "participle"],
  ["parlé", function () { return conj("parler", "2p"); }, true, "participle"],
  ["nous parlé", function () { return conj("parler", "1p"); }, false, "participle"],
  ["parlons", function () { return conj("parler", "1s"); }, false, "wrong-person"],
  ["parles", function () { return conj("parler", "1s"); }, false, "wrong-person", "They sound the same"],
  ["fait", function () { return conj("faire", "1s"); }, false, "wrong-person", "vous faites (not 'faisez')"],
  ["fais", function () { return conj("faire", "3s"); }, false, "wrong-person", "vous faites (not 'faisez')"],
  ["disez", function () { return conj("dire", "2p"); }, false, "confusable"],
  ["faisez", function () { return conj("faire", "2p"); }, false, "confusable"],
  ["sais", function () { return sent("connaitre"); }, false, "confusable"],
  ["je sais", function () { return sent("connaitre"); }, false, "confusable"],
  ["et", function () { return conj("etre", "3s"); }, false, "confusable"],
  ["ai", function () { return conj("etre", "1s"); }, false, "etre-avoir"],
  ["a", function () { return conj("etre", "3s"); }, false, "etre-avoir"],
  ["vais", function () { return conj("faire", "1s"); }, false, "other-verb", "aller"],
  ["parel", function () { return conj("parler", "1s"); }, false, "typo"],
  ["prale", function () { return conj("parler", "1s"); }, false, "typo"],
  ["je parel", function () { return conj("parler", "1s"); }, false, "typo"],
  ["xyz", function () { return conj("parler", "1s"); }, false, "generic"],
  ["j'ai", function () { return conj("avoir", "1s"); }, false, "correct"]
];

test("classifier: all 28 fixtures", function () {
  assert.equal(FIXTURES.length, 28);
  FIXTURES.forEach(function (f) {
    var item = f[1]();
    var label = JSON.stringify(f[0]) + " for " + item.verb.id + " " + (item.person || "sentence") + (f[2] ? " (T)" : " (F)");
    if (f[3] === "correct") {
      assert.equal(L.checkAnswer(f[0], item.accepted, { accentTolerant: f[2] }).exact, true, label + ": classify not called");
      assert.equal(classify(f[0], item, f[2]).category, "correct", label);
      return;
    }
    var check = L.checkAnswer(f[0], item.accepted, { accentTolerant: f[2] });
    if (f[3] === "accent-note") assert.ok(check.correct && !check.exact, label + ": tolerant non-exact match");
    else assert.equal(check.correct, false, label + ": answer is wrong");
    var r = classify(f[0], item, f[2]);
    assert.equal(r.category, f[3], label + " → " + r.message);
    if (f[4]) assert.ok(r.message.indexOf(f[4]) !== -1, label + " message contains " + JSON.stringify(f[4]) + ": " + r.message);
    assert.equal(r.message, r.parts.map(function (p) { return p.text; }).join(""), label + ": message is the joined parts");
    r.parts.forEach(function (p) { assert.equal(typeof p.text, "string"); });
  });
});

test("classifier: confusable note is never shown twice; participle echo is truncated to 40 chars", function () {
  var r = classify("fait", conj("faire", "1s"));
  assert.equal(r.message.split("not 'faisez'").length - 1, 1);
  var long = "parlé";
  var item = conj("parler", "2p");
  r = classify(long, item);
  assert.equal(r.parts[0].text, "parlé");
});

test("classifier: auxiliary choice items", function () {
  var aller = V("aller"), parler = V("parler");
  var r = LEARN.classify("j'ai", { verb: aller, family: "choice-aux", correct: "je suis" }, { data: DATA });
  assert.equal(r.category, "etre-avoir");
  assert.ok(/uses être in the past/.test(r.message), r.message);
  assert.ok(/aller, venir, partir/.test(r.message), r.message);
  r = LEARN.classify("je suis", { verb: parler, family: "choice-aux", correct: "j'ai" }, { data: DATA });
  assert.equal(r.category, "etre-avoir");
  assert.ok(/^Most verbs, including parler, use avoir/.test(r.message), r.message);
});

test("classifier: choice meaning and infinitive variants", function () {
  var parler = V("parler");
  var r = LEARN.classify(V("aimer").meaning, { verb: parler, family: "choice-meaning", correct: parler.meaning }, { data: DATA });
  assert.equal(r.category, "other-verb");
  r = LEARN.classify("aimer", { verb: parler, family: "choice-infinitive", correct: "parler" }, { data: DATA });
  assert.equal(r.category, "other-verb");
  assert.ok(/means to like/.test(r.message), r.message);
  r = LEARN.classify("nothing", { verb: parler, family: "choice-infinitive", correct: "parler" }, { data: DATA });
  assert.equal(r.category, "generic");
});

test("sentencePerson", function () {
  assert.deepEqual(LEARN.sentencePerson(V("connaitre")), { person: "2s", personFromSubject: true });
  assert.deepEqual(LEARN.sentencePerson(V("savoir")), { person: "1s", personFromSubject: true });
  assert.deepEqual(LEARN.sentencePerson(V("manger")), { person: "3s", personFromSubject: true });
  assert.deepEqual(LEARN.sentencePerson(V("avoir")), { person: "1s", personFromSubject: true });
  assert.deepEqual(LEARN.sentencePerson(V("partir")), { person: "3s", personFromSubject: false });
  var fallback = DATA.verbs.filter(function (v) { return LEARN.sentencePerson(v).personFromSubject === false; }).map(function (v) { return v.id; });
  assert.deepEqual(fallback, ["partir"]);
  var r = classify("partir", { verb: V("partir"), family: "sentence", accepted: ["part"] });
  assert.equal(r.category, "infinitive");
  assert.ok(/In this sentence you need/.test(r.message), r.message);
});

test("osaDistance", function () {
  assert.equal(LEARN.osaDistance("parel", "parle"), 1);
  assert.equal(LEARN.osaDistance("abc", "abc"), 0);
  assert.equal(LEARN.osaDistance("abc", ""), 3);
  assert.equal(LEARN.osaDistance("", "abc"), 3);
  assert.equal(LEARN.osaDistance("kitten", "sitting"), 3);
});

/* ---------- hints ---------- */
test("hintFor levels 1 and 2", function () {
  var parler1p = { verb: V("parler"), person: "1p", family: "conjugate" };
  var h1 = LEARN.hintFor(parler1p, 1);
  assert.equal(h1.mask, "p _ _ _ _ _ _");
  assert.equal(h1.maskLabel, "starts with p, 7 letters");
  var h2 = LEARN.hintFor(parler1p, 2);
  assert.equal(h2.mask, "parl _ _ _");
  assert.ok(/-er endings/.test(h2.parts.map(function (p) { return p.text; }).join("")));
  var etre = { verb: V("etre"), person: "1s", family: "conjugate" };
  assert.equal(LEARN.hintFor(etre, 1).mask, "s _ _ _");
  assert.equal(LEARN.hintFor(etre, 2).mask, "su _ _");
  var sentence = { verb: V("connaitre"), family: "sentence" };
  assert.equal(LEARN.hintFor(sentence, 2).mask, "connai _");
});

/* ---------- item keys ---------- */
test("itemsFor: 24 per current verb; itemKeysFor is the single key source", function () {
  DATA.verbs.forEach(function (v) {
    assert.equal(LEARN.itemsFor(v).length, 24, v.id);
    assert.deepEqual(LEARN.itemsFor(v), LEARN.itemKeysFor(v));
    assert.ok(LEARN.itemKeysFor(v).indexOf(v.id + "|choice-aux|-") !== -1);
  });
  assert.deepEqual(LEARN.itemKeysFor(V("parler")).slice(0, 3), ["parler|flash-inf-meaning|-", "parler|flash-meaning-inf|-", "parler|flash-conj|1s"]);
  var oneRow = { id: "falloir", infinitive: "falloir", present: [{ person: "3s", pronoun: "il", form: "faut", french: "il faut" }],
    past: { french: "il a fallu", auxiliary: "avoir", participle: "fallu" } };
  assert.equal(LEARN.itemsFor(oneRow).length, 6);
  oneRow.sentence = { french: "Il faut partir.", verbForm: "faut" };
  assert.equal(LEARN.itemsFor(oneRow).length, 8);
  var broken = { id: "broken", infinitive: "x", present: [{ person: "1s", pronoun: "je", form: "x" }], sentence: { french: "Nothing here.", verbForm: "zz" } };
  var warns = captureWarn(function () { LEARN.itemsFor(broken); LEARN.itemsFor(broken); });
  assert.equal(warns.length, 1, "one warning per verb id");
  assert.ok(/verbTrainer: sentence for broken/.test(warns[0]));
  assert.equal(LEARN.itemsFor(broken).length, 6);
});

/* ---------- deck, weakest, suggestion ---------- */
function deckState() {
  var s = freshState();
  s.stats = {
    "parler|conjugate|1s": { box: 0, seen: 3, correct: 1, wrong: 2, last: 100 },
    "parler|conjugate|2s": { box: 1, seen: 2, correct: 1, wrong: 1, last: 300 },
    "etre|choice-form|1s": { box: 0, seen: 1, correct: 0, wrong: 1, last: 200 },
    "faire|sentence|-": { box: 3, seen: 5, correct: 4, wrong: 1, last: 500 },
    "aimer|conjugate|1s": { box: 0, seen: 4, correct: 4, wrong: 0, last: 50 },
    "ghost|conjugate|1s": { box: 0, seen: 3, correct: 0, wrong: 3, last: 900 },
    "avoir|conjugate|1s": { box: 1, seen: 4, correct: 2, wrong: 1, last: 300 }
  };
  s.totals.answered = 22;
  return s;
}

test("mistakesDeck: selection and order; unknown verbs ignored", function () {
  assert.deepEqual(LEARN.mistakesDeck(deckState(), DATA), [
    "etre|choice-form|1s", "parler|conjugate|1s", "avoir|conjugate|1s", "parler|conjugate|2s"
  ]);
  assert.deepEqual(LEARN.mistakesDeck(freshState(), DATA), []);
});

test("weakestVerbs: seen >= 3 threshold, tie-breaks, empty", function () {
  var w = LEARN.weakestVerbs(deckState(), DATA, 3);
  // parler: seen 5, correct 2 (40%); avoir: seen 4, correct 2 (50%); etre: seen 1 (below threshold)
  assert.deepEqual(w.map(function (x) { return x.verb.id; }), ["parler", "avoir"]);
  assert.equal(Math.round(w[0].accuracy * 100), 40);
  var s = deckState();
  s.stats["avoir|conjugate|1s"] = { box: 1, seen: 5, correct: 2, wrong: 1, last: 300 }; // same accuracy as parler, same seen
  assert.deepEqual(LEARN.weakestVerbs(s, DATA, 3).map(function (x) { return x.verb.id; }), ["avoir", "parler"], "ties keep DATA.verbs order");
  s.stats["avoir|conjugate|1s"] = { box: 1, seen: 10, correct: 4, wrong: 1, last: 300 }; // 40%, more seen → first
  assert.deepEqual(LEARN.weakestVerbs(s, DATA, 1).map(function (x) { return x.verb.id; }), ["avoir"]);
  assert.deepEqual(LEARN.weakestVerbs(freshState(), DATA, 3), []);
});

test("suggestNext: the five rules", function () {
  var now = day(2026, 5, 10);
  var s = freshState();
  var r = LEARN.suggestNext(s, DATA, now);
  assert.equal(r.href, "#lesson/1");
  assert.equal(r.title, "Start Lesson 1: " + DATA.lessons[0].title);

  s = freshState();
  s.totals.answered = 30;
  for (var i = 0; i < 8; i++) s.stats["parler|conjugate|" + ["1s", "2s", "3s", "1p", "2p", "3p"][i % 6] + (i >= 6 ? "x" : "")] = { box: 0, seen: 1, correct: 0, wrong: 1, last: i };
  r = LEARN.suggestNext(s, DATA, now);
  assert.equal(r.href, "#review");
  assert.equal(r.title, "Review 8 mistakes");

  s = freshState();
  s.totals.answered = 5;
  assert.equal(LEARN.suggestNext(s, DATA, now).href, "#browse/lesson/1");
  s.lessons["1"] = { learned: true, practiced: false, quizBest: -1, quizPassed: false };
  assert.equal(LEARN.suggestNext(s, DATA, now).href, "#conjugate/lesson/1/path");
  s.lessons["1"].practiced = true;
  r = LEARN.suggestNext(s, DATA, now);
  assert.equal(r.href, "#choice/lesson/1/path");
  assert.ok(/Score 8 or more/.test(r.reason));
  s.lessons["1"].quizPassed = true;
  assert.equal(LEARN.suggestNext(s, DATA, now).href, "#browse/lesson/2");

  DATA.lessons.forEach(function (l) { s.lessons[String(l.id)] = { learned: true, practiced: true, quizBest: 90, quizPassed: true }; });
  s.stats["parler|conjugate|1s"] = { box: 0, seen: 1, correct: 0, wrong: 1, last: 1 };
  assert.equal(LEARN.suggestNext(s, DATA, now).href, "#review", "rule 4");
  delete s.stats["parler|conjugate|1s"];
  r = LEARN.suggestNext(s, DATA, now);
  assert.equal(r.href, "#choice/all", "rule 5");
  assert.equal(r.title, "Mixed quiz: all lessons");
});

/* ---------- dates ---------- */
test("dayKey is local; prevDayKey across month, year and DST boundaries", function () {
  assert.equal(LEARN.dayKey(new Date(2026, 0, 5, 0, 30)), "2026-01-05"); // 23:30 UTC the day before
  assert.equal(LEARN.dayKey(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
  assert.equal(LEARN.prevDayKey("2026-03-01"), "2026-02-28");
  assert.equal(LEARN.prevDayKey("2024-03-01"), "2024-02-29");
  assert.equal(LEARN.prevDayKey("2026-01-01"), "2025-12-31");
  assert.equal(LEARN.prevDayKey("2026-03-30"), "2026-03-29"); // the DST change day in Europe
  assert.equal(LEARN.prevDayKey("2026-03-29"), "2026-03-28");
  assert.equal(LEARN.prevDayKey("2026-10-26"), "2026-10-25");
});

test("recordDay: streak continues, resets, and never double counts", function () {
  var s = freshState(2);
  s.streak = { current: 3, best: 5, lastDate: "2026-05-09" };
  LEARN.recordDay(s, day(2026, 5, 10), true);
  assert.equal(s.streak.current, 3, "goal not met yet");
  LEARN.recordDay(s, day(2026, 5, 10), false);
  assert.deepEqual(s.daily, { date: "2026-05-10", answered: 2, correct: 1, goalMet: true });
  assert.deepEqual(s.streak, { current: 4, best: 5, lastDate: "2026-05-10" });
  LEARN.recordDay(s, day(2026, 5, 10), true);
  assert.equal(s.streak.current, 4, "no double count");
  assert.equal(s.history["2026-05-10"], 3);

  // a gap resets to 1
  LEARN.recordDay(s, day(2026, 5, 13), true);
  LEARN.recordDay(s, day(2026, 5, 13), true);
  assert.deepEqual(s.streak, { current: 1, best: 5, lastDate: "2026-05-13" });
  // DST: 28 → 29 March counts as consecutive
  s = freshState(1);
  s.streak = { current: 1, best: 1, lastDate: "2026-03-28" };
  LEARN.recordDay(s, day(2026, 3, 29, 9), true);
  assert.deepEqual(s.streak, { current: 2, best: 2, lastDate: "2026-03-29" });
});

test("recordDay: clock going backwards restores history and leaves the streak alone", function () {
  var s = freshState(2);
  s.history = { "2026-05-09": 5, "2026-05-10": 1 };
  s.daily = { date: "2026-05-10", answered: 1, correct: 1, goalMet: false };
  s.streak = { current: 2, best: 4, lastDate: "2026-05-08" };
  var warns = captureWarn(function () { LEARN.recordDay(s, day(2026, 5, 9), true); });
  assert.equal(s.daily.date, "2026-05-09");
  assert.equal(s.daily.answered, 6, "continues the earlier count");
  assert.equal(s.history["2026-05-09"], 6);
  assert.ok(warns.length <= 1);

  s = freshState(2);
  s.history = { "2026-05-10": 3 };
  s.daily = { date: "2026-05-10", answered: 3, correct: 3, goalMet: true };
  s.streak = { current: 4, best: 4, lastDate: "2026-05-10" };
  var before = JSON.parse(JSON.stringify(s.streak));
  captureWarn(function () {
    LEARN.recordDay(s, day(2026, 5, 8), true);
    LEARN.recordDay(s, day(2026, 5, 8), true);
  });
  assert.equal(s.daily.goalMet, true);
  assert.deepEqual(s.streak, before);
});

test("displayStreak, todayCount, todayGoalMet are read-only views of the day", function () {
  var s = freshState(2);
  s.streak = { current: 5, best: 5, lastDate: "2026-05-09" };
  s.daily = { date: "2026-05-09", answered: 7, correct: 7, goalMet: true };
  var snapshot = JSON.stringify(s);
  assert.equal(LEARN.displayStreak(s, day(2026, 5, 9)), 5);
  assert.equal(LEARN.displayStreak(s, day(2026, 5, 10)), 5, "yesterday still counts");
  assert.equal(LEARN.displayStreak(s, day(2026, 5, 11)), 0, "0 after a gap");
  assert.equal(LEARN.todayCount(s, day(2026, 5, 10)), 0);
  assert.equal(LEARN.todayGoalMet(s, day(2026, 5, 10)), false);
  assert.equal(LEARN.todayCount(s, day(2026, 5, 9)), 7);
  assert.equal(LEARN.todayGoalMet(s, day(2026, 5, 9)), true);
  assert.equal(JSON.stringify(s), snapshot, "nothing mutated");
});

test("recordDay trims history to 60 keys", function () {
  var s = freshState(100);
  for (var i = 0; i < 70; i++) s.history[LEARN.dayKey(new Date(2026, 0, 1 + i))] = 1;
  LEARN.recordDay(s, day(2026, 6, 1), true);
  var keys = Object.keys(s.history).sort();
  assert.equal(keys.length, 60);
  assert.equal(keys[keys.length - 1], "2026-06-01");
});

test("reevaluateGoal", function () {
  var s = freshState(20);
  s.daily = { date: "2026-05-10", answered: 12, correct: 10, goalMet: false };
  s.history = { "2026-05-10": 12 };
  s.streak = { current: 3, best: 3, lastDate: "2026-05-09" };
  s.settings.dailyGoal = 10;
  LEARN.reevaluateGoal(s, day(2026, 5, 10));
  assert.equal(s.daily.goalMet, true);
  assert.deepEqual(s.streak, { current: 4, best: 4, lastDate: "2026-05-10" });
  assert.equal(s.daily.answered, 12);
  LEARN.recordDay(s, day(2026, 5, 10), true);
  assert.equal(s.streak.current, 4, "credited once");
  s.settings.dailyGoal = 50;
  LEARN.reevaluateGoal(s, day(2026, 5, 10));
  assert.equal(s.daily.goalMet, true, "raising the goal never revokes");

  var y = freshState(10);
  y.daily = { date: "2026-05-09", answered: 12, correct: 10, goalMet: false };
  var copy = JSON.parse(JSON.stringify(y));
  LEARN.reevaluateGoal(y, day(2026, 5, 10));
  assert.deepEqual(y, copy, "daily from yesterday: unchanged");

  var b = freshState(10);
  b.daily = { date: "2026-05-08", answered: 12, correct: 10, goalMet: false };
  b.streak = { current: 2, best: 2, lastDate: "2026-05-10" };
  LEARN.reevaluateGoal(b, day(2026, 5, 8));
  assert.equal(b.daily.goalMet, true);
  assert.deepEqual(b.streak, { current: 2, best: 2, lastDate: "2026-05-10" }, "clock backwards: streak unchanged");
});

/* ---------- router ---------- */
test("parseRoute", function () {
  var byId = LEARN.buildLessonsById(DATA.lessons);
  function pr(h) { return LEARN.parseRoute(h, byId); }
  function sub(r, keys) { var o = {}; keys.forEach(function (k) { o[k] = r[k]; }); return o; }
  var K = ["name", "scope", "lessonId", "verbId", "redirect"];
  assert.deepEqual(sub(pr("#browse/lesson/2/manger"), K), { name: "browse", scope: "lesson", lessonId: 2, verbId: "manger", redirect: null });
  assert.deepEqual(sub(pr("#browse/lesson/2/etre"), K), { name: "browse", scope: "lesson", lessonId: 2, verbId: null, redirect: "#browse/lesson/2" });
  assert.equal(pr("#browse/lesson/2/BAD!").redirect, "#browse/lesson/2");
  assert.equal(pr("#conjugate/lesson/2/path").path, true);
  assert.equal(pr("#choice/lesson/2/path").path, true);
  assert.equal(pr("#conjugate/lesson/2").path, false);
  assert.equal(pr("#sentences/lesson/2/path").name, "home");
  assert.equal(pr("#conjugate/lesson/2/manger").name, "home");
  assert.equal(pr("#choice/lesson/2/path/x").name, "home");
  assert.equal(pr("#lesson/99").name, "home");
  assert.equal(pr("#lesson/2").lessonId, 2);
  assert.equal(pr("#lesson/abc").name, "home");
  assert.equal(pr("#choice/all").scope, "all");
  assert.equal(pr("#conjugate/all").name, "home");
  assert.equal(pr("#conjugate").scope, "filter");
  assert.equal(pr("").name, "home");
  assert.equal(pr("#").name, "home");
  assert.equal(pr("#nonsense").name, "home");
  assert.equal(pr("#progress").name, "progress");
  assert.equal(pr("#progress/x").name, "home");
  assert.deepEqual(sub(pr("#review"), ["name", "scope", "lessonId"]), { name: "review", scope: "deck", lessonId: null });
  assert.deepEqual(sub(pr("#review/lesson/2"), ["name", "scope", "lessonId"]), { name: "review", scope: "deck", lessonId: 2 });
  assert.deepEqual(sub(pr("#review/session"), ["name", "scope"]), { name: "review", scope: "session" });
  assert.equal(pr("#review/lesson/99").name, "home");
  assert.equal(pr("#review/lesson/2/path").name, "home");
  assert.equal(pr("#review/other").name, "home");
  assert.equal(pr("#home").redirect, null);
});
test("parseRoute: #explain and the #topic alias (redirects to #topics/...)", function () {
  var byId = LEARN.buildLessonsById(DATA.lessons);
  function pr(h) { return LEARN.parseRoute(h, byId); }
  function sub(r, keys) { var o = {}; keys.forEach(function (k) { o[k] = r[k]; }); return o; }
  assert.deepEqual(sub(pr("#explain"), ["name", "scope", "redirect"]), { name: "explain", scope: "all", redirect: null });
  assert.equal(pr("#explain/x").name, "home");
  var T = ["name", "scope", "topicId", "exerciseId", "redirect"];
  assert.deepEqual(sub(pr("#topic/reflexive/R2"), T), { name: "topics", scope: "exercise", topicId: "reflexive", exerciseId: "R2", redirect: "#topics/reflexive/R2" });
  assert.deepEqual(sub(pr("#topic/questions"), T), { name: "topics", scope: "topic", topicId: "questions", exerciseId: undefined, redirect: "#topics/questions" });
  assert.deepEqual(sub(pr("#topic"), ["name", "scope", "redirect"]), { name: "topics", scope: "all", redirect: "#topics" });
  assert.equal(pr("#topic/Bad!").name, "home");
  assert.equal(pr("#topic/Bad!").redirect, null);
  assert.equal(pr("#topic/reflexive/R2/x").name, "home");
  assert.equal(pr("#topic/reflexive/R 2").name, "home");
  // the canonical route is unchanged and never redirects
  assert.deepEqual(sub(pr("#topics/reflexive/R2"), T), { name: "topics", scope: "exercise", topicId: "reflexive", exerciseId: "R2", redirect: null });
});
test("explainMode: helper only for http: and https:", function () {
  assert.equal(LEARN.explainMode("file:"), "file");
  assert.equal(LEARN.explainMode("http:"), "helper");
  assert.equal(LEARN.explainMode("https:"), "helper");
  assert.equal(LEARN.explainMode(""), "file");
  assert.equal(LEARN.explainMode("about:"), "file");
  assert.equal(LEARN.explainMode(undefined), "file");
});

test("buildLessonsById / buildLessonOf: duplicates warn, first wins", function () {
  var lessonOf = LEARN.buildLessonOf(DATA.lessons, DATA.verbs);
  DATA.verbs.forEach(function (v) { assert.equal(lessonOf[v.id], v.lesson, v.id); });
  var dup = SYN.duplicateLessons(DATA);
  var map;
  var warns = captureWarn(function () { map = LEARN.buildLessonsById(dup.lessons); });
  assert.equal(map["7"].title, "Synthetic A");
  assert.deepEqual(warns, ["verbTrainer: duplicate lesson id 7"]);
  warns = captureWarn(function () {
    LEARN.buildLessonOf([{ id: 1, verbIds: ["a", "b"] }, { id: 2, verbIds: ["b"] }]);
  });
  assert.deepEqual(warns, ["verbTrainer: verb b is in more than one lesson"]);
  assert.deepEqual(LEARN.buildLessonOf([{ id: 1, verbIds: ["a", "b"] }, { id: 2, verbIds: ["b"] }]), { a: 1, b: 1 });
});

/* ---------- displayFor and the choice rotation ---------- */
test("displayFor", function () {
  var parler = V("parler"), aller = V("aller"), aimer = V("aimer");
  var row = L.presentRow(parler, "1s");
  assert.deepEqual(LEARN.displayFor({ key: "parler|conjugate|1s", kind: "typed", verb: parler, person: "1s", family: "conjugate" }),
    { french: "je parle", pronunciation: row.pronunciation, audioKey: "parler|1s" });
  assert.deepEqual(LEARN.displayFor({ key: "parler|sentence|-", kind: "typed", verb: parler, family: "sentence" }),
    { french: parler.sentence.french, pronunciation: parler.sentence.pronunciation, audioKey: "parler|sentence" });
  var aux = LEARN.displayFor({ key: "aller|choice-aux|-", kind: "choice", verb: aller, family: "aux", listen: { text: aller.past.french, key: "aller|past" } });
  assert.equal(aux.pronunciation, aller.past.pronunciation);
  assert.equal(aux.audioKey, "aller|past");
  var meaning = LEARN.displayFor({ key: "aimer|choice-meaning|-", kind: "choice", verb: aimer, family: "meaning", listen: { text: aimer.infinitive, key: "aimer|inf" } });
  assert.equal(meaning.pronunciation, aimer.pronunciation);
  var form = LEARN.displayFor({ key: "aimer|choice-form|2s", kind: "choice", verb: aimer, family: "form", listen: { text: "tu aimes", key: "aimer|2s" } });
  assert.equal(form.pronunciation, L.presentRow(aimer, "2s").pronunciation);
  assert.equal(LEARN.displayFor({ key: "aimer|choice-x|-", kind: "choice", verb: aimer, listen: { text: "x", key: "aimer|other" } }).pronunciation, "");
  assert.deepEqual(LEARN.displayFor({ key: "aimer|flash-conj|2s", verb: aimer, person: "2s" }).audioKey, "aimer|2s");
  assert.deepEqual(LEARN.displayFor({ key: "aimer|flash-meaning-inf|-", verb: aimer }),
    { french: aimer.infinitive, pronunciation: aimer.pronunciation, audioKey: "aimer|inf" });
});

test("choiceTypeOrder and the rotation", function () {
  assert.deepEqual(LEARN.choiceTypeOrder(["form", "meaning", "sentence"], false), ["form", "meaning", "sentence"]);
  assert.deepEqual(LEARN.choiceTypeOrder(["aux", "sentence", "form", "meaning"], false), ["form", "meaning", "sentence", "aux"]);
  var seed = 7;
  function rng() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var sh = LEARN.choiceTypeOrder(["form", "meaning", "sentence", "aux"], true, rng);
  assert.deepEqual(sh.slice().sort(), ["aux", "form", "meaning", "sentence"]);
  var order = LEARN.choiceTypeOrder(["form", "meaning", "sentence", "aux"], false);
  var typeIndex = 0, seen = [];
  for (var i = 0; i < 5; i++) seen.push(order[typeIndex++ % order.length]);
  assert.deepEqual(seen, ["form", "meaning", "sentence", "aux", "form"]);
});

/* ---------- data-driven: a synthetic dataset with non-contiguous lessons, one-row and pronominal verbs ---------- */
test("data-driven: synthetic dataset (lessons 7, 12, 30; falloir; se lever)", function () {
  var D = SYN.build(DATA);
  assert.equal(D.lessons.length, 3);
  assert.equal(D.verbs.length, 8);
  var falloir = V("falloir", D), seLever = V("se-lever", D);
  D.verbs.forEach(function (v) {
    var keys = LEARN.itemKeysFor(v);
    assert.deepEqual(LEARN.itemsFor(v), keys);
    LEARN.patternFor(v);
    LEARN.personsOf(v).forEach(function (p) {
      var s = LEARN.splitForm(v, p);
      assert.equal(s.stem + s.ending, L.presentRow(v, p).form.normalize("NFC"));
      var acc = L.acceptedForms(v, p);
      assert.ok(acc.length >= 2);
      var item = { verb: v, person: p, family: "conjugate", expected: L.presentRow(v, p).french, accepted: acc };
      assert.equal(typeof LEARN.classify("xyz", item, { data: D }).category, "string");
      LEARN.hintFor(item, 1);
      LEARN.hintFor(item, 2);
    });
  });
  assert.equal(LEARN.itemsFor(falloir).length, 6);
  assert.equal(LEARN.itemKeysFor(falloir).indexOf("falloir|choice-aux|-"), -1);
  assert.equal(LEARN.itemKeysFor(seLever).indexOf("se-lever|choice-aux|-"), -1);
  assert.equal(LEARN.familyOf(V("finir", D)), "ir");
  assert.equal(LEARN.familyOf(falloir), "none");
  assert.equal(LEARN.familyOf(seLever), "er");
  assert.equal(LEARN.verbType(seLever), "regular");
  assert.equal(LEARN.verbType(falloir), "irregular");
  assert.deepEqual(LEARN.splitForm(falloir, "3s"), { stem: "faut", ending: "", irregular: false });
  assert.deepEqual(LEARN.splitForm(seLever, "1s"), { stem: "lèv", ending: "e", irregular: false });

  var s1 = { verb: seLever, person: "1s", family: "conjugate", expected: "je me lève", accepted: L.acceptedForms(seLever, "1s") };
  // Reflexive answers must include the reflexive pronoun (user requirement): "me lève" or "je me lève".
  assert.equal(L.checkAnswer("lève", s1.accepted).correct, false, "bare lève is not accepted");
  assert.equal(L.checkAnswer("me lève", s1.accepted).exact, true);
  assert.equal(L.checkAnswer("je me lève", s1.accepted).exact, true);
  assert.equal(LEARN.classify("me lève", s1, { data: D }).category, "correct");
  assert.equal(LEARN.classify("lève", s1, { data: D }).category, "missing-reflexive");
  assert.equal(LEARN.classify("leve", s1, { data: D }).category, "missing-reflexive");
  assert.equal(LEARN.classify("tu te lève", s1, { data: D }).category, "wrong-pronoun");

  var byId = LEARN.buildLessonsById(D.lessons);
  var lessonOf = LEARN.buildLessonOf(D.lessons, D.verbs);
  assert.equal(lessonOf["se-lever"], 12);
  assert.equal(LEARN.parseRoute("#lesson/30", byId).lessonId, 30);
  assert.equal(LEARN.parseRoute("#lesson/1", byId).name, "home");
  assert.equal(LEARN.parseRoute("#browse/lesson/12/se-lever", byId).verbId, "se-lever");

  var st = freshState();
  assert.equal(LEARN.suggestNext(st, D, day(2026, 5, 10)).href, "#lesson/7");
  st.totals.answered = 9;
  st.stats["falloir|conjugate|3s"] = { box: 0, seen: 4, correct: 1, wrong: 3, last: 5 };
  st.stats["se-lever|conjugate|1p"] = { box: 0, seen: 1, correct: 0, wrong: 1, last: 9 };
  assert.deepEqual(LEARN.mistakesDeck(st, D), ["se-lever|conjugate|1p", "falloir|conjugate|3s"]);
  assert.deepEqual(LEARN.weakestVerbs(st, D, 3).map(function (x) { return x.verb.id; }), ["falloir"]);
  assert.equal(LEARN.suggestNext(st, D, day(2026, 5, 10)).href, "#browse/lesson/7");
  var totals = D.lessons.map(function (l) {
    return l.verbIds.reduce(function (n, id) { return n + LEARN.itemsFor(V(id, D)).length; }, 0);
  });
  assert.deepEqual(totals, [
    LEARN.itemsFor(V("chanter", D)).length + LEARN.itemsFor(V("finir", D)).length + 24,
    6 + LEARN.itemsFor(seLever).length + 24,
    48
  ]);
});

test("VERB_META missing: built-in families, no confusables, one warning", function () {
  var savedWindow = global.window;
  var learnPath = require.resolve("../js/learn.js");
  delete require.cache[learnPath];
  global.window = { VT_LOGIC: L };
  var warns;
  try {
    var fresh;
    warns = captureWarn(function () {
      fresh = require("../js/learn.js");
      assert.equal(fresh.familyOf(V("parler")), "er");
      assert.equal(fresh.familyOf(V("etre")), "none", "no meta: unique is only ever explicit");
      assert.equal(fresh.verbType(V("parler")), "regular");
      assert.deepEqual(fresh.splitForm(V("parler"), "1p"), { stem: "parl", ending: "ons", irregular: false });
      assert.equal(fresh.classify("fait", conj("faire", "1s"), { data: DATA, meta: { confusables: [] } }).category, "wrong-person");
    });
  } finally {
    global.window = savedWindow;
    delete require.cache[learnPath];
    require("../js/learn.js");
  }
  assert.equal(warns.filter(function (w) { return /VERB_META is missing/.test(w); }).length, 1);
});

/* ---------- static: no hard-coded verb or lesson counts ---------- */
test("static: no literal 25-verb / 5-lesson copy in app.js, views-*.js or index.html", function () {
  var root = path.join(__dirname, "..");
  var files = [path.join(root, "js/app.js"), path.join(root, "index.html")].concat(
    fs.readdirSync(path.join(root, "js")).filter(function (f) { return /^views-.*\.js$/.test(f); }).map(function (f) { return path.join(root, "js", f); }));
  var re = /\b25 (most|verbs)\b|\bof 25\b|\b5 lessons\b|all 25\b/i;
  files.forEach(function (f) {
    var text = fs.readFileSync(f, "utf8");
    var m = text.match(re);
    assert.ok(!m, path.basename(f) + " contains " + (m && JSON.stringify(m[0])));
  });
});
