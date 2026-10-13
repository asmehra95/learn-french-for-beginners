/* French Explainer UI module (design §9). Classic script, no build step, no dependencies.
   Defines exactly one global: window.VT_EXPLAINER = { version, mount, _test }.

   DOM safety (design §5.5): every node is made with document.createElement, text goes in with
   textContent / text nodes, and attributes are set through el(), which only accepts an allowlist of
   attribute names. Strings from the server or from localStorage are always rendered as text.
   Route ids from the server never become hrefs; they become buttons only when the host passes
   onNavigate and the id matches ROUTE_RE.

   Speech (design §9.3) mirrors verb-trainer/js/speech.js (read-only reference, re-implemented here so
   both stay independent). Trainer storage keys are read, never written. */
(function (win) {
  "use strict";

  var VERSION = "1.1";
  var DEFAULT_LOCAL_API = "http://127.0.0.1:8765";
  // Client fetch timer = server limits.totalTimeoutMs (300 000 ms) + 30 s margin (design §4.3).
  // If totalTimeoutMs is ever raised in config.json, raise this value with it.
  var FETCH_TIMEOUT_MS = 330000;
  var HEALTH_TIMEOUT_MS = 5000;
  var DEFAULT_LIMITS = { maxChars: 2000, maxSentences: 8 };
  var HISTORY_KEY = "frenchExplainer.v1";
  var HISTORY_MAX_ITEMS = 10;
  var HISTORY_MAX_BYTES = 400 * 1024;
  // Verb Trainer settings keys: read-only. v2 does not exist today; it is a forward-compatible read.
  var TRAINER_KEYS = ["verbTrainer.v2", "verbTrainer.v1"];
  var RATE_MIN = 0.6;
  var RATE_MAX = 1.2;
  var RATE_DEFAULT = 0.85;
  var API_BASE_RE = /^https?:\/\/[^/\s]+$/;
  var ROUTE_RE = /^#[A-Za-z0-9/_-]{1,80}$/; // upper case for lesson ids such as #topic/reflexive/R4
  var ATTR_OK = /^(class|id|type|role|for|hidden|title|tabindex|lang|maxlength|rows|placeholder|disabled|aria-[a-z]+|data-vtx-[a-z-]+)$/;
  var NO_VOICE_TEXT = "No French voice installed (System Settings › Accessibility › Spoken Content)";
  var NO_SPEECH_TEXT = "This browser can't speak French text aloud, so Listen buttons are not shown.";
  var AI_NOTICE = "AI-generated - may contain errors.";
  var COMPOUND_TENSES = ["passe-compose", "plus-que-parfait"];

  /* ---------- small value helpers ---------- */
  function str(v) { return typeof v === "string" ? v : ""; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
  function cpLen(s) { return Array.from(String(s)).length; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function utf8Bytes(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  /* ---------- voice helpers (mirror verb-trainer/js/speech.js) ---------- */
  // Novelty / effect voices that are a poor model for learners (copied verbatim from speech.js).
  var NOVELTY = /^(grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed|bad news|good news|bubbles|albert|bahh|bells|boing|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy)\b/i;
  // Natural-sounding French voices, best first (copied verbatim from speech.js).
  var PREFERRED = ["thomas", "audrey", "aurélie", "aurelie", "marie", "jacques", "amélie", "amelie"];
  var REGIONS = { FR: "France", CA: "Canada", BE: "Belgium", CH: "Switzerland", LU: "Luxembourg", MC: "Monaco" };

  function normLang(v) { return String((v && v.lang) || "").replace(/_/g, "-"); }
  function isFrench(v) { return /^fr(-|$)/i.test(normLang(v)); }
  function isFrance(v) { return /^fr-FR$/i.test(normLang(v)); }
  function region(v) {
    var m = /^fr-([a-z]{2})/i.exec(normLang(v));
    if (!m) return "";
    var code = m[1].toUpperCase();
    return REGIONS[code] || code;
  }
  function quality(v) {
    var s = String((v && v.name) || "") + " " + String((v && v.voiceURI) || "");
    if (/premium/i.test(s)) return "Premium";
    if (/enhanced/i.test(s)) return "Enhanced";
    return "";
  }
  function baseName(v) {
    var n = String((v && v.name) || "").replace(/\s*\((premium|enhanced)\)/ig, "").replace(/\s*\(French[^)]*\)?\)?\s*$/i, "").trim();
    return n || String((v && v.name) || "Unnamed voice");
  }
  function isNovelty(v) {
    return NOVELTY.test(baseName(v)) || /\.eloquence\./i.test(String((v && v.voiceURI) || ""));
  }
  function preferredRank(v) {
    var i = PREFERRED.indexOf(baseName(v).toLowerCase());
    return i === -1 ? PREFERRED.length : i;
  }
  function byPreference(a, b) { return preferredRank(a) - preferredRank(b); }
  function frenchVoices(list) { return arr(list).filter(isFrench); }

  /** Best voice for learners when the user has not chosen one (same tiers as speech.js). */
  function autoPick(list) {
    var fr = frenchVoices(list);
    var tiers = [
      function (v) { return quality(v) && isFrance(v); },
      function (v) { return quality(v); },
      function (v) { return isFrance(v) && !isNovelty(v); },
      function (v) { return !isNovelty(v); },
      function () { return true; }
    ];
    for (var i = 0; i < tiers.length; i++) {
      var hits = fr.filter(tiers[i]);
      if (hits.length) return hits.slice().sort(byPreference)[0];
    }
    return null;
  }

  /** The saved voice (matched by voiceURI, then name, among French voices), else autoPick. */
  function pickVoice(list, settings) {
    var fr = frenchVoices(list);
    var i;
    if (settings && settings.voiceURI) {
      for (i = 0; i < fr.length; i++) if (fr[i].voiceURI === settings.voiceURI) return fr[i];
    }
    if (settings && settings.voiceName) {
      for (i = 0; i < fr.length; i++) if (fr[i].name === settings.voiceName) return fr[i];
    }
    return autoPick(fr);
  }

  function accentNote(v) {
    if (!v || isFrance(v) || !region(v)) return "";
    if (/^fr-CA$/i.test(normLang(v))) {
      return "This voice uses a Canadian (Québec) accent; the guide's pronunciations follow France French.";
    }
    return "This voice uses a French (" + region(v) + ") accent; the guide's pronunciations follow France French.";
  }

  function clampRate(r) {
    var n = Number(r);
    if (r === null || r === undefined || r === "" || !isFinite(n)) return RATE_DEFAULT;
    return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(n * 100) / 100));
  }

  function settingsFrom(src, rateKey, source) {
    return {
      voiceURI: str(src.voiceURI),
      voiceName: str(src.voiceName),
      rate: clampRate(typeof src[rateKey] === "number" ? src[rateKey] : null),
      source: source
    };
  }

  /**
   * Voice settings, read-only. Precedence: options.voiceSettings -> localStorage "verbTrainer.v2"
   * (only if present) -> "verbTrainer.v1" -> automatic. Reads parsed.settings.{voiceURI, voiceName,
   * speechRate}. Any parse error, wrong type or blocked storage is ignored. Never writes storage.
   */
  function readVoiceSettings(options, storage) {
    var vs = obj(options && options.voiceSettings);
    if (vs) return settingsFrom(vs, "rate", "options");
    for (var i = 0; i < TRAINER_KEYS.length; i++) {
      var raw = null;
      try { raw = storage ? storage.getItem(TRAINER_KEYS[i]) : null; } catch (e) { raw = null; }
      if (typeof raw !== "string") continue;
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      var s = obj(parsed) && obj(parsed.settings);
      if (s) return settingsFrom(s, "speechRate", TRAINER_KEYS[i]);
    }
    return { voiceURI: "", voiceName: "", rate: RATE_DEFAULT, source: "auto" };
  }

  /** Text as the voice should say it (speech.js speakableText + "ne … pas" -> "ne pas"). */
  function speakable(s) {
    return String(s == null ? "" : s)
      .replace(/\bils\/elles\b/g, "ils")
      .replace(/\bil\/elle\b/g, "il")
      .replace(/\(e\)/g, "")
      .replace(/…|\.\.\./g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ---------- sentence splitting (mirror of lib/sentences.js, design §4.5) ---------- */
  // « Tu viens ? » dit-elle. is ONE sentence (lowercase after a closing quote = incise), as on the server.
  var MARK = "\uE000";
  var SP = "[ \\t\\u00A0\\u202F]";
  var PROTECT = [
    [/(^|[\s(«"'\u00A0\u202F-])p\. ex\./gu, "$1p" + MARK + " ex" + MARK],
    [/(^|[\s(«"'\u00A0\u202F-])(Mme|Mlle|M|Dr|St|etc)\./gu, "$1$2" + MARK],
    [/(^|[\s(«"'\u00A0\u202F-])(\p{Lu})\./gu, "$1$2" + MARK],
    [/(\d)\.(?=\d)/gu, "$1" + MARK]
  ];
  var LEADING_SPACE = new RegExp("^" + SP + "+", "u");
  var CLOSER_END = /[»"\u201D)]$/u;

  function splitBlock(block) {
    var s = block;
    PROTECT.forEach(function (p) { s = s.replace(p[0], p[1]).replace(p[0], p[1]); });
    var terminal = new RegExp("[.!?…]+(?:" + SP + "*»|[\"\u201D)])*", "gu");
    var pieces = [];
    var start = 0;
    var m;
    while ((m = terminal.exec(s)) !== null) {
      var end = m.index + m[0].length;
      var ws = LEADING_SPACE.exec(s.slice(end));
      if (!ws) continue;
      var next = s.slice(end + ws[0].length);
      if (CLOSER_END.test(m[0]) && /^\p{Ll}/u.test(next)) continue;
      pieces.push(s.slice(start, end));
      start = end;
    }
    pieces.push(s.slice(start));
    return pieces.map(function (p) { return p.split(MARK).join(".").trim(); }).filter(Boolean);
  }

  /** @param {string} text @returns {string[]} */
  function splitSentences(text) {
    var out = [];
    String(text == null ? "" : text).split("\n").forEach(function (line) {
      var t = line.trim();
      if (t) out.push.apply(out, splitBlock(t));
    });
    return out;
  }

  /** Light client-side copy of the server's normalisation, used only for the live counters. */
  function normaliseInput(text) {
    return String(text).normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u2019\u02bc]/g, "'")
      .replace(/[ \t\u00A0\u202F]+/g, " ").trim();
  }

  /* ---------- history helpers (design §9.5) ---------- */
  function historySize(items) { return utf8Bytes(JSON.stringify({ version: 1, items: items })); }

  /** Newest first: keep at most maxItems, then drop the oldest until the stored value fits maxBytes. */
  function historyTrim(items, maxItems, maxBytes) {
    var max = typeof maxItems === "number" ? maxItems : HISTORY_MAX_ITEMS;
    var bytes = typeof maxBytes === "number" ? maxBytes : HISTORY_MAX_BYTES;
    var out = arr(items).slice(0, max);
    while (out.length > 0 && historySize(out) > bytes) out.pop();
    return out;
  }

  function validHistoryItem(it) {
    var r = obj(it) && obj(it.result);
    return !!(r && typeof it.id === "string" && typeof it.text === "string" && cpLen(it.text) <= 2000 &&
      typeof r.schemaVersion === "string" && r.schemaVersion.indexOf("1.") === 0 && Array.isArray(r.sentences));
  }

  function relativeTime(iso, nowMs) {
    var t = Date.parse(str(iso));
    if (!isFinite(t)) return "";
    var s = Math.max(0, Math.round((nowMs - t) / 1000));
    if (s < 60) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + " h ago";
    return plural(Math.round(h / 24), "day", "days") + " ago";
  }

  /* ---------- DOM builder with an attribute allowlist ---------- */
  function el(doc, tag, attrs, children) {
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        var v = attrs[name];
        if (v === null || v === undefined || v === false) return;
        if (!ATTR_OK.test(name)) throw new Error("VT_EXPLAINER: attribute not allowed: " + name);
        node.setAttribute(name, v === true ? "" : String(v));
      });
    }
    addChildren(doc, node, children);
    return node;
  }
  function addChildren(doc, node, children) {
    if (children === null || children === undefined) return;
    (Array.isArray(children) ? children : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" || typeof c === "number" ? doc.createTextNode(String(c)) : c);
    });
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- mount ---------- */
  var instanceCounter = 0;
  var mounted = typeof WeakMap === "function" ? new WeakMap() : null;

  function mount(container, options) {
    if (!container || typeof win.Element !== "function" || !(container instanceof win.Element)) {
      throw new TypeError("VT_EXPLAINER.mount: container must be an Element.");
    }
    var opts = obj(options) || {};
    var apiBase;
    if (opts.apiBase === undefined) {
      apiBase = /^https?:$/.test(str(win.location && win.location.protocol)) ? "" : DEFAULT_LOCAL_API;
    } else if (typeof opts.apiBase === "string" && (opts.apiBase === "" || API_BASE_RE.test(opts.apiBase))) {
      apiBase = opts.apiBase;
    } else {
      throw new TypeError("VT_EXPLAINER.mount: apiBase must be \"\" or like " + DEFAULT_LOCAL_API + ".");
    }
    // headingLevel: level of the module title (2 default, or 3 inside a host page that has its own h2).
    // The results title and section titles follow one and two levels below it.
    var headingLevel = 2;
    if (opts.headingLevel !== undefined) {
      if (opts.headingLevel !== 2 && opts.headingLevel !== 3) {
        throw new TypeError("VT_EXPLAINER.mount: headingLevel must be 2 or 3.");
      }
      headingLevel = opts.headingLevel;
    }
    var previous = mounted && mounted.get(container);
    if (previous) previous.destroy();
    var inst = createInstance(container, opts, apiBase, headingLevel, ++instanceCounter);
    if (mounted) mounted.set(container, inst);
    return inst;
  }

  function createInstance(container, opts, apiBase, headingLevel, n) {
    var doc = container.ownerDocument || win.document;
    var hTitle = "h" + headingLevel;
    var hResults = "h" + (headingLevel + 1);
    var hSection = "h" + (headingLevel + 2);
    var h = function (tag, attrs, children) { return el(doc, tag, attrs, children); };
    var id = function (name) { return "vtx-" + name + "-" + n; };
    var onNavigate = typeof opts.onNavigate === "function" ? opts.onNavigate : null;
    // Never let a host point history at the trainer's own keys.
    var historyKey = typeof opts.historyKey === "string" && opts.historyKey && !/^verbTrainer/i.test(opts.historyKey)
      ? opts.historyKey : HISTORY_KEY;
    var storage = null;
    try { storage = win.localStorage || null; } catch (e) { storage = null; }
    var synth = win.speechSynthesis && typeof win.SpeechSynthesisUtterance === "function" ? win.speechSynthesis : null;

    var S = {
      destroyed: false, loading: false, cancel: null, healthCtl: null, waitUntil: 0,
      limits: { maxChars: DEFAULT_LIMITS.maxChars, maxSentences: DEFAULT_LIMITS.maxSentences },
      tooLong: false, tooMany: false, cancelledByUser: false,
      voices: [], voicesChecked: false, settings: readVoiceSettings(opts, storage),
      listen: [], activeEntry: null, speakToken: 0,
      history: [], memoryHistory: false, historyOpen: false,
      timers: [], listeners: []
    };

    function on(target, type, fn) {
      if (!target || typeof target.addEventListener !== "function") return;
      target.addEventListener(type, fn);
      S.listeners.push([target, type, fn]);
    }
    function later(fn, ms) {
      var t = win.setTimeout(function () {
        var i = S.timers.indexOf(t);
        if (i !== -1) S.timers.splice(i, 1);
        if (!S.destroyed) fn();
      }, ms);
      S.timers.push(t);
      return t;
    }

    /* ----- static layout (design §9.2) ----- */
    var root = h("section", { class: "vtx", "aria-labelledby": id("title") });
    var live = h("div", { class: "vtx-sr", role: "status", "aria-live": "polite" });

    var header = h("div", { class: "vtx-header" }, [
      h(hTitle, { class: "vtx-title", id: id("title") }, "Explain French"),
      h("p", { class: "vtx-intro" }, "Paste a French sentence or short paragraph. You'll get an English translation and a step-by-step explanation.")
    ]);

    var statusText = h("span", { class: "vtx-status-text" }, "Checking the Explainer server…");
    var statusHint = h("span", { class: "vtx-status-hint", hidden: true });
    var status = h("div", { class: "vtx-status", role: "status", "aria-live": "polite", id: id("status") }, [
      h("span", { class: "vtx-dot", "aria-hidden": "true" }), statusText, statusHint
    ]);
    var cloudNote = h("p", { class: "vtx-note vtx-cloud", hidden: true });
    var voiceNote = h("p", { class: "vtx-note", id: id("voice"), hidden: true });

    var ta = h("textarea", {
      class: "vtx-input", id: id("input"), lang: "fr", rows: 4, maxlength: S.limits.maxChars,
      placeholder: "Par exemple : Je m'appelle Marie. J'habite à Lyon.",
      "aria-describedby": id("chars") + " " + id("sents") + " " + id("keys")
    });
    var charCount = h("span", { class: "vtx-count", id: id("chars") });
    var sentCount = h("span", { class: "vtx-count", id: id("sents") });
    var keysHint = h("span", { class: "vtx-count vtx-keys", id: id("keys") }, "Ctrl or ⌘ + Enter to explain");
    var field = h("div", { class: "vtx-field" }, [
      h("label", { class: "vtx-label", for: id("input") }, "French text"),
      ta,
      h("div", { class: "vtx-counts" }, [charCount, sentCount, keysHint])
    ]);

    var explainBtn = h("button", { type: "button", class: "vtx-btn vtx-btn-primary", "data-vtx-action": "explain" }, "Explain");
    var cancelBtn = h("button", { type: "button", class: "vtx-btn", "data-vtx-action": "cancel", hidden: true }, "Cancel");
    var clearBtn = h("button", { type: "button", class: "vtx-btn vtx-btn-quiet", "data-vtx-action": "clear" }, "Clear");
    var actions = h("div", { class: "vtx-actions" }, [explainBtn, cancelBtn, clearBtn]);

    var seconds = h("span", { "aria-hidden": "true" }, "0 s");
    var progress = h("div", { class: "vtx-progress", hidden: true }, [
      h("span", { class: "vtx-spinner", "aria-hidden": "true" }),
      h("span", { class: "vtx-progress-text" }, ["Working on it… ", seconds, ". Usually 10-60 s per sentence."])
    ]);

    var errorBox = h("div", { class: "vtx-error", role: "alert", tabindex: "-1", id: id("error"), hidden: true });

    var resultsTitle = h(hResults, { class: "vtx-results-title", id: id("results"), tabindex: "-1" }, "Explanation");
    var resultsBody = h("div", { class: "vtx-results-body" });
    var results = h("div", { class: "vtx-results", hidden: true }, [resultsTitle, resultsBody]);

    var historyToggle = h("button", {
      type: "button", class: "vtx-btn vtx-disclosure", "aria-expanded": "false", "aria-controls": id("history")
    }, "Recent explanations");
    var historyList = h("ul", { class: "vtx-hlist" });
    var historyNote = h("p", { class: "vtx-note", hidden: true });
    var historyClear = h("button", { type: "button", class: "vtx-btn vtx-btn-quiet" }, "Clear history");
    var historyPanel = h("div", { class: "vtx-history-panel", id: id("history"), hidden: true }, [historyList, historyNote, historyClear]);
    var historyBox = h("div", { class: "vtx-history", hidden: true }, [historyToggle, historyPanel]);

    addChildren(doc, root, [live, header, status, cloudNote, voiceNote, field, actions, progress, errorBox, results, historyBox]);
    clear(container);
    container.appendChild(root);

    /* ----- announcements ----- */
    function announce(msg) {
      live.textContent = "";
      later(function () { live.textContent = msg; }, 60);
    }

    /* ----- counters and button state ----- */
    function updateCounts() {
      var v = ta.value;
      var chars = cpLen(v);
      var norm = normaliseInput(v);
      var sents = norm ? splitSentences(norm).length : 0;
      S.tooLong = chars > S.limits.maxChars;
      S.tooMany = sents > S.limits.maxSentences;
      charCount.textContent = (S.tooLong ? "Too long: " : "") + chars + " / " + S.limits.maxChars + " characters";
      charCount.classList.toggle("vtx-warn-text", S.tooLong);
      sentCount.textContent = S.tooMany
        ? "Up to " + S.limits.maxSentences + " sentences at a time (you have " + sents + ")"
        : plural(sents, "sentence", "sentences");
      sentCount.classList.toggle("vtx-warn-text", S.tooMany);
      updateButtons();
    }
    function updateButtons() {
      var waiting = S.waitUntil > Date.now();
      explainBtn.disabled = S.loading || S.tooLong || S.tooMany || waiting;
      explainBtn.textContent = S.loading ? "Explaining…" : "Explain";
      cancelBtn.hidden = !S.loading;
    }

    /* ----- status line from /api/health ----- */
    function setStatus(kind, text, hint, cloud) {
      status.className = "vtx-status vtx-status-" + kind;
      if (statusText.textContent !== text) statusText.textContent = text;
      statusHint.hidden = !hint;
      if (statusHint.textContent !== (hint || "")) statusHint.textContent = hint || "";
      cloudNote.hidden = !cloud;
      cloudNote.textContent = cloud || "";
    }
    function applyHealth(hb) {
      var lim = obj(hb.limits);
      if (lim) {
        if (Number.isInteger(lim.maxChars) && lim.maxChars > 0 && lim.maxChars <= 100000) {
          S.limits.maxChars = lim.maxChars;
          ta.setAttribute("maxlength", String(lim.maxChars));
        }
        if (Number.isInteger(lim.maxSentences) && lim.maxSentences > 0 && lim.maxSentences <= 100) S.limits.maxSentences = lim.maxSentences;
        updateCounts();
      }
      var model = str(hb.model) || "model not set";
      if (hb.mode === "cloud") {
        var regionName = str(hb.region) || "region not set";
        setStatus(hb.ready ? "ok" : "warn", "Cloud · " + model + " · " + (hb.ready ? "Ready" : "Not ready"),
          str(hb.hint), "Cloud mode: your text is sent to AWS (" + regionName + ") for processing.");
        return;
      }
      var ol = obj(hb.ollama) || {};
      if (hb.ready === true) setStatus("ok", "Local · " + model + " · Ready", "", "");
      else if (ol.reachable === false) {
        setStatus("warn", "Mistral isn't running", "Open the Ollama app (or run ollama serve in Terminal), wait a few seconds, then try again.", "");
      } else if (ol.modelAvailable === false) {
        setStatus("warn", "The " + model + " model isn't installed in Ollama.", "See README > Troubleshooting.", "");
      } else setStatus("warn", "Local · " + model + " · Not ready", str(hb.hint), "");
    }
    function checkHealth() {
      if (typeof win.fetch !== "function") return;
      if (S.healthCtl) S.healthCtl.abort();
      var ctl = new win.AbortController();
      S.healthCtl = ctl;
      var timedOut = false;
      var timer = later(function () { timedOut = true; ctl.abort(); }, HEALTH_TIMEOUT_MS);
      win.fetch(apiBase + "/api/health", { method: "GET", cache: "no-store", signal: ctl.signal })
        .then(function (res) { return res.json(); })
        .then(function (hb) {
          if (S.destroyed || S.healthCtl !== ctl) return;
          if (!obj(hb) || str(hb.schemaVersion).indexOf("1.") !== 0) {
            setStatus("warn", "This Explainer server version isn't supported by this page.", "", "");
          } else applyHealth(hb);
        })
        .catch(function () {
          // Superseded by a newer check, or aborted by destroy(): stay quiet.
          if (S.destroyed || S.healthCtl !== ctl || (ctl.signal.aborted && !timedOut)) return;
          setStatus("warn", "Can't reach the Explainer server.", "Start it with ./start.sh, then try again.", "");
        })
        .then(function () { win.clearTimeout(timer); });
    }

    /* ----- speech ----- */
    function activeVoice() { return pickVoice(S.voices, S.settings); }
    function refreshVoices() {
      if (!synth) return;
      var all = [];
      try { all = synth.getVoices() || []; } catch (e) { all = []; }
      if (!all.length) return;
      S.voices = frenchVoices(all);
      S.voicesChecked = true;
      updateVoiceUI();
    }
    function markChecked() {
      if (S.voicesChecked) return;
      S.voicesChecked = true;
      updateVoiceUI();
    }
    function noVoice() { return !!synth && S.voicesChecked && S.voices.length === 0; }
    function updateVoiceUI() {
      if (!synth) {
        voiceNote.hidden = false;
        voiceNote.textContent = NO_SPEECH_TEXT;
        return;
      }
      if (noVoice()) {
        voiceNote.hidden = false;
        voiceNote.textContent = NO_VOICE_TEXT;
      } else {
        var v = activeVoice();
        if (v) {
          var q = quality(v);
          var note = accentNote(v);
          voiceNote.hidden = false;
          voiceNote.textContent = "Voice: " + baseName(v) + (q ? " (" + q + ")" : "") + (note ? ". " + note : "");
        } else voiceNote.hidden = true;
      }
      S.listen.forEach(paintListen);
    }
    function paintListen(entry) {
      var active = S.activeEntry === entry;
      entry.icon.textContent = active ? "■" : "▶";
      entry.text.textContent = active ? "Stop" : "Listen";
      entry.btn.setAttribute("aria-pressed", active ? "true" : "false");
      if (entry.whole) entry.btn.setAttribute("aria-label", active ? "Stop listening" : entry.whole);
      else if (entry.label) entry.btn.setAttribute("aria-label", (active ? "Stop: " : "Listen: ") + entry.label);
      var off = noVoice();
      entry.btn.disabled = off;
      if (off) entry.btn.setAttribute("aria-describedby", id("voice"));
      else entry.btn.removeAttribute("aria-describedby");
    }
    /** A Listen button speaking `parts` (one utterance each), or null when speech is unsupported. */
    function listenButton(kind, parts, label, wholeLabel) {
      if (!synth) return null;
      var icon = h("span", { class: "vtx-icon", "aria-hidden": "true" }, "▶");
      var text = h("span", null, "Listen");
      var btn = h("button", {
        type: "button", class: "vtx-btn vtx-listen", "data-vtx-listen": kind, "aria-pressed": "false"
      }, [icon, text]);
      var entry = { btn: btn, icon: icon, text: text, label: label || "", whole: wholeLabel || "", parts: parts };
      S.listen.push(entry);
      on(btn, "click", function () { speak(entry); });
      paintListen(entry);
      return btn;
    }
    function speak(entry) {
      if (!synth) return;
      if (S.activeEntry === entry) { stopSpeech(); return; }
      stopSpeech();
      var parts = entry.parts.map(speakable).filter(Boolean);
      if (!parts.length) return;
      var token = ++S.speakToken;
      S.activeEntry = entry;
      paintListen(entry);
      var voice = activeVoice();
      var done = function () {
        if (token !== S.speakToken || S.destroyed) return;
        S.activeEntry = null;
        paintListen(entry);
      };
      parts.forEach(function (p, i) {
        var u = new win.SpeechSynthesisUtterance(p);
        if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = "fr-FR";
        u.rate = S.settings.rate;
        if (i === parts.length - 1) u.onend = done;
        u.onerror = done;
        synth.speak(u);
      });
    }
    function stopSpeech() {
      S.speakToken++;
      var e = S.activeEntry;
      S.activeEntry = null;
      if (e) paintListen(e);
      if (synth) synth.cancel();
    }

    /* ----- errors ----- */
    function hideError() { clear(errorBox); errorBox.hidden = true; errorBox.className = "vtx-error"; }
    function showError(lines, opt) {
      var o = opt || {};
      clear(errorBox);
      errorBox.className = "vtx-error" + (o.info ? " vtx-error-info" : "");
      lines.filter(Boolean).forEach(function (l) { errorBox.appendChild(h("p", null, l)); });
      if (o.retry) {
        var retry = h("button", { type: "button", class: "vtx-btn", "data-vtx-action": "retry" }, "Retry");
        on(retry, "click", function () { run(); });
        errorBox.appendChild(h("div", { class: "vtx-actions" }, retry));
      }
      errorBox.hidden = false;
      if (o.focus === "textarea") ta.focus();
      else if (o.focus !== "none") errorBox.focus();
    }
    function serverError(status, body, retryAfter) {
      var e = obj(body) && obj(body.error);
      var code = e ? str(e.code) : "";
      var msg = e ? str(e.message) : "";
      var hint = e ? str(e.hint) : "";
      switch (code) {
        case "OLLAMA_UNREACHABLE":
          return showError(["Mistral isn't running. Open the Ollama app (or run ollama serve in Terminal), wait a few seconds, then try again."], { retry: true });
        case "MODEL_NOT_FOUND":
          return showError(["The mistral model isn't installed in Ollama. See README > Troubleshooting."]);
        case "MODEL_TIMEOUT":
          return showError(["This took too long. Try a shorter text."], { retry: true });
        case "MODEL_OUTPUT_INVALID":
          return showError(["The AI's answer couldn't be read. Try again; small changes to the text can help."], { retry: true });
        case "RATE_LIMITED":
        case "BUSY": {
          var wait = Math.min(600, Math.max(1, parseInt(retryAfter, 10) || 5));
          S.waitUntil = Date.now() + wait * 1000;
          updateButtons();
          later(function () { updateButtons(); announce("You can try again now."); }, wait * 1000 + 50);
          return showError(["Please wait " + plural(wait, "second", "seconds") + "."]);
        }
        case "INPUT_TOO_LONG":
        case "TOO_MANY_SENTENCES":
        case "EMPTY_INPUT":
          return showError([msg || "Please check your text.", hint], { focus: "textarea" });
        case "ORIGIN_NOT_ALLOWED":
          return showError(["This page isn't allowed to use the Explainer. Open it from " + DEFAULT_LOCAL_API + " or see README > Allowed origins."]);
        case "PROVIDER_NOT_CONFIGURED":
        case "PROVIDER_NOT_IMPLEMENTED":
          return showError([msg || "The cloud provider isn't available in this build.", hint]);
        default:
          return showError([status >= 400 && msg ? msg : "Something went wrong. Try again."], { retry: true });
      }
    }

    /* ----- explain request ----- */
    function setLoading(on_) {
      S.loading = on_;
      progress.hidden = !on_;
      updateButtons();
      if (on_) {
        var started = Date.now();
        seconds.textContent = "0 s";
        var tick = function () {
          if (!S.loading) return;
          seconds.textContent = Math.round((Date.now() - started) / 1000) + " s";
          later(tick, 1000);
        };
        later(tick, 1000);
      }
    }
    function requestSignal(ctl) {
      var AS = win.AbortSignal;
      if (AS && typeof AS.any === "function" && typeof AS.timeout === "function") {
        return AS.any([ctl.signal, AS.timeout(FETCH_TIMEOUT_MS)]);
      }
      later(function () { ctl.abort(); }, FETCH_TIMEOUT_MS);
      return ctl.signal;
    }
    function unreachableLines() {
      var base = apiBase || str(win.location && win.location.origin);
      var lines = ["Can't reach the Explainer server at " + base + ", or this page isn't allowed to use it. If the server is running (./start.sh), open " + DEFAULT_LOCAL_API + "/ instead."];
      if (win.location && win.location.protocol === "file:") {
        lines.push("Pages opened from a file can't use the Explainer unless you allow the 'null' origin (README > Allowed origins).");
      }
      return lines;
    }

    function run() {
      if (S.loading || S.destroyed) return Promise.resolve();
      var text = ta.value;
      if (!/\p{L}/u.test(text)) {
        showError(["Type or paste a French sentence first."], { focus: "textarea" });
        return Promise.resolve();
      }
      if (S.tooLong || S.tooMany || S.waitUntil > Date.now()) return Promise.resolve();
      if (typeof win.fetch !== "function" || typeof win.AbortController !== "function") {
        showError(["This browser can't send requests to the Explainer."]);
        return Promise.resolve();
      }
      checkHealth();
      stopSpeech();
      hideError();
      var ctl = new win.AbortController();
      S.cancel = ctl;
      S.cancelledByUser = false;
      setLoading(true);
      // Explain is now disabled; keep keyboard focus inside the widget so Esc still reaches it.
      if (doc.activeElement === explainBtn || doc.activeElement === doc.body) cancelBtn.focus();
      announce("Explaining your text");
      var status_ = 0;
      var retryAfter = null;
      return win.fetch(apiBase + "/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, options: { literal: true } }),
        cache: "no-store",
        signal: requestSignal(ctl)
      }).then(function (res) {
        status_ = res.status;
        retryAfter = res.headers && res.headers.get("Retry-After");
        return res.text();
      }).then(function (bodyText) {
        if (S.destroyed) return;
        var body = null;
        try { body = JSON.parse(bodyText); } catch (e) { body = null; }
        finish();
        if (!obj(body)) return showError(["Something went wrong. Try again."], { retry: true });
        if (status_ !== 200) return serverError(status_, body, retryAfter);
        if (str(body.schemaVersion).indexOf("1.") !== 0 || !Array.isArray(body.sentences)) {
          return showError(["This Explainer server version isn't supported by this page."]);
        }
        renderResult(body, text);
        saveHistory({ id: str(body.id) || String(Date.now()), createdAt: str(body.createdAt) || new Date().toISOString(), text: text, result: body });
        announce("Explanation ready");
        resultsTitle.focus();
      }).catch(function (err) {
        if (S.destroyed) return;
        finish();
        if (S.cancelledByUser) {
          showError(["Cancelled."], { info: true, focus: "textarea" });
        } else if (err && (err.name === "TimeoutError" || err.name === "AbortError")) {
          showError(["This took too long. Try a shorter text."], { retry: true });
        } else {
          showError(unreachableLines(), { retry: true });
        }
      });
      function finish() {
        if (S.cancel === ctl) S.cancel = null;
        setLoading(false);
      }
    }
    function cancel() {
      if (!S.loading || !S.cancel) return;
      S.cancelledByUser = true;
      S.cancel.abort();
    }

    /* ----- rendering a result ----- */
    function routeControl(link) {
      var label = str(link && link.label) || str(link && link.routeId);
      var route = str(link && link.routeId);
      if (onNavigate && ROUTE_RE.test(route)) {
        var b = h("button", { type: "button", class: "vtx-btn vtx-link", "data-vtx-route": route }, label);
        on(b, "click", function () { try { onNavigate(route); } catch (e) { /* host error: ignore */ } });
        return b;
      }
      return h("span", { class: "vtx-link-text" }, label);
    }
    function joinWith(nodes, sep) {
      var out = [];
      nodes.forEach(function (node, i) { if (i) out.push(sep); out.push(node); });
      return out;
    }
    function chip(text, cls) { return h("span", { class: "vtx-chip " + cls }, text); }
    function badgeChips(badges) {
      return h("span", { class: "vtx-badges" }, arr(badges).filter(function (b) { return typeof b === "string"; })
        .map(function (b) { return chip(b, "vtx-badge" + (/^Irregular/.test(b) ? " vtx-badge-irregular" : /^Reflexive/.test(b) ? " vtx-badge-reflexive" : " vtx-badge-regular")); }));
    }
    function posClass(pos) {
      switch (pos) {
        case "verb": case "auxiliary": return "vtx-pos-verb";
        case "noun": return "vtx-pos-noun";
        case "pronoun": case "reflexive-pronoun": return "vtx-pos-pronoun";
        case "adjective": return "vtx-pos-adjective";
        case "negation": return "vtx-pos-negation";
        case "question-word": return "vtx-pos-question";
        default: return "vtx-pos-other";
      }
    }
    function line(label, value, attrs) {
      return h("p", { class: "vtx-kv" }, [h("span", { class: "vtx-k" }, label + " "), h("span", attrs || null, value)]);
    }

    function verbPanel(chunk) {
      var verb = obj(chunk.verb) || {};
      var g = obj(verb.grounding) || obj(chunk.grounding) || {};
      var inGuide = g.status === "matched" || g.status === "matched-by-form";
      var panel = h("div", { class: "vtx-verb" });
      var inf = inGuide ? str(g.infinitive) : str(verb.infinitive) || str(chunk.lemma);
      var head = h("p", { class: "vtx-verb-head" }, [
        h("span", { class: "vtx-k" }, "Verb: "),
        h("strong", { lang: "fr" }, inf || "?"),
        inGuide && str(g.meaning) ? h("span", { lang: "en" }, " · " + str(g.meaning)) : null,
        h("span", { class: "vtx-source" }, inGuide ? " (from your guide)" : " (from AI)")
      ]);
      panel.appendChild(head);
      if (inGuide) {
        panel.appendChild(badgeChips(g.badges));
        // Type detail adds information only when it differs from the badge text (e.g. not plain "Irregular").
        if (str(g.typeDetail) && arr(g.badges).indexOf(str(g.typeDetail)) === -1) {
          panel.appendChild(h("p", { class: "vtx-muted" }, str(g.typeDetail)));
        }
      } else {
        var reg = str(verb.regularity);
        panel.appendChild(h("span", { class: "vtx-badges" }, [chip("Not in your guide", "vtx-badge vtx-badge-unknown")]));
        if (g.status === "ambiguous") {
          var cands = arr(g.candidates).map(function (c) { return str(c && c.infinitive); }).filter(Boolean);
          if (cands.length) panel.appendChild(h("p", { class: "vtx-muted" }, "Your guide has this form under: " + cands.join(", ") + "."));
        }
        if (reg) panel.appendChild(h("p", { class: "vtx-muted" }, "The AI says this verb is " + reg + "."));
      }
      var tl = [];
      if (str(verb.tenseLabel)) tl.push("Tense: " + str(verb.tenseLabel));
      if (str(verb.personLabel)) tl.push("Person: " + str(verb.personLabel));
      if (tl.length) panel.appendChild(h("p", { class: "vtx-kv" }, tl.join(" · ")));
      if (inGuide && str(g.auxiliary)) {
        var compound = COMPOUND_TENSES.indexOf(str(verb.tense)) !== -1 || !!g.auxFromForm;
        panel.appendChild(h("p", { class: "vtx-kv" }, compound
          ? "uses " + str(g.auxiliary) + " (helper verb in the past)"
          : "uses " + str(g.auxiliary) + " in the passé composé"));
      }
      var gp = obj(g.guidePronunciation);
      if (inGuide && gp && str(gp.text)) {
        var phrase = str(gp.speak) || str(chunk.french);
        var gpRow = h("div", { class: "vtx-gp" }, [
          h("p", { class: "vtx-kv" }, [h("span", { class: "vtx-k" }, "Sounds like: "), h("span", { class: "vtx-respell" }, str(gp.text)),
            h("span", { class: "vtx-source" }, " · " + str(gp.label))]),
          listenButton("guide", [phrase], phrase)
        ]);
        panel.appendChild(gpRow);
      }
      var links = arr(g.links);
      if (inGuide && links.length) {
        panel.appendChild(h("p", { class: "vtx-kv vtx-links" }, [h("span", { class: "vtx-k" }, "Lesson: ")].concat(joinWith(links.map(routeControl), " · "))));
      }
      arr(g.disagreements).forEach(function (d) {
        if (!obj(d) || !str(d.message)) return;
        panel.appendChild(h("p", { class: "vtx-check" }, [h("strong", null, "Check:"), " " + str(d.message)]));
      });
      return panel;
    }

    function chunkRow(chunk, chunks) {
      var c = obj(chunk) || {};
      var french = str(c.french);
      var g = obj(c.grounding);
      var li = h("li", { class: "vtx-chunk" });
      var main = h("div", { class: "vtx-chunk-main" }, [
        h("span", { class: "vtx-chunk-fr", lang: "fr" }, french),
        h("span", { class: "vtx-chunk-en", lang: "en" }, str(c.english)),
        chip(str(c.posLabel) || str(c.pos) || "other", posClass(str(c.pos))),
        listenButton("chunk", [french], french)
      ]);
      li.appendChild(main);
      if (c.notInSentence) li.appendChild(h("p", { class: "vtx-muted" }, "(not found in your sentence)"));
      if (g && g.status === "merged") {
        var target = obj(chunks[g.intoChunk]);
        li.appendChild(h("p", { class: "vtx-muted" }, "helper verb for '" + (target ? str(target.french) : "") + "'"));
      } else if (c.pos === "verb" || c.groundedAs === "verb") {
        li.appendChild(verbPanel(c));
      }
      return li;
    }

    function sentenceCard(s, i) {
      var sent = obj(s) || {};
      var french = str(sent.french);
      var frId = id("s" + i + "-fr");
      var card = h("li", { class: "vtx-card vtx-sentence" + (sent.status === "ok" ? "" : " vtx-sentence-failed") });
      card.appendChild(h("p", { class: "vtx-eyebrow" }, "Sentence " + (i + 1)));
      card.appendChild(h("p", { class: "vtx-sentence-fr", lang: "fr", id: frId }, french));
      if (sent.status !== "ok") {
        var err = obj(sent.error) || {};
        card.appendChild(h("p", { class: "vtx-warn-text" }, err.code === "MODEL_TIMEOUT"
          ? "This sentence took too long and was skipped." : "We couldn't explain this sentence. Try again."));
        var again = h("button", { type: "button", class: "vtx-btn", "aria-describedby": frId }, "Explain this sentence on its own");
        on(again, "click", function () { ta.value = french; updateCounts(); run(); });
        card.appendChild(h("div", { class: "vtx-actions" }, [listenButton("sentence", [french], french), again]));
        return card;
      }
      card.appendChild(h("p", { class: "vtx-sentence-en", lang: "en" }, str(sent.english)));
      var bdId = id("s" + i + "-bd");
      var expanded = i === 0;
      var toggle = h("button", {
        type: "button", class: "vtx-btn vtx-disclosure", "aria-expanded": expanded ? "true" : "false",
        "aria-controls": bdId, "aria-describedby": frId
      }, expanded ? "Hide breakdown" : "Show breakdown");
      card.appendChild(h("div", { class: "vtx-actions" }, [listenButton("sentence", [french], french), toggle]));
      var bd = h("div", { class: "vtx-breakdown", id: bdId, hidden: !expanded });
      var pr = obj(sent.pronunciation);
      if (pr && str(pr.text)) bd.appendChild(line("Approximate pronunciation (AI):", str(pr.text), { class: "vtx-respell" }));
      if (str(sent.literal)) bd.appendChild(line("Word for word:", str(sent.literal), { lang: "en" }));
      var chunks = arr(sent.chunks);
      var ol = h("ol", { class: "vtx-chunks" }, chunks.map(function (c) { return chunkRow(c, chunks); }));
      bd.appendChild(ol);
      card.appendChild(bd);
      on(toggle, "click", function () {
        var open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "Hide breakdown" : "Show breakdown";
        bd.hidden = !open;
      });
      return card;
    }

    function section(title, children, cls) {
      return h("section", { class: "vtx-section" + (cls ? " " + cls : "") }, [h(hSection, { class: "vtx-h4" }, title)].concat(children));
    }

    // Detach and forget handlers on controls inside container (about to be cleared) so S.listeners does not grow per render.
    function pruneListenersIn(container) {
      S.listeners = S.listeners.filter(function (l) {
        var inOld = l[0] && l[0].nodeType === 1 && container.contains(l[0]);
        if (inOld) l[0].removeEventListener(l[1], l[2]);
        return !inOld;
      });
    }

    function renderResult(r, text) {
      // Drop Listen entries of the previous result before building the new one.
      if (S.activeEntry) stopSpeech();
      S.listen = S.listen.filter(function (e) { return !resultsBody.contains(e.btn); });
      pruneListenersIn(resultsBody);
      clear(resultsBody);
      var sentences = arr(r.sentences);

      // Notice banner (always).
      var notices = arr(r.notices).filter(function (x) { return typeof x === "string" && x && x !== AI_NOTICE; });
      resultsBody.appendChild(h("div", { class: "vtx-notice" }, [
        h("p", null, AI_NOTICE + " Verb facts marked 'from your guide' come from your verb guide.")
      ].concat(notices.map(function (x) { return h("p", null, x); }))));

      // Translation card.
      var tr = obj(r.translation) || {};
      var cefr = obj(r.cefr) || {};
      var copyBtn = h("button", { type: "button", class: "vtx-btn", "data-vtx-action": "copy" }, "Copy");
      on(copyBtn, "click", function () { copy(plainText(r, text)); });
      var card = h("div", { class: "vtx-card vtx-translation" }, [
        h("p", { class: "vtx-eyebrow" }, "English"),
        h("p", { class: "vtx-natural", lang: "en" }, str(tr.natural)),
        str(tr.literal) ? line("Word for word:", str(tr.literal), { lang: "en" }) : null,
        str(cefr.level) ? h("p", { class: "vtx-muted" }, "Level: about " + str(cefr.level) +
          (str(cefr.confidence) === "low" || !str(cefr.confidence) ? " (rough AI estimate)" : " (AI estimate)")) : null,
        h("div", { class: "vtx-actions" }, [
          listenButton("input", sentences.map(function (s) { return str(obj(s) && s.french); }), "", "Listen to the whole French text"),
          copyBtn
        ])
      ]);
      resultsBody.appendChild(section("Translation", [card]));

      // Sentence cards.
      resultsBody.appendChild(section("Sentence by sentence", [h("ol", { class: "vtx-sentences" }, sentences.map(sentenceCard))]));

      // Grammar points.
      var gps = arr(r.grammarPoints).filter(obj);
      if (gps.length) {
        resultsBody.appendChild(section("Grammar points", [h("ul", { class: "vtx-grammar" }, gps.map(function (gp) {
          var refs = arr(gp.sentenceIndexes).filter(Number.isInteger).map(function (x) { return x + 1; });
          return h("li", { class: "vtx-card vtx-gcard" }, [
            chip(str(gp.topicLabel) || str(gp.topic) || "Grammar", "vtx-topic"),
            h("p", { class: "vtx-gtitle" }, str(gp.title)),
            str(gp.explanation) ? h("p", { lang: "en" }, str(gp.explanation)) : null,
            str(gp.example) ? h("p", { class: "vtx-example" }, [h("span", { class: "vtx-k" }, "Example: "), h("span", { lang: "fr" }, str(gp.example))]) : null,
            refs.length ? h("p", { class: "vtx-muted" }, (refs.length === 1 ? "Sentence " : "Sentences ") + refs.join(", ")) : null
          ]);
        }))]));
      }

      // Verbs summary.
      var verbs = arr(r.verbs).filter(obj);
      var unknown = arr(r.unknownVerbs).filter(obj);
      if (verbs.length || unknown.length) {
        var kids = [];
        if (verbs.length) {
          kids.push(h("ul", { class: "vtx-verbs" }, verbs.map(function (v) {
            var occ = arr(v.occurrences).map(function (o) { return str(obj(o) && o.french); }).filter(Boolean);
            var links = arr(v.links);
            return h("li", { class: "vtx-verb-row" }, [
              h("p", { class: "vtx-verb-head" }, [h("strong", { lang: "fr" }, str(v.infinitive)), str(v.meaning) ? h("span", { lang: "en" }, " · " + str(v.meaning)) : null]),
              badgeChips(v.badges),
              occ.length ? h("p", { class: "vtx-muted" }, ["In your text: ", h("span", { lang: "fr" }, occ.join(", "))]) : null,
              links.length ? h("p", { class: "vtx-kv vtx-links" }, joinWith(links.map(routeControl), " · ")) : null
            ]);
          })));
        }
        if (unknown.length) {
          kids.push(h("p", { class: "vtx-gtitle" }, "Other verbs (not in your 125-verb guide; details from AI)"));
          kids.push(h("ul", { class: "vtx-unknown" }, unknown.map(function (u) {
            return h("li", null, [h("span", { lang: "fr" }, str(u.lemma) || str(u.french)),
              str(u.french) && str(u.french) !== str(u.lemma) ? h("span", { class: "vtx-muted" }, [" (", h("span", { lang: "fr" }, str(u.french)), ")"]) : null]);
          })));
        }
        resultsBody.appendChild(section("Verbs", kids));
      }

      // Related lessons.
      var topics = arr(r.topicLinks).filter(obj);
      if (topics.length) {
        resultsBody.appendChild(h("p", { class: "vtx-related vtx-links" }, [h("span", { class: "vtx-k" }, "Related lessons: ")].concat(joinWith(topics.map(routeControl), " · "))));
      }

      results.hidden = false;
    }

    function plainText(r, text) {
      var tr = obj(r.translation) || {};
      var out = ["French: " + str(text).trim(), "English: " + str(tr.natural)];
      if (str(tr.literal)) out.push("Word for word: " + str(tr.literal));
      arr(r.sentences).forEach(function (s, i) {
        var sent = obj(s) || {};
        out.push("", "Sentence " + (i + 1) + ": " + str(sent.french));
        if (str(sent.english)) out.push(str(sent.english));
        arr(sent.grammar).forEach(function (g) { if (obj(g) && str(g.title)) out.push("- " + str(g.title)); });
      });
      return out.join("\n");
    }

    function copy(textToCopy) {
      var fallback = function () {
        var ok = false;
        var tmp = h("textarea", { class: "vtx-offscreen", "aria-hidden": "true", tabindex: "-1" });
        tmp.value = textToCopy;
        tmp.readOnly = true;
        root.appendChild(tmp);
        try { tmp.select(); ok = doc.execCommand("copy"); } catch (e) { ok = false; }
        root.removeChild(tmp);
        announce(ok ? "Copied" : "Couldn't copy");
      };
      var clip = win.navigator && win.navigator.clipboard;
      if (clip && typeof clip.writeText === "function") {
        clip.writeText(textToCopy).then(function () { announce("Copied"); }, fallback);
      } else fallback();
    }

    /* ----- history (design §9.5) ----- */
    function loadHistory() {
      if (!storage) { S.memoryHistory = true; return; }
      var raw = null;
      try { raw = storage.getItem(historyKey); } catch (e) { S.memoryHistory = true; return; }
      if (typeof raw !== "string") return;
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (obj(parsed) && parsed.version === 1) S.history = arr(parsed.items).filter(validHistoryItem).slice(0, HISTORY_MAX_ITEMS);
    }
    function persist() {
      if (S.memoryHistory || !storage) return;
      var items = historyTrim(S.history);
      S.history = items;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          storage.setItem(historyKey, JSON.stringify({ version: 1, items: items }));
          return;
        } catch (e) {
          var quota = e && (e.name === "QuotaExceededError" || e.code === 22 || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
          if (!quota) { S.memoryHistory = true; return; }
          if (attempt === 0 && items.length > 1) { items = items.slice(0, -1); S.history = items; continue; }
          announce("Couldn't save this explanation to your history.");
          return;
        }
      }
      announce("Couldn't save this explanation to your history.");
    }
    function saveHistory(item) {
      S.history = [item].concat(S.history.filter(function (x) { return x.id !== item.id; })).slice(0, HISTORY_MAX_ITEMS);
      persist();
      renderHistory();
    }
    function renderHistory() {
      pruneListenersIn(historyList);
      clear(historyList);
      historyBox.hidden = S.history.length === 0;
      historyToggle.textContent = "Recent explanations (" + S.history.length + ")";
      var now = Date.now();
      S.history.forEach(function (item) {
        var t = item.text.replace(/\s+/g, " ").trim();
        var short = cpLen(t) > 60 ? Array.from(t).slice(0, 60).join("") + "…" : t;
        var b = h("button", { type: "button", class: "vtx-btn vtx-hitem" }, [
          h("span", { lang: "fr" }, short), h("span", { class: "vtx-muted" }, relativeTime(item.createdAt, now))
        ]);
        on(b, "click", function () {
          ta.value = item.text;
          updateCounts();
          hideError();
          renderResult(item.result, item.text);
          resultsTitle.focus();
        });
        historyList.appendChild(h("li", null, b));
      });
      historyNote.hidden = !S.memoryHistory;
      historyNote.textContent = S.memoryHistory ? "History is kept only until you close this page." : "";
    }

    /* ----- wiring ----- */
    on(ta, "input", updateCounts);
    on(ta, "keydown", function (ev) {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); run(); }
    });
    on(root, "keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (S.loading) { ev.preventDefault(); cancel(); } else if (S.activeEntry) stopSpeech();
    });
    on(explainBtn, "click", function () { run(); });
    on(cancelBtn, "click", function () { cancel(); });
    on(clearBtn, "click", function () {
      ta.value = "";
      updateCounts();
      hideError();
      ta.focus();
    });
    on(historyToggle, "click", function () {
      S.historyOpen = !S.historyOpen;
      historyToggle.setAttribute("aria-expanded", S.historyOpen ? "true" : "false");
      historyPanel.hidden = !S.historyOpen;
    });
    on(historyClear, "click", function () {
      var ok = typeof win.confirm === "function" ? win.confirm("Clear your recent explanations?") : true;
      if (!ok) return;
      S.history = [];
      if (storage && !S.memoryHistory) { try { storage.removeItem(historyKey); } catch (e) { /* ignore */ } }
      S.historyOpen = false;
      historyToggle.setAttribute("aria-expanded", "false");
      historyPanel.hidden = true;
      renderHistory();
      announce("History cleared");
      ta.focus();
    });

    if (synth) {
      refreshVoices();
      on(synth, "voiceschanged", refreshVoices);
      [250, 1000, 2500, 5000].forEach(function (ms) { later(refreshVoices, ms); });
      later(markChecked, 2000); // some browsers never fire voiceschanged when there are no voices
    }
    updateVoiceUI();
    loadHistory();
    renderHistory();
    updateCounts();
    checkHealth();

    function destroy() {
      if (S.destroyed) return;
      if (S.cancel) S.cancel.abort();
      if (S.healthCtl) S.healthCtl.abort();
      if (S.activeEntry && synth) synth.cancel();
      S.destroyed = true;
      S.timers.forEach(function (t) { win.clearTimeout(t); });
      S.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
      S.timers = [];
      S.listeners = [];
      S.listen = [];
      if (root.parentNode) root.parentNode.removeChild(root);
      if (mounted && mounted.get(container) === inst) mounted.delete(container);
    }
    var inst = {
      explain: function (text) {
        if (S.destroyed) return Promise.resolve();
        ta.value = String(text == null ? "" : text);
        updateCounts();
        return run();
      },
      /** Replace the voice settings (same shape as options.voiceSettings); used by the next Listen. */
      setVoiceSettings: function (vs) {
        if (S.destroyed) return;
        S.settings = readVoiceSettings({ voiceSettings: vs }, storage);
        updateVoiceUI();
      },
      destroy: destroy
    };
    return inst;
  }

  win.VT_EXPLAINER = {
    version: VERSION,
    mount: mount,
    _test: { autoPick: autoPick, readVoiceSettings: readVoiceSettings, splitSentences: splitSentences, historyTrim: historyTrim,
      isRoute: function (r) { return typeof r === "string" && ROUTE_RE.test(r); } }
  };
})(window);
