/* Topic lessons (TOPICS_DATA, schema v2): pure grading and progress helpers, no DOM.
   Grading contract (content-expansion integration-notes): an item has either answer + accepted
   (one input) or parts (one labelled input per part, each graded on its own; the item is correct
   only when every part is). Used by views-topics.js in the browser and by the Node tests. */
(function (root) {
  "use strict";

  var L = (root && root.VT_LOGIC) || require("./logic.js");

  var PASS_PCT = 80;  // an exercise counts as done once its best score reaches this
  var MAX_COUNT = 1e7;

  /** Extra clean-up for whole-sentence answers: commas and « » don't count, spaces before ? ! : are optional. */
  function prep(s) {
    return String(s == null ? "" : s)
      .replace(/[«»"]/g, " ")
      .replace(/,/g, " ")
      .replace(/\s+([?!:;])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** [answer, ...accepted] for an item or a part. */
  function acceptedFor(x) {
    var list = [];
    if (x && x.answer != null && x.answer !== "") list.push(x.answer);
    ((x && x.accepted) || []).forEach(function (a) { if (a != null && a !== "") list.push(a); });
    return list;
  }

  /**
   * One answer against an item or part. Returns { correct, exact, expected, note }.
   * note: "accents" when only the accents differ (and tolerance is off or it matched loosely),
   *       "hyphens" when only hyphens differ ("est ce que" for "est-ce que"), else null.
   */
  function checkOne(input, x, opts) {
    var tolerant = !!(opts && opts.accentTolerant);
    var list = acceptedFor(x);
    var prepped = list.map(prep);
    var r = L.checkAnswer(prep(input), prepped, { accentTolerant: tolerant });
    var expected = r.correct ? list[prepped.indexOf(r.expected)] : list[0] || "";
    var note = null;
    if (r.correct && !r.exact) note = "accents";
    if (!r.correct && L.normalize(input)) {
      if (L.checkAnswer(prep(input), prepped, { accentTolerant: true }).correct) note = "accents";
      else {
        var dehyph = function (s) { return L.stripAccents(L.normalize(prep(s)).replace(/-/g, " ").replace(/\s+/g, " ")); };
        var want = dehyph(input);
        if (prepped.some(function (p) { return dehyph(p) === want; })) note = "hyphens";
      }
    }
    return { correct: r.correct, exact: r.exact, expected: expected, note: note };
  }

  /** Is this a parts item (multi-register drill)? */
  function hasParts(item) { return !!(item && item.parts && item.parts.length); }

  /**
   * Grade a whole item. inputs: a string (single answer or the chosen choice) or an array (one per part).
   * Returns { correct, parts: [checkOne results] } (parts has one entry for single-answer items).
   */
  function gradeItem(item, inputs, opts) {
    var arr = Array.isArray(inputs) ? inputs : [inputs];
    var results;
    if (hasParts(item)) {
      results = item.parts.map(function (p, i) { return checkOne(arr[i], p, opts); });
    } else if (item && item.choices) {
      // A chosen option is exact text: compare normalised, never accent-loosened.
      var picked = arr[0];
      var ok = picked != null && acceptedFor(item).some(function (a) { return L.normalize(a) === L.normalize(picked); });
      results = [{ correct: ok, exact: ok, expected: item.answer, note: null }];
    } else {
      results = [checkOne(arr[0], item, opts)];
    }
    return { correct: results.every(function (r) { return r.correct; }), parts: results };
  }

  /** The full model answer as one line ("A · B · C" for parts). */
  function answerText(item) {
    if (hasParts(item)) return item.parts.map(function (p) { return p.answer; }).join(" · ");
    return item.answer;
  }

  /** What a topic item's Listen button says: the completed gap sentence, the choice prompt, or the answer. */
  function speakText(item) {
    var p = String(item.prompt || "");
    if (p.indexOf("___") !== -1) {
      var full = p.replace("___", item.answer);
      if (full.indexOf("→") !== -1) full = full.split("→").pop();
      return full.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    }
    if (item.choices) return p;
    return item.answer;
  }

  /* ---------- lookup ---------- */
  function topics(data) { return (data && data.topics) || []; }

  function topicById(data, id) {
    var list = topics(data);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function exerciseById(topic, id) {
    var list = (topic && topic.exercises) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function lessonExercises(topic, lessonId) {
    return ((topic && topic.exercises) || []).filter(function (e) { return e.lesson === lessonId; });
  }

  /** Every exercise id in the data (used by storage to keep only known records). */
  function exerciseIds(data) {
    var out = [];
    topics(data).forEach(function (t) { (t.exercises || []).forEach(function (e) { out.push(e.id); }); });
    return out;
  }

  /** The exercise after this one in the topic, or null. */
  function nextExercise(topic, exId) {
    var list = (topic && topic.exercises) || [];
    for (var i = 0; i < list.length - 1; i++) if (list[i].id === exId) return list[i + 1];
    return null;
  }

  /* ---------- progress (state.topics: { "<exerciseId>": { best: 0..100, attempts: n } }) ---------- */
  function record(state, exId) {
    var t = state && state.topics;
    return t && Object.prototype.hasOwnProperty.call(t, exId) ? t[exId] : null;
  }

  function isDone(state, exId) {
    var r = record(state, exId);
    return !!r && r.best >= PASS_PCT;
  }

  /** Save one finished run: keeps the best percentage and counts attempts. Returns the record. */
  function recordRun(state, exId, correct, total) {
    if (!state.topics) state.topics = {};
    var pct = total ? Math.round((100 * correct) / total) : 0;
    var r = record(state, exId) || { best: 0, attempts: 0 };
    r = { best: Math.max(r.best || 0, pct), attempts: Math.min(MAX_COUNT, (r.attempts || 0) + 1) };
    state.topics[exId] = r;
    return r;
  }

  /** { done, total, pct } for a set of exercises. */
  function progressOf(state, exercises) {
    var total = exercises.length;
    var done = exercises.filter(function (e) { return isDone(state, e.id); }).length;
    return { done: done, total: total, pct: total ? Math.round((100 * done) / total) : 0 };
  }

  function lessonProgress(state, topic, lessonId) { return progressOf(state, lessonExercises(topic, lessonId)); }
  function topicProgress(state, topic) { return progressOf(state, (topic && topic.exercises) || []); }

  /** The first exercise of the topic that is not done yet (or the first one). */
  function suggestExercise(state, topic) {
    var list = (topic && topic.exercises) || [];
    for (var i = 0; i < list.length; i++) if (!isDone(state, list[i].id)) return list[i];
    return list[0] || null;
  }

  var api = {
    PASS_PCT: PASS_PCT,
    prep: prep,
    acceptedFor: acceptedFor,
    checkOne: checkOne,
    hasParts: hasParts,
    gradeItem: gradeItem,
    answerText: answerText,
    speakText: speakText,
    topicById: topicById,
    exerciseById: exerciseById,
    lessonExercises: lessonExercises,
    exerciseIds: exerciseIds,
    nextExercise: nextExercise,
    isDone: isDone,
    recordRun: recordRun,
    lessonProgress: lessonProgress,
    topicProgress: topicProgress,
    suggestExercise: suggestExercise
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_TOPICS = api;
})(typeof window !== "undefined" ? window : null);
