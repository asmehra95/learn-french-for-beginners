/* Verb trainer UI: hash router, practice-set filter and the views.
   Verb content comes only from window.VERB_DATA (js/data.js, generated from the MD).
   innerHTML is used only for the generator-escaped *Html / html fields of VERB_DATA. */
(function () {
  "use strict";

  var DATA = window.VERB_DATA;
  var L = window.VT_LOGIC;
  var STORE = window.VT_STORAGE;
  var SPEECH = window.VT_SPEECH;
  var AUDIO = (window.VERB_AUDIO && window.VERB_AUDIO.items) || {};

  var PRACTICE = ["flashcards", "conjugate", "sentences", "choice"];
  var TITLES = {
    home: "Home", lesson: "Lesson", browse: "Learn", practice: "Practice", flashcards: "Flashcards", conjugate: "Conjugate",
    sentences: "Sentences", choice: "Multiple choice", review: "Review my mistakes", progress: "Progress", credits: "Credits", topics: "Topics",
    explain: "Explain", tables: "Grammar tables", expressions: "Everyday expressions"
  };
  /* Which nav item is current for each view (§4, §7.2). Credits has none. */
  var NAV_OF = {
    home: "home", lesson: "learn", browse: "learn", practice: "practice", flashcards: "practice", conjugate: "practice",
    sentences: "practice", choice: "practice", review: "review", progress: "progress", topics: "topics", explain: "explain",
    tables: "tables", expressions: "expressions"
  };
  var ACCENTS = ["é", "è", "ê", "ë", "à", "â", "ç", "î", "ï", "ô", "û", "ù", "œ", "'"];
  var DECKS = ["inf-meaning", "meaning-inf", "conj"];
  /* Everyday expressions (expressions-data.js + expressions.js); null when either file is missing. */
  var EXPR = window.VT_EXPR || null;
  var EXPR_DATA = EXPR && window.VT_EXPRESSIONS && window.VT_EXPRESSIONS.expressions ? window.VT_EXPRESSIONS : null;
  var EXPR_DECKS = EXPR_DATA ? EXPR.DECKS : [];

  /* Nothing at this level may dereference DATA, STORE, L, SPEECH or state: init() checks them first (§16). */
  var LEARN = window.VT_LEARN;
  var state;
  var verbsById = {}, lessonsById = {}, lessonOf = {};
  var searchIndex = null; // VT_SEARCH index, built once in init() (null: search disabled)
  var ctx = null; // view context (§3.1), assigned in init() once the registered views exist
  var currentRoute = null;
  var currentRouteInfo = null; // VT_LEARN.parseRoute result (item 11)
  var views = {};          // per-view controllers; each mode controller holds shownKey (§12.1.1 rule 3)
  var filterKeys = [];     // session keys started with filter scope, dropped on a practice-set edit (rule 6)
  var selectAll = null;    // "Select all" for the empty practice-set message (set by buildFilter)
  var selectAllThemes = null; // "Select all themes" for the empty expression practice set (set by buildFilter)
  var syncFilter = null;   // the current filter's sync(), set at the end of every buildFilter()
  var filterPlacedIn = null; // the view the practice-set filter sits in (null when hidden)

  /* ---------- small DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }

  /* Thin aliases for the helpers in ui.js (VT_UI); resolved lazily so init()'s guard runs first. */
  function el(tag, attrs, children) { return window.VT_UI.el(tag, attrs, children); }
  function fr(text, tag) { return window.VT_UI.fr(text, tag); }
  function clear(node) { window.VT_UI.clear(node); }
  function tableRegion(label, table) { return window.VT_UI.tableRegion(label, table); }
  function listenButton(text, key, opts) { return window.VT_UI.listenButton(text, key, opts); }
  function decorateListen(btn) { window.VT_UI.decorateListen(btn); }

  function save() { STORE.save(state); renderImportHint(); }

  function selectedVerbs() {
    var set = state.settings.selectedVerbIds;
    return DATA.verbs.filter(function (v) { return set.indexOf(v.id) !== -1; });
  }

  /* Verbs for the active route (§12.1.1): the lesson, all verbs, or the practice set. */
  function scopeVerbs() {
    var r = currentRouteInfo;
    if (r && r.scope === "lesson" && lessonsById[r.lessonId]) {
      return lessonsById[r.lessonId].verbIds.map(function (id) { return verbsById[id]; }).filter(Boolean);
    }
    if (r && r.scope === "all") return DATA.verbs.slice();
    return selectedVerbs();
  }

  function isExprDeck(deck) { return EXPR_DECKS.indexOf(deck) !== -1; }

  /* Expression themes for the active flashcards route: the route's theme (or all), the practice set's themes, none for a lesson. */
  function scopeThemeIds() {
    var r = currentRouteInfo;
    if (!EXPR_DATA || !r || r.scope === "lesson") return [];
    if (r.scope === "expressions") return r.themeId ? [r.themeId] : EXPR.allThemeIds(EXPR_DATA);
    return state.settings.selectedExpressionThemes.slice();
  }
  function scopeExpressions() {
    var ids = scopeThemeIds();
    return EXPR_DATA ? EXPR_DATA.expressions.filter(function (e) { return ids.indexOf(e.theme) !== -1; }) : [];
  }

  /* The deck the Flashcards view uses for a route: expression routes need an expression deck, lesson routes a verb deck. */
  function effectiveDeck(info) {
    var deck = state.settings.flashDeck;
    var known = DECKS.indexOf(deck) !== -1 || isExprDeck(deck);
    if (!known) deck = "inf-meaning";
    if (info && info.scope === "expressions") return isExprDeck(deck) ? deck : "expr-fr-en";
    if (info && info.scope === "lesson") return isExprDeck(deck) ? "inf-meaning" : deck;
    return deck;
  }

  /* Canonical route + scope signature (+ deck for flashcards). location.hash is read after any replaceState. */
  function sessionKey() {
    var flash = currentRouteInfo && currentRouteInfo.name === "flashcards";
    var deck = flash ? effectiveDeck(currentRouteInfo) : null;
    if (flash && isExprDeck(deck)) return location.hash.slice(1) + "#expr:" + scopeThemeIds().slice().sort().join(",") + "|" + deck;
    var k = location.hash.slice(1) + "#" + scopeVerbs().map(function (v) { return v.id; }).sort().join(",");
    if (flash) k += "|" + deck;
    return k;
  }

  function lengthFor(r) { return r && r.path ? LEARN.LESSON_SESSION_LENGTH : state.settings.sessionLength; }

  function row(verb, person) { return L.presentRow(verb, person); }

  function promptPronoun(r) { return L.promptPronoun(r); }

  /* "je me" → "je", "ils/elles s'" → "ils/elles"; non-reflexive pronouns unchanged. */
  function subjectPronoun(r) {
    return String(L.promptPronoun(r)).replace(/\s+(me|te|se|nous|vous|m'|t'|s')$/, "");
  }

  /* "all {n} verbs" / "{k} of {n} verbs" / "no verbs selected", from the data (shared by the filter and the hub).
     opts.themes appends the expression themes (Flashcards and the Practice hub, where the theme filter shows). */
  function filterSummaryText(opts) {
    var n = DATA.verbs.length;
    var k = state.settings.selectedVerbIds.length;
    var text = k === n ? "all " + n + " verbs" : k === 0 ? "no verbs selected" : k + " of " + n + " verbs";
    if (opts && opts.themes && EXPR_DATA) {
      var tn = EXPR_DATA.themes.length, tk = state.settings.selectedExpressionThemes.length;
      text += tk === tn ? ", all " + tn + " expression themes" : tk === 0 ? ", no expression themes" : ", " + tk + " of " + tn + " expression themes";
    }
    return text;
  }

  /* ---------- audio ---------- */
  /* #audio-status is written through VT_UI.toast (icon + text, §7.5). */
  function toast(text, kind, opts) { return window.VT_UI.toast(text, kind, opts); }

  /* Expected length of a sound in ms, for the toast's safety timer when the end event never comes:
     recorded clips carry their duration; device voice is estimated from the text (~75 ms a character). */
  function soundMs(res, text) {
    if (res.source === "recorded" && res.entry && res.entry.duration) return (res.entry.duration * 1000) / SPEECH.playbackRate();
    if (res.source === "computer") return (String(text || "").length * 75 * SPEECH.RATE_DEFAULT) / (SPEECH.preferences().rate || SPEECH.RATE_DEFAULT);
    return 0;
  }

  function refreshListenButtons() {
    window.VT_UI.setShowWords(state.settings.preferNative);
    Array.prototype.forEach.call(document.querySelectorAll("button.listen, button.listen-word"), decorateListen);
  }

  /* Full phrase (user decision, FEAT-003): the pre-recorded clip when "Recorded voice" is on and one
     exists, else the device (computer) voice. word = true plays the native clip (the secondary
     "Native speaker (word only)" button); with neither a recording nor speechSynthesis the main
     button also falls back to the native clip when one exists. */
  function play(text, key, word) {
    var native = word || (!SPEECH.synthSupported() && !SPEECH.recordedToPlay(text));
    var id = 0; // the toast for this click; a fallback re-toasts and updates it
    SPEECH.play(text, native ? key : null, function (res) {
      var shown = L.speakableText(text);
      var opts = { awaitEnd: res.source !== "none", durationMs: soundMs(res, shown) };
      if (res.source === "recorded") {
        id = toast("Recorded voice (synthetic): " + shown + ".", "recorded", opts);
      } else if (res.source === "native") {
        var e = res.entry;
        var phrase = e.scope === "phrase";
        var says = L.normalize(e.said) !== L.normalize(shown) ? (phrase ? " (the recording says “" : " (the recording says only “") + e.said + "”)" : "";
        id = toast((phrase ? "Native speaker: " : "Native speaker, word only: ") + e.speaker + ", " + e.license + says + ".", "native", opts);
      } else if (res.source === "computer") {
        id = toast("Device voice" + (res.failed ? " (the recording could not be played)" : "") + ": " + shown + ".", "computer", opts);
      } else {
        id = toast("Audio isn't available in this browser.", null, opts);
      }
    }, function () { window.VT_UI.toastEnded(id); });
  }

  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest ? ev.target.closest("button.listen, button.listen-word") : null;
    if (!btn || btn.disabled) return;
    play(btn.getAttribute("data-text"), btn.getAttribute("data-key"), btn.classList.contains("listen-word"));
  });

  function setListen(slotId, text, key) {
    var slot = $(slotId);
    clear(slot);
    if (!text) return;
    var g = listenButton(text, key);
    g.querySelector("button.listen").setAttribute("aria-keyshortcuts", "Alt+L L"); // §15.1
    slot.appendChild(g);
  }

  /* ---------- voice settings (header panel) ---------- */
  var voiceUI = null;
  /* ctx.onVoiceChange listeners (the Explain view): called from applyPrefs() with the current settings. */
  var voiceListeners = [];

  function buildVoiceSettings() {
    var sel = $("voice-select");
    var rate = $("voice-rate");
    var rateOut = $("voice-rate-value");
    var previewBtn = $("voice-preview");
    var nativeBox = $("voice-prefer-native");
    var sourceBox = $("voice-source");
    var sourceRadios = Array.prototype.slice.call(document.querySelectorAll('input[name="voice-source"]'));
    var recCov = SPEECH.recordedCoverage();
    var recVoice = SPEECH.recordedVoice();
    var listed = []; // voices behind the <option value="0..n">

    function applyPrefs() {
      var s = state.settings;
      // Clips are only ever requested by the word-only button (or the no-speech fallback), so the
      // speech module always allows them; the setting decides whether the word-only buttons show.
      SPEECH.configure({ voiceURI: s.voiceURI, voiceName: s.voiceName, rate: s.speechRate, preferNative: true, voiceSource: s.voiceSource });
      window.VT_UI.setShowWords(s.preferNative);
      voiceListeners.forEach(function (fn) {
        try { fn(s); } catch (err) { console.error("verbTrainer: voice listener failed", err); }
      });
    }

    function rateText(r) { return Number(r).toFixed(2).replace(/0$/, "") + "×"; }

    function regionOrder(label) {
      return label === "French (France)" ? "0" : label === "French (Canada)" ? "1" : "2" + label;
    }

    /* Rebuild the list (voices load asynchronously), keeping the saved choice selected. */
    function populate() {
      var voices = SPEECH.voices();
      var auto = SPEECH.autoVoice();
      clear(sel);
      sel.appendChild(el("option", { value: "", text: auto ? "Automatic: " + SPEECH.describe(auto) : "Automatic" }));
      var groups = {};
      voices.forEach(function (v) {
        var g = SPEECH.regionLabel(v);
        (groups[g] = groups[g] || []).push(v);
      });
      listed = [];
      Object.keys(groups).sort(function (a, b) { return regionOrder(a) < regionOrder(b) ? -1 : 1; }).forEach(function (g) {
        var og = el("optgroup", { label: g });
        groups[g].sort(function (a, b) {
          // Premium/Enhanced first, novelty voices (Grandma, Rocko…) last, then by name.
          var qa = SPEECH.quality(a) ? 0 : SPEECH.isNovelty(a) ? 2 : 1;
          var qb = SPEECH.quality(b) ? 0 : SPEECH.isNovelty(b) ? 2 : 1;
          return qa - qb || SPEECH.describe(a).localeCompare(SPEECH.describe(b));
        }).forEach(function (v) {
          og.appendChild(el("option", { value: String(listed.length), text: SPEECH.describe(v) }));
          listed.push(v);
        });
        sel.appendChild(og);
      });
      var saved = SPEECH.savedVoice();
      sel.value = saved ? String(listed.indexOf(saved)) : "";
      sync();
    }

    /* Hints, accent note, summary and disabled states. */
    function sync() {
      var s = state.settings;
      var supported = SPEECH.synthSupported();
      var count = SPEECH.voices().length;
      var known = SPEECH.hasFrenchVoice();
      var active = SPEECH.activeVoice();
      var off = !supported || count === 0;
      sel.disabled = off;
      previewBtn.disabled = off;
      rate.disabled = !supported;

      var hint;
      if (!supported) hint = "This browser has no computer voice, so voice choice and preview are off. Native recordings still play.";
      else if (count === 0 && known === null) hint = "Looking for French voices…";
      else if (count === 0) hint = "No French computer voice was found in this browser. See the README for how to add one.";
      else if ((s.voiceURI || s.voiceName) && !SPEECH.savedVoice()) hint = "Your saved voice (" + (s.voiceName || s.voiceURI) + ") isn't available here, so the automatic choice is used.";
      else hint = count + (count === 1 ? " French voice" : " French voices") + " found. Premium and Enhanced voices sound the most natural.";
      $("voice-hint").textContent = hint;

      var note = $("voice-accent-note");
      note.textContent = SPEECH.accentNote(active);
      note.hidden = !note.textContent;
      // Short header summary ("Amélie (Premium)") so the quality marker never gets cut off; the full name is in Settings.
      var q = active ? SPEECH.quality(active) : "";
      if (recCov && recCov.recorded && s.voiceSource === "recorded") $("voice-summary").textContent = " · Recorded voice";
      else $("voice-summary").textContent = active ? " · " + SPEECH.describe(active).split(" — ")[0] + (q ? " (" + q + ")" : "") : "";
    }

    function setControls() {
      var s = state.settings;
      rate.value = String(s.speechRate);
      rateOut.textContent = rateText(s.speechRate);
      nativeBox.checked = s.preferNative;
      sourceRadios.forEach(function (r) { r.checked = r.value === s.voiceSource; });
    }

    // "Listen plays": only offered when recordings are bundled (js/tts-manifest.js).
    if (recCov && recCov.recorded) {
      sourceBox.hidden = false;
      $("voice-source-hint").textContent = "The recorded voice is a synthetic French voice made in advance with " +
        (recVoice ? recVoice.model.split(" (")[0] + " (" + recVoice.license + ")" : "a text-to-speech model") + ". It covers " +
        recCov.recorded + " of the " + recCov.total + " phrases on this site; the rest use the device voice.";
    }
    sourceRadios.forEach(function (r) {
      r.addEventListener("change", function () {
        if (!r.checked) return;
        state.settings.voiceSource = r.value;
        save();
        applyPrefs();
        sync();
        refreshListenButtons();
      });
    });

    sel.addEventListener("change", function () {
      var v = sel.value === "" ? null : listed[Number(sel.value)];
      state.settings.voiceURI = v ? String(v.voiceURI || "") : "";
      state.settings.voiceName = v ? String(v.name || "") : "";
      save();
      applyPrefs();
      sync();
    });
    rate.addEventListener("input", function () {
      state.settings.speechRate = Number(rate.value);
      rateOut.textContent = rateText(rate.value);
      applyPrefs();
    });
    rate.addEventListener("change", save);
    previewBtn.addEventListener("click", function () {
      var id = 0;
      var u = SPEECH.preview(function () { window.VT_UI.toastEnded(id); });
      var v = SPEECH.activeVoice();
      if (u) {
        id = toast("Preview" + (v ? " (" + SPEECH.describe(v) + ")" : "") + ", rate " + rateText(state.settings.speechRate) + ": " + SPEECH.PREVIEW_TEXT, "computer",
          { awaitEnd: true, durationMs: soundMs({ source: "computer" }, SPEECH.PREVIEW_TEXT) });
      } else {
        toast("Audio isn't available in this browser.", null);
      }
    });
    nativeBox.addEventListener("change", function () {
      state.settings.preferNative = nativeBox.checked;
      save();
      applyPrefs();
      refreshListenButtons();
    });

    applyPrefs();
    setControls();
    populate();
    SPEECH.onVoicesChanged(populate);
    SPEECH.onVoicesChecked(sync);

    /* After "Reset progress" (which also resets settings). */
    return {
      reset: function () { applyPrefs(); setControls(); populate(); refreshListenButtons(); }
    };
  }

  /* ---------- notices ---------- */
  function renderNotices() {
    var box = $("notices");
    clear(box);
    if (!SPEECH.synthSupported()) {
      box.appendChild(el("p", { className: "notice", role: "note" }, [
        "Audio isn't available in this browser for items without a native-speaker recording, so those Listen buttons are disabled."
      ]));
    } else if (SPEECH.hasFrenchVoice() === false && !state.settings.voiceNoticeDismissed) {
      var dismiss = el("button", { type: "button", className: "btn btn-small", text: "Dismiss" });
      var note = el("div", { className: "notice", role: "note" }, [
        el("p", null, [
          "No French computer voice was found, so items without a native recording may sound English. ",
          "On a Mac, add one in System Settings › Accessibility › Spoken Content › System voice › Manage Voices, pick a French voice, then reload this page."
        ]),
        dismiss
      ]);
      dismiss.addEventListener("click", function () {
        state.settings.voiceNoticeDismissed = true;
        save();
        renderNotices();
        $("main").focus();
      });
      box.appendChild(note);
    }
    if (!STORE.isPersistent()) {
      box.appendChild(el("p", { className: "notice", role: "note" }, [
        "This browser is blocking local storage for this page, so your progress will be lost when you close it."
      ]));
    }
  }

  /* Quiet "No progress at this address yet. Import a backup?" note (served over http only; progress is kept
     per address, so a new helper port starts empty). Lives in the polite live region #import-hint; it is
     re-rendered only when its visibility changes, so it is announced once. Dismissal is stored in
     state.onboarding.importHintDismissed. */
  var importHintShown = false;
  var focusImportAfterRoute = false;
  function focusImport() {
    var inp = $("progress-import");
    if (!inp) return;
    inp.focus({ preventScroll: true });
    inp.scrollIntoView({ block: "center" });
  }
  function renderImportHint() {
    var box = $("import-hint");
    if (!box || !state) return;
    var want = STORE.importHintVisible(state, location.protocol);
    if (want === importHintShown) return;
    importHintShown = want;
    clear(box);
    if (!want) return;
    var link = el("a", { href: "#progress", className: "text-link", id: "import-hint-link", text: "Import a backup?" });
    link.addEventListener("click", function (ev) {
      if (location.hash === "#progress") { ev.preventDefault(); focusImport(); }
      else focusImportAfterRoute = true;
    });
    var x = el("button", { type: "button", className: "btn-icon import-hint-close", id: "import-hint-close", "aria-label": "Dismiss the note about importing a backup" }, [window.VT_UI.icon("x")]);
    x.addEventListener("click", function () {
      state.onboarding.importHintDismissed = true;
      save(); // hides the note through renderImportHint()
      $("main").focus();
    });
    box.appendChild(el("div", { className: "import-hint" }, [
      el("p", null, [window.VT_UI.icon("info"), el("span", { text: "No progress at this address yet. " }), link]),
      x
    ]));
  }

  /* ---------- practice-set filter ---------- */
  function buildFilter() {
    var body = $("filter-body");
    clear(body);
    var allBtn = el("button", { type: "button", className: "btn btn-small", text: "All" });
    var noneBtn = el("button", { type: "button", className: "btn btn-small", text: "None" });
    body.appendChild(el("div", { className: "actions" }, [allBtn, noneBtn]));

    var lessonBoxes = [];
    var lessonSet = el("fieldset", { className: "filter-lessons" }, [el("legend", { text: "Lessons" })]);
    DATA.lessons.forEach(function (lesson) {
      var id = "flt-lesson-" + lesson.id;
      var cb = el("input", { type: "checkbox", id: id, "data-lesson": lesson.id });
      lessonBoxes.push(cb);
      lessonSet.appendChild(el("div", { className: "check" }, [cb, el("label", { "for": id, text: "Lesson " + lesson.id + ": " + lesson.title })]));
    });
    body.appendChild(lessonSet);

    var verbBoxes = [];
    var grid = el("div", { className: "filter-verbs" });
    DATA.lessons.forEach(function (lesson) {
      // Collapsible per lesson so the verb list stays short with many lessons; the lesson boxes above stay visible.
      var fs = el("fieldset", null, [el("legend", { className: "visually-hidden", text: "Lesson " + lesson.id + " verbs" })]);
      var fold = el("details", { className: "filter-fold" }, [
        el("summary", { text: "Lesson " + lesson.id + " verbs: " + lesson.title }), fs
      ]);
      lesson.verbIds.forEach(function (vid) {
        var v = verbsById[vid];
        if (!v) return; // lesson lists an unknown verb id (warned by buildLessonOf)
        var id = "flt-verb-" + vid;
        var cb = el("input", { type: "checkbox", id: id, "data-verb": vid });
        verbBoxes.push(cb);
        fs.appendChild(el("div", { className: "check" }, [cb, el("label", { "for": id }, [fr(v.infinitive), " (" + v.meaning + ")"])]));
      });
      grid.appendChild(fold);
    });
    body.appendChild(grid);

    // Expression themes (Flashcards and the Practice hub only; placeFilter toggles the fieldset).
    var themeBoxes = [];
    if (EXPR_DATA) {
      var allThemes = el("button", { type: "button", className: "btn btn-small", text: "All themes" });
      var noThemes = el("button", { type: "button", className: "btn btn-small", text: "No themes" });
      var themeSet = el("fieldset", { className: "filter-themes", id: "filter-themes" }, [
        el("legend", { text: "Expression themes" }),
        el("div", { className: "actions" }, [allThemes, noThemes])
      ]);
      var counts = {};
      EXPR_DATA.expressions.forEach(function (e) { counts[e.theme] = (counts[e.theme] || 0) + 1; });
      EXPR_DATA.themes.forEach(function (t) {
        var id = "flt-theme-" + t.id;
        var cb = el("input", { type: "checkbox", id: id, "data-theme": t.id });
        themeBoxes.push(cb);
        themeSet.appendChild(el("div", { className: "check" }, [cb, el("label", { "for": id, text: t.title + " (" + (counts[t.id] || 0) + ")" })]));
      });
      themeSet.hidden = !(filterPlacedIn === "flashcards" || filterPlacedIn === "practice");
      body.appendChild(themeSet);
      var setThemes = function (ids) {
        state.settings.selectedExpressionThemes = EXPR.allThemeIds(EXPR_DATA).filter(function (id) { return ids.indexOf(id) !== -1; });
        save();
        sync();
        filterKeys.forEach(function (k) { window.VT_SESSION.drop(k); });
        filterKeys = [];
        if (PRACTICE.indexOf(currentRoute) !== -1) showMode(currentRoute);
        if (currentRoute === "practice") showRegistered("practice");
      };
      selectAllThemes = function () { setThemes(EXPR.allThemeIds(EXPR_DATA)); };
      allThemes.addEventListener("click", selectAllThemes);
      noThemes.addEventListener("click", function () { setThemes([]); });
      themeBoxes.forEach(function (cb) {
        cb.addEventListener("change", function () {
          var id = cb.getAttribute("data-theme");
          var sel = state.settings.selectedExpressionThemes.filter(function (x) { return x !== id; });
          setThemes(cb.checked ? sel.concat([id]) : sel);
        });
      });
    }

    function sync() {
      var sel = state.settings.selectedVerbIds;
      verbBoxes.forEach(function (cb) { cb.checked = sel.indexOf(cb.getAttribute("data-verb")) !== -1; });
      lessonBoxes.forEach(function (cb) {
        var ids = lessonsById[cb.getAttribute("data-lesson")].verbIds;
        var n = ids.filter(function (id) { return sel.indexOf(id) !== -1; }).length;
        cb.checked = n === ids.length;
        cb.indeterminate = n > 0 && n < ids.length;
      });
      themeBoxes.forEach(function (cb) { cb.checked = state.settings.selectedExpressionThemes.indexOf(cb.getAttribute("data-theme")) !== -1; });
      $("filter-summary").textContent = filterSummaryText({ themes: filterPlacedIn === "flashcards" || filterPlacedIn === "practice" });
    }

    function setSelection(ids) {
      // keep MD order
      state.settings.selectedVerbIds = DATA.verbs.map(function (v) { return v.id; }).filter(function (id) { return ids.indexOf(id) !== -1; });
      save();
      sync();
      // Filter-scope sessions belong to the old practice set (§12.1.1 rule 6).
      filterKeys.forEach(function (k) { window.VT_SESSION.drop(k); });
      filterKeys = [];
      if (PRACTICE.indexOf(currentRoute) !== -1) showMode(currentRoute);
      if (currentRoute === "practice") showRegistered("practice"); // keep the hub's "Practising:" line in sync
    }

    selectAll = function () { setSelection(DATA.verbs.map(function (v) { return v.id; })); };
    allBtn.addEventListener("click", selectAll);
    noneBtn.addEventListener("click", function () { setSelection([]); });
    lessonBoxes.forEach(function (cb) {
      cb.addEventListener("change", function () {
        var ids = lessonsById[cb.getAttribute("data-lesson")].verbIds;
        var sel = state.settings.selectedVerbIds.filter(function (id) { return ids.indexOf(id) === -1; });
        setSelection(cb.checked ? sel.concat(ids) : sel);
      });
    });
    verbBoxes.forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.getAttribute("data-verb");
        var sel = state.settings.selectedVerbIds.filter(function (x) { return x !== id; });
        setSelection(cb.checked ? sel.concat([id]) : sel);
      });
    });
    sync();
    syncFilter = sync;
  }

  /* Show the question area or the scope-dependent empty message (§12.1.1 rule 2). Returns true when there are verbs. */
  function toggleEmpty(route) {
    var section = $("view-" + route);
    var exprDeck = route === "flashcards" && isExprDeck(effectiveDeck(currentRouteInfo));
    var empty = exprDeck ? scopeExpressions().length === 0 : scopeVerbs().length === 0;
    var box = section.querySelector(".empty-msg");
    section.querySelector(".practice-area").hidden = empty;
    clear(box);
    if (empty && exprDeck) {
      if (!currentRouteInfo || currentRouteInfo.scope === "filter") {
        var tbtn = el("button", { type: "button", className: "btn btn-primary", text: "Select all themes" });
        tbtn.addEventListener("click", function () { if (selectAllThemes) selectAllThemes(); });
        box.appendChild(el("p", { text: "Your practice set has no expression themes. Pick at least one theme above." }));
        box.appendChild(tbtn);
      } else {
        box.appendChild(el("p", { text: "There are no expressions to practise here." }));
        box.appendChild(el("a", { className: "btn", href: "#expressions", text: "Browse the expressions" }));
      }
    } else if (empty) {
      if (!currentRouteInfo || currentRouteInfo.scope === "filter") {
        var btn = el("button", { type: "button", className: "btn btn-primary", text: "Select all" });
        btn.addEventListener("click", function () { if (selectAll) selectAll(); });
        box.appendChild(el("p", { text: "Your practice set is empty. Pick at least one lesson or verb above." }));
        box.appendChild(btn);
      } else {
        box.appendChild(el("p", { text: "This lesson has no verbs to practise yet." }));
        box.appendChild(el("a", { className: "btn", href: "#home", text: "Back to Home" }));
      }
    }
    box.hidden = !empty;
    return !empty;
  }

  /* §12.1.1 rule 3: resume the route's session or start one. Per-question state moves into the session in item 14. */
  function showMode(name) {
    var view = views[name];
    if (!view) return;
    if (name === "flashcards") syncDeckSelect();
    var k = sessionKey();
    if (!toggleEmpty(name)) return;
    var s = window.VT_SESSION.getOrStart(k, view.init);
    if (currentRouteInfo.scope === "filter" && filterKeys.indexOf(k) === -1) filterKeys.push(k);
    if (name === "conjugate") showTypingTip("conj");
    if (name === "sentences") showTypingTip("sent");
    if (s.resumed && view.shownKey === k) return; // the DOM already shows this session's question
    view.session = s;
    if (s.resumed && s.current) view.renderItem(s); // same question, same answered state, same counters
    else view.next();
    view.shownKey = k;
  }

  /* Filter placement and the scope chip (§12.1.1 rule 6, §4 chip copy). */
  function placeFilter(name, info) {
    var filter = $("practice-filter");
    var isMode = PRACTICE.indexOf(name) !== -1;
    var showFilter = name === "practice" || (isMode && info.scope === "filter");
    var chip = isMode ? $(name + "-scope") : null;
    filterPlacedIn = showFilter ? name : null;
    var themes = $("filter-themes");
    if (themes) themes.hidden = !(filterPlacedIn === "flashcards" || filterPlacedIn === "practice");
    if (syncFilter) syncFilter();
    if (showFilter) {
      $("view-" + name).querySelector(".filter-slot").appendChild(filter);
      filter.hidden = false;
      if (chip) { clear(chip); chip.hidden = true; }
      return;
    }
    filter.hidden = true;
    if (!chip) return;
    clear(chip);
    if (info.scope === "expressions") {
      var theme = info.themeId && EXPR_DATA ? EXPR.index(EXPR_DATA).themeById[info.themeId] : null;
      chip.appendChild(document.createTextNode(theme ? "Expressions: " + theme.title + " · " : "All expressions · "));
      chip.appendChild(el("a", { href: "#flashcards", text: "Use my practice set instead" }));
      chip.hidden = false;
      return;
    }
    var lesson = info.lessonId != null ? lessonsById[info.lessonId] : null;
    if (info.scope === "lesson" && lesson && info.path) {
      chip.appendChild(document.createTextNode("Lesson " + lesson.id + " · " + (name === "choice" ? "Quiz" : "Practice step")));
    } else if (info.scope === "lesson" && lesson) {
      chip.appendChild(document.createTextNode("Lesson " + lesson.id + " verbs · "));
      chip.appendChild(el("a", { href: "#" + name, text: "Use my practice set instead" }));
    } else if (info.scope === "all") {
      chip.appendChild(document.createTextNode("All verbs · "));
      chip.appendChild(el("a", { href: "#" + name, text: "Use my practice set instead" }));
    }
    chip.hidden = !chip.firstChild;
  }

  /* ---------- grading shared by all practice views ---------- */
  /* opts.hinted: a correct answer after a hint counts as correct everywhere but doesn't promote the box (D11). */
  function record(key, correct, opts) {
    var now = Date.now();
    state.stats[key] = L.updateStat(state.stats[key], correct, now, opts);
    LEARN.recordDay(state, now, correct);
    var t = state.totals;
    t.answered += 1;
    if (correct) {
      t.correct += 1;
      t.streak += 1;
      if (t.streak > t.bestStreak) t.bestStreak = t.streak;
    } else {
      t.streak = 0;
    }
    save();
  }

  /* Topic exercises: count toward the daily goal, history and totals, but not the verb stats (no verb key). */
  function recordTopicAnswer(correct) {
    var now = Date.now();
    LEARN.recordDay(state, now, correct);
    var t = state.totals;
    t.answered += 1;
    if (correct) {
      t.correct += 1;
      t.streak += 1;
      if (t.streak > t.bestStreak) t.bestStreak = t.streak;
    } else {
      t.streak = 0;
    }
    save();
  }

  function setFeedback(node, kind, text) {
    node.className = "feedback" + (kind ? " is-" + kind : "");
    node.textContent = text;
  }

  /* ---------- accent toolbars ---------- */
  function buildToolbar(bar) {
    var buttons = ACCENTS.map(function (ch, i) {
      var b = el("button", {
        type: "button", className: "accent-btn", lang: "fr", tabindex: i === 0 ? "0" : "-1",
        "aria-label": ch === "'" ? "Insert apostrophe" : "Insert " + ch, text: ch
      });
      // Keep focus (and the caret) in the input when clicked with a mouse.
      b.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
      b.addEventListener("click", function () {
        var input = $(bar.getAttribute("data-for")); // read on click: Topics moves it to the focused box
        if (!input) return;
        var start = input.selectionStart == null ? input.value.length : input.selectionStart;
        var end = input.selectionEnd == null ? start : input.selectionEnd;
        input.value = input.value.slice(0, start) + ch + input.value.slice(end);
        input.focus();
        input.setSelectionRange(start + ch.length, start + ch.length);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      bar.appendChild(b);
      return b;
    });
    // Toolbar pattern: one tab stop, arrow keys move between letters.
    bar.addEventListener("keydown", function (ev) {
      var i = buttons.indexOf(document.activeElement);
      if (i === -1) return;
      var j = null;
      if (ev.key === "ArrowRight") j = (i + 1) % buttons.length;
      else if (ev.key === "ArrowLeft") j = (i - 1 + buttons.length) % buttons.length;
      else if (ev.key === "Home") j = 0;
      else if (ev.key === "End") j = buttons.length - 1;
      if (j === null) return;
      ev.preventDefault();
      buttons[i].tabIndex = -1;
      buttons[j].tabIndex = 0;
      buttons[j].focus();
    });
  }

  function bindTolerant(cb) {
    cb.checked = state.settings.accentTolerant;
    cb.addEventListener("change", function () {
      state.settings.accentTolerant = cb.checked;
      save();
      Array.prototype.forEach.call(document.querySelectorAll(".tolerant-toggle"), function (o) { o.checked = cb.checked; });
    });
  }

  /* ---------- panel factories (§11.3): render items, grade, hint, show answer; the owner supplies items ---------- */
  function openShortcuts(ev) { window.VT_UI.openDialog($("dlg-shortcuts"), ev && ev.currentTarget); }

  function renderBar(node, s) { window.VT_UI.sessionBar(node, s, openShortcuts); }

  /* ---------- keyboard shortcuts (§15.1): one document listener ---------- */
  var SHORTCUT_VIEWS = ["flashcards", "conjugate", "sentences", "choice", "review"];
  var ALT_CODES = { KeyH: "h", KeyL: "l", KeyS: "s" };

  function isShown(node) { return !!node && !node.hidden && !node.disabled && node.getClientRects().length > 0; }
  function clickIfShown(node) {
    if (!isShown(node)) return false;
    node.click();
    return true;
  }
  function isTypingTarget(t) {
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag !== "input") return !!t.isContentEditable;
    var type = (t.getAttribute("type") || "text").toLowerCase();
    return type === "text" || type === "search";
  }
  function isInteractive(t) {
    return !!(t && t.closest && t.closest("button, a, input, select, textarea, summary, [role='toolbar']"));
  }
  function anyDialogOpen() { return !!document.querySelector("dialog[open], .dialog-fallback.is-open"); }

  /* The visible .answer-form of the current practice view (Review: whichever panel the item uses). */
  function activeForm(section) {
    var forms = section.querySelectorAll(".answer-form");
    for (var i = 0; i < forms.length; i++) if (isShown(forms[i])) return forms[i];
    return null;
  }

  function onShortcutKey(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.isComposing || ev.defaultPrevented) return;
    if (anyDialogOpen()) return; // Esc is native
    var typing = isTypingTarget(ev.target);
    var single = state.settings.singleKeyShortcuts !== false;
    var k;
    if (ev.altKey) {
      k = ALT_CODES[ev.code];
      if (!k) return;
    } else {
      if (typing) return; // Enter submits natively; nothing else applies in a text field
      if (ev.key === "ArrowRight") {
        if (isInteractive(ev.target) && ev.target.tagName.toLowerCase() !== "button") return; // radios, toolbars keep arrows
        k = "n";
      } else {
        if (!single) return; // §15.1: every unmodified printable key is inert
        if (ev.key === "?") {
          ev.preventDefault();
          openShortcuts();
          return;
        }
        k = ev.key === " " ? "space" : String(ev.key).toLowerCase();
      }
    }
    if (SHORTCUT_VIEWS.indexOf(currentRoute) === -1) return;
    var section = $("view-" + currentRoute);
    if (!section || section.hidden) return;
    var done = false;
    if (currentRoute === "flashcards") {
      if (k === "space" || k === "f") {
        if (isInteractive(ev.target)) return; // Space keeps its native action on controls
        done = clickIfShown($("flash-show"));
      } else if (k === "1") done = clickIfShown($("flash-notyet"));
      else if (k === "2") done = clickIfShown($("flash-knew"));
      else if (k === "l") done = clickIfShown(section.querySelector("#flash-listen-slot .listen"));
    } else {
      var form = activeForm(section);
      if (!form) return;
      if (k === "h") done = clickIfShown(form.querySelector("[id$='-hintbtn']"));
      else if (k === "s") done = clickIfShown(form.querySelector("[id$='-showbtn']"));
      else if (k === "n") done = clickIfShown(form.querySelector("[id$='-next']"));
      else if (k === "l") done = clickIfShown(form.querySelector(".listen-slot .listen"));
      else if (/^[1-4]$/.test(k)) {
        var radios = form.querySelectorAll("input[type='radio']");
        var r = radios[Number(k) - 1];
        var check = form.querySelector("button[type='submit']");
        if (r && !r.disabled && isShown(check)) {
          r.click(); // select (fires change), then Check (§6.5)
          check.click();
          done = true;
        }
      }
    }
    // A hint chord from the answer box keeps the learner typing there.
    if (done && typing && k === "h" && !ev.target.readOnly) ev.target.focus();
    if (done || ev.altKey) ev.preventDefault(); // Alt chords never type Option characters here
  }

  function appendParts(node, list) {
    (list || []).forEach(function (p) { node.appendChild(typeof p === "string" ? document.createTextNode(p) : p); });
  }

  /* classify in try/catch (§16): a classifier bug falls back to the generic message. */
  function safeClassify(input, item, family) {
    try {
      return LEARN.classify(input, {
        verb: item.verb, person: item.person, family: family, accepted: item.accepted, correct: item.correct
      }, { data: DATA, accentTolerant: state.settings.accentTolerant });
    } catch (err) {
      console.error("verbTrainer: classify failed", err);
      return { category: "generic", message: "", parts: [] };
    }
  }

  /* The verb's present rows with the target row highlighted (§6.5). */
  function miniTable(verb, person) {
    var body = el("tbody", null, LEARN.personsOf(verb).map(function (p) {
      var r = row(verb, p);
      return el("tr", { className: p === person ? "is-target" : null }, [
        el("td", null, [frenchForm(verb, r)]),
        el("td", { className: "pron", text: r.pronunciation }),
        el("td", { text: r.english })
      ]);
    }));
    return tableRegion("Present tense of " + verb.infinitive, el("table", { className: "conj-table mini-table" }, [
      el("caption", null, ["Present tense of ", fr(verb.infinitive)]),
      el("thead", null, [el("tr", null, ["French", "Pronunciation", "English"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
      body
    ]));
  }

  /* After Check, Next has focus (§15.2) but sits above the feedback panel; on small screens scroll so the
     whole explanation is on screen too, so the diagnosis is read before moving on (review finding). */
  function revealFeedback(form) {
    var panel = form && form.querySelector(".fb-panel");
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
  }

  function maybeAutoPlay(text, key) {
    if (state.settings.autoPlayWrong && text) play(text, key);
  }

  function nextLabel(s) { return s.index + 1 >= s.length ? "See results" : "Next →"; }

  function makeTypedPanel(prefix, cfg) {
    var ids = cfg.ids || {};
    var n = {
      form: $(ids.form || prefix + "-form"), prompt: $(prefix + "-prompt"), hint: $(prefix + "-hint"),
      input: $(prefix + "-input"), check: $(prefix + "-check"), hintbtn: $(prefix + "-hintbtn"),
      showbtn: $(prefix + "-showbtn"), hinttext: $(prefix + "-hinttext"), next: $(prefix + "-next"),
      listenSlot: prefix + "-listen-slot", feedback: $(ids.feedback || prefix + "-feedback"),
      reveal: $(prefix + "-reveal"), bar: $(prefix + "-bar")
    };
    var panelBox = el("div", { className: "fb-slot" });
    n.feedback.parentNode.insertBefore(panelBox, n.feedback.nextSibling);
    n.input.addEventListener("input", function () { n.input.removeAttribute("aria-invalid"); });

    function renderTypedPrompt(item) {
      clear(n.prompt);
      clear(n.hint);
      if (item.family === "conjugate") {
        var r = row(item.verb, item.person);
        // Reflexive verbs prompt with the subject only: the learner types the reflexive pronoun too ("me lève").
        n.prompt.appendChild(fr(subjectPronoun(r), "strong"));
        n.prompt.appendChild(document.createTextNode(" · ("));
        n.prompt.appendChild(fr(item.verb.infinitive));
        n.prompt.appendChild(document.createTextNode(")"));
        n.hint.textContent = "Meaning: " + r.english;
      } else {
        n.prompt.appendChild(fr(L.blankSentence(item.verb.sentence)));
        n.hint.appendChild(document.createTextNode("Verb: "));
        n.hint.appendChild(fr(item.verb.infinitive, "strong"));
        n.hint.appendChild(document.createTextNode(" (" + item.verb.meaning + ")"));
        if (n.reveal) { clear(n.reveal); n.reveal.hidden = true; }
      }
    }

    function sentenceReveal(sen) {
      return [el("p", null, [el("strong", { lang: "fr", text: sen.french })]), el("p", { className: "pron", text: sen.pronunciation }), el("p", { text: sen.english })];
    }

    /* Answer shown in the feedback panel: the present form with stem/ending styling, or the sentence's verb form. */
    function answerInfo(item) {
      if (item.family === "conjugate") {
        var r = row(item.verb, item.person);
        return { french: r.french, formNode: frenchForm(item.verb, r), pronunciation: r.pronunciation, english: r.english };
      }
      return { french: item.verb.sentence.verbForm };
    }

    function renderTypedReveal(item, s) {
      if (item.family === "conjugate") {
        var r = row(item.verb, item.person);
        n.hint.textContent = "Meaning: " + r.english + " · Pronunciation: " + r.pronunciation;
        setListen(n.listenSlot, r.french, item.verb.id + "|" + r.person);
      } else {
        var sen = item.verb.sentence;
        if (n.reveal) {
          clear(n.reveal);
          appendParts(n.reveal, sentenceReveal(sen));
          n.reveal.hidden = false;
        } else {
          var box = el("div", { className: "reveal" });
          appendParts(box, sentenceReveal(sen));
          panelBox.appendChild(box);
        }
        setListen(n.listenSlot, sen.french, item.verb.id + "|sentence");
      }
    }

    function renderHint(item, ui) {
      clear(n.hinttext);
      if (ui.hintLevel > 0) {
        var h = LEARN.hintFor(item, ui.hintLevel);
        n.hinttext.appendChild(window.VT_UI.parts(h.parts));
        n.hinttext.appendChild(document.createTextNode(" "));
        n.hinttext.appendChild(el("span", { className: "hint-mask", lang: "fr", role: "img", "aria-label": h.maskLabel, text: h.mask }));
      }
      n.hintbtn.hidden = ui.answered || ui.hintLevel >= 2;
      n.hintbtn.querySelector(".btn-text").textContent = "Hint (" + (2 - ui.hintLevel) + " left)";
    }

    function renderItem(s) {
      var item = s.current, ui = s.ui;
      if (!item) return;
      renderTypedPrompt(item);
      n.input.value = ui.answered ? ui.input : "";
      n.input.readOnly = ui.answered;
      if (ui.answered && ui.result && !ui.result.correct) n.input.setAttribute("aria-invalid", "true");
      else n.input.removeAttribute("aria-invalid");
      renderHint(item, ui);
      n.check.hidden = ui.answered;
      n.showbtn.hidden = ui.answered;
      n.next.hidden = !ui.answered;
      n.next.textContent = nextLabel(s);
      clear(panelBox);
      if (ui.answered && ui.result) {
        var fp = window.VT_UI.feedbackPanel(ui.result, item, {
          index: s.index, answer: answerInfo(item),
          table: item.family === "conjugate" ? miniTable(item.verb, item.person) : null
        });
        panelBox.appendChild(fp.node);
        n.feedback.className = "feedback visually-hidden " + (ui.result.correct ? "is-success" : "is-error");
        n.feedback.textContent = fp.live;
        renderTypedReveal(item, s);
      } else {
        setFeedback(n.feedback, "", "");
        setListen(n.listenSlot, null);
      }
      renderBar(n.bar, s);
    }

    function grade(s, correct, exact, cls, shown) {
      var item = s.current, ui = s.ui;
      var hinted = !shown && ui.hintLevel > 0;
      record(item.key, correct, { hinted: hinted });
      window.VT_SESSION.recordResult(s, item, correct, hinted);
      ui.input = n.input.value;
      ui.answered = true;
      ui.result = { correct: correct, exact: exact, hinted: hinted && correct, shown: !!shown, classification: cls };
      renderItem(s);
      n.next.focus();
      revealFeedback(n.form);
      if (!correct) {
        var r = item.family === "conjugate" ? row(item.verb, item.person) : null;
        maybeAutoPlay(r ? r.french : item.verb.sentence.french, r ? item.verb.id + "|" + r.person : item.verb.id + "|sentence");
      }
    }

    n.form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var s = cfg.getSession();
      if (!s || !s.current) return;
      if (s.ui.answered) { cfg.onNext(); return; } // Enter again = Next
      var val = n.input.value;
      if (!val.trim()) {
        setFeedback(n.feedback, "error", "Type an answer first, then press Check.");
        return;
      }
      var res = L.checkAnswer(val, s.current.accepted, { accentTolerant: state.settings.accentTolerant });
      var cls = res.correct && res.exact ? null : safeClassify(val, s.current, s.current.family);
      grade(s, res.correct, res.exact, cls, false);
    });
    n.next.addEventListener("click", function () {
      var s = cfg.getSession();
      if (s && s.ui.answered) cfg.onNext();
    });
    n.hintbtn.addEventListener("click", function () {
      var s = cfg.getSession();
      if (!s || !s.current || s.ui.answered || s.ui.hintLevel >= 2) return;
      s.ui.hintLevel += 1;
      renderItem(s);
      if (s.ui.hintLevel >= 2) n.showbtn.focus(); else n.hintbtn.focus();
    });
    n.showbtn.addEventListener("click", function () {
      var s = cfg.getSession();
      if (!s || !s.current || s.ui.answered) return;
      grade(s, false, false, null, true); // Show answer counts as wrong (§6.5)
    });
    return {
      renderItem: renderItem,
      focusInput: function () { n.input.focus(); }
    };
  }

  function makeChoicePanel(prefix, cfg) {
    var ids = cfg.ids || {};
    var n = {
      form: $(ids.form || prefix + "-form"), legend: $(ids.legend || prefix + "-legend"),
      options: $(ids.options || prefix + "-options"), feedback: $(ids.feedback || prefix + "-feedback"),
      check: $(ids.check || prefix + "-check"), next: $(ids.next || prefix + "-next"),
      listen: ids.listen || prefix + "-listen-slot", bar: $(prefix + "-bar")
    };
    var radioName = cfg.radioName || "choice";
    var panelBox = el("div", { className: "fb-slot" });
    n.feedback.parentNode.insertBefore(panelBox, n.feedback.nextSibling);

    function renderItem(s) {
      var item = s.current, ui = s.ui;
      if (!item) return;
      clear(n.legend);
      appendParts(n.legend, item.legendParts);
      clear(n.options);
      item.options.forEach(function (o, i) {
        var id = radioName + "-" + i;
        var input = el("input", { type: "radio", name: radioName, id: id, value: String(i) });
        input.checked = ui.selected === i;
        input.disabled = ui.answered;
        input.addEventListener("change", function () { if (input.checked) s.ui.selected = i; });
        var mark = el("span", { className: "mark" });
        var srText = "";
        var box = el("div", { className: "choice" });
        if (ui.answered) {
          if (o === item.correct) { box.classList.add("is-correct"); mark.appendChild(window.VT_UI.icon("check")); srText = " (correct answer)"; }
          else if (i === ui.selected) { box.classList.add("is-wrong"); mark.appendChild(window.VT_UI.icon("x")); srText = " (your answer)"; }
        }
        box.appendChild(input);
        box.appendChild(el("label", { "for": id }, [
          el("span", { className: "choice-key", "aria-hidden": "true", text: String(i + 1) }),
          mark,
          el("span", { lang: item.isFrench ? "fr" : null, text: o }),
          srText ? el("span", { className: "visually-hidden", text: srText }) : null
        ]));
        n.options.appendChild(box);
      });
      n.check.hidden = ui.answered;
      n.next.hidden = !ui.answered;
      n.next.textContent = nextLabel(s);
      clear(panelBox);
      if (ui.answered && ui.result) {
        var ctxLine = item.reveal || {};
        var fp = window.VT_UI.feedbackPanel(ui.result, item, {
          index: s.index,
          answer: {
            french: item.correct,
            formNode: el("strong", { lang: item.isFrench ? "fr" : null, text: item.correct }),
            context: ctxLine
          }
        });
        panelBox.appendChild(fp.node);
        n.feedback.className = "feedback visually-hidden " + (ui.result.correct ? "is-success" : "is-error");
        n.feedback.textContent = fp.live;
        setListen(n.listen, item.listen.text, item.listen.key);
      } else {
        setFeedback(n.feedback, "", "");
        setListen(n.listen, null);
      }
      renderBar(n.bar, s);
    }

    n.form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var s = cfg.getSession();
      if (!s || !s.current) return;
      if (s.ui.answered) { cfg.onNext(); return; }
      var picked = n.form.querySelector("input[name='" + radioName + "']:checked");
      if (picked) s.ui.selected = Number(picked.value);
      if (s.ui.selected < 0) {
        setFeedback(n.feedback, "error", "Choose an answer first, then press Check.");
        return;
      }
      var item = s.current;
      var text = item.options[s.ui.selected];
      var ok = text === item.correct;
      var fam = item.family === "choice-infinitive" ? item.family : "choice-" + item.family;
      var cls = ok || item.expr ? null : safeClassify(text, item, fam);
      record(item.key, ok);
      window.VT_SESSION.recordResult(s, item, ok, false);
      s.ui.answered = true;
      s.ui.result = { correct: ok, exact: true, hinted: false, shown: false, classification: cls };
      renderItem(s);
      n.next.focus();
      revealFeedback(n.form);
      if (!ok) maybeAutoPlay(item.listen.text, item.listen.key);
    });
    n.next.addEventListener("click", function () {
      var s = cfg.getSession();
      if (s && s.ui.answered) cfg.onNext();
    });
    return {
      renderItem: renderItem,
      focusFirstOption: function () {
        var first = n.options.querySelector("input:not([disabled])");
        if (first) first.focus();
      }
    };
  }

  /* ---------- item builders (§11.3) ---------- */
  function buildTypedItem(verb, family, person) {
    if (family === "sentence") {
      return { key: L.itemKey(verb.id, "sentence"), kind: "typed", family: "sentence", verb: verb, person: null, accepted: [verb.sentence.verbForm] };
    }
    return { key: L.itemKey(verb.id, "conjugate", person), kind: "typed", family: "conjugate", verb: verb, person: person, accepted: L.acceptedForms(verb, person) };
  }

  var AUX_PROMPT_RE = /^(j['’]ai|je suis)\s+/i;

  function uniqueCount(list) {
    var seen = {};
    list.forEach(function (x) { seen[L.normalize(x)] = true; });
    return Object.keys(seen).length;
  }

  /* Same-person forms of other verbs, as distractors (only verbs that have that person). */
  function otherForms(verb, person, n) {
    var others = DATA.verbs.filter(function (o) {
      return o.id !== verb.id && LEARN.personsOf(o).indexOf(person) !== -1;
    }).map(function (o) { return row(o, person).form; });
    return L.shuffle(others, Math.random).slice(0, n);
  }

  function buildChoiceItem(verb, type, person) {
    var v = verb;
    var item = { key: null, kind: "choice", verb: v, person: person || null, family: type, legendParts: [], options: [], correct: "", isFrench: true, listen: null, reveal: null };
    var pool;
    if (type === "form") {
      var r = row(v, person);
      item.key = L.itemKey(v.id, "choice-form", person);
      item.correct = r.form;
      var own = v.present.map(function (p) { return p.form; });
      // Distractors: the same verb's other forms plus the same person of other verbs (at least two).
      pool = own.concat(otherForms(v, person, Math.max(2, 4 - uniqueCount(own))));
      item.legendParts = ["Which form completes ", fr(promptPronoun(r) + " · (" + v.infinitive + ")", "strong"), "?"];
      item.listen = { text: r.french, key: v.id + "|" + r.person };
      item.reveal = { french: r.french, pronunciation: r.pronunciation, english: r.english };
    } else if (type === "meaning") {
      item.key = L.itemKey(v.id, "choice-meaning");
      item.correct = v.meaning;
      item.isFrench = false;
      pool = DATA.verbs.filter(function (o) { return o.id !== v.id; }).map(function (o) { return o.meaning; });
      item.legendParts = ["What does ", fr(v.infinitive, "strong"), " mean?"];
      item.listen = { text: v.infinitive, key: v.id + "|inf" };
      item.reveal = { french: v.infinitive, pronunciation: v.pronunciation, english: v.meaning };
    } else if (type === "sentence") {
      item.key = L.itemKey(v.id, "choice-sentence");
      item.correct = v.sentence.verbForm;
      var forms = v.present.map(function (p) { return p.form; });
      var sp = LEARN.sentencePerson(v).person || "3s";
      pool = forms.concat(uniqueCount(forms) < 4 ? otherForms(v, sp, 4 - uniqueCount(forms)) : []);
      item.legendParts = ["Fill the blank: ", fr(L.blankSentence(v.sentence), "strong"), " (" + v.infinitive + ")"];
      item.listen = { text: v.sentence.french, key: v.id + "|sentence" };
      item.reveal = { french: v.sentence.french, pronunciation: v.sentence.pronunciation, english: v.sentence.english };
    } else {
      // aux (D15): two fixed options so the keys 1 and 2 always mean the same thing.
      item.key = L.itemKey(v.id, "choice-aux");
      item.correct = v.past.auxiliary === "être" ? "je suis" : "j'ai";
      item.options = ["j'ai", "je suis"];
      item.legendParts = ["Which helper verb? ", fr(String(v.past.french).replace(AUX_PROMPT_RE, "___ "), "strong"), " (" + v.infinitive + ", past)"];
      item.listen = { text: v.past.french, key: v.id + "|past" };
      item.reveal = { french: v.past.french, pronunciation: v.past.pronunciation, english: v.past.english };
      return item;
    }
    item.options = L.buildChoices(item.correct, pool, 4, Math.random); // shuffled once, stable on resume
    return item;
  }

  /* ---------- Reference dialog (§7.4): pronunciation key, ending patterns, grammar notes, être list ---------- */
  function buildReference() {
    var key = $("pron-key-body");
    var rows = DATA.pronunciationKey.map(function (k) {
      return el("tr", null, [el("td", { html: k.spellingHtml }), el("td", { html: k.soundsLikeHtml })]);
    });
    key.appendChild(tableRegion("Pronunciation key", el("table", null, [
      el("caption", { text: "Pronunciation key (English-style respelling, not IPA)" }),
      el("thead", null, [el("tr", null, [el("th", { scope: "col", text: "Spelling" }), el("th", { scope: "col", text: "Sounds like" })])]),
      el("tbody", null, rows)
    ])));
    key.appendChild(el("p", null, [el("strong", { text: "Tips: " }), el("span", { html: DATA.introTipsHtml })]));

    // One row per family that has endings, with example verbs from the data.
    var meta = window.VERB_META || { families: {}, verbs: {} };
    var famRows = [];
    Object.keys(meta.families).forEach(function (name) {
      var f = meta.families[name];
      if (!f.endings) return;
      var examples = DATA.verbs.filter(function (v) { return LEARN.familyOf(v) === name; }).slice(0, 4);
      famRows.push(el("tr", null, [
        el("th", { scope: "row", text: f.label }),
        el("td", { lang: "fr", text: f.endings.map(function (e) { return e ? "-" + e : "(none)"; }).join(", ") }),
        el("td", null, examples.length ? [fr(examples.map(function (v) { return v.infinitive; }).join(", "))] : ["—"])
      ]));
    });
    $("ref-patterns-body").appendChild(tableRegion("Ending patterns", el("table", null, [
      el("caption", { text: "Present-tense endings for je, tu, il/elle, nous, vous, ils/elles" }),
      el("thead", null, [el("tr", null, ["Pattern", "Endings", "Examples"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
      el("tbody", null, famRows)
    ])));

    $("grammar-notes-body").appendChild(el("ul", null, DATA.grammarNotes.map(function (n) { return el("li", { html: n.html }); })));

    var etre = DATA.verbs.filter(function (v) { return v.past && v.past.auxiliary === "être"; });
    var box = $("ref-etre-body");
    box.appendChild(el("p", { text: "Most verbs form the past (passé composé) with avoir. These verbs use être instead, so the participle agrees with the subject:" }));
    box.appendChild(el("ul", { className: "etre-list" }, etre.map(function (v) {
      return el("li", null, [fr(v.infinitive, "strong"), " → ", fr(v.past.french), " ", listenButton(v.past.french, v.id + "|past", { compact: true })]);
    })));

    // In-dialog jump links: move focus to the section heading without touching location.hash.
    Array.prototype.forEach.call(document.querySelectorAll("[data-ref-jump]"), function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var h = $(a.getAttribute("data-ref-jump"));
        if (h) { h.scrollIntoView({ block: "start" }); h.focus(); }
      });
    });
  }

  /* ---------- header, bottom nav and dialogs (§7.1–§7.4) ---------- */
  var THEME_ICON = { system: "monitor", light: "sun", dark: "moon" };
  var THEME_NAME = { system: "System", light: "Light", dark: "Dark" };

  function announce(text) {
    var a = $("announcer");
    a.textContent = text;
  }

  function setTheme(mode, say) {
    var m = window.VT_THEME ? window.VT_THEME.apply(mode) : mode;
    state.settings.theme = m;
    save();
    syncTheme();
    if (say) announce("Theme: " + THEME_NAME[m]);
  }

  function syncTheme() {
    var m = state.settings.theme;
    $("theme-label").textContent = "Theme: " + THEME_NAME[m];
    $("theme-icon").firstChild.setAttribute("href", "#i-" + THEME_ICON[m]);
    Array.prototype.forEach.call(document.querySelectorAll("input[name='theme-choice']"), function (r) { r.checked = r.value === m; });
  }

  var SETTING_BOXES = [["settings-autoplay", "autoPlayWrong"], ["settings-single-key", "singleKeyShortcuts"]];

  /* Settings dialog controls from state (also after a reset). */
  function syncSettings() {
    var s = state.settings;
    if (window.VT_THEME) window.VT_THEME.apply(s.theme);
    syncTheme();
    $("settings-daily-goal").value = String(s.dailyGoal);
    $("settings-session-length").value = String(s.sessionLength);
    SETTING_BOXES.forEach(function (p) { $(p[0]).checked = !!s[p[1]]; });
  }

  function buildShell() {
    var UI = window.VT_UI;
    var dlg = { settings: $("dlg-settings"), reference: $("dlg-reference"), shortcuts: $("dlg-shortcuts"), more: $("dlg-more") };
    function opener(name, btnId) {
      $(btnId).addEventListener("click", function (ev) { UI.openDialog(dlg[name], ev.currentTarget); });
    }
    opener("reference", "btn-reference");
    opener("settings", "btn-settings");
    opener("more", "btn-more");
    opener("shortcuts", "settings-shortcuts");
    // From the More sheet: close it first, then open the target with focus returning to the More button.
    [["more-reference", "reference"], ["more-settings", "settings"], ["more-shortcuts", "shortcuts"]].forEach(function (p) {
      $(p[0]).addEventListener("click", function () {
        UI.closeDialog(dlg.more);
        UI.openDialog(dlg[p[1]], $("btn-more"));
      });
    });

    $("btn-theme").addEventListener("click", function () {
      setTheme(window.VT_THEME ? window.VT_THEME.cycle() : "system", true);
    });
    Array.prototype.forEach.call(document.querySelectorAll("input[name='theme-choice']"), function (r) {
      r.addEventListener("change", function () { if (r.checked) setTheme(r.value, false); });
    });

    var goal = $("settings-daily-goal"), len = $("settings-session-length");
    syncSettings();
    $("settings-session-hint").textContent = "Applies to free practice and Review. Lesson practice and quizzes are always " +
      LEARN.LESSON_SESSION_LENGTH + " questions.";
    goal.addEventListener("change", function () {
      state.settings.dailyGoal = Number(goal.value);
      LEARN.reevaluateGoal(state, Date.now());
      save();
      var V = window.VT_VIEWS;
      if (currentRoute === "home" && V && V.home && ctx) V.home.show(ctx, currentRouteInfo);
    });
    len.addEventListener("change", function () { state.settings.sessionLength = Number(len.value); save(); });
    SETTING_BOXES.forEach(function (p) {
      var cb = $(p[0]);
      cb.addEventListener("change", function () { state.settings[p[1]] = cb.checked; save(); });
    });
    $("settings-welcome").addEventListener("click", function () {
      state.onboarding.welcomeDismissed = false;
      state.onboarding.typingTipSeen = false;
      save();
      $("settings-help-status").textContent = "The welcome tips will show again on Home.";
    });
  }

  /* ---------- Browse / Learn (§6.3, §8.2–§8.4) ---------- */
  var browseScope = null; // lesson id when the view is scoped (#browse/lesson/<id>), else null

  function buildBrowse() {
    var UI = window.VT_UI;
    var list = $("browse-list");
    var jump = $("browse-jump");
    var chips = el("ul", { className: "jump-list" });
    DATA.lessons.forEach(function (lesson, i) {
      var groupId = "lesson-g-" + lesson.id;
      // Foldable lesson groups: 25 lessons stay scannable. Search, the jump bar and scoped mode open them.
      var fold = el("details", { className: "lesson-fold", "data-lesson": lesson.id });
      if (i === 0) fold.open = true;
      var summary = el("summary", { className: "lesson-summary" }, [
        el("h3", { id: "lesson-h-" + lesson.id, text: "Lesson " + lesson.id + ": " + lesson.title }),
        el("span", { className: "lesson-summary-count", text: lesson.verbIds.filter(function (id) { return verbsById[id]; }).length + " verbs" })
      ]);
      fold.appendChild(summary);
      var group = el("section", { className: "lesson-group", id: groupId, "aria-labelledby": "lesson-h-" + lesson.id, "data-lesson": lesson.id }, [fold]);
      fold.appendChild(el("p", { className: "lesson-path-link" }, [
        el("a", { href: "#lesson/" + lesson.id }, [el("span", { text: "Start lesson path" }), el("span", { className: "visually-hidden", text: ": Lesson " + lesson.id }), UI.icon("arrow-right")])
      ]));
      var cards = el("div", { className: "cards" });
      lesson.verbIds.forEach(function (vid) { if (verbsById[vid]) cards.appendChild(verbCard(verbsById[vid])); });
      fold.appendChild(cards);
      list.appendChild(group);

      var chip = el("button", { type: "button", className: "chip", "data-jump": lesson.id, "aria-label": "Lesson " + lesson.id + ": " + lesson.title, text: "L" + lesson.id });
      chip.addEventListener("click", function () {
        fold.open = true;
        var h = $("lesson-h-" + lesson.id);
        group.scrollIntoView({ block: "start" });
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      });
      chips.appendChild(el("li", null, [chip]));
    });
    jump.appendChild(chips);

    $("browse-reference").addEventListener("click", function (ev) { UI.openDialog($("dlg-reference"), ev.currentTarget); });
    $("browse-studied").addEventListener("click", function () {
      if (browseScope === null) return;
      var k = String(browseScope);
      if (!state.lessons[k]) state.lessons[k] = { learned: false, practiced: false, quizBest: -1, quizPassed: false };
      state.lessons[k].learned = true;
      save();
      location.hash = "#conjugate/lesson/" + browseScope + "/path";
    });

    var search = $("browse-search");
    search.addEventListener("input", function () { filterBrowse(search.value); });
    $("browse-clear").addEventListener("click", function () {
      search.value = "";
      filterBrowse("");
      search.focus();
    });
    filterBrowse("");
  }

  /* Route hook: full view or scoped to one lesson (§4, §6.3). */
  function showBrowse(info) {
    var scoped = info && info.lessonId != null && lessonsById[info.lessonId] ? info.lessonId : null;
    browseScope = scoped;
    var lesson = scoped !== null ? lessonsById[scoped] : null;
    $("h-browse").textContent = lesson ? "Learn: Lesson " + lesson.id + ", " + lesson.title : "Browse the verbs";
    $("browse-intro").textContent = lesson
      ? "Read each table, listen to every form and notice the pattern. Then practise."
      : "All " + DATA.verbs.length + " verbs in " + DATA.lessons.length + " lessons.";
    $("browse-jump").hidden = !!lesson;
    $("browse-list").classList.toggle("is-scoped", !!lesson);
    $("browse-scoped-footer").hidden = !lesson;
    // The sticky footer's height feeds scroll-padding-bottom, so focused content scrolls clear of it (WCAG 2.4.11).
    if (lesson) document.documentElement.style.setProperty("--scoped-footer-h", $("browse-scoped-footer").offsetHeight + "px");
    if (lesson) $("browse-back").setAttribute("href", "#lesson/" + lesson.id);
    Array.prototype.forEach.call(document.querySelectorAll("#browse-list .lesson-group"), function (g) {
      g.setAttribute("data-out-of-scope", lesson && g.getAttribute("data-lesson") !== String(lesson.id) ? "true" : "false");
      if (lesson && g.getAttribute("data-lesson") === String(lesson.id)) g.querySelector("details").open = true;
    });
    filterBrowse($("browse-search").value);
  }

  /* "je " + <stem><ending> with no whitespace between the spans (§8.3). */
  function frenchCell(v, p) {
    return el("td", null, [
      frenchForm(v, p),
      el("span", { className: "pron pron-inline", text: p.pronunciation })
    ]);
  }

  /* <span lang=fr>prefix + styled form</span> (stem/ending split, or the irregular marker). */
  function frenchForm(v, p) {
    var split = LEARN.splitForm(v, p.person);
    var form = String(p.form);
    var prefix = p.french.length >= form.length && p.french.slice(-form.length) === form ? p.french.slice(0, p.french.length - form.length) : "";
    var word;
    if (!prefix && p.french !== form) {
      word = el("strong", { text: p.french });
    } else if (split.irregular) {
      word = el("strong", { className: "form-irregular" }, [split.stem + split.ending, el("span", { className: "visually-hidden", text: " (irregular form)" })]);
    } else if (split.ending) {
      word = el("strong", { className: "form-split" }, [el("span", { className: "stem", text: split.stem }), el("b", { className: "ending", text: split.ending })]);
    } else {
      word = el("strong", { text: form });
    }
    return el("span", { lang: "fr" }, [prefix, word]);
  }

  function patternLine(v) {
    var pat = LEARN.patternFor(v);
    if (pat.family === "none") return el("p", { className: "pattern-hint" }, [el("strong", { text: pat.label })]);
    var kids = [el("strong", { text: pat.label + ". " }), pat.hint || ""];
    var out = el("div", { className: "pattern-hint" }, [el("p", null, kids)]);
    if (pat.stemChanges) {
      out.appendChild(el("p", null, [
        "Stem changes: ", fr(pat.displayStems.map(function (s) { return s + "-"; }).join(" · ")),
        pat.bootNote ? " (nous and vous use a different stem)" : ""
      ]));
    }
    return out;
  }

  function typeBadges(v, noTitle) {
    var UI = window.VT_UI;
    var title = !noTitle && typeof v.type === "string" && v.type ? v.type.replace(/\bpronominal\b/gi, "Reflexive") : null;
    var box = el("span", { className: "type-badges" }, [UI.badge(LEARN.verbCategory(v), title)]);
    if (LEARN.isPronominal(v)) box.appendChild(UI.badge("reflexive", title));
    return box;
  }

  /* Full MD type string as secondary text, unless it only repeats the badge ("Irregular"). */
  function typeDetail(v) {
    var t = typeof v.type === "string" ? v.type.trim() : "";
    var labels = ["Regular", "Irregular"];
    if (!t || labels.indexOf(t) !== -1) return null;
    // Beginners see one term: the badge says "Reflexive", so the detail line does too.
    return t.replace(/\bpronominal\b/gi, "Reflexive");
  }

  function verbCard(v) {
    var UI = window.VT_UI;
    var card = el("article", { className: "verb-card", id: "verb-" + v.id, "data-verb": v.id, "aria-labelledby": "verb-h-" + v.id });
    card.appendChild(el("header", { className: "verb-head" }, [
      el("h4", { id: "verb-h-" + v.id }, [
        el("span", { className: "num", text: v.number + ". " }), fr(v.infinitive, "span"),
        el("span", { className: "meaning", text: " — " + v.meaning })
      ]),
      typeBadges(v),
      listenButton(v.infinitive, v.id + "|inf"),
      el("p", { className: "pron" }, [el("em", { text: v.pronunciation })])
    ]));
    if (typeDetail(v)) card.appendChild(el("p", { className: "type-detail", text: "Type: " + typeDetail(v) }));
    card.appendChild(patternLine(v));
    card.appendChild(el("p", { className: "split-legend", hidden: true }, [
      "Key: ", el("span", { lang: "fr" }, [el("span", { className: "stem", text: "parl" }), el("b", { className: "ending", text: "ons" })]),
      " = stem · ", el("strong", { text: "ending" }), ". A dotted underline marks an irregular form."
    ]));

    var body = el("tbody", null, LEARN.personsOf(v).map(function (person) {
      var p = row(v, person);
      return el("tr", null, [
        frenchCell(v, p),
        el("td", { className: "pron pron-col", text: p.pronunciation }),
        el("td", { text: p.english }),
        el("td", { className: "listen-cell" }, [listenButton(p.french, v.id + "|" + p.person, { compact: true })])
      ]);
    }));
    card.appendChild(tableRegion("Present tense of " + v.infinitive, el("table", { className: "conj-table" }, [
      el("caption", null, ["Present tense of ", fr(v.infinitive)]),
      el("thead", null, [el("tr", null, [["French"], ["Pronunciation", "pron-col"], ["English"], ["Listen"]].map(function (h) {
        return el("th", { scope: "col", className: h[1] || null, text: h[0] });
      }))]),
      body
    ])));

    function dd(item, key, aux) {
      var main = [el("strong", { lang: "fr", text: item.french })];
      if (aux) main.push(el("span", { className: "aux-chip" }, ["with ", el("strong", { lang: "fr", text: aux })]));
      main.push(listenButton(item.french, key, { compact: true }));
      return el("dd", null, [
        el("span", { className: "dd-main" }, main),
        item.pronunciation ? el("span", { className: "pron", text: item.pronunciation }) : null,
        item.english ? el("span", { className: "english", text: item.english }) : null
      ]);
    }
    var forms = [];
    if (v.past && v.past.french) forms.push(el("dt", { text: "Past" }), dd(v.past, v.id + "|past", v.past.auxiliary));
    if (v.future && v.future.french) forms.push(el("dt", { text: "Future" }), dd(v.future, v.id + "|future"));
    if (v.sentence && v.sentence.french) forms.push(el("dt", { text: "Sentence" }), dd(v.sentence, v.id + "|sentence"));
    if (forms.length) card.appendChild(el("dl", { className: "forms" }, forms));
    (v.tips || []).forEach(function (t) {
      card.appendChild(el("div", { className: "tip" }, [UI.icon("lightbulb"), el("p", null, [el("strong", { text: t.label + ": " }), el("span", { html: t.html })])]));
    });
    return card;
  }

  /* While there is a query, Browse searches every lesson, also in a lesson's scoped Learn step
     (matching out-of-scope groups are revealed with data-search-hit), and matches any form, meaning,
     type keyword or lesson number through the search index as well as the plain substring test. */
  function filterBrowse(q) {
    var needle = L.stripAccents(L.normalize(q));
    var searching = !!needle;
    var hits = searching && searchIndex ? window.VT_SEARCH.matchVerbIds(searchIndex, q) : null;
    var shown = 0, total = 0;
    var firstCard = null;
    Array.prototype.forEach.call(document.querySelectorAll("#browse-list .lesson-group"), function (group) {
      var outOfScope = group.getAttribute("data-out-of-scope") === "true";
      var eligible = searching || !outOfScope;
      var any = false;
      Array.prototype.forEach.call(group.querySelectorAll(".verb-card"), function (card) {
        var id = card.getAttribute("data-verb");
        var v = verbsById[id];
        var hay = L.stripAccents(L.normalize(v.infinitive + " " + v.meaning));
        var match = eligible && (!needle || hay.indexOf(needle) !== -1 || !!(hits && hits[id]));
        if (eligible) total += 1;
        card.hidden = !match;
        if (match) { any = true; shown += 1; if (!firstCard) firstCard = card; }
      });
      group.hidden = !any;
      group.setAttribute("data-search-hit", searching && any && outOfScope ? "true" : "false");
      if (needle && any) group.querySelector("details").open = true;
    });
    // The stem · ending legend shows on the first visible card of the view only (§6.3).
    Array.prototype.forEach.call(document.querySelectorAll("#browse-list .split-legend"), function (p) {
      p.hidden = !firstCard || !firstCard.contains(p);
    });
    var none = !!needle && shown === 0;
    $("browse-count").textContent = none ? "No verbs match “" + q.trim() + "”." + (searchIndex ? " Tip: press / or Ctrl+K to search everything, including topics." : "")
      : needle ? "Showing " + shown + " of " + total + " verbs" + (browseScope !== null ? " from all lessons." : ".") : "Showing all " + total + " verbs.";
    $("browse-clear").hidden = !none; // §12.4 empty state
  }

  /* ---------- mode controllers (§12.1, §12.1.1 rules 3–4): all question state lives in the session ---------- */
  function showQuestion(prefix, on) {
    $(prefix + "-area").querySelector(".question-slot").hidden = !on;
    var slot = $(prefix + "-summary");
    slot.hidden = on;
    if (on) clear(slot);
  }

  function ensureLesson(id) {
    var k = String(id);
    if (!state.lessons[k]) state.lessons[k] = { learned: false, practiced: false, quizBest: -1, quizPassed: false };
    return state.lessons[k];
  }

  /* cfg: { pick(s) → item | null, render(s), focus(), init?() }. */
  function modeView(name, prefix, cfg) {
    var view = { name: name, prefix: prefix, shownKey: null, session: null };
    view.init = cfg.init || function () { return { length: lengthFor(currentRouteInfo) }; };
    view.renderItem = function (s) {
      showQuestion(prefix, true);
      cfg.render(s);
    };
    view.next = function () {
      var s = view.session;
      showQuestion(prefix, true);
      var item = cfg.pick(s);
      if (!item) return;
      s.lastKey = item.key;
      s.current = item;
      window.VT_SESSION.resetUi(s);
      cfg.render(s);
    };
    view.focus = cfg.focus;
    view.advance = function () {
      var s = view.session;
      window.VT_SESSION.advance(s, {
        onNext: function () { view.next(); cfg.focus(); },
        onDone: function () { showSummary(view, s); }
      });
    };
    view.restart = function () {
      view.session = window.VT_SESSION.restart(view.shownKey, view.init);
      view.next();
      cfg.focus();
    };
    return view;
  }

  /* onDone (§12.1 rule 4): path updates once per finished session, then the summary card. */
  function showSummary(view, s) {
    var info = currentRouteInfo;
    var lesson = info.lessonId != null ? lessonsById[info.lessonId] : null;
    var c = { dailyCount: LEARN.todayCount(state, Date.now()), dailyGoal: state.settings.dailyGoal, secondary: [], extra: [] };
    var reviewLink = { label: "Review these mistakes", href: "#review/session", onSameHash: route };
    var home = { label: "Back to Home", href: "#home" };
    var again = { label: "Another " + lengthFor(info), onClick: view.restart };
    if (info.path && lesson) {
      var rec = ensureLesson(lesson.id);
      if (view.name === "choice") {
        var pct = s.length ? Math.round((100 * s.correct) / s.length) : 0;
        var passed = s.length > 0 && s.correct / s.length >= LEARN.QUIZ_PASS_RATIO;
        rec.quizBest = Math.max(typeof rec.quizBest === "number" ? rec.quizBest : -1, pct);
        if (passed) rec.quizPassed = true; // never reverts
        c.quizLine = "Quiz score " + pct + "%. Pass mark " + Math.round(LEARN.QUIZ_PASS_RATIO * 100) + "%.";
        if (passed) {
          var idx = DATA.lessons.indexOf(lesson);
          var nextLesson = idx !== -1 ? DATA.lessons[idx + 1] : null;
          c.primary = nextLesson ? { label: "Next lesson", href: "#lesson/" + nextLesson.id } : home;
        } else {
          c.primary = reviewLink;
          c.secondary.push({ label: "Try the quiz again", onClick: view.restart });
        }
      } else {
        rec.practiced = true;
        c.primary = { label: "Take the quiz", href: "#choice/lesson/" + lesson.id + "/path" };
        c.extra = [
          { label: "Flashcards", href: "#flashcards/lesson/" + lesson.id },
          { label: "Sentences", href: "#sentences/lesson/" + lesson.id }
        ];
      }
      save();
    } else {
      c.primary = again;
    }
    if (s.missed.length && c.primary !== reviewLink) c.secondary.push(reviewLink);
    if (c.primary !== home) c.secondary.push(home);
    var slot = $(view.prefix + "-summary");
    clear(slot);
    var card = window.VT_UI.summaryCard(s, c);
    slot.appendChild(card);
    $(view.prefix + "-area").querySelector(".question-slot").hidden = true;
    slot.hidden = false;
    var tip = $(view.prefix + "-tip");
    if (tip) tip.hidden = true; // the typing tip doesn't apply to the summary card
    renderBar($(view.prefix + "-bar"), s);
    card.querySelector(".summary-heading").focus();
  }

  /* One-time typing tip on the first visit to a typed mode (§12.3). */
  function showTypingTip(prefix) {
    var box = $(prefix + "-tip");
    if (!box) return;
    clear(box);
    box.hidden = !!state.onboarding.typingTipSeen;
    if (box.hidden) return;
    var x = el("button", { type: "button", className: "btn-icon", "aria-label": "Dismiss tip" }, [window.VT_UI.icon("x")]);
    x.addEventListener("click", function () {
      state.onboarding.typingTipSeen = true;
      save();
      Array.prototype.forEach.call(document.querySelectorAll(".typing-tip"), function (t) { t.hidden = true; });
      var input = $(prefix + "-input");
      if (input) input.focus();
    });
    box.appendChild(el("p", null, [window.VT_UI.icon("lightbulb"), el("span", { text: "Tip: press Enter to check, Alt+H for a hint. Accent keys are below the box." })]));
    box.appendChild(x);
  }

  /* ---------- Flashcards ---------- */
  /* The deck <select> shows the route's effective deck; the other family's optgroup is disabled
     (lesson routes: verbs only; expression routes: expressions only). */
  function syncDeckSelect() {
    var sel = $("flash-deck"), verbs = $("flash-deck-verbs"), expr = $("flash-deck-expr");
    var scope = currentRouteInfo && currentRouteInfo.name === "flashcards" ? currentRouteInfo.scope : null;
    if (expr) {
      expr.hidden = !EXPR_DATA;
      expr.disabled = !EXPR_DATA || scope === "lesson";
    }
    if (verbs) verbs.disabled = scope === "expressions";
    sel.value = effectiveDeck(currentRouteInfo);
  }

  function buildFlashcards() {
    var deckSel = $("flash-deck");
    var showBtn = $("flash-show");
    var knew = $("flash-knew");
    var notYet = $("flash-notyet");
    var back = $("flash-back");
    var card = $("flash-card");
    var feedback = $("flash-feedback");
    var autoPlayNext = false; // set only around view.advance() in grade(): the audio deck plays the next card once
    syncDeckSelect();

    function items() {
      var deck = effectiveDeck(currentRouteInfo);
      if (isExprDeck(deck)) return EXPR.flashItems(EXPR_DATA, scopeThemeIds(), deck);
      var out = [];
      scopeVerbs().forEach(function (v) {
        if (deck === "conj") {
          LEARN.personsOf(v).forEach(function (p) { out.push({ key: L.itemKey(v.id, "flash-conj", p), kind: "flash", deck: deck, verb: v, person: p }); });
        } else {
          out.push({ key: L.itemKey(v.id, "flash-" + deck), kind: "flash", deck: deck, verb: v, person: null });
        }
      });
      return out;
    }

    function registerPill(e) {
      return el("span", { className: "expr-register", "data-register": e.register, text: EXPR.REGISTER_LABEL[e.register] || e.register });
    }
    function cardLine(kids) { return el("span", { className: "card-line" }, kids); }

    /* Expression decks: block lines in the #flash-extra paragraph are spans (phrasing content). */
    function renderExpr(s, front, answer) {
      var it = s.current, ui = s.ui, e = it.expr, deck = it.deck;
      var extra = $("flash-extra");
      clear(extra);
      var literal = e.literal ? cardLine(["Literally: " + e.literal]) : null;
      var register = cardLine(["Register: ", registerPill(e)]);
      var example = cardLine(["Example: ", el("span", { lang: "fr", text: e.example.fr }), " — " + e.example.en]);
      $("flash-pron").textContent = e.pron;
      if (deck === "expr-fr-en") {
        $("flash-front-label").textContent = "What does this expression mean?";
        front.setAttribute("lang", "fr");
        front.textContent = e.fr;
        answer.textContent = e.en;
        appendParts(extra, [literal, register, example].filter(Boolean));
        setListen("flash-listen-slot", EXPR.speakText(e), null);
      } else if (deck === "expr-en-fr") {
        $("flash-front-label").textContent = "How do you say this in French?";
        front.appendChild(document.createTextNode(e.en));
        front.appendChild(document.createTextNode(" "));
        front.appendChild(registerPill(e));
        var cue = $("flash-cue");
        cue.textContent = EXPR.cueText(e);
        cue.hidden = !e.cue;
        answer.appendChild(fr(e.fr));
        appendParts(extra, [example]);
        setListen("flash-listen-slot", ui.flipped ? EXPR.speakText(e) : null, null);
      } else {
        $("flash-front-label").textContent = "Listen. What does it mean?";
        front.textContent = "Press Listen (L) to hear it.";
        answer.appendChild(fr(e.fr));
        answer.appendChild(document.createTextNode(" — " + e.en));
        appendParts(extra, [literal, register].filter(Boolean));
        setListen("flash-listen-slot", EXPR.speakText(e), null);
      }
      if (autoPlayNext && deck === "expr-audio" && !ui.flipped) {
        autoPlayNext = false;
        play(EXPR.speakText(e), null);
      }
    }

    function render(s) {
      var it = s.current, ui = s.ui;
      if (!it) return;
      var v = it.verb;
      var deck = it.deck;
      var front = $("flash-front");
      clear(front);
      front.removeAttribute("lang");
      var answer = $("flash-answer");
      clear(answer);
      var cueLine = $("flash-cue");
      cueLine.textContent = "";
      cueLine.hidden = true;
      // No verb type on either face (the learner guesses it); it is shown only inside the Conjugation peek.
      if (it.expr) {
        renderExpr(s, front, answer);
      } else if (deck === "inf-meaning") {
        $("flash-front-label").textContent = "What does this verb mean?";
        front.setAttribute("lang", "fr");
        front.textContent = v.infinitive;
        answer.textContent = v.meaning;
        $("flash-pron").textContent = v.pronunciation;
        $("flash-extra").textContent = "";
        setListen("flash-listen-slot", v.infinitive, v.id + "|inf");
      } else if (deck === "meaning-inf") {
        $("flash-front-label").textContent = "Which French verb means…";
        front.textContent = v.meaning;
        answer.appendChild(fr(v.infinitive));
        $("flash-pron").textContent = v.pronunciation;
        $("flash-extra").textContent = "";
        setListen("flash-listen-slot", ui.flipped ? v.infinitive : null, v.id + "|inf");
      } else {
        var r = row(v, it.person);
        $("flash-front-label").textContent = "Conjugate in the present tense";
        front.setAttribute("lang", "fr");
        front.textContent = promptPronoun(r) + " · " + v.infinitive;
        answer.appendChild(fr(r.french));
        $("flash-pron").textContent = r.pronunciation;
        $("flash-extra").textContent = r.english;
        setListen("flash-listen-slot", r.french, v.id + "|" + r.person);
      }
      back.hidden = !ui.flipped;
      card.classList.toggle("is-flipped", ui.flipped);
      $("flash-face-front").setAttribute("aria-hidden", ui.flipped ? "true" : "false");
      showBtn.hidden = ui.flipped;
      showBtn.setAttribute("aria-expanded", ui.flipped ? "true" : "false");
      knew.hidden = !ui.flipped;
      notYet.hidden = !ui.flipped;
      if (it.expr) peek.update(null, false);
      else peek.update(v, deck === "inf-meaning" || ui.flipped);
      renderBar($("flash-bar"), s);
    }

    /* Conjugation peek: the present-tense table for the card's verb, with the verb's type as one quiet line
       above it (the card faces never show the type, so the learner can guess it first). Opens and closes ONLY
       with the "Conjugation" button (no hover or focus trigger); also closes on Escape, outside click and the
       close button, with focus back on the button. At 390px CSS shows it as a bottom sheet. Suppressed until
       the card is flipped when the front asks for the infinitive or a form (the table would give it away). */
    var peek = (function () {
      var btn = $("flash-peek-btn"), box = $("flash-peek"), body = $("flash-peek-body"), closeBtn = $("flash-peek-close");
      var verb = null, allowed = false;
      function isOpen() { return !box.hidden; }
      function fill() {
        clear(body);
        if (!verb) return;
        $("flash-peek-h").textContent = "";
        $("flash-peek-h").appendChild(document.createTextNode("Present tense of "));
        $("flash-peek-h").appendChild(fr(verb.infinitive));
        body.appendChild(el("p", { className: "peek-type", id: "flash-peek-type" }, [
          el("span", { className: "visually-hidden", text: "Type: " }), LEARN.typeLine(verb)
        ]));
        body.appendChild(tableRegion("Present tense of " + verb.infinitive, el("table", { className: "conj-table peek-table" }, [
          el("thead", null, [el("tr", null, [["French"], ["Pronunciation", "pron-col"], ["Listen"]].map(function (h) {
            return el("th", { scope: "col", className: h[1] || null, text: h[0] });
          }))]),
          el("tbody", null, LEARN.personsOf(verb).map(function (person) {
            var p = row(verb, person);
            return el("tr", null, [
              frenchCell(verb, p),
              el("td", { className: "pron pron-col", text: p.pronunciation }),
              el("td", { className: "listen-cell" }, [listenButton(p.french, verb.id + "|" + p.person, { compact: true })])
            ]);
          }))
        ])));
      }
      function open() {
        if (!allowed || !verb || isOpen()) return;
        fill();
        box.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        // 390px bottom sheet: keep the card's answer controls visible above it.
        if (window.getComputedStyle(box).position === "fixed") {
          document.documentElement.style.setProperty("--peek-h", box.offsetHeight + "px");
          var actions = btn.parentNode, r = actions.getBoundingClientRect(), top = box.getBoundingClientRect().top;
          if (r.bottom > top - 8) window.scrollBy(0, r.bottom - top + 16);
        }
      }
      function close(refocus) {
        if (!isOpen()) return;
        var inside = box.contains(document.activeElement);
        box.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        if ((refocus || inside) && !btn.hidden) btn.focus();
      }
      btn.addEventListener("click", function () {
        if (isOpen()) close(false);
        else open();
      });
      closeBtn.addEventListener("click", function () { close(true); });
      document.addEventListener("pointerdown", function (ev) {
        if (!isOpen()) return;
        var t = ev.target;
        if (t === btn || btn.contains(t) || box.contains(t)) return;
        close(false);
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape" || !isOpen() || anyDialogOpen()) return;
        ev.preventDefault();
        close(btn === document.activeElement || box.contains(document.activeElement));
      });
      return {
        /* Called on every card render. ok = the peek may show (it never reveals the answer). */
        update: function (v, ok) {
          var changed = v !== verb;
          verb = v;
          allowed = !!ok;
          btn.hidden = !allowed;
          if (!allowed || changed) close(false);
          else if (isOpen()) fill();
        },
        close: close,
        isOpen: isOpen
      };
    })();

    var view = modeView("flashcards", "flash", {
      pick: function (s) { return L.pickWeighted(items(), state.stats, Math.random, s.lastKey); },
      render: function (s) { setFeedback(feedback, "", ""); render(s); },
      focus: function () { showBtn.focus(); }
    });

    showBtn.addEventListener("click", function () {
      var s = view.session;
      if (!s || !s.current) return;
      s.ui.flipped = true;
      render(s);
      knew.focus();
    });
    function grade(ok) {
      var s = view.session;
      if (!s || !s.current || !s.ui.flipped) return;
      record(s.current.key, ok);
      window.VT_SESSION.recordResult(s, s.current, ok, false);
      autoPlayNext = true;
      view.advance();
      autoPlayNext = false;
      if (!s.done) setFeedback(feedback, ok ? "success" : "", ok ? "Marked as known. Next card." : "Marked “not yet”. You will see it again soon. Next card.");
    }
    knew.addEventListener("click", function () { grade(true); });
    notYet.addEventListener("click", function () { grade(false); });
    deckSel.addEventListener("change", function () {
      if (!deckSel.value) return;
      state.settings.flashDeck = deckSel.value;
      save();
      showMode("flashcards"); // the deck is part of the session key, so this starts a new session
    });
    return view;
  }

  /* ---------- Conjugate and Sentences (typed panels) ---------- */
  function buildTypedMode(name, prefix, family) {
    var view;
    var panel = makeTypedPanel(prefix, {
      getSession: function () { return view.session; },
      onNext: function () { view.advance(); }
    });
    view = modeView(name, prefix, {
      pick: function (s) {
        var out = [];
        scopeVerbs().forEach(function (v) {
          if (family === "sentence") { if (LEARN.hasSentence(v)) out.push(buildTypedItem(v, "sentence")); }
          else LEARN.personsOf(v).forEach(function (p) { out.push(buildTypedItem(v, "conjugate", p)); });
        });
        return L.pickWeighted(out, state.stats, Math.random, s.lastKey);
      },
      render: panel.renderItem,
      focus: panel.focusInput
    });
    return view;
  }

  /* ---------- Multiple choice ---------- */
  function choiceCandidates(type) {
    var out = [];
    scopeVerbs().forEach(function (v) {
      if (type === "form") {
        LEARN.personsOf(v).forEach(function (p) { out.push({ key: L.itemKey(v.id, "choice-form", p), verb: v, person: p }); });
      } else if (type === "sentence") {
        if (LEARN.hasSentence(v)) out.push({ key: L.itemKey(v.id, "choice-sentence"), verb: v, person: null });
      } else if (type === "aux") {
        if (LEARN.hasAux(v)) out.push({ key: L.itemKey(v.id, "choice-aux"), verb: v, person: null });
      } else {
        out.push({ key: L.itemKey(v.id, "choice-meaning"), verb: v, person: null });
      }
    });
    return out;
  }

  function buildChoice() {
    var view;
    var panel = makeChoicePanel("choice", {
      radioName: "choice",
      getSession: function () { return view.session; },
      onNext: function () { view.advance(); }
    });
    view = modeView("choice", "choice", {
      init: function () {
        var avail = LEARN.CHOICE_TYPES.filter(function (t) { return choiceCandidates(t).length > 0; });
        return { length: lengthFor(currentRouteInfo), typeOrder: LEARN.choiceTypeOrder(avail, !!currentRouteInfo.path, Math.random) };
      },
      pick: function (s) {
        var order = s.typeOrder || [];
        if (!order.length) return null;
        var type = order[s.typeIndex % order.length];
        s.typeIndex += 1;
        var c = L.pickWeighted(choiceCandidates(type), state.stats, Math.random, s.lastKey);
        return c ? buildChoiceItem(c.verb, type, c.person) : null;
      },
      render: panel.renderItem,
      focus: panel.focusFirstOption
    });
    return view;
  }

  /* ---------- Progress ---------- */
  function renderProgress() {
    var body = $("progress-body");
    clear(body);
    var UI = window.VT_UI, PATH = window.VT_PATH;
    var t = state.totals, now = Date.now();
    if (!t.answered) {
      // §12.4 empty state: nothing answered yet.
      body.appendChild(el("div", { className: "home-card empty-state" }, [
        el("p", { className: "goal-text", text: "No answers yet." }),
        el("p", { text: "Your totals, streaks and lesson progress will appear here once you start practising." }),
        el("div", { className: "actions" }, [
          el("a", { className: "btn btn-primary", href: "#home" }, [el("span", { text: "Go to Home" }), UI.icon("arrow-right")])
        ])
      ]));
      if (!STORE.isPersistent()) body.appendChild(el("p", { className: "notice", text: "Progress is only kept until you close this page (storage is blocked)." }));
      return;
    }
    var acc = Math.round((100 * t.correct) / t.answered) + "%";
    var day = LEARN.displayStreak(state, now);
    body.appendChild(el("dl", { className: "totals" }, [
      el("div", null, [el("dt", { text: "Answered" }), el("dd", { text: String(t.answered) })]),
      el("div", null, [el("dt", { text: "Accuracy" }), el("dd", { text: acc })]),
      el("div", null, [el("dt", { text: "Day streak (current/best)" }), el("dd", { text: day + " / " + state.streak.best })]),
      el("div", null, [el("dt", { text: "Correct in a row (current/best)" }), el("dd", { text: t.streak + " / " + t.bestStreak })])
    ]));

    // Last 7 days: CSS bars sized through CSSOM (CSP-safe) + a visually hidden data table (§6.7).
    var todayKey = LEARN.dayKey(new Date(now)), dayKeys = [todayKey];
    for (var i = 0; i < 6; i++) dayKeys.unshift(LEARN.prevDayKey(dayKeys[0]));
    var days = dayKeys.map(function (k) {
      var p = k.split("-");
      var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      return { key: k, name: d.toLocaleDateString("en-GB", { weekday: "long" }), count: k === todayKey ? LEARN.todayCount(state, now) : (state.history[k] || 0) };
    });
    var maxCount = days.reduce(function (m, d) { return Math.max(m, d.count); }, state.settings.dailyGoal || 1);
    body.appendChild(el("h3", { id: "prog-week-h", text: "Last 7 days" }));
    var chart = el("ol", { className: "bar-chart", "aria-hidden": "true" });
    days.forEach(function (d) {
      var bar = el("span", { className: "bar" + (d.count >= state.settings.dailyGoal ? " is-met" : "") });
      bar.style.setProperty("--h", (maxCount ? Math.round((100 * d.count) / maxCount) : 0) + "%");
      chart.appendChild(el("li", { className: "bar-day" + (d.key === todayKey ? " is-today" : "") }, [
        el("span", { className: "bar-count", text: String(d.count) }),
        el("span", { className: "bar-track" }, [bar]),
        el("span", { className: "bar-label", text: d.name.slice(0, 3) })
      ]));
    });
    body.appendChild(chart);
    body.appendChild(el("table", { className: "visually-hidden" }, [
      el("caption", { text: "Answers per day, last 7 days (daily goal " + state.settings.dailyGoal + ")" }),
      el("thead", null, [el("tr", null, [el("th", { scope: "col", text: "Day" }), el("th", { scope: "col", text: "Answers" })])]),
      el("tbody", null, days.map(function (d) {
        return el("tr", null, [el("th", { scope: "row", text: d.name + (d.key === todayKey ? " (today)" : "") }), el("td", { text: String(d.count) })]);
      }))
    ]));

    var perVerb = {};
    DATA.verbs.forEach(function (v) { perVerb[v.id] = { seen: 0, correct: 0, mastered: 0 }; });
    Object.keys(state.stats).forEach(function (k) {
      var id = k.split("|")[0];
      var s = state.stats[k];
      if (!perVerb[id]) return;
      perVerb[id].seen += s.seen;
      perVerb[id].correct += s.correct;
      if (s.box >= L.MASTERED_BOX) perVerb[id].mastered += 1;
    });

    body.appendChild(el("h3", { text: "Lessons" }));
    body.appendChild(el("p", { className: "hint", text: "An item counts as mastered after 3 correct answers in a row." }));
    var lessonList = el("ul", { className: "lesson-progress" });
    DATA.lessons.forEach(function (lesson) {
      var m = PATH.lessonMastery(ctx, lesson);
      var info = PATH.lessonSteps(ctx, lesson);
      lessonList.appendChild(el("li", { className: "progress-row" }, [
        UI.ring(m.pct, "Lesson " + lesson.id + ": " + m.pct + "% mastered"),
        el("span", { className: "progress-row-text" }, [
          el("a", { className: "text-link", href: "#lesson/" + lesson.id, text: "Lesson " + lesson.id + ": " + lesson.title }),
          el("span", { className: "lesson-card-mastered", text: m.mastered + " of " + m.total + " items mastered" }),
          PATH.stepTicks(el, info.steps)
        ])
      ]));
    });
    body.appendChild(lessonList);

    // Topic lessons: one row per topic lesson, "x of y exercises done" (done = best score of 80% or more).
    var TOP = window.VT_TOPICS, TD = window.TOPICS_DATA;
    if (TOP && TD && TD.topics && TD.topics.length) {
      body.appendChild(el("h3", { text: "Topics" }));
      body.appendChild(el("p", { className: "hint", text: "An exercise counts as done once you score " + TOP.PASS_PCT + "% or more." }));
      TD.topics.forEach(function (topic) {
        var tp = TOP.topicProgress(state, topic);
        body.appendChild(el("h4", { className: "progress-topic-h" }, [
          el("a", { className: "text-link", href: "#topics/" + topic.id, text: topic.title }),
          el("span", { className: "muted", text: " · " + tp.done + " of " + tp.total + " exercises done" })
        ]));
        body.appendChild(el("ul", { className: "topic-progress" }, topic.lessons.map(function (tl, i) {
          var lp = TOP.lessonProgress(state, topic, tl.id);
          return el("li", { className: "progress-row" }, [
            UI.ring(lp.pct, topic.title + ", lesson " + (i + 1) + ": " + lp.pct + "% done"),
            el("span", { className: "progress-row-text" }, [
              el("a", { className: "text-link", href: "#topics/" + topic.id + "/" + tl.id, text: "Lesson " + (i + 1) + ": " + tl.title }),
              el("span", { className: "lesson-card-mastered", text: lp.done + " of " + lp.total + " exercises done" })
            ])
          ]);
        })));
      });
    }

    // Everyday expressions: their own totals (they are also part of the overall Answered / Accuracy above).
    if (EXPR_DATA) {
      var xs = EXPR.stats(state, EXPR_DATA);
      body.appendChild(el("h3", { text: "Expressions" }));
      body.appendChild(el("dl", { className: "totals" }, [
        el("div", null, [el("dt", { text: "Expression answers" }), el("dd", { text: String(xs.answered) })]),
        el("div", null, [el("dt", { text: "Expression accuracy" }), el("dd", { text: xs.answered ? Math.round((100 * xs.correct) / xs.answered) + "%" : "–" })]),
        el("div", null, [el("dt", { text: "Cards mastered" }), el("dd", { text: xs.mastered + " of " + xs.total })])
      ]));
      body.appendChild(tableRegion("Accuracy by expression theme", el("table", { className: "stats-table" }, [
        el("caption", { text: "Expression flashcard answers per theme, across the three decks" }),
        el("thead", null, [el("tr", null, ["Theme", "Answered", "Correct", "Accuracy", "Mastered cards", "Practise"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
        el("tbody", null, EXPR_DATA.themes.map(function (th) {
          var p = xs.byTheme[th.id];
          return el("tr", null, [
            el("th", { scope: "row", text: th.title }),
            el("td", { text: String(p.answered) }),
            el("td", { text: String(p.correct) }),
            el("td", { text: p.answered ? Math.round((100 * p.correct) / p.answered) + "%" : "–" }),
            el("td", { text: p.mastered + " of " + p.total }),
            el("td", null, [el("a", { href: "#flashcards/expressions/" + th.id, "aria-label": "Practise " + th.title + " with flashcards", text: "Practise" })])
          ]);
        }))
      ])));
    }

    body.appendChild(el("h3", { text: "Accuracy by verb" }));
    var rows = DATA.verbs.map(function (v) {
      var p = perVerb[v.id];
      var lid = lessonOf[v.id];
      return el("tr", null, [
        el("th", { scope: "row", lang: "fr", text: v.infinitive }),
        el("td", null, [typeBadges(v, true)]),
        el("td", { text: String(p.seen) }),
        el("td", { text: String(p.correct) }),
        el("td", { text: p.seen ? Math.round((100 * p.correct) / p.seen) + "%" : "–" }),
        el("td", { text: String(p.mastered) }),
        el("td", null, [lid != null ? el("a", { href: "#conjugate/lesson/" + lid, "aria-label": "Practise " + v.infinitive + " (Lesson " + lid + ")", text: "Practise" }) : ""])
      ]);
    });
    body.appendChild(tableRegion("Accuracy by verb", el("table", { className: "stats-table" }, [
      el("caption", { text: "Answers per verb, across all practice modes" }),
      el("thead", null, [el("tr", null, ["Verb", "Type", "Answered", "Correct", "Accuracy", "Mastered items", "Practise"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
      el("tbody", null, rows)
    ])));
    if (!STORE.isPersistent()) body.appendChild(el("p", { className: "notice", text: "Progress is only kept until you close this page (storage is blocked)." }));
  }

  /* Replace the whole state (reset, import) and refresh everything that reads it. */
  function applyState(newState, message) {
    state = newState;
    save();
    buildFilter();
    Array.prototype.forEach.call(document.querySelectorAll(".tolerant-toggle"), function (o) { o.checked = state.settings.accentTolerant; });
    syncDeckSelect();
    voiceUI.reset();
    syncSettings(); // also re-applies the theme through VT_THEME.apply
    window.VT_SESSION.clearAll();
    filterKeys = [];
    PRACTICE.forEach(function (r) { if (views[r]) views[r].shownKey = null; });
    renderProgress();
    showRegistered(currentRoute); // §3.1 rule 3 (no-op unless the visible view is registered)
    renderNotices();
    setFeedback($("progress-feedback"), "success", message);
  }

  var IMPORT_ERRORS = {
    "too-large": "This file is too large to be a Verb Trainer progress export (the limit is 1 MB). Nothing was changed.",
    "not-json": "This file isn't a Verb Trainer progress export (it isn't readable JSON). Nothing was changed.",
    "not-an-export": "This file isn't a Verb Trainer progress export. Nothing was changed.",
    "unsupported-version": "This progress file comes from a newer or unknown version of the trainer, so it can't be imported. Nothing was changed.",
    "read-failed": "The file couldn't be read. Nothing was changed."
  };

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function bindBackup() {
    $("progress-export").addEventListener("click", function () {
      var now = new Date();
      var name = "french-verb-trainer-progress-" + now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" + pad2(now.getDate()) + ".json";
      var url = URL.createObjectURL(new Blob([STORE.exportText(state, now.getTime())], { type: "application/json" }));
      var a = el("a", { href: url, download: name, hidden: true });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
      setFeedback($("progress-feedback"), "success", "✓ Progress exported as " + name + ". Check your Downloads folder.");
    });
    var input = $("progress-import");
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      function fail(code) {
        setFeedback($("progress-feedback"), "error", IMPORT_ERRORS[code] || IMPORT_ERRORS["not-an-export"]);
        input.value = "";
      }
      if (!file) return;
      if (file.size > STORE.IMPORT_MAX_CHARS) { fail("too-large"); return; } // before reading anything
      var reader = new FileReader();
      reader.onerror = function () { fail("read-failed"); };
      reader.onload = function () {
        var res = STORE.parseImport(typeof reader.result === "string" ? reader.result : "");
        if (!res.ok) { fail(res.error); return; }
        input.value = "";
        if (!window.confirm("Replace your progress in this browser with the file's progress?")) {
          setFeedback($("progress-feedback"), "success", "Import cancelled. Nothing was changed.");
          return;
        }
        applyState(res.state, "✓ Progress imported.");
      };
      reader.readAsText(file);
    });
  }

  function bindReset() {
    $("progress-reset").addEventListener("click", function () {
      if (!window.confirm("Reset all progress? This clears your answers, streaks, lesson progress and settings in this browser.")) return;
      applyState(STORE.reset(), "✓ Progress has been reset.");
    });
  }

  /* ---------- Credits ---------- */
  function buildCredits() {
    var body = $("credits-body");
    var cov = window.VERB_AUDIO && window.VERB_AUDIO.coverage;
    body.appendChild(el("p", null, [
      "Verb tables, pronunciations and sentences come from ", el("span", { className: "filename", text: sourceText() }), "."
    ]));
    body.appendChild(el("p", null, [
      "Icons: ", el("a", { href: "https://lucide.dev/", text: "Lucide" }), " (ISC licence, bundled copy in ",
      el("a", { href: "licenses/LUCIDE-LICENSE.txt", text: "licenses/LUCIDE-LICENSE.txt" }), ")."
    ]));
    // Recorded voice (pre-generated synthetic speech, js/tts-manifest.js).
    var recV = SPEECH.recordedVoice(), recC = SPEECH.recordedCoverage();
    if (recV && recC && recC.recorded) {
      body.appendChild(el("h3", { text: "Recorded voice (synthetic)" }));
      body.appendChild(el("p", null, [
        "The recorded voice that Listen plays is synthetic speech, generated in advance on a computer with the text-to-speech model ",
        el("a", { href: recV.modelUrl, text: recV.model }), ", licensed under ",
        el("a", { href: recV.licenseUrl, text: recV.license }), ". It is not a recording of a person. " + recV.note + " It covers " +
        recC.recorded + " of the " + recC.total + " phrases on this site; the others, and everything on the Explain page, use your device voice. Details are in ",
        el("span", { className: "filename", text: recV.credits }), "."
      ]));
    }
    body.appendChild(el("h3", { text: "Native-speaker recordings" }));
    var keys = Object.keys(AUDIO);
    if (!keys.length) {
      body.appendChild(el("p", { text: "No native recordings are bundled. All audio uses your browser's computer voice." }));
      return;
    }
    body.appendChild(el("p", null, [
      "Recordings by volunteer speakers of ",
      el("a", { href: "https://lingualibre.org/", text: "Lingua Libre" }),
      ", hosted on ",
      el("a", { href: "https://commons.wikimedia.org/", text: "Wikimedia Commons" }),
      ". Each file keeps its original licence (CC0, CC BY or CC BY-SA). The files here are the MP3 versions that Wikimedia Commons generates from the original WAV uploads, renamed." + (cov && cov.edited ? " Recordings for Lessons 1–5 from the first download are otherwise unchanged; " + cov.edited + " recordings added later were trimmed of silence and loudness-normalised." : " The audio was not otherwise changed.") + " Items without a recording use your browser's computer voice. The full list is also in audio/CREDITS.md."
    ]));
    // Bundled zip of the clips + CREDITS.md (built by tts-tools/native-audio/build-download-zip.mjs); a plain local link.
    var dl = window.VERB_AUDIO && window.VERB_AUDIO.download;
    if (dl && dl.file) {
      body.appendChild(el("p", { className: "credits-download" }, [
        el("a", { href: dl.file, download: "native-recordings.zip", text: "Download native recordings (.zip, " + (dl.bytes / 1048576).toFixed(1) + " MB)" }),
        ". " + dl.files + " clips with CREDITS.md and the licence terms. Keep the speaker credit and licence when you reuse them."
      ]));
    }
    if (cov) {
      body.appendChild(el("p", { text: cov.files + " recordings by " + cov.speakers + " volunteer speakers (" + (cov.bytes / 1048576).toFixed(1) +
        " MB, bundled with the site). “Full phrase” recordings include the pronoun and play from the “Native speaker” button; the others say only the verb form and play from “Native speaker (word only)”. Anything without a recording uses your computer voice." }));
      var covKinds = ["inf", "forms", "past", "future", "sentences"];
      var covRow = function (label, c) {
        var phrase = covKinds.reduce(function (n, k) { return n + (c[k] ? c[k].exact : 0); }, 0);
        return el("tr", null, [el("th", { scope: "row", text: label })].concat(
          [c.inf, c.forms].map(function (x) { return el("td", { text: x.found + " / " + x.total }); }),
          [el("td", { text: String(phrase) })],
          [c.past, c.future, c.sentences].map(function (x) { return el("td", { text: x.found + " / " + x.total }); })));
      };
      body.appendChild(tableRegion("Native recording coverage", el("table", { className: "credits-table" }, [
        el("caption", { text: "Native recordings per lesson range" }),
        el("thead", null, [el("tr", null, ["Lessons", "Infinitives", "Present forms", "Full phrase", "Past", "Future", "Sentences"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
        el("tbody", null, (cov.ranges || []).map(function (r) { return covRow(r.label.replace(/^Lessons /, ""), r); }).concat([covRow("All lessons", cov)]))
      ])));
    }
    var order = {};
    DATA.verbs.forEach(function (v, i) {
      ["inf"].concat(L.PERSONS, ["past", "future", "sentence"]).forEach(function (k, j) { order[v.id + "|" + k] = i * 100 + j; });
    });
    keys.sort(function (a, b) { return order[a] - order[b]; });
    function itemLabel(k) {
      var parts = k.split("|");
      var v = verbsById[parts[0]];
      if (parts[1] === "inf") return v.infinitive;
      if (parts[1] === "past") return v.past.french;
      if (parts[1] === "future") return v.future.french;
      if (parts[1] === "sentence") return v.sentence.french;
      return row(v, parts[1]).french;
    }
    var rows = keys.map(function (k) {
      var a = AUDIO[k];
      return el("tr", null, [
        el("td", { lang: "fr", text: itemLabel(k) }),
        el("td", { lang: "fr", text: a.said }),
        el("td", { text: a.speaker }),
        el("td", null, [a.licenseUrl ? el("a", { href: a.licenseUrl, text: a.license }) : a.license]),
        el("td", null, [el("a", { href: a.source, text: a.title })])
      ]);
    });
    body.appendChild(tableRegion("Audio credits", el("table", { className: "credits-table" }, [
      el("caption", { text: "Every bundled recording, with speaker, licence and source" }),
      el("thead", null, [el("tr", null, ["Item", "Recording says", "Speaker", "Licence", "Source file"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
      el("tbody", null, rows)
    ])));
  }

  /* ---------- router ---------- */
  /* §3.1 rule 5: a view whose build/show throws shows its error state; other views keep working. */
  function viewFailed(name, err) {
    console.error("verbTrainer: view " + name + " failed", err);
    var section = $("view-" + name);
    var box = section && section.querySelector(".empty-msg");
    if (!box) return;
    clear(box);
    box.appendChild(el("p", null, ["Something went wrong showing this page. ", el("a", { href: "#home", text: "Try Home." })]));
    box.hidden = false;
  }

  function showRegistered(name) {
    var V = window.VT_VIEWS;
    if (!V || !V[name] || !ctx) return;
    var errBox = $("view-" + name) && $("view-" + name).querySelector(".empty-msg");
    if (errBox) errBox.hidden = true; // a view that renders its own empty state (Review) un-hides it in show()
    try {
      V[name].show(ctx, currentRouteInfo);
    } catch (err) {
      viewFailed(name, err);
    }
  }

  function route() {
    if (location.hash === "#main") { $("main").focus(); return; } // skip link without JS handling
    var info = LEARN.parseRoute(location.hash, lessonsById);
    if (info.redirect) history.replaceState(null, "", info.redirect);
    if (info.name === "flashcards" && info.scope === "expressions" && info.themeId &&
        !(EXPR_DATA && EXPR.index(EXPR_DATA).themeById[info.themeId])) {
      history.replaceState(null, "", "#flashcards/expressions"); // unknown theme: all expressions
      info.themeId = null;
    }
    var name = info.name;
    var first = currentRoute === null;
    currentRoute = name;
    currentRouteInfo = info;
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (s) { s.hidden = s.getAttribute("data-view") !== name; });
    var navName = NAV_OF[name] || null;
    Array.prototype.forEach.call(document.querySelectorAll("a[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === navName) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var title = name === "lesson" ? "Lesson " + info.lessonId : TITLES[name];
    document.title = title + " · French Verb Trainer";
    placeFilter(name, info);
    if (PRACTICE.indexOf(name) !== -1) showMode(name);
    if (name === "progress") renderProgress();
    if (name === "browse") showBrowse(info);
    showRegistered(name);
    var section = $("view-" + name);
    if (info.verbId) {
      // Verb deep link (§4): focus and instantly scroll to the card, also on first load.
      var card = $("verb-" + info.verbId);
      if (card && (card.hidden || card.closest(".lesson-group").hidden)) {
        // A search jump always lands on a visible card: drop a Browse filter that hides it.
        $("browse-search").value = "";
        filterBrowse("");
      }
      if (card) {
        card.setAttribute("tabindex", "-1");
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: "start" });
        return;
      }
    }
    if (!first) {
      var h = section && section.querySelector("h2");
      if (h) h.focus(); // §15.2: the view title, not on first load
    }
    if (focusImportAfterRoute) {
      focusImportAfterRoute = false;
      if (name === "progress") focusImport(); // from the "Import a backup?" note: straight to the file picker
    }
  }

  /* §7.2: a click on a nav link to the current hash fires no hashchange, so re-route here. */
  function bindNavLinks() {
    document.addEventListener("click", function (ev) {
      var a = ev.target.closest ? ev.target.closest("a[href^='#']") : null;
      if (!a || !a.closest(".top-nav, .bottom-nav, .more-list, .brand")) return;
      if (location.hash === a.getAttribute("href")) {
        ev.preventDefault();
        route();
      }
    });
  }

  /* Copy that depends on the data: verb and lesson counts, the source file name. */
  function fillDataCopy() {
    $("browse-intro").textContent = "All " + DATA.verbs.length + " verbs in " + DATA.lessons.length + " lessons.";
    $("source-file").textContent = sourceText();
  }

  /* "a.md" or "a.md and b.md" (merge-data.js lists every merged source file). */
  function sourceText() {
    var list = DATA.sources && DATA.sources.length ? DATA.sources : [DATA.source];
    return list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : String(list[0]);
  }

  function init() {
    var required = { VERB_DATA: DATA, VT_LOGIC: L, VT_STORAGE: STORE, VT_SPEECH: SPEECH, VT_LEARN: LEARN, VT_SESSION: window.VT_SESSION, VT_UI: window.VT_UI,
      VT_VIEWS: window.VT_VIEWS && window.VT_VIEWS.home && window.VT_VIEWS.review };
    var missing = Object.keys(required).filter(function (k) { return !required[k]; });
    if (missing.length) {
      var box = document.getElementById("notices");
      if (box) box.textContent = "The trainer couldn't start: a file is missing. Keep the folder together.";
      console.error("verbTrainer: missing " + missing.join(", "));
      return;
    }
    state = STORE.load();
    if (STORE.wasMigrated()) save();
    DATA.verbs.forEach(function (v) { verbsById[v.id] = v; });
    lessonsById = LEARN.buildLessonsById(DATA.lessons);
    lessonOf = LEARN.buildLessonOf(DATA.lessons, DATA.verbs);
    try {
      searchIndex = window.VT_SEARCH ? window.VT_SEARCH.buildIndex(DATA, window.TOPICS_DATA, window.VT_REFERENCE) : null;
    } catch (err) {
      searchIndex = null;
      console.error(err);
    }
    fillDataCopy();

    voiceUI = buildVoiceSettings(); // first, so Listen buttons follow the saved preferences
    buildShell();
    buildReference();
    buildBrowse();
    buildFilter();
    Array.prototype.forEach.call(document.querySelectorAll(".accent-toolbar"), buildToolbar);
    Array.prototype.forEach.call(document.querySelectorAll(".tolerant-toggle"), bindTolerant);
    views.flashcards = buildFlashcards();
    views.conjugate = buildTypedMode("conjugate", "conj", "conjugate");
    views.sentences = buildTypedMode("sentences", "sent", "sentence");
    views.choice = buildChoice();
    PRACTICE.forEach(function (r) { views[r].shownKey = null; });
    bindReset();
    bindBackup();
    buildCredits();
    renderNotices();
    renderImportHint();
    SPEECH.onVoicesChecked(renderNotices);

    // View context for the registered views (§3.1), including the panel factories and item builders (§11.3).
    ctx = {
      DATA: DATA, L: L, LEARN: LEARN, UI: window.VT_UI, SESSION: window.VT_SESSION, SPEECH: SPEECH,
      EXPRESSIONS: EXPR_DATA,
      state: function () { return state; },
      save: save,
      record: record,
      play: play, listenButton: listenButton,
      verbsById: verbsById, lessonsById: lessonsById, lessonOf: lessonOf,
      scopeVerbs: scopeVerbs, selectedVerbs: selectedVerbs, sessionKey: sessionKey, lengthFor: lengthFor,
      navigate: function (hash) { location.hash = hash; },
      go: function (hash) { if (location.hash === hash) route(); else location.hash = hash; },
      searchIndex: searchIndex, isTypingTarget: isTypingTarget, anyDialogOpen: anyDialogOpen,
      onVoiceChange: function (fn) { if (typeof fn === "function") voiceListeners.push(fn); },
      makeTypedPanel: makeTypedPanel, makeChoicePanel: makeChoicePanel,
      buildTypedItem: buildTypedItem, buildChoiceItem: buildChoiceItem,
      buildToolbar: buildToolbar, bindTolerant: bindTolerant, recordDay: recordTopicAnswer,
      filter: { summaryText: function () { return filterSummaryText({ themes: true }); } }
    };
    Object.keys(window.VT_VIEWS).forEach(function (n) {
      try { window.VT_VIEWS[n].build(ctx); } catch (err) { viewFailed(n, err); }
    });

    bindNavLinks();
    document.addEventListener("keydown", onShortcutKey);
    $("skip-link").addEventListener("click", function (ev) {
      ev.preventDefault();
      $("main").focus();
    });
    window.addEventListener("hashchange", route);
    route();
  }

  init();
})();
