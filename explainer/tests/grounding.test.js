"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadVerbData } = require("../lib/verb-data");
const { groundSentence, joinChunks } = require("../lib/grounding");
const { verbLink, topicLinks, qTokens } = require("../lib/links");

const index = loadVerbData();

// Chunk and verb builders (shapes as produced by schema.normaliseSentence).
const C = (french, pos, lemma = "", verb) => ({ french, english: "", pos, lemma, ...(verb ? { verb } : {}) });
const V = (infinitive, o = {}) => ({
  infinitive,
  tense: "present",
  person: "3s",
  regularity: "irregular",
  auxiliary: "none",
  reflexive: false,
  ...o,
});
const ground = (chunks, french) => groundSentence({ french: french ?? chunks.map((c) => c.french).join(" "), chunks }, index);
const gOf = (chunk) => (chunk.verb ? chunk.verb.grounding : chunk.grounding);
const g = (res, i) => gOf(res.chunks[i]);
const fields = (gr) => gr.disagreements.map((d) => `${d.field}:${d.severity}`).sort();

// ---- §8.8 table -------------------------------------------------------------------------

test("sont allés, lemma aller, passe-compose, aux être -> matched aller, Irregular, être, no disagreements", () => {
  const r = ground([C("ils", "pronoun", "ils"), C("sont allés", "verb", "aller", V("aller", { tense: "passe-compose", person: "3p", auxiliary: "être" }))]);
  const gr = g(r, 1);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "aller");
  assert.deepEqual(gr.badges, ["Irregular"]);
  assert.equal(gr.auxiliary, "être");
  assert.equal(gr.auxFromForm, "être");
  assert.deepEqual(gr.disagreements, []);
});

test("sont alles (no accent) -> same; 'ils sont alles' -> aller, Irregular, être", () => {
  const r = ground([C("sont alles", "verb", "aller", V("aller", { tense: "passe-compose", person: "3p", auxiliary: "être" }))]);
  assert.equal(g(r, 0).status, "matched");
  assert.equal(g(r, 0).verbId, "aller");
  assert.deepEqual(g(r, 0).disagreements, []);

  const r2 = ground([C("ils", "pronoun", "ils"), C("sont alles", "verb", "aller")], "ils sont alles");
  const gr = g(r2, 1);
  assert.equal(gr.verbId, "aller");
  assert.deepEqual(gr.badges, ["Irregular"]);
  assert.equal(gr.auxiliary, "être");
  assert.equal(gr.auxFromForm, "être");
  assert.deepEqual(gr.disagreements, []);
});

test("sont allés with model aux avoir -> one auxiliary conflict, no auxiliary-in-sentence", () => {
  const r = ground([C("sont allés", "verb", "aller", V("aller", { tense: "passe-compose", person: "3p", auxiliary: "avoir" }))]);
  const gr = g(r, 0);
  assert.equal(gr.status, "matched");
  assert.deepEqual(fields(gr), ["auxiliary:conflict"]);
  assert.equal(gr.disagreements[0].message, "The AI said avoir; your guide says être.");
});

test("allés, bad lemma allé -> matched-by-form aller + lemma conflict", () => {
  const r = ground([C("allés", "verb", "allé", V("allé", { tense: "passe-compose", person: "3p", auxiliary: "être" }))]);
  const gr = g(r, 0);
  assert.equal(gr.status, "matched-by-form");
  assert.equal(gr.verbId, "aller");
  assert.deepEqual(fields(gr), ["lemma:conflict"]);
  assert.equal(gr.disagreements[0].message, "The AI gave 'allé' as the infinitive; your guide matches this form to aller.");
});

test("appelle after m' reflexive-pronoun, lemma appeler -> s-appeler with Reflexive badge", () => {
  const r = ground([
    C("je", "pronoun", "je"),
    C("m'", "reflexive-pronoun", "se"),
    C("appelle", "verb", "appeler", V("appeler", { person: "1s", regularity: "regular" })),
  ]);
  const gr = g(r, 2);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "s-appeler");
  assert.equal(gr.infinitive, "s'appeler");
  assert.deepEqual(gr.badges, ["Regular (spelling change)", "Reflexive"]);
  assert.deepEqual(gr.disagreements, []);
});

test("sommes levés, lemma se lever -> se-lever, être", () => {
  const r = ground([
    C("Nous", "pronoun", "nous"),
    C("nous", "reflexive-pronoun", "se"),
    C("sommes levés", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1p", regularity: "regular", auxiliary: "être", reflexive: true })),
  ]);
  const gr = g(r, 2);
  assert.equal(gr.verbId, "se-lever");
  assert.equal(gr.auxiliary, "être");
  assert.equal(gr.auxFromForm, "être");
  assert.deepEqual(gr.badges, ["Regular (spelling change)", "Reflexive"]);
  assert.deepEqual(gr.disagreements, []);
});

test("suis, lemma être -> matched etre (formIds {etre, suivre} contains it)", () => {
  const r = ground([C("suis", "verb", "être", V("être", { person: "1s" }))]);
  assert.equal(g(r, 0).status, "matched");
  assert.equal(g(r, 0).verbId, "etre");
  assert.equal(g(r, 0).formChecked, true);
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("suis, lemma suivre, 'je suis le guide' -> matched suivre", () => {
  const r = ground(
    [C("je", "pronoun", "je"), C("suis", "verb", "suivre", V("suivre", { person: "1s" })), C("le", "article", "le"), C("guide", "noun", "guide")],
    "je suis le guide",
  );
  assert.equal(g(r, 1).status, "matched");
  assert.equal(g(r, 1).verbId, "suivre");
  assert.deepEqual(g(r, 1).disagreements, []);
});

test("est, lemma être, regularity regular -> matched, regularity conflict", () => {
  const r = ground([C("est", "verb", "être", V("être", { regularity: "regular" }))]);
  const gr = g(r, 0);
  assert.equal(gr.verbId, "etre");
  assert.deepEqual(fields(gr), ["regularity:conflict"]);
  assert.equal(gr.disagreements[0].message, "The AI said regular; your guide says Irregular.");
});

test("mange, lemma manger -> Regular (spelling change)", () => {
  const r = ground([C("mange", "verb", "manger", V("manger", { regularity: "regular" }))]);
  assert.equal(g(r, 0).verbId, "manger");
  assert.deepEqual(g(r, 0).badges, ["Regular (spelling change)"]);
});

test("parle, lemma parler, person 3s -> matched, Regular, no person flag", () => {
  const r = ground([C("parle", "verb", "parler", V("parler", { person: "3s", regularity: "regular" }))]);
  assert.equal(g(r, 0).verbId, "parler");
  assert.deepEqual(g(r, 0).badges, ["Regular"]);
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("parlons with person 3s -> person info listing the guide's person", () => {
  const r = ground([C("parlons", "verb", "parler", V("parler", { person: "3s", regularity: "regular" }))]);
  assert.deepEqual(fields(g(r, 0)), ["person:info"]);
  assert.equal(g(r, 0).disagreements[0].message, "Your guide lists 'parlons' as 1p (nous).");
});

test("nage, lemma nager -> not-in-guide -> unknownVerbs", () => {
  const r = groundSentence({ french: "Il nage.", sentenceIndex: 2, chunks: [C("Il", "pronoun", "il"), C("nage", "verb", "nager", V("nager"))] }, index);
  assert.equal(g(r, 1).status, "not-in-guide");
  assert.deepEqual(r.verbs, []);
  assert.deepEqual(r.unknownVerbs, [{ lemma: "nager", french: "nage", sentenceIndex: 2, chunkIndex: 1 }]);
});

test("est passé, lemma passer, aux être -> matched, auxiliary info (dual auxiliary)", () => {
  const r = ground([C("est passé", "verb", "passer", V("passer", { tense: "passe-compose", regularity: "regular", auxiliary: "être" }))]);
  const gr = g(r, 0);
  assert.equal(gr.verbId, "passer");
  assert.ok(gr.disagreements.length > 0);
  assert.ok(gr.disagreements.every((d) => d.severity === "info"));
  assert.ok(gr.disagreements.some((d) => d.field === "auxiliary"));
  assert.match(gr.disagreements[0].message, /^passer uses avoir when it has a direct object \(.+\) and être otherwise\.$/);
});

test("faisait, lemma faire, imparfait -> matched faire, formChecked false, no disagreement", () => {
  const r = ground([C("faisait", "verb", "faire", V("faire", { tense: "imparfait" }))]);
  assert.equal(g(r, 0).status, "matched");
  assert.equal(g(r, 0).verbId, "faire");
  assert.equal(g(r, 0).formChecked, false);
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("ai allé, aux avoir -> auxiliary-in-sentence conflict and auxiliary conflict", () => {
  const r = ground([C("ai allé", "verb", "aller", V("aller", { tense: "passe-compose", person: "1s", auxiliary: "avoir" }))]);
  const gr = g(r, 0);
  assert.equal(gr.verbId, "aller");
  assert.equal(gr.auxFromForm, "avoir");
  assert.deepEqual(fields(gr), ["auxiliary-in-sentence:conflict", "auxiliary:conflict"]);
  const inSentence = gr.disagreements.find((d) => d.field === "auxiliary-in-sentence");
  assert.equal(inSentence.message, "Your sentence uses avoir, but aller takes être in the passé composé. Did you mean je suis allé(e)?");
});

test("a été, lemma être, aux avoir -> matched etre, auxFromForm avoir, no disagreements", () => {
  const r = ground([C("a été", "verb", "être", V("être", { tense: "passe-compose", auxiliary: "avoir" }))]);
  assert.equal(g(r, 0).verbId, "etre");
  assert.equal(g(r, 0).auxFromForm, "avoir");
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("vais être, futur-proche -> matched etre, vais dropped, no auxFromForm, no lemma conflict", () => {
  const r = ground([C("vais être", "verb", "être", V("être", { tense: "futur-proche", person: "1s" }))]);
  const gr = g(r, 0);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "etre");
  assert.equal(gr.auxFromForm, null);
  assert.equal(gr.formChecked, true);
  assert.deepEqual(gr.disagreements, []);
});

test("vais être with tense present still drops vais (later token is an infinitive)", () => {
  const r = ground([C("vais être", "verb", "être", V("être", { tense: "present", person: "1s" }))]);
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("vais manger, futur-proche -> matched manger, no disagreements", () => {
  const r = ground([C("vais manger", "verb", "manger", V("manger", { tense: "futur-proche", person: "1s", regularity: "regular" }))]);
  assert.equal(g(r, 0).verbId, "manger");
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("vais (single token), lemma aller, futur-proche -> not dropped, matched aller", () => {
  const r = ground([C("vais", "verb", "aller", V("aller", { tense: "futur-proche", person: "1s" }))]);
  assert.equal(g(r, 0).status, "matched");
  assert.equal(g(r, 0).verbId, "aller");
  assert.equal(g(r, 0).formChecked, true);
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("viens de manger -> passé récent: venir form dropped, matched manger", () => {
  const r = ground([C("viens de manger", "verb", "manger", V("manger", { tense: "passe-recent", person: "1s", regularity: "regular" }))]);
  assert.equal(g(r, 0).verbId, "manger");
  assert.deepEqual(g(r, 0).disagreements, []);
});

test("[est auxiliary] + [arrivée verb] -> merged, arrivée matched arriver, verbs only arriver", () => {
  const r = ground([
    C("Elle", "pronoun", "elle"),
    C("est", "auxiliary", "être"),
    C("arrivée", "verb", "arriver", V("arriver", { tense: "passe-compose", regularity: "regular", auxiliary: "être" })),
  ]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  const gr = g(r, 2);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "arriver");
  assert.equal(gr.auxFromForm, "être");
  assert.deepEqual(gr.disagreements, []);
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["arriver"]);
  assert.equal(r.verbs[0].french, "est arrivée");
  assert.equal(r.verbs[0].chunkIndex, 2);
  assert.equal(gr.guidePronunciation.speak, "Elle est arrivée");
});

test("auxiliary merge skips negation and adverb chunks", () => {
  const r = ground([
    C("Il", "pronoun", "il"),
    C("n'", "negation", "ne"),
    C("est", "auxiliary", "être"),
    C("pas", "negation", "pas"),
    C("déjà", "adverb", "déjà"),
    C("parti", "verb", "partir", V("partir", { tense: "passe-compose", auxiliary: "être" })),
  ]);
  assert.deepEqual(r.chunks[2].grounding, { status: "merged", intoChunk: 5 });
  assert.equal(g(r, 5).verbId, "partir");
  assert.equal(g(r, 5).auxFromForm, "être");
  assert.deepEqual(g(r, 5).disagreements, []);
});

test("[ai auxiliary] + [allé verb, lemma aller] -> matched aller, auxiliary-in-sentence conflict", () => {
  const r = ground([C("j'", "pronoun", "je"), C("ai", "auxiliary", "avoir"), C("allé", "verb", "aller")]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  const gr = g(r, 2);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "aller");
  assert.deepEqual(fields(gr), ["auxiliary-in-sentence:conflict"]);
});

test("[suis auxiliary] + [content adjective] -> suis grounded as verb, matched etre", () => {
  const r = ground([C("Je", "pronoun", "je"), C("suis", "auxiliary", "être"), C("content", "adjective", "content")]);
  assert.equal(r.chunks[1].groundedAs, "verb");
  const gr = r.chunks[1].grounding;
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "etre");
  assert.equal(gr.guidePronunciation.text, "zhuh swee");
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["etre"]);
});

// Live shapes: the model tags the auxiliary as a plain verb (and sometimes the participle as something else).
test("[sommes verb/avoir] + [levés verb] -> sommes merged, levés matched se-lever with aux être, verbs only se-lever", () => {
  const r = ground([
    C("Nous", "pronoun", "nous"),
    C("nous", "reflexive-pronoun", "se"),
    C("sommes", "verb", "sommes", V("avoir", { person: "1p", regularity: "regular" })),
    C("levés", "verb", "levés", V("se lever", { tense: "passe-compose", person: "1p", regularity: "regular", auxiliary: "avoir", reflexive: true })),
    C("tôt", "adverb", "tôt"),
  ]);
  assert.deepEqual(r.chunks[2].grounding, { status: "merged", intoChunk: 3 });
  assert.equal(r.chunks[2].verb.grounding, undefined);
  const gr = g(r, 3);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "se-lever");
  assert.equal(gr.auxFromForm, "être");
  assert.deepEqual(fields(gr), ["auxiliary:conflict"]);
  assert.equal(gr.guidePronunciation.speak, "Nous nous sommes levés");
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["se-lever"]);
  assert.equal(r.verbs[0].french, "sommes levés");
});

test("[est verb] + [arrivée pronoun] -> est merged, arrivée grounded as verb arriver with aux être", () => {
  const r = ground([
    C("Elle", "pronoun", "elle"),
    C("est", "verb", "être", V("être", { regularity: "regular" })),
    C("arrivée", "pronoun", "arrivée"),
    C("hier", "adverb", "hier"),
    C("soir", "noun", "soir"),
  ]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  assert.equal(r.chunks[2].groundedAs, "verb");
  const gr = r.chunks[2].grounding;
  assert.equal(gr.status, "matched-by-form");
  assert.equal(gr.verbId, "arriver");
  assert.equal(gr.auxFromForm, "être");
  assert.equal(gr.guidePronunciation.speak, "Elle est arrivée");
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["arriver"]);
  assert.equal(r.verbs[0].chunkIndex, 2);
});

test("[est verb] + [content adjective] -> no merge, est stays être", () => {
  const r = ground([C("Il", "pronoun", "il"), C("est", "verb", "être", V("être")), C("content", "adjective", "content")]);
  assert.equal(r.chunks[1].grounding, undefined);
  assert.equal(g(r, 1).verbId, "etre");
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["etre"]);
});

// être + adjectival participle of an avoir verb is not a passé composé: no merge, no false Check lines.
for (const [label, chunks, at] of [
  ["Je suis perdu.", [C("Je", "pronoun", "je"), C("suis", "verb", "être", V("être", { person: "1s" })), C("perdu", "adjective", "perdu")], 1],
  ["C'est fini.", [C("C'", "pronoun", "ce"), C("est", "verb", "être", V("être")), C("fini", "adjective", "fini")], 1],
  ["La porte est ouverte.", [C("La", "article", "la"), C("porte", "noun", "porte"), C("est", "verb", "être", V("être")), C("ouverte", "adjective", "ouvert")], 2],
]) {
  test(`${label} [être verb] + [participle adjective, avoir verb] -> no merge, être grounded, no Check lines`, () => {
    const r = ground(chunks, label);
    assert.equal(r.chunks[at].grounding, undefined);
    assert.equal(r.chunks[at + 1].grounding, undefined);
    assert.equal(r.chunks[at + 1].groundedAs, undefined);
    const gr = g(r, at);
    assert.equal(gr.verbId, "etre");
    assert.equal(gr.auxFromForm, null);
    assert.deepEqual(gr.disagreements, []);
    assert.deepEqual(r.verbs.map((v) => v.verbId), ["etre"]);
  });
}

test("[suis auxiliary] + [perdu adjective] -> no merge (aux disagrees with guide), suis grounded as être", () => {
  const r = ground([C("Je", "pronoun", "je"), C("suis", "auxiliary", "être"), C("perdu", "adjective", "perdu")]);
  assert.equal(r.chunks[1].groundedAs, "verb");
  assert.equal(r.chunks[1].grounding.verbId, "etre");
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["etre"]);
});

test("[ai auxiliary] + [allé verb] -> still merged and flagged (design shape is unconditional)", () => {
  const r = ground([C("j'", "pronoun", "je"), C("ai", "auxiliary", "avoir"), C("allé", "verb", "aller", V("aller", { tense: "passe-compose", person: "1s", auxiliary: "avoir" }))]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  const gr = g(r, 2);
  assert.equal(gr.verbId, "aller");
  assert.equal(gr.auxFromForm, "avoir");
  assert.ok(fields(gr).some((f) => f.startsWith("auxiliary-in-sentence:")));
});

// Learner error "j'ai allé" (integration plan D10): the model tags "ai" as a plain verb.
const didYouMean = (gr) => {
  const d = gr.disagreements.find((x) => x.field === "auxiliary-in-sentence");
  return d ? d.message : null;
};

test("[j' pronoun] + [ai verb avoir] + [allé verb aller] -> ai merged, aller flagged 'Did you mean je suis allé(e)?'", () => {
  const r = ground([
    C("Hier", "adverb", "hier"),
    C("j'", "pronoun", "je"),
    C("ai", "verb", "avoir", V("avoir", { person: "1s" })),
    C("allé", "verb", "aller", V("aller", { tense: "passe-compose", person: "1s" })),
    C("au", "article", "au"),
    C("cinéma", "noun", "cinéma"),
  ], "Hier, j'ai allé au cinéma.");
  assert.deepEqual(r.chunks[2].grounding, { status: "merged", intoChunk: 3 });
  assert.equal(r.chunks[2].verb.grounding, undefined);
  const gr = g(r, 3);
  assert.equal(gr.status, "matched");
  assert.equal(gr.verbId, "aller");
  assert.equal(gr.auxFromForm, "avoir");
  assert.deepEqual(fields(gr), ["auxiliary-in-sentence:conflict"]);
  assert.equal(didYouMean(gr), "Your sentence uses avoir, but aller takes être in the passé composé. Did you mean je suis allé(e)?");
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["aller"]);
  assert.equal(r.verbs[0].french, "ai allé");
});

test("[elle] + [a verb] + [tombée verb] -> 'Did you mean elle est tombée?'", () => {
  const r = ground([
    C("Elle", "pronoun", "elle"),
    C("a", "verb", "avoir", V("avoir")),
    C("tombée", "verb", "tomber", V("tomber", { tense: "passe-compose", regularity: "regular" })),
  ]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  const gr = g(r, 2);
  assert.equal(gr.verbId, "tomber");
  assert.deepEqual(fields(gr), ["auxiliary-in-sentence:conflict"]);
  assert.match(didYouMean(gr), /Did you mean elle est tombée\?$/);
});

test("[nous] [n'] [avons verb] [pas] [allés verb] -> negation between still merges, 'nous sommes allé(e)s'", () => {
  const r = ground([
    C("nous", "pronoun", "nous"),
    C("n'", "negation", "ne"),
    C("avons", "verb", "avoir", V("avoir", { person: "1p" })),
    C("pas", "negation", "pas"),
    C("allés", "verb", "aller", V("aller", { tense: "passe-compose", person: "1p" })),
  ]);
  assert.deepEqual(r.chunks[2].grounding, { status: "merged", intoChunk: 4 });
  const gr = g(r, 4);
  assert.equal(gr.verbId, "aller");
  assert.equal(gr.auxFromForm, "avoir");
  assert.match(didYouMean(gr), /Did you mean nous sommes allé\(e\)s\?$/);
});

test("pronominal: [je] [m'] [ai verb] [levé verb] -> 'Did you mean je me suis levé(e)?'", () => {
  const r = ground([
    C("je", "pronoun", "je"),
    C("m'", "reflexive-pronoun", "se"),
    C("ai", "verb", "avoir", V("avoir", { person: "1s" })),
    C("levé", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1s", regularity: "regular", reflexive: true })),
  ]);
  assert.deepEqual(r.chunks[2].grounding, { status: "merged", intoChunk: 3 });
  const gr = g(r, 3);
  assert.equal(gr.verbId, "se-lever");
  assert.match(didYouMean(gr), /Did you mean je me suis levé\(e\)\?$/);
});

// Pronominal-only guide entries (s'arrêter, se promener, se lever …): without a reflexive pronoun the
// sentence uses the ordinary verb with avoir, which is correct. No conflict, no "Did you mean".
const noConflict = (gr) => {
  assert.ok(gr.disagreements.every((d) => d.severity === "info"), JSON.stringify(gr.disagreements));
  assert.ok(gr.disagreements.every((d) => !/Did you mean/.test(d.message)));
};

test("'J'ai arrêté de fumer.' [J'] [ai verb] [arrêté verb] -> no learnerAux merge, no être conflict", () => {
  const r = ground([
    C("J'", "pronoun", "je"),
    C("ai", "verb", "avoir", V("avoir", { person: "1s" })),
    C("arrêté", "verb", "arrêter", V("arrêter", { tense: "passe-compose", person: "1s", auxiliary: "avoir", regularity: "regular" })),
    C("de", "preposition", "de"),
    C("fumer", "verb", "fumer", V("fumer", { tense: "infinitive" })),
  ], "J'ai arrêté de fumer.");
  assert.equal(r.chunks[1].grounding, undefined);
  assert.equal(g(r, 1).verbId, "avoir");
  const gr = g(r, 2);
  assert.equal(gr.verbId, "s-arreter");
  noConflict(gr);
  assert.deepEqual(fields(gr), ["auxiliary:info"]);
  assert.match(gr.disagreements[0].message, /arrêter is an ordinary verb that takes avoir, so avoir is right here\.$/);
});

test("'Il a promené le chien.' [Il] [a verb] [promené verb] -> no learnerAux merge, no être conflict", () => {
  const r = ground([
    C("Il", "pronoun", "il"),
    C("a", "verb", "avoir", V("avoir", { person: "3s" })),
    C("promené", "verb", "promener", V("promener", { tense: "passe-compose", person: "3s", auxiliary: "avoir", regularity: "regular" })),
    C("le", "article", "le"),
    C("chien", "noun", "chien"),
  ], "Il a promené le chien.");
  assert.equal(r.chunks[1].grounding, undefined);
  const gr = g(r, 2);
  assert.equal(gr.verbId, "se-promener");
  noConflict(gr);
});

test("'J'ai levé la main.' as [ai auxiliary]+[levé] and as one chunk 'ai levé' -> one info note, no conflict", () => {
  const tagged = ground([
    C("J'", "pronoun", "je"),
    C("ai", "auxiliary", "avoir"),
    C("levé", "verb", "lever", V("lever", { tense: "passe-compose", person: "1s", auxiliary: "avoir", regularity: "regular" })),
    C("la", "article", "la"),
    C("main", "noun", "main"),
  ]);
  const gr = g(tagged, 2);
  assert.equal(gr.verbId, "se-lever");
  assert.equal(gr.auxFromForm, "avoir");
  noConflict(gr);
  assert.deepEqual(fields(gr), ["auxiliary-in-sentence:info"]);
  const single = ground([C("J'", "pronoun", "je"), C("ai levé", "verb", "lever", V("lever", { tense: "passe-compose", person: "1s", auxiliary: "avoir", regularity: "regular" }))]);
  noConflict(g(single, 1));
});

test("pronominal with the pronoun inside the chunk: [Je] ['m'ai levé'] -> still 'Did you mean je me suis levé(e)?'", () => {
  const r = ground([C("Je", "pronoun", "je"), C("m'ai levé", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1s", reflexive: true, regularity: "regular" }))]);
  const gr = g(r, 1);
  assert.equal(gr.verbId, "se-lever");
  assert.ok(fields(gr).includes("auxiliary-in-sentence:conflict"));
  assert.match(didYouMean(gr), /Did you mean je me suis levé\(e\)\?$/);
});

test("regression set: the j'ai allé check fires only for être verbs (aller, arriver), never for arrêter; 'Je suis perdu.' untouched", () => {
  const avoirShape = (part, lemma, person = "1s", subj = "J'") => ground([
    C(subj, "pronoun", subj === "J'" ? "je" : lower(subj)),
    C(subj === "J'" ? "ai" : "a", "verb", "avoir", V("avoir", { person })),
    C(part, "verb", lemma, V(lemma, { tense: "passe-compose", person, regularity: "regular" })),
  ]);
  const lower = (s) => s.toLowerCase();
  // aller (être): flagged with the correction.
  const aller = g(avoirShape("allé", "aller"), 2);
  assert.equal(aller.verbId, "aller");
  assert.match(didYouMean(aller), /Did you mean je suis allé\(e\)\?$/);
  // arriver (être): flagged with the correction.
  const arriver = g(avoirShape("arrivé", "arriver", "3s", "Il"), 2);
  assert.equal(arriver.verbId, "arriver");
  assert.match(didYouMean(arriver), /Did you mean il est arrivé\?$/);
  // arrêter (avoir; the guide only has s'arrêter): no merge, no conflict, no correction.
  const r = avoirShape("arrêté", "arrêter");
  assert.equal(r.chunks[1].grounding, undefined);
  noConflict(g(r, 2));
  // "Je suis perdu.": être + adjective stays the copula, no merge, no disagreement.
  const perdu = ground([C("Je", "pronoun", "je"), C("suis", "verb", "être", V("être", { person: "1s" })), C("perdu", "adjective", "perdu")]);
  assert.equal(perdu.chunks[1].grounding === undefined ? perdu.chunks[1].verb.grounding.verbId : null, "etre");
  assert.deepEqual(perdu.chunks[1].verb.grounding.disagreements, []);
  assert.deepEqual(perdu.verbs.map((v) => v.verbId), ["etre"]);
});

test("[elle] + [a verb] + [arrivée adjective] -> merged, arrivée grounded as verb arriver and flagged", () => {
  const r = ground([C("Elle", "pronoun", "elle"), C("a", "verb", "avoir", V("avoir")), C("arrivée", "adjective", "arrivé")]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  assert.equal(r.chunks[2].groundedAs, "verb");
  assert.equal(r.chunks[2].grounding.verbId, "arriver");
  assert.match(didYouMean(r.chunks[2].grounding), /Did you mean elle est arrivée\?$/);
});

test("dual verb passer: [j'] [ai verb] [passé verb] -> crossPos merge, no conflict, no 'Did you mean'", () => {
  const r = ground([
    C("j'", "pronoun", "je"),
    C("ai", "verb", "avoir", V("avoir", { person: "1s" })),
    C("passé", "verb", "passer", V("passer", { tense: "passe-compose", person: "1s", regularity: "regular" })),
  ]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  const gr = g(r, 2);
  assert.equal(gr.verbId, "passer");
  assert.equal(gr.auxFromForm, "avoir");
  assert.deepEqual(gr.disagreements, []);
  // With être the dual-auxiliary message stays informational and never suggests a correction.
  const r2 = ground([C("Il", "pronoun", "il"), C("est", "verb", "être", V("être")), C("passé", "verb", "passer", V("passer", { tense: "passe-compose", regularity: "regular" }))]);
  const gr2 = g(r2, 2);
  assert.equal(gr2.verbId, "passer");
  assert.ok(gr2.disagreements.length > 0);
  assert.ok(gr2.disagreements.every((d) => d.severity === "info"));
  assert.ok(gr2.disagreements.every((d) => !/Did you mean/.test(d.message)));
});

test("[j'] [ai verb] [mangé verb] (avoir verb) -> merged by crossPos, no conflict", () => {
  const r = ground([
    C("j'", "pronoun", "je"),
    C("ai", "verb", "avoir", V("avoir", { person: "1s" })),
    C("mangé", "verb", "manger", V("manger", { tense: "passe-compose", person: "1s", regularity: "regular" })),
  ]);
  assert.deepEqual(r.chunks[1].grounding, { status: "merged", intoChunk: 2 });
  const gr = g(r, 2);
  assert.equal(gr.verbId, "manger");
  assert.equal(gr.auxFromForm, "avoir");
  assert.deepEqual(gr.disagreements, []);
  assert.deepEqual(r.verbs.map((v) => v.verbId), ["manger"]);
});

test("[j'] [ai verb] [faim noun] -> no merge, ai stays avoir", () => {
  const r = ground([C("J'", "pronoun", "je"), C("ai", "verb", "avoir", V("avoir", { person: "1s" })), C("faim", "noun", "faim")]);
  assert.equal(r.chunks[1].grounding, undefined);
  assert.equal(g(r, 1).verbId, "avoir");
  assert.deepEqual(g(r, 1).disagreements, []);
});

test("[je] + [m'] + [appelle] -> guidePronunciation zhuh mah-pel, of phrase", () => {
  const r = ground([C("je", "pronoun", "je"), C("m'", "reflexive-pronoun", "se"), C("appelle", "verb", "appeler", V("appeler", { person: "1s", regularity: "regular" }))]);
  assert.equal(g(r, 2).verbId, "s-appeler");
  assert.deepEqual(g(r, 2).guidePronunciation, {
    text: "zhuh mah-pel",
    of: "phrase",
    label: "je m'appelle (from your guide)",
    speak: "je m'appelle",
  });
});

test("[j' pronoun] + [ai verb, lemma avoir] -> zhay, of phrase", () => {
  const r = ground([C("j'", "pronoun", "je"), C("ai", "verb", "avoir", V("avoir", { person: "1s" }))]);
  assert.equal(g(r, 1).verbId, "avoir");
  assert.equal(g(r, 1).guidePronunciation.text, "zhay");
  assert.equal(g(r, 1).guidePronunciation.of, "phrase");
  assert.equal(g(r, 1).guidePronunciation.speak, "j'ai");
});

test("[elle] + [est verb, lemma être] -> el eh (variant picked)", () => {
  const r = ground([C("elle", "pronoun", "elle"), C("est", "verb", "être", V("être"))]);
  assert.equal(g(r, 1).guidePronunciation.text, "el eh");
  assert.equal(g(r, 1).guidePronunciation.label, "elle est (from your guide)");
  const r2 = ground([C("Il", "pronoun", "il"), C("s'", "reflexive-pronoun", "se"), C("appelle", "verb", "appeler", V("appeler", { regularity: "regular" }))]);
  assert.equal(g(r2, 2).guidePronunciation.text, "eel sah-pel");
  const r3 = ground([C("ils", "pronoun", "ils"), C("ont", "verb", "avoir", V("avoir", { person: "3p" }))]);
  assert.equal(g(r3, 1).guidePronunciation.text, "eel zohN");
});

// ---- §8.6 guide pronunciation examples ----------------------------------------------------

test("joinChunks cases", () => {
  assert.equal(joinChunks(["je", "m'", "appelle"]), "je m'appelle");
  assert.equal(joinChunks(["j'", "ai"]), "j'ai");
  assert.equal(joinChunks([null, "nous", "", "sommes"]), "nous sommes");
});

test("je suis -> zhuh swee (also with ne … pas between)", () => {
  const r = ground([C("je", "pronoun", "je"), C("suis", "verb", "être", V("être", { person: "1s" }))]);
  assert.equal(g(r, 1).guidePronunciation.text, "zhuh swee");
  assert.equal(g(r, 1).guidePronunciation.of, "phrase");
  const r2 = ground([C("je", "pronoun", "je"), C("ne … pas", "negation", "ne pas"), C("suis", "verb", "être", V("être", { person: "1s" }))]);
  assert.equal(g(r2, 2).guidePronunciation.text, "zhuh swee");
});

test("je + me + aux suis + levé -> zhuh muh swee luh-vay (past phrase)", () => {
  const r = ground([
    C("je", "pronoun", "je"),
    C("me", "reflexive-pronoun", "se"),
    C("suis", "auxiliary", "être"),
    C("levé", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1s", regularity: "regular", auxiliary: "être", reflexive: true })),
  ]);
  const gr = g(r, 3);
  assert.equal(gr.verbId, "se-lever");
  assert.deepEqual(gr.disagreements, []);
  assert.equal(gr.guidePronunciation.text, "zhuh muh swee luh-vay");
  assert.equal(gr.guidePronunciation.of, "phrase");
  assert.equal(gr.guidePronunciation.label, "je me suis levé(e) (from your guide)");
  assert.equal(gr.guidePronunciation.speak, "je me suis levé");
});

test("nous nous sommes levés -> infinitive fallback suh luh-vay", () => {
  const r = ground([
    C("Nous", "pronoun", "nous"),
    C("nous", "reflexive-pronoun", "se"),
    C("sommes levés", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1p", regularity: "regular", auxiliary: "être", reflexive: true })),
  ]);
  assert.deepEqual(g(r, 2).guidePronunciation, {
    text: "suh luh-vay",
    of: "infinitive",
    label: "se lever (from your guide)",
    speak: "Nous nous sommes levés",
  });
});

// ---- links --------------------------------------------------------------------------------

test("lesson routes: aller and se lever", () => {
  assert.deepEqual(verbLink(index.byId.get("aller")), {
    kind: "verb",
    routeId: "#browse/lesson/1/aller",
    label: "Lesson 1: The Essentials · aller",
  });
  assert.equal(verbLink(index.byId.get("se-lever")).routeId, "#browse/lesson/23/se-lever");
  const r = ground([C("va", "verb", "aller", V("aller"))]);
  assert.deepEqual(g(r, 0).links, [verbLink(index.byId.get("aller"))]);
  assert.deepEqual(r.verbs[0].links, [verbLink(index.byId.get("aller"))]);
});

test("qTokens examples", () => {
  assert.deepEqual(qTokens("Qu'est-ce que tu fais ?"), ["qu'", "est", "ce", "que", "tu", "fais"]);
  assert.deepEqual(qTokens("Où habites-tu ?"), ["où", "habites", "tu"]);
  assert.deepEqual(qTokens("Qu\u2019est-ce"), ["qu'", "est", "ce"]);
});

const S = (french, chunks = [], grammar = []) => ({ french, chunks, grammar });
const qLink = (sentence) => topicLinks([sentence]).find((l) => l.topicId === "questions");
const rLink = (sentence) => topicLinks([sentence]).find((l) => l.topicId === "reflexive");

test("topic: 'Est-ce que tu viens ce soir ?' -> #topic/questions/Q1", () => {
  const l = qLink(S("Est-ce que tu viens ce soir ?"));
  assert.deepEqual(l, {
    kind: "topic",
    topicId: "questions",
    lessonId: "Q1",
    routeId: "#topic/questions/Q1",
    label: "Asking questions · Q1: Yes/no questions three ways",
    status: "available",
  });
});

test("topic: est-ce que without '?' still triggers", () => {
  assert.equal(qLink(S("Est-ce que tu viens.")).routeId, "#topic/questions/Q1");
});

test("topic: 'Où habites-tu ?' -> Q3", () => {
  assert.equal(qLink(S("Où habites-tu ?")).routeId, "#topic/questions/Q3");
});

test("topic: 'J'ai quinze ans ?' -> Q1 (not Q4)", () => {
  assert.equal(qLink(S("J'ai quinze ans ?")).routeId, "#topic/questions/Q1");
});

test("topic: 'Qu'est-ce que tu fais ?' -> Q4", () => {
  assert.equal(qLink(S("Qu'est-ce que tu fais ?")).routeId, "#topic/questions/Q4");
});

test("topic: 'Quelle heure est-il ?' -> Q5", () => {
  assert.equal(qLink(S("Quelle heure est-il ?")).routeId, "#topic/questions/Q5");
});

test("topic: question ending in ?» triggers; question-word chunk triggers", () => {
  assert.ok(qLink(S("« Tu viens ? »")));
  assert.equal(qLink(S("Dis-moi où tu vas.", [C("où", "question-word", "où")])).routeId, "#topic/questions/Q3");
});

test("topic: 'Asseyez-vous.' and 'J'ai un rendez-vous.' -> no questions link", () => {
  assert.equal(qLink(S("Asseyez-vous.", [C("Asseyez", "verb", "s'asseoir", V("s'asseoir", { tense: "imperatif", person: "2p", reflexive: true })), C("vous", "reflexive-pronoun", "se")])), undefined);
  assert.equal(qLink(S("J'ai un rendez-vous.", [C("J'", "pronoun", "je"), C("ai", "verb", "avoir", V("avoir", { person: "1s" })), C("un", "article", "un"), C("rendez-vous", "noun", "rendez-vous")])), undefined);
});

function groundedSentence(french, chunks) {
  return { french, chunks: ground(chunks, french).chunks, grammar: [] };
}

test("topic: 'Nous nous sommes levés tôt.' -> #topic/reflexive/R4", () => {
  const s = groundedSentence("Nous nous sommes levés tôt.", [
    C("Nous", "pronoun", "nous"),
    C("nous", "reflexive-pronoun", "se"),
    C("sommes levés", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1p", regularity: "regular", auxiliary: "être", reflexive: true })),
    C("tôt", "adverb", "tôt"),
  ]);
  assert.deepEqual(rLink(s), {
    kind: "topic",
    topicId: "reflexive",
    lessonId: "R4",
    routeId: "#topic/reflexive/R4",
    label: "Reflexive verbs · R4: Past and future",
    status: "available",
  });
  assert.equal(qLink(s), undefined);
});

test("topic: 'Je ne me lève pas.' -> R3", () => {
  const s = groundedSentence("Je ne me lève pas.", [
    C("Je", "pronoun", "je"),
    C("ne … pas", "negation", "ne pas"),
    C("me", "reflexive-pronoun", "se"),
    C("lève", "verb", "se lever", V("se lever", { person: "1s", regularity: "regular", reflexive: true })),
  ]);
  assert.equal(rLink(s).routeId, "#topic/reflexive/R3");
});

test("topic: 'Je me lève.' -> R2", () => {
  const s = groundedSentence("Je me lève.", [
    C("Je", "pronoun", "je"),
    C("me", "reflexive-pronoun", "se"),
    C("lève", "verb", "se lever", V("se lever", { person: "1s", regularity: "regular", reflexive: true })),
  ]);
  assert.equal(rLink(s).routeId, "#topic/reflexive/R2");
});

test("topic: a grounded pronominal verb triggers even when the model said reflexive:false", () => {
  const s = groundedSentence("Je m'appelle Marie.", [
    C("Je", "pronoun", "je"),
    C("m'", "reflexive-pronoun", "se"),
    C("appelle", "verb", "appeler", V("appeler", { person: "1s", regularity: "regular" })),
    C("Marie", "noun", "Marie"),
  ]);
  assert.equal(rLink(s).routeId, "#topic/reflexive/R2");
  assert.equal(rLink({ french: "Il pleut.", chunks: [], grammar: [{ topic: "reflexive", title: "x", explanation: "y" }] }).lessonId, "R2");
});

test("topic: each topic appears once, sub-lesson from the first triggering sentence", () => {
  const links = topicLinks([S("Je mange."), S("Où vas-tu ?"), S("Qu'est-ce que c'est ?")]);
  assert.deepEqual(links.map((l) => l.routeId), ["#topic/questions/Q3"]);
});

// ---- output hygiene -----------------------------------------------------------------------

test("grounded output has no *Html field and no HTML markup", () => {
  const r = ground([
    C("je", "pronoun", "je"),
    C("me", "reflexive-pronoun", "se"),
    C("suis", "auxiliary", "être"),
    C("levé", "verb", "se lever", V("se lever", { tense: "passe-compose", person: "1s", auxiliary: "avoir", reflexive: true })),
    C("ai allé", "verb", "aller", V("aller", { tense: "passe-compose", auxiliary: "avoir" })),
    C("suis", "verb", "", V("")),
    C("nage", "verb", "nager", V("nager")),
  ]);
  const json = JSON.stringify(r);
  assert.doesNotMatch(json, /Html"/);
  assert.doesNotMatch(json, /<\/?[a-z][^>]*>/i);
  assert.equal(g(r, 5).status, "ambiguous");
  assert.deepEqual(g(r, 5).candidates.map((c) => c.verbId).sort(), ["etre", "suivre"]);
});

test("groundSentence does not mutate its input", () => {
  const chunks = [C("Elle", "pronoun", "elle"), C("est", "auxiliary", "être"), C("arrivée", "verb", "arriver", V("arriver", { tense: "passe-compose" }))];
  const before = JSON.stringify(chunks);
  ground(chunks);
  assert.equal(JSON.stringify(chunks), before);
});
