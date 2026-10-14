/* Grammar tables view: the quick-reference tables from reference-data.js (window.VT_REFERENCE).
   Routes: #tables (all categories), #tables/<categoryId> (that category open, focused),
   #tables/<categoryId>/<tableId> (that table's card focused). One page for all three; unknown ids
   are rewritten to the nearest valid route. All strings go through textContent (VT_UI.el); no inline
   styles (CSP). Every French cell has a pronunciation and a compact Listen button. */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var C = null;
  var openState = {};        // categoryId -> open? (kept across re-renders)
  var printRestore = null;   // fold states saved by beforeprint
  var PDF_HREF = "reference/french-grammar-tables.pdf";
  var MD_HREF = "reference/french-grammar-tables.md";

  function REF() { return window.VT_REFERENCE; }
  function el(tag, attrs, kids) { return C.UI.el(tag, attrs, kids); }
  function listen(text) { return C.listenButton(text, null, { compact: true }); }

  function verbHref(id) {
    var lid = C.lessonOf && C.lessonOf[id];
    return lid != null ? "#browse/lesson/" + lid + "/" + id : "#browse";
  }
  function linkNode(l) {
    return el("a", { href: l.verbId ? verbHref(l.verbId) : l.href, lang: l.verbId ? "fr" : null, text: l.label });
  }
  function seeAlso(links) {
    if (!links || !links.length) return null;
    var kids = ["See also: "];
    links.forEach(function (l, i) {
      if (i) kids.push(" · ");
      kids.push(linkNode(l));
    });
    return el("p", { className: "ref-links" }, kids);
  }
  function previewBadge() { return el("span", { className: "ref-preview", text: "Preview" }); }

  function findCategory(D, id) {
    for (var i = 0; i < D.categories.length; i++) if (D.categories[i].id === id) return D.categories[i];
    return null;
  }
  function findTable(cat, id) {
    for (var i = 0; i < cat.tables.length; i++) if (cat.tables[i].id === id) return cat.tables[i];
    return null;
  }

  /* ---------- one table ---------- */
  function listTable(t) {
    var cols = ["French", "Pronunciation", "English"];
    if (t.infoLabel) cols.push(t.infoLabel);
    var head = cols.map(function (h) { return el("th", { scope: "col", text: h }); });
    head.push(el("th", { scope: "col" }, [el("span", { className: "visually-hidden", text: "Listen" })]));
    var body = t.rows.map(function (row) {
      var frKids = row.verbId ? [el("a", { href: verbHref(row.verbId), text: row.fr })] : [row.fr];
      var cells = [
        el("th", { scope: "row", lang: "fr" }, frKids),
        el("td", { className: "pron", text: row.pron }),
        el("td", { text: row.en })
      ];
      if (t.infoLabel) cells.push(el("td", { className: "ref-info", lang: t.infoLang && row.info ? t.infoLang : null, text: row.info || "" }));
      cells.push(el("td", { className: "listen-cell" }, [listen(row.say || row.fr)]));
      return el("tr", null, cells);
    });
    return el("table", { className: "ref-table" }, [
      el("caption", { text: t.caption }),
      el("thead", null, [el("tr", null, head)]),
      el("tbody", null, body)
    ]);
  }

  function gridTable(t) {
    var head = [el("th", { scope: "col", text: "Person" })].concat(t.columns.map(function (c) {
      return el("th", { scope: "col" }, c.verbId ? [el("a", { href: verbHref(c.verbId), text: c.label })] : [c.label]);
    }));
    var body = t.rows.map(function (row) {
      return el("tr", null, [el("th", { scope: "row", lang: "fr", text: row.head })].concat(row.cells.map(function (cell) {
        return el("td", { className: "ref-grid-cell" }, [
          el("span", { className: "ref-grid-fr", lang: "fr", text: cell.fr }),
          el("span", { className: "pron", text: cell.pron }),
          listen(cell.say || cell.fr)
        ]);
      })));
    });
    return el("table", { className: "ref-table ref-grid" }, [
      el("caption", { text: t.caption }),
      el("thead", null, [el("tr", null, head)]),
      el("tbody", null, body)
    ]);
  }

  function examples(t) {
    return el("ul", { className: "ref-examples", "aria-label": "Examples" }, t.examples.map(function (e) {
      return el("li", null, [
        el("strong", { lang: "fr", text: e.fr }), " ", listen(e.fr), " ",
        el("span", { className: "pron", text: "(" + e.pron + ")" }), " ",
        el("span", { className: "ref-en", text: e.en })
      ]);
    }));
  }

  function watchOut(t) {
    return el("div", { className: "ref-watch", role: "note", "aria-label": "Watch out" }, [
      el("p", { className: "ref-watch-h", text: "Watch out" }),
      el("ul", null, t.watchOut.map(function (w) {
        if (w.note) return el("li", { text: w.note });
        return el("li", null, [
          el("span", { "aria-hidden": "true", text: "✗ " }), el("span", { className: "visually-hidden", text: "Wrong: " }),
          el("span", { className: "ref-wrong", lang: "fr", text: w.wrong }),
          el("span", { "aria-hidden": "true", text: " → ✓ " }), el("span", { className: "visually-hidden", text: ". Right: " }),
          el("strong", { lang: "fr", text: w.right }),
          w.pron ? el("span", { className: "pron", text: " (" + w.pron + ")" }) : null,
          w.why ? " — " + w.why : null
        ]);
      }))
    ]);
  }

  function tableCard(cat, t) {
    var hid = "tbl-h-" + t.id;
    return el("article", { className: "ref-card", id: "tbl-" + t.id, "aria-labelledby": hid }, [
      el("h4", { id: hid, tabindex: "-1" }, [el("span", { text: t.title }), t.preview ? " " : null, t.preview ? previewBadge() : null]),
      el("p", { className: "ref-when" }, [el("span", { className: "ref-label", text: "When: " }), t.when]),
      C.UI.tableRegion(t.title + " (table, scrolls sideways)", t.kind === "grid" ? gridTable(t) : listTable(t)),
      examples(t),
      watchOut(t),
      seeAlso(t.links)
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
      el("a", { className: "btn", href: MD_HREF }, [el("span", { text: "Markdown" })])
    ]);
  }

  function toc(D) {
    return el("nav", { className: "tables-toc", "aria-label": "Grammar tables contents" }, [
      el("ol", null, D.categories.map(function (cat) {
        var a = el("a", { href: "#tables/" + cat.id }, [
          el("span", { className: "tables-toc-title", text: cat.number + ". " + cat.title }),
          el("span", { className: "tables-toc-sum", lang: "fr", text: cat.summary })
        ]);
        a.addEventListener("click", function (ev) {
          // Same hash: no hashchange, so open and focus the category here.
          if (location.hash === a.getAttribute("href")) { ev.preventDefault(); show(C, { scope: "category", categoryId: cat.id }); }
        });
        return el("li", null, [a]);
      }))
    ]);
  }

  function category(cat) {
    var hid = "tcat-h-" + cat.id;
    var previews = cat.tables.filter(function (t) { return t.preview; }).length;
    var fold = el("details", { className: "lesson-fold tables-fold", "data-cat": cat.id }, [
      el("summary", { className: "lesson-summary" }, [
        el("h3", { id: hid, tabindex: "-1", text: cat.number + ". " + cat.title }),
        el("span", { className: "lesson-summary-count", text: cat.tables.length + (cat.tables.length === 1 ? " table" : " tables") +
          (previews ? ", " + previews + " preview" : "") })
      ]),
      el("div", { className: "tables-cat-body" }, [
        cat.intro ? el("p", { className: "intro", text: cat.intro }) : null,
        seeAlso(cat.links),
        el("div", { className: "cards ref-cards" }, cat.tables.map(function (t) { return tableCard(cat, t); }))
      ])
    ]);
    fold.open = !!openState[cat.id];
    fold.addEventListener("toggle", function () { if (!printRestore) openState[cat.id] = fold.open; });
    return el("section", { className: "tables-cat", id: "tcat-" + cat.id, "aria-labelledby": hid }, [fold]);
  }

  function show(ctx, r) {
    C = ctx;
    var body = $("tables-body");
    var D = REF();
    C.UI.clear(body);
    if (!D || !D.categories || !D.categories.length) {
      body.appendChild(el("p", { className: "notice", text: "The grammar tables are missing. Keep the js folder together (reference-data.js)." }));
      return;
    }
    var scope = r && r.scope || "all";
    var cat = r && r.categoryId ? findCategory(D, r.categoryId) : null;
    var table = cat && r.tableId ? findTable(cat, r.tableId) : null;
    if (r && r.categoryId && !cat) { history.replaceState(null, "", "#tables"); scope = "all"; }
    else if (scope === "table" && !table) { history.replaceState(null, "", "#tables/" + cat.id); scope = "category"; }
    if (scope === "all" && !Object.keys(openState).length) openState[D.categories[0].id] = true;
    if (cat) openState[cat.id] = true;

    body.appendChild(el("p", { className: "intro", text: D.intro }));
    body.appendChild(el("p", { className: "muted", text: D.respellingNote }));
    body.appendChild(toolbar());
    body.appendChild(toc(D));
    D.categories.forEach(function (c) { body.appendChild(category(c)); });

    var target = scope === "table" ? $("tbl-h-" + table.id) : scope === "category" ? $("tcat-h-" + cat.id) : null;
    if (target) {
      // After the router's heading focus: move focus to the category or table.
      setTimeout(function () { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" }); }, 0);
    }
  }

  function build(ctx) {
    C = ctx;
    // Print every category: open all folds for printing, then put them back.
    window.addEventListener("beforeprint", function () {
      var folds = document.querySelectorAll(".tables-fold");
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

  window.VT_VIEWS.tables = { build: build, show: show };
})();
