/* Dialogues view: the conversations in dialogues-data.js (window.VT_DIALOGUES), logic in dialogues.js (VT_DLG).
   Routes: #dialogues (index), #dialogues/<id> (Listen & read), #dialogues/<id>/roleplay, #dialogues/<id>/quiz.
   Unknown ids go back to the index. All strings go through textContent (VT_UI.el); no inline styles (CSP); no
   network. Every class and id uses the dia- prefix (diaq- for the quiz panel): .dlg / #dlg-* are the modals.
   Speakers are told apart without colour: name and role on every line, an initial avatar, the side, a border.
   Each line's Listen button uses its speaker's recorded voice and name (VT_DLG.listenEntries is the corpus). */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var C = null;
  var DLG = null;            // window.VT_DLG
  var quiz = null;           // the comprehension-quiz choice panel (static #diaq-* markup)
  var quizSession = null;
  var player = null;         // Listen & read play-all player of the rendered page, or null
  var rpPlayer = null;       // role-play partner-line mini-player, or null
  var runs = {};             // dialogueId -> role-play run (in memory only)
  var rpPrefs = {};          // dialogueId -> { role, method, autoplay } (in memory only)
  var current = null;        // { d, mode } of the rendered dialogue page
  var warned = {};           // broken vocab link targets already reported
  var printing = false;
  var PDF_HREF = "reference/french-dialogues.pdf";
  var MD_HREF = "reference/french-dialogues.md";
  var STORY_PDF_HREF = "reference/la-lettre-de-lyon.pdf";
  var STORY_MD_HREF = "reference/la-lettre-de-lyon.md";
  var focusStories = false;  // set by an episode's "All episodes" link: focus the Stories heading on the index
  var GAP_MS = 500;

  function DATA() { return C && C.DIALOGUES; }
  /* Story illustrations (story-images.js, window.VT_STORY_IMAGES): rec is { src, width, height, alt } or null.
     alt "" marks a decorative copy (list thumbnails beside a link that already names the episode). */
  function storyImage(d) {
    var S = window.VT_STORY_IMAGES;
    return S && d && d.series === S.series && d.episode ? S.episodes[String(d.episode)] || null : null;
  }
  function storyCover(ser) {
    var S = window.VT_STORY_IMAGES;
    return S && ser && ser.id === S.series ? S.cover : null;
  }
  function imgNode(rec, cls, alt, lazy) {
    return el("img", { className: cls, src: rec.src, width: String(rec.width), height: String(rec.height), alt: alt,
      loading: lazy ? "lazy" : null, decoding: "async" });
  }
  function el(tag, attrs, kids) { return C.UI.el(tag, attrs, kids); }
  function state() { return C.state(); }
  function today() { return C.LEARN.dayKey(new Date()); }
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function scrollNear(node) {
    if (node && node.scrollIntoView) node.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }
  function speakerOf(d, id) { return DLG.index(DATA()).speakerById[d.id][id]; }
  function nameOf(d, line) { return speakerOf(d, line.speaker).name; }
  function voiceOf(d, line) { return DLG.voiceOf(d, line.speaker); }
  function otherSpeakerId(d, sid) { return d.speakers[0].id === sid ? d.speakers[1].id : d.speakers[0].id; }
  function showEnglish() { return state().settings.dialogueShowEnglish !== false; }
  function canPlay(d, line) { return C.SPEECH.canPlay(null, line.fr, voiceOf(d, line)); }
  /* Focus only when the learner hasn't moved elsewhere (focus still on body or inside the section). */
  function mayFocus(section) {
    var a = document.activeElement;
    return !a || a === document.body || (section && section.contains(a));
  }

  /* ---------- players ---------- */
  function running(p) { return p && (p.state() === "playing" || p.state() === "paused"); }
  function stopPlayer() {
    var any = false;
    if (running(player)) { player.stop(); any = true; }      // onChange(idle) resets the toggle text and writes "Stopped."
    if (running(rpPlayer)) { rpPlayer.stop(); any = true; }
    rpPlayer = null;                                         // role-play creates one per advance()
    if (any) C.stopAudio();          // stops the sound and marks its toast ended (hides ~3 s later)
  }
  function makeLinePlayer(d, lines, onChange) {
    return DLG.makePlayer({
      count: lines.length, gapMs: GAP_MS,
      setTimeout: function (fn, ms) { return window.setTimeout(fn, ms); },
      clearTimeout: function (id) { window.clearTimeout(id); },
      play: function (i, onEnd, onStart) {
        C.playLine(lines[i].fr, voiceOf(d, lines[i]), { onStart: onStart, onEnd: onEnd, who: nameOf(d, lines[i]) });
      },
      stop: function () { C.stopAudio(); },
      onChange: onChange
    });
  }

  /* ---------- shared pieces ---------- */
  function lineNode(d, line, opts) {
    var sp = speakerOf(d, line.speaker);
    var mine = !!(opts && opts.mine);
    return el("li", { className: "dia-line" + (mine ? " dia-line-mine" : ""), "data-side": sp.side, "data-speaker": sp.id,
      id: opts && opts.id ? opts.id : "dia-" + d.id + "-" + line.id }, [
      el("span", { className: "dia-avatar", "aria-hidden": "true", text: sp.initial }),
      el("div", { className: "dia-bubble" }, [
        el("p", { className: "dia-who" }, [
          el("span", { className: "dia-name", text: sp.name }), " ",
          el("span", { className: "dia-role", text: "(" + sp.role + ")" }),
          mine ? " " : null,
          mine ? el("span", { className: "dia-mine", text: "Your line" }) : null,
          el("span", { className: "visually-hidden", text: ":" })
        ]),
        el("p", { className: "dia-fr" }, [
          el("span", { lang: "fr", text: line.fr }), " ",
          C.listenButton(line.fr, null, { compact: true, voice: sp.voice, who: sp.name })
        ]),
        el("p", { className: "dia-pron", text: line.pron }),
        el("p", { className: "dia-en", text: line.en }),
        el("span", { className: "dia-now", hidden: true, text: "Now playing" })
      ])
    ]);
  }
  function linesList(d, label) {
    return el("ol", { className: "dia-lines" + (showEnglish() ? "" : " dia-hide-en"), "aria-label": label || "Dialogue: " + d.title });
  }
  function setNow(list, node) {
    Array.prototype.forEach.call(list.querySelectorAll(".dia-line"), function (li) {
      var on = li === node;
      if (on) li.setAttribute("aria-current", "true"); else li.removeAttribute("aria-current");
      var b = li.querySelector(".dia-now");
      if (b) b.hidden = !on;
    });
  }
  function toolbar(d) {
    var story = !!(d && d.series);
    var print = el("button", { type: "button", className: "btn" }, [C.UI.icon("printer"), el("span", { text: "Print" })]);
    print.addEventListener("click", function () { window.print(); });
    var key = el("button", { type: "button", className: "btn", "aria-haspopup": "dialog" }, [C.UI.icon("info"), el("span", { text: "Pronunciation key" })]);
    key.addEventListener("click", function (ev) {
      C.UI.openDialog($("dlg-reference"), ev.currentTarget);
      var h = $("ref-pron");
      if (h) { h.scrollIntoView({ block: "start" }); h.focus(); }
    });
    return el("div", { className: "actions tables-toolbar" }, [
      print, key,
      el("a", { className: "btn", href: story ? STORY_PDF_HREF : PDF_HREF }, [el("span", { text: "Printable PDF" })]),
      el("a", { className: "btn", href: story ? STORY_MD_HREF : MD_HREF }, [el("span", { text: "Markdown" })])
    ]);
  }
  function statusText(d, b) {
    var parts = [];
    if (b.quizBest >= 0) parts.push("Quiz best: " + b.quizBest + "%");
    var roles = d.speakers.filter(function (sp) { return Object.prototype.hasOwnProperty.call(b.roles, sp.id); })
      .map(function (sp) { return sp.name + " " + b.roles[sp.id].best + "%"; });
    if (roles.length) parts.push("Role-play: " + roles.join(", "));
    if (b.listened) parts.push("Listened");
    return parts.length ? parts.join(" · ") : "Not started";
  }

  /* ---------- index: one group per level (A1, A2, B1), cards in number order ---------- */
  var LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate" };
  var levelFilter = "all";   // index level filter (in memory only, no storage key)
  function started(b) { return DLG.isStarted(b); }
  function overallText(list, byDialogue) {
    var n = list.filter(function (d) { return started(byDialogue[d.id]); }).length;
    var full = list.filter(function (d) { return byDialogue[d.id] && byDialogue[d.id].quizBest === 100; }).length;
    var s = n + " of " + list.length + " started";
    if (full) s += " · " + full + (full === 1 ? " quiz" : " quizzes") + " at 100%";
    return s;
  }
  function renderIndex(body) {
    var D = DATA();
    var st = DLG.stats(state(), D);
    var list = DLG.everyday(D);   // the everyday conversations; story episodes are listed under Stories
    body.appendChild(el("p", { className: "intro", text: D.intro }));
    body.appendChild(el("p", { className: "muted", text: D.respellingNote }));
    body.appendChild(el("p", { className: "dia-overall", text: overallText(list, st.byDialogue) }));
    var groups = {};
    var levels = ["A1", "A2", "B1"].filter(function (lvl) { return list.some(function (d) { return d.level === lvl; }); });
    var count = el("p", { className: "dia-filter-count", role: "status" });
    var buttons = ["all"].concat(levels).map(function (lvl) {
      var b = el("button", { type: "button", className: "chip", "aria-pressed": lvl === levelFilter ? "true" : "false", text: lvl === "all" ? "All" : lvl });
      b.addEventListener("click", function () { applyFilter(lvl); });
      return b;
    });
    function applyFilter(lvl) {
      if (lvl !== "all" && !groups[lvl]) lvl = "all";
      levelFilter = lvl;
      var shown = 0;
      levels.forEach(function (l) {
        var on = lvl === "all" || lvl === l;
        groups[l].node.hidden = !on;
        if (on) shown += groups[l].n;
      });
      buttons.forEach(function (b, i) { b.setAttribute("aria-pressed", (i === 0 ? "all" : levels[i - 1]) === lvl ? "true" : "false"); });
      count.textContent = "Showing " + shown + " of " + list.length + " dialogues";
    }
    body.appendChild(el("div", { className: "dia-filter", role: "group", "aria-label": "Filter dialogues by level" }, [
      el("ul", { className: "jump-list" }, buttons.map(function (b) { return el("li", null, [b]); }))
    ]));
    body.appendChild(count);
    levels.forEach(function (lvl) {
      var ds = list.filter(function (d) { return d.level === lvl; });
      var hid = "dia-level-" + lvl.toLowerCase();
      var node = el("section", { className: "dia-level-group", "aria-labelledby": hid }, [
        el("h3", { id: hid, text: lvl + " · " + LEVEL_NAMES[lvl] + " (" + ds.length + (ds.length === 1 ? " dialogue)" : " dialogues)") }),
        el("ul", { className: "lesson-grid dia-grid" }, ds.map(function (d) { return indexCard(d, st.byDialogue[d.id]); }))
      ]);
      groups[lvl] = { node: node, n: ds.length };
      body.appendChild(node);
    });
    applyFilter(levelFilter);
    var stories = storiesSection(D, st.byDialogue);
    if (stories) body.appendChild(stories);
    if (focusStories) {
      focusStories = false;
      setTimeout(function () {
        var h = $("dia-stories-h");
        if (h && document.contains(h)) { h.focus({ preventScroll: true }); h.scrollIntoView({ block: "start" }); }
      }, 0);
    }
  }

  /* ---------- Stories: one block per series, episodes grouped by act ---------- */
  function speakersText(d) { return d.speakers.map(function (sp) { return sp.name + " (" + sp.role + ")"; }).join(" · "); }
  function storiesSection(D, byDialogue) {
    var all = DLG.seriesList(D).filter(function (s) { return DLG.episodes(D, s.id).length; });
    if (!all.length) return null;
    return el("section", { className: "dia-stories", "aria-labelledby": "dia-stories-h" }, [
      el("h3", { id: "dia-stories-h", tabindex: "-1", text: "Stories" })
    ].concat(all.map(function (ser) { return seriesCard(D, ser, byDialogue); })));
  }
  function seriesCard(D, ser, byDialogue) {
    var eps = DLG.episodes(D, ser.id);
    var n = eps.filter(function (d) { return started(byDialogue[d.id]); }).length;
    var nx = DLG.nextEpisode(state(), D, ser.id);
    var verb = nx.allStarted ? "Read again: " : nx.anyStarted ? "Continue: " : "Start: ";
    var cover = storyCover(ser);
    var kids = [
      el("h4", null, [el("span", { lang: "fr", text: ser.titleFr }), " ", el("span", { className: "dia-series-en", text: "(" + ser.title + ")" })]),
      cover ? imgNode(cover, "dia-series-cover", cover.alt, true) : null,
      el("p", { text: ser.summary }),
      el("p", { className: "muted", text: ser.intro }),
      el("p", { className: "dia-overall", text: n + " of " + eps.length + " episodes started" }),
      el("div", { className: "actions" }, [
        nx.dialogue ? el("a", { className: "btn btn-primary", href: "#dialogues/" + nx.dialogue.id }, [
          el("span", { text: verb + "Episode " + nx.dialogue.episode + " · " + nx.dialogue.title }), C.UI.icon("arrow-right")]) : null,
        el("a", { className: "text-link", href: STORY_PDF_HREF, text: "Story PDF" }),
        el("a", { className: "text-link", href: STORY_MD_HREF, text: "Markdown" })
      ])
    ];
    (ser.acts || []).forEach(function (act) {
      var ds = eps.filter(function (d) { return d.act === act.number; });
      if (!ds.length) return;
      kids.push(el("h5", null, ["Act " + act.number + " · ", el("span", { lang: "fr", text: act.titleFr }), " (" + act.title + ") · " + act.level]));
      kids.push(el("ol", { className: "dia-episodes", start: String(ds[0].episode) }, ds.map(function (d) {
        var pic = storyImage(d);
        return el("li", { className: pic ? "dia-episode dia-episode-pic" : "dia-episode" }, [
          pic ? imgNode(pic, "dia-episode-thumb", "", true) : null,
          el("p", { className: "dia-episode-title" }, [el("a", { href: "#dialogues/" + d.id, text: "Episode " + d.episode + ": " + d.title }), " ",
            el("span", { lang: "fr", text: d.titleFr })]),
          el("p", { className: "muted", text: speakersText(d) }),
          el("p", { className: "dia-status", text: statusText(d, byDialogue[d.id]) })
        ]);
      })));
    });
    return el("div", { className: "home-card dia-series" }, kids);
  }
  function indexCard(d, b) {
    var href = "#dialogues/" + d.id;
    return el("li", { className: "home-card dia-card" }, [
      el("h4", null, [el("a", { href: href, text: d.number + ". " + d.title })]),
      el("p", { className: "dia-card-meta" }, [el("span", { lang: "fr", text: d.titleFr }), " ", el("span", { className: "dia-level", text: d.level })]),
      el("p", { text: d.summary }),
      el("p", { className: "muted", text: d.speakers.map(function (sp) { return sp.name + " (" + sp.role + ")"; }).join(" · ") }),
      el("p", { className: "dia-status", text: statusText(d, b) }),
      el("p", { className: "dia-card-modes" }, [
        el("a", { href: href, text: "Listen & read" }), " · ",
        el("a", { href: href + "/roleplay", text: "Role-play" }), " · ",
        el("a", { href: href + "/quiz", text: "Quiz" })
      ])
    ]);
  }

  /* ---------- dialogue page ---------- */
  var MODES = [["listen", "Listen & read", ""], ["roleplay", "Role-play", "/roleplay"], ["quiz", "Comprehension quiz", "/quiz"]];
  function modeNav(d, mode) {
    return el("nav", { className: "dia-modes", "aria-label": "Practice modes" }, [el("ul", null, MODES.map(function (m) {
      var href = "#dialogues/" + d.id + m[2];
      var a = el("a", { href: href, "aria-current": m[0] === mode ? "page" : null, text: m[1] });
      a.addEventListener("click", function (ev) {
        // Same hash: no hashchange, so re-render that mode here.
        if (location.hash === href) { ev.preventDefault(); renderDialogue(d, m[0], true); }
      });
      return el("li", null, [a]);
    }))]);
  }

  function renderDialogue(d, mode, focusMode) {
    stopPlayer();
    player = null;
    parkQuiz();
    var body = $("dialogues-body");
    C.UI.clear(body);
    current = { d: d, mode: mode };
    var nav = DLG.episodeNav(DATA(), d);
    document.title = nav
      ? "Episode " + nav.n + ": " + d.title + " · " + (nav.series ? nav.series.titleFr : d.series) + " · Learn French for Beginners"
      : d.title + " · Dialogues · Learn French for Beginners";
    var hid = "dia-h-" + d.id;
    var modeSection = el("section", { className: "dia-mode", "aria-labelledby": "dia-mode-h" }, [
      el("h4", { id: "dia-mode-h", tabindex: "-1", text: MODES.filter(function (m) { return m[0] === mode; })[0][1] })
    ]);
    var art = el("article", { className: "dia", "aria-labelledby": hid }, [
      el("h3", { id: hid, tabindex: "-1" }, [d.title, " ", el("span", { lang: "fr", className: "dia-title-fr", text: d.titleFr }), " ",
        el("span", { className: "dia-level", text: d.level })]),
      nav ? el("p", { className: "dia-episode-of" }, ["Episode " + nav.n + " of " + nav.total + (nav.act ? " · Act " + nav.act.number + ": " : ""),
        nav.act ? el("span", { lang: "fr", text: nav.act.titleFr }) : null]) : null,
      storyImage(d) ? el("figure", { className: "dia-illus" }, [imgNode(storyImage(d), "dia-illus-img", storyImage(d).alt, false)]) : null,
      nav && d.recap ? el("p", { className: "dia-recap" }, [el("span", { className: "ref-label", text: "Story so far: " }), d.recap]) : null,
      el("p", { className: "dia-scene" }, [el("span", { className: "ref-label", text: "Scene: " }), d.scene]),
      el("p", { className: "dia-cast", text: d.speakers.map(function (sp) { return sp.name + " (" + sp.role + ")"; }).join(" and ") +
        ". Each line shows the speaker's name and initial; " + d.speakers.filter(function (s) { return s.side === "start"; })[0].name +
        "'s lines sit on the left, " + d.speakers.filter(function (s) { return s.side === "end"; })[0].name + "'s on the right." }),
      toolbar(d),
      modeNav(d, mode),
      modeSection
    ]);
    body.appendChild(art);
    if (mode === "listen") {
      renderListen(d, modeSection);
      art.appendChild(vocabSection(d));
      art.appendChild(noticeSection(d));
    } else if (mode === "roleplay") {
      renderRolePlay(d, modeSection);
    } else {
      renderQuiz(d, modeSection);
    }
    if (nav) art.appendChild(episodeNavNode(nav));
    var back = el("a", { href: "#dialogues", text: nav ? "All episodes" : "All dialogues" });
    if (nav) back.addEventListener("click", function () { focusStories = true; });
    art.appendChild(el("p", { className: "dia-back" }, [back]));
    var target = focusMode ? $("dia-mode-h") : $(hid);
    setTimeout(function () { if (target && document.contains(target)) target.focus({ preventScroll: !!focusMode }); }, 0);
  }

  function episodeNavNode(nav) {
    return el("nav", { className: "dia-ep-nav", "aria-label": "Episodes" }, [
      nav.prev ? el("a", { href: "#dialogues/" + nav.prev.id, rel: "prev", text: "← Previous episode: " + nav.prev.title }) : null,
      nav.next ? el("a", { href: "#dialogues/" + nav.next.id, rel: "next", text: "Next episode: " + nav.next.title + " →" }) : null
    ]);
  }
  /* Summary-card link to the next episode of a story (none for everyday dialogues or the last episode). */
  function nextEpisodeExtra(d) {
    var nav = DLG.episodeNav(DATA(), d);
    return nav && nav.next ? [{ label: "Next episode: " + nav.next.title, href: "#dialogues/" + nav.next.id }] : [];
  }

  /* ---------- mode 1: Listen & read ---------- */
  function renderListen(d, section) {
    var lines = d.lines;
    var list = linesList(d);
    lines.forEach(function (l) { list.appendChild(lineNode(d, l)); });
    var toggleText = el("span", { text: "Play all" });
    var playAll = el("button", { type: "button", className: "btn btn-primary dia-playall", "aria-label": "Play all" }, [C.UI.icon("volume-2"), toggleText]);
    var stopBtn = el("button", { type: "button", className: "btn", disabled: true }, [C.UI.icon("x"), el("span", { text: "Stop" })]);
    var en = el("input", { type: "checkbox", id: "dia-show-en" });
    en.checked = showEnglish();
    var status = el("p", { className: "dia-play-status", id: "dia-play-status", role: "status", "aria-live": "polite" });
    var any = lines.some(function (l) { return canPlay(d, l); });
    playAll.disabled = !any;
    var prev = "idle";
    function render(st, i) {
      var node = i >= 0 ? $("dia-" + d.id + "-" + lines[i].id) : null;
      setNow(list, st === "playing" || st === "paused" ? node : null);
      if (st === "playing" && node) scrollNear(node);
      var label = st === "playing" ? "Pause" : st === "paused" ? "Resume" : "Play all";
      toggleText.textContent = label;
      playAll.setAttribute("aria-label", label);
      stopBtn.disabled = !(st === "playing" || st === "paused");
      if (st !== prev) {
        if (st === "playing") status.textContent = "Playing the dialogue.";
        else if (st === "paused") status.textContent = "Paused at line " + (i + 1) + " of " + lines.length + ".";
        else if (st === "idle") status.textContent = "Stopped.";
        else if (st === "finished") {
          status.textContent = "Finished.";
          DLG.markListened(state(), d.id, today());
          C.save();
        }
      }
      prev = st;
    }
    player = makeLinePlayer(d, lines, render);
    playAll.addEventListener("click", function () { if (player) player.toggle(); });   // synchronous: unlocks audio on WebKit
    stopBtn.addEventListener("click", function () { if (player && running(player)) { player.stop(); C.stopAudio(); } });
    en.addEventListener("change", function () {
      state().settings.dialogueShowEnglish = en.checked;
      C.save();
      Array.prototype.forEach.call(document.querySelectorAll("#view-dialogues .dia-lines"), function (o) { o.classList.toggle("dia-hide-en", !en.checked); });
    });
    section.appendChild(el("div", { className: "actions dia-controls" }, [
      playAll, stopBtn,
      el("div", { className: "field-check" }, [en, el("label", { "for": "dia-show-en", text: "Show English" })])
    ]));
    section.appendChild(status);
    if (!any) section.appendChild(el("p", { className: "hint", text: "Audio isn't available in this browser." }));
    section.appendChild(list);
  }

  /* ---------- key vocabulary and Notice this ---------- */
  function tableMap() {
    var out = {};
    ((window.VT_REFERENCE && window.VT_REFERENCE.categories) || []).forEach(function (c) {
      (c.tables || []).forEach(function (t) { out[t.id] = { categoryId: c.id, title: t.title }; });
    });
    return out;
  }
  function exprById(id) {
    var X = C.EXPRESSIONS;
    if (!X || !window.VT_EXPR) return null;
    return window.VT_EXPR.index(X).byId[id] || null;
  }
  function linkFor(link, tables) {
    if (link.kind === "verb") {
      var v = C.verbsById[link.id];
      if (!v) return null;
      var lid = C.lessonOf && C.lessonOf[link.id];
      return el("a", { href: lid != null ? "#browse/lesson/" + lid + "/" + link.id : "#browse", lang: "fr", text: v.infinitive });
    }
    if (link.kind === "expression") {
      var e = exprById(link.id);
      return e ? el("a", { href: "#expressions/" + e.theme + "/" + e.id, lang: "fr", text: e.fr }) : null;
    }
    if (link.kind === "table") {
      var t = tables[link.id];
      return t ? el("a", { href: "#tables/" + t.categoryId + "/" + link.id, text: t.title }) : null;
    }
    return null;
  }
  function vocabSection(d) {
    var tables = tableMap();
    var rows = d.vocab.map(function (v) {
      var see;
      if (v.link === null) see = el("span", { "aria-label": "No link", text: "–" });
      else {
        see = linkFor(v.link, tables);
        if (!see) {
          var w = v.link.kind + ":" + v.link.id;
          if (!warned[w]) { warned[w] = true; console.warn("verbTrainer: dialogue " + d.id + "/" + v.id + " links to a missing " + w); }
          see = "";
        }
      }
      return el("tr", null, [
        el("th", { scope: "row" }, [el("span", { lang: "fr", text: v.fr }), " ", C.listenButton(v.fr, null, { compact: true })]),
        el("td", { className: "pron", text: v.pron }),
        el("td", { text: v.en }),
        el("td", null, [see])
      ]);
    });
    return el("section", { className: "dia-vocab-section", "aria-labelledby": "dia-vocab-h" }, [
      el("h4", { id: "dia-vocab-h", text: "Key vocabulary" }),
      C.UI.tableRegion("Key vocabulary", el("table", { className: "ref-table dia-vocab" }, [
        el("thead", null, [el("tr", null, ["French", "Pronunciation", "English", "See"].map(function (h) { return el("th", { scope: "col", text: h }); }))]),
        el("tbody", null, rows)
      ]))
    ]);
  }
  function noticeSection(d) {
    var n = d.notice, tables = tableMap();
    var t = n.table ? tables[n.table] : null;
    return el("section", { className: "dia-notice", role: "note", "aria-labelledby": "dia-notice-h" }, [
      el("h4", { id: "dia-notice-h", text: "Notice this: " + n.title }),
      el("p", { text: n.text }),
      el("ul", { className: "dia-notice-examples" }, n.examples.map(function (x) {
        return el("li", null, [
          el("strong", { lang: "fr", text: x.fr }), " ", C.listenButton(x.fr, null, { compact: true }), " ",
          el("span", { className: "pron", text: "(" + x.pron + ")" }), " ",
          el("span", { text: x.en })
        ]);
      })),
      t ? el("p", null, ["See the table: ", el("a", { href: "#tables/" + t.categoryId + "/" + n.table, text: t.title })]) : null
    ]);
  }

  /* ---------- mode 2: Role-play ---------- */
  function prefsFor(d) {
    if (!rpPrefs[d.id]) {
      var end = d.speakers.filter(function (s) { return s.side === "end"; })[0] || d.speakers[0];
      rpPrefs[d.id] = { role: end.id, method: "typed", autoplay: true };
    }
    return rpPrefs[d.id];
  }
  function learnerLines(d, role) { return d.lines.filter(function (l) { return l.speaker === role; }); }

  function renderRolePlay(d, section) {
    var area = el("div", { className: "dia-rp", id: "dia-rp" });
    section.appendChild(area);
    setupCard(d, area);   // with an unfinished run it offers Continue (line n of m) and Start over
  }

  function setupCard(d, area) {
    var p = prefsFor(d);
    var run = runs[d.id];
    C.UI.clear(area);
    var roleSet = el("fieldset", { className: "radio-group" }, [el("legend", { text: "Your role" })].concat(
      d.speakers.slice().sort(function (a, b) { return a.side === "end" ? -1 : b.side === "end" ? 1 : 0; }).map(function (sp) {
        var id = "dia-role-" + sp.id;
        var r = el("input", { type: "radio", name: "dia-role", id: id, value: sp.id });
        r.checked = p.role === sp.id;
        r.addEventListener("change", function () { if (r.checked) p.role = sp.id; });
        return el("div", { className: "field-check" }, [r, el("label", { "for": id, text: sp.name + " (" + sp.role + ")" })]);
      })));
    var methods = [["typed", "Typing the line"], ["spoken", "Saying it aloud (then mark yourself)"]];
    var methodSet = el("fieldset", { className: "radio-group" }, [el("legend", { text: "Answer by" })].concat(methods.map(function (m) {
      var id = "dia-method-" + m[0];
      var r = el("input", { type: "radio", name: "dia-method", id: id, value: m[0] });
      r.checked = p.method === m[0];
      r.addEventListener("change", function () { if (r.checked) p.method = m[0]; });
      return el("div", { className: "field-check" }, [r, el("label", { "for": id, text: m[1] })]);
    })));
    var auto = el("input", { type: "checkbox", id: "dia-autoplay" });
    auto.checked = p.autoplay;
    auto.addEventListener("change", function () { p.autoplay = auto.checked; });
    var actions = el("div", { className: "actions" });
    if (run && !run.done) {
      var cont = el("button", { type: "button", className: "btn btn-primary" }, [el("span", { text: "Continue (line " + (run.turnIndex + 1) + " of " + d.lines.length + ")" })]);
      cont.addEventListener("click", function () { renderRunShell(d, area, run, true); });
      var over = el("button", { type: "button", className: "btn" }, [el("span", { text: "Start over" })]);
      over.addEventListener("click", function () { startRun(d, p.role); });
      actions.appendChild(cont);
      actions.appendChild(over);
    } else {
      var start = el("button", { type: "button", className: "btn btn-primary", id: "dia-rp-start" }, [el("span", { text: "Start" }), C.UI.icon("arrow-right")]);
      start.addEventListener("click", function () { startRun(d, p.role); });
      actions.appendChild(start);
    }
    area.appendChild(el("div", { className: "dia-setup" }, [
      el("p", { text: "Take one of the roles. The other speaker's lines play (or appear) and you answer with yours." }),
      roleSet, methodSet,
      el("div", { className: "field-check" }, [auto, el("label", { "for": "dia-autoplay", text: "Play the other speaker's lines automatically" })]),
      actions
    ]));
  }

  function startRun(d, role) {
    stopPlayer();
    var p = prefsFor(d);
    p.role = role;
    var run = { role: role, method: p.method, autoplay: p.autoplay, index: 0, turnIndex: 0, current: null, graded: false,
      results: {}, transcript: [], done: false, summary: false };
    runs[d.id] = run;
    var area = $("dia-rp");
    if (!area || !current || current.d !== d || current.mode !== "roleplay") {
      renderDialogue(d, "roleplay", true);
      area = $("dia-rp");
    }
    renderRunShell(d, area, run, false);
    advance(d, run);                      // synchronously inside the click: the first partner clip starts here
    var h = $("dia-turn-h") || $("dia-rp-summary-h");
    if (h) h.focus();
    if (!rpPlayer) focusTurnTarget();
  }

  /* The transcript + live region + turn slot; on Continue, the transcript is rebuilt from the run. */
  function renderRunShell(d, area, run, resume) {
    C.UI.clear(area);
    var sp = speakerOf(d, run.role);
    area.appendChild(el("p", { className: "dia-rp-head" }, [
      "You are ", el("strong", { text: sp.name + " (" + sp.role + ")" }), ", " + (run.method === "typed" ? "typing" : "saying") + " your lines."
    ]));
    var list = linesList(d, "Role-play transcript: " + d.title);
    list.id = "dia-rp-lines";
    area.appendChild(list);
    area.appendChild(el("p", { className: "visually-hidden", role: "status", "aria-live": "polite", id: "dia-rp-live" }));
    area.appendChild(el("div", { id: "dia-rp-turn" }));
    run.transcript.forEach(function (t) {
      var line = DLG.index(DATA()).lineById[d.id][t.id];
      list.appendChild(lineNode(d, line, { mine: t.mine, id: "dia-rp-" + d.id + "-" + t.id }));
    });
    if (resume) {
      if (run.current && !run.graded) { renderTurn(d, run); var h = $("dia-turn-h"); if (h) h.focus(); }
      else if (run.current && run.graded) { renderTurn(d, run); }
    }
  }

  function appendTranscript(d, run, line, mine) {
    var list = $("dia-rp-lines");
    run.transcript.push({ id: line.id, mine: !!mine });
    var node = lineNode(d, line, { mine: mine, id: "dia-rp-" + d.id + "-" + line.id });
    if (list) list.appendChild(node);
    return node;
  }

  function advance(d, run) {
    stopPlayer();
    var pr = DLG.partnerRun(d, run.role, run.index);
    var nodes = pr.partner.map(function (l) { return appendTranscript(d, run, l, false); });
    // The live region speaks only partner lines the audio toast won't announce (autoplay off or no audio).
    var quiet = pr.partner.filter(function (l) { return !run.autoplay || !canPlay(d, l); });
    var live = $("dia-rp-live");
    if (live) live.textContent = quiet.map(function (l) { return nameOf(d, l) + ": " + l.fr; }).join(" ");
    run.index = pr.nextIndex;
    run.current = pr.learner;
    run.graded = false;
    if (pr.learner) run.turnIndex = d.lines.indexOf(pr.learner);
    if (!pr.learner) {
      run.done = true;
      run.turnIndex = d.lines.length - 1;
    }
    var turn = $("dia-rp-turn");
    if (turn) C.UI.clear(turn);
    if (run.autoplay && pr.partner.length) {
      var section = $("dia-rp");
      var list = $("dia-rp-lines");
      rpPlayer = makeLinePlayer(d, pr.partner, function (st, j) {
        setNow(list, st === "playing" || st === "paused" ? nodes[j] : null);
        if (st === "playing" && nodes[j]) scrollNear(nodes[j]);
        if (st === "finished" && mayFocus(section)) focusTurnTarget();
      });
      rpPlayer.start(0);
    }
    if (pr.learner) renderTurn(d, run);
    else finishRun(d, run);
    // No partner audio: the input (or the summary) is usable at once; focus it if the learner hasn't moved away.
    if (!rpPlayer && mayFocus($("dia-rp"))) focusTurnTarget();
  }

  function focusTurnTarget() {
    var t = $("dia-rp-input") || $("dia-rp-reveal") || $("dia-rp-summary-h");
    if (t && !t.hidden) t.focus();
  }

  function renderTurn(d, run) {
    var turn = $("dia-rp-turn");
    if (!turn) return;
    C.UI.clear(turn);
    var line = run.current;
    var sp = speakerOf(d, run.role);
    var voice = sp.voice;
    var card = el("section", { className: "dia-turn", "aria-labelledby": "dia-turn-h" }, [
      el("h5", { id: "dia-turn-h", tabindex: "-1", text: "Your turn: " + sp.name }),
      el("p", { id: "dia-cue" }, ["Say it in French: ", el("strong", { text: line.en })])
    ]);
    turn.appendChild(card);
    var live = el("p", { className: "feedback", id: "dia-rp-feedback", role: "status", "aria-live": "polite" });
    var fbSlot = el("div", { className: "fb-slot" });
    var next = el("button", { type: "button", className: "btn btn-primary", id: "dia-rp-next", "aria-keyshortcuts": "N ArrowRight", hidden: true,
      text: DLG.partnerRun(d, run.role, run.index).learner || DLG.partnerRun(d, run.role, run.index).partner.length ? "Next →" : "See results" });
    next.addEventListener("click", function () { advance(d, run); });   // synchronous: the next partner clip starts here

    function graded(result, wrote) {
      run.graded = true;
      run.results[line.id] = { correct: !!result.correct, exact: !!result.exact, shown: !!result.shown, wrote: wrote || "" };
      C.recordDay(!!result.correct);
      appendTranscript(d, run, line, true);
    }
    function showPanel(result, wrote) {
      C.UI.clear(fbSlot);
      var fp = C.UI.feedbackPanel(result, {}, { index: run.transcript.length, answer: {
        french: line.fr, pronunciation: line.pron, english: line.en, listenText: line.fr, listenVoice: voice } });
      fbSlot.appendChild(fp.node);
      if (wrote && !(result.correct && result.exact)) {
        fbSlot.appendChild(el("p", { className: "dia-wrote" }, ["You wrote: ", el("span", { lang: "fr", text: wrote })]));
      }
      if (!result.correct && !result.shown) {
        var alts = line.accept.slice(1, 4);
        if (alts.length) {
          var kids = ["Also accepted: "];
          alts.forEach(function (a, i) { if (i) kids.push(" · "); kids.push(el("span", { lang: "fr", text: a })); });
          fbSlot.appendChild(el("p", { className: "dia-alts" }, kids));
        }
      }
      live.className = "feedback visually-hidden " + (result.correct ? "is-success" : "is-error");
      live.textContent = fp.live;
      next.hidden = false;
      next.focus();
      scrollNear(fbSlot);
    }

    if (run.method === "typed") {
      var input = el("input", { type: "text", id: "dia-rp-input", lang: "fr", maxlength: "200", autocomplete: "off", autocapitalize: "off",
        autocorrect: "off", spellcheck: "false", "aria-describedby": "dia-cue" });
      var bar = el("div", { className: "accent-toolbar", id: "dia-rp-toolbar", role: "toolbar", "aria-label": "Insert accented letter",
        "aria-controls": "dia-rp-input", "data-for": "dia-rp-input" });
      var tol = el("input", { type: "checkbox", id: "dia-rp-tolerant", className: "tolerant-toggle" });
      var check = el("button", { type: "submit", className: "btn btn-primary", id: "dia-rp-check", text: "Check" });
      var showBtn = el("button", { type: "button", className: "btn", id: "dia-rp-show", "aria-keyshortcuts": "S" }, [C.UI.icon("eye"), el("span", { text: "Show answer" })]);
      var form = el("form", { className: "answer-form dia-rp-form", novalidate: true }, [
        el("label", { "for": "dia-rp-input", text: "Your line, in French" }),
        input, bar,
        el("div", { className: "field-check" }, [tol, el("label", { "for": "dia-rp-tolerant", text: "Accent-tolerant (accept answers typed without accents)" })]),
        el("div", { className: "actions" }, [check, showBtn, next]),
        live
      ]);
      card.appendChild(form);
      card.appendChild(fbSlot);
      C.buildToolbar(bar);
      C.bindTolerant(tol);
      function lock() { input.readOnly = true; check.hidden = true; showBtn.hidden = true; bar.hidden = true; }
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (run.graded) { if (!next.hidden) next.click(); return; }
        stopPlayer();
        var value = input.value;
        if (!value.trim()) {
          live.className = "feedback is-error";
          live.textContent = "Type your line first, then press Check.";
          return;
        }
        var r = DLG.checkLine(value, line.accept, { accentTolerant: state().settings.accentTolerant });
        var cls = r.correct && !r.exact
          ? { category: "accent-note", message: "Correct. Check the accents: " + r.expected,
              parts: ["Correct. Check the accents: ", { fr: true, strong: true, text: r.expected }] }
          : r.correct ? null : { category: "generic", message: "", parts: [] };
        var result = { correct: r.correct, exact: r.exact, hinted: false, shown: false, classification: cls };
        graded(result, value);
        lock();
        showPanel(result, value);
      });
      showBtn.addEventListener("click", function () {
        if (run.graded) return;
        stopPlayer();
        var result = { correct: false, exact: false, hinted: false, shown: true, classification: null };
        graded(result, "");
        lock();
        showPanel(result, "");
      });
      if (run.graded) {
        var prevR = run.results[line.id];
        lock();
        input.value = prevR.wrote;
        showPanel({ correct: prevR.correct, exact: prevR.exact, hinted: false, shown: prevR.shown,
          classification: prevR.correct && !prevR.exact ? { category: "accent-note", message: "Correct. Check the accents: " + line.fr,
            parts: ["Correct. Check the accents: ", { fr: true, strong: true, text: line.fr }] } : null }, prevR.wrote);
      }
    } else {
      var reveal = el("button", { type: "button", className: "btn btn-primary", id: "dia-rp-reveal", "aria-keyshortcuts": "S" }, [C.UI.icon("eye"), el("span", { text: "Show the line" })]);
      var shownBox = el("div", { className: "dia-rp-shown", hidden: true }, [
        el("p", { className: "fb-answer" }, [el("strong", { lang: "fr", text: line.fr }), " ", C.listenButton(line.fr, null, { voice: voice, who: sp.name })]),
        el("p", { className: "fb-pron", text: line.pron })
      ]);
      var notYet = el("button", { type: "button", className: "btn btn-error", id: "dia-rp-notyet", "aria-keyshortcuts": "1", hidden: true }, [C.UI.icon("x"), el("span", { text: "Not yet" })]);
      var gotIt = el("button", { type: "button", className: "btn btn-success", id: "dia-rp-gotit", "aria-keyshortcuts": "2", hidden: true }, [C.UI.icon("check"), el("span", { text: "I got it" })]);
      card.appendChild(el("p", { className: "hint", text: "Say your line out loud, then show it and mark yourself." }));
      card.appendChild(el("div", { className: "actions" }, [reveal]));
      card.appendChild(shownBox);
      card.appendChild(el("div", { className: "actions" }, [notYet, gotIt, next]));
      card.appendChild(live);
      card.appendChild(fbSlot);
      reveal.addEventListener("click", function () {
        stopPlayer();
        reveal.hidden = true;
        shownBox.hidden = false;
        if (!run.graded) { notYet.hidden = false; gotIt.hidden = false; gotIt.focus(); }
      });
      function mark(ok) {
        if (run.graded) return;
        stopPlayer();
        var result = { correct: ok, exact: ok, hinted: false, shown: false, classification: null };
        graded(result, "");
        notYet.hidden = true;
        gotIt.hidden = true;
        live.className = "feedback " + (ok ? "is-success" : "is-error");
        live.textContent = ok ? "Marked: you got it." : "Marked: not yet. It's in the summary to review.";
        next.hidden = false;
        next.focus();
      }
      notYet.addEventListener("click", function () { mark(false); });
      gotIt.addEventListener("click", function () { mark(true); });
      if (run.graded) {
        reveal.hidden = true;
        shownBox.hidden = false;
        live.textContent = run.results[line.id].correct ? "Marked: you got it." : "Marked: not yet.";
        next.hidden = false;
      }
    }
    // the evaluator slot (design §10): only when an evaluator is available; none ship, so never today
    var evs = DLG.evaluators.available({ protocol: location.protocol, method: run.method });
    if (evs.length) card.appendChild(el("div", { className: "dia-eval-slot" }));
  }

  function finishRun(d, run) {
    var turn = $("dia-rp-turn");
    if (!turn) return;
    var mine = learnerLines(d, run.role);
    var learnerTurns = mine.length;
    var correctTurns = mine.filter(function (l) { return run.results[l.id] && run.results[l.id].correct === true; }).length;
    var missed = mine.filter(function (l) { var r = run.results[l.id]; return !r || !r.correct; });
    var pct = learnerTurns ? Math.round((100 * correctTurns) / learnerTurns) : 0;
    if (!run.summary) {
      run.summary = true;
      DLG.recordRolePlay(state(), d.id, run.role, pct, today());
      C.save();
    }
    var st = state();
    var speaker = DLG.index(DATA()).speakerById[d.id][run.role];
    var card = C.UI.summaryCard({ length: learnerTurns, correct: correctTurns, missed: missed.map(function (line) {
      return { key: line.id, display: { prompt: line.en, promptLang: "en", french: line.fr, answerLang: "fr",
        pronunciation: line.pron, listenText: line.fr, voiceId: DLG.voiceOf(d, line.speaker) } };
    }) }, {
      primary: { label: "Swap roles", onClick: function () { startRun(d, otherSpeakerId(d, run.role)); } },
      secondary: [{ label: "Try again", onClick: function () { startRun(d, run.role); } },
        { label: "Back to the dialogue", href: "#dialogues/" + d.id, onSameHash: function () { renderDialogue(d, "listen", true); } }],
      extra: [{ label: "Take the comprehension quiz", href: "#dialogues/" + d.id + "/quiz" }].concat(nextEpisodeExtra(d)),
      dailyCount: C.LEARN.todayCount(st, Date.now()), dailyGoal: st.settings.dailyGoal,
      quizLine: "Best as " + speaker.name + ": " + st.dialogues[d.id].roles[run.role].best + "%"
    });
    var h = card.querySelector(".summary-heading");
    if (h) h.id = "dia-rp-summary-h";
    C.UI.clear(turn);
    turn.appendChild(card);
  }

  /* ---------- mode 3: comprehension quiz ---------- */
  function parkQuiz() {
    var area = $("diaq-area"), view = $("view-dialogues"), body = $("dialogues-body");
    if (!area || !view) return;
    if (area.parentNode !== view) view.insertBefore(area, body.nextSibling);
    area.hidden = true;
  }
  function quizKey(d) { return "dialogue|" + d.id + "|quiz"; }
  function quizInit(d) { return function () { var ks = DLG.quizKeys(DATA(), d.id); return { length: ks.length, items: ks }; }; }
  function renderQuizItem(s, focus) {
    var it = DLG.choiceItem(DATA(), s.items[s.index], Math.random);
    if (!it) return;
    var g = it.legend;
    it.legendParts = [g.before, el("strong", { lang: g.strongLang, text: g.strong }), g.after];
    s.current = it;
    $("diaq-summary").hidden = true;
    $("diaq-form").hidden = false;
    quiz.renderItem(s);
    if (focus) quiz.focusFirstOption();
  }
  function renderQuiz(d, section) {
    var area = $("diaq-area");
    section.appendChild(el("p", { className: "hint", text: "Questions follow the story. Each answer counts towards Review my mistakes and your daily goal." }));
    section.appendChild(area);
    area.hidden = false;
    var s = C.SESSION.getOrStart(quizKey(d), quizInit(d));
    quizSession = s;
    if (s.resumed && s.current) { $("diaq-summary").hidden = true; $("diaq-form").hidden = false; quiz.renderItem(s); }
    else renderQuizItem(s, false);
  }
  function onQuizNext() {
    var s = quizSession;
    if (!s || !current) return;
    var d = current.d;
    C.SESSION.advance(s, {
      onNext: function () { s.current = null; C.SESSION.resetUi(s); renderQuizItem(s, true); },
      onDone: function () {
        var pct = s.length ? Math.round((100 * s.correct) / s.length) : 0;
        DLG.recordQuiz(state(), d.id, pct, today());
        C.save();
        var st = state();
        var slot = $("diaq-summary");
        C.UI.clear(slot);
        var card = C.UI.summaryCard(s, {
          primary: { label: "Try again", onClick: function () {
            quizSession = C.SESSION.restart(quizKey(d), quizInit(d));
            renderQuizItem(quizSession, true);
          } },
          secondary: [{ label: "Back to the dialogue", href: "#dialogues/" + d.id, onSameHash: function () { renderDialogue(d, "listen", true); } }],
          extra: [{ label: "Review my mistakes", href: "#review" }].concat(nextEpisodeExtra(d)),
          dailyCount: C.LEARN.todayCount(st, Date.now()), dailyGoal: st.settings.dailyGoal,
          quizLine: "Best score: " + st.dialogues[d.id].quizBest + "%"
        });
        slot.appendChild(card);
        $("diaq-form").hidden = true;
        slot.hidden = false;
        C.UI.sessionBar($("diaq-bar"), s);
        card.querySelector(".summary-heading").focus();
      }
    });
  }

  /* ---------- keyboard (app.js onShortcutKey → onKey) ---------- */
  function shown(b) { return !!b && !b.hidden && !b.disabled && b.offsetParent !== null; }
  function clickIf(b) { if (shown(b)) { b.click(); return true; } return false; }
  function onKey(k) {
    if (!current) return false;
    if (current.mode === "quiz") {
      var form = $("diaq-form");
      if (!form || form.hidden) return false;
      if (k === "n") return clickIf($("diaq-next"));
      if (k === "l") return clickIf(form.querySelector(".listen-slot .listen"));
      if (/^[1-4]$/.test(k)) {
        var r = form.querySelectorAll("input[type='radio']")[Number(k) - 1];
        var check = $("diaq-check");
        if (r && !r.disabled && shown(check)) { r.click(); check.click(); return true; }
      }
      return false;
    }
    if (current.mode === "roleplay") {
      if (k === "s") return clickIf($("dia-rp-show")) || clickIf($("dia-rp-reveal"));
      if (k === "n") return clickIf($("dia-rp-next"));
      if (k === "1") return clickIf($("dia-rp-notyet"));
      if (k === "2") return clickIf($("dia-rp-gotit"));
      if (k === "l") {
        var turn = $("dia-rp-turn");
        return !!turn && clickIf(turn.querySelector(".fb-slot .listen, .dia-rp-shown:not([hidden]) .listen"));
      }
    }
    return false;
  }

  /* ---------- view entry points ---------- */
  function show(ctx, r) {
    C = ctx;
    DLG = window.VT_DLG;
    stopPlayer();
    player = null;
    parkQuiz();
    var body = $("dialogues-body");
    C.UI.clear(body);
    current = null;
    var D = DATA();
    if (!D || !D.dialogues || !D.dialogues.length || !DLG) {
      body.appendChild(el("p", { className: "notice", text: "The dialogues are missing. Keep the js folder together (dialogues-data.js and dialogues.js)." }));
      return;
    }
    var d = r && r.dialogueId ? DLG.index(D).byId[r.dialogueId] || null : null;
    if (r && r.scope === "dialogue" && !d) history.replaceState(null, "", "#dialogues");
    if (!d) { renderIndex(body); return; }
    renderDialogue(d, r.mode || "listen", false);
  }

  function build(ctx) {
    C = ctx;
    DLG = window.VT_DLG;
    quiz = ctx.makeChoicePanel("diaq", {
      ids: { form: "diaq-form", legend: "diaq-legend", options: "diaq-options", feedback: "diaq-feedback",
        check: "diaq-check", next: "diaq-next", listen: "diaq-listen-slot" },
      radioName: "diaq-opt",
      getSession: function () { return quizSession; },
      onNext: onQuizNext
    });
    // Capture phase: runs before app.js's bubble listener starts the new sound, so only one sequence plays.
    document.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("button.listen, button.listen-word") : null;
      if (btn && !btn.disabled) stopPlayer();
    }, true);
    window.addEventListener("hashchange", function () { stopPlayer(); });
    window.addEventListener("beforeprint", function () {
      printing = true;
      stopPlayer();
      Array.prototype.forEach.call(document.querySelectorAll("#view-dialogues .dia-lines"), function (o) { o.classList.remove("dia-hide-en"); });
    });
    window.addEventListener("afterprint", function () {
      if (!printing) return;
      printing = false;
      var on = showEnglish();
      Array.prototype.forEach.call(document.querySelectorAll("#view-dialogues .dia-lines"), function (o) { o.classList.toggle("dia-hide-en", !on); });
    });
  }

  function onStateReplaced() {
    stopPlayer();
    runs = {};
    rpPrefs = {};
    levelFilter = "all";
    focusStories = false;
  }

  window.VT_VIEWS.dialogues = { build: build, show: show, onKey: onKey, onStateReplaced: onStateReplaced };
})();
