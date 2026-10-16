/* Dialogues (js/dialogues-data.js + js/dialogues.js + js/views-dialogues.js): content schema, respelling,
   accepted alternatives, the line checker, SRS keys and quiz items, progress records, role-play stepping,
   the play-all state machine (fake timers), the inert evaluator registry, the second voice's shipped
   manifest, static checks on the view and the markup, the generated Markdown/PDF and the docs. */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
global.window = {};
["data", "data-100", "verb-types", "topics-data", "merge-data", "verb-meta", "logic"].forEach(function (f) { require("../js/" + f + ".js"); });
var L = require("../js/logic.js");
var REF = require("../js/reference-data.js");
var EXD = require("../js/expressions-data.js");
var DATA_D = require("../js/dialogues-data.js");
var DLG = require("../js/dialogues.js");
var ROOT = path.join(__dirname, "..");
var REPO = path.join(ROOT, "..");
var DIA_PRON_RE = /^[A-Za-z \-\/'(),.…‿]+$/;
var IPA_RE = /[əʒɛɔœøŋɲʁːˈɑɐʃθðʊɪ]/;
var VERBS = {};
global.window.VERB_DATA.verbs.forEach(function (v) { VERBS[v.id] = v; });
var TABLES = {};
REF.categories.forEach(function (c) { c.tables.forEach(function (t) { TABLES[t.id] = { categoryId: c.id, title: t.title }; }); });
var EXPR = {};
EXD.expressions.forEach(function (e) { EXPR[e.id] = e; });
/* The voices shipped with the site: the default manifest plus every js/tts-manifest-<id>.js file. */
function shippedVoices() {
  var vm = require("node:vm");
  var sb = {};
  sb.window = sb;
  vm.createContext(sb);
  fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /^tts-manifest(-[a-z0-9-]+)?\.js$/.test(f); }).forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), sb, { filename: f });
  });
  return sb;
}
var SHIPPED = shippedVoices();
var VOICE_IDS = [SHIPPED.VT_TTS.defaultVoice].concat(Object.keys(SHIPPED.VT_TTS_VOICES || {}));
function refs() { return { verbsById: VERBS, exprById: EXPR, tableById: TABLES, voiceIds: VOICE_IDS }; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
var D0 = DATA_D.dialogues[0];
/* The café alone: the pilot-shaped assertions below are about its 12 lines, 9 words and 4 questions. */
var CAFE = { version: DATA_D.version, dialogues: [D0] };
function lineOf(id) { return D0.lines.filter(function (l) { return l.id === id; })[0]; }
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
function allPron(fn) {
  DATA_D.dialogues.forEach(function (d) {
    d.lines.forEach(function (l) { fn(l.pron, d.id + "/" + l.id, l.fr); });
    d.vocab.forEach(function (v) { fn(v.pron, d.id + "/" + v.id, v.fr); });
    d.notice.examples.forEach(function (x, i) { fn(x.pron, d.id + "/notice[" + i + "]", x.fr); });
  });
}

/* ---------- content ---------- */
test("content: validate() with full refs returns no errors; pilot shape", function () {
  assert.deepEqual(DLG.validate(DATA_D, refs()), []);
  assert.equal(DATA_D.dialogues.length >= 1, true);
  assert.equal(D0.id, "at-the-cafe");
  assert.equal(D0.lines.length, 12);
  assert.equal(D0.vocab.length, 9);
  assert.equal(D0.questions.length, 4);
});
test("content: 20 dialogues numbered 1-20, levels A1 → A2 → B1, one default-voice and one male-voice speaker, 20 distinct Notice tables", function () {
  var ds = DATA_D.dialogues;
  assert.equal(ds.length, 20);
  assert.deepEqual(ds.map(function (d) { return d.number; }), Array.from({ length: 20 }, function (_, i) { return i + 1; }));
  var order = { A1: 0, A2: 1, B1: 2 };
  ds.forEach(function (d, i) { if (i) assert.ok(order[d.level] >= order[ds[i - 1].level], d.id); });
  assert.deepEqual(["A1", "A2", "B1"].map(function (lv) { return ds.filter(function (d) { return d.level === lv; }).length; }), [6, 10, 4]);
  ds.forEach(function (d) {
    assert.deepEqual(d.speakers.map(function (s) { return s.voice; }).sort(), ["qwen3-fr-bf16", "qwen3-fr-m-bf16"], d.id);
    assert.equal(d.questions.length, 4, d.id);
  });
  var tables = ds.map(function (d) { return d.notice.table; });
  tables.forEach(function (t) { assert.ok(t && Object.prototype.hasOwnProperty.call(TABLES, t), t); });
  assert.equal(new Set(tables).size, 20);
});
test("scale: stats and Review my mistakes cover every dialogue's questions", function () {
  var LEARN = require("../js/learn.js");
  assert.equal(DLG.stats({}, DATA_D).total, 80);
  assert.equal(DLG.knownHeads(DATA_D).length, 80);
  var k = "dlg:hobbies-and-free-time.q2|dlg-quiz|-";
  var st = { stats: {} };
  st.stats[k] = { seen: 1, correct: 0, wrong: 1, box: 0, last: 1 };
  assert.deepEqual(LEARN.mistakesDeck(st, global.window.VERB_DATA, null, DATA_D), [k]);
});
test("content: negative cases (speakers, punctuation-only and accent-only duplicates)", function () {
  var c = clone(DATA_D); c.dialogues[0].speakers[1].name = "julien";
  assert.ok(DLG.validate(c).some(function (e) { return /speakers\[1\]\.name: duplicate speaker name/.test(e); }));
  c = clone(DATA_D); c.dialogues[0].speakers[1].initial = "j";
  assert.ok(DLG.validate(c).some(function (e) { return /speakers\[1\]\.initial: duplicate initial/.test(e); }));
  c = clone(DATA_D); c.dialogues[0].speakers[1].initial = "c"; c.dialogues[0].speakers[0].initial = "C";
  assert.ok(DLG.validate(c).some(function (e) { return /initial: duplicate initial/.test(e); }));
  c = clone(DATA_D); c.dialogues[0].speakers[1].side = "start";
  assert.ok(DLG.validate(c).some(function (e) { return /speakers\[1\]\.side: duplicate side/.test(e); }));
  c = clone(DATA_D); c.dialogues[0].lines[0].accept.push("Bonjour madame, vous avez choisi ?");
  assert.ok(DLG.validate(c).some(function (e) { return /^at-the-cafe\/l1\.accept\[5\]: duplicate of accept\[0\]/.test(e); }));
  c = clone(DATA_D); c.dialogues[0].lines[8].accept.push("Ca fait six euros cinquante.");
  assert.deepEqual(DLG.validate(c), ["at-the-cafe/l9.accept[7]: duplicate of accept[2] after lineKey + stripAccents"]);
  c = clone(DATA_D); c.dialogues[0].vocab[0].link = { kind: "verb", id: "nope" };
  assert.ok(DLG.validate(c, refs()).some(function (e) { return /v1\.link: unknown verb nope/.test(e); }));
  c = clone(DATA_D); c.dialogues[0].speakers[0].voice = "nope";
  assert.ok(DLG.validate(c, refs()).some(function (e) { return /voice: unknown voice nope/.test(e); }));
});
test("content: null vocab link and null notice table are accepted", function () {
  var c = clone(DATA_D);
  c.dialogues[0].vocab[0].link = null;
  c.dialogues[0].notice.table = null;
  assert.deepEqual(DLG.validate(c, refs()), []);
});
test("content: accept lists start with fr, hold 1-12 unique entries, no ‿ in French", function () {
  DATA_D.dialogues.forEach(function (d) {
    d.lines.forEach(function (l) {
      assert.equal(l.accept[0], l.fr);
      assert.ok(l.accept.length >= 1 && l.accept.length <= 12);
      var keys = l.accept.map(DLG.acceptKey);
      assert.equal(new Set(keys).size, keys.length, l.id);
      l.accept.forEach(function (a) { assert.ok(a.indexOf("‿") === -1, a); });
      assert.ok(l.fr.indexOf("‿") === -1);
    });
    d.notice.examples.forEach(function (x) { assert.ok(x.fr.indexOf("‿") === -1); });
    d.vocab.forEach(function (v) { assert.ok(v.fr.indexOf("‿") === -1); });
  });
});
test("content: vocab 6-10 and contained in its line, links resolve; questions 3-4 with 3 distinct distractors", function () {
  DATA_D.dialogues.forEach(function (d) {
    assert.ok(d.vocab.length >= 6 && d.vocab.length <= 10);
    var byLine = {};
    d.lines.forEach(function (l) { byLine[l.id] = l; });
    d.vocab.forEach(function (v) {
      assert.ok(DLG.lineKey(byLine[v.line].fr).indexOf(DLG.lineKey(v.fr)) !== -1, v.id);
      if (v.link) assert.ok({ verb: VERBS, expression: EXPR, table: TABLES }[v.link.kind][v.link.id], v.id);
    });
    assert.ok(d.questions.length >= 3 && d.questions.length <= 4);
    d.questions.forEach(function (q) {
      var all = [q.answer].concat(q.distractors).map(L.normalize);
      assert.equal(q.distractors.length, 3);
      assert.equal(new Set(all).size, 4);
      assert.ok(byLine[q.line]);
    });
    if (d.notice.table) assert.ok(TABLES[d.notice.table]);
  });
  assert.equal(TABLES[D0.notice.table].categoryId, "pronouns");
});

/* ---------- respelling ---------- */
test("respelling: alphabet with ‿, no IPA, no ? or !, ‿ never touches a space", function () {
  allPron(function (p, where) {
    assert.match(p, DIA_PRON_RE, where);
    assert.ok(!IPA_RE.test(p), where);
    assert.ok(!/[?!]/.test(p), where);
    assert.ok(!/ ‿|‿ /.test(p), where);
  });
});
test("respelling: every standalone un lines up with a uhN", function () {
  allPron(function (p, where, fr) {
    var un = (fr.match(/\bun\b/gi) || []).length, uhN = (p.match(/\buhN\b/g) || []).length;
    assert.ok(un <= uhN, where + ": " + fr + " / " + p);
  });
});
test("respelling: lines and vocab that match an expression (or its example) use the same pron (‿ as space)", function () {
  var known = {};
  EXD.expressions.forEach(function (e) {
    known[L.normalize(e.fr)] = e.pron;
    known[L.normalize(e.example.fr)] = e.example.pron;
  });
  var compared = 0;
  DATA_D.dialogues.forEach(function (d) {
    d.lines.concat(d.vocab).forEach(function (x) {
      var k = L.normalize(x.fr);
      if (Object.prototype.hasOwnProperty.call(known, k)) {
        compared++;
        assert.equal(x.pron.replace(/‿/g, " "), known[k], x.id);
      }
    });
  });
  assert.ok(compared >= 5, "compared " + compared);
});

/* ---------- line checking ---------- */
test("checkLine: punctuation, internal periods, euro spacing, hyphens, quotes and spaces", function () {
  var l3 = lineOf("l3").accept, l9 = lineOf("l9").accept, l10 = lineOf("l10").accept, l8 = lineOf("l8").accept;
  ["Un café, et avec ça ?", "Un café et avec ça", "un café. et avec ça", "  Un café.   Et avec ça ?  ", "« Un café. Et avec ça ? »"].forEach(function (s) {
    assert.equal(DLG.checkLine(s, l3, {}).correct, true, s);
  });
  assert.equal(DLG.lineKey("6,50€"), DLG.lineKey("6,50 €"));
  assert.equal(DLG.lineKey("6.50 €"), DLG.lineKey("6,50 €"));
  assert.equal(DLG.checkLine("Oui, bien sûr. Ça fait 6.50€", l9, {}).exact, true);
  assert.equal(DLG.checkLine("Est ce que je peux payer par carte", l10, {}).correct, true);
  assert.equal(DLG.checkLine("“Je peux payer par carte ?”", l10, {}).correct, true);
  assert.equal(DLG.checkLine("L’addition, s’il vous plaît", l8, {}).exact, true);
  assert.equal(DLG.checkLine("L addition, s il vous plaît", l8, {}).correct, false);
});
test("checkLine: accents on/off, alternatives, empty input, expected mapped to the original", function () {
  var l9 = lineOf("l9").accept;
  var on = DLG.checkLine("Ca fait six euros cinquante", l9, { accentTolerant: true });
  assert.deepEqual(on, { correct: true, exact: false, expected: "Ça fait six euros cinquante." });
  assert.equal(DLG.checkLine("Ca fait six euros cinquante", l9, { accentTolerant: false }).correct, false);
  var alt = DLG.checkLine("ça fait 6 euros 50", l9, {});
  assert.deepEqual(alt, { correct: true, exact: true, expected: "Ça fait 6 euros 50." });
  var wrong = DLG.checkLine("Je veux un café", lineOf("l2").accept, {});
  assert.equal(wrong.correct, false);
  assert.equal(wrong.expected, lineOf("l2").fr);
  assert.deepEqual(DLG.checkLine("", l9, {}), { correct: false, exact: false, expected: lineOf("l9").fr });
  assert.equal(DLG.checkLine("   ", l9, {}).correct, false);
});

/* ---------- keys and quiz items ---------- */
test("keys: keyFor / parseKey / isKey round-trip; bad ids rejected", function () {
  var k = DLG.keyFor("at-the-cafe", "q1");
  assert.equal(k, "dlg:at-the-cafe.q1|dlg-quiz|-");
  assert.deepEqual(DLG.parseKey(k), { dialogueId: "at-the-cafe", questionId: "q1" });
  assert.equal(DLG.isKey(k), true);
  assert.equal(DLG.isKey("expr:bonjour|flash-fr-en|-"), false);
  ["dlg:__proto__.q1|dlg-quiz|-", "dlg:at-the-cafe.q10|dlg-quiz|-", "dlg:At.q1|dlg-quiz|-", "dlg:x.q1|other|-"].forEach(function (b) {
    assert.equal(DLG.parseKey(b), null, b);
  });
  assert.deepEqual(DLG.knownHeads(CAFE), ["dlg:at-the-cafe.q1", "dlg:at-the-cafe.q2", "dlg:at-the-cafe.q3", "dlg:at-the-cafe.q4"]);
  assert.deepEqual(DLG.quizKeys(DATA_D, "at-the-cafe"), DLG.knownHeads(CAFE).map(function (h) { return h + "|dlg-quiz|-"; }));
  assert.deepEqual(DLG.quizKeys(DATA_D, "nope"), []);
});
test("choiceItem: shape, 4 unique options with the answer, speaker voice, null for unknown", function () {
  var it = DLG.choiceItem(DATA_D, "dlg:at-the-cafe.q3|dlg-quiz|-", rng(3));
  assert.equal(it.kind, "choice");
  assert.equal(it.family, "dlg");
  assert.equal(it.correct, "€6.50");
  assert.equal(it.options.length, 4);
  assert.equal(new Set(it.options).size, 4);
  assert.ok(it.options.indexOf("€6.50") !== -1);
  assert.deepEqual(it.legend, { before: "At the café: ", strong: "How much does Camille pay?", strongLang: null, after: "" });
  assert.deepEqual(it.listen, { text: lineOf("l9").fr, key: null, voice: "qwen3-fr-m-bf16" });
  assert.equal(it.isFrench, false);
  assert.equal(it.display.voiceId, "qwen3-fr-m-bf16");
  assert.equal(it.display.answerLang, "en");
  var q4 = DLG.choiceItem(DATA_D, "dlg:at-the-cafe.q4|dlg-quiz|-", rng(1));
  assert.equal(q4.isFrench, true);
  assert.equal(q4.listen.voice, "qwen3-fr-bf16");
  assert.equal(DLG.choiceItem(DATA_D, "dlg:at-the-cafe.q9|dlg-quiz|-", rng(1)), null);
  assert.equal(DLG.choiceItem(DATA_D, "dlg:nope.q1|dlg-quiz|-", rng(1)), null);
  assert.equal(DLG.choiceItem(DATA_D, "expr:bonjour|flash-fr-en|-", rng(1)), null);
});

/* ---------- progress records ---------- */
test("progress: record / markListened / recordQuiz / recordRolePlay clamp and keep the best; stats", function () {
  var st = { stats: {} };
  assert.deepEqual(DLG.record(st, "at-the-cafe"), { listened: false, quizBest: -1, quizAttempts: 0, roles: {}, lastDate: "" });
  DLG.markListened(st, "at-the-cafe", "2026-10-16");
  DLG.recordQuiz(st, "at-the-cafe", 75, "2026-10-16");
  DLG.recordQuiz(st, "at-the-cafe", 50, "2026-10-16");
  DLG.recordQuiz(st, "at-the-cafe", 150.4, "2026-10-16");
  assert.equal(st.dialogues["at-the-cafe"].quizBest, 100);
  assert.equal(st.dialogues["at-the-cafe"].quizAttempts, 3);
  DLG.recordRolePlay(st, "at-the-cafe", "customer", 83.4, "2026-10-16");
  DLG.recordRolePlay(st, "at-the-cafe", "customer", 50, "2026-10-16");
  DLG.recordRolePlay(st, "at-the-cafe", "server", -5, "2026-10-16");
  assert.deepEqual(st.dialogues["at-the-cafe"].roles, { customer: { best: 83, attempts: 2 }, server: { best: 0, attempts: 1 } });
  assert.equal(st.dialogues["at-the-cafe"].listened, true);
  st.stats["dlg:at-the-cafe.q1|dlg-quiz|-"] = { seen: 2, correct: 1, box: 3 };
  st.stats["dlg:at-the-cafe.q2|dlg-quiz|-"] = { seen: 1, correct: 0, box: 0 };
  var s = DLG.stats(st, CAFE);
  assert.equal(s.answered, 3);
  assert.equal(s.correct, 1);
  assert.equal(s.mastered, 1);
  assert.equal(s.total, 4);
  assert.equal(s.byDialogue["at-the-cafe"].quizBest, 100);
  assert.equal(s.byDialogue["at-the-cafe"].listened, true);
  assert.equal(DLG.stats({}, DATA_D).byDialogue["at-the-cafe"].quizBest, -1);
});

/* ---------- listen texts ---------- */
test("listenEntries: one per line with its speaker's voice, vocab and examples on the default voice", function () {
  var es = DLG.listenEntries(CAFE);
  var lines = es.filter(function (e) { return e.category === "dialogue-line"; });
  assert.equal(lines.length, 12);
  lines.forEach(function (e, i) {
    var l = D0.lines[i];
    assert.equal(e.text, l.fr);
    assert.equal(e.voice, l.speaker === "server" ? "qwen3-fr-m-bf16" : "qwen3-fr-bf16");
  });
  es.filter(function (e) { return e.category !== "dialogue-line"; }).forEach(function (e) { assert.equal(e.voice, null); });
  assert.equal(es.filter(function (e) { return e.category === "dialogue-vocab"; }).length, 9);
  assert.equal(es.filter(function (e) { return e.category === "dialogue-example"; }).length, 2);
  assert.equal(DLG.voiceOf(D0, "server"), "qwen3-fr-m-bf16");
  assert.equal(DLG.voiceOf(D0, "nope"), null);
});

/* ---------- role-play stepping ---------- */
test("partnerRun: learner first line, partner lines, consecutive partner lines and the end", function () {
  var c = DLG.partnerRun(D0, "server", 0);
  assert.deepEqual(c.partner, []);
  assert.equal(c.learner.id, "l1");
  assert.equal(c.nextIndex, 1);
  c = DLG.partnerRun(D0, "customer", 0);
  assert.deepEqual(c.partner.map(function (l) { return l.id; }), ["l1"]);
  assert.equal(c.learner.id, "l2");
  assert.equal(c.nextIndex, 2);
  c = DLG.partnerRun(D0, "server", 11);
  assert.deepEqual(c.partner.map(function (l) { return l.id; }), ["l12"]);
  assert.equal(c.learner, null);
  assert.equal(c.nextIndex, 12);
  var d = clone(D0);
  d.lines[2].speaker = "customer";   // l2, l3, l4 all customer: three consecutive partner lines for the server
  c = DLG.partnerRun(d, "server", 1);
  assert.deepEqual(c.partner.map(function (l) { return l.id; }), ["l2", "l3", "l4"]);
  assert.equal(c.learner.id, "l5");
  assert.equal(c.nextIndex, 5);
});

/* ---------- play-all state machine ---------- */
function fakeClock() {
  var now = 0, seq = 0, timers = [];
  return {
    setTimeout: function (fn, ms) { var id = ++seq; timers.push({ id: id, at: now + ms, fn: fn }); return id; },
    clearTimeout: function (id) { timers = timers.filter(function (t) { return t.id !== id; }); },
    tick: function (ms) {
      var end = now + ms;
      for (;;) {
        timers.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
        var t = timers[0];
        if (!t || t.at > end) break;
        timers.shift();
        now = t.at;
        t.fn();
      }
      now = end;
    },
    pending: function () { return timers.length; },
    now: function () { return now; }
  };
}
function harness(count, behave) {
  var clk = fakeClock(), log = { plays: [], stops: 0, changes: [], cbs: [] };
  var p = DLG.makePlayer({
    count: count, gapMs: 500, setTimeout: clk.setTimeout, clearTimeout: clk.clearTimeout,
    play: function (i, onEnd, onStart) {
      log.plays.push({ i: i, at: clk.now() });
      log.cbs[i] = log.cbs[i] || [];
      log.cbs[i].push({ onEnd: onEnd, onStart: onStart });
      if (behave) behave(i, onEnd, onStart, clk);
    },
    stop: function () { log.stops++; },
    onChange: function (s, i) { log.changes.push(s + ":" + i); }
  });
  return { p: p, clk: clk, log: log, last: function (i) { var a = log.cbs[i]; return a[a.length - 1]; } };
}
test("makePlayer: sequence, gap, finished; start(0) plays synchronously", function () {
  var h = harness(3);
  h.p.start(0);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0]);
  assert.equal(h.p.state(), "playing");
  h.last(0).onEnd();
  h.clk.tick(499);
  assert.equal(h.log.plays.length, 1);
  h.clk.tick(1);
  assert.equal(h.log.plays.length, 2);
  h.last(1).onEnd(); h.clk.tick(500);
  h.last(2).onEnd(); h.clk.tick(500);
  assert.equal(h.p.state(), "finished");
  assert.equal(h.p.index(), -1);
  assert.equal(h.clk.pending(), 0);
  assert.deepEqual(h.log.changes, ["playing:0", "playing:1", "playing:2", "finished:-1"]);
});
test("makePlayer: pause/resume restarts the line synchronously; stale onEnd after pause is ignored", function () {
  var h = harness(3);
  h.p.start(0);
  var first = h.last(0);
  h.p.pause();
  assert.equal(h.p.state(), "paused");
  assert.equal(h.log.stops, 1);
  first.onEnd();
  h.clk.tick(20000);
  assert.equal(h.log.plays.length, 1);
  h.p.resume();
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 0]);
  h.last(0).onEnd(); h.clk.tick(500);
  assert.equal(h.log.plays[2].i, 1);
});
test("makePlayer: watchdog advances; a second onStart re-arms with the new duration; 15 s fallback", function () {
  var h = harness(3);
  h.p.start(0);
  h.last(0).onStart(2000);            // 6000 ms
  h.clk.tick(3000);
  h.last(0).onStart(8000);            // re-armed: 12000 ms from now
  h.clk.tick(11999);
  assert.equal(h.log.plays.length, 1);
  h.clk.tick(1 + 500);
  assert.equal(h.log.plays.length, 2);
  h.clk.tick(15000 - 1);              // no onStart for line 1: fallback 15 s
  assert.equal(h.log.plays.length, 2);
  h.clk.tick(1 + 500);
  assert.equal(h.log.plays.length, 3);
});
test("makePlayer: a double onEnd advances once; stop() is a no-op when idle; stop() resets", function () {
  var h = harness(3);
  h.p.stop();
  assert.equal(h.log.stops, 0);
  assert.deepEqual(h.log.changes, []);
  h.p.start(0);
  h.last(0).onEnd(); h.last(0).onEnd();
  h.clk.tick(500);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1]);
  h.clk.tick(500);
  assert.equal(h.log.plays.length, 2);
  h.p.stop();
  assert.equal(h.p.state(), "idle");
  assert.equal(h.p.index(), -1);
  assert.equal(h.log.stops, 1);
  h.clk.tick(60000);
  assert.equal(h.log.plays.length, 2);
  h.p.toggle();
  assert.equal(h.log.plays[2].i, 0);
});
/* review iteration 3, finding 1: the per-call / per-run guard */
test("makePlayer (finding 1): onEnd synchronously inside play(0) advances once, only after gapMs, no recursion", function () {
  var depth = 0, maxDepth = 0;
  var h = harness(3, function (i, onEnd) {
    depth++; maxDepth = Math.max(maxDepth, depth);
    onEnd();
    depth--;
  });
  h.p.start(0);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0]);
  h.clk.tick(499);
  assert.equal(h.log.plays.length, 1);
  h.clk.tick(1);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1]);
  assert.equal(maxDepth, 1);
  h.clk.tick(1000);
  assert.equal(h.p.state(), "finished");
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1, 2]);
});
test("makePlayer (finding 1): onStart(1000) synchronously inside play(0) leaves a 5000 ms watchdog", function () {
  var h = harness(2, function (i, onEnd, onStart) { if (i === 0) onStart(1000); });
  h.p.start(0);
  h.clk.tick(5000 + 499);
  assert.equal(h.log.plays.length, 1);
  h.clk.tick(1);
  assert.equal(h.log.plays.length, 2);
});
test("makePlayer (finding 1): watchdog fires for line 0, then a late onEnd for line 0 during the gap: play(1) once, line 2 not skipped", function () {
  var h = harness(3);
  h.p.start(0);
  h.last(0).onStart(0);               // 4000 ms
  h.clk.tick(4000);                   // watchdog settles line 0; gap running
  h.last(0).onEnd();                  // late
  h.clk.tick(500);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1]);
  h.clk.tick(100);
  assert.equal(h.log.plays.length, 2);
  h.last(1).onEnd(); h.clk.tick(500);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1, 2]);
});
test("makePlayer (finding 1): line 1's onEnd advances normally after line 0's", function () {
  var h = harness(3);
  h.p.start(0);
  h.last(0).onEnd(); h.clk.tick(500);
  h.last(1).onEnd(); h.clk.tick(500);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1, 2]);
});
test("makePlayer (finding 1): late onEnd / onStart from line 0 while line 1 plays are ignored", function () {
  var h = harness(3);
  h.p.start(0);
  var l0 = h.last(0);
  l0.onEnd(); h.clk.tick(500);        // line 1 playing, its 15 s fallback armed at t=500
  l0.onEnd();                         // late: must not advance
  l0.onStart(0);                      // late: must not re-arm line 1's watchdog to 4 s
  h.clk.tick(4000 + 500 + 100);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1]);
  h.clk.tick(15000 - 4600 - 1);
  assert.equal(h.log.plays.length, 2);
  h.clk.tick(1 + 500);
  assert.deepEqual(h.log.plays.map(function (x) { return x.i; }), [0, 1, 2]);
});
test("makePlayer: pause or stop during the gap cancels the advance; resume replays the paused line", function () {
  var h = harness(3);
  h.p.start(0);
  h.last(0).onEnd();
  h.clk.tick(200);
  h.p.stop();
  h.clk.tick(1000);
  assert.equal(h.log.plays.length, 1);
  h.p.start(0);
  h.last(0).onEnd();
  h.clk.tick(100);
  h.p.pause();
  h.clk.tick(1000);
  assert.equal(h.log.plays.length, 2);
  h.p.resume();
  assert.equal(h.log.plays[2].i, 0);
});
/* review iteration 3, finding 2: stopPlayer() regression (the view's logic, reproduced on the real player) */
test("stopPlayer regression (finding 2): a stopped listen player stays usable; Play all after a per-line Listen starts at l1", function () {
  var player = null, rpPlayer = null, stopAudio = 0;
  function running(p) { return p && (p.state() === "playing" || p.state() === "paused"); }
  function stopPlayer() {   // views-dialogues.js stopPlayer(), verbatim logic
    var any = false;
    if (running(player)) { player.stop(); any = true; }
    if (running(rpPlayer)) { rpPlayer.stop(); any = true; }
    rpPlayer = null;
    if (any) stopAudio++;
  }
  var h = harness(12);
  player = h.p;
  // a per-line Listen (l3) before Play all: the capture listener calls stopPlayer() with nothing playing
  stopPlayer();
  assert.equal(stopAudio, 0);
  assert.ok(player, "the listen-mode player is never discarded by stopPlayer()");
  player.toggle();                    // Play all
  assert.equal(player.state(), "playing");
  assert.equal(h.log.plays[0].i, 0);
  h.last(0).onEnd(); h.clk.tick(500);
  h.last(1).onEnd(); h.clk.tick(500);
  h.last(2).onEnd(); h.clk.tick(500);
  h.last(3).onEnd(); h.clk.tick(500);  // l5 playing
  stopPlayer();                       // l5's Listen mid-run
  assert.equal(player.state(), "idle");
  assert.equal(stopAudio, 1);
  assert.ok(player);
  player.toggle();                    // Play all again starts from l1
  assert.equal(player.state(), "playing");
  assert.equal(h.log.plays[h.log.plays.length - 1].i, 0);
});

/* ---------- evaluator registry ---------- */
test("evaluators: empty after the site scripts load; register rejects bad shapes; available swallows throws; validateResult", function () {
  var E = DLG.evaluators;
  assert.deepEqual(E.list(), []);
  assert.equal(E.register(null), false);
  assert.equal(E.register({ id: "Bad Id", label: "x", isAvailable: function () { return true; }, evaluate: function () {} }), false);
  assert.equal(E.register({ id: "ok", label: "", isAvailable: function () { return true; }, evaluate: function () {} }), false);
  assert.deepEqual(E.list(), []);
  assert.equal(E.validateResult(null), null);
  assert.equal(E.validateResult({ verdict: "maybe", feedback: "x" }), null);
  assert.equal(E.validateResult({ verdict: "close" }), null);
  var r = E.validateResult({ verdict: "close", feedback: "a".repeat(700), suggestion: "b".repeat(300), transcript: "c".repeat(400), extra: 1 });
  assert.equal(r.feedback.length, 600);
  assert.equal(r.suggestion.length, 200);
  assert.equal(r.transcript.length, 300);
  assert.equal(r.extra, undefined);
  // a sandboxed copy so the shared registry stays empty for the browser-shaped assertion above
  var vm = require("node:vm");
  var sb = { console: console };
  sb.window = sb;
  vm.createContext(sb);
  ["logic.js", "dialogues.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), sb); });
  var R = sb.VT_DLG.evaluators;
  assert.equal(R.register({ id: "throws", label: "T", isAvailable: function () { throw new Error("x"); }, evaluate: function () {} }), true);
  assert.equal(R.register({ id: "yes", label: "Y", isAvailable: function () { return true; }, evaluate: function () {} }), true);
  assert.equal(R.register({ id: "yes", label: "Y2", isAvailable: function () { return true; }, evaluate: function () {} }), false);
  assert.equal(R.available({ protocol: "file:", method: "typed" }).map(function (e) { return e.id; }).join(","), "yes");
});

/* ---------- static checks ---------- */
var NET_RE = /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|getUserMedia/;
test("static: no network code in the dialogue scripts", function () {
  ["dialogues.js", "dialogues-data.js", "views-dialogues.js"].forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
    assert.ok(!NET_RE.test(src), f);
  });
});
test("static: views-dialogues.js builds DOM without innerHTML or inline styles", function () {
  var src = fs.readFileSync(path.join(ROOT, "js", "views-dialogues.js"), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src));
  assert.ok(!/\.style\.|setAttribute\("style"|style:/.test(src));
});
test("naming (finding 1): no dlg class/id in the view or the #view-dialogues markup (only dlg-reference, dlg:, dlg-quiz)", function () {
  var src = fs.readFileSync(path.join(ROOT, "js", "views-dialogues.js"), "utf8");
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var m = /<section id="view-dialogues"[\s\S]*?<\/section>\s*(?=<!--|<section)/.exec(html);
  assert.ok(m, "#view-dialogues section");
  [src, m[0]].forEach(function (s, i) {
    var cleaned = s.replace(/dlg-reference/g, "").replace(/dlg:/g, "").replace(/dlg-quiz/g, "");
    assert.ok(!/class="dlg/.test(cleaned), i);
    assert.ok(!/["']dlg-/.test(cleaned), i);
    assert.ok(!/className: "dlg/.test(cleaned), i);
  });
});
test("static: index.html loads the dialogue scripts in order with ?v=__BUILD__ and the male manifest before speech.js", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  function at(s) { var i = html.indexOf('<script src="' + s + '?v=__BUILD__"></script>'); assert.ok(i !== -1, s); return i; }
  assert.ok(at("js/dialogues-data.js") > at("js/expressions-data.js"));
  assert.ok(at("js/dialogues.js") > at("js/expressions.js"));
  assert.ok(at("js/views-dialogues.js") > at("js/views-expressions.js"));
  var m = at("js/tts-manifest-qwen3-fr-m-bf16.js");
  assert.ok(m > at("js/tts-manifest.js") && m < at("js/speech.js"));
  assert.match(html, /class="nav-link" href="#dialogues" data-nav="dialogues"/);
  assert.match(html, /class="more-link" href="#dialogues" data-close data-nav="dialogues"/);
  assert.match(html, /<p class="hint" id="voice-dialogue-note" hidden><\/p>/);
  assert.match(html, /id="i-messages-square"/);
});

/* ---------- voices (design §5.6) ---------- */
test("voices: every speakers[].voice is the default voice or a shipped VT_TTS_VOICES entry, and index.html loads it", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  DATA_D.dialogues.forEach(function (d) {
    d.speakers.forEach(function (s) {
      assert.ok(VOICE_IDS.indexOf(s.voice) !== -1, s.voice);
      if (s.voice !== SHIPPED.VT_TTS.defaultVoice) {
        assert.ok(html.indexOf('<script src="js/tts-manifest-' + s.voice + '.js?v=__BUILD__"></script>') !== -1, s.voice);
      }
    });
  });
});
test("voices: the female manifest keeps its format, default voice and pre-dialogue entries", function () {
  var T = SHIPPED.VT_TTS;
  assert.equal(T.defaultVoice, "qwen3-fr-bf16");
  assert.deepEqual(Object.keys(T.voices), ["qwen3-fr-bf16"]);
  var src = fs.readFileSync(path.join(ROOT, "js", "tts-manifest.js"), "utf8");
  assert.ok(src.indexOf("window.VT_TTS = {") !== -1);
  assert.ok(src.indexOf("VT_TTS_VOICES") === -1);
  Object.keys(T.items).forEach(function (k) {
    assert.equal(T.items[k].voiceId, "qwen3-fr-bf16");
    assert.ok(T.items[k].file.indexOf("audio/tts/qwen3-fr-bf16/") === 0);
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(T.items, L.ttsKey("je me suis assis")), "je me suis assis stays excluded");
  var M = SHIPPED.VT_TTS_VOICES["qwen3-fr-m-bf16"];
  assert.equal(M.voice.id, "qwen3-fr-m-bf16");
  assert.equal(M.voice.synthetic, true);
  assert.match(M.voice.note, /no real person was recorded or cloned/);
  Object.keys(M.items).forEach(function (k) { assert.equal(M.items[k].voiceId, "qwen3-fr-m-bf16"); });
});

/* ---------- all 20 dialogues: per-line content, role-play, quiz, clips ---------- */
var VOICE_DIRS = { "qwen3-fr-bf16": "qwen3-fr-bf16", "qwen3-fr-m-bf16": "qwen3-fr-m-bf16" };
/* Dialogue lines with no clip on purpose (failed-excluded, the device voice reads them). Empty now:
   at-the-bakery l7 "Un euro vingt pièce." was reviewed and shipped as failed-kept (Whisper writes "1,20€"
   and drops "pièce"; the word is spoken). */
var DEVICE_VOICE_LINES = [];
function clipHash(text) { return require("node:crypto").createHash("sha256").update(L.ttsKey(text), "utf8").digest("hex").slice(0, 16); }
function voiceManifest(voice) {
  return voice === SHIPPED.VT_TTS.defaultVoice ? SHIPPED.VT_TTS : SHIPPED.VT_TTS_VOICES[voice];
}
test("all 20: unique dialogue, line, vocab and question ids; every line has fr, pron, en and a known speaker with a shipped voice", function () {
  var ids = DATA_D.dialogues.map(function (d) { return d.id; });
  assert.equal(new Set(ids).size, 20);
  DATA_D.dialogues.forEach(function (d) {
    ["lines", "vocab", "questions"].forEach(function (k) {
      var xs = d[k].map(function (x) { return x.id; });
      assert.equal(new Set(xs).size, xs.length, d.id + " " + k);
    });
    var sp = {};
    d.speakers.forEach(function (s) {
      assert.ok(VOICE_IDS.indexOf(s.voice) !== -1 && VOICE_DIRS[s.voice], d.id + " " + s.id);
      sp[s.id] = s.voice;
    });
    assert.equal(d.speakers.length, 2, d.id);
    d.lines.forEach(function (l) {
      var where = d.id + "/" + l.id;
      ["fr", "pron", "en"].forEach(function (k) { assert.ok(typeof l[k] === "string" && l[k].trim() !== "", where + " " + k); });
      assert.ok(Object.prototype.hasOwnProperty.call(sp, l.speaker), where + " speaker " + l.speaker);
      assert.equal(DLG.voiceOf(d, l.speaker), sp[l.speaker], where);
    });
    // both speakers actually speak
    d.speakers.forEach(function (s) { assert.ok(d.lines.some(function (l) { return l.speaker === s.id; }), d.id + " " + s.id); });
  });
});
test("all 20: every vocab link and Notice table resolves to a real verb / expression / table id", function () {
  var n = 0;
  DATA_D.dialogues.forEach(function (d) {
    d.vocab.forEach(function (v) {
      if (!v.link) return;
      n++;
      var pool = { verb: VERBS, expression: EXPR, table: TABLES }[v.link.kind];
      assert.ok(pool, d.id + "/" + v.id + " kind " + v.link.kind);
      assert.ok(Object.prototype.hasOwnProperty.call(pool, v.link.id), d.id + "/" + v.id + " → " + v.link.kind + ":" + v.link.id);
    });
    assert.ok(d.notice.table && Object.prototype.hasOwnProperty.call(TABLES, d.notice.table), d.id + " notice " + d.notice.table);
  });
  assert.ok(n > 40, "links checked " + n);
});
test("all 20: role-play accepts every listed alternative (accents strict) and rejects another line / a wrong answer", function () {
  DATA_D.dialogues.forEach(function (d) {
    d.lines.forEach(function (l, i) {
      var where = d.id + "/" + l.id;
      l.accept.forEach(function (a) {
        var r = DLG.checkLine(a, l.accept, { accentTolerant: false });
        assert.equal(r.correct, true, where + ": " + a);
        assert.equal(r.exact, true, where + ": " + a);
      });
      var keys = l.accept.map(DLG.lineKey);
      var other = d.lines.filter(function (o, j) { return j !== i && keys.indexOf(DLG.lineKey(o.fr)) === -1; })[0];
      assert.equal(DLG.checkLine(other.fr, l.accept, { accentTolerant: true }).correct, false, where + " vs " + other.id);
      assert.equal(DLG.checkLine("Je ne comprends rien du tout aujourd'hui.", l.accept, { accentTolerant: true }).correct, false, where);
    });
  });
});
test("all 20: every quiz item offers its answer among 4 unique options, voiced by its line's speaker", function () {
  var n = 0;
  DATA_D.dialogues.forEach(function (d) {
    var byLine = {};
    d.lines.forEach(function (l) { byLine[l.id] = l; });
    DLG.quizKeys(DATA_D, d.id).forEach(function (k, qi) {
      var it = DLG.choiceItem(DATA_D, k, rng(qi + 7));
      var qq = d.questions[qi];
      assert.ok(it, k);
      assert.equal(it.correct, qq.answer, k);
      assert.equal(it.options.length, 4, k);
      assert.equal(new Set(it.options).size, 4, k);
      assert.ok(it.options.indexOf(qq.answer) !== -1, k);
      assert.equal(it.listen.voice, DLG.voiceOf(d, byLine[qq.line].speaker), k);
      n++;
    });
  });
  assert.equal(n, 80);
});
test("all 20: every line has a clip in its speaker's voice folder, or is on the documented device-voice list", function () {
  var fallback = [];
  DATA_D.dialogues.forEach(function (d) {
    d.lines.forEach(function (l) {
      var voice = DLG.voiceOf(d, l.speaker);
      var M = voiceManifest(voice);
      var e = M.items[L.ttsKey(l.fr)];
      if (!e) {
        fallback.push(l.fr);
        var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", voice, "manifest.json"), "utf8"));
        var rec = man.items[clipHash(l.fr)];
        assert.ok(rec && rec.status === "failed-excluded", d.id + "/" + l.id + " has no failed-excluded record");
        assert.equal(fs.existsSync(path.join(ROOT, "audio", "tts", voice, clipHash(l.fr) + ".mp3")), false);
        return;
      }
      assert.equal(e.voiceId, voice, d.id + "/" + l.id);
      assert.equal(e.file, "audio/tts/" + VOICE_DIRS[voice] + "/" + clipHash(l.fr) + ".mp3", d.id + "/" + l.id);
      assert.ok(fs.statSync(path.join(ROOT, e.file)).size > 1024, e.file);
    });
  });
  assert.deepEqual(fallback, DEVICE_VOICE_LINES);
});
test("all 20: existing clips and manifest records are unchanged versus HEAD (git)", function (t) {
  var cp = require("node:child_process");
  function git(args) { return cp.execFileSync("git", ["-C", REPO].concat(args), { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }); }
  try { git(["rev-parse", "HEAD"]); } catch (e) { t.skip("not a git checkout"); return; }
  var crypto = require("node:crypto");
  Object.keys(VOICE_DIRS).forEach(function (voice) {
    var dir = "verb-trainer/audio/tts/" + VOICE_DIRS[voice];
    var tree = git(["ls-tree", "-r", "HEAD", dir + "/"]).trim().split("\n").filter(function (s) { return /\.mp3$/.test(s); });
    assert.ok(tree.length > 0, voice);
    tree.forEach(function (row) {
      var m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(row);
      var buf = fs.readFileSync(path.join(REPO, m[2]));
      var sha = crypto.createHash("sha1").update("blob " + buf.length + "\0").update(buf).digest("hex");
      assert.equal(sha, m[1], m[2] + " changed");
    });
    var before = JSON.parse(git(["show", "HEAD:" + dir + "/manifest.json"])).items;
    var after = JSON.parse(fs.readFileSync(path.join(REPO, dir, "manifest.json"), "utf8")).items;
    Object.keys(before).forEach(function (h) { assert.deepEqual(after[h], before[h], voice + " record " + h); });
    var jsf = voice === SHIPPED.VT_TTS.defaultVoice ? "verb-trainer/js/tts-manifest.js" : "verb-trainer/js/tts-manifest-" + voice + ".js";
    var sb = {}; sb.window = sb;
    require("node:vm").runInNewContext(git(["show", "HEAD:" + jsf]), sb);
    // JSON round-trip: the two vm realms have different Object prototypes
    var old = clone(voice === SHIPPED.VT_TTS.defaultVoice ? sb.VT_TTS.items : sb.VT_TTS_VOICES[voice].items);
    var now = clone(voiceManifest(voice).items);
    Object.keys(old).forEach(function (k) { assert.deepEqual(now[k], old[k], voice + " entry " + k); });
  });
});
test("all 20: 'je me suis assis' stays excluded (no entry in either voice, no clip, excludedByUser record)", function () {
  var k = L.ttsKey("je me suis assis"), h = clipHash("je me suis assis");
  Object.keys(VOICE_DIRS).forEach(function (voice) {
    assert.equal(voiceManifest(voice).items[k], undefined, voice);
    assert.equal(fs.existsSync(path.join(ROOT, "audio", "tts", voice, h + ".mp3")), false, voice);
  });
  var man = JSON.parse(fs.readFileSync(path.join(ROOT, "audio", "tts", "qwen3-fr-bf16", "manifest.json"), "utf8"));
  assert.equal(man.items[h].excludedByUser, true);
});

/* ---------- printables and docs ---------- */
test("printables: both french-dialogues.md files equal markdown(); the PDF exists without metadata", function () {
  var B = require("../../tools/build-dialogues.js");
  var md = B.markdown();
  assert.equal(fs.readFileSync(path.join(REPO, "french-dialogues.md"), "utf8"), md);
  assert.equal(fs.readFileSync(path.join(ROOT, "reference", "french-dialogues.md"), "utf8"), md);
  assert.ok(md.indexOf("‿") !== -1);
  var pdf = fs.readFileSync(path.join(ROOT, "reference", "french-dialogues.pdf"));
  assert.equal(pdf.slice(0, 4).toString("latin1"), "%PDF");
  var s = pdf.toString("latin1");
  ["/Creator", "CreationDate", "ModDate"].forEach(function (k) { assert.ok(s.indexOf(k) === -1, k); });
});
test("docs: both READMEs carry the stale-cache sentence; the root README links the printables", function () {
  var root = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
  var site = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.ok(root.indexOf("older cached copy of the site") !== -1);
  assert.ok(site.indexOf("older cached copy of the site") !== -1);
  assert.ok(root.indexOf("french-dialogues.md") !== -1);
  assert.ok(root.indexOf("verb-trainer/reference/french-dialogues.pdf") !== -1);
});
