/* Story expressions (the "Expression à retenir" card at the end of a story episode, episode.expression in
   dialogues-data.js): pure helpers, no DOM. SRS keys, the two flashcard decks, Review choice items and progress
   stats, grouped by series. Kept apart from the Proverbs deck (js/proverbs.js) and from the everyday expressions
   (js/expressions.js). Records live in the shared state.stats map under "sexpr:<dialogueId>|flash-fr-en|-" /
   "|flash-en-fr|-", so the Leitner boxes, pickWeighted, record() and export work unchanged.
   Used by app.js, learn.js, views-expressions.js and views-review.js in the browser and by the Node tests. */
(function (root) {
  "use strict";
  var L = (root && root.VT_LOGIC) || require("./logic.js");
  var PREFIX = "sexpr:";
  var DECKS = ["sexpr-fr-en", "sexpr-en-fr"];
  var DECK_LABEL = { "sexpr-fr-en": "French → meaning", "sexpr-en-fr": "Meaning → French" };
  var MODE_OF = { "sexpr-fr-en": "flash-fr-en", "sexpr-en-fr": "flash-en-fr" };
  var DECK_OF = { "flash-fr-en": "sexpr-fr-en", "flash-en-fr": "sexpr-en-fr" };
  var KEY_RE = /^sexpr:([a-z0-9-]{1,40})\|(flash-fr-en|flash-en-fr)\|-$/;
  var hasOwn = Object.prototype.hasOwnProperty;

  var cache = [];   // [{ data, ix }] memoised per dialogue data object
  /* Episodes with an expression, in series order then episode order: [{ id, dialogue, series, act, expression }]. */
  function index(data) {
    for (var i = 0; i < cache.length; i++) if (cache[i].data === data) return cache[i].ix;
    var ix = { list: [], byId: {}, bySeries: {}, series: [] };
    var ds = (data && data.dialogues) || [];
    var order = ((data && data.series) || []).map(function (s) { return s.id; });
    ds.filter(function (d) { return d && d.series && d.expression; }).sort(function (a, b) {
      var sa = order.indexOf(a.series), sb = order.indexOf(b.series);
      return (sa - sb) || (a.episode - b.episode);
    }).forEach(function (d) {
      var it = { id: d.id, dialogue: d, series: d.series, act: d.act, expression: d.expression };
      ix.list.push(it);
      ix.byId[d.id] = it;
      if (!hasOwn.call(ix.bySeries, d.series)) { ix.bySeries[d.series] = []; ix.series.push(d.series); }
      ix.bySeries[d.series].push(it);
    });
    cache.push({ data: data, ix: ix });
    return ix;
  }
  function list(data) { return index(data).list.slice(); }
  /** Series ids that have expressions, in the data's series order. */
  function allSeries(data) { return index(data).series.slice(); }
  function bySeries(data, seriesId) { var b = index(data).bySeries; return hasOwn.call(b, seriesId) ? b[seriesId].slice() : []; }
  function keyFor(id, deck) { return L.itemKey(PREFIX + id, MODE_OF[deck]); }
  function isKey(k) { return /^sexpr:[a-z0-9-]+\|/.test(String(k)); }
  function parseKey(k) {
    var m = KEY_RE.exec(String(k));
    return m ? { id: m[1], mode: m[2], deck: DECK_OF[m[2]] } : null;
  }
  function itemKeys(it) { return DECKS.map(function (d) { return keyFor(it.id, d); }); }
  function knownIds(data) { return list(data).map(function (it) { return PREFIX + it.id; }); }
  /** Flashcard items for the expressions of the given series (all series when seriesIds is null), for one deck. */
  function flashItems(data, seriesIds, deck) {
    if (MODE_OF[deck] == null) return [];
    return list(data).filter(function (it) { return seriesIds == null || seriesIds.indexOf(it.series) !== -1; }).map(function (it) {
      return { key: keyFor(it.id, deck), kind: "flash", deck: deck, sexpr: it };
    });
  }
  function answerText(it, side) { return side === "fr" ? it.expression.fr : it.expression.meaning; }
  /** A Review my mistakes multiple-choice item for a story-expression key, or null for an unknown id. Distractors
      are the other expressions' meaning (French → meaning) or French (meaning → French), deterministic for a seeded rng. */
  function choiceItem(data, key, rng) {
    var p = parseKey(key);
    if (!p) return null;
    var ix = index(data);
    var it = hasOwn.call(ix.byId, p.id) ? ix.byId[p.id] : null;
    if (!it) return null;
    var side = p.mode === "flash-en-fr" ? "fr" : "en";
    var correct = answerText(it, side);
    var seen = {}; seen[L.normalize(correct)] = true;
    var pool = [];
    L.shuffle(ix.list.filter(function (c) { return c.id !== it.id; }), rng).forEach(function (c) {
      if (pool.length === 3) return;
      var t = answerText(c, side), k = L.normalize(t);
      if (!seen[k]) { seen[k] = true; pool.push(t); }
    });
    var ex = it.expression, d = it.dialogue, voice = ex.voice || null;
    var legend = side === "en"
      ? { before: "What does the expression ", strong: "« " + ex.fr + " »", strongLang: "fr", after: " mean?" }
      : { before: "Which expression means: ", strong: ex.meaning, strongLang: null, after: "" };
    return {
      kind: "choice",
      sexpr: it,
      family: "sexpr",
      side: side,
      mode: p.mode,
      correct: correct,
      options: L.buildChoices(correct, pool, 4, rng),
      isFrench: side === "fr",
      legend: legend,
      listen: { text: ex.fr, key: null, voice: voice },
      reveal: { french: ex.fr, pronunciation: ex.respelling, english: ex.meaning },
      source: { dialogueId: d.id, episode: d.episode, title: d.title },
      key: key
    };
  }
  function emptyStat() { return { answered: 0, correct: 0, mastered: 0, total: 0 }; }
  /** Answers, correct answers and mastered cards (box >= MASTERED_BOX) over both decks, overall and per series. */
  function stats(state, data) {
    var st = (state && state.stats) || {};
    var out = emptyStat();
    out.bySeries = {};
    allSeries(data).forEach(function (s) { out.bySeries[s] = emptyStat(); });
    list(data).forEach(function (it) {
      var b = out.bySeries[it.series];
      itemKeys(it).forEach(function (k) {
        var s = hasOwn.call(st, k) ? st[k] : null;
        var seen = s ? (s.seen || 0) : 0, ok = s ? (s.correct || 0) : 0;
        var mastered = s && seen && (s.box || 0) >= L.MASTERED_BOX ? 1 : 0;
        [out, b].forEach(function (o) { o.answered += seen; o.correct += ok; o.mastered += mastered; o.total += 1; });
      });
    });
    return out;
  }
  var api = {
    PREFIX: PREFIX,
    DECKS: DECKS,
    DECK_LABEL: DECK_LABEL,
    MODE_OF: MODE_OF,
    KEY_RE: KEY_RE,
    index: index,
    list: list,
    allSeries: allSeries,
    bySeries: bySeries,
    keyFor: keyFor,
    isKey: isKey,
    parseKey: parseKey,
    itemKeys: itemKeys,
    knownIds: knownIds,
    flashItems: flashItems,
    choiceItem: choiceItem,
    stats: stats
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_SEXPR = api;
})(typeof window !== "undefined" ? window : null);
