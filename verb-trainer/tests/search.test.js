/* Global search (js/search.js): normalization, index coverage, matching, ranking and the type-hiding rule,
   plus static checks on the search markup and controller. DOM behaviour is covered by the headless run. */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
global.window = {};
["data", "data-100", "verb-types", "topics-data", "merge-data", "verb-meta", "logic"].forEach(function (f) { require("../js/" + f + ".js"); });
var LEARN = require("../js/learn.js");
var S = require("../js/search.js");
var DATA = global.window.VERB_DATA;
var TOPICS = global.window.TOPICS_DATA;
var INDEX = S.buildIndex(DATA, TOPICS);
var ROOT = path.join(__dirname, "..");
var HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var VIEW = fs.readFileSync(path.join(ROOT, "js/views-search.js"), "utf8");

function q(text, opts) { return S.search(INDEX, text, opts); }
function ids(r) { return r.verbs.map(function (v) { return v.verbId; }); }
function first(text) { var r = q(text); return r.verbs[0] && r.verbs[0].verbId; }
var TYPE_RE = /\b(ir)?regular\b|reflexive|pronominal|spelling change/i;

test("suis → être first (present, 1st person singular), suivre also listed after it", function () {
  var r = q("suis");
  assert.equal(r.verbs[0].verbId, "etre");
  assert.equal(r.verbs[0].matchLabel, "je suis");
  assert.match(r.verbs[0].matchDetail, /present, 1st person singular/);
  var list = ids(r);
  assert.ok(list.indexOf("suivre") > 0);
});

test("j'ai and ai → avoir", function () {
  assert.equal(first("j'ai"), "avoir");
  assert.equal(first("ai"), "avoir");
});

test("prennent → prendre, alle → aller (past participle), ferai → faire", function () {
  assert.equal(first("prennent"), "prendre");
  var r = q("alle");
  assert.equal(r.verbs[0].verbId, "aller");
  assert.equal(r.verbs[0].matchDetail, "past participle");
  assert.equal(first("ferai"), "faire");
  assert.equal(first("je ferai"), "faire");
  assert.equal(first("je suis alle"), "aller");
});

test("me leve and nous nous levons → se lever", function () {
  assert.equal(first("me leve"), "se-lever");
  assert.equal(first("me lève"), "se-lever");
  assert.equal(first("nous nous levons"), "se-lever");
  assert.equal(first("se lever"), "se-lever");
});

test("accent-insensitive: etre / être, connait / connaît", function () {
  var r = q("etre");
  assert.equal(r.verbs[0].verbId, "etre");
  assert.equal(r.verbs[0].matchKind, "infinitive");
  assert.equal(first("être"), "etre");
  assert.equal(first("ÊTRE"), "etre");
  assert.equal(first("connait"), "connaitre");
  assert.equal(first("connaît"), "connaitre");
});

test("English: to eat → manger (meaning), eat → manger", function () {
  var r = q("to eat");
  assert.equal(r.verbs[0].verbId, "manger");
  assert.equal(r.verbs[0].matchKind, "meaning");
  assert.ok(ids(q("eat")).indexOf("manger") !== -1);
});

test("typos: prendr → prendre first, mangr → manger via fuzzy, no fuzzy for 3-character queries", function () {
  assert.equal(first("prendr"), "prendre");
  var r = q("mangr");
  assert.equal(r.verbs[0].verbId, "manger");
  assert.equal(r.verbs[0].matchKind, "fuzzy");
  q("vor").verbs.forEach(function (v) { assert.notEqual(v.matchKind, "fuzzy"); });
});

test("irregular lists exactly the irregular verbs; reflexive exactly the pronominal ones; each carries type", function () {
  var r = q("irregular");
  assert.equal(r.typeQuery, "irregular");
  var want = DATA.verbs.filter(function (v) { return v.typeCategory === "irregular"; }).map(function (v) { return v.id; }).sort();
  assert.deepEqual(ids(r).sort(), want);
  r.verbs.forEach(function (v) { assert.ok(v.type && /Irregular/.test(v.type)); });
  var refl = q("reflexive");
  var wantR = DATA.verbs.filter(function (v) { return v.pronominal; }).map(function (v) { return v.id; }).sort();
  assert.deepEqual(ids(refl).sort(), wantR);
  refl.verbs.forEach(function (v) { assert.match(v.type, /Reflexive/); });
});

test("type keyword prefixes are ordinary words: no typeQuery, no type, réfléchir found from refl", function () {
  ["pron", "prono", "refl", "refle", "regu", "irre", "spel", "pronoun", "reflect"].forEach(function (text) {
    var r = q(text);
    assert.equal(r.typeQuery, null, text);
    r.verbs.forEach(function (v) {
      assert.equal(v.type, undefined, text + " → " + v.verbId);
      assert.ok(!TYPE_RE.test(v.matchDetail || ""), text + " detail " + v.matchDetail);
    });
  });
  ["refl", "refle", "reflec"].forEach(function (text) {
    assert.ok(ids(q(text)).indexOf("reflechir") !== -1, text + " lists réfléchir");
  });
  assert.equal(q("irregular verbs").typeQuery, "irregular");
  assert.equal(q("reflexive verb").typeQuery, "reflexive");
});

test("topics: quel → questions Q5, est-ce que → a questions lesson, reflexive pronouns → R1", function () {
  var r = q("quel");
  assert.equal(r.topics[0].topicId, "questions");
  assert.equal(r.topics[0].lessonId, "Q5");
  assert.equal(r.topics[0].href, "#topics/questions/Q5");
  assert.ok(q("est-ce que").topics.some(function (t) { return t.topicId === "questions"; }));
  assert.ok(q("reflexive pronouns").topics.some(function (t) { return t.topicId === "reflexive" && t.lessonId === "R1"; }));
});

test("ranking: score tiers ordered, scores non-increasing, exact infinitive beats a sentence match", function () {
  var s = S.SCORES;
  assert.ok(s.infinitive > s.form && s.form > s.meaning && s.meaning > s.prefixInfinitive);
  assert.ok(s.prefixInfinitive > s.prefixForm && s.prefixForm > s.fuzzy && s.fuzzy > s.sentence);
  ["suis", "a", "je", "to", "aller", "lesson 3"].forEach(function (text) {
    var v = q(text).verbs;
    for (var i = 1; i < v.length; i++) assert.ok(v[i - 1].score >= v[i].score, text);
  });
  var r = q("suis");
  var lastExact = -1, firstSentence = Infinity;
  r.verbs.forEach(function (v, i) {
    if (v.score >= s.form) lastExact = i;
    if (v.matchKind === "sentence" && i < firstSentence) firstSentence = i;
  });
  assert.ok(lastExact < firstSentence);
  // "aller" is aller's infinitive and appears in other verbs' sentences (décider).
  var al = q("aller");
  assert.equal(al.verbs[0].verbId, "aller");
  assert.equal(al.verbs[0].matchKind, "infinitive");
  assert.ok(al.verbs.some(function (v) { return v.matchKind === "sentence"; }));
  // one real query per tier
  assert.equal(q("manger").verbs[0].score, s.infinitive);
  assert.equal(q("mange").verbs[0].score, s.form);
  assert.equal(q("to eat").verbs[0].score, s.meaning);
  assert.equal(q("mang").verbs[0].score, s.prefixInfinitive);
  assert.equal(q("mangr").verbs[0].score, s.fuzzy);
});

test("apostrophe variants: j'ai, j’ai, J’AI, je ai, jai → avoir; s’appeler, sappeler → s'appeler", function () {
  ["j'ai", "j\u2019ai", "J\u2019AI", "je ai", "jai", "j\u2018ai"].forEach(function (t) { assert.equal(first(t), "avoir", t); });
  ["s\u2019appeler", "s'appeler", "sappeler", "se appeler"].forEach(function (t) { assert.equal(first(t), "s-appeler", t); });
  assert.equal(S.normalizeKey("J\u2019ai"), "je ai");
  assert.equal(S.glueKey("j'ai"), "jai");
});

test("coverage: all 125 verbs, every infinitive first for itself, every present row finds its verb", function () {
  assert.equal(INDEX.verbCount, DATA.verbs.length);
  assert.equal(DATA.verbs.length, 125);
  DATA.verbs.forEach(function (v) {
    assert.equal(first(v.infinitive), v.id, v.infinitive);
    v.present.forEach(function (row) { assert.ok(ids(q(row.french)).indexOf(v.id) !== -1, row.french); });
  });
});

test("no type leak: results carry no type and no type words unless a type keyword was searched", function () {
  var queries = ["a", "re", "to", "lesson 2", "lesson 3", "lesson 23", "quel", "first", "regul", "verbs", "er"].concat(S.EXAMPLES);
  DATA.verbs.forEach(function (v) {
    queries.push(v.infinitive);
    var r1 = v.present.filter(function (r) { return r.person === "1s"; })[0];
    if (r1) queries.push(r1.french);
  });
  queries.forEach(function (text) {
    var r = q(text);
    if (r.typeQuery) return;
    r.verbs.forEach(function (v) {
      assert.ok(!("type" in v), text + " → " + v.verbId);
      assert.ok(!TYPE_RE.test(v.matchLabel || ""), text + " label " + v.matchLabel);
      assert.ok(!TYPE_RE.test(v.matchDetail || ""), text + " detail " + v.matchDetail);
    });
  });
});

test("hrefs parse to the verb card and the lesson route", function () {
  var lessonsById = LEARN.buildLessonsById(DATA.lessons);
  DATA.verbs.forEach(function (v) {
    var r = q(v.infinitive).verbs[0];
    var info = LEARN.parseRoute(r.href, lessonsById);
    assert.equal(info.name, "browse");
    assert.equal(info.verbId, v.id);
    var li = LEARN.parseRoute(r.lessonHref, lessonsById);
    assert.equal(li.name, "lesson");
    assert.equal(li.lessonId, r.lessonId);
  });
});

test("matchVerbIds, empty query and suggest", function () {
  var m = S.matchVerbIds(INDEX, "suis");
  assert.ok(m.etre && m.suivre);
  Object.keys(m).forEach(function (id) { assert.ok(id === "etre" || id === "suivre", id); });
  var e = q("   ");
  assert.equal(e.verbs.length, 0);
  assert.equal(e.topics.length, 0);
  assert.equal(S.suggest(INDEX, "etrr").verbId, "etre");
  assert.equal(S.suggest(INDEX, ""), null);
  var none = q("xqzwv");
  assert.equal(none.total, 0);
  assert.ok(none.suggestion && none.suggestion.infinitive);
});

test("performance: 500 mixed queries in under 1.5 s", function () {
  var list = ["s", "su", "sui", "suis", "to eat", "j'ai", "prendr", "nous nous levons", "irregular", "quel", "xqzwv", "lesson 4"];
  var t = Date.now();
  for (var i = 0; i < 500; i++) q(list[i % list.length]);
  assert.ok(Date.now() - t < 1500);
});

/* ---------- static: markup and controller ---------- */
test("static: script order, CSP unchanged", function () {
  var merge = HTML.indexOf('<script src="js/merge-data.js?v=__BUILD__"></script>');
  var search = HTML.indexOf('<script src="js/search.js?v=__BUILD__"></script>');
  var view = HTML.indexOf('<script src="js/views-search.js?v=__BUILD__"></script>');
  var app = HTML.indexOf('<script src="js/app.js?v=__BUILD__"></script>');
  assert.ok(merge !== -1 && search > merge && view !== -1 && view < app && search < app);
  assert.ok(HTML.indexOf("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'\">") !== -1);
});

test("static: combobox, listbox, label, shortcuts rows and the bottom-nav button", function () {
  var input = HTML.match(/<input[^>]*id="search-input"[^>]*>/);
  assert.ok(input);
  assert.match(input[0], /role="combobox"/);
  assert.match(input[0], /aria-controls="search-listbox"/);
  assert.match(input[0], /aria-expanded="false"/);
  assert.match(HTML, /<label[^>]*for="search-input"/);
  assert.match(HTML, /<div[^>]*id="search-listbox"[^>]*role="listbox"|<div[^>]*role="listbox"[^>]*id="search-listbox"/);
  assert.match(HTML, /<tr><td><kbd>\/<\/kbd>/);
  assert.match(HTML, /<kbd>Ctrl<\/kbd>\+<kbd>K<\/kbd>/);
  assert.match(HTML, /id="btn-search-bottom"/);
  assert.match(HTML, /id="btn-search"/);
});

test("static: views-search.js uses no innerHTML, no inline style attribute, and no type helpers", function () {
  assert.ok(VIEW.indexOf("innerHTML") === -1);
  assert.ok(!/setAttribute\(\s*["']style/.test(VIEW));
  assert.ok(!/typeLine|typeBadges|typeCategory|pronominal/.test(VIEW));
});
