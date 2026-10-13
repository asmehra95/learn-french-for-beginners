/* Shared DOM helpers (design §3, §5.6, §7.4, §7.5): window.VT_UI.
   Classic script, no DOM access at load. innerHTML is used only for the generator-escaped
   *Html / html fields of VERB_DATA (passed as attrs.html); everything else is textContent. */
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "className") node.className = v;
        else if (k === "html") node.innerHTML = v; // only ever passed generator-escaped *Html fields
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fr(text, tag) { return el(tag || "span", { lang: "fr", text: text }); }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function tableRegion(label, table) {
    return el("div", { className: "table-wrap", role: "region", tabindex: "0", "aria-label": label }, [table]);
  }

  /* <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-name"></use></svg> (§5.6) */
  function icon(name, extraClass) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "icon" + (extraClass ? " " + extraClass : ""));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  /* ---------- Listen buttons (moved from app.js; §7.5 icon instead of emoji) ----------
     User decision (FEAT-003): the main Listen button always speaks the FULL phrase ("vous avez"): the
     pre-recorded clip when one exists and "Recorded voice" is on, else the device (computer) voice.
     When a native Lingua Libre clip exists, a second, smaller button.listen-word plays it
     ("Native speaker" when its manifest entry has scope "phrase", else "Native speaker (word only)"), shown only
     while "Show native-speaker word recordings" is on. Without speechSynthesis the main button falls back to the
     native clip and says whether it is word only (from the same scope). */
  var showWords = true;
  function setShowWords(on) { showWords = !!on; }

  /* Native clip label: full-phrase clips (manifest scope "phrase") say "Native speaker"; bare-word clips keep "(word only)". */
  function nativeLabel(entry, compact) {
    var phrase = !!entry && entry.scope === "phrase";
    if (compact) return phrase ? "Native" : "Word";
    return phrase ? "Native speaker" : "Native speaker (word only)";
  }
  function listenButton(text, key, opts) {
    var compact = !!(opts && opts.compact);
    var btn = el("button", {
      type: "button",
      className: "listen" + (compact ? " listen-compact" : ""),
      "data-text": text,
      "data-key": key
    }, [
      icon("volume-2", "listen-icon"),
      el("span", { className: "listen-text", "aria-hidden": "true", text: compact ? "" : "Listen" })
    ]);
    var group = el("span", { className: "listen-group" }, [btn]);
    var entry = key ? window.VT_SPEECH.nativeFor(key) : null;
    if (entry) {
      var word = el("button", {
        type: "button",
        className: "listen-word" + (compact ? " listen-word-compact" : ""),
        "data-text": text,
        "data-key": key
      }, [
        icon("mic", "listen-icon"),
        el("span", { className: "listen-text", "aria-hidden": "true", text: nativeLabel(entry, compact) })
      ]);
      group.appendChild(word);
    }
    decorateGroup(group);
    return group;
  }

  /* Label and enabled state of the main button (full phrase, computer voice). */
  function decorateListen(btn) {
    var SPEECH = window.VT_SPEECH, L = window.VT_LOGIC;
    var key = btn.getAttribute("data-key");
    var text = L.speakableText(btn.getAttribute("data-text"));
    if (btn.classList.contains("listen-word")) {
      var entry = SPEECH.nativeFor(key);
      btn.hidden = !showWords || !entry;
      btn.title = nativeLabel(entry, false) === "Native speaker" ? "Native speaker recording" : "Native speaker recording (word only)";
      btn.setAttribute("aria-label", nativeLabel(entry, false) + ": " + (entry ? entry.said : text));
      return;
    }
    // Three states: pre-recorded voice (full phrase), device voice (full phrase), native speaker (word only,
    // only when there is neither a recording nor a device voice).
    var recorded = !!SPEECH.recordedToPlay(btn.getAttribute("data-text"));
    var synth = SPEECH.synthSupported();
    var fbEntry = SPEECH.nativeFor(key);
    var fbPhrase = !!fbEntry && fbEntry.scope === "phrase";
    var fallback = !recorded && !synth && !!fbEntry;
    var label = "Listen: " + text + (recorded ? " (recorded voice)" : fallback ? " (native speaker" + (fbPhrase ? ")" : ", word only)") : " (device voice)");
    btn.classList.toggle("listen-recorded", recorded);
    btn.classList.toggle("listen-native", fallback);
    btn.title = recorded ? "Recorded voice, full phrase" : fallback ? (fbPhrase ? "Native speaker recording" : "Native speaker recording (word only)") : "Device voice, full phrase";
    var can = recorded || synth || fallback;
    btn.disabled = !can;
    btn.setAttribute("aria-label", can ? label : label + ", unavailable in this browser");
  }

  function decorateGroup(group) {
    Array.prototype.forEach.call(group.querySelectorAll("button.listen, button.listen-word"), decorateListen);
  }

  /* ---------- toast: the shared #audio-status live region ----------
     kind: "recorded" | "native" | "computer" | null. The icon is aria-hidden; the text is what screen readers get. */
  function toast(text, kind) {
    var box = document.getElementById("audio-status");
    if (!box) return;
    clear(box);
    if (kind === "recorded") box.appendChild(icon("audio-lines"));
    else if (kind === "native") box.appendChild(icon("mic"));
    else if (kind === "computer") box.appendChild(icon("cpu"));
    box.appendChild(el("span", { text: text }));
    box.className = "audio-status" + (kind ? " is-" + kind : "") + " is-visible";
  }

  /* ---------- dialogs (§7.4) ---------- */
  var openers = [];
  var nativeDialog = typeof HTMLDialogElement === "function";

  function heading(dlg) { return dlg.querySelector("h2"); }

  function onFallbackKey(ev) {
    if (ev.key !== "Escape") return;
    var dlg = ev.currentTarget;
    ev.preventDefault();
    closeDialog(dlg);
  }

  function openDialog(dlg, opener) {
    if (!dlg) return;
    var useNative = nativeDialog && typeof dlg.showModal === "function";
    if (useNative ? dlg.open : dlg.classList.contains("is-open")) return;
    openers.push({ dlg: dlg, opener: opener || document.activeElement });
    if (!dlg.getAttribute("data-vt-wired")) {
      dlg.setAttribute("data-vt-wired", "1");
      // <dialog> has padding 0 and the content sits in .dlg-body, so target === dlg is a backdrop click.
      dlg.addEventListener("click", function (ev) { if (ev.target === dlg) closeDialog(dlg); });
      if (useNative) dlg.addEventListener("close", function () { restoreFocus(dlg); });
      Array.prototype.forEach.call(dlg.querySelectorAll("[data-close]"), function (b) {
        b.addEventListener("click", function () { closeDialog(dlg); });
      });
    }
    if (useNative) {
      dlg.showModal();
    } else {
      dlg.setAttribute("role", "dialog");
      dlg.setAttribute("aria-modal", "true");
      dlg.classList.add("dialog-fallback", "is-open");
      dlg.hidden = false;
      dlg.addEventListener("keydown", onFallbackKey);
      var h = heading(dlg);
      if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
    }
  }

  function restoreFocus(dlg) {
    for (var i = openers.length - 1; i >= 0; i--) {
      if (openers[i].dlg === dlg) {
        var o = openers.splice(i, 1)[0].opener;
        if (o && typeof o.focus === "function" && document.contains(o)) o.focus();
        return;
      }
    }
  }

  function closeDialog(dlg) {
    if (!dlg) return;
    if (nativeDialog && typeof dlg.close === "function") {
      if (dlg.open) dlg.close(); // the "close" event restores focus
      return;
    }
    if (!dlg.classList.contains("is-open")) return;
    dlg.classList.remove("is-open");
    dlg.hidden = true;
    dlg.removeEventListener("keydown", onFallbackKey);
    restoreFocus(dlg);
  }

  /* ---------- progress ring: SVG with role=img; dashoffset is a presentation attribute (CSP) ---------- */
  function ring(pct, label) {
    var p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    var r = 20, c = 2 * Math.PI * r;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "ring");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label || (p + "%"));
    function circle(cls) {
      var ci = document.createElementNS(SVG_NS, "circle");
      ci.setAttribute("class", cls);
      ci.setAttribute("cx", "24");
      ci.setAttribute("cy", "24");
      ci.setAttribute("r", String(r));
      ci.setAttribute("fill", "none");
      ci.setAttribute("stroke-width", "5");
      return ci;
    }
    svg.appendChild(circle("ring-track"));
    var bar = circle("ring-bar");
    bar.setAttribute("stroke-linecap", "round");
    bar.setAttribute("stroke-dasharray", c.toFixed(2));
    bar.setAttribute("stroke-dashoffset", (c * (1 - p / 100)).toFixed(2));
    bar.setAttribute("transform", "rotate(-90 24 24)");
    svg.appendChild(bar);
    var t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "ring-text");
    t.setAttribute("x", "24");
    t.setAttribute("y", "24");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "central");
    t.setAttribute("aria-hidden", "true");
    t.textContent = p + "%";
    svg.appendChild(t);
    return svg;
  }

  /* ---------- type badges (§8.4): visible text, never colour only ----------
     type: "regular" | "regular-spelling-change" | "irregular" | "reflexive". title = full type string. */
  var BADGE_TEXT = {
    regular: "Regular",
    "regular-spelling-change": "Regular (spelling change)",
    irregular: "Irregular",
    reflexive: "Reflexive"
  };
  function badge(type, title) {
    var t = BADGE_TEXT[type] ? type : "irregular";
    return el("span", { className: "type-badge type-badge--" + t, title: title || null, text: BADGE_TEXT[t] });
  }

  /* ---------- message parts: [{ text, fr?, strong? }] -> fragment ---------- */
  function parts(arr) {
    var frag = document.createDocumentFragment();
    (arr || []).forEach(function (p) {
      if (p == null) return;
      if (typeof p === "string") { frag.appendChild(document.createTextNode(p)); return; }
      var node;
      if (p.fr) node = el(p.strong ? "strong" : "span", { lang: "fr", text: p.text });
      else if (p.strong) node = el("strong", { text: p.text });
      else node = document.createTextNode(p.text == null ? "" : String(p.text));
      frag.appendChild(node);
    });
    return frag;
  }

  /* ---------- session bar (§6.5): "Question 3 of 10", <progress>, "2 correct", Shortcuts ---------- */
  function sessionBar(node, s, onShortcuts) {
    if (!node) return;
    if (!node.firstChild) {
      var sc = el("button", { type: "button", className: "btn btn-small session-keys", "aria-keyshortcuts": "?" }, [icon("keyboard"), el("span", { text: "Shortcuts" })]);
      if (onShortcuts) sc.addEventListener("click", onShortcuts);
      node.appendChild(el("span", { className: "session-count" }));
      node.appendChild(el("progress", { className: "session-progress", max: "1", value: "0", "aria-hidden": "true" }));
      node.appendChild(el("span", { className: "session-score" }));
      node.appendChild(sc);
    }
    var answered = Math.min(s.index + (s.ui && s.ui.answered ? 1 : 0), s.length);
    node.querySelector(".session-count").textContent = window.VT_SESSION.barText(s);
    var bar = node.querySelector(".session-progress");
    bar.setAttribute("max", String(Math.max(1, s.length)));
    bar.setAttribute("value", String(answered));
    node.querySelector(".session-score").textContent = s.correct + " correct";
  }
  /* ---------- feedback panel (§9.3) ----------
     result: { correct, exact, shown, hinted, classification }. info: { index, answer: { french, pronunciation,
     english, listenText, listenKey, formNode }, table }. Returns { node, live } (live = one sentence for role=status). */
  var CORRECT_COPY = ["Correct!", "Bravo !", "Exactly.", "Très bien !", "Nice work."];
  function feedbackPanel(result, item, info) {
    var a = info.answer || {};
    var cls = result.classification;
    var head, live, kind;
    if (result.correct) {
      kind = "correct";
      if (result.hinted) head = "Correct, with a hint. It'll come back soon.";
      else if (cls && cls.category === "accent-note") head = cls.message;
      else head = CORRECT_COPY[Math.abs(Number(info.index) || 0) % CORRECT_COPY.length];
      live = head;
    } else if (result.shown) {
      kind = "shown";
      head = "Here's the answer";
      live = "The answer is " + (a.french || "") + ".";
    } else {
      kind = "wrong";
      head = "Not quite";
      live = "Not quite. The answer is " + (a.french || "") + "." + (cls && cls.category !== "generic" && cls.message ? " " + cls.message : "");
    }
    var headLang = /^(Bravo|Très bien)/.test(head) ? "fr" : null;
    var panel = el("div", { className: "fb-panel fb-panel--" + kind }, [
      el("p", { className: "fb-head" }, [icon(kind === "correct" ? "check" : kind === "shown" ? "eye" : "x"),
        cls && cls.category === "accent-note" && result.correct && !result.hinted ? el("span", null, [parts(cls.parts)]) : el("span", { lang: headLang, text: head })])
    ]);
    var answerRow = el("p", { className: "fb-answer" }, [a.formNode || el("strong", { lang: "fr", text: a.french || "" })]);
    if (a.listenText) answerRow.appendChild(listenButton(a.listenText, a.listenKey));
    panel.appendChild(answerRow);
    if (a.pronunciation) panel.appendChild(el("p", { className: "fb-pron", text: a.pronunciation }));
    if (a.english) panel.appendChild(el("p", { className: "fb-english", text: a.english }));
    // Choice items: the answer in context (the full form, sentence or past), with pronunciation and English.
    var cx = a.context;
    if (cx && cx.french) {
      panel.appendChild(el("p", { className: "fb-context" }, [
        el("span", { lang: "fr", text: cx.french }),
        cx.pronunciation ? el("span", { className: "pron", text: " · " + cx.pronunciation }) : null,
        cx.english ? el("span", { className: "fb-english", text: " · " + cx.english }) : null
      ]));
    }
    if (!result.correct && !result.shown && cls && cls.parts && cls.parts.length && cls.category !== "generic") {
      panel.appendChild(el("p", { className: "fb-explain" }, [icon("lightbulb"), el("span", null, [parts(cls.parts)])]));
    }
    if (info.table) {
      panel.appendChild(el("details", { className: "fb-table" }, [
        el("summary", { text: "See the full table" }), info.table
      ]));
    }
    return { node: panel, live: live };
  }
  /* ---------- summary card (§12.1) ----------
     c: { quizLine, dailyCount, dailyGoal, primary: { label, href?, onClick? }, secondary: [same], extra: [same] }. */
  function summaryHeading(correct, n) {
    var r = n ? correct / n : 0;
    var score = correct + " / " + n;
    if (r >= 0.9) return { fr: true, text: "Bravo ! " + score };
    if (r >= 0.7) return { fr: true, text: "Très bien ! " + score };
    if (r >= 0.4) return { fr: false, text: "Good effort: " + score };
    return { fr: false, text: "Keep going: every mistake is practice. " + score };
  }
  function actionNode(spec, primary) {
    var kids = [el("span", { text: spec.label })];
    if (primary) kids.push(icon("arrow-right"));
    var cls = "btn" + (primary ? " btn-primary" : "");
    var node;
    if (spec.href) {
      node = el("a", { className: cls, href: spec.href }, kids);
      // A link to the current hash fires no hashchange (§12.1): let the owner re-route.
      if (spec.onSameHash) node.addEventListener("click", function (ev) {
        if (location.hash === spec.href) { ev.preventDefault(); spec.onSameHash(); }
      });
    } else {
      node = el("button", { type: "button", className: cls }, kids);
      node.addEventListener("click", spec.onClick);
    }
    return node;
  }
  function summaryCard(s, c) {
    var n = s.length;
    var pct = n ? Math.round((100 * s.correct) / n) : 0;
    var h = summaryHeading(s.correct, n);
    // Keep the "0 / 5" score together on one line.
    var m = /^(.*?)(\d+ \/ \d+)(\.?)$/.exec(h.text);
    var headKids = m ? [m[1], el("span", { className: "nowrap", text: m[2] + m[3] })] : [h.text];
    var heading = el("h3", { className: "summary-heading", tabindex: "-1" }, [el("span", { lang: h.fr ? "fr" : null }, headKids)]);
    var card = el("div", { className: "summary-card" }, [
      el("div", { className: "summary-top" }, [
        el("span", { className: "summary-burst", "aria-hidden": "true" }, [icon("sparkles")]),
        heading
      ]),
      el("div", { className: "summary-stats" }, [
        ring(pct, s.correct + " of " + n + " correct, " + pct + "%"),
        el("div", null, [
          el("p", { text: "Daily goal: " + c.dailyCount + " / " + c.dailyGoal }),
          c.quizLine ? el("p", { className: "summary-quiz", text: c.quizLine }) : null
        ])
      ])
    ]);
    card.appendChild(el("h4", { text: "To review" }));
    if (!s.missed.length) {
      card.appendChild(el("p", { className: "hint", text: "No mistakes this round." }));
    } else {
      var seen = {};
      card.appendChild(el("ul", { className: "summary-missed" }, s.missed.filter(function (m) {
        if (seen[m.key]) return false;
        seen[m.key] = true;
        return true;
      }).map(function (m) {
        var d = m.display || {};
        // Topic items carry the prompt and what the learner wrote; verb sessions set neither field.
        var wrote = d.wrote ? String(d.wrote) : "";
        if (wrote.length > 60) wrote = wrote.slice(0, 60) + "…";
        return el("li", null, [
          d.prompt ? el("span", { className: "summary-prompt", lang: d.promptLang === "en" ? "en" : "fr", text: String(d.prompt) }) : null,
          d.prompt ? el("span", { className: "summary-arrow", "aria-hidden": "true", text: " → " }) : null,
          d.prompt ? el("span", { className: "visually-hidden", text: " Answer: " }) : null,
          el("strong", { lang: "fr", text: d.french || "" }),
          wrote ? el("span", { className: "summary-wrote" }, ["You wrote: ", el("span", { lang: "fr", text: wrote })]) : null,
          d.pronunciation ? el("span", { className: "pron", text: " " + d.pronunciation }) : null,
          m.hinted ? el("span", { className: "hint", text: " (with a hint)" }) : null,
          d.french ? listenButton(d.french, d.audioKey, { compact: true }) : null
        ]);
      })));
    }
    var actions = el("div", { className: "actions summary-actions" });
    if (c.primary) actions.appendChild(actionNode(c.primary, true));
    (c.secondary || []).forEach(function (spec) { actions.appendChild(actionNode(spec, false)); });
    card.appendChild(actions);
    if (c.extra && c.extra.length) {
      card.appendChild(el("p", { className: "summary-extra" }, ["More practice: "].concat(c.extra.map(function (spec, i) {
        return el("span", null, [i ? " · " : "", el("a", { href: spec.href, text: spec.label })]);
      }))));
    }
    return card;
  }
  window.VT_UI = {
    el: el, fr: fr, clear: clear, tableRegion: tableRegion, icon: icon,
    listenButton: listenButton, decorateListen: decorateListen, setShowWords: setShowWords, nativeLabel: nativeLabel,
    toast: toast, openDialog: openDialog, closeDialog: closeDialog,
    ring: ring, badge: badge, BADGE_TEXT: BADGE_TEXT, parts: parts,
    sessionBar: sessionBar, feedbackPanel: feedbackPanel, summaryCard: summaryCard, CORRECT_COPY: CORRECT_COPY
  };
})();
