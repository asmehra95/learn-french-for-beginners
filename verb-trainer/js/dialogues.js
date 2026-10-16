/* Dialogues (VT_DIALOGUES): pure helpers, no DOM, no network. Validation, the role-play line checker, SRS keys
   and quiz items for the comprehension questions (stored in the shared state.stats map under
   "dlg:<dialogue>.<question>|dlg-quiz|-"), progress records (state.dialogues), the per-voice Listen texts, the
   play-all state machine (timers injected) and the inert AI-evaluator registry.
   Used by views-dialogues.js, views-review.js and app.js in the browser, by tts-tools/extract-corpus.js
   (vm sandbox), tools/build-dialogues.js and the Node tests. */
(function (root) {
  "use strict";
  var L = (root && root.VT_LOGIC) || require("./logic.js");
  var PREFIX = "dlg:";
  var MODE = "dlg-quiz";
  var KEY_RE = /^dlg:([a-z0-9-]{1,40})\.(q\d)\|dlg-quiz\|-$/;
  var ID_RE = /^[a-z0-9-]{1,40}$/;
  var SPEAKER_RE = /^[a-z0-9-]{1,20}$/;
  var LINE_RE = /^l\d{1,2}$/;
  var LEVELS = ["A1", "A2", "B1"];
  var PRON_RE = /^[A-Za-z \-\/'(),.…‿]+$/;
  var hasOwn = Object.prototype.hasOwnProperty;
  function own(o, k) { return !!o && hasOwn.call(o, k); }

  var cache = [];   // [{ data, ix }] memoised per data object
  function index(data) {
    for (var i = 0; i < cache.length; i++) if (cache[i].data === data) return cache[i].ix;
    var ix = { byId: {}, list: [], lineById: {}, speakerById: {}, questionById: {} };
    ((data && data.dialogues) || []).forEach(function (d) {
      ix.byId[d.id] = d;
      ix.list.push(d);
      var lines = ix.lineById[d.id] = {}, sp = ix.speakerById[d.id] = {}, qs = ix.questionById[d.id] = {};
      (d.lines || []).forEach(function (l) { lines[l.id] = l; });
      (d.speakers || []).forEach(function (s) { sp[s.id] = s; });
      (d.questions || []).forEach(function (qq) { qs[qq.id] = qq; });
    });
    ix.list.sort(function (a, b) { return a.number - b.number; });
    cache.push({ data: data, ix: ix });
    return ix;
  }

  /* ---------- line checking ---------- */
  function lineKey(s) {
    return L.normalize(s)
      .replace(/[.,;:!?…«»"“”()\u2013\u2014]/g, " ")   // all sentence punctuation, internal periods included
      .replace(/-/g, " ")                               // est-ce que = est ce que
      .replace(/\s*€\s*/g, " € ")                       // 6,50€ = 6,50 €
      .replace(/\s+/g, " ")
      .trim();
  }
  function acceptKey(s) { return L.stripAccents(lineKey(s)); }   // data-validation key only; never used for grading
  function checkLine(input, accepted, opts) {
    var list = (accepted || []).filter(function (a) { return a != null && a !== ""; });
    var keyed = list.map(lineKey);
    var r = L.checkAnswer(lineKey(input), keyed, opts);
    var at = keyed.indexOf(r.expected);
    return { correct: r.correct, exact: r.exact, expected: at !== -1 ? list[at] : (list[0] || "") };
  }

  /* ---------- validation (tests and tools/build-dialogues.js; the browser never calls it) ---------- */
  function str(v) { return typeof v === "string" && v.trim() !== ""; }
  function validate(data, refs) {
    var errs = [];
    var ds = (data && data.dialogues) || [];
    var ids = {}, numbers = {};
    if (!Array.isArray(ds)) return ["dialogues: not an array"];
    ds.forEach(function (d, di) {
      var did = d && d.id ? d.id : "#" + di;
      function err(path, rule) { errs.push(did + "/" + path + ": " + rule); }
      if (!d || typeof d !== "object") { err("", "not an object"); return; }
      if (!ID_RE.test(String(d.id))) err("id", "must match ^[a-z0-9-]{1,40}$");
      else if (ids[d.id]) err("id", "duplicate dialogue id"); else ids[d.id] = true;
      if (!(Number.isInteger(d.number) && d.number >= 1)) err("number", "must be an integer >= 1");
      else if (numbers[d.number]) err("number", "duplicate number"); else numbers[d.number] = true;
      ["title", "titleFr", "summary", "scene"].forEach(function (k) { if (!str(d[k])) err(k, "must be a non-empty string"); });
      if (str(d.summary) && d.summary.length > 120) err("summary", "longer than 120 characters");
      if (LEVELS.indexOf(d.level) === -1) err("level", "must be A1, A2 or B1");
      // 0-16 (design §1.2 said 0-12, but its own pilot list has 13 keywords; the data wins, see verification.md)
      if (!Array.isArray(d.keywords) || d.keywords.length > 16) err("keywords", "must be an array of 0-16 strings");
      else d.keywords.forEach(function (k, i) { if (!str(k) || k !== k.toLowerCase()) err("keywords[" + i + "]", "must be a lowercase string"); });
      // speakers
      var sp = Array.isArray(d.speakers) ? d.speakers : [];
      var spIds = {};
      if (sp.length !== 2) err("speakers", "exactly 2 speakers");
      var seen = { id: {}, name: {}, initial: {}, side: {} };
      sp.forEach(function (s, i) {
        var p = "speakers[" + i + "]";
        if (!s || !SPEAKER_RE.test(String(s.id))) { err(p + ".id", "must match ^[a-z0-9-]{1,20}$"); return; }
        spIds[s.id] = s;
        if (seen.id[s.id]) err(p + ".id", "duplicate speaker id"); seen.id[s.id] = true;
        if (!str(s.name)) err(p + ".name", "must be a non-empty string");
        else { var n = s.name.toLowerCase(); if (seen.name[n]) err(p + ".name", "duplicate speaker name"); seen.name[n] = true; }
        if (!str(s.role)) err(p + ".role", "must be a non-empty string");
        if (typeof s.initial !== "string" || !/^\S$/u.test(s.initial)) err(p + ".initial", "must be 1 visible letter");
        else { var c = s.initial.toLowerCase(); if (seen.initial[c]) err(p + ".initial", "duplicate initial"); seen.initial[c] = true; }
        if (s.side !== "start" && s.side !== "end") err(p + ".side", "must be start or end");
        else { if (seen.side[s.side]) err(p + ".side", "duplicate side"); seen.side[s.side] = true; }
        if (!str(s.voice)) err(p + ".voice", "must be a voice id");
        else if (refs && refs.voiceIds && refs.voiceIds.indexOf(s.voice) === -1) err(p + ".voice", "unknown voice " + s.voice);
      });
      // lines
      var lines = Array.isArray(d.lines) ? d.lines : [];
      var lineIds = {}, perSpeaker = {};
      if (lines.length < 6 || lines.length > 20) err("lines", "6-20 lines");
      lines.forEach(function (l, i) {
        var lid = l && LINE_RE.test(String(l.id)) ? l.id : "lines[" + i + "]";
        if (!l || !LINE_RE.test(String(l.id))) { err(lid + ".id", "must match ^l\\d{1,2}$"); return; }
        if (lineIds[l.id]) err(lid + ".id", "duplicate line id"); lineIds[l.id] = l;
        if (!own(spIds, l.speaker)) err(lid + ".speaker", "unknown speaker " + l.speaker);
        else perSpeaker[l.speaker] = (perSpeaker[l.speaker] || 0) + 1;
        ["fr", "pron", "en"].forEach(function (k) { if (!str(l[k])) err(lid + "." + k, "must be a non-empty string"); });
        if (str(l.fr) && l.fr.indexOf("‿") !== -1) err(lid + ".fr", "contains ‿");
        checkPron(l.pron, lid + ".pron", err);
        var acc = l.accept;
        if (!Array.isArray(acc) || acc.length < 1 || acc.length > 12) { err(lid + ".accept", "1-12 strings"); return; }
        if (acc[0] !== l.fr) err(lid + ".accept[0]", "must equal fr");
        var keys = [];
        acc.forEach(function (a, ai) {
          if (!str(a)) { err(lid + ".accept[" + ai + "]", "must be a non-empty string"); keys.push(null); return; }
          if (a.indexOf("‿") !== -1) err(lid + ".accept[" + ai + "]", "contains ‿");
          var k = acceptKey(a), j = keys.indexOf(k);
          if (j !== -1) err(lid + ".accept[" + ai + "]", "duplicate of accept[" + j + "] after lineKey + stripAccents");
          keys.push(k);
        });
      });
      Object.keys(spIds).forEach(function (sid) { if ((perSpeaker[sid] || 0) < 2) err("speakers." + sid, "needs at least 2 lines"); });
      // vocab
      var vocab = Array.isArray(d.vocab) ? d.vocab : [];
      if (vocab.length < 6 || vocab.length > 10) err("vocab", "6-10 items");
      var vIds = {};
      vocab.forEach(function (v, i) {
        var vid = v && v.id ? v.id : "vocab[" + i + "]";
        if (!v) { err(vid, "not an object"); return; }
        if (vIds[v.id]) err(vid + ".id", "duplicate vocab id"); vIds[v.id] = true;
        ["fr", "pron", "en"].forEach(function (k) { if (!str(v[k])) err(vid + "." + k, "must be a non-empty string"); });
        if (str(v.fr) && v.fr.indexOf("‿") !== -1) err(vid + ".fr", "contains ‿");
        checkPron(v.pron, vid + ".pron", err);
        var ln = lineIds[v.line];
        if (!ln) err(vid + ".line", "unknown line " + v.line);
        else if (str(v.fr) && lineKey(ln.fr).indexOf(lineKey(v.fr)) === -1) err(vid + ".fr", "not contained in " + v.line);
        if (v.link !== null) {
          if (!v.link || typeof v.link !== "object" || ["verb", "expression", "table"].indexOf(v.link.kind) === -1 || !str(v.link.id)) err(vid + ".link", "must be null or { kind, id }");
          else if (refs) {
            var m = { verb: refs.verbsById, expression: refs.exprById, table: refs.tableById }[v.link.kind];
            if (m && !own(m, v.link.id)) err(vid + ".link", "unknown " + v.link.kind + " " + v.link.id);
          }
        }
      });
      // questions
      var qs = Array.isArray(d.questions) ? d.questions : [];
      if (qs.length < 3 || qs.length > 4) err("questions", "3-4 questions");
      var qIds = {};
      qs.forEach(function (qq, i) {
        var qid = qq && /^q\d$/.test(String(qq.id)) ? qq.id : "questions[" + i + "]";
        if (!qq || !/^q\d$/.test(String(qq.id))) { err(qid + ".id", "must match ^q\\d$"); return; }
        if (qIds[qq.id]) err(qid + ".id", "duplicate question id"); qIds[qq.id] = true;
        if (!str(qq.prompt)) err(qid + ".prompt", "must be a non-empty string");
        if (!str(qq.answer)) err(qid + ".answer", "must be a non-empty string");
        if (qq.lang !== "en" && qq.lang !== "fr") err(qid + ".lang", "must be en or fr");
        if (!lineIds[qq.line]) err(qid + ".line", "unknown line " + qq.line);
        if (!Array.isArray(qq.distractors) || qq.distractors.length !== 3) { err(qid + ".distractors", "exactly 3"); return; }
        var norm = [L.normalize(qq.answer)];
        qq.distractors.forEach(function (x, xi) {
          if (!str(x)) { err(qid + ".distractors[" + xi + "]", "must be a non-empty string"); return; }
          var n = L.normalize(x);
          if (norm.indexOf(n) !== -1) err(qid + ".distractors[" + xi + "]", "duplicate of the answer or another distractor");
          norm.push(n);
        });
      });
      // notice
      var nt = d.notice;
      if (!nt || typeof nt !== "object") err("notice", "required");
      else {
        if (!str(nt.title)) err("notice.title", "must be a non-empty string");
        if (!str(nt.text)) err("notice.text", "must be a non-empty string");
        if (!Array.isArray(nt.examples) || nt.examples.length < 1 || nt.examples.length > 3) err("notice.examples", "1-3 examples");
        else nt.examples.forEach(function (x, i) {
          var p = "notice.examples[" + i + "]";
          ["fr", "pron", "en"].forEach(function (k) { if (!x || !str(x[k])) err(p + "." + k, "must be a non-empty string"); });
          if (x && str(x.fr) && x.fr.indexOf("‿") !== -1) err(p + ".fr", "contains ‿");
          if (x) checkPron(x.pron, p + ".pron", err);
        });
        if (nt.table !== null) {
          if (!str(nt.table)) err("notice.table", "must be null or a table id");
          else if (refs && refs.tableById && !own(refs.tableById, nt.table)) err("notice.table", "unknown table " + nt.table);
        }
      }
    });
    return errs;
  }
  function checkPron(p, path, err) {
    if (typeof p !== "string" || !p) return;
    if (!PRON_RE.test(p)) err(path, "respelling has a character outside the alphabet");
    if (/ ‿|‿ /.test(p)) err(path, "‿ touches a space");
  }

  /* ---------- SRS keys and quiz items ---------- */
  function keyFor(did, qid) { return L.itemKey(PREFIX + did + "." + qid, MODE); }
  function isKey(k) { return String(k).indexOf(PREFIX) === 0; }
  function parseKey(k) {
    var m = KEY_RE.exec(String(k));
    return m ? { dialogueId: m[1], questionId: m[2] } : null;
  }
  function knownHeads(data) {
    var out = [];
    ((data && data.dialogues) || []).forEach(function (d) {
      (d.questions || []).forEach(function (qq) { out.push(PREFIX + d.id + "." + qq.id); });
    });
    return out;
  }
  function quizKeys(data, did) {
    var d = index(data).byId[did];
    return d ? d.questions.map(function (qq) { return keyFor(d.id, qq.id); }) : [];
  }
  function voiceOf(d, speakerId) {
    var s = d ? (d.speakers || []).filter(function (x) { return x.id === speakerId; })[0] : null;
    return s ? s.voice : null;
  }
  function choiceItem(data, key, rng) {
    var p = parseKey(key);
    if (!p) return null;
    var ix = index(data);
    var d = own(ix.byId, p.dialogueId) ? ix.byId[p.dialogueId] : null;
    if (!d) return null;
    var qq = own(ix.questionById[d.id], p.questionId) ? ix.questionById[d.id][p.questionId] : null;
    if (!qq) return null;
    var line = ix.lineById[d.id][qq.line];
    var speaker = ix.speakerById[d.id][line.speaker];
    return { kind: "choice", dialogue: d, question: qq, family: "dlg", key: key,
      legend: { before: d.title + ": ", strong: qq.prompt, strongLang: null, after: "" },
      correct: qq.answer, options: L.buildChoices(qq.answer, qq.distractors, 4, rng), isFrench: qq.lang === "fr",
      listen: { text: line.fr, key: null, voice: speaker.voice },
      reveal: { french: line.fr, pronunciation: line.pron, english: line.en },
      display: { prompt: qq.prompt, promptLang: "en", french: qq.answer, answerLang: qq.lang,
        pronunciation: "", listenText: line.fr, voiceId: speaker.voice } };
  }

  /* ---------- Listen texts per voice (shared by the view and tts-tools/extract-corpus.js) ---------- */
  function listenEntries(data) {
    var out = [];
    ((data && data.dialogues) || []).forEach(function (d) {
      (d.lines || []).forEach(function (l) { out.push({ text: l.fr, voice: voiceOf(d, l.speaker), category: "dialogue-line" }); });
      (d.vocab || []).forEach(function (v) { out.push({ text: v.fr, voice: null, category: "dialogue-vocab" }); });
      ((d.notice && d.notice.examples) || []).forEach(function (x) { out.push({ text: x.fr, voice: null, category: "dialogue-example" }); });
    });
    return out;
  }

  /* ---------- progress records (state.dialogues) ---------- */
  function pctOf(p) { var n = Math.round(Number(p)); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
  function record(state, did) {
    if (!state.dialogues || typeof state.dialogues !== "object") state.dialogues = {};
    if (!own(state.dialogues, did)) state.dialogues[did] = { listened: false, quizBest: -1, quizAttempts: 0, roles: {}, lastDate: "" };
    return state.dialogues[did];
  }
  function markListened(state, did, day) { var r = record(state, did); r.listened = true; r.lastDate = String(day || ""); return r; }
  function recordQuiz(state, did, pct, day) {
    var r = record(state, did);
    r.quizBest = Math.max(r.quizBest, pctOf(pct)); r.quizAttempts += 1; r.lastDate = String(day || "");
    return r;
  }
  function recordRolePlay(state, did, speakerId, pct, day) {
    var r = record(state, did);
    var cur = own(r.roles, speakerId) ? r.roles[speakerId] : { best: 0, attempts: 0 };
    r.roles[speakerId] = { best: cur.attempts ? Math.max(cur.best, pctOf(pct)) : pctOf(pct), attempts: cur.attempts + 1 };
    r.lastDate = String(day || "");
    return r;
  }
  function emptyStat() { return { answered: 0, correct: 0, mastered: 0, total: 0 }; }
  function stats(state, data) {
    var st = (state && state.stats) || {};
    var recs = (state && state.dialogues) || {};
    var out = emptyStat();
    out.byDialogue = {};
    ((data && data.dialogues) || []).forEach(function (d) {
      var rec = own(recs, d.id) ? recs[d.id] : null;
      var b = emptyStat();
      b.quizBest = rec ? rec.quizBest : -1;
      b.listened = !!(rec && rec.listened);
      b.roles = rec && rec.roles ? rec.roles : {};
      (d.questions || []).forEach(function (qq) {
        var k = keyFor(d.id, qq.id);
        var s = own(st, k) ? st[k] : null;
        var seen = s ? (s.seen || 0) : 0, ok = s ? (s.correct || 0) : 0;
        var mastered = s && seen && (s.box || 0) >= L.MASTERED_BOX ? 1 : 0;
        [out, b].forEach(function (o) { o.answered += seen; o.correct += ok; o.mastered += mastered; o.total += 1; });
      });
      out.byDialogue[d.id] = b;
    });
    return out;
  }

  /* ---------- role-play stepping ---------- */
  function partnerRun(d, roleSpeakerId, from) {
    var lines = (d && d.lines) || [];
    var i = Math.max(0, from | 0), partner = [];
    while (i < lines.length && lines[i].speaker !== roleSpeakerId) partner.push(lines[i++]);
    if (i >= lines.length) return { partner: partner, learner: null, nextIndex: lines.length };
    return { partner: partner, learner: lines[i], nextIndex: i + 1 };
  }

  /* ---------- play-all state machine (design §2.6) ---------- */
  function makePlayer(opts) {
    var gapMs = opts.gapMs == null ? 500 : opts.gapMs;
    var run = 0, call = 0, state = "idle", index = -1, gapTimer = null, dogTimer = null;
    function setState(s) { state = s; if (typeof opts.onChange === "function") opts.onChange(state, index); }
    function clearTimers() {
      if (gapTimer !== null) { opts.clearTimeout(gapTimer); gapTimer = null; }
      if (dogTimer !== null) { opts.clearTimeout(dogTimer); dogTimer = null; }
    }
    function playAt(i) {
      var my = ++call, myRun = run, settled = false;
      index = i; setState("playing");
      function live() { return my === call && myRun === run && !settled; }
      function arm(ms) {
        if (dogTimer !== null) opts.clearTimeout(dogTimer);
        dogTimer = opts.setTimeout(settle, ms);
      }
      function settle() {                                 // first of onEnd / watchdog wins
        if (!live()) return;
        settled = true;
        if (dogTimer !== null) { opts.clearTimeout(dogTimer); dogTimer = null; }
        gapTimer = opts.setTimeout(function () {          // always async: no recursion
          gapTimer = null;
          if (myRun !== run) return;
          if (i + 1 < opts.count) playAt(i + 1); else { index = -1; setState("finished"); }
        }, gapMs);
      }
      function onStart(ms) { if (live()) arm(Math.min(15000, 4000 + (Number(ms) || 0))); }
      arm(15000);                                         // fallback FIRST, before opts.play can call onStart
      opts.play(i, settle, onStart);
    }
    function start(from) {
      if (!opts.count) return;
      run++; clearTimers();
      playAt(Math.max(0, Math.min(opts.count - 1, from | 0)));
    }
    function pause() {
      if (state !== "playing") return;
      run++; clearTimers(); opts.stop(); setState("paused");
    }
    function resume() {
      if (state !== "paused") return;
      run++; clearTimers(); playAt(index);
    }
    function stop() {
      if (state === "idle") return;
      run++; clearTimers(); opts.stop(); index = -1; setState("idle");
    }
    function toggle() {
      if (state === "playing") pause(); else if (state === "paused") resume(); else start(0);
    }
    return { start: start, pause: pause, resume: resume, stop: stop, toggle: toggle,
      state: function () { return state; }, index: function () { return index; } };
  }

  /* ---------- AI-evaluator extension point (design §10; none ship with the pilot) ----------
     An evaluator is { id: /^[a-z0-9-]{1,40}$/, label: string, isAvailable(env) -> boolean (sync, no I/O),
       evaluate(request) -> Promise<result> }.
     env: { protocol: location.protocol, method: "typed" | "spoken" }.
     request (frozen): { version: 1, dialogueId, lineId, speakerId, level, expected: line.fr,
       accepted: line.accept.slice(), english: line.en,
       input: { kind: "typed", text } | { kind: "audio", blob, mimeType },
       localResult: { correct, exact } | null }.
     result: { verdict: "correct" | "close" | "incorrect", feedback: string (≤ 600 chars),
       suggestion?: string (≤ 200), transcript?: string (≤ 300) }.
     Results are advisory only: they never change what is recorded. */
  var registry = [];
  var evaluators = {
    register: function (ev) {
      if (!ev || typeof ev !== "object" || !ID_RE.test(String(ev.id)) || !str(ev.label) ||
          typeof ev.isAvailable !== "function" || typeof ev.evaluate !== "function") return false;
      for (var i = 0; i < registry.length; i++) if (registry[i].id === ev.id) return false;
      registry.push(ev);
      return true;
    },
    list: function () { return registry.slice(); },
    available: function (env) {
      return registry.filter(function (ev) { try { return ev.isAvailable(env) === true; } catch (e) { return false; } });
    },
    validateResult: function (r) {
      if (!r || typeof r !== "object" || ["correct", "close", "incorrect"].indexOf(r.verdict) === -1 || typeof r.feedback !== "string") return null;
      var out = { verdict: r.verdict, feedback: r.feedback.slice(0, 600) };
      if (typeof r.suggestion === "string") out.suggestion = r.suggestion.slice(0, 200);
      if (typeof r.transcript === "string") out.transcript = r.transcript.slice(0, 300);
      return out;
    }
  };

  var api = {
    PREFIX: PREFIX,
    MODE: MODE,
    KEY_RE: KEY_RE,
    PRON_RE: PRON_RE,
    index: index,
    validate: validate,
    lineKey: lineKey,
    acceptKey: acceptKey,
    checkLine: checkLine,
    keyFor: keyFor,
    isKey: isKey,
    parseKey: parseKey,
    knownHeads: knownHeads,
    quizKeys: quizKeys,
    choiceItem: choiceItem,
    voiceOf: voiceOf,
    listenEntries: listenEntries,
    record: record,
    markListened: markListened,
    recordQuiz: recordQuiz,
    recordRolePlay: recordRolePlay,
    stats: stats,
    partnerRun: partnerRun,
    makePlayer: makePlayer,
    evaluators: evaluators
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_DLG = api;
})(typeof window !== "undefined" ? window : null);
