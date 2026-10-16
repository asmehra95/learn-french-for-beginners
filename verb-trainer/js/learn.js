/* Verb trainer: pure teaching, date, deck and router helpers (no DOM). Design §4, §6, §8–§13.
   Used by the browser views (window.VT_LEARN) and by the Node unit tests (module.exports). */
(function (root) {
  "use strict";

  var L = (typeof window !== "undefined" && window.VT_LOGIC) || require("./logic.js");

  var LESSON_SESSION_LENGTH = 10;
  var QUIZ_PASS_RATIO = 0.8;
  var REVIEW_FIRST_AT = 8;
  var AUX_RE = /^(j'ai|je suis)\s+/;
  var CHOICE_TYPES = ["form", "meaning", "sentence", "aux"];

  /* ---------- warnings (once per message) ---------- */
  var warned = {};
  function warnOnce(msg) {
    if (warned[msg]) return;
    warned[msg] = true;
    if (typeof console !== "undefined" && console.warn) console.warn(msg);
  }

  /* ---------- VERB_META (with a built-in fallback for the families) ---------- */
  var FALLBACK_FAMILIES = {
    "er": { endings: ["e", "es", "e", "ons", "ez", "ent"], label: "Regular -er verb",
      hint: "Drop -er, add -e, -es, -e, -ons, -ez, -ent. The je, tu, il and ils forms all sound the same." },
    "s-t": { endings: ["s", "s", "t", "ons", "ez", "ent"], label: "-s, -s, -t pattern",
      hint: "Endings -s, -s, -t, -ons, -ez, -ent. Watch the stem: it often changes for nous and vous." },
    "x-t": { endings: ["x", "x", "t", "ons", "ez", "ent"], label: "-x, -x, -t pattern",
      hint: "Endings -x, -x, -t, -ons, -ez, -ent (like pouvoir and vouloir)." },
    "d": { endings: ["s", "s", "", "ons", "ez", "ent"], label: "-s, -s, no ending",
      hint: "Endings -s, -s, (nothing), -ons, -ez, -ent: il prend, il met." },
    "ir": { endings: ["is", "is", "it", "issons", "issez", "issent"], label: "Regular -ir verb",
      hint: "Drop -ir, add -is, -is, -it, -issons, -issez, -issent (like finir)." },
    "unique": { endings: null, label: "Irregular: learn by heart",
      hint: "This verb has its own forms. It's so common that it's worth learning by heart." },
    "none": { endings: null, label: "Pattern not described yet", hint: "" }
  };
  var FALLBACK_META = { version: 0, families: FALLBACK_FAMILIES, verbs: {}, confusables: [] };

  function META() {
    var m = root && root.VERB_META;
    if (m && m.families && m.verbs) return m;
    warnOnce("verbTrainer: VERB_META is missing (js/verb-meta.js); using built-in ending patterns");
    return FALLBACK_META;
  }

  function family(name) {
    var fams = META().families;
    return fams[name] || FALLBACK_FAMILIES[name] || FALLBACK_FAMILIES.none;
  }

  function nfc(s) { return String(s == null ? "" : s).normalize("NFC"); }
  function bare(s) { return L.stripAccents(L.normalize(s)); }

  /* ---------- persons and item keys (§6.7, §8.0) ---------- */
  function personsOf(verb) {
    return (verb && verb.present ? verb.present : []).map(function (r) { return r.person; });
  }

  /** True when verb.sentence exists and its verbForm can be blanked. Warns once per verb otherwise. */
  function sentenceOk(verb) {
    if (!verb || !verb.sentence) return false;
    try {
      L.blankSentence(verb.sentence);
      return true;
    } catch (e) {
      warnOnce("verbTrainer: sentence for " + verb.id + " has no blank for its verb form; sentence items skipped");
      return false;
    }
  }

  /** True when the past form supports the auxiliary question (D15, §6.5). */
  function auxOk(verb) {
    var p = verb && verb.past;
    if (!p || (p.auxiliary !== "avoir" && p.auxiliary !== "être")) return false;
    return AUX_RE.test(L.normalize(p.french));
  }

  /** The single source of item keys for a verb: builders and mastery totals both use it. */
  function itemKeysFor(verb) {
    var ps = personsOf(verb);
    if (!ps.length) warnOnce("verbTrainer: verb " + verb.id + " has no present rows");
    var out = [L.itemKey(verb.id, "flash-inf-meaning"), L.itemKey(verb.id, "flash-meaning-inf")];
    ps.forEach(function (p) { out.push(L.itemKey(verb.id, "flash-conj", p)); });
    ps.forEach(function (p) { out.push(L.itemKey(verb.id, "conjugate", p)); });
    var hasSentence = sentenceOk(verb);
    if (hasSentence) out.push(L.itemKey(verb.id, "sentence"));
    ps.forEach(function (p) { out.push(L.itemKey(verb.id, "choice-form", p)); });
    out.push(L.itemKey(verb.id, "choice-meaning"));
    if (hasSentence) out.push(L.itemKey(verb.id, "choice-sentence"));
    if (auxOk(verb)) out.push(L.itemKey(verb.id, "choice-aux"));
    return out;
  }

  /** Mastery denominator list for one verb (same keys as the builders generate). */
  function itemsFor(verb) { return itemKeysFor(verb); }

  /* ---------- families, type, split, pattern (§8.1–§8.4) ---------- */
  function verbType(verb) {
    if (typeof verb.type === "string" && verb.type) return /^regular/i.test(verb.type) ? "regular" : "irregular";
    var m = META().verbs[verb.id];
    if (m && (m.type === "regular" || m.type === "irregular")) return m.type;
    return verb.regularEr ? "regular" : "irregular";
  }

  /** Three-way badge category: "regular" | "regular-spelling-change" | "irregular" (verb-types.js rule). */
  function verbCategory(verb) {
    var c = verb.typeCategory;
    if (c === "regular" || c === "regular-spelling-change" || c === "irregular") return c;
    if (typeof verb.type === "string" && verb.type) {
      if (/^irregular/i.test(verb.type)) return "irregular";
      if (/spelling change/i.test(verb.type)) return "regular-spelling-change";
      if (/^regular/i.test(verb.type)) return "regular";
    }
    return verbType(verb);
  }

  /** Pronominal (reflexive) verb: flagged by verb-types.js or "Pronominal" in the type string. */
  function isPronominal(verb) {
    if (typeof verb.pronominal === "boolean") return verb.pronominal;
    return typeof verb.type === "string" && /pronominal/i.test(verb.type);
  }

  /** One quiet line for the flashcard conjugation peek, from the verb-types string:
      "Regular (-er, spelling change: g→ge before o)" -> "Regular -er · spelling change (g→ge before o)",
      "Irregular (conjugates like venir), Pronominal" -> "Irregular · conjugates like venir · Reflexive". */
  var CATEGORY_TEXT = { "regular": "Regular", "regular-spelling-change": "Regular (spelling change)", "irregular": "Irregular" };
  function typeLine(verb) {
    var t = typeof verb.type === "string" ? verb.type.trim().replace(/,\s*pronominal\s*$/i, "") : "";
    var m = /^(Regular|Irregular)\s*(?:\((.*)\))?$/i.exec(t);
    var parts;
    if (!m) {
      parts = [CATEGORY_TEXT[verbCategory(verb)] || "Irregular"];
    } else {
      var head = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      var rest = m[2] ? m[2].trim() : "";
      // "-er" / "-ir" / "-re" joins the head ("Regular -er"); "1st group"-style notes add nothing for a learner.
      var g = /^(-\w+)(?:,\s*|$)(.*)$/.exec(rest);
      if (g) { head += " " + g[1]; rest = g[2].trim(); }
      if (/^\d\w* group$/i.test(rest)) rest = "";
      parts = [head];
      var sc = /^spelling change:\s*(.+)$/i.exec(rest);
      if (rest) parts.push(sc ? "spelling change (" + sc[1] + ")" : rest);
    }
    if (isPronominal(verb)) parts.push("Reflexive");
    return parts.join(" · ");
  }
  function familyOf(verb) {
    var meta = META();
    var m = meta.verbs[verb.id];
    if (m && m.family && meta.families[m.family]) return m.family;
    if (verb.regularEr === true || (typeof verb.type === "string" && /^Regular \(-er/.test(verb.type))) return "er";
    var inf = String(verb.infinitive || "");
    if (verbType(verb) === "regular" && /ir$/.test(inf)) return "ir";
    if (verbType(verb) === "regular" && /re$/.test(inf)) return "d";
    return "none";
  }

  function splitForm(verb, person) {
    var famName = familyOf(verb);
    var fam = family(famName);
    var form = nfc(L.presentRow(verb, person).form);
    var end = fam.endings ? fam.endings[L.PERSONS.indexOf(person)] : undefined;
    if (end === undefined) return { stem: form, ending: "", irregular: famName === "unique" };
    end = nfc(end);
    if (end === "") return { stem: form, ending: "", irregular: false };
    if (form.length > end.length && form.slice(-end.length) === end) {
      return { stem: form.slice(0, form.length - end.length), ending: end, irregular: false };
    }
    return { stem: form, ending: "", irregular: true };
  }

  function dedupe(list, keyFn) {
    var seen = {};
    var out = [];
    list.forEach(function (x) {
      var k = keyFn ? keyFn(x) : x;
      if (seen[k]) return;
      seen[k] = true;
      out.push(x);
    });
    return out;
  }

  /** Stems shown to the learner: fold î variants, drop -ger/-cer spelling-only stems (§8.2). */
  function displayStems(verb, stems) {
    var out = dedupe(stems, function (s) { return s.replace(/î/g, "i"); });
    if (familyOf(verb) === "er") {
      var inf = nfc(verb.infinitive);
      if (/ger$/.test(inf)) {
        out = out.filter(function (s) { return !(/ge$/.test(s) && out.indexOf(s.slice(0, -1)) !== -1); });
      } else if (/cer$/.test(inf)) {
        out = out.filter(function (s) { return !(/ç$/.test(s) && out.indexOf(s.slice(0, -1) + "c") !== -1); });
      }
    }
    return out;
  }

  function patternFor(verb) {
    var famName = familyOf(verb);
    var fam = family(famName);
    var ps = personsOf(verb);
    var splits = {};
    ps.forEach(function (p) { splits[p] = splitForm(verb, p); });
    var stems = fam.endings
      ? dedupe(ps.filter(function (p) { return !splits[p].irregular; }).map(function (p) { return splits[p].stem; }))
      : [];
    var shown = displayStems(verb, stems);
    var boot = !!(fam.endings && splits["1s"] && splits["1p"] && splits["2p"] &&
      !splits["1s"].irregular && !splits["1p"].irregular && !splits["2p"].irregular &&
      splits["1p"].stem === splits["2p"].stem && splits["1p"].stem !== splits["1s"].stem);
    return {
      family: famName,
      label: fam.label,
      hint: fam.hint,
      stems: stems,
      displayStems: shown,
      stemChanges: famName !== "unique" && famName !== "none" && shown.length > 1,
      bootNote: boot
    };
  }

  /* ---------- classifier (§9) ---------- */
  var SUBJ = ["elles", "elle", "ils", "il", "je", "j'", "tu", "on", "nous", "vous"];
  var REFL = ["nous", "vous", "me", "te", "se", "m'", "t'", "s'"];

  function stripWord(str, list) {
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (w.charAt(w.length - 1) === "'") {
        if (str.indexOf(w) === 0) {
          var rest = str.slice(w.length).replace(/^\s+/, "");
          if (rest) return { word: w, rest: rest };
        }
      } else if (str.indexOf(w + " ") === 0) {
        var r = str.slice(w.length + 1).replace(/^\s+/, "");
        if (r) return { word: w, rest: r };
      }
    }
    return null;
  }

  /** Strip one subject pronoun, then (only then) one reflexive pronoun. n must be normalized. */
  function stripPronoun(n) {
    var s = stripWord(n, SUBJ);
    if (!s) return { prefix: "", core: n };
    var prefix = s.word;
    var core = s.rest;
    var r = stripWord(core, REFL);
    if (r) { prefix += " " + r.word; core = r.rest; }
    return { prefix: prefix, core: core };
  }

  function osaDistance(a, b) {
    a = String(a); b = String(b);
    var d = [];
    var i, j;
    for (i = 0; i <= a.length; i++) { d[i] = []; d[i][0] = i; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  var SUBJECT_RE = /(?:^|[\s(-])(je|j'|tu|il|elle|on|nous|vous|ils|elles)\s*(?:(?:ne|n')\s*)?(?:(?:me|te|se|nous|vous|m'|t'|s')\s*)?$/;
  var SUBJECT_PERSON = { "je": "1s", "j'": "1s", "tu": "2s", "il": "3s", "elle": "3s", "on": "3s", "nous": "1p", "vous": "2p", "ils": "3p", "elles": "3p" };

  /** The person of the blanked verb in verb.sentence (§9.1 sentence items). */
  function sentencePerson(verb) {
    var s = verb && verb.sentence;
    if (!s) return { person: null, personFromSubject: false };
    var m = L.formRegex(s.verbForm).exec(s.french);
    var want = L.normalize(s.verbForm);
    var rows = verb.present || [];
    function formIs(p) {
      for (var i = 0; i < rows.length; i++) if (rows[i].person === p) return L.normalize(rows[i].form) === want;
      return false;
    }
    if (m) {
      var raw = s.french.slice(0, m.index + m[1].length);
      var before = L.normalize(raw + "x").slice(0, -1);
      var sm = SUBJECT_RE.exec(before);
      if (sm && formIs(SUBJECT_PERSON[sm[1]])) return { person: SUBJECT_PERSON[sm[1]], personFromSubject: true };
    }
    for (var i = 0; i < rows.length; i++) {
      if (L.normalize(rows[i].form) === want) return { person: rows[i].person, personFromSubject: false };
    }
    return { person: null, personFromSubject: false };
  }

  /* Message parts: { text, fr?, strong? }. */
  function t(text) { return { text: String(text) }; }
  function b(text) { return { text: String(text), fr: true, strong: true }; }
  function frp(text) { return { text: String(text), fr: true }; }

  /** "**word**" markers in VERB_META notes become bold French parts. */
  function noteParts(note) {
    var out = [];
    String(note || "").split("**").forEach(function (chunk, i) {
      if (!chunk) return;
      out.push(i % 2 ? b(chunk) : t(chunk));
    });
    return out;
  }

  function lastToken(s) {
    var parts = String(s || "").trim().split(/\s+/);
    return parts[parts.length - 1];
  }

  function groupOf(x, groups) {
    for (var i = 0; i < groups.length; i++) if (groups[i].forms.indexOf(x) !== -1) return groups[i];
    return null;
  }

  function truncate(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function findVerb(data, id) {
    var vs = (data && data.verbs) || [];
    for (var i = 0; i < vs.length; i++) if (vs[i].id === id) return vs[i];
    return null;
  }

  function hasRow(verb, person) {
    return personsOf(verb).indexOf(person) !== -1;
  }

  function result(category, parts) {
    return { category: category, message: parts.map(function (p) { return p.text; }).join(""), parts: parts };
  }

  /**
   * Explain a wrong (or accent-tolerant) answer. item: { verb, person, family, expected, accepted, personFromSubject }.
   * ctx: { data, meta, accentTolerant }. Returns { category, message, parts }.
   */
  function classify(input, item, ctx) {
    ctx = ctx || {};
    var data = ctx.data || (root && root.VERB_DATA) || { verbs: [] };
    var meta = ctx.meta || META();
    var groups = meta.confusables || [];
    var verb = item.verb;
    var fam = item.family;
    var isChoice = /^choice-/.test(fam);
    var isSentence = fam === "sentence" || fam === "choice-sentence";
    var person = item.person;
    var fromSubject = item.personFromSubject !== false;
    if (isSentence && person == null) {
      var sp = sentencePerson(verb);
      person = sp.person;
      fromSubject = sp.personFromSubject;
    }
    var row = person != null && hasRow(verb, person) ? L.presentRow(verb, person) : null;
    if (!row) fromSubject = false;
    var pronoun = row ? L.promptPronoun(row) : "";

    var expected = item.expected;
    if (expected == null) {
      if (fam === "conjugate" && row) expected = row.french;
      else if (isSentence && verb.sentence) expected = verb.sentence.verbForm;
      else expected = item.correct || "";
    }
    var expForm;
    if (fam === "conjugate" && row) expForm = L.normalize(row.form);
    else if (isSentence && verb.sentence) expForm = L.normalize(verb.sentence.verbForm);
    else expForm = L.normalize(item.correct != null ? item.correct : expected);
    var expBare = L.stripAccents(expForm);

    var n = L.normalize(input);
    var split = stripPronoun(n);
    var core = split.core;
    var prefix = split.prefix;
    var coreBare = L.stripAccents(core);
    var shown = truncate(String(input == null ? "" : input).trim(), 40);

    function needPhrase() {
      return fromSubject && pronoun
        ? [t(" For "), b(pronoun), t(" you need "), b(expected), t(".")]
        : [t(" In this sentence you need "), b(expected), t(".")];
    }
    function generic() { return result("generic", [t("Not quite. It's "), b(expected), t(".")]); }

    /* Rule 0: tolerant match with different accents (typed items only). */
    if (!isChoice) {
      var accepted = item.accepted || (fam === "conjugate" && row ? L.acceptedForms(verb, person) : isSentence && verb.sentence ? [verb.sentence.verbForm] : []);
      var chk = L.checkAnswer(input, accepted, { accentTolerant: !!ctx.accentTolerant });
      if (chk.correct && chk.exact) return result("correct", []);
      if (chk.correct) return result("accent-note", [t("Correct! Watch the accent: "), b(expected), t(".")]);
    }

    /* Reflexive verbs: the right verb form without its reflexive pronoun ("lève" for "je me lève"). */
    if (fam === "conjugate" && row) {
      var rm = /\s(me|te|se|nous|vous|m'|t'|s')$/.exec(String(row.pronoun).trim());
      if (rm && prefix.indexOf(" ") === -1 && coreBare === expBare) {
        var reflForm = rm[1].charAt(rm[1].length - 1) === "'" ? rm[1] + row.form : rm[1] + " " + row.form;
        return result("missing-reflexive", [b(verb.infinitive), t(" is reflexive, so include the pronoun: "), b(reflForm),
          t(" (" + row.french + ").")]);
      }
    }

    /* choice-aux: rule 8 (aux) only, then generic. */
    if (fam === "choice-aux") {
      var aux = verb.past && verb.past.auxiliary;
      var pickedAux = L.normalize(input) === "je suis" ? "être" : L.normalize(input) === "j'ai" ? "avoir" : null;
      if (pickedAux && aux && pickedAux !== aux) {
        if (aux === "être") {
          var list = (data.verbs || []).filter(function (v) { return v.past && v.past.auxiliary === "être"; })
            .slice(0, 3).map(function (v) { return v.infinitive; });
          return result("etre-avoir", [b(verb.infinitive), t(" uses "), b("être"), t(" in the past: "), frp(verb.past.french),
            t(". Verbs of movement like "), frp(list.join(", ")), t(" take être.")]);
        }
        return result("etre-avoir", [t("Most verbs, including "), b(verb.infinitive), t(", use "), b("avoir"), t(": "), frp(verb.past.french), t(".")]);
      }
      return generic();
    }

    /* choice-meaning / choice-infinitive: the meaning variant of rule 9, then generic. */
    if (fam === "choice-meaning" || fam === "choice-infinitive") {
      var vs = data.verbs || [];
      for (var mi = 0; mi < vs.length; mi++) {
        var o = vs[mi];
        if (o.id === verb.id) continue;
        if (fam === "choice-meaning" && L.normalize(o.meaning) === n) {
          return result("other-verb", [{ text: String(input), strong: true }, t(" is the meaning of "), frp(o.infinitive),
            t(". "), b(verb.infinitive), t(" means " + verb.meaning + ".")]);
        }
        if (fam === "choice-infinitive" && L.normalize(o.infinitive) === n) {
          return result("other-verb", [b(o.infinitive), t(" means " + o.meaning + ". "), b(verb.infinitive), t(" means " + verb.meaning + ".")]);
        }
      }
      return generic();
    }

    var acceptedPrefixes = row ? L.acceptedForms(verb, person).map(function (a) { return stripPronoun(L.normalize(a)).prefix; }) : [""];
    var pronounOk = prefix === "" || acceptedPrefixes.indexOf(prefix) !== -1;
    var others = (verb.present || []).filter(function (r) { return r.person !== person && L.normalize(r.form) !== expForm; });

    /* Rule 1: accent only (typed items, tolerant off). */
    if (!isChoice && !ctx.accentTolerant && pronounOk && coreBare === expBare && core !== expForm) {
      var missing = [], extra = [];
      expForm.split("").forEach(function (ch) {
        if (L.stripAccents(ch) !== ch && core.indexOf(ch) === -1 && missing.indexOf(ch) === -1) missing.push(ch);
      });
      core.split("").forEach(function (ch) {
        if (L.stripAccents(ch) !== ch && expForm.indexOf(ch) === -1 && extra.indexOf(ch) === -1) extra.push(ch);
      });
      var tail = missing.length
        ? [t(" (with "), frp(missing.join(", ")), t(").")]
        : [t(" (no accent on "), frp(extra.map(function (c) { return L.stripAccents(c); }).join(", ")), t(").")];
      return result("accent", [t("So close: just the accent. It's "), b(expected)].concat(tail));
    }

    /* Rule 2: right form, wrong pronoun (conjugate only). */
    if (fam === "conjugate" && coreBare === expBare && !pronounOk) {
      return result("wrong-pronoun", [t("The verb form is right, but the prompt asks for "), b(pronoun), t(", not "), b(prefix),
        t(": "), b(expected), t(".")]);
    }

    /* Rule 3: the infinitive. */
    if (coreBare === bare(verb.infinitive)) {
      return result("infinitive", fromSubject && pronoun
        ? [t("That's the infinitive (the dictionary form). With "), b(pronoun), t(" it becomes "), b(expected), t(".")]
        : [t("That's the infinitive (the dictionary form)."), t(" In this sentence you need "), b(expected), t(".")]);
    }

    function wrongPerson(matches) {
      var pron = matches.map(function (r) { return L.promptPronoun(r); }).join(" / ");
      var parts = [t("That's the "), b(pron), t(" form.")].concat(needPhrase());
      var g1 = groupOf(coreBare, groups);
      if (g1 && g1 === groupOf(expBare, groups)) parts = parts.concat([t(" ")], noteParts(g1.note));
      if (row && lastToken(matches[0].pronunciation) === lastToken(row.pronunciation)) {
        parts.push(t(" They sound the same; only the spelling changes."));
      }
      if (familyOf(verb) === "er") parts.push(t(" " + family("er").hint));
      return result("wrong-person", parts);
    }

    /* Rule 4: exactly another person's form. */
    var exact = others.filter(function (r) { return L.normalize(r.form) === core; });
    if (exact.length) return wrongPerson(exact);

    /* Rule 5: the past participle. */
    if (verb.past && verb.past.participle) {
      var part = L.normalize(verb.past.participle);
      var anyRow = (verb.present || []).some(function (r) { return bare(r.form) === coreBare; });
      if (part !== expForm && (core === part || (coreBare === L.stripAccents(part) && !anyRow))) {
        return result("participle", [{ text: shown, strong: true }, t(" is the past participle (as in "), frp(verb.past.french),
          t("). For the present, use "), b(expected), t(".")]);
      }
    }

    /* Rule 6: another person's form, ignoring accents. */
    var loose = others.filter(function (r) { return bare(r.form) === coreBare; });
    if (loose.length) return wrongPerson(loose);

    /* Rule 7: a confusable group. */
    var g = groupOf(coreBare, groups);
    if (coreBare !== expBare && g && g === groupOf(expBare, groups)) return result("confusable", noteParts(g.note));

    /* Rule 8: être vs avoir (present items). */
    var pair = verb.id === "etre" ? "avoir" : verb.id === "avoir" ? "etre" : null;
    var partner = pair ? findVerb(data, pair) : null;
    if (partner && (partner.present || []).some(function (r) { return bare(r.form) === coreBare; })) {
      return result("etre-avoir", [t("That's from "), b(partner.infinitive), t(" (" + partner.meaning + "). "), b(verb.infinitive),
        t(" = " + verb.meaning + ": "), frp((verb.present || []).map(function (r) { return r.french; }).join(", ")), t(".")]);
    }

    /* Rule 9: a form of another verb. */
    var vlist = data.verbs || [];
    for (var vi = 0; vi < vlist.length; vi++) {
      var ov = vlist[vi];
      if (ov.id === verb.id) continue;
      if ((ov.present || []).some(function (r) { return bare(r.form) === coreBare; })) {
        return result("other-verb", [b(core), t(" is a form of "), b(ov.infinitive), t(" (" + ov.meaning + "). Here you need "), b(expected),
          t(" ("), frp(verb.infinitive), t(").")]);
      }
    }

    /* Rule 10: a typo. */
    if (osaDistance(coreBare, expBare) <= (expBare.length <= 5 ? 1 : 2)) {
      return result("typo", [t("Almost: check the spelling. It's "), b(expected), t(".")]);
    }
    return generic();
  }

  /* ---------- hint ladder (§10) ---------- */
  function mask(shown, hidden) {
    var s = shown;
    for (var i = 0; i < hidden; i++) s += " _";
    return s;
  }

  /**
   * item: { verb, person, family: "conjugate" | "sentence" }. level 1 or 2.
   * Returns { level, parts, mask, maskLabel }.
   */
  function hintFor(item, level) {
    var verb = item.verb;
    var person = item.person;
    if (item.family === "sentence" && person == null) person = sentencePerson(verb).person;
    var form = nfc(item.family === "sentence" ? verb.sentence.verbForm : L.presentRow(verb, person).form);
    var len = form.length;
    if (level <= 1) {
      var first = form.charAt(0);
      return {
        level: 1,
        parts: [t("Starts with "), b(first), t(" · " + len + " letters")],
        mask: mask(first, len - 1),
        maskLabel: "starts with " + first + ", " + len + " letters"
      };
    }
    var famName = familyOf(verb);
    var split = person != null && hasRow(verb, person) && nfc(L.presentRow(verb, person).form) === form ? splitForm(verb, person) : null;
    if (split && split.ending && famName !== "unique") {
      var row = L.presentRow(verb, person);
      var parts = [t("Stem "), b(split.stem), t(", then the ending for "), frp(L.promptPronoun(row))];
      if (famName === "er") parts.push(t(" (-er endings: -e, -es, -e, -ons, -ez, -ent)"));
      return {
        level: 2,
        parts: parts,
        mask: mask(split.stem, split.ending.length),
        maskLabel: "starts with " + split.stem + ", " + len + " letters"
      };
    }
    var half = form.slice(0, Math.ceil(len / 2));
    return {
      level: 2,
      parts: [t("Starts with "), b(half), t(" · " + len + " letters")],
      mask: mask(half, len - half.length),
      maskLabel: "starts with " + half + ", " + len + " letters"
    };
  }

  /* ---------- daily goal and streak (§13) ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function dayKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function prevDayKey(key) {
    var p = String(key).split("-");
    return dayKey(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) - 1));
  }

  /* recordDay step 3, shared with reevaluateGoal. */
  function applyGoal(state, k) {
    var d = state.daily;
    var st = state.streak;
    if (d.goalMet || d.answered < state.settings.dailyGoal) return;
    d.goalMet = true;
    if (st.lastDate && k < st.lastDate) return; // clock went backwards past the last streak day
    if (st.lastDate === prevDayKey(k)) st.current += 1;
    else if (st.lastDate !== k) st.current = 1;
    st.lastDate = k;
    st.best = Math.max(st.best, st.current);
  }

  var HISTORY_MAX = 60;

  function recordDay(state, now, correct) {
    var k = dayKey(new Date(now));
    if (state.daily.date !== k) {
      if (state.daily.date && k < state.daily.date) {
        warnOnce("verbTrainer: the device clock went backwards; the day streak is left unchanged");
      }
      var had = state.history[k] || 0;
      state.daily = { date: k, answered: had, correct: 0, goalMet: had >= state.settings.dailyGoal };
    }
    state.daily.answered += 1;
    if (correct) state.daily.correct += 1;
    state.history[k] = state.daily.answered;
    applyGoal(state, k);
    var keys = Object.keys(state.history).sort();
    while (keys.length > HISTORY_MAX) delete state.history[keys.shift()];
  }

  function reevaluateGoal(state, now) {
    var k = dayKey(new Date(now));
    if (state.daily.date !== k) return;
    applyGoal(state, k);
  }

  function todayCount(state, now) {
    return state.daily.date === dayKey(new Date(now)) ? state.daily.answered : 0;
  }

  function todayGoalMet(state, now) {
    return state.daily.date === dayKey(new Date(now)) && !!state.daily.goalMet;
  }

  function displayStreak(state, now) {
    var today = dayKey(new Date(now));
    var last = state.streak.lastDate;
    return last && (last === today || last === prevDayKey(today)) ? state.streak.current : 0;
  }

  /* ---------- review deck, weakest verbs, next step (§6.1, §11.1) ---------- */
  function verbIdSet(data) {
    var set = {};
    ((data && data.verbs) || []).forEach(function (v) { set[v.id] = true; });
    return set;
  }

  /* The expressions helper (expressions.js loads after this file in the browser): looked up on use. */
  function EXPR() {
    return (typeof window !== "undefined" && window.VT_EXPR) || (typeof require === "function" ? require("./expressions.js") : null);
  }

  /** Keys with a mistake that aren't mastered again, weakest and most recent first.
      exprData (optional, VT_EXPRESSIONS) adds the everyday expressions' "expr:<id>" keys. */
  function mistakesDeck(state, data, exprData, dlgData) {
    var known = verbIdSet(data);
    ((exprData && exprData.expressions) || []).forEach(function (e) { known["expr:" + e.id] = true; });
    // Dialogue comprehension questions ("dlg:<dialogue>.<question>"), built inline so learn.js needs no dialogues.js.
    ((dlgData && dlgData.dialogues) || []).forEach(function (d) {
      (d.questions || []).forEach(function (q) { known["dlg:" + d.id + "." + q.id] = true; });
    });
    var stats = state.stats || {};
    return Object.keys(stats).filter(function (k) {
      var s = stats[k];
      return s && s.wrong > 0 && s.box < L.MASTERED_BOX && known[k.split("|")[0]];
    }).sort(function (a, b) {
      var sa = stats[a], sb = stats[b];
      return (sa.box - sb.box) || (sb.last - sa.last) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }

  /** Up to n verbs with seen >= 3 and a key in the deck, lowest accuracy first. */
  function weakestVerbs(state, data, n) {
    var deck = mistakesDeck(state, data);
    var inDeck = {};
    deck.forEach(function (k) { inDeck[k.split("|")[0]] = true; });
    var totals = {};
    Object.keys(state.stats || {}).forEach(function (k) {
      var id = k.split("|")[0];
      var s = state.stats[k];
      var tt = totals[id] || (totals[id] = { seen: 0, correct: 0 });
      tt.seen += s.seen || 0;
      tt.correct += s.correct || 0;
    });
    var list = [];
    ((data && data.verbs) || []).forEach(function (v, i) {
      var tt = totals[v.id];
      if (!tt || tt.seen < 3 || !inDeck[v.id]) return;
      list.push({ verb: v, seen: tt.seen, correct: tt.correct, accuracy: tt.correct / tt.seen, order: i });
    });
    list.sort(function (a, b) { return (a.accuracy - b.accuracy) || (b.seen - a.seen) || (a.order - b.order); });
    return list.slice(0, n == null ? list.length : n).map(function (x) {
      return { verb: x.verb, seen: x.seen, correct: x.correct, accuracy: x.accuracy };
    });
  }

  function lessonRecord(state, id) {
    var r = state.lessons && state.lessons[String(id)];
    return r || { learned: false, practiced: false, quizBest: -1, quizPassed: false };
  }

  function quizCopy() {
    return LESSON_SESSION_LENGTH + " mixed questions. Score " + Math.ceil(QUIZ_PASS_RATIO * LESSON_SESSION_LENGTH) +
      " or more to complete the lesson.";
  }

  /** { kind, title, reason, href } for Home's Today card (first matching rule, §6.1). */
  function suggestNext(state, data, now, exprData, dlgData) {
    var lessons = (data && data.lessons) || [];
    var deck = mistakesDeck(state, data, exprData, dlgData);
    var first = lessons[0];
    if (first && state.totals.answered === 0 && !lessonRecord(state, first.id).learned) {
      return { kind: "start", lessonId: first.id, title: "Start Lesson " + first.id + ": " + first.title,
        reason: "Each lesson walks you through Learn → Practice → Quiz.", href: "#lesson/" + first.id };
    }
    function review() {
      return { kind: "review", title: "Review " + deck.length + (deck.length === 1 ? " mistake" : " mistakes"),
        reason: "Fixing these now makes them stick.", href: "#review" };
    }
    if (deck.length >= REVIEW_FIRST_AT) return review();
    for (var i = 0; i < lessons.length; i++) {
      var l = lessons[i];
      var rec = lessonRecord(state, l.id);
      if (rec.quizPassed) continue;
      var step = !rec.learned ? "Learn" : !rec.practiced ? "Practice" : "Quiz";
      return {
        kind: "lesson", lessonId: l.id, step: step,
        title: "Continue Lesson " + l.id + ": " + step,
        reason: step === "Learn" ? "Read the tables, listen to every form, notice the pattern."
          : step === "Practice" ? LESSON_SESSION_LENGTH + " quick conjugation questions." : quizCopy(),
        href: step === "Learn" ? "#browse/lesson/" + l.id : step === "Practice" ? "#conjugate/lesson/" + l.id + "/path" : "#choice/lesson/" + l.id + "/path"
      };
    }
    if (deck.length >= 1) return review();
    return { kind: "mixed", title: "Mixed quiz: all lessons", reason: "Every lesson is complete. A mixed quiz keeps it all fresh.", href: "#choice/all" };
  }

  /* ---------- lessons and routes (§4, §8.0) ---------- */
  function buildLessonsById(lessons) {
    var map = {};
    (lessons || []).forEach(function (l) {
      var k = String(l.id);
      if (Object.prototype.hasOwnProperty.call(map, k)) { warnOnce("verbTrainer: duplicate lesson id " + l.id); return; }
      map[k] = l;
    });
    return map;
  }

  /** { verbId: lessonId } from lessons in order; first lesson wins. verbs (optional) flags unknown ids. */
  function buildLessonOf(lessons, verbs) {
    var known = verbs ? verbIdSet({ verbs: verbs }) : null;
    var out = {};
    var seenLesson = {};
    (lessons || []).forEach(function (l) {
      if (seenLesson[String(l.id)]) return; // duplicate lesson id: the first one wins
      seenLesson[String(l.id)] = true;
      (l.verbIds || []).forEach(function (id) {
        if (known && !known[id]) { warnOnce("verbTrainer: lesson " + l.id + " lists unknown verb " + id); return; }
        if (Object.prototype.hasOwnProperty.call(out, id)) {
          if (out[id] !== l.id) warnOnce("verbTrainer: verb " + id + " is in more than one lesson");
          return;
        }
        out[id] = l.id;
      });
    });
    return out;
  }

  var MODES = ["flashcards", "conjugate", "sentences", "choice"];
  var PLAIN = ["home", "practice", "progress", "credits", "explain"];

  /** Where the Explain view can run: "helper" when served over http(s) by the local helper, else "file" (no network). */
  function explainMode(protocol) {
    return protocol === "http:" || protocol === "https:" ? "helper" : "file";
  }

  function info(name, scope, extra) {
    var r = { name: name, scope: scope, lessonId: null, path: false, verbId: null, redirect: null };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }

  /** Pure hash router: { name, scope, lessonId, path, verbId, redirect } (§4). Invalid → home. */
  function parseRoute(hash, lessonsById) {
    var h = String(hash || "").replace(/^#/, "");
    var seg = h === "" ? [] : h.split("/");
    var home = info("home", "all");
    var name = seg[0];
    var map = lessonsById || {};
    function lessonArg(i) {
      var id = seg[i];
      return id != null && /^\d+$/.test(id) && Object.prototype.hasOwnProperty.call(map, id) ? Number(id) : null;
    }
    if (!seg.length) return home;
    if (PLAIN.indexOf(name) !== -1) return seg.length === 1 ? info(name, "all") : home;
    if (name === "lesson") {
      var lid = lessonArg(1);
      return seg.length === 2 && lid != null ? info("lesson", "lesson", { lessonId: lid }) : home;
    }
    if (name === "browse") {
      if (seg.length === 1) return info("browse", "all");
      if (seg[1] !== "lesson" || seg.length > 4) return home;
      var bid = lessonArg(2);
      if (bid == null) return home;
      if (seg.length === 3) return info("browse", "lesson", { lessonId: bid });
      var vid = seg[3];
      if (/^[a-z0-9_-]+$/.test(vid) && map[String(bid)].verbIds.indexOf(vid) !== -1) {
        return info("browse", "lesson", { lessonId: bid, verbId: vid });
      }
      return info("browse", "lesson", { lessonId: bid, redirect: "#browse/lesson/" + bid });
    }
    if (name === "flashcards" && seg[1] === "expressions") {
      // #flashcards/expressions, #flashcards/expressions/<themeId>; app.js checks the theme exists.
      if (seg.length === 2) return info("flashcards", "expressions", { themeId: null });
      return seg.length === 3 && /^[a-z0-9-]+$/.test(seg[2]) ? info("flashcards", "expressions", { themeId: seg[2] }) : home;
    }
    if (MODES.indexOf(name) !== -1) {
      if (seg.length === 1) return info(name, "filter");
      if (name === "choice" && seg.length === 2 && seg[1] === "all") return info(name, "all");
      if (seg[1] !== "lesson" || seg.length > 4) return home;
      var mid = lessonArg(2);
      if (mid == null) return home;
      if (seg.length === 3) return info(name, "lesson", { lessonId: mid });
      if (seg[3] === "path" && (name === "conjugate" || name === "choice")) return info(name, "lesson", { lessonId: mid, path: true });
      return home;
    }
    if (name === "topics" || name === "topic") {
      // #topics, #topics/<topicId>, #topics/<topicId>/<exerciseId>; views-topics.js checks the ids exist.
      // #topic/... (the explainer's topic links) is an alias: same info, URL rewritten to #topics/... (D5).
      var alias = name === "topic" ? function (r) { r.redirect = "#topics" + (seg.length > 1 ? "/" + seg.slice(1).join("/") : ""); return r; }
        : function (r) { return r; };
      if (seg.length === 1) return alias(info("topics", "all"));
      if (seg.length > 3 || !/^[a-z0-9-]+$/.test(seg[1])) return home;
      if (seg.length === 2) return alias(info("topics", "topic", { topicId: seg[1] }));
      return /^[A-Za-z0-9-]+$/.test(seg[2]) ? alias(info("topics", "exercise", { topicId: seg[1], exerciseId: seg[2] })) : home;
    }
    if (name === "tables") {
      // #tables, #tables/<categoryId>, #tables/<categoryId>/<tableId>; views-tables.js checks the ids exist.
      var TID = /^[a-z0-9-]+$/;
      if (seg.length === 1) return info("tables", "all");
      if (seg.length > 3 || !TID.test(seg[1])) return home;
      if (seg.length === 2) return info("tables", "category", { categoryId: seg[1] });
      return TID.test(seg[2]) ? info("tables", "table", { categoryId: seg[1], tableId: seg[2] }) : home;
    }
    if (name === "expressions") {
      // #expressions, #expressions/<themeId>, #expressions/<themeId>/<exprId>; views-expressions.js checks the ids exist.
      var XID = /^[a-z0-9-]+$/;
      if (seg.length === 1) return info("expressions", "all");
      if (seg.length > 3 || !XID.test(seg[1])) return home;
      if (seg.length === 2) return info("expressions", "theme", { themeId: seg[1] });
      return XID.test(seg[2]) ? info("expressions", "item", { themeId: seg[1], exprId: seg[2] }) : home;
    }
    if (name === "dialogues") {
      // #dialogues, #dialogues/<id>, #dialogues/<id>/<mode>; views-dialogues.js checks the id exists.
      var DID = /^[a-z0-9-]{1,40}$/, MODES_D = ["listen", "roleplay", "quiz"];
      if (seg.length === 1) return info("dialogues", "all");
      if (seg.length > 3 || !DID.test(seg[1])) return home;
      if (seg.length === 2) return info("dialogues", "dialogue", { dialogueId: seg[1], mode: "listen" });
      if (seg[2] === "listen") return info("dialogues", "dialogue", { dialogueId: seg[1], mode: "listen", redirect: "#dialogues/" + seg[1] });
      return MODES_D.indexOf(seg[2]) !== -1 ? info("dialogues", "dialogue", { dialogueId: seg[1], mode: seg[2] })
        : info("dialogues", "dialogue", { dialogueId: seg[1], mode: "listen", redirect: "#dialogues/" + seg[1] });
    }
    if (name === "review") {
      if (seg.length === 1) return info("review", "deck");
      if (seg.length === 2 && seg[1] === "session") return info("review", "session");
      if (seg.length === 3 && seg[1] === "lesson") {
        var rid = lessonArg(2);
        return rid != null ? info("review", "deck", { lessonId: rid }) : home;
      }
      return home;
    }
    return home;
  }

  /* ---------- session summary lines and the choice rotation (§6.5, §12.1) ---------- */
  function rowOrNull(verb, person) {
    return hasRow(verb, person) ? L.presentRow(verb, person) : null;
  }

  function pronunciationForKey(verb, key) {
    var suffix = String(key || "").split("|")[1];
    if (suffix == null) return "";
    if (suffix === "inf") return verb.pronunciation || "";
    if (suffix === "sentence") return (verb.sentence && verb.sentence.pronunciation) || "";
    if (suffix === "past") return (verb.past && verb.past.pronunciation) || "";
    var r = rowOrNull(verb, suffix);
    return r ? r.pronunciation || "" : "";
  }

  /** { french, pronunciation, audioKey } for the summary's "To review" list. */
  function displayFor(item) {
    if (item.dialogue) return item.display;
    if (item.expr) {
      var e = item.expr;
      return { french: e.fr, pronunciation: e.pron, audioKey: null, listenText: EXPR().speakText(e) };
    }
    var verb = item.verb;
    if (item.kind === "choice" && item.listen) {
      return { french: item.listen.text, pronunciation: pronunciationForKey(verb, item.listen.key), audioKey: item.listen.key };
    }
    var mode = String(item.key || "").split("|")[1];
    if ((item.family === "conjugate" || mode === "flash-conj" || mode === "conjugate") && item.person != null) {
      var r = rowOrNull(verb, item.person);
      if (r) return { french: r.french, pronunciation: r.pronunciation, audioKey: verb.id + "|" + item.person };
    }
    if ((item.family === "sentence" || mode === "sentence") && verb.sentence) {
      return { french: verb.sentence.french, pronunciation: verb.sentence.pronunciation, audioKey: verb.id + "|sentence" };
    }
    return { french: verb.infinitive, pronunciation: verb.pronunciation, audioKey: verb.id + "|inf" };
  }

  /** The fixed type order filtered to availableTypes, shuffled with rng when shuffle is true. */
  function choiceTypeOrder(availableTypes, shuffle, rng) {
    var order = CHOICE_TYPES.filter(function (x) { return (availableTypes || []).indexOf(x) !== -1; });
    return shuffle ? L.shuffle(order, rng || Math.random) : order;
  }

  var api = {
    LESSON_SESSION_LENGTH: LESSON_SESSION_LENGTH,
    QUIZ_PASS_RATIO: QUIZ_PASS_RATIO,
    REVIEW_FIRST_AT: REVIEW_FIRST_AT,
    AUX_RE: AUX_RE,
    CHOICE_TYPES: CHOICE_TYPES,
    personsOf: personsOf,
    itemKeysFor: itemKeysFor,
    itemsFor: itemsFor,
    hasAux: auxOk,
    hasSentence: sentenceOk,
    familyOf: familyOf,
    verbType: verbType,
    verbCategory: verbCategory,
    isPronominal: isPronominal,
    typeLine: typeLine,
    splitForm: splitForm,
    patternFor: patternFor,
    displayStems: displayStems,
    stripPronoun: stripPronoun,
    noteParts: noteParts,
    classify: classify,
    osaDistance: osaDistance,
    sentencePerson: sentencePerson,
    hintFor: hintFor,
    dayKey: dayKey,
    prevDayKey: prevDayKey,
    recordDay: recordDay,
    reevaluateGoal: reevaluateGoal,
    todayCount: todayCount,
    todayGoalMet: todayGoalMet,
    displayStreak: displayStreak,
    mistakesDeck: mistakesDeck,
    weakestVerbs: weakestVerbs,
    suggestNext: suggestNext,
    parseRoute: parseRoute,
    explainMode: explainMode,
    buildLessonsById: buildLessonsById,
    buildLessonOf: buildLessonOf,
    displayFor: displayFor,
    choiceTypeOrder: choiceTypeOrder
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_LEARN = api;
})(typeof window !== "undefined" ? window : null);
