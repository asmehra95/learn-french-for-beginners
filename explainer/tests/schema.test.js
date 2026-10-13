"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  SENTENCE_SCHEMA, normaliseSentence, validateSentence, POS_LABEL, TENSE_LABEL, PERSON_LABEL, TOPIC_LABEL, ENUMS,
} = require("../lib/schema");

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "valid-sentence.json"), "utf8"));
const fixture = () => structuredClone(FIXTURE);
const check = (obj) => validateSentence(normaliseSentence(obj).value);

test("valid fixture passes normalise + validate unchanged", () => {
  const { value, normalisations } = normaliseSentence(fixture());
  assert.deepEqual(validateSentence(value), []);
  assert.deepEqual(normalisations, []);
  assert.deepEqual(value, FIXTURE);
});

test("missing english -> error on path english", () => {
  const o = fixture();
  delete o.english;
  const errors = check(o);
  assert.ok(errors.some((e) => e.startsWith("english:")), errors.join("\n"));
});

test("chunks: [] -> error", () => {
  const o = fixture();
  o.chunks = [];
  const errors = check(o);
  assert.ok(errors.some((e) => e.startsWith("chunks:")), errors.join("\n"));
});

test("wrong type (cefr: 3) -> error", () => {
  const o = fixture();
  o.cefr = 3;
  const errors = check(o);
  assert.ok(errors.some((e) => e.startsWith("cefr:")), errors.join("\n"));
});

test("enum synonyms are normalised", () => {
  const o = fixture();
  o.chunks[2].verb.tense = "passé composé";
  o.chunks[2].verb.auxiliary = "Etre";
  o.chunks[0].pos = "verbe";
  o.chunks[3].pos = "Adverb";
  o.cefr = "a2";
  o.grammar[0].topic = "Reflexive Verbs";
  const { value, normalisations } = normaliseSentence(o);
  assert.equal(value.chunks[2].verb.tense, "passe-compose");
  assert.equal(value.chunks[2].verb.auxiliary, "être");
  assert.equal(value.chunks[0].pos, "other");
  assert.equal(value.chunks[3].pos, "adverb");
  assert.equal(value.cefr, "A2");
  assert.equal(value.grammar[0].topic, "reflexive");
  assert.ok(normalisations.some((n) => n.includes("chunks[0].pos") && n.includes("other")));
  assert.deepEqual(validateSentence(value), []);
});

test("more synonyms: passe compose, etre, present tense, adverb of negation, 1st person singular", () => {
  const o = fixture();
  o.chunks[2].verb.tense = "passe compose";
  o.chunks[2].verb.auxiliary = "etre";
  o.chunks[2].verb.person = "1st person singular";
  o.chunks[1].pos = "adverb of negation";
  let v = normaliseSentence(o).value;
  assert.equal(v.chunks[2].verb.tense, "passe-compose");
  assert.equal(v.chunks[2].verb.auxiliary, "être");
  assert.equal(v.chunks[2].verb.person, "1s");
  assert.equal(v.chunks[1].pos, "negation");
  o.chunks[2].verb.tense = "present tense";
  v = normaliseSentence(o).value;
  assert.equal(v.chunks[2].verb.tense, "present");
});

test("unknown non-fallback enum (regularity) is left for the validator", () => {
  const o = fixture();
  o.chunks[2].verb.regularity = "sometimes";
  const errors = check(o);
  assert.ok(errors.some((e) => e.startsWith("chunks[2].verb.regularity:")), errors.join("\n"));
});

test("over-long strings are truncated with …", () => {
  const o = fixture();
  o.english = "a".repeat(900);
  o.chunks[0].french = "b".repeat(100);
  const { value, normalisations } = normaliseSentence(o);
  assert.equal([...value.english].length, 800);
  assert.ok(value.english.endsWith("…"));
  assert.equal([...value.chunks[0].french].length, 80);
  assert.ok(value.chunks[0].french.endsWith("…"));
  assert.ok(normalisations.some((n) => n.startsWith("english:")));
  assert.deepEqual(validateSentence(value), []);
});

test("extra array items are dropped", () => {
  const o = fixture();
  o.grammar = Array.from({ length: 9 }, () => structuredClone(FIXTURE.grammar[1]));
  o.chunks = Array.from({ length: 45 }, () => structuredClone(FIXTURE.chunks[3]));
  const { value } = normaliseSentence(o);
  assert.equal(value.grammar.length, 6);
  assert.equal(value.chunks.length, 40);
  assert.deepEqual(validateSentence(value), []);
});

test("verb on a noun chunk is dropped", () => {
  const o = fixture();
  o.chunks[3].pos = "noun";
  o.chunks[3].verb = structuredClone(FIXTURE.chunks[2].verb);
  const { value, normalisations } = normaliseSentence(o);
  assert.equal("verb" in value.chunks[3], false);
  assert.ok(normalisations.some((n) => n.startsWith("chunks[3].verb")));
});

test("verb missing on a verb chunk is kept without verb", () => {
  const o = fixture();
  delete o.chunks[2].verb;
  const { value } = normaliseSentence(o);
  assert.equal(value.chunks[2].pos, "verb");
  assert.deepEqual(validateSentence(value), []);
});

test("control characters are stripped", () => {
  const o = fixture();
  o.english = "We\u0007 got\u0000 up\u009b early.\n";
  o.chunks[0].english = "\u001bwe\tthen";
  const { value } = normaliseSentence(o);
  assert.equal(value.english, "We got up early.");
  assert.equal(value.chunks[0].english, "we then");
});

test("unknown properties are dropped by the normaliser and rejected by the validator", () => {
  const o = fixture();
  o.french = "Nous nous sommes levés tôt.";
  o.chunks[0].gender = "m";
  assert.ok(validateSentence(o).some((e) => e.startsWith("french:")));
  const { value } = normaliseSentence(o);
  assert.equal("french" in value, false);
  assert.equal("gender" in value.chunks[0], false);
  assert.deepEqual(validateSentence(value), []);
});

test("normaliser does not mutate its input and never throws on junk", () => {
  const o = fixture();
  o.chunks[0].pos = "verbe";
  normaliseSentence(o);
  assert.equal(o.chunks[0].pos, "verbe");
  for (const junk of [null, 5, "x", [], { chunks: "no" }]) {
    assert.doesNotThrow(() => normaliseSentence(junk));
    assert.ok(validateSentence(normaliseSentence(junk).value).length > 0);
  }
});

test("schema uses only the allowed JSON Schema subset (no anyOf/$ref)", () => {
  const allowed = new Set(["type", "properties", "items", "required", "enum", "maxLength", "minItems", "maxItems", "additionalProperties"]);
  const text = JSON.stringify(SENTENCE_SCHEMA);
  assert.equal(text.includes("anyOf"), false);
  assert.equal(text.includes("$ref"), false);
  (function walk(node) {
    for (const [k, v] of Object.entries(node)) {
      assert.ok(allowed.has(k), `unexpected keyword ${k}`);
      if (k === "properties") Object.values(v).forEach(walk);
      else if (k === "items") walk(v);
      else if (k === "additionalProperties") assert.equal(v, false);
    }
  })(SENTENCE_SCHEMA);
  assert.deepEqual(SENTENCE_SCHEMA.properties.chunks.items.properties.verb.properties.auxiliary.enum, ["avoir", "être", "none"]);
});

test("label tables cover every enum value", () => {
  for (const v of ENUMS.POS) assert.equal(typeof POS_LABEL[v], "string", v);
  for (const v of ENUMS.TENSES) assert.equal(typeof TENSE_LABEL[v], "string", v);
  for (const v of ENUMS.PERSONS) assert.equal(typeof PERSON_LABEL[v], "string", v);
  for (const v of ENUMS.TOPICS) assert.equal(typeof TOPIC_LABEL[v], "string", v);
  assert.equal(TENSE_LABEL["passe-compose"], "passé composé (past)");
  assert.equal(PERSON_LABEL["1p"], "we (1st person plural)");
  assert.equal(POS_LABEL["reflexive-pronoun"], "reflexive pronoun");
  assert.equal(TOPIC_LABEL.reflexive, "Reflexive verbs");
});
