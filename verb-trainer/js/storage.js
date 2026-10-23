/* Verb trainer: practice stats and settings in localStorage (key verbTrainer.v1, schema version 2).
   Version-1 data is migrated in place on load, with a one-time raw backup in verbTrainer.v1.backup.
   Falls back to memory when storage is blocked (some browsers block it for file:// pages). */
(function (root) {
  "use strict";

  var KEY = "verbTrainer.v1";
  var BACKUP_KEY = "verbTrainer.v1.backup";
  var VERSION = 2;
  var memory = null;      // in-memory copy used when localStorage is unavailable
  var persistent = true;  // false once localStorage has thrown
  var migrated = false;   // true when the last load() upgraded version-1 data

  var THEMES = ["system", "light", "dark"];
  var DAILY_GOALS = [10, 20, 30, 50];
  var SESSION_LENGTHS = [5, 10, 15, 20];
  var VOICE_SOURCES = ["recorded", "device"];
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var MAX_COUNT = 1e7;
  var HISTORY_MAX = 60;
  var STAT_KEY_MAX = 120;
  var UNSAFE_KEYS = { "__proto__": true, "constructor": true, "prototype": true };

  function allVerbIds() {
    var d = root.VERB_DATA;
    return d && d.verbs ? d.verbs.map(function (v) { return v.id; }) : [];
  }

  function allLessonIds() {
    var d = root.VERB_DATA;
    return d && d.lessons ? d.lessons.map(function (l) { return String(l.id); }) : [];
  }

  /* Exercise ids of the topic lessons (topics-data.js); records for unknown ids are dropped. */
  function allTopicExerciseIds() {
    var d = root.TOPICS_DATA, out = [];
    ((d && d.topics) || []).forEach(function (t) { (t.exercises || []).forEach(function (e) { out.push(e.id); }); });
    return out;
  }

  /* Everyday expressions (expressions-data.js): ids and theme ids, [] when the file isn't loaded. */
  function allExpressionIds() {
    var d = root.VT_EXPRESSIONS;
    return d && d.expressions ? d.expressions.map(function (e) { return e.id; }) : [];
  }
  function allExpressionThemeIds() {
    var d = root.VT_EXPRESSIONS;
    return d && d.themes ? d.themes.map(function (t) { return t.id; }) : [];
  }
  var EXPR_ID_RE = /^[a-z0-9-]{1,60}$/;
  var EXPR_THEME_RE = /^[a-z0-9-]{1,40}$/;
  var EXPR_THEMES_MAX = 20;

  /* Dialogues (dialogues-data.js): ids and speaker ids, [] when the file isn't loaded. storage.js must not
     depend on dialogues.js, so the known quiz heads are built inline here. */
  function allDialogueIds() {
    var d = root.VT_DIALOGUES;
    return d && d.dialogues ? d.dialogues.map(function (x) { return x.id; }) : [];
  }
  function dialogueSpeakers(id) {
    var d = root.VT_DIALOGUES;
    var x = d && d.dialogues ? d.dialogues.filter(function (y) { return y.id === id; })[0] : null;
    return x && x.speakers ? x.speakers.map(function (sp) { return sp.id; }) : [];
  }
  function dialogueHeads() {
    var d = root.VT_DIALOGUES, out = {};
    ((d && d.dialogues) || []).forEach(function (x) {
      (x.questions || []).forEach(function (q) { out["dlg:" + x.id + "." + q.id] = true; });
    });
    return out;
  }
  var DLG_ID_RE = /^[a-z0-9-]{1,40}$/;
  var DLG_SPEAKER_RE = /^[a-z0-9-]{1,20}$/;
  var DLG_STAT_RE = /^dlg:([a-z0-9-]{1,40})\.(q\d)$/;
  var DIALOGUES_MAX = 200;   // 60 dialogues ship now; room for more series without dropping progress
  /* Proverb flashcards (Le Café des Questions): "prov:<dialogueId>|flash-fr-en|-" / "|flash-en-fr|-". With
     dialogues-data.js loaded the id must be a dialogue that has a proverb (built inline, like dialogueHeads). */
  var PROV_ID_RE = /^prov:([a-z0-9-]{1,40})$/;
  var PROV_MODES = { "flash-fr-en": true, "flash-en-fr": true };
  function proverbIds() {
    var d = root.VT_DIALOGUES, out = {};
    ((d && d.dialogues) || []).forEach(function (x) { if (x.proverb) out[x.id] = true; });
    return out;
  }
  function proverbActs() {
    var d = root.VT_DIALOGUES, out = {};
    ((d && d.dialogues) || []).forEach(function (x) { if (x.proverb && Number.isInteger(x.act)) out[x.act] = true; });
    return out;
  }
  var PROV_ACTS_MAX = 4;
  /* Story-expression flashcards: "sexpr:<dialogueId>|flash-fr-en|-" / "|flash-en-fr|-"; with dialogues-data.js
     loaded the id must be a dialogue that has an expression. */
  var SEXPR_ID_RE = /^sexpr:([a-z0-9-]{1,40})$/;
  function storyExpressionIds() {
    var d = root.VT_DIALOGUES, out = {};
    ((d && d.dialogues) || []).forEach(function (x) { if (x.expression) out[x.id] = true; });
    return out;
  }
  var ROLES_MAX = 4;

  function defaults() {
    return {
      version: VERSION,
      stats: {},
      totals: { answered: 0, correct: 0, bestStreak: 0, streak: 0 },
      settings: {
        accentTolerant: true,
        selectedVerbIds: allVerbIds(),
        selectedExpressionThemes: allExpressionThemeIds(), // additive v2 field: expression flashcard themes
        flashDeck: "inf-meaning",
        voiceNoticeDismissed: false,
        voiceURI: "",       // chosen computer voice; "" = automatic
        voiceName: "",
        speechRate: 0.85,
        preferNative: true, // play bundled recordings when available
        voiceSource: "recorded", // Listen: "recorded" (pre-recorded clips, device voice when missing) or "device"
        theme: "system",
        dailyGoal: 20,
        sessionLength: 10,
        autoPlayWrong: false,
        singleKeyShortcuts: true,
        dialogueShowEnglish: true // additive v2 field: Dialogues "Show English"
      },
      daily: { date: "", answered: 0, correct: 0, goalMet: false },
      streak: { current: 0, best: 0, lastDate: "" },
      history: {},
      lessons: {},          // "<lessonId>": lesson record, created lazily
      topics: {},           // "<exerciseId>": { best: 0..100, attempts }, topic-lesson exercises (views-topics.js)
      dialogues: {},        // additive v2 field: "<dialogueId>": { listened, quizBest, quizAttempts, roles, lastDate }
      onboarding: { welcomeDismissed: false, typingTipSeen: false, importHintDismissed: false }
    };
  }

  function lessonDefaults() {
    return { learned: false, practiced: false, quizBest: -1, quizPassed: false };
  }

  function isObject(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }

  /** A finite integer >= 0, clamped to MAX_COUNT; anything else gives fallback. */
  function count(x, fallback) {
    if (typeof x !== "number" || !isFinite(x) || x < 0 || Math.floor(x) !== x) return fallback;
    return Math.min(MAX_COUNT, x);
  }

  function dateOr(x, fallback) {
    return typeof x === "string" && (x === "" || DATE_RE.test(x)) ? x : fallback;
  }

  function bool(target, src, k) {
    if (typeof src[k] === "boolean") target[k] = src[k];
  }

  /** Merge a parsed value onto defaults; anything malformed falls back to the default for that field. */
  function sanitize(raw) {
    var d = defaults();
    if (!isObject(raw) || (raw.version !== 1 && raw.version !== 2)) return d;
    if (isObject(raw.stats)) {
      // Keys are "<verbId>|<mode>|<person>". Prototype names, over-long keys and (when the verb list is
      // loaded) unknown verb ids are dropped; counts are clamped (stored data and imported files alike).
      var knownVerbs = {};
      allVerbIds().forEach(function (id) { knownVerbs[id] = true; });
      var checkVerbs = Object.keys(knownVerbs).length > 0;
      // Expression keys are "expr:<id>|<mode>|-": a known id when expressions-data.js is loaded, else any safe id.
      var knownExpr = {};
      allExpressionIds().forEach(function (id) { knownExpr[id] = true; });
      var checkExpr = Object.keys(knownExpr).length > 0;
      // Dialogue quiz keys are "dlg:<dialogue>.<question>|dlg-quiz|-": a known head when dialogues-data.js is loaded.
      var knownDlg = dialogueHeads();
      var checkDlg = Object.keys(knownDlg).length > 0;
      var knownProv = proverbIds();
      var checkProv = !!(root.VT_DIALOGUES && root.VT_DIALOGUES.dialogues);
      var knownSexpr = storyExpressionIds();
      Object.keys(raw.stats).forEach(function (k) {
        var s = raw.stats[k];
        if (!isObject(s) || UNSAFE_KEYS[k] || k.length > STAT_KEY_MAX) return;
        var head = k.split("|")[0];
        if (head.indexOf("sexpr:") === 0) {
          var xm = SEXPR_ID_RE.exec(head), xparts = k.split("|");
          if (!xm || UNSAFE_KEYS[xm[1]] || xparts.length !== 3 || !PROV_MODES[xparts[1]] || xparts[2] !== "-") return;
          if (checkProv && !Object.prototype.hasOwnProperty.call(knownSexpr, xm[1])) return;
        } else if (head.indexOf("prov:") === 0) {
          var pm = PROV_ID_RE.exec(head), parts = k.split("|");
          if (!pm || UNSAFE_KEYS[pm[1]] || parts.length !== 3 || !PROV_MODES[parts[1]] || parts[2] !== "-") return;
          if (checkProv && !Object.prototype.hasOwnProperty.call(knownProv, pm[1])) return;
        } else if (head.indexOf("dlg:") === 0) {
          if (!DLG_STAT_RE.test(head) || UNSAFE_KEYS[head.slice(4).split(".")[0]]) return;
          if (checkDlg && !Object.prototype.hasOwnProperty.call(knownDlg, head)) return;
        } else if (head.indexOf("expr:") === 0) {
          var xid = head.slice(5);
          if (UNSAFE_KEYS[xid] || !EXPR_ID_RE.test(xid)) return;
          if (checkExpr && !Object.prototype.hasOwnProperty.call(knownExpr, xid)) return;
        } else if (checkVerbs && !Object.prototype.hasOwnProperty.call(knownVerbs, head)) return;
        var last = Number(s.last);
        d.stats[k] = {
          box: Math.max(0, Math.min(4, Math.floor(Number(s.box)) || 0)),
          seen: Math.min(MAX_COUNT, Math.max(0, Number(s.seen) || 0)),
          correct: Math.min(MAX_COUNT, Math.max(0, Number(s.correct) || 0)),
          wrong: Math.min(MAX_COUNT, Math.max(0, Number(s.wrong) || 0)),
          last: isFinite(last) && last > 0 ? Math.min(last, 8.64e15) : 0
        };
      });
    }
    if (isObject(raw.totals)) {
      Object.keys(d.totals).forEach(function (k) {
        if (typeof raw.totals[k] === "number" && isFinite(raw.totals[k])) d.totals[k] = Math.min(MAX_COUNT, Math.max(0, raw.totals[k]));
      });
    }
    if (isObject(raw.settings)) {
      var s = raw.settings;
      var ds = d.settings;
      bool(ds, s, "accentTolerant");
      if (typeof s.flashDeck === "string") ds.flashDeck = s.flashDeck;
      bool(ds, s, "voiceNoticeDismissed");
      if (typeof s.voiceURI === "string" && s.voiceURI.length <= 300) ds.voiceURI = s.voiceURI;
      if (typeof s.voiceName === "string" && s.voiceName.length <= 300) ds.voiceName = s.voiceName;
      if (typeof s.speechRate === "number" && isFinite(s.speechRate)) ds.speechRate = Math.min(1.2, Math.max(0.6, s.speechRate));
      bool(ds, s, "preferNative");
      if (Array.isArray(s.selectedVerbIds)) {
        var known = allVerbIds();
        ds.selectedVerbIds = s.selectedVerbIds.filter(function (id) { return known.indexOf(id) !== -1; });
      }
      // additive v2 field (expressions): absent in older saves/exports -> all themes (the default)
      if (Array.isArray(s.selectedExpressionThemes)) {
        var knownThemes = allExpressionThemeIds();
        var picked = {};
        s.selectedExpressionThemes.forEach(function (id) { if (typeof id === "string") picked[id] = true; });
        if (knownThemes.length) {
          ds.selectedExpressionThemes = knownThemes.filter(function (id) { return Object.prototype.hasOwnProperty.call(picked, id); });
        } else {
          var seenTheme = {};
          ds.selectedExpressionThemes = s.selectedExpressionThemes.filter(function (id) {
            if (typeof id !== "string" || !EXPR_THEME_RE.test(id) || UNSAFE_KEYS[id] || seenTheme[id]) return false;
            seenTheme[id] = true;
            return true;
          }).slice(0, EXPR_THEMES_MAX);
        }
      }
      // version 2 settings
      if (THEMES.indexOf(s.theme) !== -1) ds.theme = s.theme;
      if (DAILY_GOALS.indexOf(s.dailyGoal) !== -1) ds.dailyGoal = s.dailyGoal;
      if (SESSION_LENGTHS.indexOf(s.sessionLength) !== -1) ds.sessionLength = s.sessionLength;
      bool(ds, s, "autoPlayWrong");
      bool(ds, s, "singleKeyShortcuts");
      // additive v2 field (recorded voice): absent in v1 data and older v2 saves/exports -> default "recorded"
      if (VOICE_SOURCES.indexOf(s.voiceSource) !== -1) ds.voiceSource = s.voiceSource;
      bool(ds, s, "dialogueShowEnglish");
      // optional field (Proverbs deck act filter): absent -> every act; integers 1-4, deduped, sorted
      if (Array.isArray(s.selectedProverbActs)) {
        var kActs = proverbActs(), haveActs = Object.keys(kActs).length > 0, seenAct = {};
        ds.selectedProverbActs = s.selectedProverbActs.filter(function (n) {
          if (!Number.isInteger(n) || n < 1 || n > PROV_ACTS_MAX || seenAct[n]) return false;
          if (haveActs && !kActs[n]) return false;
          seenAct[n] = true;
          return true;
        }).sort(function (a, b) { return a - b; });
      }
    }
    if (isObject(raw.daily)) {
      var dl = raw.daily;
      d.daily.date = dateOr(dl.date, d.daily.date);
      d.daily.answered = count(dl.answered, d.daily.answered);
      d.daily.correct = count(dl.correct, d.daily.correct);
      bool(d.daily, dl, "goalMet");
    }
    if (isObject(raw.streak)) {
      var st = raw.streak;
      d.streak.current = count(st.current, d.streak.current);
      d.streak.best = count(st.best, d.streak.best);
      d.streak.lastDate = dateOr(st.lastDate, d.streak.lastDate);
    }
    if (isObject(raw.history)) {
      Object.keys(raw.history).filter(function (k) { return DATE_RE.test(k); }).sort().slice(-HISTORY_MAX).forEach(function (k) {
        var n = count(raw.history[k], null);
        if (n !== null) d.history[k] = n;
      });
    }
    if (isObject(raw.lessons)) {
      var lessonIds = allLessonIds();
      Object.keys(raw.lessons).forEach(function (k) {
        var r = raw.lessons[k];
        if (lessonIds.indexOf(k) === -1 || !isObject(r)) return;
        var out = lessonDefaults();
        bool(out, r, "learned");
        bool(out, r, "practiced");
        bool(out, r, "quizPassed");
        if (typeof r.quizBest === "number" && Math.floor(r.quizBest) === r.quizBest && r.quizBest >= -1 && r.quizBest <= 100) out.quizBest = r.quizBest;
        d.lessons[k] = out;
      });
    }
    if (isObject(raw.topics)) {
      var exIds = allTopicExerciseIds();
      Object.keys(raw.topics).forEach(function (k) {
        var r = raw.topics[k];
        if (exIds.indexOf(k) === -1 || !isObject(r)) return;
        var best = r.best;
        if (typeof best !== "number" || Math.floor(best) !== best || best < 0 || best > 100) return;
        d.topics[k] = { best: best, attempts: count(r.attempts, 0) };
      });
    }
    if (isObject(raw.dialogues)) {
      var dlgIds = allDialogueIds();
      var nDlg = 0;
      Object.keys(raw.dialogues).forEach(function (k) {
        var r = raw.dialogues[k];
        if (nDlg >= DIALOGUES_MAX || UNSAFE_KEYS[k] || !DLG_ID_RE.test(k) || !isObject(r)) return;
        if (dlgIds.length && dlgIds.indexOf(k) === -1) return;
        var out = { listened: false, quizBest: -1, quizAttempts: 0, roles: {}, lastDate: "" };
        bool(out, r, "listened");
        if (typeof r.quizBest === "number" && Math.floor(r.quizBest) === r.quizBest && r.quizBest >= -1 && r.quizBest <= 100) out.quizBest = r.quizBest;
        out.quizAttempts = count(r.quizAttempts, 0);
        out.lastDate = dateOr(r.lastDate, "");
        // optional: ms timestamp of the last activity (Home "Continue" picks the most recently used story)
        if (typeof r.lastAt === "number" && Number.isInteger(r.lastAt) && r.lastAt > 0 && r.lastAt <= 8.64e15) out.lastAt = r.lastAt;
        if (isObject(r.roles)) {
          var speakers = dlgIds.length ? dialogueSpeakers(k) : null;
          var nRoles = 0;
          Object.keys(r.roles).forEach(function (sid) {
            var role = r.roles[sid];
            if (nRoles >= ROLES_MAX || UNSAFE_KEYS[sid] || !DLG_SPEAKER_RE.test(sid) || !isObject(role)) return;
            if (speakers && speakers.indexOf(sid) === -1) return;
            var best = role.best;
            if (typeof best !== "number" || Math.floor(best) !== best || best < 0 || best > 100) return;
            out.roles[sid] = { best: best, attempts: count(role.attempts, 0) };
            nRoles++;
          });
        }
        d.dialogues[k] = out;
        nDlg++;
      });
    }
    if (isObject(raw.onboarding)) {
      bool(d.onboarding, raw.onboarding, "welcomeDismissed");
      bool(d.onboarding, raw.onboarding, "typingTipSeen");
      bool(d.onboarding, raw.onboarding, "importHintDismissed");
    }
    return d;
  }

  function unreadable() {
    if (typeof console !== "undefined") console.warn("verbTrainer: stored data unreadable, starting fresh");
  }

  /* One-time raw copy of the version-1 text, before the first version-2 write. Failure is ignored. */
  function backupV1(text) {
    try {
      if (root.localStorage.getItem(BACKUP_KEY) == null) root.localStorage.setItem(BACKUP_KEY, text);
    } catch (e) {
      if (typeof console !== "undefined") console.warn("verbTrainer: could not back up the old progress data before upgrading it");
    }
  }

  function load() {
    migrated = false;
    if (persistent) {
      try {
        var text = root.localStorage.getItem(KEY);
        if (text == null) return defaults();
        var raw;
        try {
          raw = JSON.parse(text);
        } catch (parseError) {
          unreadable(); // corrupt JSON: start fresh (overwritten on next save)
          return defaults();
        }
        if (!isObject(raw) || (raw.version !== 1 && raw.version !== 2)) {
          unreadable();
          return defaults();
        }
        if (raw.version === 1) {
          migrated = true;
          backupV1(text);
        }
        return sanitize(raw);
      } catch (storageError) {
        persistent = false;
      }
    }
    return memory ? sanitize(JSON.parse(memory)) : defaults();
  }

  function save(state) {
    var text = JSON.stringify(state);
    memory = text;
    if (!persistent) return false;
    try {
      root.localStorage.setItem(KEY, text);
      return true;
    } catch (e) {
      persistent = false;
      return false;
    }
  }

  /** Clears all stats and settings (not the migration backup) and returns fresh defaults. */
  function reset() {
    memory = null;
    if (persistent) {
      try { root.localStorage.removeItem(KEY); } catch (e) { persistent = false; }
    }
    return defaults();
  }

  /* ---------- Export / Import (plan D8): the bridge between file:// and each http origin ---------- */
  var EXPORT_APP = "french-verb-trainer";
  var EXPORT_KIND = "progress";
  var IMPORT_MAX_CHARS = 1048576; // 1 MB of text

  /** Pretty JSON of { app, kind, exportedVersion, exportedAt, data } with data = sanitize(state). */
  function exportText(state, now) {
    var t = typeof now === "number" && isFinite(now) ? now : Date.now();
    return JSON.stringify({
      app: EXPORT_APP,
      kind: EXPORT_KIND,
      exportedVersion: VERSION,
      exportedAt: new Date(t).toISOString(),
      data: sanitize(state)
    }, null, 2);
  }

  /**
   * Validate an export file's text. Only JSON.parse + sanitize: nothing is ever evaluated.
   * Returns { ok: true, state } or { ok: false, error: "too-large" | "not-json" | "not-an-export" | "unsupported-version" }.
   */
  function parseImport(text) {
    if (typeof text !== "string") return { ok: false, error: "not-json" };
    if (text.length > IMPORT_MAX_CHARS) return { ok: false, error: "too-large" };
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, error: "not-json" }; }
    if (!isObject(parsed) || parsed.app !== EXPORT_APP || parsed.kind !== EXPORT_KIND || !isObject(parsed.data)) {
      return { ok: false, error: "not-an-export" };
    }
    if (parsed.data.version !== 1 && parsed.data.version !== 2) return { ok: false, error: "unsupported-version" };
    return { ok: true, state: sanitize(parsed.data) };
  }

  /** True once anything was practised or recorded: answers, verb stats, lessons, topic exercises, dialogues or day history. */
  function hasProgress(state) {
    if (!isObject(state)) return false;
    var nonEmpty = function (o) { return isObject(o) && Object.keys(o).length > 0; };
    return (isObject(state.totals) && state.totals.answered > 0) ||
      nonEmpty(state.stats) || nonEmpty(state.lessons) || nonEmpty(state.topics) || nonEmpty(state.history) ||
      nonEmpty(state.dialogues);
  }

  /** The "No progress at this address yet. Import a backup?" note: only over http(s) (the helper's address,
      where progress is per port), only with no progress at all, and only until the learner dismisses it. */
  function importHintVisible(state, protocol) {
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (isObject(state) && isObject(state.onboarding) && state.onboarding.importHintDismissed === true) return false;
    return !hasProgress(state);
  }

  root.VT_STORAGE = {
    KEY: KEY,
    BACKUP_KEY: BACKUP_KEY,
    IMPORT_MAX_CHARS: IMPORT_MAX_CHARS,
    defaults: defaults,
    sanitize: sanitize,
    exportText: exportText,
    parseImport: parseImport,
    hasProgress: hasProgress,
    importHintVisible: importHintVisible,
    load: load,
    save: save,
    reset: reset,
    isPersistent: function () { return persistent; },
    wasMigrated: function () { return migrated; }
  };
})(window);
