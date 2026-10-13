/* Unit tests for js/logic.js (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

global.window = {};
require("../js/data.js");
var DATA = global.window.VERB_DATA;
var L = require("../js/logic.js");
var SNAPSHOT = require("./fixtures/accepted-forms-v1.json");

function synthRow(person, pronoun, form) {
  return { id: "synth", present: [{ person: person, pronoun: pronoun, form: form, french: pronoun + " " + form }] };
}

test("PERSONS and promptPronoun are exported", function () {
  assert.deepEqual(L.PERSONS, ["1s", "2s", "3s", "1p", "2p", "3p"]);
  assert.equal(L.promptPronoun({ pronoun: "j'" }), "j'");
  assert.equal(L.promptPronoun({ pronoun: "il/elle" }), "il/elle");
  assert.equal(L.promptPronoun({ pronoun: "nous" }), "nous");
});

test("acceptedForms is unchanged for every real present row (snapshot of the v1 implementation)", function () {
  var rows = [];
  DATA.verbs.forEach(function (v) {
    v.present.forEach(function (p) { rows.push({ key: v.id + "|" + p.person, forms: L.acceptedForms(v, p.person) }); });
  });
  assert.deepEqual(rows, SNAPSHOT);
});

test("acceptedForms for reflexive rows always includes the reflexive pronoun", function () {
  assert.deepEqual(L.acceptedForms(synthRow("1s", "je me", "lève"), "1s"), ["me lève", "je me lève"]);
  assert.deepEqual(L.acceptedForms(synthRow("3s", "il/elle se", "lève"), "3s"), ["se lève", "il se lève", "elle se lève", "on se lève"]);
  assert.deepEqual(L.acceptedForms(synthRow("1s", "je m'", "appelle"), "1s"), ["m'appelle", "je m'appelle"]);
  assert.deepEqual(L.acceptedForms(synthRow("1p", "nous nous", "levons"), "1p"), ["nous levons", "nous nous levons"]);
  var acc = L.acceptedForms(synthRow("1s", "je me", "lève"), "1s");
  assert.equal(L.checkAnswer("je me lève", acc).correct, true);
  assert.equal(L.checkAnswer("me lève", acc).correct, true);
  assert.equal(L.checkAnswer("me leve", acc, { accentTolerant: true }).correct, true);
  assert.equal(L.checkAnswer("lève", acc).correct, false, "bare form without the pronoun is not accepted");
});

test("updateStat: existing behavior unchanged", function () {
  var s = L.updateStat(null, true, 100);
  assert.deepEqual(s, { box: 1, seen: 1, correct: 1, wrong: 0, last: 100 });
  s = L.updateStat(s, true, 200);
  assert.equal(s.box, 2);
  s = L.updateStat({ box: 4, seen: 9, correct: 9, wrong: 0, last: 1 }, true, 300);
  assert.equal(s.box, 4, "box is capped at 4");
  s = L.updateStat(s, false, 400);
  assert.deepEqual(s, { box: 0, seen: 11, correct: 10, wrong: 1, last: 400 });
});

test("updateStat with {hinted:true} counts the answer but keeps the box", function () {
  var before = { box: 2, seen: 5, correct: 4, wrong: 1, last: 10 };
  var s = L.updateStat(before, true, 50, { hinted: true });
  assert.deepEqual(s, { box: 2, seen: 6, correct: 5, wrong: 1, last: 50 });
  assert.equal(L.updateStat(null, true, 1, { hinted: true }).box, 0, "a hinted first answer stays in box 0");
  // A hinted wrong answer is still wrong.
  assert.deepEqual(L.updateStat(before, false, 60, { hinted: true }), { box: 0, seen: 6, correct: 4, wrong: 2, last: 60 });
  assert.equal(L.updateStat(before, true, 70, {}).box, 3, "opts without hinted promotes as usual");
});

test("checkAnswer accepts pronoun forms and tolerant accents", function () {
  var connaitre = DATA.verbs.filter(function (v) { return v.id === "connaitre"; })[0];
  var acc = L.acceptedForms(connaitre, "3s");
  assert.equal(L.checkAnswer("il connaît", acc).exact, true);
  assert.equal(L.checkAnswer("connait", acc, { accentTolerant: true }).correct, true);
  assert.equal(L.checkAnswer("connait", acc, { accentTolerant: false }).correct, false);
});
