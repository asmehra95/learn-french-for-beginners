/* Verb trainer: audio playback.
   1. A bundled native-speaker word recording (Lingua Libre, see audio/CREDITS.md), only when the caller
      passes its key (the "Native speaker (word only)" button), played with an <audio> element.
   2. A pre-recorded full-phrase clip (audio/tts/<voice>/, see js/tts-manifest.js) when "Recorded voice"
      is chosen in Settings and a clip exists for exactly this text (works from file://, no fetch).
      An optional voiceId picks another recorded voice (js/tts-manifest-<id>.js, window.VT_TTS_VOICES): the
      Dialogues pass their speaker's voice; a missing clip for that voice uses the device voice, never the
      default voice's clip.
   3. Otherwise the device's computer voice (Web Speech API): the voice picked in Voice settings,
      or the best French voice found automatically. */
(function (root) {
  "use strict";

  var L = root.VT_LOGIC;
  var manifest = (root.VERB_AUDIO && root.VERB_AUDIO.items) || {};
  // Pre-recorded full-phrase clips (js/tts-manifest.js, made by tts-tools/generate.py): ttsKey(text) -> { file, voiceId, duration }.
  var tts = root.VT_TTS && root.VT_TTS.items ? root.VT_TTS : null;
  var ttsItems = tts ? tts.items : {};
  var extra = root.VT_TTS_VOICES || {};   // other recorded voices (js/tts-manifest-<id>.js)
  var synth = "speechSynthesis" in root && typeof root.SpeechSynthesisUtterance === "function" ? root.speechSynthesis : null;

  var RATE_MIN = 0.6;
  var RATE_MAX = 1.2;
  var RATE_DEFAULT = 0.85;
  var PREVIEW_TEXT = "Bonjour, nous avons deux frères.";

  // Novelty / effect voices that are a poor model for learners.
  var NOVELTY = /^(grandma|grandpa|rocko|shelley|sandy|flo|eddy|reed|bad news|good news|bubbles|albert|bahh|bells|boing|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy)\b/i;
  // Natural-sounding French (France) voices, best first.
  var PREFERRED = ["thomas", "audrey", "aurélie", "aurelie", "marie", "jacques", "amélie", "amelie"];
  var REGIONS = { FR: "France", CA: "Canada", BE: "Belgium", CH: "Switzerland", LU: "Luxembourg", MC: "Monaco" };

  var prefs = { voiceURI: "", voiceName: "", rate: RATE_DEFAULT, preferNative: true, voiceSource: "recorded" };
  var SOURCES = ["recorded", "device"];
  var voices = [];           // French voices currently available
  var signature = "";        // detects real changes in the voice list
  var voicesChecked = false; // true once we know whether a French voice exists
  var checkedListeners = [];
  var changeListeners = [];
  var current = null;        // currently playing HTMLAudioElement
  var shared = null;         // the one HTMLAudioElement, created lazily on the first play() (a click)
  var detachPrev = null;     // removes the previous play()'s listeners

  /* ---------- voice helpers (pure; exported for tests) ---------- */
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
    // "Amélie (Premium)" -> "Amélie"; Chrome may also add "(French (Canada))".
    var n = String((v && v.name) || "").replace(/\s*\((premium|enhanced)\)/ig, "").replace(/\s*\(French[^)]*\)?\)?\s*$/i, "").trim();
    return n || String((v && v.name) || "Unnamed voice");
  }
  function isNovelty(v) {
    return NOVELTY.test(baseName(v)) || /\.eloquence\./i.test(String((v && v.voiceURI) || ""));
  }
  function regionLabel(v) { var r = region(v); return r ? "French (" + r + ")" : "French"; }
  function describe(v) {
    var q = quality(v);
    return baseName(v) + " — " + regionLabel(v) + (q ? " · " + q : "");
  }
  function preferredRank(v) {
    var i = PREFERRED.indexOf(baseName(v).toLowerCase());
    return i === -1 ? PREFERRED.length : i;
  }
  function byPreference(a, b) { return preferredRank(a) - preferredRank(b); }

  function frenchVoices(list) {
    return (list || []).filter(isFrench);
  }

  /** Best voice for learners when the user has not chosen one. */
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

  /** The saved voice when it is available (matched by voiceURI, then name), else null. */
  function savedVoice(list) {
    var fr = frenchVoices(list);
    if (!prefs.voiceURI && !prefs.voiceName) return null;
    var i;
    if (prefs.voiceURI) {
      for (i = 0; i < fr.length; i++) if (fr[i].voiceURI === prefs.voiceURI) return fr[i];
    }
    if (prefs.voiceName) {
      for (i = 0; i < fr.length; i++) if (fr[i].name === prefs.voiceName) return fr[i];
    }
    return null;
  }

  function activeVoice() { return savedVoice(voices) || autoPick(voices); }

  /** Note to show when the voice's accent differs from the guide (France French), else "". */
  function accentNote(v) {
    if (!v || isFrance(v) || !region(v)) return "";
    if (/^fr-CA$/i.test(normLang(v))) {
      return "This voice uses a Canadian (Québec) accent; the guide's pronunciations follow France French.";
    }
    return "This voice uses a French (" + region(v) + ") accent; the guide's pronunciations follow France French.";
  }

  function clampRate(r) {
    var n = Number(r);
    if (!isFinite(n)) return RATE_DEFAULT;
    return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(n * 100) / 100));
  }

  /* ---------- voice list loading (asynchronous in most browsers) ---------- */
  function refreshVoices() {
    if (!synth) return;
    var all = synth.getVoices() || [];
    if (!all.length) return;
    var fr = frenchVoices(all);
    var sig = fr.map(function (v) { return v.voiceURI + "|" + v.name + "|" + v.lang; }).join(";");
    voices = fr;
    markChecked();
    if (sig !== signature) {
      signature = sig;
      changeListeners.forEach(function (fn) { fn(); });
    }
  }

  function markChecked() {
    if (voicesChecked) return;
    voicesChecked = true;
    checkedListeners.forEach(function (fn) { fn(); });
  }

  if (synth) {
    refreshVoices();
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", refreshVoices);
    } else {
      synth.onvoiceschanged = refreshVoices;
    }
    // Safari can fill the list late without firing voiceschanged; check a few more times.
    [250, 1000, 2500, 5000].forEach(function (ms) { root.setTimeout(refreshVoices, ms); });
    // Some browsers never fire voiceschanged when they have no voices at all.
    root.setTimeout(markChecked, 2000);
  }

  /* ---------- playback ---------- */
  function nativeFor(key) {
    return key && Object.prototype.hasOwnProperty.call(manifest, key) ? manifest[key] : null;
  }

  /** Native recording that Listen would play for `key`, honouring the user's preference. */
  function nativeToPlay(key) { return prefs.preferNative ? nativeFor(key) : null; }

  /** { items, voice } of a recorded voice: the default voice for no id (or its own id), an extra voice's
      manifest otherwise; null when that voice isn't loaded. */
  function manifestFor(voiceId) {
    if (!voiceId || (tts && voiceId === tts.defaultVoice)) {
      return tts ? { items: ttsItems, voice: (tts.voices && tts.voices[tts.defaultVoice]) || null } : null;
    }
    var m = Object.prototype.hasOwnProperty.call(extra, voiceId) ? extra[voiceId] : null;
    return m && m.items ? m : null;
  }

  /** The pre-recorded clip for exactly this text (after ttsKey normalization) in that voice, or null. */
  function recordedFor(text, voiceId) {
    var m = manifestFor(voiceId);
    if (!m || text == null) return null;
    var key = L.ttsKey(text);
    if (!key || !Object.prototype.hasOwnProperty.call(m.items, key)) return null;
    var it = m.items[key];
    var voice = m === extra[voiceId] ? (m.voice || null) : ((tts.voices && tts.voices[it.voiceId]) || null);
    return { file: it.file, voiceId: it.voiceId, duration: it.duration, key: key, voice: voice };
  }

  /** The clip Listen plays for `text` with the current setting: null when "Device voice" is chosen. */
  function recordedToPlay(text, voiceId) { return prefs.voiceSource === "recorded" ? recordedFor(text, voiceId) : null; }

  /** Recorded clips follow the rate slider: the default rate (0.85) is the clip's natural speed. */
  function playbackRate() {
    return Math.min(1.4, Math.max(0.7, Math.round((prefs.rate / RATE_DEFAULT) * 100) / 100));
  }

  function stop() {
    if (current) {
      current.pause();
      current = null;
    }
    if (synth) synth.cancel();
  }

  /** fn wrapped so it runs at most once. */
  function once(fn) {
    var called = false;
    return function () {
      if (called) return;
      called = true;
      fn();
    };
  }

  /** Speak with the chosen voice and rate; onEnd (optional) runs on the utterance's end or error.
      Returns the utterance, or null when unsupported. */
  function speakComputer(text, onEnd) {
    if (!synth) return null;
    var u = new root.SpeechSynthesisUtterance(L.speakableText(text));
    var v = activeVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = "fr-FR";
    }
    u.rate = prefs.rate;
    if (typeof onEnd === "function") {
      var end = once(onEnd);
      u.onend = end;
      u.onerror = end;
    }
    synth.speak(u);
    return u;
  }

  /**
   * Play `text`. Order: (1) `key` (e.g. "etre|1s") selects a native word recording when one exists
   * (only the "Native speaker (word only)" button passes a key); (2) the pre-recorded full-phrase clip
   * when "Recorded voice" is on and one exists for exactly this text; (3) the device (computer) voice.
   * Calls done({ source: "native" | "recorded" | "computer" | "none", entry }) when playback starts, and
   * again with source "computer" (and `failed`) if a file then fails to play.
   * onEnd() (optional) is called once when the sound finishes or fails for good (right away when nothing
   * can play); never for a play() that a newer play()/preview() has replaced.
   */
  var playToken = 0; // increments on every play(); stale callbacks from earlier clicks are ignored

  /* One shared <audio> element for every clip: WebKit lets an element that has played from a gesture keep
     playing new sources started from timers (Dialogues Play all). Rate is set per call (the load algorithm
     resets playbackRate to defaultPlaybackRate). */
  function audioFor(file, rate) {
    if (!shared) shared = new root.Audio();
    shared.src = file;
    shared.defaultPlaybackRate = rate;
    shared.playbackRate = rate;
    return shared;
  }

  function play(text, key, done, onEnd, opts) {
    var report = typeof done === "function" ? done : function () {};
    var token = ++playToken;
    var detach = function () {};
    var finish = once(function () {
      detach();
      if (token === playToken && typeof onEnd === "function") onEnd();
    });
    stop();
    var entry = nativeToPlay(key);
    var source = "native";
    if (!entry) {
      entry = recordedToPlay(text, opts && opts.voiceId);
      source = "recorded";
    }
    if (!entry) {
      var u = speakComputer(text, finish);
      report({ source: u ? "computer" : "none", entry: null });
      if (!u) finish();
      return;
    }
    // listeners of the previous play() go before the src swap, so its abort/error can't reach this call
    if (detachPrev) { detachPrev(); detachPrev = null; }
    var audio = audioFor(entry.file, source === "recorded" ? playbackRate() : 1);
    current = audio;
    var settled = false;
    function fallback() {
      detach();
      if (settled || token !== playToken) return;
      settled = true;
      if (current === audio) current = null;
      var u = speakComputer(text, finish);
      report({ source: u ? "computer" : "none", entry: null, failed: entry });
      if (!u) finish();
    }
    detach = function () {
      audio.removeEventListener("error", fallback);
      audio.removeEventListener("ended", finish);
      if (detachPrev === detach) detachPrev = null;
    };
    audio.addEventListener("error", fallback);
    audio.addEventListener("ended", finish);
    detachPrev = detach;
    // Report right away so the indicator is instant; if the file then fails to play,
    // fallback() reports a second time with source "computer".
    report({ source: source, entry: entry });
    var p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(function () { settled = true; }, function (err) {
        // AbortError just means a newer click paused this one.
        if (err && err.name === "AbortError") return;
        fallback();
      });
    }
  }

  /** Speak the sample sentence with the computer voice; onEnd as in play(). Returns the utterance or null. */
  function preview(onEnd) {
    var token = ++playToken;
    stop();
    return speakComputer(PREVIEW_TEXT, function () {
      if (token === playToken && typeof onEnd === "function") onEnd();
    });
  }

  /** Update preferences ({ voiceURI, voiceName, rate, preferNative, voiceSource }); missing fields are kept. */
  function configure(p) {
    if (!p) return;
    if (typeof p.voiceURI === "string") prefs.voiceURI = p.voiceURI;
    if (typeof p.voiceName === "string") prefs.voiceName = p.voiceName;
    if (p.rate != null) prefs.rate = clampRate(p.rate);
    if (typeof p.preferNative === "boolean") prefs.preferNative = p.preferNative;
    if (SOURCES.indexOf(p.voiceSource) !== -1) prefs.voiceSource = p.voiceSource;
  }

  /** { total, recorded } Listen texts covered by recordings, or null when no recordings are bundled. */
  function recordedCoverage() {
    if (!tts || !tts.coverage) return null;
    return { total: tts.coverage.total, recorded: Object.keys(ttsItems).length };
  }

  /** Metadata of the bundled recorded voice ({ id, label, model, license, … }) or null. */
  function recordedVoice() {
    if (!tts || !tts.voices) return null;
    return tts.voices[tts.defaultVoice] || null;
  }

  /** Metadata of any recorded voice (default or extra), or null. */
  function voiceMeta(voiceId) {
    var m = manifestFor(voiceId);
    if (!m) return null;
    return m.voice || null;
  }

  /** Metadata of the extra recorded voices (Settings and Credits), in load order. */
  function extraVoices() {
    return Object.keys(extra).filter(function (id) { return extra[id] && extra[id].items && extra[id].voice; })
      .map(function (id) { return extra[id].voice; });
  }

  root.VT_SPEECH = {
    play: play,
    stop: stop,
    preview: preview,
    configure: configure,
    preferences: function () {
      return { voiceURI: prefs.voiceURI, voiceName: prefs.voiceName, rate: prefs.rate, preferNative: prefs.preferNative, voiceSource: prefs.voiceSource };
    },
    nativeFor: nativeFor,
    nativeToPlay: nativeToPlay,
    recordedFor: recordedFor,
    recordedToPlay: recordedToPlay,
    recordedCoverage: recordedCoverage,
    recordedVoice: recordedVoice,
    voiceMeta: voiceMeta,
    extraVoices: extraVoices,
    defaultVoiceId: function () { return tts ? tts.defaultVoice : null; },
    playbackRate: playbackRate,
    /** True when this item can be played at all (native recording, recorded clip or computer voice). */
    canPlay: function (key, text, voiceId) { return !!nativeToPlay(key) || !!recordedToPlay(text, voiceId) || !!synth; },
    synthSupported: function () { return !!synth; },
    /** null until known; then true/false. */
    hasFrenchVoice: function () { return voicesChecked ? voices.length > 0 : null; },
    onVoicesChecked: function (fn) {
      if (voicesChecked) fn(); else checkedListeners.push(fn);
    },
    /** Called whenever the list of French voices changes (they load asynchronously). */
    onVoicesChanged: function (fn) { changeListeners.push(fn); },
    /** French voices available now, in browser order. */
    voices: function () { return voices.slice(); },
    /** The voice the computer will use now (saved choice if available, else automatic). */
    activeVoice: activeVoice,
    /** The automatic choice, ignoring any saved preference. */
    autoVoice: function () { return autoPick(voices); },
    /** The saved voice when it is available, else null. */
    savedVoice: function () { return savedVoice(voices); },
    autoPick: autoPick,
    describe: describe,
    regionLabel: regionLabel,
    quality: quality,
    isNovelty: isNovelty,
    isFrance: isFrance,
    accentNote: accentNote,
    RATE_MIN: RATE_MIN,
    RATE_MAX: RATE_MAX,
    RATE_DEFAULT: RATE_DEFAULT,
    PREVIEW_TEXT: PREVIEW_TEXT,
    coverage: (root.VERB_AUDIO && root.VERB_AUDIO.coverage) || null
  };
})(window);
