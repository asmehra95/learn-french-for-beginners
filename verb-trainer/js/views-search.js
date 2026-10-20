/* Global search panel (#dlg-search): a WAI-ARIA combobox over the VT_SEARCH index, opened from the
   header Search button, the bottom-nav Search button, "/" (a single-key shortcut) or Ctrl/Cmd+K.
   Registered as a view for ctx only; it is an overlay, not a route (show is a no-op).
   All text goes through textContent (VT_UI.el); no inline styles (CSP). Verb results never show the
   verb type unless the index put one on the result (only for a type-keyword search). */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var VERB_CAP = 20, TOPIC_CAP = 5, TABLE_CAP = 5, EXPR_CAP = 5, DLG_CAP = 5;
  var C = null, S = null;
  var dlg, input, listbox, empty, status;
  var options = [];   // flat list: { node, act, data }
  var active = -1;
  var showAll = false;
  var last = null;    // last search result
  var announceTimer = null;

  function el(tag, attrs, kids) { return C.UI.el(tag, attrs, kids); }
  function sep() { return el("span", { className: "visually-hidden", text: ", " }); }

  function isOpen() { return dlg.open || dlg.classList.contains("is-open"); }

  function open(opener) {
    if (isOpen()) { input.focus(); input.select(); return; }
    C.UI.openDialog(dlg, opener || document.activeElement);
    input.focus();
    input.select();
    render(input.value);
    announce(input.value.trim() ? null : "Type to search. Examples: " + S.EXAMPLES.join(", ") + ".");
  }

  /* Close, then run fn once the dialog's focus restore has happened, so the route's focus wins. */
  function closeThen(fn) {
    if (typeof dlg.close === "function" && dlg.open) {
      dlg.addEventListener("close", function once() {
        dlg.removeEventListener("close", once);
        if (fn) fn();
      });
      C.UI.closeDialog(dlg);
    } else {
      C.UI.closeDialog(dlg);
      if (fn) fn();
    }
  }

  function go(hash) { closeThen(function () { C.go(hash); }); }

  function announce(text) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () {
      if (text == null) {
        if (!last || !last.key) return;
        if (!last.total) text = "No results." + (last.suggestion ? " Closest verb: " + last.suggestion.infinitive + "." : "");
        else text = last.verbs.length + (last.verbs.length === 1 ? " verb, " : " verbs, ") + last.tables.length + (last.tables.length === 1 ? " table, " : " tables, ") +
          last.expressions.length + (last.expressions.length === 1 ? " expression, " : " expressions, ") +
          (last.dialogues || []).length + ((last.dialogues || []).length === 1 ? " dialogue" : " dialogues") +
          " and " + last.topics.length + (last.topics.length === 1 ? " topic" : " topics") + " found.";
      }
      status.textContent = text;
    }, 400);
  }

  function option(id, act, data, attrs, kids) {
    var a = { role: "option", id: id, className: "search-opt" + (attrs && attrs.className ? " " + attrs.className : ""), "aria-selected": "false", "data-act": act };
    if (attrs && attrs.label) a["aria-label"] = attrs.label;
    if (attrs && attrs.lang) a.lang = attrs.lang;
    var node = el("div", a, kids);
    options.push({ node: node, act: act, data: data });
    return node;
  }

  function group(id, label, kids) {
    return el("div", { role: "group", className: "search-group", "aria-labelledby": id }, [
      el("div", { role: "presentation", id: id, className: "search-group-h", text: label })
    ].concat(kids));
  }

  function verbRow(r, i) {
    var why = [];
    if (r.matchLabel) why.push(el("span", { lang: r.matchLang || null, text: r.matchLabel }), " · ");
    why.push(r.matchDetail || "");
    if (r.type && r.type !== r.matchDetail) why.push(" · " + r.type);
    var speak = C.L.speakableText(r.listenText);
    return el("div", { role: "none", className: "search-row" }, [
      option("so-" + i, "open", r, { className: "search-main" }, [
        el("span", { className: "search-line" }, [
          el("span", { className: "search-inf", lang: "fr", text: r.infinitive }), sep(),
          el("span", { className: "search-meaning", text: r.meaning }), sep()
        ]),
        el("span", { className: "search-why" }, why), sep(),
        el("span", { className: "search-lesson-num", text: "Lesson " + r.lessonId })
      ]),
      option("so-" + i + "-l", "listen", r, { className: "search-listen", label: "Listen: " + speak }, [
        C.UI.icon("volume-2"), el("span", { className: "search-act-text", "aria-hidden": "true", text: "Listen" })
      ]),
      option("so-" + i + "-g", "lesson", r, { className: "search-lesson", label: "Go to Lesson " + r.lessonId }, [
        el("span", { "aria-hidden": "true", text: "L" + r.lessonId })
      ])
    ]);
  }

  function topicRow(t, i) {
    return el("div", { role: "none", className: "search-row" }, [
      option("st-" + i, "topic", t, { className: "search-main search-topic" }, [
        el("span", { className: "search-line" }, [
          el("span", { className: "search-topic-title", text: t.title }), sep(),
          el("span", { className: "search-meaning", text: "Topic: " + t.topicTitle })
        ]),
        t.matchDetail && t.matchDetail !== "lesson title" && t.matchDetail !== t.topicTitle ? sep() : null,
        t.matchDetail && t.matchDetail !== "lesson title" && t.matchDetail !== t.topicTitle ? el("span", { className: "search-why", text: t.matchDetail }) : null
      ])
    ]);
  }

  /* A grammar-table result: the table title and its category ("Grammar tables: Demonstratives"). */
  function tableRow(t, i) {
    var why = t.matchDetail && t.matchDetail !== "table title" && t.matchDetail !== t.categoryTitle ? t.matchDetail : null;
    return el("div", { role: "none", className: "search-row" }, [
      option("sr-" + i, "table", t, { className: "search-main search-table" }, [
        el("span", { className: "search-line" }, [
          el("span", { className: "search-topic-title", text: t.title }), sep(),
          el("span", { className: "search-meaning", text: "Grammar tables: " + t.categoryTitle })
        ]),
        why ? sep() : null,
        why ? el("span", { className: "search-why", text: why }) : null
      ])
    ]);
  }

  /* An everyday-expression result: the French, its English, the theme and the register (as text), plus Listen. */
  var REGISTER = { formal: "Formal", neutral: "Neutral", informal: "Informal" };
  function expressionRow(x, i) {
    var speak = C.L.speakableText(x.listenText);
    return el("div", { role: "none", className: "search-row" }, [
      option("se-" + i, "expression", x, { className: "search-main search-expr" }, [
        el("span", { className: "search-line" }, [
          el("span", { className: "search-inf", lang: "fr", text: x.fr }), sep(),
          el("span", { className: "search-meaning", text: x.en }), sep()
        ]),
        el("span", { className: "search-why", text: "Expressions: " + x.themeTitle + " · " + (REGISTER[x.register] || x.register) +
          (x.matchDetail ? " · " + x.matchDetail : "") })
      ]),
      option("se-" + i + "-l", "listen", { listenText: x.listenText, listenKey: null }, { className: "search-listen", label: "Listen: " + speak }, [
        C.UI.icon("volume-2"), el("span", { className: "search-act-text", "aria-hidden": "true", text: "Listen" })
      ])
    ]);
  }

  /* A dialogue result: the title (French and English) and "Dialogues: A1 · Julien and Camille". No Listen
     option: the dialogue page has its own. */
  function dialogueRow(x, i) {
    return el("div", { role: "none", className: "search-row" }, [
      option("sd-" + i, "dialogue", x, { className: "search-main search-dia" }, [
        el("span", { className: "search-line" }, [
          el("span", { className: "search-inf", lang: "fr", text: x.titleFr }), sep(),
          el("span", { className: "search-meaning", text: x.title }), sep()
        ]),
        el("span", { className: "search-why" }, [x.series
          ? "Story: " + x.seriesTitleFr + " · Episode " + x.episode + " of " + x.total + " · " + x.level + " · " + x.speakers.join(" and ")
          : "Dialogues: " + x.level + " · " + x.speakers.join(" and ")].concat(
          x.matchDetail ? [" · ", /^(line|proverb): /.test(x.matchDetail) ? el("span", { lang: "fr", text: x.matchDetail }) : x.matchDetail] : []))
      ])
    ]);
  }

  /* Dialogues go first when one matches strongly (score >= 85: its French title, title or a keyword such as
     "dialogue"), no verb has an exact infinitive or form match and no expression matches at all: so "dialogue"
     opens the dialogue with Enter while "l'addition" (the expression "L'addition, s'il vous plaît" matches it by
     prefix, score 50) keeps the expression first. */
  function dialoguesFirst(res) {
    var ds = res.dialogues || [];
    return !!(ds.length && ds[0].score >= 85 && !(res.verbs[0] && res.verbs[0].score >= S.SCORES.form) &&
      !res.expressions.length);
  }

  /* Expressions go first (before verbs and tables) when one matches strongly (score >= 80: French, a keyword or
     the whole English) and no verb has an exact infinitive or form match: "excuse me", "bon", "en avoir marre". */
  function expressionsFirst(res) {
    return !!(res.expressions.length && res.expressions[0].score >= 80 && !(res.verbs[0] && res.verbs[0].score >= S.SCORES.form));
  }

  /* Tables go first when a table matches strongly (a keyword or exact row, score >= 80) and no verb has an
     exact infinitive or form match: "cette", "le mien" and "quatre-vingts" open the table with Enter, while
     "du" (an exact form of devoir) keeps the verb first. */
  function tablesFirst(res) {
    return !!(res.tables.length && res.tables[0].score >= 80 && !(res.verbs[0] && res.verbs[0].score >= S.SCORES.form));
  }

  function render(query) {
    var UI = C.UI;
    options = [];
    UI.clear(listbox);
    var res = S.search(C.searchIndex, query);
    last = res;
    var kids = [];
    if (!res.key) {
      kids.push(group("sg-try", "Try", S.EXAMPLES.map(function (ex, i) {
        return el("div", { role: "none", className: "search-row" }, [
          option("sx-" + i, "example", ex, { className: "search-main search-example", lang: /^to /.test(ex) ? "en" : "fr" }, [el("span", { text: ex })])
        ]);
      })));
    } else {
      var vs = showAll ? res.verbs : res.verbs.slice(0, VERB_CAP);
      var ts = showAll ? res.topics : res.topics.slice(0, TOPIC_CAP);
      var tb = showAll ? res.tables : res.tables.slice(0, TABLE_CAP);
      var xs = showAll ? res.expressions : res.expressions.slice(0, EXPR_CAP);
      var dlgs = res.dialogues || [];
      var ds = showAll ? dlgs : dlgs.slice(0, DLG_CAP);
      var verbGroup = vs.length ? function () { kids.push(group("sg-verbs", "Verbs (" + res.verbs.length + ")", vs.map(verbRow))); } : function () {};
      var tableGroup = tb.length ? function () { kids.push(group("sg-tables", "Tables (" + res.tables.length + ")", tb.map(tableRow))); } : function () {};
      var exprGroup = xs.length ? function () { kids.push(group("sg-expr", "Expressions (" + res.expressions.length + ")", xs.map(expressionRow))); } : function () {};
      var diaGroup = ds.length ? function () { kids.push(group("sg-dia", "Dialogues (" + dlgs.length + ")", ds.map(dialogueRow))); } : function () {};
      if (dialoguesFirst(res))        { diaGroup(); verbGroup(); tableGroup(); exprGroup(); }
      else if (expressionsFirst(res)) { exprGroup(); verbGroup(); tableGroup(); diaGroup(); }
      else if (tablesFirst(res))      { tableGroup(); verbGroup(); exprGroup(); diaGroup(); }
      else                            { verbGroup(); tableGroup(); exprGroup(); diaGroup(); }
      if (ts.length) kids.push(group("sg-topics", "Topics (" + res.topics.length + ")", ts.map(topicRow)));
      if (vs.length < res.verbs.length || ts.length < res.topics.length || tb.length < res.tables.length || xs.length < res.expressions.length || ds.length < dlgs.length) {
        kids.push(el("div", { role: "none", className: "search-row" }, [
          option("so-all", "all", null, { className: "search-main search-all" }, [el("span", { text: "Show all " + res.total + " results" })])
        ]));
      }
    }
    kids.forEach(function (k) { listbox.appendChild(k); });
    listbox.hidden = !options.length;
    input.setAttribute("aria-expanded", options.length ? "true" : "false");
    renderEmpty(res);
    setActive(-1);
  }

  function renderEmpty(res) {
    var UI = C.UI;
    UI.clear(empty);
    if (!res.key || res.total) { empty.hidden = true; return; }
    empty.appendChild(el("p", null, ["No match for “", el("span", { lang: "fr", text: res.query.trim() }), "”."]));
    if (res.suggestion) {
      var b = el("button", { type: "button", className: "btn btn-small search-suggest" }, ["Did you mean ", el("span", { lang: "fr", text: res.suggestion.infinitive }), "?"]);
      b.addEventListener("click", function () { applySuggestion(); });
      empty.appendChild(b);
    }
    empty.appendChild(el("p", { className: "hint", text: "You can search French forms (suis, j'ai) or English meanings (to eat)." }));
    empty.hidden = false;
  }

  function applySuggestion() {
    if (!last || !last.suggestion) return;
    input.value = last.suggestion.infinitive;
    showAll = false;
    render(input.value);
    input.focus();
    announce(null);
  }

  function setActive(i) {
    if (active >= 0 && options[active]) options[active].node.setAttribute("aria-selected", "false");
    active = i >= 0 && i < options.length ? i : -1;
    if (active === -1) { input.removeAttribute("aria-activedescendant"); return; }
    var node = options[active].node;
    node.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", node.id);
    if (node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
  }

  function activate(i) {
    var o = options[i];
    if (!o) return;
    var r = o.data;
    if (o.act === "open") go(r.href);
    else if (o.act === "lesson") go(r.lessonHref);
    else if (o.act === "topic" || o.act === "table" || o.act === "expression" || o.act === "dialogue") go(r.href);
    else if (o.act === "listen") C.play(r.listenText, r.listenKey, false); // recorded clip first, then the device voice
    else if (o.act === "example") {
      input.value = r;
      showAll = false;
      render(r);
      input.focus();
      announce(null);
    } else if (o.act === "all") {
      showAll = true;
      render(input.value);
      setActive(Math.min(i, options.length - 1));
      announce(null);
    }
  }

  function firstOf(act) {
    for (var i = 0; i < options.length; i++) if (options[i].act === act) return i;
    return -1;
  }

  function onInputKey(ev) {
    if (ev.isComposing) return;
    var k = ev.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      ev.preventDefault();
      if (!options.length) return;
      if (k === "ArrowDown") setActive(active === -1 ? 0 : Math.min(active + 1, options.length - 1));
      else setActive(active === -1 ? options.length - 1 : Math.max(active - 1, 0));
    } else if (k === "Home" && active !== -1 && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      setActive(0);
    } else if (k === "Enter") {
      ev.preventDefault();
      if (active !== -1) { activate(active); return; }
      // The first result of the first group shown (same order as render()).
      var chain = !last || !last.key ? ["open", "table", "expression", "dialogue", "topic"]
        : dialoguesFirst(last)   ? ["dialogue", "open", "table", "expression", "topic"]
        : expressionsFirst(last) ? ["expression", "table", "open", "dialogue", "topic"]
        : tablesFirst(last)      ? ["table", "open", "expression", "dialogue", "topic"]
        :                          ["open", "table", "expression", "dialogue", "topic"];
      var i = -1;
      for (var c = 0; c < chain.length && i === -1; c++) i = firstOf(chain[c]);
      if (i !== -1) activate(i);
      else if (last && last.suggestion) applySuggestion();
    } else if (k === "Escape") {
      ev.preventDefault();
      closeThen(null);
    }
  }

  function onGlobalKey(ev) {
    if (ev.defaultPrevented || ev.isComposing || ev.altKey) return;
    var slash = ev.key === "/" && !ev.ctrlKey && !ev.metaKey;
    var cmdK = (ev.ctrlKey || ev.metaKey) && !ev.shiftKey && String(ev.key).toLowerCase() === "k";
    if (!slash && !cmdK) return;
    if (cmdK && isOpen()) {
      ev.preventDefault();
      input.focus();
      input.select();
      return;
    }
    if (C.isTypingTarget(ev.target)) return;
    if (slash && C.state().settings.singleKeyShortcuts === false) return;
    if (C.anyDialogOpen()) return;
    ev.preventDefault();
    open(document.activeElement);
  }

  function build(ctx) {
    C = ctx;
    S = window.VT_SEARCH;
    dlg = $("dlg-search");
    input = $("search-input");
    listbox = $("search-listbox");
    empty = $("search-empty");
    status = $("search-status");
    var triggers = [$("btn-search"), $("btn-search-bottom")];
    if (!ctx.searchIndex || !S || !dlg) {
      triggers.forEach(function (b) {
        if (!b) return;
        var li = b.closest(".bottom-list li");
        if (li) li.hidden = true;
        else b.hidden = true;
      });
      return;
    }
    var n = ctx.DATA.verbs.length;
    $("search-label").textContent = "Search all " + n + " verbs, every form, the English meanings, grammar tables, everyday expressions, dialogues and the topic lessons";
    triggers.forEach(function (b) {
      if (b) b.addEventListener("click", function (ev) { open(ev.currentTarget); });
    });
    input.addEventListener("input", function () {
      showAll = false;
      render(input.value);
      announce(null);
    });
    input.addEventListener("keydown", onInputKey);
    listbox.addEventListener("mousedown", function (ev) { if (ev.target.closest("[role='option']")) ev.preventDefault(); });
    listbox.addEventListener("click", function (ev) {
      var node = ev.target.closest("[role='option']");
      if (!node) return;
      for (var i = 0; i < options.length; i++) {
        if (options[i].node === node) {
          setActive(i);
          activate(i);
          if (isOpen()) input.focus();
          return;
        }
      }
    });
    document.addEventListener("keydown", onGlobalKey);
  }

  window.VT_VIEWS.search = { build: build, show: function () {} };
})();
