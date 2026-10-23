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

/* ---------- Dialogues (design §6) ---------- */
var DLG_DATA = require("../js/dialogues-data.js");
var EXPR_DATA = require("../js/expressions-data.js");
global.window.VT_EXPR = require("../js/expressions.js");
var FULL = S.buildIndex(DATA, TOPICS, require("../js/reference-data.js"), EXPR_DATA, DLG_DATA);
function qd(text) { return S.search(FULL, text); }
function dialogueOk(r) {
  return !!(r.dialogues.length && r.dialogues[0].score >= 85 && !(r.verbs[0] && r.verbs[0].score >= S.SCORES.form) &&
    !r.expressions.length);
}
test("dialogues: cafe / café / l'addition / laddition / addition / dialogue / conversation find at-the-cafe", function () {
  ["cafe", "café", "l'addition", "laddition", "addition", "dialogue", "conversation", "au café", "role-play"].forEach(function (t) {
    var r = qd(t);
    assert.ok(r.dialogues.some(function (d) { return d.id === "at-the-cafe"; }), t);
    assert.equal(r.dialogues[0].href, "#dialogues/at-the-cafe");
    assert.equal(r.total, r.verbs.length + r.topics.length + r.tables.length + r.expressions.length + r.dialogues.length);
  });
  assert.equal(qd("addition").dialogues[0].matchDetail, "line: l'addition");
});
test("dialogues: 'dialogue' and 'conversation' put Dialogues first; 'l'addition' keeps the expression first; 'cafe' includes it", function () {
  assert.equal(dialogueOk(qd("dialogue")), true);
  assert.equal(dialogueOk(qd("conversation")), true);
  var add = qd("l'addition");
  assert.equal(dialogueOk(add), false);
  assert.equal(add.expressions[0].id, "laddition");
  assert.ok(qd("cafe").dialogues.length >= 1);
});
test("dialogues: a verb query (parler) is unchanged and the 4-argument index has no dialogues", function () {
  assert.deepEqual(ids(qd("parler")), ids(q("parler")));
  // Only the two dialogues titled "Parler de …" match it, and they don't take Enter from the verb.
  assert.deepEqual(qd("parler").dialogues.map(function (d) { return d.id; }).sort(), ["talking-about-family", "weather-and-small-talk"]);
  assert.equal(dialogueOk(qd("parler")), false);
  assert.deepEqual(q("cafe").dialogues, []);
});
test("dialogues: every dialogue is searchable; each new one is the first dialogue hit for its own query, with its level", function () {
  [["faire connaissance", "meeting-someone-new"], ["boulangerie", "at-the-bakery"], ["marché", "at-the-market"],
    ["directions", "asking-for-directions"], ["gare", "at-the-train-station"], ["hotel", "hotel-check-in"],
    ["au restaurant", "at-the-restaurant"], ["clothes", "shopping-for-clothes"], ["pharmacie", "at-the-pharmacy"],
    ["médecin", "at-the-doctors"], ["making plans", "making-plans"], ["week-end dernier", "talking-about-the-weekend"],
    ["rendez-vous", "booking-an-appointment"], ["famille", "talking-about-family"], ["small talk", "weather-and-small-talk"],
    ["colleague", "meeting-a-colleague"], ["appartement", "renting-a-flat"], ["réclamation", "a-small-complaint"],
    ["loisirs", "hobbies-and-free-time"]].forEach(function (c) {
    var hit = qd(c[0]).dialogues[0];
    assert.ok(hit, c[0]);
    assert.equal(hit.id, c[1], c[0]);
    assert.ok(/^(A1|A2|B1)$/.test(hit.level), c[0]);
  });
});
/* ---------- Story episodes (La Lettre de Lyon) ---------- */
function storyHits(text) { return qd(text).dialogues.filter(function (d) { return d.series === "la-lettre-de-lyon"; }); }
test("story: traboule, Jacques, lettre, Lucienne, Beaujolais and the series title find episodes, with episode and total", function () {
  ["traboule", "Jacques", "lettre", "Lucienne", "Beaujolais", "la lettre de lyon"].forEach(function (t) {
    var hs = storyHits(t);
    assert.ok(hs.length >= 1, t);
    hs.forEach(function (h) {
      assert.ok(Number.isInteger(h.episode) && h.episode >= 1 && h.episode <= 20, t);
      assert.equal(h.total, 20, t);
      assert.equal(h.seriesTitleFr, "La Lettre de Lyon", t);
    });
  });
  assert.equal(qd("traboule").dialogues[0].id, "lyon-03-a-vanished-address");
  var j = qd("Jacques").dialogues[0];
  assert.ok(["lyon-09-the-wrong-jacques", "lyon-16-meeting-jacques"].indexOf(j.id) !== -1, j.id);
  assert.equal(j.series, "la-lettre-de-lyon");
});
test("story: everyday dialogue hits carry no series fields", function () {
  qd("cafe").dialogues.filter(function (d) { return d.id === "at-the-cafe"; }).forEach(function (d) {
    ["series", "episode", "total", "seriesTitleFr"].forEach(function (k) { assert.ok(!(k in d), k); });
  });
});
test("static: views-search.js labels story results 'Story: … · Episode n of total'", function () {
  assert.ok(VIEW.indexOf('"Story: " + x.seriesTitleFr + " · Episode " + x.episode + " of " + x.total') !== -1);
});
test("static: views-search.js renders sg-dia in the §6 order and Enter chains include dialogue", function () {
  assert.ok(VIEW.indexOf('group("sg-dia", "Dialogues ("') !== -1);
  assert.ok(VIEW.indexOf("if (dialoguesFirst(res))        { diaGroup(); verbGroup(); tableGroup(); exprGroup(); }") !== -1);
  assert.ok(VIEW.indexOf('dialoguesFirst(last)   ? ["dialogue", "open", "table", "expression", "topic"]') !== -1);
  assert.ok(VIEW.indexOf('expressionsFirst(last) ? ["expression", "table", "open", "dialogue", "topic"]') !== -1);
  assert.ok(HTML.indexOf("everyday expressions, dialogues and the topic lessons</label>") !== -1);
});
/* ---------- Le Café des Questions: proverbs and the series title ---------- */
test("café: 'proverbe' returns the episodes with a proverb (the café's 20 among them) and no Lyon or everyday dialogue", function () {
  var hs = qd("proverbe").dialogues;
  var withProverb = require("../js/dialogues-data.js").dialogues.filter(function (d) { return d.proverb; });
  assert.equal(hs.length, withProverb.length);
  assert.equal(hs.filter(function (h) { return h.series === "le-cafe-des-questions"; }).length, 20);
  hs.forEach(function (h) { assert.ok(h.series && h.series !== "la-lettre-de-lyon", h.id); });
  assert.equal(qd("sagesse du jour").dialogues.length, withProverb.length);
});
test("café: 'oiseau' finds episode 3 first with a proverb: match detail; the English equivalent finds its episode too", function () {
  var h = qd("oiseau").dialogues[0];
  assert.equal(h.id, "cafe-03-the-nephew");
  assert.ok(/^proverb: « Petit à petit, l'oiseau fait son nid\. »$/.test(h.matchDetail), h.matchDetail);
  var t = qd("All in good time").dialogues[0];
  assert.equal(t.id, "cafe-01-the-rule");
  assert.equal(t.matchDetail, "proverb: « Chaque chose en son temps. »");
  assert.equal(qd("Tel père, tel fils").dialogues[0].id, "cafe-17-like-father");
});
test("café: the series titles each find only their own episodes", function () {
  var c = qd("Le Café des Questions").dialogues;
  assert.ok(c.length >= 20);
  c.slice(0, 20).forEach(function (h) { assert.equal(h.seriesTitleFr, "Le Café des Questions", h.id); assert.equal(h.total, 20); });
  var l = qd("la lettre de lyon").dialogues.filter(function (h) { return h.series; });
  assert.ok(l.length >= 20);
  l.forEach(function (h) { assert.equal(h.series, "la-lettre-de-lyon", h.id); });
});
test("static: views-search.js tags proverb match details as French", function () {
  assert.ok(VIEW.indexOf("/^(line|proverb): /.test(x.matchDetail)") !== -1);
});
