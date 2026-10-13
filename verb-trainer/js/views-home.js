/* Home, Lesson path and Practice hub views (design §3.1, §6.1, §6.2, §6.4).
   Registration only at load (§3.1 rule 6): no DOM access until app.js calls build(ctx) / show(ctx, routeInfo).
   Every show() redraws from ctx.state(), so Home is current after each answer and after Reset (plan item 17). */
(function () {
  "use strict";

  window.VT_VIEWS = window.VT_VIEWS || {};

  function $(id) { return document.getElementById(id); }

  /* Lesson verbs that exist in the data (unknown ids are skipped, §8.0). */
  function lessonVerbs(ctx, lesson) {
    return lesson.verbIds.map(function (id) { return ctx.verbsById[id]; }).filter(Boolean);
  }

  function lessonRecord(ctx, id) {
    var r = ctx.state().lessons[String(id)];
    return r || { learned: false, practiced: false, quizBest: -1, quizPassed: false };
  }

  /* Mastered items of a lesson: keys the builders generate whose box reached MASTERED_BOX (§6.1 item 6). */
  function lessonMastery(ctx, lesson) {
    var stats = ctx.state().stats, total = 0, mastered = 0;
    lessonVerbs(ctx, lesson).forEach(function (v) {
      ctx.LEARN.itemsFor(v).forEach(function (k) {
        total += 1;
        if (stats[k] && stats[k].box >= ctx.L.MASTERED_BOX) mastered += 1;
      });
    });
    return { total: total, mastered: mastered, pct: total ? Math.round((100 * mastered) / total) : 0 };
  }

  /* The three path steps of a lesson with their constant-derived copy (§4, §6.2). */
  function lessonSteps(ctx, lesson) {
    var LEARN = ctx.LEARN, n = LEARN.LESSON_SESSION_LENGTH, rec = lessonRecord(ctx, lesson.id);
    var steps = [
      { name: "Learn", icon: "book-open", done: rec.learned, text: "Read the tables, listen to every form, notice the pattern.", href: "#browse/lesson/" + lesson.id },
      { name: "Practice", icon: "pencil", done: rec.practiced, text: n + " quick conjugation questions.", href: "#conjugate/lesson/" + lesson.id + "/path" },
      { name: "Quiz", icon: "list", done: rec.quizPassed, text: n + " mixed questions. Score " + Math.ceil(LEARN.QUIZ_PASS_RATIO * n) + " or more to complete the lesson.", href: "#choice/lesson/" + lesson.id + "/path" }
    ];
    if (rec.quizBest >= 0) steps[2].text += " Best: " + rec.quizBest + "%.";
    // Recommended = the first step not done, in order (same rule as suggestNext rule 3).
    var rec2 = null;
    if (!rec.quizPassed) {
      for (var i = 0; i < steps.length; i++) { if (!steps[i].done) { rec2 = i; break; } }
    }
    steps.forEach(function (s, i) { s.recommended = i === rec2; });
    return { steps: steps, record: rec };
  }

  /* "Learn ✓ Practice ✓ Quiz –" as text, so the meaning never depends on colour. */
  function stepTicks(el, steps) {
    return el("span", { className: "step-ticks" }, steps.map(function (s) {
      return el("span", { className: "step-tick" + (s.done ? " is-done" : "") }, [
        s.name + " ",
        el("span", { "aria-hidden": "true", text: s.done ? "✓" : "–" }),
        el("span", { className: "visually-hidden", text: s.done ? "(done)" : "(not done)" })
      ]);
    }));
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /* Shared with the Progress view in app.js (§6.7 "ring + x of y mastered + step ticks"), so both read the same rules. */
  window.VT_PATH = { lessonMastery: lessonMastery, lessonSteps: lessonSteps, stepTicks: stepTicks };

  /* ---------- Home (§6.1) ---------- */
  window.VT_VIEWS.home = {
    build: function () {},
    show: function (ctx) {
      var UI = ctx.UI, el = UI.el, LEARN = ctx.LEARN, DATA = ctx.DATA;
      var state = ctx.state(), now = Date.now();
      $("home-date").textContent = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      var body = $("home-body");
      UI.clear(body);
      var first = DATA.lessons[0];

      // Welcome card (§12.3), first run only.
      if (!state.onboarding.welcomeDismissed && first) {
        var dismiss = function () { state.onboarding.welcomeDismissed = true; ctx.save(); };
        var start = el("a", { className: "btn btn-primary", href: "#lesson/" + first.id }, [el("span", { text: "Start Lesson " + first.id }), UI.icon("arrow-right")]);
        start.addEventListener("click", dismiss);
        var got = el("button", { type: "button", className: "btn", text: "Got it" });
        got.addEventListener("click", function () {
          dismiss();
          window.VT_VIEWS.home.show(ctx);
          var h = $("home-today-h");
          if (h) h.focus();
        });
        body.appendChild(el("section", { className: "home-card welcome-card", "aria-labelledby": "home-welcome-h" }, [
          el("h3", { id: "home-welcome-h" }, [UI.icon("sparkles"), el("span", null, [el("span", { lang: "fr", text: "Bienvenue !" }), " Three tips to get started"])]),
          el("ol", { className: "welcome-tips" }, [
            el("li", { text: "Start with Lesson " + first.id + ". Each lesson walks you through Learn → Practice → Quiz." }),
            el("li", { text: "Tap Listen on any form to hear the full phrase. A green “Word” button plays a real French speaker." }),
            el("li", { text: "Open Settings to choose your computer voice (Amélie works) and set a daily goal." })
          ]),
          el("div", { className: "actions" }, [start, got])
        ]));
      }

      // Today card: suggestNext (§6.1 item 3).
      var next = LEARN.suggestNext(state, DATA, now);
      body.appendChild(el("section", { className: "home-card today-card", "aria-labelledby": "home-today-h" }, [
        el("p", { className: "home-kicker", text: "Today" }),
        el("h3", { id: "home-today-h", tabindex: "-1", text: next.title }),
        el("p", { text: next.reason }),
        el("div", { className: "actions" }, [
          el("a", { className: "btn btn-primary", href: next.href }, [el("span", { text: next.kind === "review" ? "Start review" : next.kind === "mixed" ? "Start the quiz" : "Let's go" }), UI.icon("arrow-right")]),
          el("a", { className: "text-link", href: "#practice", text: "or choose something else" })
        ])
      ]));

      var cols = el("div", { className: "home-cols" });
      // Daily goal + streak (§6.1 item 4, §13).
      var goal = state.settings.dailyGoal, today = LEARN.todayCount(state, now), met = LEARN.todayGoalMet(state, now);
      var goalText = met ? "Goal reached ✓" : today + " / " + goal + " answers today";
      var streak = LEARN.displayStreak(state, now);
      var week = el("ol", { className: "week-strip", "aria-label": "Last 7 days" });
      var todayKey = LEARN.dayKey(new Date(now)), keys = [todayKey];
      for (var i = 0; i < 6; i++) keys.unshift(LEARN.prevDayKey(keys[0]));
      keys.forEach(function (k) {
        var parts = k.split("-");
        var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        var on = k === todayKey ? met : (state.history[k] || 0) >= goal;
        var dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
        week.appendChild(el("li", { className: "week-day" + (on ? " is-met" : "") + (k === todayKey ? " is-today" : "") }, [
          el("span", { className: "week-dot", "aria-hidden": "true" }, [on ? UI.icon("check") : null]),
          el("span", { className: "week-initial", "aria-hidden": "true", text: dayName.charAt(0) }),
          el("span", { className: "visually-hidden", text: dayName + (k === todayKey ? " (today)" : "") + ": goal " + (on ? "met" : "not met") })
        ]));
      });
      cols.appendChild(el("section", { className: "home-card goal-card", "aria-labelledby": "home-goal-h" }, [
        el("h3", { id: "home-goal-h", text: "Daily goal" }),
        el("div", { className: "goal-row" }, [
          UI.ring(goal ? (100 * Math.min(today, goal)) / goal : 0, goalText),
          el("div", null, [
            el("p", { className: "goal-text", text: goalText }),
            el("p", { className: "streak-line" }, [UI.icon("flame"), el("span", { text: streak ? streak + "-day streak" : "Reach today's goal to start a streak." })]),
            el("p", { className: "muted", text: "Best: " + plural(state.streak.best, "day", "days") })
          ])
        ]),
        week
      ]));

      // To review (§6.1 item 5).
      var deck = LEARN.mistakesDeck(state, DATA).length;
      var weak = LEARN.weakestVerbs(state, DATA, 3);
      var reviewKids = [
        el("h3", { id: "home-review-h", text: "To review" }),
        el("p", { className: "goal-text", text: deck ? plural(deck, "item", "items") + " to review" : "Nothing to review yet." })
      ];
      if (weak.length) {
        reviewKids.push(el("p", { className: "muted", text: "Your trickiest verbs:" }));
        reviewKids.push(el("p", { className: "lesson-verbs" }, weak.map(function (w) {
          var lid = ctx.lessonOf[w.verb.id];
          return el("a", { className: "chip", href: lid != null ? "#conjugate/lesson/" + lid : "#browse" }, [
            el("span", { lang: "fr", text: w.verb.infinitive }), " · " + Math.round(w.accuracy * 100) + "%"
          ]);
        })));
      }
      if (deck) {
        reviewKids.push(el("a", { className: "btn", href: "#review" }, [UI.icon("rotate-ccw"), el("span", { text: "Review my mistakes" })]));
      } else {
        reviewKids.push(el("p", { id: "home-review-why", className: "muted", text: "Mistakes you make will show up here." }));
        reviewKids.push(el("button", { type: "button", className: "btn", disabled: true, "aria-describedby": "home-review-why" }, [UI.icon("rotate-ccw"), el("span", { text: "Review my mistakes" })]));
      }
      cols.appendChild(el("section", { className: "home-card review-card", "aria-labelledby": "home-review-h" }, reviewKids));
      body.appendChild(cols);

      // Lessons grid (§6.1 item 6).
      var recommended = (next.kind === "start" || next.kind === "lesson") ? String(next.lessonId) : null;
      body.appendChild(el("h3", { id: "home-lessons-h", className: "home-section-h", text: "Lessons" }));
      body.appendChild(el("p", { className: "muted", text: DATA.lessons.length + " lessons, " + DATA.verbs.length + " verbs. Work through them in order, or jump to any lesson." }));
      var grid = el("ul", { className: "lesson-grid", "aria-labelledby": "home-lessons-h" });
      DATA.lessons.forEach(function (lesson) {
        var verbs = lessonVerbs(ctx, lesson);
        var m = lessonMastery(ctx, lesson);
        var info = lessonSteps(ctx, lesson);
        var isRec = recommended === String(lesson.id);
        grid.appendChild(el("li", null, [
          el("a", { className: "lesson-card" + (isRec ? " is-recommended" : "") + (info.record.quizPassed ? " is-complete" : ""), href: "#lesson/" + lesson.id }, [
            el("span", { className: "lesson-card-top" }, [
              el("span", { className: "lesson-card-num", text: "Lesson " + lesson.id }),
              isRec ? el("span", { className: "rec-badge", text: "Recommended next" }) : null
            ]),
            el("h4", { className: "lesson-card-title", text: lesson.title }),
            el("span", { className: "lesson-card-verbs", lang: "fr", text: verbs.map(function (v) { return v.infinitive; }).join(", ") }),
            el("span", { className: "lesson-card-progress" }, [
              UI.ring(m.pct, m.pct + "% mastered"),
              el("span", null, [
                el("span", { className: "lesson-card-mastered", text: m.mastered + " of " + m.total + " items mastered" }),
                stepTicks(el, info.steps)
              ])
            ])
          ])
        ]));
      });
      body.appendChild(grid);

      // Topic lessons (topics-data.js): one card per topic, "x of y exercises done".
      var TOP = window.VT_TOPICS, TD = window.TOPICS_DATA;
      if (TOP && TD && TD.topics && TD.topics.length) {
        body.appendChild(el("h3", { id: "home-topics-h", className: "home-section-h", text: "Topics" }));
        body.appendChild(el("p", { className: "muted", text: "Grammar lessons with exercises: asking questions and reflexive verbs." }));
        body.appendChild(el("ul", { className: "lesson-grid", "aria-labelledby": "home-topics-h" }, TD.topics.map(function (t) {
          var tp = TOP.topicProgress(state, t);
          var nx = TOP.suggestExercise(state, t);
          return el("li", null, [
            el("a", { className: "topic-card" + (tp.total && tp.done === tp.total ? " is-complete" : ""), href: "#topics/" + t.id }, [
              el("span", { className: "lesson-card-top" }, [el("span", { className: "lesson-card-num", text: "Topic " + t.number })]),
              el("h4", { className: "lesson-card-title", text: t.title }),
              el("span", { className: "lesson-card-verbs", text: t.lessons.length + " lessons" + (nx && tp.done < tp.total ? ". Next: " + nx.id + " " + nx.title : "") }),
              el("span", { className: "lesson-card-progress" }, [
                UI.ring(tp.pct, tp.pct + "% done"),
                el("span", { className: "lesson-card-mastered", text: tp.done + " of " + tp.total + " exercises done" })
              ])
            ])
          ]);
        })));
      }

      // Explain entry point (views-explain.js). No network either way: only the link differs in wording.
      var helper = LEARN.explainMode(location.protocol) === "helper";
      body.appendChild(el("section", { className: "home-card explain-card", "aria-labelledby": "home-explain-h" }, [
        el("h3", { id: "home-explain-h" }, [UI.icon("languages"), el("span", { text: "Explain a French sentence" })]),
        el("p", { text: helper ? "Paste French and get the English, word by word, with the grammar explained."
          : "Needs the small local helper; the page shows how to start it." }),
        el("div", { className: "actions" }, [
          el("a", { className: "btn", id: "home-explain-link", href: "#explain" }, [el("span", { text: helper ? "Explain a sentence" : "How to start Explain" }), UI.icon("arrow-right")])
        ])
      ]));
    }
  };

  /* ---------- Lesson path (§6.2) ---------- */
  window.VT_VIEWS.lesson = {
    build: function () {},
    show: function (ctx, r) {
      var UI = ctx.UI, el = UI.el, LEARN = ctx.LEARN;
      var lesson = ctx.lessonsById[r.lessonId];
      var lessons = ctx.DATA.lessons;
      var idx = lessons.indexOf(lesson);
      var verbs = lessonVerbs(ctx, lesson);
      var m = lessonMastery(ctx, lesson);
      var info = lessonSteps(ctx, lesson);
      $("h-lesson").textContent = "Lesson " + lesson.id + ": " + lesson.title;
      var body = $("lesson-body");
      UI.clear(body);

      // Header card
      var head = [
        el("div", { className: "lesson-head-row" }, [
          UI.ring(m.pct, m.pct + "% mastered"),
          el("div", null, [
            el("p", { className: "home-kicker", text: "Lesson " + (idx + 1) + " of " + lessons.length }),
            el("p", { className: "lesson-card-mastered", text: m.mastered + " of " + m.total + " items mastered" })
          ])
        ]),
        el("p", { className: "lesson-verbs" }, verbs.map(function (v) {
          return el("a", { className: "chip", href: "#browse/lesson/" + lesson.id + "/" + v.id, lang: "fr", text: v.infinitive });
        }))
      ];
      if (info.record.quizPassed) {
        var nextLesson = lessons[idx + 1];
        head.push(el("p", { className: "lesson-complete", text: "Lesson complete ✓" }));
        head.push(nextLesson
          ? el("a", { className: "btn btn-primary", href: "#lesson/" + nextLesson.id }, [el("span", { text: "Next lesson" }), UI.icon("arrow-right")])
          : el("p", { text: "All lessons complete. Keep reviewing to stay sharp." }));
      }
      body.appendChild(el("div", { className: "home-card lesson-head" }, head));

      // Three step cards
      body.appendChild(el("ol", { className: "step-list step-path" }, info.steps.map(function (s, i) {
        var status = s.done ? "Done ✓" : s.recommended ? "Recommended next" : "Not started";
        return el("li", { className: "step-card" + (s.done ? " is-done" : "") + (s.recommended ? " is-recommended" : "") }, [
          el("h3", { className: "step-title" }, [UI.icon(s.icon), el("span", { text: (i + 1) + ". " + s.name })]),
          el("p", { className: "step-status", text: status }),
          el("p", { text: s.text }),
          el("a", { className: "btn" + (s.recommended ? " btn-primary" : ""), href: s.href }, [
            el("span", { text: (s.done ? "Redo " : "Open ") + s.name }), UI.icon("arrow-right")
          ])
        ]);
      })));

      // Pattern panel: verbs grouped by ending family (§6.2, §8.2)
      var groups = [], byFam = {};
      verbs.forEach(function (v) {
        var pat = LEARN.patternFor(v);
        if (!byFam[pat.family]) { byFam[pat.family] = { pat: pat, verbs: [] }; groups.push(byFam[pat.family]); }
        byFam[pat.family].verbs.push(v);
      });
      body.appendChild(el("section", { className: "home-card pattern-panel", "aria-labelledby": "lesson-pattern-h" }, [
        el("h3", { id: "lesson-pattern-h" }, [UI.icon("lightbulb"), el("span", { text: "Patterns in this lesson" })]),
        el("ul", { className: "pattern-groups" }, groups.map(function (g) {
          return el("li", null, [
            el("strong", { text: g.verbs.length + " of " + verbs.length + ": " + g.pat.label }),
            " (", el("span", { lang: "fr", text: g.verbs.map(function (v) { return v.infinitive; }).join(", ") }), ")",
            g.pat.hint ? el("span", { className: "pattern-hint-text", text: " " + g.pat.hint }) : null
          ]);
        }))
      ]));
    }
  };

  /* ---------- Practice hub (final, §6.4) ---------- */
  var HUB = [
    { name: "Flashcards", icon: "layers", href: "#flashcards", text: "Flip a card, then say whether you knew it." },
    { name: "Conjugate", icon: "pencil", href: "#conjugate", text: "Type the right form for a pronoun." },
    { name: "Sentences", icon: "text", href: "#sentences", text: "Fill in the missing verb in a real sentence." },
    { name: "Multiple choice", icon: "list", href: "#choice", text: "Pick the right answer from four options." },
    { name: "Review my mistakes", icon: "rotate-ccw", href: "#review", text: "Practise the items you missed until they stick.", review: true }
  ];

  window.VT_VIEWS.practice = {
    build: function () {},
    show: function (ctx) {
      var UI = ctx.UI, el = UI.el;
      var box = $("practice-cards");
      UI.clear(box);
      var deck = ctx.LEARN.mistakesDeck(ctx.state(), ctx.DATA).length;
      HUB.forEach(function (c, i) {
        var hid = "hub-h-" + i;
        var extra = c.review
          ? el("p", { className: "hub-count", text: deck === 0 ? "Nothing to review yet." : deck + (deck === 1 ? " item to review" : " items to review") })
          : null;
        box.appendChild(el("article", { className: "hub-card", "aria-labelledby": hid }, [
          el("h3", { id: hid, className: "hub-title" }, [UI.icon(c.icon), el("span", { text: c.name })]),
          el("p", { text: c.text }),
          extra,
          el("a", { className: "btn btn-primary", href: c.href }, [
            el("span", { text: "Start" }), el("span", { className: "visually-hidden", text: ": " + c.name }), UI.icon("arrow-right")
          ])
        ]));
      });
    }
  };
})();
