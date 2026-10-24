/* Proverbs (the "Sagesse du jour" of each story episode, episode.proverb in dialogues-data.js): pure helpers,
   no DOM. SRS keys, the two flashcard decks, Review choice items and progress stats. Records live in the shared
   state.stats map under "prov:<dialogueId>|flash-fr-en|-" / "|flash-en-fr|-", so the Leitner boxes,
   pickWeighted, record() and export work unchanged (like the expressions decks, js/expressions.js).
   Used by app.js, learn.js and views-review.js in the browser and by the Node tests. */
(function (root) {
  "use strict";
  var L = (root && root.VT_LOGIC) || require("./logic.js");
  var PREFIX = "prov:";
  var DECKS = ["prov-fr-en", "prov-en-fr"];
  var DECK_LABEL = { "prov-fr-en": "French → meaning", "prov-en-fr": "Meaning → French" };
  var MODE_OF = { "prov-fr-en": "flash-fr-en", "prov-en-fr": "flash-en-fr" };
  var DECK_OF = { "flash-fr-en": "prov-fr-en", "flash-en-fr": "prov-en-fr" };
  var KEY_RE = /^prov:([a-z0-9-]{1,40})\|(flash-fr-en|flash-en-fr)\|-$/;
  var hasOwn = Object.prototype.hasOwnProperty;

  var cache = [];   // [{ data, ix }] memoised per dialogue data object
  /* Episodes with a proverb, in series order then episode order: [{ id, dialogue, series, act, proverb }]. */
  function index(data) {
    for (var i = 0; i < cache.length; i++) if (cache[i].data === data) return cache[i].ix;
    var ix = { list: [], byId: {}, series: [] };
    var ds = (data && data.dialogues) || [];
    var order = ((data && data.series) || []).map(function (s) { return s.id; });
    ds.filter(function (d) { return d && d.series && d.proverb; }).sort(function (a, b) {
      var sa = order.indexOf(a.series), sb = order.indexOf(b.series);
      return (sa - sb) || (a.episode - b.episode);
    }).forEach(function (d) {
      var it = { id: d.id, dialogue: d, series: d.series, act: d.act, proverb: d.proverb };
      ix.list.push(it);
      ix.byId[d.id] = it;
      if (ix.series.indexOf(d.series) === -1) ix.series.push(d.series);
    });
    cache.push({ data: data, ix: ix });
    return ix;
  }
  function list(data) { return index(data).list.slice(); }
  function keyFor(id, deck) { return L.itemKey(PREFIX + id, MODE_OF[deck]); }
  function isKey(k) { return /^prov:[a-z0-9-]+\|/.test(String(k)); }
  function parseKey(k) {
    var m = KEY_RE.exec(String(k));
    return m ? { id: m[1], mode: m[2], deck: DECK_OF[m[2]] } : null;
  }
  function itemKeys(it) { return DECKS.map(function (d) { return keyFor(it.id, d); }); }
  function knownIds(data) { return list(data).map(function (it) { return PREFIX + it.id; }); }
  function allActs(data) {
    var seen = {}, out = [];
    list(data).forEach(function (it) { if (!seen[it.act]) { seen[it.act] = true; out.push(it.act); } });
    return out.sort(function (a, b) { return a - b; });
  }
  /** Series ids that have proverbs, in the data's series order. */
  function allSeries(data) { return index(data).series.slice(); }
  /** Flashcard items for the proverbs of the given acts (all acts when acts is null) and series (all series when
      seriesIds is null or absent), for one deck. */
  function flashItems(data, acts, deck, seriesIds) {
    if (MODE_OF[deck] == null) return [];
    return list(data).filter(function (it) {
      return (acts == null || acts.indexOf(it.act) !== -1) && (seriesIds == null || seriesIds.indexOf(it.series) !== -1);
    }).map(function (it) {
      return { key: keyFor(it.id, deck), kind: "flash", deck: deck, prov: it };
    });
  }
  function answerText(it, side) { return side === "fr" ? it.proverb.fr : it.proverb.meaning; }
  /** A Review my mistakes multiple-choice item for a proverb key, or null for an unknown id. Distractors are
      the other proverbs' meaning (French → meaning) or French (meaning → French), deterministic for a seeded rng. */
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
    var pv = it.proverb, d = it.dialogue;
    var legend = side === "en"
      ? { before: "What does the proverb ", strong: "« " + pv.fr + " »", strongLang: "fr", after: " mean?" }
      : { before: "Which proverb means: ", strong: pv.meaning, strongLang: null, after: "" };
    return {
      kind: "choice",
      prov: it,
      family: "prov",
      side: side,
      mode: p.mode,
      correct: correct,
      options: L.buildChoices(correct, pool, 4, rng),
      isFrench: side === "fr",
      legend: legend,
      listen: { text: pv.fr, key: null },
      reveal: { french: pv.fr, pronunciation: pv.respelling, english: pv.meaning },
      source: { dialogueId: d.id, episode: d.episode, title: d.title },
      key: key
    };
  }
  function emptyStat() { return { answered: 0, correct: 0, mastered: 0, total: 0 }; }
  /** Answers, correct answers and mastered cards (box >= MASTERED_BOX) over both decks, overall and per act. */
  function stats(state, data) {
    var st = (state && state.stats) || {};
    var out = emptyStat();
    out.byAct = {};
    allActs(data).forEach(function (a) { out.byAct[a] = emptyStat(); });
    list(data).forEach(function (it) {
      var b = out.byAct[it.act];
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
    keyFor: keyFor,
    isKey: isKey,
    parseKey: parseKey,
    itemKeys: itemKeys,
    knownIds: knownIds,
    allActs: allActs,
    allSeries: allSeries,
    flashItems: flashItems,
    choiceItem: choiceItem,
    stats: stats
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_PROV = api;
})(typeof window !== "undefined" ? window : null);
