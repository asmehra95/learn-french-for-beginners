/* Proverbs deck (js/proverbs.js, VT_PROV): keys, flashcard items and the act filter, Review choice items,
   stats, Review my mistakes, routes, and static checks on the markup. */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
global.window = {};
["data", "data-100", "verb-types", "topics-data", "merge-data", "verb-meta", "logic"].forEach(function (f) { require("../js/" + f + ".js"); });
var L = require("../js/logic.js");
var LEARN = require("../js/learn.js");
var DLGD = require("../js/dialogues-data.js");
var P = require("../js/proverbs.js");
var ROOT = path.join(__dirname, "..");
var DATA = global.window.VERB_DATA;
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("list: the 20 café proverbs in episode order; 20 × 2 decks = 40 items", function () {
  var list = P.list(DLGD);
  assert.equal(list.length, 20);
  assert.deepEqual(list.map(function (it) { return it.dialogue.episode; }), Array.from({ length: 20 }, function (_, i) { return i + 1; }));
  list.forEach(function (it) { assert.equal(it.series, "le-cafe-des-questions"); });
  var n = P.DECKS.reduce(function (s, d) { return s + P.flashItems(DLGD, null, d).length; }, 0);
  assert.equal(n, 40);
  assert.deepEqual(P.allActs(DLGD), [1, 2, 3, 4]);
  assert.deepEqual(P.DECK_LABEL, { "prov-fr-en": "French → meaning", "prov-en-fr": "Meaning → French" });
});
test("keys: prov:<id>|<mode>|- round-trips; isKey; itemKeys; knownIds; unknown ids give null", function () {
  var k = P.keyFor("cafe-03-the-nephew", "prov-fr-en");
  assert.equal(k, "prov:cafe-03-the-nephew|flash-fr-en|-");
  assert.deepEqual(P.parseKey(k), { id: "cafe-03-the-nephew", mode: "flash-fr-en", deck: "prov-fr-en" });
  assert.equal(P.parseKey(P.keyFor("cafe-03-the-nephew", "prov-en-fr")).deck, "prov-en-fr");
  assert.equal(P.isKey(k), true);
  assert.equal(P.isKey("expr:bonjour|flash-fr-en|-"), false);
  ["prov:x|flash-audio|-", "prov:Bad|flash-fr-en|-", "prov:x|flash-fr-en|1s"].forEach(function (b) { assert.equal(P.parseKey(b), null, b); });
  var it = P.list(DLGD)[0];
  assert.deepEqual(P.itemKeys(it), ["prov:cafe-01-the-rule|flash-fr-en|-", "prov:cafe-01-the-rule|flash-en-fr|-"]);
  assert.equal(P.knownIds(DLGD).length, 20);
  assert.equal(P.choiceItem(DLGD, "prov:nope|flash-fr-en|-", rng(1)), null);
  assert.equal(P.choiceItem(DLGD, "prov:lyon-01-moving-in|flash-fr-en|-", rng(1)), null);
  assert.equal(P.choiceItem(DLGD, "expr:bonjour|flash-fr-en|-", rng(1)), null);
});
test("flashItems: respects the acts filter ([1] → 5, [] → 0, null/all → 20); unknown deck → []", function () {
  assert.equal(P.flashItems(DLGD, [1], "prov-fr-en").length, 5);
  assert.equal(P.flashItems(DLGD, [2, 4], "prov-en-fr").length, 10);
  assert.equal(P.flashItems(DLGD, [], "prov-fr-en").length, 0);
  assert.equal(P.flashItems(DLGD, null, "prov-fr-en").length, 20);
  assert.equal(P.flashItems(DLGD, [1, 2, 3, 4], "prov-fr-en").length, 20);
  assert.deepEqual(P.flashItems(DLGD, null, "expr-fr-en"), []);
  var it = P.flashItems(DLGD, [1], "prov-fr-en")[0];
  assert.equal(it.kind, "flash");
  assert.equal(it.key, "prov:cafe-01-the-rule|flash-fr-en|-");
  assert.equal(it.prov.proverb.fr, "Chaque chose en son temps.");
});
test("choiceItem: 20 × 2 modes × 3 seeds: 4 unique options containing the answer, deterministic", function () {
  P.list(DLGD).forEach(function (p) {
    P.DECKS.forEach(function (deck) {
      [1, 2, 3].forEach(function (seed) {
        var k = P.keyFor(p.id, deck);
        var a = P.choiceItem(DLGD, k, rng(seed)), b = P.choiceItem(DLGD, k, rng(seed));
        assert.equal(a.options.length, 4, k);
        assert.equal(new Set(a.options.map(L.normalize)).size, 4, k);
        assert.ok(a.options.indexOf(a.correct) !== -1, k);
        assert.deepEqual(a.options, b.options, k);
        assert.equal(a.correct, deck === "prov-fr-en" ? p.proverb.meaning : p.proverb.fr, k);
        assert.equal(a.isFrench, deck === "prov-en-fr");
        assert.equal(a.family, "prov");
        assert.equal(a.listen.text, p.proverb.fr);
      });
    });
  });
});
test("stats: answers, accuracy and mastered cards overall and per act", function () {
  var st = { stats: {} };
  st.stats["prov:cafe-01-the-rule|flash-fr-en|-"] = { box: 4, seen: 5, correct: 5, wrong: 0, last: 1 };
  st.stats["prov:cafe-01-the-rule|flash-en-fr|-"] = { box: 0, seen: 2, correct: 1, wrong: 1, last: 1 };
  st.stats["prov:cafe-20-the-question-for-rose|flash-fr-en|-"] = { box: 1, seen: 1, correct: 0, wrong: 1, last: 1 };
  var s = P.stats(st, DLGD);
  assert.deepEqual([s.answered, s.correct, s.mastered, s.total], [8, 6, 1, 40]);
  assert.deepEqual([s.byAct[1].answered, s.byAct[1].mastered, s.byAct[1].total], [7, 1, 10]);
  assert.deepEqual([s.byAct[4].answered, s.byAct[4].correct], [1, 0]);
  assert.equal(P.stats({}, DLGD).byAct[2].answered, 0);
});
test("mistakesDeck: includes a missed prov: key with the dialogue data, excludes it when mastered or without the data", function () {
  var k = "prov:cafe-07-the-influencer|flash-en-fr|-";
  var st = { totals: { answered: 3 }, lessons: {}, stats: {} };
  st.stats[k] = { box: 0, seen: 2, correct: 0, wrong: 2, last: 9 };
  st.stats["prov:lyon-01-moving-in|flash-fr-en|-"] = { box: 0, seen: 1, correct: 0, wrong: 1, last: 9 };
  assert.deepEqual(LEARN.mistakesDeck(st, DATA, null, DLGD), [k]);
  assert.deepEqual(LEARN.mistakesDeck(st, DATA), []);
  st.stats[k].box = L.MASTERED_BOX;
  assert.deepEqual(LEARN.mistakesDeck(st, DATA, null, DLGD), []);
});
test("displayFor: proverb flashcard and Review items show the proverb and its respelling (session summary)", function () {
  var it = P.flashItems(DLGD, [1], "prov-en-fr")[0];
  var want = { french: it.prov.proverb.fr, pronunciation: it.prov.proverb.respelling, audioKey: null, listenText: it.prov.proverb.fr };
  assert.deepEqual(LEARN.displayFor(it), want);
  assert.deepEqual(LEARN.displayFor(P.choiceItem(DLGD, it.key, rng(1))), want);
});
test("routes: #flashcards/proverbs[/<act>]; malformed → home", function () {
  var LESSONS = LEARN.buildLessonsById(DATA.lessons);
  function r(h) { return LEARN.parseRoute(h, LESSONS); }
  assert.deepEqual([r("#flashcards/proverbs").name, r("#flashcards/proverbs").scope, r("#flashcards/proverbs").act], ["flashcards", "proverbs", null]);
  assert.equal(r("#flashcards/proverbs/3").act, 3);
  ["#flashcards/proverbs/x", "#flashcards/proverbs/12", "#flashcards/proverbs/1/2"].forEach(function (h) { assert.equal(r(h).name, "home", h); });
});
test("static: index.html has the Proverbs optgroup and loads proverbs.js (versioned) after dialogues.js; app wiring present", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<optgroup label="Proverbs" id="flash-deck-prov">\s*<option value="prov-fr-en">French → meaning<\/option>\s*<option value="prov-en-fr">Meaning → French<\/option>/);
  var a = html.indexOf('<script src="js/dialogues.js?v=__BUILD__"></script>');
  var b = html.indexOf('<script src="js/proverbs.js?v=__BUILD__"></script>');
  assert.ok(a !== -1 && b > a);
  var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  ['id: "filter-proverbs"', '"#flashcards/proverbs/" + n', "isProvDeck(", '"#prov:"', "selectedProverbActs"].forEach(function (s) { assert.ok(app.indexOf(s) !== -1, s); });
  var rv = fs.readFileSync(path.join(ROOT, "js", "views-review.js"), "utf8");
  assert.ok(rv.indexOf("VT_PROV.choiceItem") !== -1);
  var src = fs.readFileSync(path.join(ROOT, "js", "proverbs.js"), "utf8");
  assert.ok(!/fetch\(|XMLHttpRequest|innerHTML|document\./.test(src));
});
