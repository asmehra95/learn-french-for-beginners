/* Explain view (#explain): mounts the French Explainer module (js/explainer.js, a byte-identical copy of
   explainer/explainer.js) when the site is served by the local helper over http, and shows how to start
   the helper when the page is opened as a file. Under file:// nothing here touches the network: the module
   is never mounted, so it never fetches. Registration only at load (§3.1 rule 6); DOM via VT_UI.el + textContent. */
(function () {
  "use strict";
  window.VT_VIEWS = window.VT_VIEWS || {};
  function $(id) { return document.getElementById(id); }

  var COMMAND = 'cd explainer && ./start.sh  # from the repo root';
  // 8775 first: on this Mac another app holds 8765, so the helper normally ends up on 8775.
  var HELPER_URLS = [
    { href: "http://127.0.0.1:8775/trainer/#explain", note: "" },
    { href: "http://127.0.0.1:8765/trainer/#explain", note: " (only if the helper printed this address)" }
  ];

  var inst = null; // the mounted explainer, kept so results survive leaving and coming back

  function voiceFrom(s) {
    s = s || {};
    return { voiceURI: s.voiceURI || "", voiceName: s.voiceName || "", rate: s.speechRate };
  }

  /* "Copy command": the Clipboard API when available, else select the text so Cmd+C copies it. */
  function copyCommand(code, status) {
    function selectIt() {
      try {
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        status.textContent = "The command is selected. Press Command+C to copy it.";
      } catch (e) {
        status.textContent = "Select the command above and copy it.";
      }
    }
    var cb = navigator.clipboard;
    if (cb && typeof cb.writeText === "function") {
      cb.writeText(COMMAND).then(function () {
        status.textContent = "✓ Copied. Paste it into Terminal and press Return.";
      }, selectIt);
    } else {
      selectIt();
    }
  }

  function renderFallback(ctx, body) {
    var UI = ctx.UI, el = UI.el;
    var n = ctx.DATA && ctx.DATA.verbs ? ctx.DATA.verbs.length : 0;
    var code = el("code", { id: "explain-command", text: COMMAND });
    var status = el("p", { className: "hint", id: "explain-copy-status", role: "status", "aria-live": "polite" });
    var copy = el("button", { type: "button", className: "btn", id: "explain-copy", text: "Copy command" });
    copy.addEventListener("click", function () { copyCommand(code, status); });
    body.appendChild(el("section", { className: "home-card explain-fallback", "aria-labelledby": "explain-fallback-h" }, [
      el("h3", { id: "explain-fallback-h" }, [UI.icon("languages"), el("span", { text: "Explain needs the local helper" })]),
      el("p", { text: "Paste French and get the English translation, a chunk-by-chunk breakdown with the grammar explained, " +
        "the verbs checked against " + (n ? "the " + n + " verbs" : "the verb tables") + " of this site, and Listen buttons. " +
        "It runs on this Mac with the Mistral model, so your text never leaves your computer." }),
      el("p", { text: "You opened this page as a file, which can't talk to the helper. Start the helper in Terminal:" }),
      el("pre", { className: "explain-command" }, [code]),
      el("div", { className: "actions" }, [copy]),
      status,
      el("p", null, ["Add ", el("code", { text: "--open" }), " at the end (", el("code", { text: "./start.sh --open" }),
        ") and it opens the Explain page for you."]),
      el("p", { id: "explain-port-note", text: "Use the address the helper prints; it picks 8775 or the next free port when 8765 is busy." }),
      el("ul", { className: "explain-links" }, HELPER_URLS.map(function (u, i) {
        return el("li", null, [el("a", { className: "text-link", id: "explain-open-" + i, href: u.href, text: "Open " + u.href + u.note })]);
      })),
      el("p", { className: "muted" }, ["Progress in this file version and in the helper version is stored separately. To move it, use Export and Import on ",
        el("a", { href: "#progress", text: "the Progress page" }), "."])
    ]));
  }

  window.VT_VIEWS.explain = {
    build: function (ctx) {
      // Settings changes (voice, rate) reach the mounted module live, without leaving the page.
      ctx.onVoiceChange(function (s) { if (inst) inst.setVoiceSettings(voiceFrom(s)); });
    },
    show: function (ctx) {
      var body = $("explain-body");
      var intro = document.querySelector("#view-explain > .intro");
      if (ctx.LEARN.explainMode(location.protocol) === "file") {
        if (intro) intro.hidden = false;
        ctx.UI.clear(body);
        renderFallback(ctx, body); // no fetch, no image, no frame
        return;
      }
      if (inst) {
        inst.setVoiceSettings(voiceFrom(ctx.state().settings));
        return;
      }
      ctx.UI.clear(body);
      var X = window.VT_EXPLAINER;
      if (!X || typeof X.mount !== "function") {
        body.appendChild(ctx.UI.el("p", { className: "notice", text: "explainer.js is missing. Keep the js folder together." }));
        return;
      }
      inst = X.mount(body, {
        apiBase: "",
        headingLevel: 3,
        voiceSettings: voiceFrom(ctx.state().settings),
        onNavigate: function (route) { ctx.navigate(route); }
      });
      // The module brings its own intro ("Paste a French sentence or short paragraph…"); hide the
      // view's near-identical one so the learner doesn't read the same sentence twice.
      if (intro) intro.hidden = true;
    }
  };
})();
