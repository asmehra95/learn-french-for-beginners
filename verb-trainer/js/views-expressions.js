/* Everyday expressions view: the 100 phrases from expressions-data.js (window.VT_EXPRESSIONS).
   Routes: #expressions (all themes), #expressions/<themeId> (that theme open, focused),
   #expressions/<themeId>/<exprId> (that card focused). One page for all three; unknown ids are rewritten
   to the nearest valid route. All strings go through textContent (VT_UI.el); no inline styles (CSP).
   Every card has a respelling and two compact Listen buttons (the expression and its example), whose
   texts the corpus extractor mirrors (tts-tools/extract-corpus.js). */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var C = null;
  var EXPR = null;           // window.VT_EXPR
  var openState = {};        // themeId -> open? (kept across re-renders)
  var printRestore = null;   // fold states saved by beforeprint
  var PDF_HREF = "reference/french-expressions.pdf";
  var MD_HREF = "reference/french-expressions.md";

  function DATA() { return window.VT_EXPRESSIONS; }
  function el(tag, attrs, kids) { return C.UI.el(tag, attrs, kids); }
  function listen(text) { return C.listenButton(text, null, { compact: true }); }

  function verbHref(id) {
    var lid = C.lessonOf && C.lessonOf[id];
    return lid != null ? "#browse/lesson/" + lid + "/" + id : "#browse";
  }

  /* Table id -> { categoryId, title } from the grammar tables, for #tables/<categoryId>/<tableId> links. */
  function tableMap() {
    var out = {};
    var ref = window.VT_REFERENCE;
    ((ref && ref.categories) || []).forEach(function (c) {
      (c.tables || []).forEach(function (t) { out[t.id] = { categoryId: c.id, title: t.title }; });
    });
    return out;
  }

  function registerPill(e) {
    return el("span", { className: "expr-register", "data-register": e.register, text: EXPR.REGISTER_LABEL[e.register] || e.register });
  }

  /* "See also:" verbs, then grammar tables, then other expressions. Unknown ids are skipped. */
  function seeAlso(e, tableById, byId) {
    var links = [];
    (e.verbs || []).forEach(function (id) {
      var v = C.verbsById[id];
      if (v) links.push(el("a", { href: verbHref(id), lang: "fr", text: v.infinitive }));
    });
    (e.tables || []).forEach(function (id) {
      var t = tableById[id];
      if (t) links.push(el("a", { href: "#tables/" + t.categoryId + "/" + id, text: t.title }));
    });
    (e.see || []).forEach(function (id) {
      var o = byId[id];
      if (o) links.push(el("a", { href: "#expressions/" + o.theme + "/" + o.id, lang: "fr", text: o.fr }));
    });
    if (!links.length) return null;
    var kids = ["See also: "];
    links.forEach(function (a, i) {
      if (i) kids.push(" · ");
      kids.push(a);
    });
    return el("p", { className: "ref-links" }, kids);
  }

  function card(e, tableById, byId) {
    var hid = "expr-h-" + e.id;
    return el("article", { className: "ref-card expr-card", id: "expr-" + e.id, "aria-labelledby": hid }, [
      el("h4", { id: hid, tabindex: "-1" }, [el("span", { lang: "fr", text: e.fr }), " ", registerPill(e)]),
      el("p", { className: "expr-say" }, [el("span", { className: "pron", text: e.pron }), " ", listen(EXPR.speakText(e))]),
      el("p", { className: "expr-en", text: e.en }),
      e.literal ? el("p", { className: "expr-literal", text: "Literally: " + e.literal }) : null,
      el("div", { className: "expr-example" }, [
        el("p", { className: "ref-label", text: "Example" }),
        el("p", null, [
          el("strong", { lang: "fr", text: e.example.fr }), " ", listen(e.example.fr), " ",
          el("span", { className: "pron", text: "(" + e.example.pron + ")" }), " ",
          el("span", { className: "ref-en", text: e.example.en })
        ])
      ]),
      e.note ? el("p", { className: "expr-note", role: "note" }, [el("span", { className: "ref-label", text: "Note: " }), e.note]) : null,
      seeAlso(e, tableById, byId)
    ]);
  }

  /* ---------- page ---------- */
  function toolbar() {
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
      el("a", { className: "btn", href: PDF_HREF }, [el("span", { text: "Printable PDF" })]),
      el("a", { className: "btn", href: MD_HREF }, [el("span", { text: "Markdown" })]),
      el("a", { className: "btn btn-primary", href: "#flashcards/expressions" }, [C.UI.icon("layers"), el("span", { text: "Practise with flashcards" })])
    ]);
  }

  function toc(D) {
    return el("nav", { className: "tables-toc", "aria-label": "Expressions contents" }, [
      el("ol", null, D.themes.map(function (t) {
        var a = el("a", { href: "#expressions/" + t.id }, [
          el("span", { className: "tables-toc-title", text: t.number + ". " + t.title }),
          el("span", { className: "tables-toc-sum", lang: "fr", text: t.summary })
        ]);
        a.addEventListener("click", function (ev) {
          // Same hash: no hashchange, so open and focus the theme here.
          if (location.hash === a.getAttribute("href")) { ev.preventDefault(); show(C, { scope: "theme", themeId: t.id }); }
        });
        return el("li", null, [a]);
      }))
    ]);
  }

  function theme(t, list, tableById, byId) {
    var hid = "xtheme-h-" + t.id;
    var fold = el("details", { className: "lesson-fold expr-fold", "data-theme": t.id }, [
      el("summary", { className: "lesson-summary" }, [
        el("h3", { id: hid, tabindex: "-1", text: t.number + ". " + t.title }),
        el("span", { className: "lesson-summary-count", text: list.length + (list.length === 1 ? " expression" : " expressions") })
      ]),
      el("div", { className: "tables-cat-body" }, [
        t.intro ? el("p", { className: "intro", text: t.intro }) : null,
        el("p", { className: "expr-practise" }, [
          el("a", { href: "#flashcards/expressions/" + t.id, text: "Practise these with flashcards" })
        ]),
        el("div", { className: "cards ref-cards expr-cards" }, list.map(function (e) { return card(e, tableById, byId); }))
      ])
    ]);
    fold.open = !!openState[t.id];
    fold.addEventListener("toggle", function () { if (!printRestore) openState[t.id] = fold.open; });
    return el("section", { className: "expr-theme", id: "xtheme-" + t.id, "aria-labelledby": hid }, [fold]);
  }

  function show(ctx, r) {
    C = ctx;
    EXPR = window.VT_EXPR;
    var body = $("expressions-body");
    var D = DATA();
    C.UI.clear(body);
    if (!D || !D.themes || !D.themes.length || !D.expressions || !EXPR) {
      body.appendChild(el("p", { className: "notice", text: "The expressions are missing. Keep the js folder together (expressions-data.js)." }));
      return;
    }
    var ix = EXPR.index(D);
    var scope = r && r.scope || "all";
    var th = r && r.themeId ? ix.themeById[r.themeId] || null : null;
    var item = th && r.exprId ? ix.byId[r.exprId] || null : null;
    if (item && item.theme !== th.id) item = null;
    if (r && r.themeId && !th) { history.replaceState(null, "", "#expressions"); scope = "all"; }
    else if (scope === "item" && !item) { history.replaceState(null, "", "#expressions/" + th.id); scope = "theme"; }
    if (scope === "all" && !Object.keys(openState).length) openState[D.themes[0].id] = true;
    if (th) openState[th.id] = true;

    var tableById = tableMap();
    body.appendChild(el("p", { className: "intro", text: D.intro }));
    body.appendChild(el("p", { className: "muted", text: D.respellingNote }));
    body.appendChild(el("p", { className: "muted expr-register-note" }, [el("span", { className: "ref-label", text: "Register: " }), D.registerNote]));
    body.appendChild(toolbar());
    body.appendChild(toc(D));
    D.themes.forEach(function (t) { body.appendChild(theme(t, ix.byTheme[t.id] || [], tableById, ix.byId)); });

    var target = scope === "item" ? $("expr-h-" + item.id) : scope === "theme" ? $("xtheme-h-" + th.id) : null;
    if (target) {
      // After the router's heading focus: move focus to the theme or card.
      setTimeout(function () { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" }); }, 0);
    }
  }

  function build(ctx) {
    C = ctx;
    // Print every theme: open all folds for printing, then put them back.
    window.addEventListener("beforeprint", function () {
      var folds = document.querySelectorAll(".expr-fold");
      printRestore = [];
      Array.prototype.forEach.call(folds, function (f) { printRestore.push([f, f.open]); f.open = true; });
    });
    window.addEventListener("afterprint", function () {
      if (!printRestore) return;
      var saved = printRestore;
      saved.forEach(function (p) { p[0].open = p[1]; });
      setTimeout(function () { printRestore = null; }, 0); // after the toggle events
    });
  }

  window.VT_VIEWS.expressions = { build: build, show: show };
})();
