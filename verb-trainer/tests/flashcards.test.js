/* Flashcards (FEAT-002 USER CHANGE): no verb type on the card faces, the conjugation peek opens only from
   its button, and the peek shows the type as one quiet line (LEARN.typeLine). DOM behaviour is covered by
   the headless smoke test; these are the pure helper and static checks. */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
global.window = {};
["data", "data-100", "verb-types", "merge-data", "verb-meta", "logic"].forEach(function (f) { require("../js/" + f + ".js"); });
var LEARN = require("../js/learn.js");
var DATA = global.window.VERB_DATA;
function V(id) { return DATA.verbs.filter(function (v) { return v.id === id; })[0]; }
var ROOT = path.join(__dirname, "..");
var APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
var HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

test("typeLine: regular, spelling change, irregular and reflexive verbs", function () {
  assert.equal(LEARN.typeLine(V("parler")), "Regular -er");
  assert.equal(LEARN.typeLine(V("finir")), "Regular -ir");
  assert.equal(LEARN.typeLine(V("manger")), "Regular -er · spelling change (g→ge before o)");
  assert.equal(LEARN.typeLine(V("essayer")), "Regular -er · spelling change (y→i, optional)");
  assert.equal(LEARN.typeLine(V("etre")), "Irregular");
  assert.equal(LEARN.typeLine(V("tenir")), "Irregular · conjugates like venir");
  assert.equal(LEARN.typeLine(V("se-lever")), "Regular -er · spelling change (e→è) · Reflexive");
  assert.equal(LEARN.typeLine(V("se-coucher")), "Regular -er · Reflexive");
  assert.equal(LEARN.typeLine(V("se-souvenir")), "Irregular · conjugates like venir · Reflexive");
});

test("typeLine: every one of the 125 verbs gets a line that agrees with its badge category", function () {
  assert.equal(DATA.verbs.length, 125);
  DATA.verbs.forEach(function (v) {
    var line = LEARN.typeLine(v);
    var cat = LEARN.verbCategory(v);
    assert.ok(cat === "irregular" ? /^Irregular/.test(line) : /^Regular/.test(line), v.id + ": " + line);
    assert.equal(/spelling change/.test(line), cat === "regular-spelling-change", v.id + ": " + line);
    assert.equal(/Reflexive$/.test(line), LEARN.isPronominal(v), v.id + ": " + line);
    assert.ok(!/pronominal|group\b|[()]\s*$/i.test(line.replace(/\([^)]*\)/g, "")), v.id + ": " + line);
  });
  // No type string: falls back to the category label.
  assert.equal(LEARN.typeLine({ id: "x", infinitive: "x", typeCategory: "regular-spelling-change" }), "Regular (spelling change)");
});

test("flashcard faces in index.html carry no type element or type text (also in aria-label/title)", function () {
  var start = HTML.indexOf('<div class="flashcard" id="flash-card">');
  var end = HTML.indexOf('<div class="peek" id="flash-peek"');
  assert.ok(start > 0 && end > start);
  var faces = HTML.slice(start, end);
  assert.ok(!/id="flash-type"|card-type|type-badge/.test(faces), "no type slot on the card");
  assert.ok(!/Regular|Irregular|Reflexive/.test(faces), "no type words in the card markup");
  assert.match(faces, /id="flash-peek-btn"[^>]*aria-expanded="false"[^>]*aria-controls="flash-peek"/);
  assert.match(faces, /<span>Conjugation<\/span>/);
});

test("flashcards code: render() writes no type to the faces; the peek has no hover/focus trigger", function () {
  var fc = APP.slice(APP.indexOf("function buildFlashcards()"), APP.indexOf("var view = modeView(\"flashcards\""));
  assert.ok(fc.length > 1000);
  var render = fc.slice(fc.indexOf("function render(s)"), fc.indexOf("var peek = (function"));
  assert.ok(!/typeBadges|typeDetail|typeLine|flash-type|"Type: "/.test(render), "render() shows no type");
  var peek = fc.slice(fc.indexOf("var peek = (function"));
  assert.ok(!/mouseenter|mouseleave|"focus"|focusin|:hover|hoverOpen/.test(peek), "no hover or focus opening");
  assert.match(peek, /btn\.addEventListener\("click"/);
  assert.match(peek, /LEARN\.typeLine\(verb\)/);
  assert.match(peek, /className: "peek-type"/);
  assert.match(peek, /ev\.key !== "Escape"/);
  assert.match(peek, /pointerdown/);
});
