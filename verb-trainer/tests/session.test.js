/* Unit tests for js/session.js (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");

global.window = {};
require("../js/data.js");
require("../js/verb-meta.js");
require("../js/logic.js");
require("../js/learn.js");
var DATA = global.window.VERB_DATA;
var LEARN = global.window.VT_LEARN;
var S = require("../js/session.js");

function V(id) { return DATA.verbs.filter(function (v) { return v.id === id; })[0]; }
function item(id, person) {
  return { key: id + "|conjugate|" + person, kind: "typed", verb: V(id), person: person, family: "conjugate" };
}
function len(n, extra) {
  return function () {
    var o = { length: n };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  };
}

test("a 3-question session: onNext twice, onDone once, capped bar text", function () {
  S.clearAll();
  var s = S.getOrStart("k1", len(3));
  assert.equal(s.resumed, false);
  assert.equal(S.barText(s), "Question 1 of 3");
  var next = 0, done = 0;
  var cbs = { onNext: function () { next++; }, onDone: function (x) { done++; assert.equal(x, s); } };
  for (var i = 0; i < 3; i++) {
    S.recordResult(s, item("parler", "1s"), true, false);
    S.advance(s, cbs);
  }
  assert.equal(next, 2);
  assert.equal(done, 1);
  assert.equal(s.done, true);
  assert.equal(s.index, 3);
  assert.equal(s.correct, 3);
  assert.equal(S.barText(s), "Question 3 of 3");
});

test("recordResult never changes index; hinted correct counts in correct and in missed", function () {
  S.clearAll();
  var s = S.getOrStart("k2", len(5));
  S.recordResult(s, item("parler", "1s"), true, true);
  S.recordResult(s, item("parler", "2s"), false, false);
  assert.equal(s.index, 0);
  assert.equal(s.correct, 1);
  assert.equal(s.missed.length, 2);
  assert.equal(s.missed[0].hinted, true);
  var wrong = item("parler", "2s");
  assert.deepEqual(s.missed[1], { key: wrong.key, hinted: false, display: LEARN.displayFor(wrong) });
});

test("lastMissed is de-duplicated and lastMissedGen increments on finish", function () {
  S.clearAll();
  var gen = S.lastMissedGen;
  var s = S.getOrStart("k3", len(3));
  S.recordResult(s, item("parler", "1s"), false, false); S.advance(s, {});
  S.recordResult(s, item("parler", "1s"), false, false); S.advance(s, {});
  S.recordResult(s, item("etre", "2s"), true, true); S.advance(s, {});
  assert.deepEqual(S.lastMissed, ["parler|conjugate|1s", "etre|conjugate|2s"]);
  assert.equal(S.lastMissedGen, gen + 1);
  var copy = S.lastMissed;
  copy.push("x");
  assert.equal(S.lastMissed.length, 2, "lastMissed is read-only from outside");
});

test("getOrStart resumes unfinished sessions and replaces done ones", function () {
  S.clearAll();
  var s = S.getOrStart("k4", len(2));
  S.advance(s, {});
  var again = S.getOrStart("k4", len(9));
  assert.equal(again, s);
  assert.equal(again.resumed, true);
  assert.equal(again.length, 2, "init is not called when resuming");
  S.advance(s, {});
  assert.equal(s.done, true);
  var fresh = S.getOrStart("k4", len(2));
  assert.notEqual(fresh, s);
  assert.equal(fresh.index, 0);
  assert.equal(fresh.resumed, false);
});

test("restart gives a fresh session even when unfinished", function () {
  S.clearAll();
  var s = S.getOrStart("k5", len(4));
  S.advance(s, {});
  var r = S.restart("k5", len(4));
  assert.notEqual(r, s);
  assert.equal(r.index, 0);
  assert.equal(r.resumed, false);
});

test("clearAll empties sessions and lastMissed", function () {
  var s = S.getOrStart("k6", len(1));
  S.recordResult(s, item("parler", "1s"), false, false);
  S.advance(s, {});
  assert.ok(S.lastMissed.length > 0);
  var open = S.getOrStart("k7", len(3));
  S.clearAll();
  assert.deepEqual(S.lastMissed, []);
  assert.notEqual(S.getOrStart("k7", len(3)), open);
});

test("an empty deck is not kept: drop, then a new init is used", function () {
  S.clearAll();
  var empty = S.getOrStart("rev", len(0, { items: [] }));
  assert.equal(empty.length, 0);
  S.drop("rev");
  var s = S.getOrStart("rev", len(2, { items: ["a|conjugate|1s", "b|conjugate|2s"] }));
  assert.equal(s.length, 2);
  assert.equal(s.resumed, false);
  assert.deepEqual(s.items, ["a|conjugate|1s", "b|conjugate|2s"]);
});

test("newSession copies typeOrder, starts typeIndex at 0 and has the rule-4 ui defaults", function () {
  S.clearAll();
  var order = ["form", "meaning"];
  var s = S.getOrStart("k8", len(10, { typeOrder: order }));
  assert.deepEqual(s.typeOrder, ["form", "meaning"]);
  assert.notEqual(s.typeOrder, order, "copied");
  assert.equal(s.typeIndex, 0);
  assert.equal(s.items, null);
  assert.equal(s.current, null);
  assert.equal(s.lastKey, null);
  assert.deepEqual(s.ui, { answered: false, hintLevel: 0, input: "", selected: -1, flipped: false, result: null });
  s.ui.answered = true;
  S.resetUi(s);
  assert.equal(s.ui.answered, false);
});
