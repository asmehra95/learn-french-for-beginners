/* Verb trainer: pure logic (no DOM). Used by app.js in the browser and by the Node unit tests. */
(function (root) {
  "use strict";

  /** Lowercase, trim, unify apostrophes, collapse spaces, drop trailing . ! ?, œ -> oe. */
  function normalize(s) {
    return String(s == null ? "" : s)
      .normalize("NFC")
      .toLowerCase()
      .replace(/[’ʼ‘]/g, "'")
      .replace(/œ/g, "oe")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s*[.!?]+$/, "")
      .trim();
  }

  /** Remove diacritics: é -> e, ç -> c, î -> i. */
  function stripAccents(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /**
   * Compare an answer to the accepted spellings.
   * exact: normalized input equals a normalized accepted value.
   * correct: exact, or (accentTolerant) equal once accents are removed.
   * expected: the accepted spelling to show (the matched one when correct).
   */
  function checkAnswer(input, accepted, options) {
    var tolerant = !!(options && options.accentTolerant);
    var list = (accepted || []).filter(function (a) { return a != null && a !== ""; });
    var n = normalize(input);
    var result = { correct: false, exact: false, expected: list[0] || "" };
    if (!n) return result;
    var i;
    for (i = 0; i < list.length; i++) {
      if (normalize(list[i]) === n) return { correct: true, exact: true, expected: list[i] };
    }
    if (tolerant) {
      var bare = stripAccents(n);
      for (i = 0; i < list.length; i++) {
        if (stripAccents(normalize(list[i])) === bare) return { correct: true, exact: false, expected: list[i] };
      }
    }
    return result;
  }

  function presentRow(verb, person) {
    for (var i = 0; i < verb.present.length; i++) if (verb.present[i].person === person) return verb.present[i];
    throw new Error("No present form " + person + " for " + verb.id);
  }

  var PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p"];

  /** The pronoun shown in prompts: the elided "j'" as is, otherwise the row's pronoun. */
  function promptPronoun(r) {
    return r.pronoun === "j'" ? "j'" : r.pronoun;
  }

  /* Subject part ("je", "j'", "il/elle"…) optionally followed by a reflexive part ("me", "s'"…). */
  var PRONOUN_RE = /^(\S+?)(?:\s+(me|te|se|nous|vous|m'|t'|s'))?$/;

  /**
   * The bare form first, then the form with each subject variant (plus "on" for 3s),
   * keeping any reflexive pronoun: "je me lève", "il se lève", "je m'appelle".
   */
  function acceptedForms(verb, person) {
    var row = presentRow(verb, person);
    var m = PRONOUN_RE.exec(String(row.pronoun).trim());
    var subjects = (m ? m[1] : String(row.pronoun)).split("/").map(function (s) { return s.trim(); });
    var refl = m && m[2] ? m[2] : "";
    // A reflexive answer must include the reflexive pronoun: "me lève" or "je me lève", never bare "lève".
    var out = [refl ? (refl.charAt(refl.length - 1) === "'" ? refl + row.form : refl + " " + row.form) : row.form];
    if (person === "3s") subjects.push("on");
    subjects.forEach(function (s) {
      var prefix = s + (refl ? " " + refl : "");
      out.push(prefix.charAt(prefix.length - 1) === "'" ? prefix + row.form : prefix + " " + row.form);
    });
    return out;
  }

  /** Text for speech synthesis: one pronoun per slash pair, no "(e)". */
  function speakableText(s) {
    return String(s == null ? "" : s)
      .replace(/\bils\/elles\b/g, "ils")
      .replace(/\bil\/elle\b/g, "il")
      .replace(/\(e\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Text sent to the recorded-voice generator: speakableText, then liaison ties become spaces,
   * " · " joins become sentence breaks, [brackets] are dropped (words kept), other (notes) removed.
   */
  function ttsSpeak(s) {
    return speakableText(s)
      .replace(/\u203F/g, " ")
      .replace(/\s*·\s*/g, ". ")
      .replace(/[\[\]]/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Lookup key for a recorded clip (normalization "v1"): ttsSpeak, NFC, curly apostrophes -> ',
   * no-break spaces -> space, spaces collapsed. Case and punctuation are kept (they change intonation).
   */
  function ttsKey(s) {
    return ttsSpeak(s)
      .normalize("NFC")
      .replace(/[\u2019\u02BC\u2018]/g, "'")
      .replace(/[\u00A0\u202F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** Same whole-word boundary rule as the build parser. */
  function formRegex(form) {
    return new RegExp("(^|[\\s'’(])" + escapeRegex(form) + "(?=[\\s.,!?;:)]|$)", "iu");
  }

  var BLANK = "_____";

  /** Replace the first whole-word occurrence of sentence.verbForm with a blank. */
  function blankSentence(sentence) {
    var re = formRegex(sentence.verbForm);
    if (!re.test(sentence.french)) throw new Error("verbForm not found in: " + sentence.french);
    return sentence.french.replace(re, function (_m, lead) { return lead + BLANK; });
  }

  /* ---- SRS-lite (Leitner boxes 0..4) ---- */
  var BOX_WEIGHTS = [8, 4, 2, 1, 0.5];
  var UNSEEN_WEIGHT = 6;
  var MAX_BOX = 4;
  var MASTERED_BOX = 3;

  function itemKey(verbId, mode, person) {
    return verbId + "|" + mode + "|" + (person || "-");
  }

  /**
   * Returns a new stat object after one answer. Correct: box + 1 (max 4). Wrong: box 0.
   * opts.hinted with a correct answer counts it as seen and correct but keeps the box (no promotion).
   */
  function updateStat(stat, correct, now, opts) {
    var s = stat || { box: 0, seen: 0, correct: 0, wrong: 0, last: 0 };
    var hinted = !!(opts && opts.hinted);
    return {
      box: correct ? (hinted ? (s.box || 0) : Math.min(MAX_BOX, (s.box || 0) + 1)) : 0,
      seen: (s.seen || 0) + 1,
      correct: (s.correct || 0) + (correct ? 1 : 0),
      wrong: (s.wrong || 0) + (correct ? 0 : 1),
      last: now == null ? Date.now() : now
    };
  }

  function weightFor(stat) {
    if (!stat || !stat.seen) return UNSEEN_WEIGHT;
    var box = Math.max(0, Math.min(MAX_BOX, stat.box || 0));
    return BOX_WEIGHTS[box];
  }

  /** Weighted random pick by SRS box. Never returns lastKey when there are >= 2 items. */
  function pickWeighted(items, stats, rng, lastKey) {
    if (!items || !items.length) return null;
    var random = rng || Math.random;
    var pool = items.length >= 2 ? items.filter(function (it) { return it.key !== lastKey; }) : items.slice();
    if (!pool.length) pool = items.slice();
    var weights = pool.map(function (it) { return weightFor(stats && stats[it.key]); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = random() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r < 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /** Fisher-Yates on a copy; rng is injectable for deterministic tests. */
  function shuffle(arr, rng) {
    var random = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** Up to n unique options including the correct one, shuffled. */
  function buildChoices(correct, pool, n, rng) {
    var size = n || 4;
    var seen = {};
    seen[normalize(correct)] = true;
    var distractors = [];
    shuffle(pool || [], rng).forEach(function (p) {
      var k = normalize(p);
      if (!k || seen[k]) return;
      seen[k] = true;
      distractors.push(p);
    });
    return shuffle([correct].concat(distractors.slice(0, size - 1)), rng);
  }

  var api = {
    PERSONS: PERSONS,
    promptPronoun: promptPronoun,
    normalize: normalize,
    stripAccents: stripAccents,
    checkAnswer: checkAnswer,
    acceptedForms: acceptedForms,
    presentRow: presentRow,
    speakableText: speakableText,
    ttsSpeak: ttsSpeak,
    ttsKey: ttsKey,
    formRegex: formRegex,
    blankSentence: blankSentence,
    BLANK: BLANK,
    BOX_WEIGHTS: BOX_WEIGHTS,
    UNSEEN_WEIGHT: UNSEEN_WEIGHT,
    MASTERED_BOX: MASTERED_BOX,
    itemKey: itemKey,
    updateStat: updateStat,
    weightFor: weightFor,
    pickWeighted: pickWeighted,
    shuffle: shuffle,
    buildChoices: buildChoices
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_LOGIC = api;
})(typeof window !== "undefined" ? window : null);
