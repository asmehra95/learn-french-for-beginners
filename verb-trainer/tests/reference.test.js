/* Grammar tables (js/reference-data.js): schema, ids, the respelling alphabet, cross-links, routes,
   search integration and the generated Markdown, plus static checks on the view and the markup. */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
global.window = {};
["data", "data-100", "verb-types", "topics-data", "merge-data", "verb-meta", "logic"].forEach(function (f) { require("../js/" + f + ".js"); });
var LEARN = require("../js/learn.js");
var REF = require("../js/reference-data.js");
var S = require("../js/search.js");
var DATA = global.window.VERB_DATA;
var TOPICS = global.window.TOPICS_DATA;
var INDEX = S.buildIndex(DATA, TOPICS, REF);
var ROOT = path.join(__dirname, "..");
var REPO = path.join(ROOT, "..");
var LESSONS = LEARN.buildLessonsById(DATA.lessons);
var VERBS = {};
DATA.verbs.forEach(function (v) { VERBS[v.id] = v; });

var PRON_RE = require("./fixtures/respelling.js").PRON_RE;
var IPA_RE = /[əʒɛɔœøŋɲʁːˈɑɐʃθðʊɪ]/;
var ID_RE = /^[a-z0-9-]+$/;

function allTables() {
  var out = [];
  REF.categories.forEach(function (c) { c.tables.forEach(function (t) { out.push({ cat: c, t: t }); }); });
  return out;
}
function prons(t) {
  var list = [];
  t.rows.forEach(function (r) { if (r.cells) r.cells.forEach(function (c) { list.push(c.pron); }); else list.push(r.pron); });
  t.examples.forEach(function (e) { list.push(e.pron); });
  t.watchOut.forEach(function (w) { if (w.pron != null) list.push(w.pron); });
  return list;
}
function allLinks() {
  var out = [];
  REF.categories.forEach(function (c) {
    (c.links || []).forEach(function (l) { out.push(l); });
    c.tables.forEach(function (t) { (t.links || []).forEach(function (l) { out.push(l); }); });
  });
  return out;
}

test("schema: 10 categories; each table has a title, when line, caption, rows, 2-4 examples and a watch-out", function () {
  assert.equal(REF.categories.length, 10);
  assert.deepEqual(REF.categories.map(function (c) { return c.id; }),
    ["articles", "pronouns", "possessives", "demonstratives", "questions", "negation", "adjectives", "prepositions", "verbs", "basics"]);
  allTables().forEach(function (x) {
    var t = x.t;
    assert.ok(t.title && t.when && t.caption, t.id);
    assert.ok(t.rows.length >= 1, t.id);
    assert.ok(t.examples.length >= 2 && t.examples.length <= 4, t.id + " examples");
    assert.ok(t.watchOut.length >= 1, t.id + " watch out");
    t.rows.forEach(function (r) {
      if (t.kind === "grid") {
        assert.ok(r.head && r.cells.length === t.columns.length, t.id);
        r.cells.forEach(function (c) { assert.ok(c.fr && c.pron, t.id + " " + c.fr); });
      } else {
        assert.ok(r.fr && r.pron && r.en, t.id + " " + r.fr);
      }
    });
    t.examples.forEach(function (e) { assert.ok(e.fr && e.pron && e.en, t.id + " " + e.fr); });
    t.watchOut.forEach(function (w) { assert.ok(w.note || (w.wrong && w.right), t.id); });
  });
});

test("ids: category and table ids are unique and lowercase-hyphen", function () {
  var cats = REF.categories.map(function (c) { return c.id; });
  assert.equal(new Set(cats).size, cats.length);
  var tables = allTables().map(function (x) { return x.t.id; });
  assert.equal(new Set(tables).size, tables.length);
  cats.concat(tables).forEach(function (id) { assert.match(id, ID_RE); });
});

test("pronunciation: every French cell has one, using only the respelling alphabet (no IPA, no ‿ in French text)", function () {
  allTables().forEach(function (x) {
    prons(x.t).forEach(function (p) {
      assert.ok(p && PRON_RE.test(p), x.t.id + ": " + JSON.stringify(p));
      assert.ok(!IPA_RE.test(p), x.t.id + ": " + p);
    });
    x.t.rows.forEach(function (r) {
      (r.cells || [r]).forEach(function (c) {
        assert.ok(String(c.fr).indexOf("‿") === -1 && String(c.say || "").indexOf("‿") === -1, c.fr);
      });
    });
  });
});

test("rows linked to a verb copy the verb data's respelling (infinitive, or the future form)", function () {
  allTables().forEach(function (x) {
    x.t.rows.forEach(function (r) {
      if (!r.verbId) return;
      var v = VERBS[r.verbId];
      assert.ok(v, r.verbId);
      if (x.t.id === "etre-verbs") assert.equal(r.pron, v.pronunciation, r.fr);
      if (x.t.id === "future") {
        assert.equal(r.pron, v.future.pronunciation, r.fr);
        assert.equal(r.fr, v.future.french, r.fr);
      }
    });
  });
});

test("cross-links resolve: routes parse, topics/lessons and verbs exist, #tables links name real tables", function () {
  var tableIds = {};
  allTables().forEach(function (x) { tableIds[x.cat.id + "/" + x.t.id] = true; });
  allLinks().forEach(function (l) {
    assert.ok(l.label, "label");
    if (l.verbId) { assert.ok(VERBS[l.verbId], l.verbId); return; }
    var info = LEARN.parseRoute(l.href, LESSONS);
    assert.notEqual(info.name, "home", l.href);
    if (info.name === "topics") {
      var topic = TOPICS.topics.filter(function (t) { return t.id === info.topicId; })[0];
      assert.ok(topic, l.href);
      if (info.exerciseId) {
        var ok = topic.lessons.some(function (x) { return x.id === info.exerciseId; }) || topic.exercises.some(function (x) { return x.id === info.exerciseId; });
        assert.ok(ok, l.href);
      }
    }
    if (info.name === "tables" && info.tableId) assert.ok(tableIds[info.categoryId + "/" + info.tableId], l.href);
  });
  var q = REF.categories.filter(function (c) { return c.id === "questions"; })[0];
  assert.ok(q.links.some(function (l) { return /^#topics\/questions/.test(l.href); }));
  var refl = allTables().filter(function (x) { return x.t.id === "reflexive-pronouns"; })[0].t;
  assert.ok(refl.links.some(function (l) { return /^#topics\/reflexive/.test(l.href || ""); }));
  // Grid columns link to their verbs too
  allTables().forEach(function (x) { (x.t.columns || []).forEach(function (c) { if (c.verbId) assert.ok(VERBS[c.verbId], c.verbId); }); });
});

test("routes: #tables, #tables/<category>, #tables/<category>/<table>; malformed → home", function () {
  var a = LEARN.parseRoute("#tables", LESSONS);
  assert.equal(a.name, "tables");
  assert.equal(a.scope, "all");
  var b = LEARN.parseRoute("#tables/articles", LESSONS);
  assert.equal(b.scope, "category");
  assert.equal(b.categoryId, "articles");
  var c = LEARN.parseRoute("#tables/articles/definite-articles", LESSONS);
  assert.equal(c.scope, "table");
  assert.equal(c.tableId, "definite-articles");
  assert.equal(LEARN.parseRoute("#tables/a/b/c", LESSONS).name, "home");
  assert.equal(LEARN.parseRoute("#tables/Bad!", LESSONS).name, "home");
});

function firstTable(q) { var r = S.search(INDEX, q); return r.tables[0] && r.tables[0].tableId; }

test("search: key terms land on the right table", function () {
  assert.equal(firstTable("cette"), "demonstrative-adjectives");
  assert.equal(firstTable("ce"), "demonstrative-adjectives");
  assert.equal(firstTable("mon"), "possessive-adjectives");
  assert.equal(firstTable("le mien"), "possessive-pronouns");
  assert.equal(firstTable("du"), "partitive-articles");
  assert.equal(firstTable("quatre-vingts"), "numbers-21-100");
  assert.equal(firstTable("quatre vingts"), "numbers-21-100");
  assert.equal(firstTable("celui"), "demonstrative-pronouns");
  assert.equal(firstTable("y"), "y-and-en");
  assert.equal(firstTable("en"), "y-and-en");
  assert.equal(firstTable("au"), "contractions");
  var art = S.search(INDEX, "Articles").tables[0];
  assert.equal(art.categoryId, "articles");
});

test("search: quel finds the quel table and still the Q5 topic lesson first among topics", function () {
  var r = S.search(INDEX, "quel");
  assert.equal(r.tables[0].tableId, "quel");
  assert.equal(r.topics[0].lessonId, "Q5");
});

test("search: table results link to the tables route and carry no verb type", function () {
  ["cette", "le mien", "du", "quel", "irregular", "reflexive", "regular"].forEach(function (q) {
    var r = S.search(INDEX, q);
    r.tables.forEach(function (t) {
      assert.ok(!("type" in t), q);
      var info = LEARN.parseRoute(t.href, LESSONS);
      assert.equal(info.name, "tables");
      assert.equal(info.tableId, t.tableId);
    });
    assert.equal(r.total, r.verbs.length + r.topics.length + r.tables.length);
  });
});

test("search: without reference data the tables list is empty (old two-argument callers)", function () {
  var idx = S.buildIndex(DATA, TOPICS, null);
  assert.deepEqual(S.search(idx, "cette").tables, []);
});

test("markdown: both committed copies match the generator output", function () {
  var md = require("../../tools/build-grammar-tables.js").markdown(REF);
  assert.equal(fs.readFileSync(path.join(REPO, "french-grammar-tables.md"), "utf8"), md, "french-grammar-tables.md is stale: run node tools/build-grammar-tables.js");
  assert.equal(fs.readFileSync(path.join(ROOT, "reference", "french-grammar-tables.md"), "utf8"), md, "reference copy is stale");
  assert.ok(md.indexOf("CC BY-SA 4.0") !== -1);
});

test("static: views-tables.js uses no innerHTML or inline style; index.html loads and links the tables", function () {
  var view = fs.readFileSync(path.join(ROOT, "js/views-tables.js"), "utf8");
  assert.ok(view.indexOf("innerHTML") === -1);
  assert.ok(!/setAttribute\(\s*["']style/.test(view));
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var ref = html.indexOf('<script src="js/reference-data.js?v=__BUILD__"></script>');
  var view2 = html.indexOf('<script src="js/views-tables.js?v=__BUILD__"></script>');
  var app = html.indexOf('<script src="js/app.js?v=__BUILD__"></script>');
  assert.ok(ref !== -1 && view2 !== -1 && ref < app && view2 < app);
  assert.match(html, /id="view-tables"[^>]*data-view="tables"/);
  assert.match(html, /class="nav-link" href="#tables" data-nav="tables"/);
  assert.match(html, /class="more-link" href="#tables"/);
  assert.match(html, /<ul class="ref-jump">\s*<li><a href="#tables" data-close>/);
  assert.ok(fs.existsSync(path.join(ROOT, "reference", "french-grammar-tables.pdf")), "PDF");
});

test("print CSS only hides other views while the tables view is showing", function () {
  var css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");
  var m = css.match(/[^{}\n]*\.view:not\(#view-tables\)[^{]*\{/g) || [];
  assert.ok(m.length > 0, "print rule for other views exists");
  m.forEach(function (sel) { assert.match(sel, /body:has\(#view-tables:not\(\[hidden\]\)\)/, "scoped: " + sel.trim()); });
});

test("numbers 21-100 rule: et un up to 61, et onze for 71", function () {
  var t = null;
  REF.categories.forEach(function (c) { c.tables.forEach(function (x) { if (x.id === "numbers-21-100") t = x; }); });
  assert.ok(t);
  assert.doesNotMatch(t.when, /61 and 71/);
  assert.match(t.when, /et onze for 71/);
});
