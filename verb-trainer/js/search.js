/* Global search index: window.VT_SEARCH (and module.exports for the tests).
   Built once at startup from VERB_DATA (after merge-data.js) and TOPICS_DATA; nothing here is generated
   or stored. It indexes every verb's infinitive (pronominal ones as written, "se lever", "s'appeler"),
   English meaning, each present-tense form with and without its pronouns, the past phrase and participle,
   the future form, the example sentence (ranked last), the lesson number and title, the verb type
   (only reachable with a type keyword such as "irregular"; results carry `type` only then, because the
   flashcards deliberately hide the type), the topic lessons (titles, can-do lines, exercise titles), the
   grammar tables, the everyday expressions (French, keywords, English, literal meaning, example) and the
   dialogues (titles, keywords, vocabulary, lines).
   Matching is case-, accent- and apostrophe-insensitive and elision-aware (j'ai = je ai = jai), with
   prefix-as-you-type and a one-edit typo tolerance for queries of 4+ characters. No DOM. */
(function (root) {
  "use strict";

  var SCORES = {
    infinitive: 100, form: 90, type: 85, meaning: 80, lesson: 75,
    prefixInfinitive: 60, prefixForm: 55, prefixMeaning: 50, lessonWord: 45,
    fuzzy: 30, sentence: 20
  };
  var KIND_PRIO = { infinitive: 0, form: 1, meaning: 2, lesson: 3, type: 4, sentence: 5 };
  var EXAMPLES = ["suis", "to eat", "se lever"];
  var PERSON_LABEL = {
    "1s": "1st person singular", "2s": "2nd person singular", "3s": "3rd person singular",
    "1p": "1st person plural", "2p": "2nd person plural", "3p": "3rd person plural"
  };
  var CATEGORY_LABEL = { regular: "Regular", "regular-spelling-change": "Regular (spelling change)", irregular: "Irregular" };
  /* Type keywords → predicate on a verb. "regular" includes the spelling-change verbs. */
  var TYPE_KEYWORDS = {
    irregular: function (v) { return v.typeCategory === "irregular"; },
    regular: function (v) { return v.typeCategory === "regular" || v.typeCategory === "regular-spelling-change"; },
    "spelling change": function (v) { return v.typeCategory === "regular-spelling-change"; },
    reflexive: function (v) { return !!v.pronominal; },
    pronominal: function (v) { return !!v.pronominal; }
  };
  /* Words that reveal a verb's type; lesson titles containing them are not shown in a result. */
  var TYPE_WORDS = /\b(ir)?regular\b|reflexive|pronominal|spelling change/i;
  var MEANING_STOP = { to: 1, a: 1, an: 1, the: 1, of: 1, or: 1, and: 1, "for": 1, at: 1, on: 1, up: 1, in: 1, with: 1 };
  var SUBJECTS = { je: "1s", j: "1s", tu: "2s", il: "3s", elle: "3s", on: "3s", nous: "1p", vous: "2p", ils: "3p", elles: "3p" };

  /* ---------- normalization ---------- */
  function base(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFC");
    s = s.toLowerCase().replace(/[\u2019\u2018\u02bc\u00b4`]/g, "'").replace(/\u0153/g, "oe").replace(/\u00e6/g, "ae");
    if (s.normalize) s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return s.replace(/\((e|s|es)\)/g, "");
  }
  function finish(s) { return s.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(); }
  /* "J’ai" → "je ai", "s'appeler" → "se appeler", "est-ce que" → "est ce que", "être" → "etre". */
  function normalizeKey(s) {
    return finish(base(s).replace(/\bqu'\s*/g, "que ").replace(/\b([jmtsldnc])'\s*/g, "$1e "));
  }
  /* Same, apostrophes deleted instead of expanded: "j'ai" → "jai", "s'appeler" → "sappeler". */
  function glueKey(s) { return finish(base(s).replace(/'\s*/g, "")); }
  function tokens(key) { return key ? key.split(" ") : []; }

  /* Bounded optimal-string-alignment (Damerau) distance; returns max + 1 once it can't be <= max. */
  function distance(a, b, max) {
    if (max == null) max = Infinity;
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    if (!la) return lb;
    if (!lb) return la;
    var prev2 = null, prev = new Array(lb + 1), cur;
    for (var j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      cur = new Array(lb + 1);
      cur[0] = i;
      var rowMin = cur[0];
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          d = Math.min(d, prev2[j - 2] + 1);
        }
        cur[j] = d;
        if (d < rowMin) rowMin = d;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev;
      prev = cur;
    }
    return prev[lb];
  }

  /* ---------- index ---------- */
  function joinParts(a, b) {
    if (!a) return b;
    if (!b) return a;
    return /'$/.test(a) ? a + b : a + " " + b;
  }

  function typeLabel(v) {
    var t = CATEGORY_LABEL[v.typeCategory] || "Irregular";
    return v.pronominal ? t + " · Reflexive" : t;
  }

  function subjectPerson(phrase, fallback) {
    var first = normalizeKey(phrase).split(" ")[0];
    return SUBJECTS[first] || fallback;
  }

  /* The phrase minus its subject and reflexive pronoun: "je me lèverai" → "lèverai". */
  function bareForm(phrase) {
    return String(phrase).trim().replace(/\u2019/g, "'")
      .replace(/^(ils\/elles|il\/elle|je|tu|il|elle|on|nous|vous|ils|elles)\s+/i, "").replace(/^j'/i, "")
      .replace(/^(me|te|se|nous|vous)\s+/i, "").replace(/^[mts]'/i, "")
      .trim();
  }

  function buildIndex(data, topicsData, referenceData, expressionsData, dialoguesData) {
    var verbs = (data && data.verbs) || [];
    var lessons = (data && data.lessons) || [];
    var entries = [];
    var lessonOf = {};
    var lessonInfo = [];
    lessons.forEach(function (l) {
      (l.verbIds || []).forEach(function (id) { if (lessonOf[id] == null) lessonOf[id] = l.id; });
    });

    function add(v, kind, text, label, detail, listenText, listenKey, extra) {
      var k = normalizeKey(text), g = glueKey(text);
      if (!k) return;
      var e = { verbId: v.id, kind: kind, k: k, g: g, label: label, detail: detail, listenText: listenText, listenKey: listenKey };
      if (extra) Object.keys(extra).forEach(function (x) { e[x] = extra[x]; });
      entries.push(e);
    }

    var verbMeta = {};
    verbs.forEach(function (v) {
      var lessonId = lessonOf[v.id] != null ? lessonOf[v.id] : v.lesson;
      verbMeta[v.id] = { v: v, lessonId: lessonId };
      var inf = v.infinitive, infKey = v.id + "|inf";
      add(v, "infinitive", inf, inf, "infinitive", inf, infKey, { lang: "fr" });

      // English meaning: each segment ("to eat"), also without a leading "to " ("eat"); words for the 50-tier.
      var meaning = String(v.meaning || "");
      var segs = meaning.replace(/\([^)]*\)/g, " ").split(/\/|,|;|\bor\b/).map(function (s) { return s.trim(); }).filter(Boolean);
      var words = tokens(normalizeKey(meaning)).filter(function (w) { return !MEANING_STOP[w]; });
      var seenSeg = {};
      segs.concat([meaning]).forEach(function (seg) {
        var variants = [seg];
        if (/^to\s+/i.test(seg)) variants.push(seg.replace(/^to\s+/i, ""));
        variants.forEach(function (t) {
          var key = normalizeKey(t);
          if (!key || seenSeg[key]) return;
          seenSeg[key] = true;
          add(v, "meaning", t, seg, "English meaning", inf, infKey, { lang: "en", words: words });
        });
      });

      // Present tense: subject(s) + reflexive pronoun + form, reflexive + form, bare form, the row as written.
      (v.present || []).forEach(function (row) {
        var pron = String(row.pronoun || "").trim();
        var sp = pron.indexOf(" ");
        var subject = sp === -1 ? pron : pron.slice(0, sp);
        var refl = sp === -1 ? "" : pron.slice(sp + 1).trim();
        var forms = String(row.form || "").split(/\s*\/\s*|\s+or\s+/).filter(Boolean);
        var detail = "present, " + (PERSON_LABEL[row.person] || row.person);
        var seen = {};
        function variant(t) {
          var key = normalizeKey(t) + "|" + glueKey(t);
          if (seen[key]) return;
          seen[key] = true;
          add(v, "form", t, row.french, detail, row.french, v.id + "|" + row.person, { lang: "fr" });
        }
        variant(row.french);
        forms.forEach(function (form) {
          subject.split("/").forEach(function (s) { variant(joinParts(joinParts(s, refl), form)); });
          if (refl) variant(joinParts(refl, form));
          variant(form);
        });
      });

      // Past: the phrase with and without the (e) agreement, and the participle.
      if (v.past && v.past.french) {
        var pf = v.past.french, pk = v.id + "|past";
        add(v, "form", pf, pf, "past (passé composé)", pf, pk, { lang: "fr" });
        if (/\(e\)/.test(pf)) add(v, "form", pf.replace(/\(e\)/g, "e"), pf, "past (passé composé)", pf, pk, { lang: "fr" });
        if (v.past.participle) add(v, "form", v.past.participle, v.past.participle, "past participle", pf, pk, { lang: "fr" });
      }
      // Future: only the form in the data (other persons aren't derived).
      if (v.future && v.future.french) {
        var ff = v.future.french, fk = v.id + "|future";
        var fdetail = "future, " + PERSON_LABEL[subjectPerson(ff, "1s")];
        add(v, "form", ff, ff, fdetail, ff, fk, { lang: "fr" });
        var bare = bareForm(ff);
        if (bare && normalizeKey(bare) !== normalizeKey(ff)) add(v, "form", bare, ff, fdetail, ff, fk, { lang: "fr" });
      }
      // Example sentence: token match only, lowest rank.
      if (v.sentence && v.sentence.french) {
        var st = tokens(normalizeKey(v.sentence.french + " " + (v.sentence.english || "")));
        entries.push({ verbId: v.id, kind: "sentence", k: "", g: "", tokens: st, label: v.sentence.french, detail: "example sentence",
          listenText: v.sentence.french, listenKey: v.id + "|sentence", lang: "fr" });
      }
    });

    lessons.forEach(function (l) {
      var title = String(l.title || "");
      var titleKey = normalizeKey(title);
      lessonInfo.push({
        id: l.id, title: title, titleKey: titleKey, titleTokens: tokens(titleKey),
        keys: ["lesson " + l.id, "lesson" + l.id, "lecon " + l.id, "lecon" + l.id],
        verbIds: (l.verbIds || []).filter(function (id) { return verbMeta[id]; }),
        revealsType: TYPE_WORDS.test(title)
      });
    });

    var topicDocs = [];
    var topics = (topicsData && topicsData.topics) || [];
    topics.forEach(function (topic, ti) {
      (topic.lessons || []).forEach(function (tl, li) {
        var fields = [
          { text: tl.title, weight: 70, kind: "title" },
          { text: topic.title, weight: 65, kind: "topic" }
        ];
        (tl.canDo || []).forEach(function (c) { fields.push({ text: c, weight: 45, kind: "line" }); });
        (topic.exercises || []).forEach(function (ex) {
          if (ex.lesson !== tl.id) return;
          if (ex.title) fields.push({ text: ex.title, weight: 40, kind: "line" });
          if (ex.instructions) fields.push({ text: ex.instructions, weight: 40, kind: "line" });
        });
        fields.forEach(function (f) { f.key = normalizeKey(f.text); f.tokens = tokens(f.key); });
        var all = [];
        fields.forEach(function (f) { all = all.concat(f.tokens); });
        topicDocs.push({
          topicId: topic.id, lessonId: tl.id, title: tl.title, topicTitle: topic.title,
          href: "#topics/" + topic.id + "/" + tl.id, order: ti * 100 + li, fields: fields, tokens: all
        });
      });
    });

    return { entries: entries, verbs: verbMeta, verbList: verbs, lessons: lessonInfo, topicDocs: topicDocs,
      tableDocs: buildTableDocs(referenceData === undefined ? root && root.VT_REFERENCE : referenceData),
      exprDocs: buildExpressionDocs(expressionsData === undefined ? root && root.VT_EXPRESSIONS : expressionsData),
      dlgDocs: buildDialogueDocs(dialoguesData === undefined ? root && root.VT_DIALOGUES : dialoguesData),
      verbCount: verbs.length };
  }

  /* Dialogues (dialogues-data.js): one doc per dialogue. French title 90, English title 85, keywords (plus the
     words "dialogue", "conversation", "role-play") 85, vocabulary 70, each line's French 60 and English 45,
     summary and scene 40. Same scoring rule as the expressions. Story episodes (records with a series) also
     match the series titles and the story keywords at 85, and carry series, episode, total and seriesTitleFr. */
  var DLG_GLOBAL_KEYWORDS = ["dialogue", "dialogues", "conversation", "conversations", "role-play", "role play"];
  // each episode also gets its own series' titles (so one story's title never matches the other's episodes)
  var DLG_STORY_KEYWORDS = ["story", "stories", "histoire", "episode", "épisode"];
  var DLG_EXPRESSION_KEYWORDS = ["expression", "expressions", "expression à retenir", "phrase to reuse"];
  var DLG_PROVERB_KEYWORDS = ["proverbe", "proverbes", "proverb", "proverbs", "sagesse", "sagesse du jour", "saying"];
  function buildDialogueDocs(dd) {
    var docs = [];
    var seriesById = {}, totals = {};
    ((dd && dd.series) || []).forEach(function (s) { seriesById[s.id] = s; });
    ((dd && dd.dialogues) || []).forEach(function (d) { if (d.series) totals[d.series] = (totals[d.series] || 0) + 1; });
    ((dd && dd.dialogues) || []).slice().sort(function (a, b) { return a.number - b.number; }).forEach(function (d, i) {
      var fields = [];
      function field(text, weight, kind, fr) {
        var k = normalizeKey(text);
        if (!k) return;
        fields.push({ k: k, g: glueKey(text), tokens: tokens(k), weight: weight, kind: kind, fr: fr || null });
      }
      field(d.titleFr, 90, "french");
      field(d.title, 85, "title");
      (d.keywords || []).concat(DLG_GLOBAL_KEYWORDS).forEach(function (w) { field(w, 85, "keyword"); });
      (d.vocab || []).forEach(function (v) { field(v.fr, 70, "vocab", v.fr); });
      (d.lines || []).forEach(function (l) { field(l.fr, 60, "line", l.fr); field(l.en, 45, "line", l.fr); });
      field(d.summary + " " + d.scene, 40, "scene");
      var ser = d.series ? seriesById[d.series] || null : null;
      if (ser) [ser.titleFr, ser.title].concat(DLG_STORY_KEYWORDS).forEach(function (w) { field(w, 85, "keyword"); });
      // the episode's Sagesse du jour: its French 80, English equivalent 75, literal and meaning 50
      var pv = d.series && d.proverb ? d.proverb : null;
      if (pv) {
        DLG_PROVERB_KEYWORDS.forEach(function (w) { field(w, 85, "keyword"); });
        field(pv.fr, 80, "proverb", pv.fr);
        if (pv.englishEquivalent) field(pv.englishEquivalent, 75, "proverb", pv.fr);
        field(pv.literal, 50, "proverb", pv.fr);
        field(pv.meaning, 50, "proverb", pv.fr);
      }
      // the episode's Expression à retenir: its French 80, meaning 50, example 50 (French) and 45 (English)
      var ex = d.series && d.expression ? d.expression : null;
      if (ex) {
        DLG_EXPRESSION_KEYWORDS.forEach(function (w) { field(w, 85, "keyword"); });
        field(ex.fr, 80, "expression", ex.fr);
        field(ex.meaning, 50, "expression", ex.fr);
        field(ex.example, 50, "expression", ex.fr);
        field(ex.exampleEn, 45, "expression", ex.fr);
      }
      var doc = { id: d.id, title: d.title, titleFr: d.titleFr, level: d.level,
        speakers: (d.speakers || []).map(function (sp) { return sp.name; }), href: "#dialogues/" + d.id, order: i, fields: fields };
      if (d.series) {
        doc.series = d.series; doc.episode = d.episode; doc.total = totals[d.series];
        doc.seriesTitleFr = ser ? ser.titleFr : d.series;
      }
      docs.push(doc);
    });
    return docs;
  }
  function searchDialogues(index, qk, qg, qt) {
    var out = [];
    (index.dlgDocs || []).forEach(function (doc) {
      var best = null;
      doc.fields.forEach(function (f) {
        var s = 0;
        if (f.k === qk || f.g === qg) s = f.weight + (f.kind === "keyword" ? 5 : 0);
        else if (qk.length >= 2 && everyTokenPrefixed(qt, f.tokens)) {
          s = f.kind === "french" || f.kind === "title" || f.kind === "keyword" ? Math.min(f.weight, 50) : f.weight - 10;
        }
        if (s && (!best || s > best.score)) best = { score: s, field: f };
      });
      if (!best) return;
      var kind = best.field.kind;
      var hit = { id: doc.id, title: doc.title, titleFr: doc.titleFr, level: doc.level, speakers: doc.speakers, href: doc.href,
        score: best.score, matchDetail: kind === "proverb" || kind === "expression" ? kind + ": « " + best.field.fr + " »" : best.field.fr ? "line: " + best.field.fr : kind === "keyword" ? "keyword" : null, order: doc.order };
      if (doc.series) { hit.series = doc.series; hit.episode = doc.episode; hit.total = doc.total; hit.seriesTitleFr = doc.seriesTitleFr; }
      out.push(hit);
    });
    out.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return out;
  }

  /* Everyday expressions (expressions-data.js): one doc per expression. French (and the filled-in Listen
     text) 90, keywords 85, the whole English 80, each "/" part of the English 78 (so "excuse me" opens
     Excusez-moi before Pardon's "Sorry? / Excuse me"), the literal meaning 60, the example 25. */
  function buildExpressionDocs(ex) {
    var docs = [];
    if (!ex || !ex.expressions) return docs;
    var EXPR = (root && root.VT_EXPR) || (typeof require === "function" ? require("./expressions.js") : null);
    if (!EXPR) return docs;
    var themeTitle = {};
    ((ex && ex.themes) || []).forEach(function (t) { themeTitle[t.id] = t.title; });
    ((ex && ex.expressions) || []).forEach(function (e, i) {
      var fields = [];
      function field(text, weight, kind) {
        var k = normalizeKey(text);
        if (!k) return;
        fields.push({ k: k, g: glueKey(text), tokens: tokens(k), weight: weight, kind: kind });
      }
      field(e.fr, 90, "french");
      if (e.say) field(e.say, 90, "french");
      (e.keywords || []).forEach(function (w) { field(w, 85, "keyword"); });
      field(e.en, 80, "english");
      var parts = String(e.en || "").split("/");
      if (parts.length > 1) parts.forEach(function (p) { field(p.trim().replace(/\s*[?!]+$/, ""), 78, "english"); });
      if (e.literal) field(e.literal, 60, "literal");
      if (e.example) field(e.example.fr + " " + e.example.en, 25, "example");
      docs.push({
        id: e.id, themeId: e.theme, fr: e.fr, en: e.en, register: e.register, themeTitle: themeTitle[e.theme] || "",
        href: "#expressions/" + e.theme + "/" + e.id, listenText: EXPR.speakText(e), order: i, fields: fields
      });
    });
    return docs;
  }

  /* Best field per expression: an exact match at its weight (keywords +5), otherwise every query word starts a
     word of the field (2+ characters): French, keywords and English at most 50, literal and example weight − 10. */
  function searchExpressions(index, qk, qg, qt) {
    var out = [];
    (index.exprDocs || []).forEach(function (doc) {
      var best = null;
      doc.fields.forEach(function (f) {
        var s = 0;
        if (f.kind !== "example" && (f.k === qk || f.g === qg)) s = f.weight + (f.kind === "keyword" ? 5 : 0);
        else if (qk.length >= 2 && everyTokenPrefixed(qt, f.tokens)) {
          s = f.kind === "french" || f.kind === "keyword" || f.kind === "english" ? Math.min(f.weight, 50) : f.weight - 10;
        }
        if (s && (!best || s > best.score)) best = { score: s, field: f };
      });
      if (!best) return;
      var kind = best.field.kind;
      out.push({ id: doc.id, themeId: doc.themeId, fr: doc.fr, en: doc.en, register: doc.register, themeTitle: doc.themeTitle,
        href: doc.href, listenText: doc.listenText, score: best.score,
        matchDetail: kind === "literal" ? "literal meaning" : kind === "example" ? "in the example" : kind === "keyword" ? "keyword" : null,
        order: doc.order });
    });
    out.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return out;
  }

  /* Grammar tables (reference-data.js): one doc per table. Keywords score highest, then the table title,
     the category title, each French row (also split at commas and with " ... " removed: "ne ... pas" → "ne pas")
     and the caption. Keys are compared both expanded and glued (l' / qu'est-ce que / quatre-vingts). */
  function buildTableDocs(ref) {
    var docs = [];
    var cats = (ref && ref.categories) || [];
    cats.forEach(function (cat, ci) {
      (cat.tables || []).forEach(function (t, ti) {
        var fields = [];
        function field(text, weight, kind, detail) {
          var k = normalizeKey(text);
          if (!k) return;
          fields.push({ k: k, g: glueKey(text), tokens: tokens(k), weight: weight, kind: kind, detail: detail || null });
        }
        field(t.title, 75, "title");
        field(cat.title, 70, "category");
        (t.keywords || []).forEach(function (w) { field(w, 85, "keyword"); });
        function rowText(fr) {
          var s = String(fr || "");
          var alts = [s, s.replace(/\s*\.\.\.\s*/g, " ")];
          if (s.indexOf(",") !== -1) alts = alts.concat(s.split(",").map(function (x) { return x.trim(); }));
          alts.forEach(function (a) { field(a, 65, "row", s); });
        }
        (t.rows || []).forEach(function (row) {
          if (row.cells) row.cells.forEach(function (c) { rowText(c.fr); });
          else rowText(row.fr);
        });
        field(t.caption, 45, "line");
        docs.push({
          categoryId: cat.id, tableId: t.id, title: t.title, categoryTitle: cat.title,
          href: "#tables/" + cat.id + "/" + t.id, order: ci * 100 + ti, fields: fields
        });
      });
    });
    return docs;
  }

  /* Best field per table: exact keyword / row / title match at its weight (keywords +5), otherwise every
     query word starts a word of the field (2+ characters): rows and keywords at most 50, titles weight − 10. */
  function searchTables(index, qk, qg, qt) {
    var out = [];
    (index.tableDocs || []).forEach(function (doc) {
      var best = null;
      doc.fields.forEach(function (f) {
        var s = 0;
        if (f.kind !== "line" && (f.k === qk || f.g === qg)) s = f.weight + (f.kind === "keyword" ? 5 : 0);
        else if (qk.length >= 2 && everyTokenPrefixed(qt, f.tokens)) s = f.kind === "keyword" || f.kind === "row" ? Math.min(f.weight, 50) : f.weight - 10;
        if (s && (!best || s > best.score)) best = { score: s, field: f };
      });
      if (!best) return;
      var f = best.field;
      var detail = f.kind === "title" ? "table title" : f.kind === "category" ? doc.categoryTitle
        : f.kind === "row" ? "matches “" + f.detail + "”" : null;
      out.push({ categoryId: doc.categoryId, tableId: doc.tableId, title: doc.title, categoryTitle: doc.categoryTitle,
        href: doc.href, score: best.score, matchDetail: detail, order: doc.order });
    });
    out.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return out;
  }

  /* ---------- matching ---------- */
  /* Only a full keyword (optionally + "verb"/"verbs") is a type query. Prefixes such as "refl" or "pron"
     are ordinary words in progress ("réfléchir", "pronoun") and must not reveal any verb's type. */
  function typeKeyword(key) {
    var k = key.replace(/\s+verbs?$/, "");
    return Object.prototype.hasOwnProperty.call(TYPE_KEYWORDS, k) ? k : null;
  }

  function everyTokenPrefixed(qt, list) {
    for (var i = 0; i < qt.length; i++) {
      var ok = false;
      for (var j = 0; j < list.length; j++) if (list[j].indexOf(qt[i]) === 0) { ok = true; break; }
      if (!ok) return false;
    }
    return true;
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
  }

  function searchTopics(index, qk, qt) {
    var out = [];
    index.topicDocs.forEach(function (doc) {
      if (!everyTokenPrefixed(qt, doc.tokens)) return;
      var best = null;
      doc.fields.forEach(function (f) {
        if (!everyTokenPrefixed(qt, f.tokens)) return;
        var s = f.weight + ((" " + f.key + " ").indexOf(" " + qk) !== -1 ? 10 : 0);
        if (!best || s > best.score) best = { score: s, field: f };
      });
      var score = best ? best.score : 35;
      var detail = !best ? doc.topicTitle : best.field.kind === "title" ? "lesson title" : best.field.kind === "topic" ? doc.topicTitle : truncate(best.field.text, 90);
      out.push({ topicId: doc.topicId, lessonId: doc.lessonId, title: doc.title, topicTitle: doc.topicTitle, href: doc.href,
        score: score, matchDetail: detail, order: doc.order });
    });
    out.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    return out;
  }

  function resultFor(index, verbId, m, typeQuery) {
    var meta = index.verbs[verbId], v = meta.v;
    var r = {
      verbId: v.id, infinitive: v.infinitive, meaning: v.meaning, lessonId: meta.lessonId, number: v.number,
      score: m.score, matchKind: m.matchKind, matchLabel: m.label, matchLang: m.lang || null, matchDetail: m.detail,
      listenText: m.listenText || v.infinitive, listenKey: m.listenKey || v.id + "|inf",
      href: "#browse/lesson/" + meta.lessonId + "/" + v.id, lessonHref: "#lesson/" + meta.lessonId
    };
    if (typeQuery) r.type = typeLabel(v);
    return r;
  }

  /* opts: { sentences: true, fuzzy: true }. Returns { query, key, typeQuery, verbs[], topics[], total, suggestion }. */
  function search(index, query, opts) {
    opts = opts || {};
    var useSentences = opts.sentences !== false, useFuzzy = opts.fuzzy !== false;
    var qk = normalizeKey(query), qg = glueKey(query);
    var res = { query: String(query == null ? "" : query), key: qk, typeQuery: null, verbs: [], topics: [], tables: [], expressions: [], dialogues: [], total: 0, suggestion: null };
    if (!qk) return res;
    var qt = tokens(qk);
    var best = {};
    function offer(verbId, m) {
      var cur = best[verbId];
      if (!cur || m.score > cur.score || (m.score === cur.score && m.prio < cur.prio)) best[verbId] = m;
    }
    function fromEntry(e, score, matchKind) {
      return { score: score, prio: KIND_PRIO[e.kind], matchKind: matchKind, label: e.label, lang: e.lang, detail: e.detail,
        listenText: e.listenText, listenKey: e.listenKey };
    }

    var tq = typeKeyword(qk);
    if (tq) {
      res.typeQuery = tq;
      index.verbList.forEach(function (v) {
        if (!TYPE_KEYWORDS[tq](v)) return;
        offer(v.id, { score: SCORES.type, prio: KIND_PRIO.type, matchKind: "type", label: "", lang: null, detail: typeLabel(v) });
      });
    } else {
      var fuzzyOk = useFuzzy && qk.length >= 4;
      var fuzzyCand = [];
      index.entries.forEach(function (e) {
        if (e.kind === "sentence") {
          if (useSentences && qk.length >= 2 && everyTokenPrefixed(qt, e.tokens)) offer(e.verbId, fromEntry(e, SCORES.sentence, "sentence"));
          return;
        }
        if (e.k === qk || e.g === qg) {
          offer(e.verbId, fromEntry(e, SCORES[e.kind], e.kind));
          return;
        }
        if (e.k.indexOf(qk) === 0 || e.g.indexOf(qg) === 0) {
          var ps = e.kind === "infinitive" ? SCORES.prefixInfinitive : e.kind === "form" ? SCORES.prefixForm : SCORES.prefixMeaning;
          offer(e.verbId, fromEntry(e, ps, "prefix"));
          return;
        }
        if (e.kind === "meaning" && e.words && e.words.indexOf(qk) !== -1) {
          offer(e.verbId, fromEntry(e, SCORES.prefixMeaning, "meaning"));
          return;
        }
        if (fuzzyOk) fuzzyCand.push(e);
      });
      fuzzyCand.forEach(function (e) {
        var cur = best[e.verbId];
        if (cur && cur.score >= SCORES.fuzzy) return;
        if (distance(qk, e.k, 1) <= 1 || distance(qg, e.g, 1) <= 1) offer(e.verbId, fromEntry(e, SCORES.fuzzy, "fuzzy"));
      });
      // Lessons: "lesson 3" / "leçon 3", or the lesson title.
      index.lessons.forEach(function (l) {
        var score = 0;
        if (l.keys.indexOf(qk) !== -1 || l.titleKey === qk) score = SCORES.lesson;
        else if (qk.length >= 3 && everyTokenPrefixed(qt, l.titleTokens)) score = SCORES.lessonWord;
        if (!score) return;
        var detail = l.revealsType ? "in Lesson " + l.id : "in Lesson " + l.id + ": " + l.title;
        l.verbIds.forEach(function (id) {
          offer(id, { score: score, prio: KIND_PRIO.lesson, matchKind: "lesson", label: "", lang: null, detail: detail });
        });
      });
    }

    res.verbs = Object.keys(best).map(function (id) {
      var m = best[id];
      var r = resultFor(index, id, m, tq);
      r._prio = m.prio;
      return r;
    });
    res.verbs.sort(function (a, b) { return b.score - a.score || a._prio - b._prio || a.number - b.number; });
    res.verbs.forEach(function (r) { delete r._prio; });
    res.topics = qk.length >= 2 ? searchTopics(index, qk, qt) : [];
    res.tables = searchTables(index, qk, qg, qt);
    res.expressions = searchExpressions(index, qk, qg, qt);
    res.dialogues = searchDialogues(index, qk, qg, qt);
    res.total = res.verbs.length + res.topics.length + res.tables.length + res.expressions.length + res.dialogues.length;
    if (!res.total) res.suggestion = suggest(index, query);
    return res;
  }

  /* Browse filter: exact, prefix, type and lesson matches (no typos, no sentences). */
  function matchVerbIds(index, query) {
    var out = {};
    search(index, query, { sentences: false, fuzzy: false }).verbs.forEach(function (r) { out[r.verbId] = true; });
    return out;
  }

  /* Closest verb by edit distance over infinitives and forms, for "Did you mean …?". */
  function suggest(index, query) {
    var qk = normalizeKey(query);
    if (!qk) return null;
    var bestD = Infinity, bestId = null;
    index.entries.forEach(function (e) {
      if (e.kind !== "infinitive" && e.kind !== "form") return;
      var d = distance(qk, e.k, bestD);
      if (d < bestD || (d === bestD && bestId && index.verbs[e.verbId].v.number < index.verbs[bestId].v.number)) {
        bestD = d;
        bestId = e.verbId;
      }
    });
    return bestId ? { verbId: bestId, infinitive: index.verbs[bestId].v.infinitive } : null;
  }

  var api = {
    normalizeKey: normalizeKey, glueKey: glueKey, distance: distance,
    buildIndex: buildIndex, search: search, matchVerbIds: matchVerbIds, suggest: suggest,
    EXAMPLES: EXAMPLES, PERSON_LABEL: PERSON_LABEL, SCORES: SCORES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.VT_SEARCH = api;
})(typeof window !== "undefined" ? window : null);
