/* Everyday expressions (js/expressions-data.js + js/expressions.js): content schema, respelling,
   cross-links, near-synonym cues, flashcard decks, review distractors, storage, search, routes,
   the generated Markdown, the audio corpus and static checks on the view and the markup. */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var crypto = require("node:crypto");
global.window = {};
["data", "data-100", "verb-types", "topics-data", "merge-data", "verb-meta", "logic"].forEach(function (f) { require("../js/" + f + ".js"); });
var L = require("../js/logic.js");
var LEARN = require("../js/learn.js");
var REF = require("../js/reference-data.js");
var D = require("../js/expressions-data.js");
var X = require("../js/expressions.js");
var PRON_RE = require("./fixtures/respelling.js").PRON_RE;
var DATA = global.window.VERB_DATA;
var ROOT = path.join(__dirname, "..");
var REPO = path.join(ROOT, "..");

var VERBS = {};
DATA.verbs.forEach(function (v) { VERBS[v.id] = v; });
var TABLES = {};
REF.categories.forEach(function (c) { c.tables.forEach(function (t) { TABLES[t.id] = c.id; }); });
var BY_ID = {};
D.expressions.forEach(function (e) { BY_ID[e.id] = e; });
var THEME_COUNTS = { greetings: 10, politeness: 10, "getting-by": 10, "shopping-restaurant": 12, directions: 9,
  "small-talk": 11, opinions: 11, "time-plans": 10, idioms: 9, fillers: 8 };
var ID_RE = /^[a-z0-9-]+$/;
var IPA_RE = /[əʒɛɔœøŋɲʁːˈɑɐʃθðʊɪ]/;
/* §4.4 confusable groups: each is a clique. */
var GROUPS = [
  ["pardon", "excusez-moi"], ["de-rien", "je-vous-en-prie"], ["avec-plaisir", "volontiers"],
  ["au-revoir", "a-bientot", "a-tout-a-lheure", "a-demain", "bonne-journee", "bonne-soiree"],
  ["daccord", "ca-marche", "pas-de-probleme"], ["tant-pis", "cest-pas-grave"], ["ca-va", "comment-allez-vous"],
  ["bonjour", "salut", "bonsoir"], ["je-voudrais", "je-vais-prendre"], ["en-fait", "enfin", "bref"], ["du-coup", "alors"]
];
function seg(s) { return L.normalize(s.trim().replace(/…$/, "")).replace(/^to /, ""); }
function segs(e) { return e.en.split("/").map(seg); }

/** Small deterministic rng (mulberry32). */
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

/* ---------- content ---------- */
test("content: exactly 100 expressions in the 10 themes, with the planned counts (each >= 8)", function () {
  assert.equal(D.expressions.length, 100);
  assert.deepEqual(D.themes.map(function (t) { return t.id; }), Object.keys(THEME_COUNTS));
  var counts = {};
  D.expressions.forEach(function (e) { counts[e.theme] = (counts[e.theme] || 0) + 1; });
  assert.deepEqual(counts, THEME_COUNTS);
  D.themes.forEach(function (t, i) {
    assert.equal(t.number, i + 1);
    assert.ok(t.title && t.summary && t.intro, t.id);
    assert.ok(counts[t.id] >= 8, t.id);
  });
  // flat array in theme order
  var order = D.themes.map(function (t) { return t.id; });
  for (var i = 1; i < D.expressions.length; i++) {
    assert.ok(order.indexOf(D.expressions[i].theme) >= order.indexOf(D.expressions[i - 1].theme), D.expressions[i].id);
  }
  assert.ok(D.title && D.intro && D.respellingNote && D.registerNote);
});

test("content: unique lowercase-hyphen ids; valid theme and register; every required field", function () {
  var ids = D.expressions.map(function (e) { return e.id; });
  assert.equal(new Set(ids).size, 100);
  D.expressions.forEach(function (e) {
    assert.match(e.id, ID_RE);
    assert.ok(THEME_COUNTS[e.theme], e.id);
    assert.ok(["formal", "neutral", "informal"].indexOf(e.register) !== -1, e.id);
    ["fr", "pron", "en"].forEach(function (k) { assert.ok(typeof e[k] === "string" && e[k].trim(), e.id + " " + k); });
    assert.ok(e.example && e.example.fr && e.example.pron && e.example.en, e.id + " example");
    if (e.theme === "idioms") assert.ok(e.literal, e.id + " literal");
  });
});

test("content: respellings use only the respelling alphabet (shared with the tables); no ‿ in French", function () {
  D.expressions.forEach(function (e) {
    [e.pron, e.example.pron].forEach(function (p) {
      assert.ok(PRON_RE.test(p), e.id + ": " + JSON.stringify(p));
      assert.ok(!IPA_RE.test(p), e.id + ": " + p);
    });
    [e.fr, e.example.fr, e.say || ""].forEach(function (f) { assert.equal(f.indexOf("‿"), -1, e.id); });
  });
});

test("content: the only parenthesis in French is the feminine (e); register is never in fr", function () {
  D.expressions.forEach(function (e) {
    assert.ok(!/\((?!e\))/.test(e.fr) && !/\((?!e\))/.test(e.example.fr), e.id);
    assert.doesNotMatch(e.fr, /informal|formal/i, e.id);
  });
});

test("content: say exists exactly for the … items, has no …, and fillers are lower case", function () {
  var withSay = [];
  D.expressions.forEach(function (e) {
    var gap = e.fr.indexOf("…") !== -1;
    assert.equal(!!e.say, gap, e.id);
    if (e.say) { withSay.push(e.id); assert.equal(e.say.indexOf("…"), -1, e.id); }
    if (e.theme === "fillers") assert.match(e.fr, /^[a-zà-ÿ]/, e.id);
  });
  assert.deepEqual(withSay.sort(), ["bon", "comment-dit-on", "il-y-a-pres-dici", "je-mappelle", "je-pense-que", "je-vais-prendre",
    "je-voudrais", "ou-est", "un-billet-pour", "vous-avez"]);
  assert.equal(BY_ID["je-voudrais"].say, "Je voudrais un café.");
  assert.equal(BY_ID["comment-dit-on"].say, "Comment dit-on ça en français ?");
  assert.equal(BY_ID.bon.say, "Bon.");
});

test("content: cue format (1-60 chars, lower-case start, no parentheses)", function () {
  D.expressions.forEach(function (e) {
    if (e.cue == null) return;
    assert.ok(e.cue.length >= 1 && e.cue.length <= 60, e.id);
    assert.match(e.cue, /^[a-z]/, e.id);
    assert.doesNotMatch(e.cue, /[()]/, e.id);
  });
});

test("cross-links: verbs, tables, see and confusable ids resolve; confusable is symmetric and every group a clique", function () {
  D.expressions.forEach(function (e) {
    (e.verbs || []).forEach(function (id) { assert.ok(VERBS[id], e.id + " verb " + id); });
    (e.tables || []).forEach(function (id) { assert.ok(TABLES[id], e.id + " table " + id); });
    (e.see || []).forEach(function (id) { assert.ok(BY_ID[id] && id !== e.id, e.id + " see " + id); });
    (e.confusable || []).forEach(function (id) {
      assert.ok(BY_ID[id] && id !== e.id, e.id + " confusable " + id);
      assert.ok((BY_ID[id].confusable || []).indexOf(e.id) !== -1, id + " should list " + e.id);
    });
  });
  GROUPS.forEach(function (g) {
    g.forEach(function (a) { g.forEach(function (b) {
      if (a !== b) assert.ok((BY_ID[a].confusable || []).indexOf(b) !== -1, a + " -> " + b);
    }); });
  });
  assert.deepEqual(BY_ID["a-demain"].see, ["au-revoir", "a-bientot"]);
  assert.deepEqual(BY_ID["a-demain"].verbs || [], []);
  assert.deepEqual(BY_ID["a-demain"].tables || [], []);
});

test("uniqueness: normalized fr, Listen text and English differ across all 100", function () {
  ["fr", "speak", "en"].forEach(function (k) {
    var seen = {};
    D.expressions.forEach(function (e) {
      var v = L.normalize(k === "speak" ? X.speakText(e) : e[k]);
      assert.ok(!seen[v], k + " duplicate: " + e.id + " / " + seen[v]);
      seen[v] = e.id;
    });
  });
});

test("fixed values: pardon, j'en ai marre; keywords never repeat their own English", function () {
  assert.equal(BY_ID.pardon.en, "Sorry? / Excuse me");
  assert.ok(!(BY_ID.pardon.keywords || []).some(function (k) { return L.normalize(k) === "excuse me"; }));
  assert.deepEqual(BY_ID["jen-ai-marre"].keywords, ["en avoir marre", "fed up", "sick of it"]);
  assert.equal(BY_ID["jen-ai-marre"].fr, "J'en ai marre !");
  assert.match(BY_ID["jen-ai-marre"].note, /^Dictionary form: en avoir marre/);
  D.expressions.forEach(function (e) {
    var own = segs(e);
    (e.keywords || []).forEach(function (k) { assert.equal(own.indexOf(seg(k)), -1, e.id + " keyword " + k); });
  });
});

test("near-synonyms: pairs sharing an English segment or a confusable link have distinct (en, register, cue) and a cue", function () {
  var list = D.expressions;
  for (var i = 0; i < list.length; i++) {
    for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      var shared = segs(a).some(function (s) { return segs(b).indexOf(s) !== -1; });
      var linked = (a.confusable || []).indexOf(b.id) !== -1;
      if (!shared && !linked) continue;
      var ta = [L.normalize(a.en), a.register, a.cue || ""].join("|"), tb = [L.normalize(b.en), b.register, b.cue || ""].join("|");
      assert.notEqual(ta, tb, a.id + " / " + b.id);
      assert.ok(a.cue || b.cue, a.id + " / " + b.id + " need a cue");
    }
  }
});

test("vulgarity screen: none of the excluded words", function () {
  D.expressions.forEach(function (e) {
    var all = [e.fr, e.example.fr, e.note || "", e.say || ""].join(" ");
    assert.doesNotMatch(all, /\b(chier|foutre|fout|putain|con|conne|connard)\b/i, e.id);
  });
});

/* ---------- logic ---------- */
test("keys: expr:<id>|<mode>|- round-trips; isKey; itemKeys; knownIds", function () {
  var k = X.keyFor("jai-hate", "expr-fr-en");
  assert.equal(k, "expr:jai-hate|flash-fr-en|-");
  assert.deepEqual(X.parseKey(k), { id: "jai-hate", mode: "flash-fr-en", deck: "expr-fr-en" });
  assert.equal(X.parseKey("aller|flash-inf-meaning|-"), null);
  assert.equal(X.parseKey("expr:Bad!|flash-fr-en|-"), null);
  assert.ok(X.isKey(k));
  assert.ok(!X.isKey("aller|flash-inf-meaning|-"));
  assert.deepEqual(X.itemKeys(BY_ID.bonjour), ["expr:bonjour|flash-fr-en|-", "expr:bonjour|flash-en-fr|-", "expr:bonjour|flash-audio|-"]);
  var known = X.knownIds(D);
  assert.equal(known.length, 100);
  assert.equal(known[0], "expr:bonjour");
  assert.equal(k.split("|")[0], "expr:jai-hate");
  assert.deepEqual(X.allThemeIds(D), Object.keys(THEME_COUNTS));
  assert.equal(X.speakText(BY_ID["je-voudrais"]), "Je voudrais un café.");
  assert.equal(X.speakText(BY_ID.bonjour), "Bonjour");
  assert.deepEqual(X.listenTexts(BY_ID.bonjour), ["Bonjour", "Bonjour, madame !"]);
  assert.equal(X.cueText(BY_ID.pardon), "(you bumped into someone, or didn't catch what was said)");
  assert.equal(X.cueText(BY_ID["jai-hate"]), "");
});

test("flashItems: one item per expression per deck, filtered by theme", function () {
  X.DECKS.forEach(function (deck) {
    var all = X.flashItems(D, X.allThemeIds(D), deck);
    assert.equal(all.length, 100);
    all.forEach(function (it) {
      assert.equal(it.kind, "flash");
      assert.equal(it.deck, deck);
      assert.equal(it.key, X.keyFor(it.expr.id, deck));
    });
    var some = X.flashItems(D, ["idioms", "fillers"], deck);
    assert.equal(some.length, 17);
    assert.ok(some.every(function (it) { return it.expr.theme === "idioms" || it.expr.theme === "fillers"; }));
  });
  assert.deepEqual(X.flashItems(D, [], "expr-fr-en"), []);
  assert.deepEqual(X.flashItems(D, ["idioms"], "inf-meaning"), []);
  var keys = X.flashItems(D, X.allThemeIds(D), "expr-fr-en").map(function (i) { return i.key; })
    .concat(X.flashItems(D, X.allThemeIds(D), "expr-en-fr").map(function (i) { return i.key; }));
  assert.equal(new Set(keys).size, 200, "decks have distinct keys");
});

test("distractorPool: exactly 3 strings for every item and side", function () {
  D.expressions.forEach(function (e) {
    ["en", "fr"].forEach(function (side) {
      var p = X.distractorPool(D, e, side, rng(7));
      assert.equal(p.length, 3, e.id + " " + side);
      assert.equal(new Set(p.map(L.normalize)).size, 3);
    });
  });
});

test("choiceItem: 100 × 3 modes × 3 seeds: 4 unique options, no ambiguous distractor, deterministic, same theme first", function () {
  var modes = ["flash-fr-en", "flash-en-fr", "flash-audio"];
  var frSet = {};
  D.expressions.forEach(function (c) { frSet[c.fr] = c; });
  var enSet = {};
  D.expressions.forEach(function (c) { enSet[c.en] = c; });
  D.expressions.forEach(function (e) {
    modes.forEach(function (mode) {
      [1, 2, 3].forEach(function (seed) {
        var key = "expr:" + e.id + "|" + mode + "|-";
        var it = X.choiceItem(D, key, rng(seed));
        assert.equal(it.kind, "choice");
        assert.equal(it.key, key);
        assert.equal(it.expr, e);
        assert.equal(it.isFrench, mode === "flash-en-fr");
        assert.deepEqual(it.listen, { text: X.speakText(e), key: null });
        assert.deepEqual(it.reveal, { french: e.fr, pronunciation: e.pron, english: e.en });
        assert.equal(it.options.length, 4, key);
        assert.equal(new Set(it.options.map(L.normalize)).size, 4, key);
        assert.ok(it.options.indexOf(it.correct) !== -1, key);
        var side = it.side;
        var others = it.options.filter(function (o) { return o !== it.correct; }).map(function (o) {
          var c = side === "fr" ? frSet[o] : enSet[o];
          assert.ok(c, "option is a real " + side + " text: " + o);
          return c;
        });
        others.forEach(function (c) { assert.ok(!X.excluded(e, c, side), key + " distractor " + c.id); });
        // same seed, same options
        assert.deepEqual(X.choiceItem(D, key, rng(seed)).options, it.options);
        var eligible = X.index(D).byTheme[e.theme].filter(function (c) { return !X.excluded(e, c, side); });
        if (eligible.length >= 3) assert.ok(others.some(function (c) { return c.theme === e.theme; }), key + " same-theme distractor");
        // legend: no doubled punctuation
        var text = it.legend.before + it.legend.strong + it.legend.after;
        assert.doesNotMatch(text, /[?!]\s*\?$|[?!]\s*[?!]\s*(\(|$)/, key + ": " + text);
        if (side === "fr" && e.cue) assert.ok(text.indexOf(X.cueText(e)) !== -1, key);
      });
    });
  });
  assert.equal(X.choiceItem(D, "expr:nope|flash-fr-en|-", rng(1)), null);
  assert.equal(X.choiceItem(D, "aller|flash-inf-meaning|-", rng(1)), null);
});

test("stats: answers, accuracy and mastered cards overall and per theme", function () {
  var st = { stats: {} };
  st.stats["expr:bonjour|flash-fr-en|-"] = { box: 3, seen: 4, correct: 3, wrong: 1, last: 1 };
  st.stats["expr:bonjour|flash-en-fr|-"] = { box: 0, seen: 2, correct: 0, wrong: 2, last: 1 };
  st.stats["expr:bref|flash-audio|-"] = { box: 4, seen: 5, correct: 5, wrong: 0, last: 1 };
  st.stats["aller|flash-inf-meaning|-"] = { box: 4, seen: 9, correct: 9, wrong: 0, last: 1 };
  var s = X.stats(st, D);
  assert.equal(s.total, 300);
  assert.equal(s.answered, 11);
  assert.equal(s.correct, 8);
  assert.equal(s.mastered, 2);
  assert.deepEqual(s.byTheme.greetings, { answered: 6, correct: 3, mastered: 1, total: 30 });
  assert.deepEqual(s.byTheme.fillers, { answered: 5, correct: 5, mastered: 1, total: 24 });
  assert.deepEqual(s.byTheme.idioms, { answered: 0, correct: 0, mastered: 0, total: 27 });
});

/* ---------- review deck ---------- */
test("mistakesDeck: expression keys only with exprData (old two-argument callers unchanged); suggestNext passes it on", function () {
  var state = { totals: { answered: 30 }, lessons: {}, stats: {
    "etre|conjugate|1s": { box: 0, seen: 3, correct: 1, wrong: 2, last: 5 },
    "expr:jai-hate|flash-fr-en|-": { box: 0, seen: 2, correct: 0, wrong: 2, last: 9 },
    "expr:gone-away|flash-fr-en|-": { box: 0, seen: 2, correct: 0, wrong: 2, last: 9 },
    "expr:bonjour|flash-en-fr|-": { box: 3, seen: 5, correct: 4, wrong: 1, last: 9 }
  } };
  assert.deepEqual(LEARN.mistakesDeck(state, DATA), ["etre|conjugate|1s"]);
  assert.deepEqual(LEARN.mistakesDeck(state, DATA, D), ["expr:jai-hate|flash-fr-en|-", "etre|conjugate|1s"]);
  var withX = LEARN.suggestNext(state, DATA, Date.now(), D);
  var without = LEARN.suggestNext(state, DATA, Date.now());
  assert.ok(withX && without);
  // weakest verbs stay verbs only
  LEARN.weakestVerbs(state, DATA, 3).forEach(function (w) { assert.ok(VERBS[w.verb.id]); });
  // the summary line for an expression card plays the filled-in Listen text
  var d = LEARN.displayFor({ key: "expr:je-voudrais|flash-fr-en|-", expr: BY_ID["je-voudrais"] });
  assert.deepEqual(d, { french: "Je voudrais…", pronunciation: BY_ID["je-voudrais"].pron, audioKey: null, listenText: "Je voudrais un café." });
});

/* ---------- routes ---------- */
test("routes: #expressions[/theme[/id]] and #flashcards/expressions[/theme]; malformed → home", function () {
  var LESSONS = LEARN.buildLessonsById(DATA.lessons);
  function r(h) { return LEARN.parseRoute(h, LESSONS); }
  assert.equal(r("#expressions").name, "expressions");
  assert.equal(r("#expressions").scope, "all");
  assert.deepEqual([r("#expressions/politeness").scope, r("#expressions/politeness").themeId], ["theme", "politeness"]);
  var c = r("#expressions/politeness/excusez-moi");
  assert.deepEqual([c.name, c.scope, c.themeId, c.exprId], ["expressions", "item", "politeness", "excusez-moi"]);
  assert.equal(r("#expressions/a/b/c").name, "home");
  assert.equal(r("#expressions/Bad!").name, "home");
  assert.equal(r("#expressions/politeness/Bad!").name, "home");
  var f = r("#flashcards/expressions");
  assert.deepEqual([f.name, f.scope, f.themeId], ["flashcards", "expressions", null]);
  var g = r("#flashcards/expressions/idioms");
  assert.deepEqual([g.name, g.scope, g.themeId], ["flashcards", "expressions", "idioms"]);
  assert.equal(r("#flashcards/expressions/idioms/x").name, "home");
  assert.equal(r("#flashcards/expressions/Bad!").name, "home");
  assert.equal(r("#conjugate/expressions").name, "home");
  assert.equal(r("#flashcards").scope, "filter");
  assert.equal(r("#flashcards/lesson/1").scope, "lesson");
  // every card's deep link and every theme's flashcard link parses
  D.expressions.forEach(function (e) { assert.equal(r("#expressions/" + e.theme + "/" + e.id).exprId, e.id); });
});

/* ---------- storage ---------- */
var V1 = require("./fixtures/v1-state.js");
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
function loadStore(fake, withExpressions) {
  var saved = global.window;
  global.window = { localStorage: fake, VERB_DATA: DATA, VT_EXPRESSIONS: withExpressions === false ? undefined : D };
  delete require.cache[require.resolve("../js/storage.js")];
  require("../js/storage.js");
  var STORE = global.window.VT_STORAGE;
  global.window = saved;
  return STORE;
}
var ALL_THEMES = Object.keys(THEME_COUNTS);
function oldV2() {
  var raw = JSON.parse(JSON.stringify(V1));
  raw.version = 2;
  raw.settings.theme = "dark";
  raw.settings.voiceSource = "device";
  return raw;
}

test("storage: an older v2 save without expression data loads with all themes selected and nothing lost", function () {
  var raw = oldV2();
  var STORE = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) }));
  var s = STORE.load();
  assert.equal(STORE.wasMigrated(), false);
  assert.equal(s.version, 2);
  assert.deepEqual(s.stats, raw.stats);
  assert.deepEqual(s.totals, raw.totals);
  assert.deepEqual(s.settings.selectedVerbIds, raw.settings.selectedVerbIds);
  assert.equal(s.settings.flashDeck, "conj");
  assert.equal(s.settings.theme, "dark");
  assert.equal(s.settings.voiceSource, "device");
  assert.deepEqual(s.settings.selectedExpressionThemes, ALL_THEMES);
  assert.deepEqual(STORE.defaults().settings.selectedExpressionThemes, ALL_THEMES);
});

test("storage: the v1 fixture still migrates, and gets the expression defaults", function () {
  var STORE = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(V1) }));
  var s = STORE.load();
  assert.equal(STORE.wasMigrated(), true);
  assert.equal(s.version, 2);
  assert.deepEqual(s.stats, V1.stats);
  assert.deepEqual(s.settings.selectedExpressionThemes, ALL_THEMES);
});

test("storage: expression stats are kept for known ids; unknown, unsafe and malformed keys are dropped; themes sanitized", function () {
  var raw = oldV2();
  raw.stats["expr:jai-hate|flash-fr-en|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 };
  raw.stats["expr:nope|flash-fr-en|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 };
  raw.stats["expr:__proto__|flash-fr-en|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 };
  raw.stats["expr:Bad Id|flash-fr-en|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 };
  raw.stats["expr:bref|flash-audio|-"] = { box: 99, seen: -4, correct: "x", wrong: 1, last: 5 };
  raw.settings.selectedExpressionThemes = ["idioms", "nope", "greetings", "idioms", 7, "__proto__"];
  var s = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) })).load();
  assert.deepEqual(s.stats["expr:jai-hate|flash-fr-en|-"], { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 });
  assert.equal(s.stats["expr:nope|flash-fr-en|-"], undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(s.stats, "expr:__proto__|flash-fr-en|-"));
  assert.equal(s.stats["expr:Bad Id|flash-fr-en|-"], undefined);
  assert.deepEqual(s.stats["expr:bref|flash-audio|-"], { box: 4, seen: 0, correct: 0, wrong: 1, last: 5 });
  assert.deepEqual(s.settings.selectedExpressionThemes, ["greetings", "idioms"], "known ids, data order, no duplicates");
  raw.settings.selectedExpressionThemes = [];
  assert.deepEqual(loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) })).load().settings.selectedExpressionThemes, [], "an empty choice is kept");
  raw.settings.selectedExpressionThemes = "idioms";
  assert.deepEqual(loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) })).load().settings.selectedExpressionThemes, ALL_THEMES, "not an array: default");
  Object.keys(V1.stats).forEach(function (k) { assert.deepEqual(s.stats[k], V1.stats[k], k); });
});

test("storage: without expressions-data.js the expr: stats and theme ids are kept by shape, not wiped", function () {
  var raw = oldV2();
  raw.stats["expr:jai-hate|flash-fr-en|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 };
  raw.stats["expr:Bad Id|flash-fr-en|-"] = { box: 2, seen: 3, correct: 2, wrong: 1, last: 5 };
  raw.settings.selectedExpressionThemes = ["idioms", "idioms", "Bad!", "greetings"];
  var STORE = loadStore(fakeStorage({ "verbTrainer.v1": JSON.stringify(raw) }), false);
  var s = STORE.load();
  assert.ok(s.stats["expr:jai-hate|flash-fr-en|-"]);
  assert.equal(s.stats["expr:Bad Id|flash-fr-en|-"], undefined);
  assert.deepEqual(s.settings.selectedExpressionThemes, ["idioms", "greetings"]);
  assert.deepEqual(STORE.defaults().settings.selectedExpressionThemes, []);
});

test("storage: export → import round-trips expression stats and a 3-theme selection; old exports import with defaults", function () {
  var fake = fakeStorage({});
  var STORE = loadStore(fake);
  var state = STORE.defaults();
  state.stats["etre|conjugate|1s"] = { box: 1, seen: 2, correct: 1, wrong: 1, last: 7 };
  state.stats["expr:poser-un-lapin|flash-en-fr|-"] = { box: 3, seen: 4, correct: 3, wrong: 1, last: 8 };
  state.stats["expr:excusez-moi|flash-audio|-"] = { box: 0, seen: 1, correct: 0, wrong: 1, last: 9 };
  state.settings.selectedExpressionThemes = ["politeness", "idioms", "fillers"];
  state.settings.flashDeck = "expr-en-fr";
  state.totals.answered = 7;
  var text = STORE.exportText(state, 0);
  var res = STORE.parseImport(text);
  assert.equal(res.ok, true);
  assert.deepEqual(res.state, STORE.sanitize(state));
  assert.deepEqual(res.state.stats, state.stats);
  assert.deepEqual(res.state.settings.selectedExpressionThemes, ["politeness", "idioms", "fillers"]);
  assert.equal(res.state.settings.flashDeck, "expr-en-fr");
  assert.equal(JSON.parse(text).exportedVersion, 2, "no schema bump");
  var old = JSON.stringify({ app: "french-verb-trainer", kind: "progress", exportedVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", data: oldV2() });
  var r2 = STORE.parseImport(old);
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.state.settings.selectedExpressionThemes, ALL_THEMES);
  assert.deepEqual(r2.state.stats, V1.stats);
});

/* ---------- search ---------- */
var S = require("../js/search.js");
var TOPICS = global.window.TOPICS_DATA;
var INDEX = S.buildIndex(DATA, TOPICS, REF, D);
function xids(q) { return S.search(INDEX, q).expressions.map(function (r) { return r.id; }); }

test("search: hate, addition, lapin, excuse me and en avoir marre land on the right expression", function () {
  assert.equal(xids("hate")[0], "jai-hate");
  assert.equal(xids("hâte")[0], "jai-hate");
  assert.equal(xids("addition")[0], "laddition");
  assert.equal(xids("lapin")[0], "poser-un-lapin");
  var em = xids("excuse me");
  assert.deepEqual(em.slice(0, 2), ["excusez-moi", "pardon"], "whole English beats Pardon's segment");
  assert.equal(xids("en avoir marre")[0], "jen-ai-marre");
  assert.equal(xids("fed up")[0], "jen-ai-marre");
  assert.equal(xids("I can't wait")[0], "jai-hate");
  var r = S.search(INDEX, "lapin").expressions[0];
  assert.equal(r.href, "#expressions/idioms/poser-un-lapin");
  assert.equal(r.listenText, "poser un lapin");
  assert.ok(!("type" in r));
  assert.equal(S.search(INDEX, "je voudrais").expressions[0].listenText, "Je voudrais un café.");
  var info = LEARN.parseRoute(r.href, LEARN.buildLessonsById(DATA.lessons));
  assert.deepEqual([info.name, info.themeId, info.exprId], ["expressions", "idioms", "poser-un-lapin"]);
});

test("search: cette and aller keep their table and verb at the old scores; totals include expressions", function () {
  var cette = S.search(INDEX, "cette");
  assert.equal(cette.tables[0].tableId, "demonstrative-adjectives");
  assert.ok(!cette.expressions.length || cette.expressions[0].score < 80);
  var aller = S.search(INDEX, "aller");
  assert.equal(aller.verbs[0].verbId, "aller");
  assert.equal(aller.verbs[0].score, 100);
  ["hate", "excuse me", "cette", "bon"].forEach(function (q) {
    var x = S.search(INDEX, q);
    assert.equal(x.total, x.verbs.length + x.topics.length + x.tables.length + x.expressions.length, q);
  });
  assert.deepEqual(S.search(S.buildIndex(DATA, TOPICS, REF, null), "lapin").expressions, []);
});

/* ---------- printables ---------- */
test("markdown: both committed copies match the generator; See also lines; the tables Markdown is unchanged", function () {
  var B = require("../../tools/build-expressions.js");
  var site = B.loadSite();
  var md = B.markdown(site.data, site.verbsById, site.tableById);
  assert.equal(fs.readFileSync(path.join(REPO, "french-expressions.md"), "utf8"), md, "french-expressions.md is stale: run node tools/build-expressions.js");
  assert.equal(fs.readFileSync(path.join(ROOT, "reference", "french-expressions.md"), "utf8"), md, "reference copy is stale");
  assert.ok(md.indexOf("CC BY-SA 4.0") !== -1);
  assert.ok(md.indexOf("See also: *être* · *oublier* · " + site.tableById["negation-placement"].title + ".") !== -1);
  assert.ok(md.indexOf("See also: *Au revoir* · *À bientôt*.") !== -1);
  assert.ok(md.indexOf("See also: *avoir* · *voir*.") !== -1);
  assert.equal((md.match(/^### /gm) || []).length, 100);
  var bad = JSON.parse(JSON.stringify(site.data));
  bad.expressions[0].verbs = ["nope"];
  assert.throws(function () { B.markdown(bad, site.verbsById, site.tableById); }, /bonjour: unknown verb nope/);
  var html = B.printHtml(site.data, site.verbsById, site.tableById, site.keyRows);
  assert.ok(html.indexOf("French Everyday Expressions") !== -1 && html.indexOf("<script") === -1);
  var G = require("../../tools/build-grammar-tables.js");
  assert.equal(fs.readFileSync(path.join(REPO, "french-grammar-tables.md"), "utf8"), G.markdown(REF));
});

/* ---------- audio corpus and coverage ---------- */
function hashKey(k) { return crypto.createHash("sha256").update(k, "utf8").digest("hex").slice(0, 16); }

test("corpus: every Expressions Listen text is in tts-tools corpus (ttsKey v1, expression categories)", function () {
  var corpus = require("../../tts-tools/extract-corpus.js").collect(ROOT).items;
  var byKey = {};
  corpus.forEach(function (it) { byKey[it.key] = it; });
  var missing = [];
  D.expressions.forEach(function (e) {
    X.listenTexts(e).forEach(function (t, i) {
      var it = byKey[L.ttsKey(t)];
      if (!it || it.categories.indexOf(i === 0 ? "expression" : "expression-example") === -1) missing.push(t);
    });
  });
  assert.deepEqual(missing, []);
  assert.equal(L.ttsKey(X.speakText(BY_ID["je-suis-desole"])), "Je suis désolé");
});

test("coverage: every Expressions Listen text has a recorded clip or a documented failed/excluded manifest record", function () {
  global.window = {};
  new Function("window", fs.readFileSync(path.join(ROOT, "js", "tts-manifest.js"), "utf8"))(global.window);
  var T = global.window.VT_TTS;
  var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", T.defaultVoice, "manifest.json"), "utf8"));
  var missing = [];
  D.expressions.forEach(function (e) {
    X.listenTexts(e).forEach(function (t) {
      var key = L.ttsKey(t);
      if (T.items[key]) return;
      var rec = man.items[hashKey(key)];
      if (rec && (rec.status === "failed-excluded" || rec.excludedByUser)) return;
      missing.push(key);
    });
  });
  assert.deepEqual(missing, []);
  assert.equal(T.items["je me suis assis"], undefined, "the user exclusion stays");
});

/* ---------- static checks ---------- */
test("static: views-expressions.js uses textContent only and exactly the two Listen call sites the corpus mirrors", function () {
  var view = fs.readFileSync(path.join(ROOT, "js/views-expressions.js"), "utf8");
  assert.equal(view.indexOf("innerHTML"), -1);
  assert.ok(!/setAttribute\(\s*["']style/.test(view) && !/\.style\b/.test(view));
  var calls = view.match(/\blisten\((?:[^()]|\([^()]*\))*\)/g).filter(function (c) { return c !== "listen(text)"; });
  assert.deepEqual(calls, ["listen(EXPR.speakText(e))", "listen(e.example.fr)"]);
  // expression Listen texts elsewhere come only from VT_EXPR.speakText / listenText
  var app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  (app.match(/(setListen|play)\([^;]*\be\b[^;]*;/g) || []).forEach(function (c) { assert.match(c, /EXPR\.speakText\(e\)/, c); });
  var review = fs.readFileSync(path.join(ROOT, "js/expressions.js"), "utf8");
  assert.match(review, /listen: \{ text: speakText\(e\), key: null \}/);
  assert.match(fs.readFileSync(path.join(ROOT, "js/search.js"), "utf8"), /listenText: EXPR\.speakText\(e\)/);
  assert.match(fs.readFileSync(path.join(ROOT, "js/views-search.js"), "utf8"), /listenText: x\.listenText, listenKey: null/);
});

test("static: index.html loads the expression scripts in order, links the view in the nav and More, keeps the CSP", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  function at(f) { var i = html.indexOf('<script src="js/' + f + '"></script>'); assert.ok(i !== -1, f); return i; }
  assert.ok(at("reference-data.js") < at("expressions-data.js") && at("expressions-data.js") < at("merge-data.js"));
  assert.ok(at("learn.js") < at("expressions.js") && at("expressions.js") < at("search.js") && at("expressions.js") < at("storage.js"));
  assert.ok(at("views-tables.js") < at("views-expressions.js") && at("views-expressions.js") < at("app.js"));
  assert.match(html, /id="view-expressions"[^>]*data-view="expressions"/);
  assert.match(html, /class="nav-link" href="#expressions" data-nav="expressions"/);
  assert.match(html, /class="more-link" href="#expressions" data-close data-nav="expressions"/);
  assert.match(html, /<symbol id="i-message-circle"/);
  assert.match(html, /<p class="flash-cue" id="flash-cue" hidden><\/p>/);
  assert.match(html, /<optgroup label="Expressions" id="flash-deck-expr">[\s\S]*value="expr-fr-en"[\s\S]*value="expr-en-fr"[\s\S]*value="expr-audio"[\s\S]*<\/optgroup>/);
  assert.ok(html.indexOf("<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'\">") !== -1);
  assert.ok(fs.existsSync(path.join(ROOT, "reference", "french-expressions.pdf")), "PDF");
  // the new scripts are classic scripts: no modules, no network
  ["expressions-data.js", "expressions.js", "views-expressions.js"].forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|^\s*(import|export)\s/m, f);
    assert.doesNotMatch(src, /https?:\/\//, f);
  });
});

test("static: verb flashcards still hide the verb type (no type on the faces; the peek is off for expressions)", function () {
  var app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  var start = app.indexOf("function buildFlashcards()"), end = app.indexOf("var peek = (function ()", start);
  var body = app.slice(start, end);
  assert.doesNotMatch(body, /typeLine|typeBadges|typeCategory|verbType/);
  assert.match(app, /if \(it\.expr\) peek\.update\(null, false\);/);
});
