/* Content integration: data.js + data-100.js + verb-types.js merged by merge-data.js (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

global.window = {};
require("../js/data.js");
var ORIGINAL_COUNT = global.window.VERB_DATA.verbs.length;
require("../js/data-100.js");
require("../js/verb-types.js");
require("../js/topics-data.js");
var MERGE = require("../js/merge-data.js");
require("../js/verb-meta.js");
var DATA = global.window.VERB_DATA;
var TYPES = global.window.VERB_TYPES;
var L = require("../js/logic.js");
var LEARN = require("../js/learn.js");

function V(id) { return DATA.verbs.filter(function (v) { return v.id === id; })[0]; }

test("merge: 125 unique verb ids in 25 unique lessons, each verb in exactly one lesson", function () {
  assert.equal(ORIGINAL_COUNT + global.window.VERB_DATA_100.verbs.length, DATA.verbs.length);
  assert.equal(DATA.verbs.length, 125);
  var ids = DATA.verbs.map(function (v) { return v.id; });
  assert.equal(new Set(ids).size, 125);
  assert.equal(DATA.lessons.length, 25);
  assert.equal(new Set(DATA.lessons.map(function (l) { return l.id; })).size, 25);
  var listed = [];
  DATA.lessons.forEach(function (l) { listed = listed.concat(l.verbIds); });
  assert.equal(listed.length, 125);
  assert.deepEqual(listed.slice().sort(), ids.slice().sort());
  var lessonOf = LEARN.buildLessonOf(DATA.lessons, DATA.verbs);
  DATA.verbs.forEach(function (v) { assert.equal(lessonOf[v.id], v.lesson, v.id); });
  assert.deepEqual(DATA.sources, ["25-most-common-french-verbs.md", "100-more-common-french-verbs.md"]);
});

test("merge is idempotent (a second run adds nothing)", function () {
  MERGE.merge(DATA, global.window.VERB_DATA_100, TYPES);
  assert.equal(DATA.verbs.length, 125);
  assert.equal(DATA.lessons.length, 25);
});

test("badge mapping for all 125: 63 regular / 15 spelling change / 47 irregular, 10 reflexive", function () {
  var counts = { regular: 0, "regular-spelling-change": 0, irregular: 0 };
  var refl = 0;
  DATA.verbs.forEach(function (v) {
    var c = LEARN.verbCategory(v);
    assert.equal(c, TYPES.verbs[v.id].category, v.id);
    counts[c] += 1;
    if (LEARN.isPronominal(v)) refl += 1;
    assert.equal(LEARN.isPronominal(v), TYPES.verbs[v.id].pronominal, v.id);
    // The category follows the type string too (the rule in verb-types.js), so the badge can't drift from the text.
    var t = v.type;
    var expect = /^Irregular/.test(t) ? "irregular" : /spelling change/.test(t) ? "regular-spelling-change" : "regular";
    assert.equal(c, expect, v.id + " " + t);
  });
  assert.deepEqual(counts, { regular: 63, "regular-spelling-change": 15, irregular: 47 });
  assert.equal(refl, 10);
  assert.equal(LEARN.verbCategory(V("manger")), "regular-spelling-change");
  assert.equal(LEARN.verbCategory(V("parler")), "regular");
  assert.equal(LEARN.verbCategory(V("etre")), "irregular");
  assert.equal(LEARN.isPronominal(V("se-lever")), true);
});

test("impersonal falloir / pleuvoir are il-form only in every item list", function () {
  ["falloir", "pleuvoir"].forEach(function (id) {
    var v = V(id);
    assert.deepEqual(LEARN.personsOf(v), ["3s"]);
    assert.equal(v.present[0].pronoun, "il");
    LEARN.itemKeysFor(v).forEach(function (k) {
      var p = k.split("|")[2];
      assert.ok(p === "-" || p === "3s", k);
    });
    assert.deepEqual(L.acceptedForms(v, "3s"), [v.present[0].form, "il " + v.present[0].form, "on " + v.present[0].form]);
  });
});

test("reflexive typed answers require the reflexive pronoun for every pronominal row", function () {
  var pron = DATA.verbs.filter(function (v) { return LEARN.isPronominal(v); });
  assert.equal(pron.length, 10);
  pron.forEach(function (v) {
    LEARN.personsOf(v).forEach(function (p) {
      var r = L.presentRow(v, p);
      var acc = L.acceptedForms(v, p);
      assert.equal(L.checkAnswer(r.form, acc).correct, false, v.id + " " + p + ": bare form must be rejected");
      assert.equal(L.checkAnswer(r.french.replace(/^(ils\/elles|il\/elle)/, function (m) { return m.split("/")[0]; }), acc).correct, true, v.id + " " + p + " full");
      acc.forEach(function (a) { assert.match(a, /(^|\s)(me|te|se|nous|vous)\s|(^|\s)(m|t|s)'/, v.id + " " + p + " " + a); });
    });
  });
  var lever = V("se-lever");
  var acc = L.acceptedForms(lever, "1s");
  assert.equal(L.checkAnswer("je me lève", acc).correct, true);
  assert.equal(L.checkAnswer("me lève", acc).correct, true);
  var item = { verb: lever, person: "1s", family: "conjugate" };
  assert.equal(LEARN.classify("lève", item, { data: DATA }).category, "missing-reflexive");
});

test("stem/ending split for every present row of all 125 verbs", function () {
  var n = 0;
  DATA.verbs.forEach(function (v) {
    LEARN.personsOf(v).forEach(function (p) {
      var s = LEARN.splitForm(v, p);
      var form = L.presentRow(v, p).form.normalize("NFC");
      assert.equal((s.stem + s.ending).normalize("NFC"), form, v.id + " " + p);
      assert.equal(typeof s.irregular, "boolean");
      n += 1;
    });
  });
  assert.equal(n, 123 * 6 + 2);
  // Regular -er rows split on the -er endings.
  assert.deepEqual(LEARN.splitForm(V("parler"), "1p"), { stem: "parl", ending: "ons", irregular: false });
});

test("topics-data.js carries the content review polish", function () {
  var T = global.window.TOPICS_DATA;
  var byId = {};
  T.topics.forEach(function (t) {
    (t.exercises || []).forEach(function (e) {
      byId[e.id] = e;
      (e.items || []).forEach(function (it) { byId[it.id] = it; });
    });
  });
  assert.equal(/bold/i.test(byId["Q3-C"].title), false);
  assert.equal(byId["Q6-C6"].answer, "À quelle heure");
  assert.ok(byId["Q6-C"].wordBank.indexOf("À quelle heure") !== -1);
  assert.ok(byId["R2-B7"].accepted.indexOf("m'assois") !== -1);
  assert.ok(byId["R3-A7"].accepted.indexOf("Je ne m'assois pas ici.") !== -1);
  assert.ok(byId["R5-A4"].accepted.indexOf("Assois-toi !") !== -1);
  assert.ok(byId["R5-B3"].accepted.indexOf("Ne t'assois pas là !") !== -1);
  assert.ok(byId["R5-C2"].accepted.indexOf("Assoyez-vous !") !== -1);
});

test("every verb builds its item keys without throwing", function () {
  DATA.verbs.forEach(function (v) { assert.ok(LEARN.itemKeysFor(v).length >= 4, v.id); });
});
