"use strict";
// Model-facing per-sentence schema (design §7.1), lenient normaliser and strict validator (§7.3).
// The same SENTENCE_SCHEMA object is sent to Ollama as `format` and drives the validator, so there
// is one source of truth. Only this JSON Schema subset is used: type, properties, items, required,
// enum, maxLength, minItems, maxItems, additionalProperties:false (no anyOf, no $ref).

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
const POS = [
  "noun", "verb", "auxiliary", "pronoun", "reflexive-pronoun", "article", "adjective", "adverb",
  "preposition", "conjunction", "negation", "question-word", "number", "interjection", "other",
];
const TENSES = [
  "present", "passe-compose", "imparfait", "futur-simple", "futur-proche", "passe-recent",
  "plus-que-parfait", "conditionnel", "subjonctif", "imperatif", "infinitif", "participe", "other",
];
const PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p", "none"];
const REGULARITY = ["regular", "irregular"];
const AUXILIARIES = ["avoir", "être", "none"];
const TOPICS = [
  "word-order", "agreement", "elision", "liaison", "negation", "question", "pronoun", "reflexive",
  "idiom", "false-friend", "tense", "article", "other",
];

const str = (maxLength) => ({ type: "string", maxLength });
const en = (values) => ({ type: "string", enum: values });

const VERB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["infinitive", "tense", "person", "regularity", "auxiliary", "reflexive"],
  properties: {
    infinitive: str(40),
    tense: en(TENSES),
    person: en(PERSONS),
    regularity: en(REGULARITY),
    auxiliary: en(AUXILIARIES),
    reflexive: { type: "boolean" },
  },
};

const CHUNK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["french", "english", "pos", "lemma"],
  properties: {
    french: str(80),
    english: str(120),
    pos: en(POS),
    lemma: str(40),
    verb: VERB_SCHEMA,
  },
};

const GRAMMAR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "title", "explanation"],
  properties: {
    topic: en(TOPICS),
    title: str(80),
    explanation: str(400),
    example: str(160),
  },
};

const SENTENCE_SCHEMA = deepFreeze({
  type: "object",
  additionalProperties: false,
  required: ["english", "literal", "pronunciation", "cefr", "cefrNote", "chunks", "grammar"],
  properties: {
    english: str(800),
    literal: str(800),
    pronunciation: str(800),
    cefr: en(CEFR),
    cefrNote: str(200),
    chunks: { type: "array", minItems: 1, maxItems: 40, items: CHUNK_SCHEMA },
    grammar: { type: "array", minItems: 0, maxItems: 6, items: GRAMMAR_SCHEMA },
  },
});

// ---- Label tables (plain English, server-side; never taken from the model) ----

const POS_LABEL = Object.freeze({
  noun: "noun", verb: "verb", auxiliary: "auxiliary verb", pronoun: "pronoun",
  "reflexive-pronoun": "reflexive pronoun", article: "article", adjective: "adjective", adverb: "adverb",
  preposition: "preposition", conjunction: "conjunction", negation: "negation",
  "question-word": "question word", number: "number", interjection: "interjection", other: "other",
});

const TENSE_LABEL = Object.freeze({
  present: "present",
  "passe-compose": "passé composé (past)",
  imparfait: "imparfait (past, ongoing)",
  "futur-simple": "futur simple (future)",
  "futur-proche": "futur proche (going to)",
  "passe-recent": "passé récent (just did)",
  "plus-que-parfait": "plus-que-parfait (had done)",
  conditionnel: "conditionnel (would)",
  subjonctif: "subjonctif (subjunctive)",
  imperatif: "impératif (command)",
  infinitif: "infinitive",
  participe: "participle",
  other: "other",
});

const PERSON_LABEL = Object.freeze({
  "1s": "I (1st person singular)",
  "2s": "you (2nd person singular, informal)",
  "3s": "he/she/it/on (3rd person singular)",
  "1p": "we (1st person plural)",
  "2p": "you (2nd person plural or formal)",
  "3p": "they (3rd person plural)",
  none: "no person",
});

const TOPIC_LABEL = Object.freeze({
  "word-order": "Word order", agreement: "Agreement", elision: "Elision", liaison: "Liaison",
  negation: "Negation", question: "Questions", pronoun: "Pronouns", reflexive: "Reflexive verbs",
  idiom: "Idiom", "false-friend": "False friend", tense: "Tense", article: "Articles", other: "Other",
});

// ---- Enum synonyms (keys are canonicalised: lowercase, accents stripped, spaces/underscores -> "-") ----

const SYNONYMS = {
  tense: {
    "present-tense": "present", "le-present": "present", "present-simple": "present",
    "past": "passe-compose", "compound-past": "passe-compose", "past-tense": "passe-compose",
    "imperfect": "imparfait", "future": "futur-simple", "simple-future": "futur-simple", "futur": "futur-simple",
    "near-future": "futur-proche", "recent-past": "passe-recent", "pluperfect": "plus-que-parfait",
    "conditional": "conditionnel", "subjunctive": "subjonctif", "imperative": "imperatif",
    "infinitive": "infinitif", "participle": "participe", "past-participle": "participe",
    "participe-passe": "participe", "present-participle": "participe",
  },
  person: {
    "1st-person-singular": "1s", "first-person-singular": "1s", "2nd-person-singular": "2s",
    "second-person-singular": "2s", "3rd-person-singular": "3s", "third-person-singular": "3s",
    "1st-person-plural": "1p", "first-person-plural": "1p", "2nd-person-plural": "2p",
    "second-person-plural": "2p", "3rd-person-plural": "3p", "third-person-plural": "3p",
    "n/a": "none", "": "none", "null": "none", "impersonal": "none",
  },
  pos: {
    "adverb-of-negation": "negation", "negative": "negation", "negation-word": "negation",
    "auxiliary-verb": "auxiliary", "subject-pronoun": "pronoun", "object-pronoun": "pronoun",
    "reflexive": "reflexive-pronoun", "determiner": "article", "definite-article": "article",
    "indefinite-article": "article", "partitive-article": "article", "proper-noun": "noun",
    "interrogative": "question-word", "interrogative-pronoun": "question-word",
    "interrogative-adverb": "question-word", "question": "question-word", "numeral": "number",
  },
  regularity: { "regular-verb": "regular", "irregular-verb": "irregular" },
  auxiliary: { "n/a": "none", "": "none", "null": "none" },
  topic: {
    "questions": "question", "pronouns": "pronoun", "articles": "article", "tenses": "tense",
    "reflexive-verbs": "reflexive", "false-friends": "false-friend", "idioms": "idiom",
    "contraction": "elision", "gender-agreement": "agreement",
  },
  cefr: {},
};

// Enums whose unknown values become "other" (recorded) instead of failing validation.
const OTHER_FALLBACK = new Set(["pos", "tense", "topic"]);

function canon(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-");
}

// Strip C0/C1 control characters. Tab/CR/LF become spaces (all fields are single-line text).
function stripControl(s) {
  return s.replace(/[\t\n\r]/g, " ").replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

function truncate(s, max) {
  const cps = [...s];
  if (cps.length <= max) return s;
  return cps.slice(0, max - 1).join("") + "…";
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function joinPath(base, key) {
  if (typeof key === "number") return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

function fieldName(path) {
  const m = /([A-Za-z]+)$/.exec(path);
  return m ? m[1] : "";
}

function normaliseEnum(value, schema, path, notes) {
  const field = fieldName(path);
  const key = canon(value);
  const direct = schema.enum.find((e) => canon(e) === key);
  if (direct !== undefined) {
    if (direct !== value) notes.push(`${path}: '${value}' -> '${direct}'`);
    return direct;
  }
  const syn = SYNONYMS[field] && SYNONYMS[field][key];
  if (syn !== undefined && schema.enum.includes(syn)) {
    notes.push(`${path}: '${value}' -> '${syn}'`);
    return syn;
  }
  if (OTHER_FALLBACK.has(field)) {
    notes.push(`${path}: unknown '${value}' -> 'other'`);
    return "other";
  }
  return value; // left for the validator to report
}

function normaliseNode(value, schema, path, notes) {
  switch (schema.type) {
    case "string": {
      let v = value;
      if (typeof v === "number" || typeof v === "boolean") {
        notes.push(`${path}: converted ${typeof v} to string`);
        v = String(v);
      }
      if (typeof v !== "string") return v;
      const cleaned = stripControl(v).trim();
      if (cleaned !== v.trim()) notes.push(`${path}: control characters stripped`);
      v = cleaned;
      if (schema.enum) return normaliseEnum(v, schema, path, notes);
      if (schema.maxLength !== undefined && [...v].length > schema.maxLength) {
        notes.push(`${path}: truncated to ${schema.maxLength} characters`);
        v = truncate(v, schema.maxLength);
      }
      return v;
    }
    case "boolean": {
      if (value === "true" || value === "false") {
        notes.push(`${path}: converted string to boolean`);
        return value === "true";
      }
      return value;
    }
    case "array": {
      if (!Array.isArray(value)) return value;
      let arr = value;
      if (schema.maxItems !== undefined && arr.length > schema.maxItems) {
        notes.push(`${path}: dropped ${arr.length - schema.maxItems} extra item(s)`);
        arr = arr.slice(0, schema.maxItems);
      }
      return arr.map((item, i) => normaliseNode(item, schema.items, joinPath(path, i), notes));
    }
    case "object": {
      if (!isPlainObject(value)) return value;
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const sub = schema.properties[k];
        const p = joinPath(path, k);
        if (!sub) {
          notes.push(`${p}: unknown property dropped`);
          continue;
        }
        if (v === null && !schema.required.includes(k)) {
          notes.push(`${p}: null optional property dropped`);
          continue;
        }
        out[k] = normaliseNode(v, sub, p, notes);
      }
      return out;
    }
    default:
      return value;
  }
}

/**
 * Lenient normalisation; never throws. Returns a new object (input is not modified).
 * @returns {{value: any, normalisations: string[]}}
 */
function normaliseSentence(obj) {
  const notes = [];
  if (!isPlainObject(obj)) return { value: obj, normalisations: notes };
  const src = { ...obj };
  // A 7B model sometimes answers literal:null when no literal translation is wanted.
  if (src.literal === null) {
    src.literal = "";
    notes.push("literal: null -> ''");
  }
  const value = normaliseNode(src, SENTENCE_SCHEMA, "", notes);
  if (Array.isArray(value.chunks)) {
    value.chunks.forEach((chunk, i) => {
      if (isPlainObject(chunk) && chunk.pos !== "verb" && "verb" in chunk) {
        delete chunk.verb;
        notes.push(`chunks[${i}].verb: dropped on a non-verb chunk`);
      }
    });
  }
  return { value, normalisations: notes };
}

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function validateNode(value, schema, path, errors) {
  const where = path || "(root)";
  const actual = typeOf(value);
  if (actual !== schema.type) {
    errors.push(`${where}: expected ${schema.type}, got ${actual}`);
    return;
  }
  if (schema.type === "string") {
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${where}: '${truncate(value, 40)}' is not allowed (use one of: ${schema.enum.join(", ")})`);
    }
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) {
      errors.push(`${where}: longer than ${schema.maxLength} characters`);
    }
  } else if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${where}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${where}: at most ${schema.maxItems} item(s) allowed`);
    }
    value.forEach((item, i) => validateNode(item, schema.items, joinPath(path, i), errors));
  } else if (schema.type === "object") {
    for (const k of schema.required) {
      if (!(k in value)) errors.push(`${joinPath(path, k)}: is required`);
    }
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties[k];
      if (!sub) {
        if (schema.additionalProperties === false) errors.push(`${joinPath(path, k)}: unknown property`);
        continue;
      }
      validateNode(v, sub, joinPath(path, k), errors);
    }
  }
}

/** Strict validation (run after normaliseSentence). Returns 'path: message' strings; [] = valid. */
function validateSentence(obj) {
  const errors = [];
  validateNode(obj, SENTENCE_SCHEMA, "", errors);
  return errors;
}

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

module.exports = {
  SENTENCE_SCHEMA,
  normaliseSentence,
  validateSentence,
  POS_LABEL,
  TENSE_LABEL,
  PERSON_LABEL,
  TOPIC_LABEL,
  ENUMS: Object.freeze({ CEFR, POS, TENSES, PERSONS, REGULARITY, AUXILIARIES, TOPICS }),
};
