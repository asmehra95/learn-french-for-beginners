/* Review my mistakes view (design §3.1, §11). Registration only at load (§3.1 rule 6).
   build(ctx) creates the two panels (§11.3); show(ctx, r) runs steps 1–6: scope chip, #review/session
   redirect, session key, frozen deck, empty state, panel switching by current.kind. */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var C = null;            // ctx, kept from build()
  var typed = null, choice = null;
  var session = null;      // the Review session shown now
  var shown = null;        // the session object the DOM currently shows
  var routeNow = null;     // the (possibly redirected) route of the last show()

  var EMPTY_TEXT = "No mistakes to review. Nice! Items you miss will appear here until you get them right three times in a row.";

  function parseKey(k) {
    var p = String(k).split("|");
    return { id: p[0], mode: p[1], person: p[2] && p[2] !== "-" ? p[2] : null };
  }

  /* §11.2: the French infinitive for a meaning (only Review asks this). */
  function meaningToInfinitive(verb) {
    var el = C.UI.el;
    var pool = C.DATA.verbs.filter(function (o) { return o.id !== verb.id; }).map(function (o) { return o.infinitive; });
    return {
      key: null, kind: "choice", verb: verb, person: null, family: "choice-infinitive",
      legendParts: ["Which French verb means ", el("strong", { text: verb.meaning }), "?"],
      options: C.L.buildChoices(verb.infinitive, pool, 4, Math.random),
      correct: verb.infinitive, isFrench: true,
      listen: { text: verb.infinitive, key: verb.id + "|inf" },
      reveal: { french: verb.infinitive, pronunciation: verb.pronunciation, english: verb.meaning }
    };
  }

  /* Map an original key to an item per the §11.2 table, recorded against that key (AC13). null = unbuildable. */
  function buildItem(origKey) {
    var k = parseKey(origKey);
    var verb = C.verbsById[k.id];
    if (!verb) return null;
    var LEARN = C.LEARN, item = null;
    var personOk = k.person != null && LEARN.personsOf(verb).indexOf(k.person) !== -1;
    switch (k.mode) {
      case "conjugate": case "flash-conj": case "choice-form":
        if (personOk) item = C.buildTypedItem(verb, "conjugate", k.person);
        break;
      case "sentence": case "choice-sentence":
        if (LEARN.hasSentence(verb)) item = C.buildTypedItem(verb, "sentence");
        break;
      case "flash-inf-meaning": case "choice-meaning":
        item = C.buildChoiceItem(verb, "meaning");
        break;
      case "flash-meaning-inf":
        item = meaningToInfinitive(verb);
        break;
      case "choice-aux":
        if (LEARN.hasAux(verb)) item = C.buildChoiceItem(verb, "aux");
        break;
      default:
        item = null; // unknown mode: skipped
    }
    if (item) item.key = origKey;
    return item;
  }

  function verbInLesson(lessonId) {
    var lesson = C.lessonsById[lessonId];
    var set = {};
    ((lesson && lesson.verbIds) || []).forEach(function (id) { set[id] = true; });
    return set;
  }

  /* Step 4: build the deck once and freeze it. Returns { length, items } for VT_SESSION.getOrStart. */
  function makeDeckFor(r) {
    return function () {
      var keys;
      if (r.scope === "session") {
        keys = C.SESSION.lastMissed.filter(function (k) { return !!C.verbsById[parseKey(k).id]; });
      } else {
        keys = C.LEARN.mistakesDeck(C.state(), C.DATA);
        if (r.lessonId != null) {
          var inLesson = verbInLesson(r.lessonId);
          keys = keys.filter(function (k) { return inLesson[parseKey(k).id]; });
        }
      }
      keys = keys.filter(function (k) { return !!buildItem(k); });
      keys = keys.slice(0, Math.max(1, Number(C.state().settings.sessionLength) || 10));
      keys = C.L.shuffle(keys, Math.random);
      return { length: keys.length, items: keys };
    };
  }

  function sessionKeyFor(r) {
    var k = "review|" + (r.lessonId != null ? "lesson:" + r.lessonId : r.scope);
    if (r.scope === "session") k += "|" + C.SESSION.lastMissedGen;
    return k;
  }

  function showEmpty() {
    var UI = C.UI, el = UI.el;
    $("review-area").hidden = true;
    var empty = $("review-empty");
    UI.clear(empty);
    empty.appendChild(el("p", { text: EMPTY_TEXT }));
    empty.appendChild(el("a", { className: "btn btn-primary", href: "#practice" }, [el("span", { text: "Practise something new" }), UI.icon("arrow-right")]));
    empty.hidden = false;
  }

  /* Step 6: show the panel for current.kind, hide the other, render. */
  function renderCurrent(s, focus) {
    if (!s.current) s.current = buildItem(s.items[s.index]);
    var isTyped = !!s.current && s.current.kind === "typed";
    $("rev-summary").hidden = true;
    $("rev-typed").hidden = !isTyped;
    $("rev-choice").hidden = isTyped;
    if (!s.current) return;
    if (isTyped) { typed.renderItem(s); if (focus) typed.focusInput(); }
    else { choice.renderItem(s); if (focus) choice.focusFirstOption(); }
  }

  function renderNextItem(s) {
    s.current = null;
    C.SESSION.resetUi(s);
    renderCurrent(s, true);
  }

  function showSummary(s) {
    var LEARN = C.LEARN, state = C.state();
    $("rev-typed").hidden = true;
    $("rev-choice").hidden = true;
    var r = routeNow;
    var left = LEARN.mistakesDeck(state, C.DATA);
    if (r.lessonId != null) {
      var inLesson = verbInLesson(r.lessonId);
      left = left.filter(function (k) { return inLesson[parseKey(k).id]; });
    }
    var home = { label: "Back to Home", href: "#home" };
    var c = { dailyCount: LEARN.todayCount(state, Date.now()), dailyGoal: state.settings.dailyGoal, secondary: [], extra: [] };
    if (left.length) {
      if (r.scope === "session") c.primary = { label: "Keep going", href: "#review" };
      else c.primary = { label: "Keep going", onClick: function () { C.SESSION.drop(s.key); show(C, r); } };
      c.secondary.push(home);
    } else {
      c.primary = home;
    }
    var slot = $("rev-summary");
    C.UI.clear(slot);
    var card = C.UI.summaryCard(s, c);
    slot.appendChild(card);
    slot.hidden = false;
    C.UI.sessionBar($("rev-bar"), s);
    card.querySelector(".summary-heading").focus();
  }

  function onNext() {
    if (!session) return;
    C.SESSION.advance(session, { onNext: renderNextItem, onDone: showSummary });
  }

  function show(ctx, route) {
    C = ctx;
    var r = route;
    // Step 2: nothing was missed last session → the whole deck.
    if (r.scope === "session" && C.SESSION.lastMissed.length === 0) {
      history.replaceState(null, "", "#review");
      r = { name: "review", scope: "deck", lessonId: null };
    }
    routeNow = r;
    // Step 1: scope chip.
    var chip;
    if (r.scope === "session") chip = "Mistakes from your last session";
    else if (r.lessonId != null) chip = "Lesson " + r.lessonId + ": " + C.lessonsById[r.lessonId].title;
    else chip = "All lessons";
    $("review-scope").textContent = chip;
    // Steps 3–4.
    var k = sessionKeyFor(r);
    var s = C.SESSION.getOrStart(k, makeDeckFor(r));
    // Step 5: an empty deck is never kept.
    if (s.length === 0) {
      C.SESSION.drop(k);
      session = null;
      shown = null;
      showEmpty();
      return;
    }
    $("review-empty").hidden = true;
    $("review-area").hidden = false;
    session = s;
    if (s.resumed && shown === s) return; // the DOM already shows this item (keeps a half-typed answer)
    shown = s;
    renderCurrent(s, false);
  }

  window.VT_VIEWS.review = {
    build: function (ctx) {
      C = ctx;
      typed = ctx.makeTypedPanel("rev", {
        ids: { form: "rev-typed", feedback: "rev-typed-feedback" },
        getSession: function () { return session; },
        onNext: onNext
      });
      choice = ctx.makeChoicePanel("rev", {
        ids: { form: "rev-choice", legend: "rev-legend", options: "rev-options", feedback: "rev-choice-feedback",
          check: "rev-choice-check", next: "rev-choice-next", listen: "rev-choice-listen-slot" },
        radioName: "rev-choice-opt",
        getSession: function () { return session; },
        onNext: onNext
      });
    },
    show: show
  };
})();
