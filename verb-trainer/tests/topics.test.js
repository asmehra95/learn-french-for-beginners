/* Topic lessons: grading contract, accent tolerance, alternatives, progress, routes and storage (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

global.window = {};
require("../js/data.js");
require("../js/data-100.js");
require("../js/verb-types.js");
require("../js/topics-data.js");
require("../js/merge-data.js");
var L = require("../js/logic.js");
global.window.VT_LOGIC = L;
var LEARN = require("../js/learn.js");
var TOP = require("../js/topics.js");
var TD = global.window.TOPICS_DATA;

var items = {}, exercises = {};
TD.topics.forEach(function (t) {
  t.exercises.forEach(function (e) {
    exercises[e.id] = e;
    e.items.forEach(function (it) { items[it.id] = it; });
  });
});
var TOL = { accentTolerant: true }, STRICT = { accentTolerant: false };

test("schema: 2 topics, 30 exercises of kind choice/fill/transform, each item answer+accepted XOR parts", function () {
  assert.equal(TD.version, 2);
  assert.deepEqual(TD.topics.map(function (t) { return t.id; }), ["questions", "reflexive"]);
  assert.equal(Object.keys(exercises).length, 30);
  Object.keys(exercises).forEach(function (id) {
    var e = exercises[id];
    assert.ok(["choice", "fill", "transform"].indexOf(e.kind) !== -1, id);
    assert.ok(TOP.lessonExercises(TOP.topicById(TD, id[0] === "Q" ? "questions" : "reflexive"), e.lesson).indexOf(e) !== -1, id);
  });
  Object.keys(items).forEach(function (id) {
    var it = items[id];
    assert.ok(TOP.hasParts(it) !== (it.answer != null), id + ": answer XOR parts");
    if (it.choices) assert.ok(it.choices.indexOf(it.answer) !== -1, id + ": answer is one of the choices");
  });
  assert.deepEqual(TOP.exerciseIds(TD).length, 30);
});

test("every answer and every accepted alternative grades correct, strict and tolerant", function () {
  var n = 0;
  Object.keys(items).forEach(function (id) {
    var it = items[id];
    if (TOP.hasParts(it)) {
      var answers = it.parts.map(function (p) { return p.answer; });
      assert.equal(TOP.gradeItem(it, answers, STRICT).correct, true, id);
      it.parts.forEach(function (p, i) {
        p.accepted.forEach(function (a) {
          var v = answers.slice(); v[i] = a;
          assert.equal(TOP.gradeItem(it, v, STRICT).correct, true, id + " part " + i + " " + a);
          n++;
        });
      });
      n++;
      return;
    }
    TOP.acceptedFor(it).forEach(function (a) {
      assert.equal(TOP.gradeItem(it, a, STRICT).correct, true, id + " " + a);
      assert.equal(TOP.gradeItem(it, a, TOL).correct, true, id + " " + a);
      n++;
    });
  });
  assert.ok(n >= Object.keys(items).length);
});

test("s'asseoir: both conjugation sets are accepted (je m'assieds / je m'assois and the commands)", function () {
  assert.equal(TOP.gradeItem(items["R2-B7"], "m'assieds", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R2-B7"], "m'assois", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R2-B7"], "m’assois", STRICT).correct, true, "curly apostrophe");
  assert.equal(TOP.gradeItem(items["R2-B7"], "assois", STRICT).correct, false, "the reflexive pronoun is required");
  assert.equal(TOP.gradeItem(items["R3-A7"], "Je ne m'assieds pas ici.", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R3-A7"], "je ne m'assois pas ici", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R5-A4"], "Assieds-toi !", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R5-A4"], "Assois-toi!", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R5-B3"], "Ne t'assois pas là !", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R5-B3"], "ne t'assois pas la", TOL).correct, true, "tolerant: là without accent");
  assert.equal(TOP.gradeItem(items["R5-C2"], "Asseyez-vous !", STRICT).correct, true);
  assert.equal(TOP.gradeItem(items["R5-C2"], "Assoyez-vous !", STRICT).correct, true);
});

test("Q6-C6 prefers À quelle heure and still accepts Quand; accents follow the tolerant setting", function () {
  var it = items["Q6-C6"];
  assert.equal(it.answer, "À quelle heure");
  assert.equal(TOP.gradeItem(it, "À quelle heure", STRICT).correct, true);
  assert.equal(TOP.gradeItem(it, "Quand", STRICT).correct, true);
  assert.equal(TOP.gradeItem(it, "a quelle heure", TOL).correct, true);
  var strict = TOP.gradeItem(it, "a quelle heure", STRICT);
  assert.equal(strict.correct, false);
  assert.equal(strict.parts[0].note, "accents");
  var tol = TOP.gradeItem(it, "a quelle heure", TOL);
  assert.equal(tol.parts[0].note, "accents", "a loose match is flagged for the accent note");
  assert.equal(TOP.gradeItem(it, "Pourquoi", TOL).correct, false);
});

test("multi-register transforms: each part graded on its own; the item needs every part", function () {
  var it = items["Q1-B1"];
  assert.equal(it.parts.length, 3);
  var ok = ["Tu aimes le chocolat ?", "Est-ce que tu aimes le chocolat ?", "Aimes-tu le chocolat ?"];
  assert.equal(TOP.gradeItem(it, ok, STRICT).correct, true);
  assert.equal(TOP.gradeItem(it, ["tu aimes le chocolat?", "est-ce que tu aimes le chocolat", "aimes-tu le chocolat"], STRICT).correct, true, "case, missing ? and no space before ? are fine");
  var swapped = TOP.gradeItem(it, [ok[0], ok[2], ok[1]], STRICT);
  assert.equal(swapped.correct, false, "registers must go in their own boxes");
  assert.deepEqual(swapped.parts.map(function (p) { return p.correct; }), [true, false, false]);
  var hyph = TOP.gradeItem(it, [ok[0], "Est ce que tu aimes le chocolat ?", ok[2]], STRICT);
  assert.equal(hyph.correct, false);
  assert.equal(hyph.parts[1].note, "hyphens");
  assert.equal(TOP.gradeItem(it, [ok[0], "", ok[2]], STRICT).correct, false, "an empty box is wrong");
  // Every parts item in the data (Q1-B, Q2-C, Q4-B, R3-B) has labelled parts.
  ["Q1-B", "Q2-C", "Q4-B", "R3-B"].forEach(function (eid) {
    exercises[eid].items.forEach(function (x) {
      assert.ok(TOP.hasParts(x), x.id);
      x.parts.forEach(function (p) { assert.ok(p.label, x.id); });
    });
  });
  assert.equal(TOP.answerText(it), ok.join(" · "));
});

test("Q3-C targets: est-ce que, inversion and casual versions all accepted", function () {
  var it = items["Q3-C1"];
  assert.equal(it.target, "demain");
  ["Quand est-ce que tu pars ?", "Quand pars-tu ?", "Tu pars quand ?"].forEach(function (a) {
    assert.equal(TOP.gradeItem(it, a, STRICT).correct, true, a);
  });
  assert.equal(TOP.gradeItem(items["Q3-C3"], "Combien de soeurs as-tu ?", TOL).correct, true, "œ typed as oe");
});

test("choice items compare the picked option exactly", function () {
  var it = items["Q1-A1"];
  assert.equal(TOP.gradeItem(it, "standard").correct, true);
  assert.equal(TOP.gradeItem(it, "formal").correct, false);
  assert.equal(TOP.gradeItem(it, null).correct, false);
  assert.equal(TOP.gradeItem(items["R1-A12"], "t'").correct, true);
  assert.equal(TOP.gradeItem(items["R1-A12"], "te").correct, false);
});

test("progress: best score kept, done at 80%, lesson and topic totals, suggestion and next exercise", function () {
  var state = { topics: {} };
  var q = TOP.topicById(TD, "questions");
  assert.deepEqual(TOP.lessonProgress(state, q, "Q1"), { done: 0, total: 3, pct: 0 });
  assert.equal(TOP.suggestExercise(state, q).id, "Q1-A");
  TOP.recordRun(state, "Q1-A", 6, 8);          // 75%: tried, not done
  assert.equal(TOP.isDone(state, "Q1-A"), false);
  TOP.recordRun(state, "Q1-A", 7, 8);          // 88%: done
  TOP.recordRun(state, "Q1-A", 2, 8);          // a worse run keeps the best
  assert.deepEqual(state.topics["Q1-A"], { best: 88, attempts: 3 });
  assert.equal(TOP.isDone(state, "Q1-A"), true);
  assert.deepEqual(TOP.lessonProgress(state, q, "Q1"), { done: 1, total: 3, pct: 33 });
  assert.equal(TOP.topicProgress(state, q).total, 16);
  assert.equal(TOP.suggestExercise(state, q).id, "Q1-B");
  assert.equal(TOP.nextExercise(q, "Q1-A").id, "Q1-B");
  assert.equal(TOP.nextExercise(q, "Q6-C"), null);
  assert.equal(TOP.isDone({}, "Q1-A"), false, "no topics record at all");
});

test("routes: #topics, #topics/<topic>, #topics/<topic>/<lesson or exercise>", function () {
  var lb = LEARN.buildLessonsById(global.window.VERB_DATA.lessons);
  assert.equal(LEARN.parseRoute("#topics", lb).name, "topics");
  var r = LEARN.parseRoute("#topics/questions", lb);
  assert.equal(r.name, "topics"); assert.equal(r.topicId, "questions");
  r = LEARN.parseRoute("#topics/reflexive/R2-B", lb);
  assert.equal(r.topicId, "reflexive"); assert.equal(r.exerciseId, "R2-B");
  assert.equal(LEARN.parseRoute("#topics/questions/Q1", lb).exerciseId, "Q1");
  assert.equal(LEARN.parseRoute("#topics/a/b/c", lb).name, "home");
  assert.equal(LEARN.parseRoute("#topics/<x>", lb).name, "home");
});

test("storage: topic records survive a save/load, unknown ids and bad values are dropped, v1 gets topics {}", function () {
  var map = {};
  var fake = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { map[k] = String(v); },
    removeItem: function (k) { delete map[k]; }
  };
  var keepData = global.window.VERB_DATA;
  global.window = { localStorage: fake, VERB_DATA: keepData, TOPICS_DATA: TD };
  delete require.cache[require.resolve("../js/storage.js")];
  require("../js/storage.js");
  var S = global.window.VT_STORAGE;
  var st = S.defaults();
  assert.deepEqual(st.topics, {});
  st.topics = { "Q1-A": { best: 88, attempts: 2 }, "ZZ-9": { best: 50, attempts: 1 }, "Q1-B": { best: 140, attempts: 1 }, "Q1-C": { best: 50, attempts: -3 } };
  S.save(st);
  var back = S.load();
  assert.deepEqual(back.topics, { "Q1-A": { best: 88, attempts: 2 }, "Q1-C": { best: 50, attempts: 0 } });
  map = { "verbTrainer.v1": JSON.stringify({ version: 1, stats: {}, totals: { answered: 3, correct: 2, bestStreak: 1, streak: 0 }, settings: {} }) };
  var v1 = S.load();
  assert.equal(S.wasMigrated(), true);
  assert.deepEqual(v1.topics, {});
  assert.equal(v1.totals.answered, 3);
  assert.ok(map["verbTrainer.v1.backup"], "backup written once");
});
test("speakText (topic Listen text): completed gap sentence, choice prompt, or the answer", function () {
  assert.equal(TOP.speakText({ prompt: "Tu ___ français ? (parler)", answer: "parles" }), "Tu parles français ?");
  assert.equal(TOP.speakText({ prompt: "Tu viens. → ___", answer: "Viens-tu ?" }), "Viens-tu ?");
  assert.equal(TOP.speakText({ prompt: "Quelle heure est-il ?", answer: "formal", choices: ["formal", "casual"] }), "Quelle heure est-il ?");
  assert.equal(TOP.speakText({ prompt: "Ask politely: do you speak English?", answer: "Parlez-vous anglais ?" }), "Parlez-vous anglais ?");
  // every real non-parts item gives a non-empty string
  TD.topics.forEach(function (t) { t.exercises.forEach(function (e) { e.items.forEach(function (it) {
    if (!TOP.hasParts(it)) assert.ok(String(TOP.speakText(it)).length > 0, it.id);
  }); }); });
});
