"use strict";
// Loads the learner's 125-verb guide data and builds the grounding indexes (design §8.1, §8.2).
//
// The three data files are classic browser scripts that assign window.VERB_DATA,
// window.VERB_DATA_100 and window.VERB_TYPES. They run in one fresh vm context whose only
// global is an empty `window` (no require, no process), with a 1000 ms timeout (§5.4).
// Only plain-text fields are copied into the index; no *Html field ever leaves this module.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DEFAULT_DIR = path.join(__dirname, "..", "data");
const FILES = Object.freeze({ data: "data.js", data100: "data-100.js", types: "verb-types.js" });
const AUXILIARIES = new Set(["avoir", "être"]);
const PERSONS = new Set(["1s", "2s", "3s", "1p", "2p", "3p"]);
const FUTURE_ENDINGS = ["ai", "as", "a", "ons", "ez", "ont"];

/** Accent-free comparison key: NFD, strip combining marks, lowercase, ’ -> ', collapse spaces, trim. */
function key(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019\u02bc]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase accented form (NFC), ’ -> ', collapsed spaces. */
function lower(s) {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2019\u02bc]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Data id rule: key() with ' and spaces -> '-', repeated '-' collapsed ("s'appeler" -> "s-appeler"). */
function slug(s) {
  return key(s).replace(/['\s]/g, "-").replace(/-+/g, "-");
}

/** Strip a leading reflexive "se " / "s'" ("se lever" -> "lever"). */
function verbWord(infinitive) {
  return lower(infinitive).replace(/^(se\s+|s')/, "");
}

const ENTITIES = { quot: '"', apos: "'", amp: "&", lt: "<", gt: ">", nbsp: " " };

/** HTML -> plain text: drop tags, decode the common entities, collapse whitespace. */
function stripHtml(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function fail(file, problem) {
  return new Error(`Verb data: ${file}: ${problem}`);
}

function runFiles(dir) {
  const ctx = vm.createContext({ window: {} });
  for (const name of [FILES.data, FILES.data100, FILES.types]) {
    const filename = path.join(dir, name);
    let src;
    try {
      src = fs.readFileSync(filename, "utf8");
    } catch (err) {
      throw fail(name, `cannot be read (${err.code || err.message})`);
    }
    try {
      new vm.Script(src, { filename }).runInContext(ctx, { timeout: 1000 });
    } catch (err) {
      throw fail(name, `failed to run in the data sandbox (${err && err.message ? err.message : String(err)})`);
    }
  }
  return ctx.window;
}

function validate(win) {
  const VD = win.VERB_DATA;
  const VD100 = win.VERB_DATA_100;
  const VT = win.VERB_TYPES;
  if (!VD || !Array.isArray(VD.verbs)) throw fail(FILES.data, "window.VERB_DATA.verbs is not an array");
  if (!VD100 || !Array.isArray(VD100.verbs)) throw fail(FILES.data100, "window.VERB_DATA_100.verbs is not an array");
  if (!VT || typeof VT.verbs !== "object" || VT.verbs === null) throw fail(FILES.types, "window.VERB_TYPES.verbs is missing");
  if (typeof VT.categories !== "object" || VT.categories === null) throw fail(FILES.types, "window.VERB_TYPES.categories is missing");

  const seen = new Set();
  const all = [];
  for (const [file, list] of [[FILES.data, VD.verbs], [FILES.data100, VD100.verbs]]) {
    for (const v of list) {
      const id = v && v.id;
      if (typeof id !== "string" || id === "") throw fail(file, "a verb has no id");
      if (seen.has(id)) throw fail(file, `duplicate verb id '${id}'`);
      seen.add(id);
      if (typeof v.infinitive !== "string" || v.infinitive.trim() === "") throw fail(file, `verb '${id}' has no infinitive`);
      if (!Array.isArray(v.present) || v.present.length < 1 || v.present.length > 6) {
        throw fail(file, `verb '${id}' must have 1-6 present rows`);
      }
      for (const r of v.present) {
        if (!r || typeof r.form !== "string" || typeof r.french !== "string" || !PERSONS.has(r.person)) {
          throw fail(file, `verb '${id}' has a malformed present row`);
        }
      }
      if (!v.past || !AUXILIARIES.has(v.past.auxiliary)) throw fail(file, `verb '${id}' past.auxiliary must be avoir or être`);
      const t = VT.verbs[id];
      if (!t) throw fail(FILES.types, `no VERB_TYPES entry for verb '${id}'`);
      if (!Object.prototype.hasOwnProperty.call(VT.categories, t.category) || !VT.categories[t.category].label) {
        throw fail(FILES.types, `verb '${id}' has unknown category '${t.category}'`);
      }
      all.push({ v, file });
    }
  }
  if (all.length < 1) throw fail(FILES.data, "no verbs found");
  return all;
}

function addTo(map, form, id) {
  for (const f of new Set([lower(form), key(form)])) {
    if (!f) continue;
    let set = map.get(f);
    if (!set) map.set(f, (set = new Set()));
    set.add(id);
  }
}

/** Participle plus agreement variants; no s-doubling for participles ending in s/x (assis -> assise, assises). */
function participleForms(p) {
  if (!p) return [];
  return /[sx]$/.test(p) ? [p, p + "e", p + "es"] : [p, p + "e", p + "s", p + "es"];
}

/** "il/elle est" -> [{text:"il est",variant:0},{text:"elle est",variant:1}]; other text -> [{text, variant:null}]. */
function expandThirdPerson(text) {
  const m = /^(il\/elle|ils\/elles)(\s|$)(.*)$/.exec(text);
  if (!m) return [{ text, variant: null }];
  const [a, b] = m[1].split("/");
  const rest = m[2] + m[3];
  return [
    { text: a + rest, variant: 0 },
    { text: b + rest, variant: 1 },
  ];
}

/**
 * Load the three data files from `dir` (default: explainer/data) and build the indexes.
 * Throws an Error naming the file and problem on any failure (fatal at startup).
 */
function loadVerbData(dir = DEFAULT_DIR) {
  const win = runFiles(dir);
  const all = validate(win);
  const VT = win.VERB_TYPES;

  const lessons = new Map();
  for (const src of [win.VERB_DATA, win.VERB_DATA_100]) {
    for (const l of Array.isArray(src.lessons) ? src.lessons : []) {
      if (l && l.id != null) lessons.set(Number(l.id), String(l.title ?? ""));
    }
  }

  const byId = new Map();
  const byLemma = new Map();
  const byForm = new Map();
  const infinitiveWords = new Set();
  const auxForms = new Map();
  const participles = new Map();
  const phrases = new Map();

  const addPhrase = (text, pronunciation, id) => {
    for (const e of expandThirdPerson(lower(text))) {
      const k = key(e.text.replace(/\(e\)/g, ""));
      let list = phrases.get(k);
      if (!list) phrases.set(k, (list = []));
      list.push({ id, text: e.text, pronunciation: String(pronunciation ?? ""), variant: e.variant });
    }
  };

  for (const { v } of all) {
    const id = v.id;
    const t = VT.verbs[id];
    const lesson = Number(v.lesson);
    const present = v.present.map((r) => ({
      person: String(r.person),
      pronoun: String(r.pronoun ?? ""),
      form: String(r.form),
      french: String(r.french),
      pronunciation: String(r.pronunciation ?? ""),
      english: String(r.english ?? ""),
    }));
    const participle = String(v.past.participle ?? "");
    const futureStem = v.future && typeof v.future.stem === "string" ? v.future.stem : "";
    const record = Object.freeze({
      id,
      infinitive: String(v.infinitive),
      meaning: String(v.meaning ?? ""),
      pronunciation: String(v.pronunciation ?? ""),
      lesson,
      lessonTitle: lessons.get(lesson) ?? "",
      typeDetail: String(t.type ?? ""),
      category: t.category,
      badgeLabel: String(VT.categories[t.category].label),
      pronominal: t.pronominal === true,
      auxiliary: v.past.auxiliary,
      participle,
      pastFrench: String(v.past.french ?? ""),
      futureStem,
      present: Object.freeze(present.map((r) => Object.freeze(r))),
    });
    byId.set(id, record);
    byLemma.set(slug(v.infinitive), id);

    const word = verbWord(v.infinitive);
    addTo(byForm, word, id);
    addTo(byForm, v.infinitive, id);
    infinitiveWords.add(word);
    infinitiveWords.add(key(word));
    for (const r of present) addTo(byForm, r.form, id);
    for (const p of participleForms(lower(participle))) {
      addTo(byForm, p, id);
      addTo(participles, p, id);
    }
    if (futureStem) {
      const impersonal = present.length === 1 && present[0].person === "3s";
      for (const end of impersonal ? ["a"] : FUTURE_ENDINGS) addTo(byForm, lower(futureStem) + end, id);
    }

    for (const r of present) addPhrase(r.french, r.pronunciation, id);
    if (record.pastFrench) addPhrase(record.pastFrench, v.past.pronunciation, id);
  }

  for (const [id, aux] of [["etre", "être"], ["avoir", "avoir"]]) {
    const rec = byId.get(id);
    if (!rec) continue;
    for (const r of rec.present) {
      auxForms.set(lower(r.form), aux);
      auxForms.set(key(r.form), aux);
    }
  }

  const keyItems = Array.isArray(win.VERB_DATA.pronunciationKey) ? win.VERB_DATA.pronunciationKey : [];
  const pronunciationKeyText = keyItems
    .map((item) => {
      const spelling = stripHtml(item && (item.spellingHtml ?? item.spelling));
      const sounds = stripHtml(item && (item.soundsLikeHtml ?? item.soundsLike));
      return spelling && sounds ? `${spelling} = ${sounds}` : spelling || sounds;
    })
    .filter(Boolean)
    .join("; ");

  const categories = {};
  for (const [c, def] of Object.entries(VT.categories)) categories[c] = String(def.label);

  return {
    verbCount: byId.size,
    byId,
    byLemma,
    byForm,
    infinitiveWords,
    auxForms,
    participles,
    phrases,
    lessons,
    categories,
    pronominalLabel: String(VT.pronominalLabel || "Reflexive"),
    pronunciationKeyText,
  };
}

module.exports = { loadVerbData, key, slug, lower, verbWord, stripHtml, DEFAULT_DIR, FILES };
