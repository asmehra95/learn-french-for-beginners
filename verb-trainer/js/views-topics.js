/* Topics view: the grammar topic lessons from topics-data.js (TOPICS_DATA v2), rendered with the
   redesign's components (lesson cards, rings, answer form, accent toolbar, feedback panel, summary card).
   Routes: #topics (overview), #topics/<topicId> (lessons + exercises), #topics/<topicId>/<lessonId>
   (same page, scrolled to that lesson), #topics/<topicId>/<exerciseId> (one item at a time).
   All topic strings are plain text and go through textContent. Registration only at load (§3.1 rule 6). */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var C = null;
  var runs = {};       // exerciseId -> run (in memory, like practice sessions)
  var EN_CHOICES = { formal: true, standard: true, casual: true }; // Q1-A asks for the register in English
  var KIND_TEXT = { choice: "Multiple choice", fill: "Fill in the gap", transform: "Rewrite" };

  function T() { return window.VT_TOPICS; }
  function DATA() { return window.TOPICS_DATA; }
  function el(tag, attrs, kids) { return C.UI.el(tag, attrs, kids); }
  function lessonIndex(topic, lessonId) {
    for (var i = 0; i < topic.lessons.length; i++) if (topic.lessons[i].id === lessonId) return i;
    return -1;
  }
  function setHeading(text) {
    var h = $("h-topics");
    h.textContent = text;
    document.title = text + " · French Verb Trainer";
  }
  function pdfLinks(topic) {
    return el("p", { className: "topic-pdfs" }, [
      "Printable: ",
      el("a", { href: "../" + topic.guidePdf, text: "guide (PDF)" }), " · ",
      el("a", { href: "../" + topic.workbookPdf, text: "workbook with answer key (PDF)" })
    ]);
  }
  function statusText(state, ex) {
    var r = state.topics && state.topics[ex.id];
    if (!r) return "Not started";
    return (T().isDone(state, ex.id) ? "Done ✓ · " : "Tried · ") + "best " + r.best + "%";
  }

  /* Prompt text with the [bracketed] target marked (Q3-C) and ___ shown as a visible gap. */
  function promptNode(item, id) {
    var text = String(item.prompt || "");
    var p = el("p", { className: "prompt topic-prompt", id: id, lang: promptLang(text) });
    var re = /\[([^\]]+)\]|___/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1] != null) p.appendChild(el("mark", { className: "topic-target", text: m[1] }));
      else p.appendChild(el("span", { className: "topic-gap" }, [el("span", { className: "visually-hidden", text: "blank" })]));
      last = re.lastIndex;
    }
    if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
    return p;
  }

  /* Only the "Translate each question" items (Q4-B, "What are they eating? (manger, ils)") have English
     prompts; glosses in parentheses are ignored when deciding. */
  var ENGLISH_PROMPT = /\b(what|who|which|how|why|where|when|do|does|is|are|you|they|he|she|the)\b/i;
  function promptLang(text) {
    return ENGLISH_PROMPT.test(String(text || "").replace(/\([^)]*\)/g, "")) ? "en" : "fr";
  }

  /* "To review" entry for a missed item: the prompt (gap as "…", [target] brackets kept so "ask about the
     [bracketed] part" items keep their cue), its language, the answer and what the learner wrote ("" after
     Show answer). ui.js summaryCard renders prompt → answer, then "You wrote". */
  function missedDisplay(item, given) {
    var wrote = (given || []).map(function (g) { return String(g == null ? "" : g).trim(); }).filter(Boolean).join(" / ");
    return {
      french: T().answerText(item), pronunciation: "", audioKey: null,
      prompt: String(item.prompt || "").replace(/___/g, "…"),
      promptLang: promptLang(item.prompt),
      wrote: wrote
    };
  }

  /* What the Listen button says: the completed sentence or the answer (recorded voice or device voice). */
  function speakText(item) { return T().speakText(item); }

  /* ---------- overview and topic pages ---------- */
  function topicCard(state, topic) {
    var tp = T().topicProgress(state, topic);
    var next = T().suggestExercise(state, topic);
    return el("li", null, [
      el("a", { className: "topic-card" + (tp.done === tp.total && tp.total ? " is-complete" : ""), href: "#topics/" + topic.id }, [
        el("span", { className: "lesson-card-top" }, [el("span", { className: "lesson-card-num", text: "Topic " + topic.number })]),
        el("h3", { className: "lesson-card-title", text: topic.title }),
        el("span", { className: "lesson-card-verbs", text: topic.lessons.length + " lessons, " + tp.total + " exercises" +
          (next && tp.done < tp.total ? ". Next: " + next.title : "") }),
        el("span", { className: "lesson-card-progress" }, [
          C.UI.ring(tp.pct, tp.pct + "% done"),
          el("span", { className: "lesson-card-mastered", text: tp.done + " of " + tp.total + " exercises done" })
        ])
      ])
    ]);
  }

  function showOverview(body) {
    var state = C.state();
    setHeading("Topics");
    body.appendChild(el("p", { className: "intro", text: "Grammar lessons beyond single verbs. Each topic has short lessons with exercises you can check here, plus a printable guide and workbook." }));
    body.appendChild(el("ul", { className: "lesson-grid topic-grid" }, DATA().topics.map(function (t) { return topicCard(state, t); })));
  }

  function showTopic(body, topic, focusLessonId) {
    var state = C.state(), TOP = T();
    setHeading(topic.title);
    body.appendChild(el("p", null, [el("a", { className: "text-link", href: "#topics", text: "← All topics" })]));
    var tp = TOP.topicProgress(state, topic);
    var next = TOP.suggestExercise(state, topic);
    body.appendChild(el("div", { className: "home-card lesson-head" }, [
      el("div", { className: "goal-row" }, [
        C.UI.ring(tp.pct, tp.pct + "% done"),
        el("div", null, [
          el("p", { className: "goal-text", text: tp.done + " of " + tp.total + " exercises done" }),
          el("p", { className: "muted", text: "An exercise counts as done once you score " + TOP.PASS_PCT + "% or more." })
        ])
      ]),
      next ? el("div", { className: "actions" }, [
        el("a", { className: "btn btn-primary", href: "#topics/" + topic.id + "/" + next.id }, [
          el("span", { text: (tp.done ? "Continue: " : "Start: ") + next.id + " " + next.title }), C.UI.icon("arrow-right")
        ])
      ]) : null,
      pdfLinks(topic)
    ]));
    var focusNode = null;
    topic.lessons.forEach(function (lesson, i) {
      var lp = TOP.lessonProgress(state, topic, lesson.id);
      var hid = "topic-lesson-" + lesson.id;
      var exs = TOP.lessonExercises(topic, lesson.id);
      var sec = el("section", { className: "home-card topic-lesson", "aria-labelledby": hid }, [
        el("p", { className: "home-kicker", text: "Lesson " + (i + 1) + " · " + lp.done + " of " + lp.total + " exercises done" }),
        el("h3", { id: hid, tabindex: "-1", text: lesson.title }),
        lesson.canDo && lesson.canDo.length ? el("details", { className: "topic-cando" }, [
          el("summary", { text: "What you'll be able to do" }),
          el("ul", null, lesson.canDo.map(function (c) { return el("li", { text: c }); }))
        ]) : null,
        exs.length ? el("ul", { className: "exercise-list" }, exs.map(function (ex) {
          var done = TOP.isDone(state, ex.id);
          return el("li", null, [
            el("a", { className: "exercise-link" + (done ? " is-done" : ""), href: "#topics/" + topic.id + "/" + ex.id }, [
              el("span", { className: "exercise-id", text: ex.id }),
              el("span", { className: "exercise-title", text: ex.title }),
              el("span", { className: "exercise-meta", text: KIND_TEXT[ex.kind] + " · " + ex.items.length + " items · " + statusText(state, ex) })
            ])
          ]);
        })) : el("p", { className: "muted", text: "This lesson's exercises are in the printable workbook." })
      ]);
      body.appendChild(sec);
      if (lesson.id === focusLessonId) focusNode = sec.querySelector("h3");
    });
    return focusNode;
  }

  /* ---------- exercise player ---------- */
  function freshUi(item) {
    return { answered: false, shown: false, result: null, selected: -1, inputs: (item && item.parts ? item.parts : [0]).map(function () { return ""; }) };
  }
  function getRun(ex) {
    var r = runs[ex.id];
    if (!r || r.done) {
      r = runs[ex.id] = { key: "topic|" + ex.id, exId: ex.id, index: 0, length: ex.items.length, correct: 0, missed: [], done: false, ui: freshUi(ex.items[0]) };
    }
    return r;
  }

  function showExercise(body, topic, ex) {
    var li = lessonIndex(topic, ex.lesson);
    setHeading(ex.title);
    body.appendChild(el("p", null, [el("a", { className: "text-link", href: "#topics/" + topic.id + "/" + ex.lesson, text: "← " + topic.title + ", lesson " + (li + 1) })]));
    body.appendChild(el("p", { className: "scope-chip", text: "Exercise " + ex.id + " · " + KIND_TEXT[ex.kind] + " · same numbering as the workbook" }));
    body.appendChild(el("p", { className: "intro", text: ex.instructions }));
    if (ex.wordBank && ex.wordBank.length) {
      body.appendChild(el("div", { className: "word-bank", role: "group", "aria-labelledby": "topic-wb-h" }, [
        el("p", { className: "word-bank-h", id: "topic-wb-h", text: "Word box (use each once)" }),
        el("ul", null, ex.wordBank.map(function (w) { return el("li", { lang: "fr", text: w }); }))
      ]));
    }
    var area = el("div", { className: "practice-area", id: "topic-area" }, [
      el("div", { className: "session-bar", id: "topic-bar" }),
      el("div", { className: "question-slot", id: "topic-slot" }),
      el("div", { className: "summary-slot", id: "topic-summary", hidden: true })
    ]);
    body.appendChild(area);
    var run = getRun(ex);
    renderItem(topic, ex, run);
  }

  function renderBar(run) {
    var bar = $("topic-bar");
    C.UI.sessionBar(bar, run);
    var keys = bar.querySelector(".session-keys");
    if (keys) keys.hidden = true; // single-key shortcuts don't apply to topic exercises
  }

  function renderItem(topic, ex, run, focus) {
    var TOP = T(), UI = C.UI, state = C.state();
    var item = ex.items[run.index], ui = run.ui;
    var slot = $("topic-slot");
    UI.clear(slot);
    $("topic-summary").hidden = true;
    slot.hidden = false;
    renderBar(run);
    var form = el("form", { className: "answer-form", id: "topic-form", novalidate: true });
    var inputs = [];
    if (item.choices) {
      var choiceLang = item.choices.every(function (o) { return EN_CHOICES[o]; }) ? null : "fr";
      var fs = el("fieldset", { className: "choices" }, [el("legend", null, [promptNode(item, "topic-prompt")])]);
      item.choices.forEach(function (o, i) {
        var id = "topic-opt-" + i;
        var input = el("input", { type: "radio", name: "topic-opt", id: id, value: String(i) });
        input.checked = ui.selected === i;
        input.disabled = ui.answered;
        input.addEventListener("change", function () { if (input.checked) ui.selected = i; });
        var box = el("div", { className: "choice" });
        var mark = el("span", { className: "mark" }), sr = "";
        if (ui.answered) {
          var isAns = TOP.acceptedFor(item).indexOf(o) !== -1;
          if (isAns) { box.classList.add("is-correct"); mark.appendChild(UI.icon("check")); sr = " (correct answer)"; }
          else if (i === ui.selected) { box.classList.add("is-wrong"); mark.appendChild(UI.icon("x")); sr = " (your answer)"; }
        }
        box.appendChild(input);
        box.appendChild(el("label", { "for": id }, [
          el("span", { className: "choice-key", "aria-hidden": "true", text: String(i + 1) }), mark,
          el("span", { lang: choiceLang, text: o }), sr ? el("span", { className: "visually-hidden", text: sr }) : null
        ]));
        fs.appendChild(box);
      });
      form.appendChild(fs);
    } else {
      form.appendChild(promptNode(item, "topic-prompt"));
      var labels = TOP.hasParts(item) ? item.parts.map(function (p) { return p.label; }) : [ex.kind === "fill" ? "Missing words" : "Your answer"];
      labels.forEach(function (lab, i) {
        var id = "topic-in-" + i;
        var input = el("input", { type: "text", id: id, className: "answer-input", lang: "fr", maxlength: "160", autocomplete: "off",
          autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-describedby": "topic-prompt" });
        input.value = ui.inputs[i] || "";
        input.disabled = ui.answered;
        input.addEventListener("input", function () { ui.inputs[i] = input.value; });
        input.addEventListener("focus", function () {
          var bar = $("topic-toolbar");
          if (bar) { bar.setAttribute("data-for", id); bar.setAttribute("aria-controls", id); }
        });
        inputs.push(input);
        form.appendChild(el("div", { className: "topic-field" }, [el("label", { "for": id, text: lab }), input]));
      });
      if (!ui.answered) {
        var bar = el("div", { className: "accent-toolbar", id: "topic-toolbar", role: "toolbar", "aria-label": "Insert accented letter", "aria-controls": "topic-in-0", "data-for": "topic-in-0" });
        form.appendChild(bar);
        C.buildToolbar(bar);
        var cb = el("input", { type: "checkbox", id: "topic-tolerant", className: "tolerant-toggle" });
        form.appendChild(el("div", { className: "field-check" }, [cb, el("label", { "for": "topic-tolerant", text: "Accent-tolerant (accept answers typed without accents)" })]));
        C.bindTolerant(cb);
      }
    }
    var check = el("button", { type: "submit", className: "btn btn-primary", hidden: ui.answered, text: "Check" });
    var showBtn = el("button", { type: "button", className: "btn", hidden: ui.answered }, [UI.icon("eye"), el("span", { text: "Show answer" })]);
    var next = el("button", { type: "button", className: "btn btn-primary", hidden: !ui.answered, text: run.index + 1 >= run.length ? "See results" : "Next →" });
    var listenSlot = el("span", { className: "listen-slot" });
    form.appendChild(el("div", { className: "actions" }, [check, item.choices ? null : showBtn, next, listenSlot]));
    var live = el("p", { className: "feedback", role: "status", "aria-live": "polite" });
    form.appendChild(live);
    var fbSlot = el("div", { className: "fb-slot" });
    form.appendChild(fbSlot);
    slot.appendChild(form);

    if (ui.answered && ui.result) {
      var fp = feedback(item, ui, run.index);
      fbSlot.appendChild(fp.node);
      live.className = "feedback visually-hidden " + (ui.result.correct ? "is-success" : "is-error");
      live.textContent = fp.live;
      if (!TOP.hasParts(item)) listenSlot.appendChild(C.listenButton(speakText(item), null));
    }

    function grade(shown) {
      var vals = item.choices ? (ui.selected >= 0 ? item.choices[ui.selected] : null) : inputs.map(function (x) { return x.value; });
      var g = shown ? { correct: false, parts: [] } : TOP.gradeItem(item, vals, { accentTolerant: state.settings.accentTolerant });
      ui.answered = true;
      ui.shown = !!shown;
      ui.result = g;
      ui.given = Array.isArray(vals) ? vals.slice() : [vals];
      if (!item.choices) ui.inputs = vals.slice(); // keep what was checked visible even without input events
      C.recordDay(g.correct);
      if (g.correct) run.correct += 1;
      else run.missed.push({ key: item.id, hinted: false, display: missedDisplay(item, shown ? [] : ui.given) });
      renderItem(topic, ex, run);
      var nb = $("topic-form").querySelector(".btn-primary:not([hidden])");
      if (nb) nb.focus();
      var panel = $("topic-form").querySelector(".fb-slot");
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (ui.answered) { onNext(topic, ex, run); return; }
      if (item.choices) {
        var picked = form.querySelector("input[name='topic-opt']:checked");
        if (picked) ui.selected = Number(picked.value);
        if (ui.selected < 0) { setLive(live, "Choose an answer first, then press Check."); return; }
      } else if (!inputs.some(function (x) { return x.value.trim(); })) {
        setLive(live, TOP.hasParts(item) ? "Type your answers first, then press Check." : "Type an answer first, then press Check.");
        if (inputs[0]) inputs[0].focus();
        return;
      }
      grade(false);
    });
    showBtn.addEventListener("click", function () { if (!ui.answered) grade(true); });
    next.addEventListener("click", function () { if (ui.answered) onNext(topic, ex, run); });
    if (focus) {
      var first = item.choices ? form.querySelector("input[type=radio]") : inputs[0];
      if (first) first.focus();
    }
  }

  function setLive(node, text) {
    node.className = "feedback is-error";
    node.textContent = text;
  }

  /* Feedback panel: the shared §9.3 panel; for multi-part items one line per part with text status. */
  function feedback(item, ui, index) {
    var TOP = T(), UI = C.UI, r = ui.result;
    var note = null;
    (r.parts || []).forEach(function (p) { if (!note && p.note) note = p.note; });
    var cls = null;
    if (r.correct && note === "accents") {
      cls = { category: "accent-note", message: "Correct. Watch the accents next time.", parts: ["Correct. Watch the accents: ", { text: TOP.answerText(item), fr: true, strong: true }] };
    } else if (!r.correct && note === "accents") {
      cls = { category: "accents", message: "Only the accents are off.", parts: ["Only the accents are off. Turn on accent-tolerant mode to accept answers without accents."] };
    } else if (!r.correct && note === "hyphens") {
      cls = { category: "hyphens", message: "Check the hyphens.", parts: ["Almost: check the hyphens, as in ", { text: "est-ce que", fr: true }, " and ", { text: "parle-t-il", fr: true }, "."] };
    }
    var formNode;
    if (TOP.hasParts(item)) {
      formNode = el("ul", { className: "part-results" }, item.parts.map(function (p, i) {
        var pr = r.parts[i];
        var ok = !!(pr && pr.correct);
        return el("li", { className: ok ? "is-ok" : "is-off" }, [
          el("span", { className: "part-status", text: ui.shown ? p.label + ": " : (ok ? "✓ " : "✗ ") + p.label + ": " }),
          el("strong", { lang: "fr", text: p.answer }),
          C.listenButton(p.answer, null, { compact: true }),
          !ok && !ui.shown && ui.given[i] ? el("span", { className: "part-given" }, [" You wrote: ", el("span", { lang: "fr", text: ui.given[i] })]) : null
        ]);
      }));
    } else {
      var alts = item.accepted && item.accepted.length ? item.accepted : null;
      var ansLang = item.choices && item.choices.every(function (o) { return EN_CHOICES[o]; }) ? null : "fr";
      formNode = el("span", null, [
        el("strong", { lang: ansLang, text: item.answer }),
        alts ? el("span", { className: "fb-alts" }, [" Also accepted: ", el("span", { lang: "fr", text: alts.join(" · ") })]) : null
      ]);
    }
    var label = TOP.answerText(item);
    var res = { correct: r.correct, exact: !note, shown: ui.shown, hinted: false, classification: cls };
    return UI.feedbackPanel(res, item, { index: index, answer: { french: label, formNode: formNode } });
  }

  function onNext(topic, ex, run) {
    run.index += 1;
    if (run.index >= run.length) { finish(topic, ex, run); return; }
    run.ui = freshUi(ex.items[run.index]);
    renderItem(topic, ex, run, true);
  }

  function finish(topic, ex, run) {
    var TOP = T(), state = C.state();
    run.done = true;
    var rec = TOP.recordRun(state, ex.id, run.correct, run.length);
    C.save();
    $("topic-slot").hidden = true;
    var nextEx = TOP.nextExercise(topic, ex.id);
    var c = {
      dailyCount: C.LEARN.todayCount(state, Date.now()), dailyGoal: state.settings.dailyGoal,
      quizLine: "Best score for " + ex.id + ": " + rec.best + "%" + (TOP.isDone(state, ex.id) ? " (done ✓)" : " (" + TOP.PASS_PCT + "% marks it done)"),
      secondary: [], extra: []
    };
    var again = { label: "Try again", onClick: function () { delete runs[ex.id]; show(C, { topicId: topic.id, exerciseId: ex.id }); } };
    if (nextEx) {
      c.primary = { label: "Next exercise: " + nextEx.id, href: "#topics/" + topic.id + "/" + nextEx.id };
      c.secondary.push(again);
    } else {
      c.primary = again;
    }
    c.secondary.push({ label: "Back to " + topic.title, href: "#topics/" + topic.id + "/" + ex.lesson });
    var slot = $("topic-summary");
    C.UI.clear(slot);
    var card = C.UI.summaryCard(run, c);
    slot.appendChild(card);
    slot.hidden = false;
    renderBar(run);
    card.querySelector(".summary-heading").focus();
  }

  function show(ctx, r) {
    C = ctx;
    var body = $("topics-body");
    var D = DATA();
    C.UI.clear(body);
    if (!T() || !D || !D.topics || !D.topics.length) {
      setHeading("Topics");
      body.appendChild(el("p", { className: "notice", text: "The topic lessons are missing. Keep the js folder together (topics-data.js)." }));
      return;
    }
    var topic = r.topicId ? T().topicById(D, r.topicId) : null;
    if (r.topicId && !topic) {
      history.replaceState(null, "", "#topics");
      showOverview(body);
      return;
    }
    if (!topic) { showOverview(body); return; }
    var ex = r.exerciseId ? T().exerciseById(topic, r.exerciseId) : null;
    if (ex) {
      showExercise(body, topic, ex); // a half-finished run resumes; a finished one starts again
      return;
    }
    var lessonId = r.exerciseId && lessonIndex(topic, r.exerciseId) !== -1 ? r.exerciseId : null;
    if (r.exerciseId && !lessonId) history.replaceState(null, "", "#topics/" + topic.id);
    var target = showTopic(body, topic, lessonId);
    if (target) {
      // Deep link to a lesson: move focus there after the router's heading focus.
      setTimeout(function () { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" }); }, 0);
    }
  }

  window.VT_VIEWS.topics = { build: function (ctx) { C = ctx; }, show: show };
})();
