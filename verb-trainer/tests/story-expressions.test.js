/* Story expressions (episode.expression, js/story-expressions.js, VT_SEXPR) and per-card voices (proverb.voice,
   expression.voice): validation, Listen texts, keys, flashcard items, Review choice items, stats, Review my
   mistakes, routes, search, storage and static checks on the markup. Synthetic data: café episodes cloned into
   two fake series with an expression each; the shipped proverbs stay as they are. */
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
var DLG = require("../js/dialogues.js");
var P = require("../js/proverbs.js");
var X = require("../js/story-expressions.js");
var ROOT = path.join(__dirname, "..");
var DATA = global.window.VERB_DATA;
var VOICES = { voiceIds: ["qwen3-fr-bf16", "qwen3-fr-m-bf16"] };
function clone(o) { return JSON.parse(JSON.stringify(o)); }
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
var CAFE = DLG.episodes(DLGD, "le-cafe-des-questions");
/* The first words of a line (up to n), punctuation dropped: always contained in that line. */
function head(line, n) { return line.fr.replace(/[.,;:!?…«»]/g, " ").trim().split(/\s+/).slice(0, n).join(" "); }
/* fake-a: café episodes 1-3; fake-b: café episodes 4-5. Each episode gets an expression from its second line. */
function fixture() {
  var f = { version: 1, dialogues: [], series: clone(DLGD.series) };
  [["fake-a", [1, 2, 3]], ["fake-b", [4, 5]]].forEach(function (g, gi) {
    f.series.push({ id: g[0], title: "Fake " + gi, titleFr: "Faux " + gi, summary: "A test.", intro: "A test story.",
      acts: [{ number: 1, title: "One", titleFr: "Un", level: "A1" }] });
    g[1].forEach(function (cafeEp, i) {
      var d = clone(CAFE[cafeEp - 1]);
      d.id = g[0] + "-ep-" + (i + 1); d.number = 900 + gi * 10 + i; d.series = g[0]; d.episode = i + 1; d.act = 1; d.level = "A1";
      delete d.proverb; delete d.sceneImages;
      if (i === 0) delete d.recap; else d.recap = "Previously in the fake story.";
      d.expression = { fr: head(d.lines[1], 3), respelling: "ehk-sprehs-yohN", meaning: "Meaning " + g[0] + " " + i,
        usage: "When you want to test the cards.", example: "Un exemple pour " + g[0] + ".", exampleRespelling: "uhN‿ehg-zahNpl poor",
        exampleEn: "An example." };
      f.dialogues.push(d);
    });
  });
  f.dialogues = clone(DLGD.dialogues).concat(f.dialogues);
  f.dialogues.filter(function (d) { return d.id === "fake-a-ep-2"; })[0].expression.voice = "qwen3-fr-m-bf16";
  return f;
}
var FX = fixture();
function ep(f, id) { return f.dialogues.filter(function (d) { return d.id === id; })[0]; }

test("validate: the fixture with expressions (one with its own voice) is clean with and without the voice list", function () {
  assert.deepEqual(DLG.validate(FX), []);
  assert.deepEqual(DLG.validate(FX, VOICES), []);
});
test("validate: each broken expression field yields its specific error", function () {
  function one(mut, expected, refs) { var f = fixture(); mut(f); assert.deepEqual(DLG.validate(f, refs), [expected]); }
  one(function (f) { delete ep(f, "fake-a-ep-1").expression.usage; }, "fake-a-ep-1/expression.usage: must be a non-empty string");
  one(function (f) { ep(f, "fake-a-ep-1").expression.literal = "x"; }, "fake-a-ep-1/expression.literal: unknown key");
  one(function (f) { ep(f, "fake-a-ep-1").expression.fr = "Tirer les vers du nez"; }, "fake-a-ep-1/expression.fr: not found in any line of the episode");
  one(function (f) { ep(f, "fake-a-ep-1").expression.example = "« Un exemple. »"; }, "fake-a-ep-1/expression.example: contains « or »");
  one(function (f) { ep(f, "fake-a-ep-1").expression.respelling = "ʃohz"; }, "fake-a-ep-1/expression.respelling: respelling has a character outside the alphabet");
  one(function (f) { ep(f, "fake-a-ep-1").expression.usage = "x".repeat(201); }, "fake-a-ep-1/expression.usage: longer than 200 characters");
  one(function (f) { ep(f, "fake-a-ep-1").expression.voice = "nope"; }, "fake-a-ep-1/expression.voice: unknown voice nope", VOICES);
  one(function (f) { ep(f, "fake-a-ep-1").expression.voice = ""; }, "fake-a-ep-1/expression.voice: must be absent or a voice id");
  one(function (f) { delete ep(f, "fake-b-ep-2").expression; }, "fake-b-ep-2/expression: missing; every episode of fake-b needs an expression");
  one(function (f) { var d = f.dialogues.filter(function (x) { return !x.series; })[0]; d.expression = clone(ep(f, "fake-a-ep-1").expression); d.expression.fr = head(d.lines[1], 2); },
    f0().id + "/expression: only story episodes have an expression");
  function f0() { return FX.dialogues.filter(function (x) { return !x.series; })[0]; }
});
test("validate: proverb.voice is optional; a known voice passes, an unknown one is an error", function () {
  var f = clone(DLGD);
  f.dialogues.filter(function (d) { return d.id === "cafe-01-the-rule"; })[0].proverb.voice = "qwen3-fr-m-bf16";
  assert.deepEqual(DLG.validate(f, VOICES), []);
  f.dialogues.filter(function (d) { return d.id === "cafe-01-the-rule"; })[0].proverb.voice = "nope";
  assert.deepEqual(DLG.validate(f, VOICES), ["cafe-01-the-rule/proverb.voice: unknown voice nope"]);
});
test("listenEntries: an expression adds its French and its example in the card's voice (null = default)", function () {
  var es = DLG.listenEntries({ dialogues: [ep(FX, "fake-a-ep-1"), ep(FX, "fake-a-ep-2")] }).filter(function (e) { return /^dialogue-expression/.test(e.category); });
  var a = ep(FX, "fake-a-ep-1").expression, b = ep(FX, "fake-a-ep-2").expression;
  assert.deepEqual(es, [
    { text: a.fr, voice: null, category: "dialogue-expression" }, { text: a.example, voice: null, category: "dialogue-expression-example" },
    { text: b.fr, voice: "qwen3-fr-m-bf16", category: "dialogue-expression" }, { text: b.example, voice: "qwen3-fr-m-bf16", category: "dialogue-expression-example" }]);
  var f = clone(DLGD); f.dialogues[f.dialogues.length - 1].proverb.voice = "qwen3-fr-m-bf16";
  var pv = DLG.listenEntries(f).filter(function (e) { return e.category === "dialogue-proverb"; });
  assert.equal(pv.length, 20);
  assert.deepEqual(pv.map(function (e) { return e.voice; }).filter(Boolean), ["qwen3-fr-m-bf16"]);
  assert.equal(DLG.listenEntries(DLGD).filter(function (e) { return /^dialogue-expression/.test(e.category); }).length, 0);
  assert.equal(DLG.hasExpressions(FX, "fake-a"), true);
  assert.equal(DLG.hasExpressions(FX, "le-cafe-des-questions"), false);
});
test("deck: 5 expressions grouped by series in series order; the Proverbs deck keeps its 20 café proverbs", function () {
  assert.deepEqual(X.list(FX).map(function (it) { return it.id; }), ["fake-a-ep-1", "fake-a-ep-2", "fake-a-ep-3", "fake-b-ep-1", "fake-b-ep-2"]);
  assert.deepEqual(X.allSeries(FX), ["fake-a", "fake-b"]);
  assert.equal(X.bySeries(FX, "fake-b").length, 2);
  assert.deepEqual(X.bySeries(FX, "nope"), []);
  assert.equal(X.list(DLGD).length, 0);
  assert.equal(P.list(FX).length, 20);
  P.list(FX).forEach(function (it) { assert.equal(it.series, "le-cafe-des-questions"); });
  assert.equal(X.flashItems(FX, null, "sexpr-fr-en").length, 5);
  assert.equal(X.flashItems(FX, ["fake-b"], "sexpr-en-fr").length, 2);
  assert.equal(X.flashItems(FX, [], "sexpr-fr-en").length, 0);
  assert.deepEqual(X.flashItems(FX, null, "prov-fr-en"), []);
  assert.deepEqual(P.flashItems(FX, null, "sexpr-fr-en"), []);
  var it = X.flashItems(FX, ["fake-a"], "sexpr-fr-en")[0];
  assert.deepEqual([it.kind, it.key, it.sexpr.expression.fr], ["flash", "sexpr:fake-a-ep-1|flash-fr-en|-", ep(FX, "fake-a-ep-1").expression.fr]);
});
test("keys: sexpr:<id>|<mode>|- round-trips; prov and expr keys are not story-expression keys", function () {
  var k = X.keyFor("fake-a-ep-2", "sexpr-en-fr");
  assert.equal(k, "sexpr:fake-a-ep-2|flash-en-fr|-");
  assert.deepEqual(X.parseKey(k), { id: "fake-a-ep-2", mode: "flash-en-fr", deck: "sexpr-en-fr" });
  assert.equal(X.isKey(k), true);
  assert.equal(X.isKey("prov:cafe-01-the-rule|flash-fr-en|-"), false);
  assert.equal(P.isKey(k), false);
  ["sexpr:x|flash-audio|-", "sexpr:Bad|flash-fr-en|-", "sexpr:x|flash-fr-en|1s"].forEach(function (b) { assert.equal(X.parseKey(b), null, b); });
  assert.deepEqual(X.knownIds(FX).length, 5);
  assert.equal(X.choiceItem(FX, "sexpr:nope|flash-fr-en|-", rng(1)), null);
  assert.equal(X.choiceItem(FX, "sexpr:cafe-01-the-rule|flash-fr-en|-", rng(1)), null);
});
test("choiceItem: 4 unique options with the answer, deterministic; Listen in the card's voice", function () {
  X.list(FX).forEach(function (it) {
    X.DECKS.forEach(function (deck) {
      [1, 2].forEach(function (seed) {
        var k = X.keyFor(it.id, deck), a = X.choiceItem(FX, k, rng(seed)), b = X.choiceItem(FX, k, rng(seed));
        assert.equal(a.options.length, 4, k);
        assert.equal(new Set(a.options.map(L.normalize)).size, 4, k);
        assert.ok(a.options.indexOf(a.correct) !== -1, k);
        assert.deepEqual(a.options, b.options, k);
        assert.equal(a.correct, deck === "sexpr-fr-en" ? it.expression.meaning : it.expression.fr);
        assert.equal(a.family, "sexpr");
        assert.deepEqual(a.listen, { text: it.expression.fr, key: null, voice: it.expression.voice || null });
      });
    });
  });
});
test("stats: answers, accuracy and mastered cards overall and per series", function () {
  var st = { stats: {} };
  st.stats["sexpr:fake-a-ep-1|flash-fr-en|-"] = { box: 4, seen: 5, correct: 5, wrong: 0, last: 1 };
  st.stats["sexpr:fake-b-ep-2|flash-en-fr|-"] = { box: 0, seen: 2, correct: 1, wrong: 1, last: 1 };
  st.stats["prov:cafe-01-the-rule|flash-fr-en|-"] = { box: 4, seen: 9, correct: 9, wrong: 0, last: 1 };
  var s = X.stats(st, FX);
  assert.deepEqual([s.answered, s.correct, s.mastered, s.total], [7, 6, 1, 10]);
  assert.deepEqual([s.bySeries["fake-a"].answered, s.bySeries["fake-a"].mastered, s.bySeries["fake-a"].total], [5, 1, 6]);
  assert.deepEqual([s.bySeries["fake-b"].answered, s.bySeries["fake-b"].correct], [2, 1]);
  assert.equal(P.stats(st, FX).answered, 9);
});
test("mistakesDeck and displayFor: a missed sexpr: key reaches Review; the summary shows the card's voice", function () {
  var k = "sexpr:fake-a-ep-2|flash-en-fr|-";
  var st = { totals: { answered: 3 }, lessons: {}, stats: {} };
  st.stats[k] = { box: 0, seen: 2, correct: 0, wrong: 2, last: 9 };
  st.stats["sexpr:nope|flash-fr-en|-"] = { box: 0, seen: 1, correct: 0, wrong: 1, last: 9 };
  assert.deepEqual(LEARN.mistakesDeck(st, DATA, null, FX), [k]);
  assert.deepEqual(LEARN.mistakesDeck(st, DATA), []);
  var x = ep(FX, "fake-a-ep-2").expression;
  var it = X.flashItems(FX, ["fake-a"], "sexpr-fr-en")[1];
  var want = { french: x.fr, pronunciation: x.respelling, audioKey: null, listenText: x.fr, voiceId: "qwen3-fr-m-bf16" };
  assert.deepEqual(LEARN.displayFor(it), want);
  assert.deepEqual(LEARN.displayFor(X.choiceItem(FX, k, rng(1))), want);
  assert.equal(LEARN.displayFor(X.flashItems(FX, ["fake-a"], "sexpr-fr-en")[0]).voiceId, undefined);
});
test("routes: #flashcards/story-expressions[/<seriesId>]; malformed → home", function () {
  var LESSONS = LEARN.buildLessonsById(DATA.lessons);
  function r(h) { return LEARN.parseRoute(h, LESSONS); }
  assert.deepEqual([r("#flashcards/story-expressions").name, r("#flashcards/story-expressions").scope, r("#flashcards/story-expressions").seriesId],
    ["flashcards", "story-expressions", null]);
  assert.equal(r("#flashcards/story-expressions/fake-a").seriesId, "fake-a");
  ["#flashcards/story-expressions/Bad", "#flashcards/story-expressions/a/b"].forEach(function (h) { assert.equal(r(h).name, "home", h); });
  assert.equal(r("#flashcards/proverbs").scope, "proverbs");
});
test("search: an expression's French finds its episode with an expression: match detail", function () {
  global.window.VT_EXPR = require("../js/expressions.js");
  var S = require("../js/search.js");
  var idx = S.buildIndex(DATA, global.window.TOPICS_DATA, require("../js/reference-data.js"), require("../js/expressions-data.js"), FX);
  var x = ep(FX, "fake-b-ep-1").expression;
  var h = S.search(idx, x.fr).dialogues.filter(function (d) { return d.series === "fake-b"; })[0];
  assert.equal(h.id, "fake-b-ep-1");
  assert.equal(h.matchDetail, "expression: « " + x.fr + " »");
  var plain = S.buildIndex(DATA, global.window.TOPICS_DATA, require("../js/reference-data.js"), require("../js/expressions-data.js"), DLGD);
  assert.equal(S.search(plain, "expression à retenir").dialogues.length, 0);
});
test("storage: sexpr: keys of known episodes survive sanitize; unknown or malformed ones are dropped", function () {
  var saved = global.window.VT_DIALOGUES;
  global.window.VT_DIALOGUES = FX;
  delete require.cache[require.resolve("../js/storage.js")];
  require("../js/storage.js");
  var raw = { version: 2, stats: {} };
  ["sexpr:fake-a-ep-1|flash-fr-en|-", "sexpr:nope|flash-fr-en|-", "sexpr:fake-a-ep-1|flash-audio|-", "prov:cafe-01-the-rule|flash-fr-en|-"].forEach(function (k) {
    raw.stats[k] = { box: 1, seen: 1, correct: 1, wrong: 0, last: 1 };
  });
  var keys = Object.keys(global.window.VT_STORAGE.sanitize(raw).stats).sort();
  global.window.VT_DIALOGUES = saved;
  assert.deepEqual(keys, ["prov:cafe-01-the-rule|flash-fr-en|-", "sexpr:fake-a-ep-1|flash-fr-en|-"]);
});
test("static: the Story expressions optgroup, story-expressions.js after proverbs.js, and the view, Review and Progress wiring", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<optgroup label="Story expressions" id="flash-deck-sexpr" hidden>\s*<option value="sexpr-fr-en">French → meaning<\/option>\s*<option value="sexpr-en-fr">Meaning → French<\/option>/);
  var a = html.indexOf('<script src="js/proverbs.js?v=__BUILD__"></script>');
  var b = html.indexOf('<script src="js/story-expressions.js?v=__BUILD__"></script>');
  assert.ok(a !== -1 && b > a);
  var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
  ["isSexprDeck(", '"#sexpr:"', '"#flashcards/story-expressions/" + sid', 'text: "Story expressions"', "SEXPR.flashItems("].forEach(function (s) { assert.ok(app.indexOf(s) !== -1, s); });
  assert.ok(fs.readFileSync(path.join(ROOT, "js", "views-review.js"), "utf8").indexOf("VT_SEXPR.choiceItem") !== -1);
  var view = fs.readFileSync(path.join(ROOT, "js", "views-dialogues.js"), "utf8");
  assert.ok(view.indexOf('if (d.expression) art.appendChild(expressionSection(d));') > view.indexOf('if (d.proverb) art.appendChild(proverbSection(d));'));
  assert.ok(view.indexOf('voice: p.voice || null') !== -1, "the proverb card plays in its own voice");
  var xv = fs.readFileSync(path.join(ROOT, "js", "views-expressions.js"), "utf8");
  assert.ok(xv.indexOf("From the stories") !== -1 && xv.indexOf("VT_SEXPR") !== -1);
  var src = fs.readFileSync(path.join(ROOT, "js", "story-expressions.js"), "utf8");
  assert.ok(!/fetch\(|XMLHttpRequest|innerHTML|document\./.test(src));
});
