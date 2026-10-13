/* Verb trainer: practice-session model and lifecycle (design §12.1). DOM-free: views pass callbacks.
   Sessions live in memory only (not persisted); each answer is saved by app.js as it happens. */
(function (root) {
  "use strict";

  var LEARN = (typeof window !== "undefined" && window.VT_LEARN) || require("./learn.js");

  var sessions = {};       // session key -> session
  var lastMissed = [];     // keys missed (or hinted) in the last finished session, de-duplicated
  var lastMissedGen = 0;   // incremented every time lastMissed is replaced

  /** §12.1.1 rule 4 defaults for the per-question UI state. */
  function freshUi() {
    return { answered: false, hintLevel: 0, input: "", selected: -1, flipped: false, result: null };
  }

  function newSession(k, init) {
    var i = init || {};
    return {
      key: k,
      index: 0,
      length: Math.max(0, Number(i.length) || 0),
      correct: 0,
      missed: [],
      done: false,
      items: i.items ? i.items.slice() : null,
      typeOrder: i.typeOrder ? i.typeOrder.slice() : null,
      typeIndex: 0,
      lastKey: null,
      current: null,
      ui: freshUi(),
      resumed: false
    };
  }

  /** Resume an unfinished session under k, or start a new one from init() → { length, items?, typeOrder? }. */
  function getOrStart(k, init) {
    var s = sessions[k];
    if (s && !s.done) {
      s.resumed = true;
      return s;
    }
    if (s) delete sessions[k];
    s = newSession(k, init ? init() : null);
    sessions[k] = s;
    return s;
  }

  /** Count one graded answer. Wrong or hinted answers go to the "To review" list. Never moves index. */
  function recordResult(s, item, correct, hinted) {
    if (correct) s.correct += 1;
    if (!correct || hinted) s.missed.push({ key: item.key, hinted: !!hinted, display: LEARN.displayFor(item) });
  }

  /** Move to the next question; on the last one mark the session done and publish lastMissed. */
  function advance(s, cbs) {
    var c = cbs || {};
    s.index += 1;
    if (s.index >= s.length) {
      s.done = true;
      var seen = {};
      lastMissed = [];
      s.missed.forEach(function (m) {
        if (seen[m.key]) return;
        seen[m.key] = true;
        lastMissed.push(m.key);
      });
      lastMissedGen += 1;
      if (c.onDone) c.onDone(s);
    } else if (c.onNext) {
      c.onNext(s);
    }
  }

  function restart(k, init) {
    delete sessions[k];
    return getOrStart(k, init);
  }

  function drop(k) { delete sessions[k]; }

  function clearAll() {
    sessions = {};
    lastMissed = [];
  }

  /** Reset the per-question UI state (used by a view's next()). */
  function resetUi(s) { s.ui = freshUi(); }

  function barText(s) {
    return "Question " + Math.min(s.index + 1, s.length) + " of " + s.length;
  }

  var api = {
    getOrStart: getOrStart,
    recordResult: recordResult,
    advance: advance,
    restart: restart,
    drop: drop,
    clearAll: clearAll,
    resetUi: resetUi,
    barText: barText
  };
  /* Read-only properties: VT_SESSION.lastMissed (a copy of the array) and VT_SESSION.lastMissedGen (a number). */
  Object.defineProperty(api, "lastMissed", { enumerable: true, get: function () { return lastMissed.slice(); } });
  Object.defineProperty(api, "lastMissedGen", { enumerable: true, get: function () { return lastMissedGen; } });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_SESSION = api;
})(typeof window !== "undefined" ? window : null);
