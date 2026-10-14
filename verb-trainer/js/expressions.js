/* Everyday expressions (VT_EXPRESSIONS): pure helpers, no DOM. SRS keys, flashcard decks, review choice
   items, progress stats and the Listen texts. Expression records live in the shared state.stats map under
   "expr:<id>|<mode>|-", so the existing Leitner boxes, pickWeighted, record() and export all work unchanged.
   Used by app.js, views-review.js and views-expressions.js in the browser, by tts-tools/extract-corpus.js
   (vm sandbox) and by the Node tests. */
(function (root) {
  "use strict";
  var L = (root && root.VT_LOGIC) || require("./logic.js");

  var PREFIX = "expr:";
  var DECKS = ["expr-fr-en", "expr-en-fr", "expr-audio"];
  var MODE_OF = { "expr-fr-en": "flash-fr-en", "expr-en-fr": "flash-en-fr", "expr-audio": "flash-audio" };
  var DECK_OF = { "flash-fr-en": "expr-fr-en", "flash-en-fr": "expr-en-fr", "flash-audio": "expr-audio" };
  var REGISTER_LABEL = { formal: "Formal", neutral: "Neutral", informal: "Informal" };
  var KEY_RE = /^expr:([a-z0-9-]+)\|(flash-fr-en|flash-en-fr|flash-audio)\|-$/;

  var cache = [];   // [{ data, ix }] memoised per data object
  function index(data) {
    for (var i = 0; i < cache.length; i++) if (cache[i].data === data) return cache[i].ix;
    var ix = { byId: {}, byTheme: {}, themeById: {} };
    ((data && data.themes) || []).forEach(function (t) { ix.themeById[t.id] = t; ix.byTheme[t.id] = []; });
    ((data && data.expressions) || []).forEach(function (e) {
      ix.byId[e.id] = e;
      (ix.byTheme[e.theme] = ix.byTheme[e.theme] || []).push(e);
    });
    cache.push({ data: data, ix: ix });
    return ix;
  }

  function keyFor(id, deck) { return L.itemKey(PREFIX + id, MODE_OF[deck]); }
  function isKey(k) { return /^expr:[a-z0-9-]+\|/.test(String(k)); }
  function parseKey(k) {
    var m = KEY_RE.exec(String(k));
    return m ? { id: m[1], mode: m[2], deck: DECK_OF[m[2]] } : null;
  }
  function itemKeys(e) { return DECKS.map(function (d) { return keyFor(e.id, d); }); }
  function speakText(e) { return e.say || e.fr; }
  function listenTexts(e) { return [speakText(e), e.example.fr]; }
  function allThemeIds(data) { return ((data && data.themes) || []).map(function (t) { return t.id; }); }
  function knownIds(data) { return ((data && data.expressions) || []).map(function (e) { return PREFIX + e.id; }); }
  function answerText(e, side) { return side === "en" ? e.en : e.fr; }
  function cueText(e) { return e.cue ? "(" + e.cue + ")" : ""; }

  /** Flashcard items for the expressions in themeIds (data order), for one deck. */
  function flashItems(data, themeIds, deck) {
    if (!data || MODE_OF[deck] == null) return [];
    var want = {};
    (themeIds || []).forEach(function (id) { want[id] = true; });
    return (data.expressions || []).filter(function (e) { return want[e.theme]; }).map(function (e) {
      return { key: keyFor(e.id, deck), kind: "flash", deck: deck, expr: e };
    });
  }

  /* An English meaning split at "/", each part without a trailing "…", "!" or "?" and a leading "to ". */
  function seg(s) { return L.normalize(String(s).trim().replace(/…$/, "")).replace(/^to /, ""); }
  function segments(e) { return String(e.en).split("/").map(seg).filter(Boolean); }
  function keywordSet(e) { return (e.keywords || []).map(function (k) { return L.normalize(k); }); }
  function shares(a, b) {
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) !== -1) return true;
    return false;
  }

  /** Rules (a)-(e): candidates that would make a review question ambiguous. */
  function excluded(e, c, side) {
    if (c.id === e.id) return true;                                                     // (a)
    if (shares(segments(c), segments(e))) return true;                                  // (b)
    if (shares(keywordSet(c), keywordSet(e))) return true;                              // (c)
    if ((e.confusable || []).indexOf(c.id) !== -1 || (c.confusable || []).indexOf(e.id) !== -1) return true; // (d)
    if (side === "fr" && L.normalize(speakText(c)) === L.normalize(speakText(e))) return true; // (e)
    return false;
  }

  /** Exactly three distractor strings: same theme first (shuffled), then the other themes (shuffled). */
  function distractorPool(data, e, side, rng) {
    var ix = index(data), answer = L.normalize(answerText(e, side));
    var same = L.shuffle((ix.byTheme[e.theme] || []).filter(function (c) { return c.id !== e.id; }), rng);
    var other = L.shuffle(data.expressions.filter(function (c) { return c.theme !== e.theme; }), rng);
    var seen = {}; seen[answer] = true;
    var out = [];
    same.concat(other).forEach(function (c) {
      if (out.length === 3 || excluded(e, c, side)) return;
      var t = answerText(c, side), k = L.normalize(t);
      if (!seen[k]) { seen[k] = true; out.push(t); }
    });
    return out;
  }

  /** A Review my mistakes multiple-choice item for an expression key, or null for an unknown id.
      The legend is plain parts ({ before, strong, strongLang, after }); views-review.js builds the DOM. */
  function choiceItem(data, key, rng) {
    var p = parseKey(key);
    if (!p) return null;
    var e = index(data).byId[p.id];
    if (!e) return null;
    var side = p.mode === "flash-en-fr" ? "fr" : "en";
    var correct = answerText(e, side);
    var legend = side === "en"
      ? { before: "What does ", strong: e.fr, strongLang: "fr", after: " mean?" }
      : { before: "Which French expression means ", strong: e.en.replace(/\s*[?!]+$/, ""), strongLang: null,
          after: (e.cue ? " " + cueText(e) : "") + "?" };
    return {
      kind: "choice",
      expr: e,
      family: "expr",
      side: side,
      mode: p.mode,
      correct: correct,
      options: L.buildChoices(correct, distractorPool(data, e, side, rng), 4, rng),
      isFrench: side === "fr",
      legend: legend,
      listen: { text: speakText(e), key: null },
      reveal: { french: e.fr, pronunciation: e.pron, english: e.en },
      key: key
    };
  }

  function emptyStat() { return { answered: 0, correct: 0, mastered: 0, total: 0 }; }

  /** Answers, correct answers and mastered cards (box >= MASTERED_BOX) over all three decks, overall and per theme. */
  function stats(state, data) {
    var st = (state && state.stats) || {};
    var out = emptyStat();
    out.byTheme = {};
    allThemeIds(data).forEach(function (id) { out.byTheme[id] = emptyStat(); });
    ((data && data.expressions) || []).forEach(function (e) {
      var t = out.byTheme[e.theme] || (out.byTheme[e.theme] = emptyStat());
      itemKeys(e).forEach(function (k) {
        var s = Object.prototype.hasOwnProperty.call(st, k) ? st[k] : null;
        var seen = s ? (s.seen || 0) : 0, ok = s ? (s.correct || 0) : 0;
        var mastered = s && seen && (s.box || 0) >= L.MASTERED_BOX ? 1 : 0;
        [out, t].forEach(function (o) { o.answered += seen; o.correct += ok; o.mastered += mastered; o.total += 1; });
      });
    });
    return out;
  }

  var api = {
    PREFIX: PREFIX,
    DECKS: DECKS,
    MODE_OF: MODE_OF,
    REGISTER_LABEL: REGISTER_LABEL,
    index: index,
    keyFor: keyFor,
    isKey: isKey,
    parseKey: parseKey,
    itemKeys: itemKeys,
    speakText: speakText,
    listenTexts: listenTexts,
    flashItems: flashItems,
    choiceItem: choiceItem,
    stats: stats,
    allThemeIds: allThemeIds,
    knownIds: knownIds,
    distractorPool: distractorPool,
    excluded: excluded,
    segment: seg,
    answerText: answerText,
    cueText: cueText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_EXPR = api;
})(typeof window !== "undefined" ? window : null);
