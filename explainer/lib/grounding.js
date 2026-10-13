"use strict";
// Grounds the model's verb chunks against the learner's verb guide (design §8.3-§8.6).
// Authoritative infinitive, badges, meaning, auxiliary and pronunciation always come from
// the data, never from the model. All output strings are plain text (no *Html fields).

const { key, slug, lower } = require("./verb-data");
const { verbLink } = require("./links");

// Dual-auxiliary verbs present in the data (§8.5): avoir with a direct object, être otherwise.
const DUAL_AUX_EXAMPLE = Object.freeze({
  passer: "j'ai passé un examen",
  monter: "j'ai monté les valises",
  descendre: "j'ai descendu l'escalier",
  sortir: "j'ai sorti la poubelle",
  rentrer: "j'ai rentré la voiture",
});

// Pronouns and negation particles dropped before form lookup (§8.3 step 3), plus de/d' for passé récent.
const DROP = new Set([
  "je", "j'", "me", "m'", "te", "t'", "se", "s'", "nous", "vous", "il", "elle", "on", "ils", "elles",
  "ne", "n'", "pas", "plus", "jamais", "rien", "de", "d'",
]);
const SKIP_FOR_AUX_MERGE = new Set(["negation", "reflexive-pronoun", "adverb"]);
const COMPOUND_TENSES = new Set(["passe-compose", "plus-que-parfait"]);
const PERIPHRASTIC_TENSES = new Set(["futur-proche", "passe-recent"]);
// "Did you mean …?" for avoir used with an être verb (integration plan D10): per subject, the être form,
// the reflexive pronoun (pronominal verbs) and the participle agreement ending.
const ETRE_PAST = Object.freeze({
  je: { aux: "suis", refl: "me ", agree: "(e)" },
  tu: { aux: "es", refl: "t'", agree: "(e)" },
  il: { aux: "est", refl: "s'", agree: "" },
  elle: { aux: "est", refl: "s'", agree: "e" },
  on: { aux: "est", refl: "s'", agree: "" },
  nous: { aux: "sommes", refl: "nous ", agree: "(e)s" },
  vous: { aux: "êtes", refl: "vous ", agree: "(e)(s)" },
  ils: { aux: "sont", refl: "se ", agree: "s" },
  elles: { aux: "sont", refl: "se ", agree: "es" },
});
const PERSON_TEXT = Object.freeze({ "1s": "1s (je)", "2s": "2s (tu)", "3s": "3s (il/elle)", "1p": "1p (nous)", "2p": "2p (vous)", "3p": "3p (ils/elles)" });

/** Join chunks: no space after an elided word ("j'" + "ai" -> "j'ai"), one space otherwise. */
const joinChunks = (parts) =>
  parts.filter(Boolean).reduce((s, p) => (s === "" ? p : /'$/.test(s) ? s + p : s + " " + p), "");

function splitElision(t) {
  const out = [];
  let rest = t;
  let m;
  while ((m = /^([^']+')(.+)$/.exec(rest))) {
    out.push(m[1]);
    rest = m[2];
  }
  out.push(rest);
  return out;
}

/** Lowercase NFC tokens, elisions split, surrounding punctuation trimmed, pronouns/negation dropped. */
function tokenise(text) {
  return lower(text)
    .split(" ")
    .map((t) => t.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, ""))
    .filter(Boolean)
    .flatMap(splitElision)
    .filter((t) => t && !DROP.has(t));
}

const lookup = (map, t) => map.get(t) || map.get(key(t)) || null;

function auxOf(index, t) {
  if (t === "à") return null;
  return index.auxForms.get(t) || index.auxForms.get(key(t)) || null;
}

function presentFormSet(index, ids) {
  const s = new Set();
  for (const id of ids) {
    const rec = index.byId.get(id);
    if (!rec) continue;
    for (const r of rec.present) {
      s.add(lower(r.form));
      s.add(key(r.form));
    }
  }
  return s;
}

/** §8.3 step 3: auxiliary detection, periphrastic drop, candidate form ids. */
function analyseForms(index, text, tense) {
  const tokens = tokenise(text);
  let auxFromForm = null;
  let candidates = tokens;
  let formIds = new Set();

  let auxAt = -1;
  let partAt = -1;
  for (let i = 0; i < tokens.length && auxAt === -1; i++) {
    if (!auxOf(index, tokens[i])) continue;
    for (let j = i + 1; j < tokens.length; j++) {
      if (lookup(index.participles, tokens[j])) {
        auxAt = i;
        partAt = j;
        break;
      }
    }
  }

  if (auxAt !== -1) {
    auxFromForm = auxOf(index, tokens[auxAt]);
    candidates = tokens.filter((_, i) => i !== auxAt);
    formIds = new Set(lookup(index.participles, tokens[partAt]));
  } else {
    const goForms = presentFormSet(index, ["aller", "venir"]);
    if (
      candidates.length >= 2 &&
      goForms.has(candidates[0]) &&
      (PERIPHRASTIC_TENSES.has(tense) || candidates.slice(1).some((t) => index.infinitiveWords.has(t) || index.infinitiveWords.has(key(t))))
    ) {
      candidates = candidates.slice(1);
    }
    for (const c of candidates) for (const id of lookup(index.byForm, c) || []) formIds.add(id);
  }
  return { tokens, candidates, auxFromForm, formIds };
}

const REFLEXIVE_PREFIX = /^(se\s+|s')/;
const REFLEXIVE_CLITIC = /(^|\s)(me|te|se)\s|(^|\s)[mts]'/u;

/** §8.3 steps 1-2: model lemma, reflexive hint, lemma lookup. */
function lemmaLookup(index, L, reflexive) {
  const base = lower(L).replace(REFLEXIVE_PREFIX, "");
  if (!base) return null;
  const plain = () => index.byLemma.get(slug(base));
  const refl = () => index.byLemma.get(slug("se " + base)) || index.byLemma.get(slug("s'" + base));
  return reflexive ? refl() || plain() || null : plain() || refl() || null;
}

const infinitivesOf = (index, ids) => [...ids].map((id) => index.byId.get(id).infinitive);
const orList = (xs) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1]);

/** §8.4 */
function badgesFor(index, rec) {
  const b = [rec.badgeLabel];
  if (rec.pronominal) b.push(index.pronominalLabel);
  return b;
}

/**
 * The passé composé with être for this subject ("elle" + aller -> "elle est allée"), or the guide's
 * past phrase (rec.pastFrench, "je suis allé(e)") when there is no recognised subject pronoun.
 */
function etreSuggestion(rec, subject) {
  const s = lower(subject || "");
  const p = ETRE_PAST[s === "j'" ? "je" : s];
  if (!p || !rec.participle) return rec.pastFrench;
  const who = s === "j'" ? "je" : s;
  // Participles ending in s/x take no extra plural s (assis -> assises, not assiss).
  const agree = /[sx]$/.test(rec.participle) ? p.agree.replace(/\(e\)s$/, "(es)").replace(/^s$/, "") : p.agree;
  return `${who} ${rec.pronominal ? p.refl : ""}${p.aux} ${rec.participle}${agree}`;
}

/** §8.5 field checks. */
function fieldChecks(index, rec, verb, ctx) {
  const out = [];
  const isRegular = rec.category === "regular" || rec.category === "regular-spelling-change";
  if (verb && (verb.regularity === "regular" || verb.regularity === "irregular")) {
    if ((verb.regularity === "regular") !== isRegular) {
      out.push({
        field: "regularity",
        model: verb.regularity,
        guide: rec.badgeLabel,
        severity: "conflict",
        message: `The AI said ${verb.regularity}; your guide says ${rec.badgeLabel}.`,
      });
    }
  }

  const tense = verb ? verb.tense : undefined;
  if (COMPOUND_TENSES.has(tense) || ctx.auxFromForm) {
    const expected = rec.auxiliary;
    const dual = Object.prototype.hasOwnProperty.call(DUAL_AUX_EXAMPLE, rec.id);
    // The guide only has the reflexive form of some verbs (s'arrêter, se lever …). Without a reflexive
    // pronoun in the sentence, "j'ai arrêté" / "il a promené" is the ordinary verb with avoir: correct.
    const plainUse = rec.pronominal && expected === "être" && !ctx.reflexiveInSentence;
    const dualMessage = dual
      ? `${rec.infinitive} uses avoir when it has a direct object (${DUAL_AUX_EXAMPLE[rec.id]}) and être otherwise.`
      : plainUse
        ? `Your guide only has the reflexive verb ${rec.infinitive}, which takes être. Without the reflexive pronoun, ${lower(rec.infinitive).replace(REFLEXIVE_PREFIX, "")} is an ordinary verb that takes avoir, so avoir is right here.`
        : null;
    if (ctx.auxFromForm && ctx.auxFromForm !== expected) {
      out.push({
        field: "auxiliary-in-sentence",
        model: ctx.auxFromForm,
        guide: expected,
        severity: dualMessage ? "info" : "conflict",
        message:
          dualMessage ||
          (ctx.auxFromForm === "avoir" && expected === "être"
            ? `Your sentence uses avoir, but ${rec.infinitive} takes être in the passé composé. Did you mean ${etreSuggestion(rec, ctx.subject)}?`
            : `Your sentence uses ${ctx.auxFromForm}, but ${rec.infinitive} takes ${expected} in the past (${rec.pastFrench.replace(/\(e\)/g, "")}).`),
      });
    }
    // plainUse: the sentence note above already says avoir is right; don't repeat it for the AI's avoir.
    const saidAlready = plainUse && out.some((d) => d.field === "auxiliary-in-sentence");
    if (verb && (verb.auxiliary === "avoir" || verb.auxiliary === "être") && verb.auxiliary !== expected && !saidAlready) {
      out.push({
        field: "auxiliary",
        model: verb.auxiliary,
        guide: expected,
        severity: dualMessage ? "info" : "conflict",
        message: dualMessage || `The AI said ${verb.auxiliary}; your guide says ${expected}.`,
      });
    }
  }

  if (verb && tense === "present" && verb.person && verb.person !== "none") {
    const cands = new Set(ctx.candidates.flatMap((c) => [c, key(c)]));
    const rows = rec.present.filter((r) => cands.has(lower(r.form)) || cands.has(key(r.form)));
    if (rows.length && !rows.some((r) => r.person === verb.person)) {
      out.push({
        field: "person",
        model: verb.person,
        guide: rows.map((r) => r.person).join(", "),
        severity: "info",
        message: `Your guide lists '${rows[0].form}' as ${orList(rows.map((r) => PERSON_TEXT[r.person] || r.person))}.`,
      });
    }
  }

  if (verb && verb.reflexive === true && !rec.pronominal) {
    out.push({
      field: "reflexive",
      model: "reflexive",
      guide: "not reflexive",
      severity: "info",
      message: "Your guide has this verb without se.",
    });
  }
  return out;
}

/** §8.6: find subject / reflexive pronoun before verb chunk i (skipping negation and merged helpers). */
function phraseParts(chunks, i, auxIdx) {
  let k = i - 1;
  const skip = () => {
    while (k >= 0) {
      const c = chunks[k];
      if (!c) break;
      if (c.pos === "negation" || k === auxIdx || (auxIdx !== -1 && k > auxIdx && c.pos === "adverb")) k--;
      else break;
    }
  };
  skip();
  let refl = null;
  if (k >= 0 && chunks[k] && chunks[k].pos === "reflexive-pronoun") {
    refl = chunks[k].french;
    k--;
    skip();
  }
  const subject = k >= 0 && chunks[k] && chunks[k].pos === "pronoun" ? chunks[k].french : null;
  return { subject, refl };
}

function pickVariant(pronunciation, variant) {
  if (variant === null || variant === undefined) return pronunciation;
  const words = pronunciation.split(/\s+/);
  if (!words[0] || !words[0].includes("/")) return pronunciation;
  const parts = words[0].split("/");
  words[0] = parts[variant] ?? parts[0];
  return words.join(" ");
}

function guidePronunciation(index, rec, chunks, i, auxPrefix, auxIdx) {
  const verbText = chunks[i].french;
  const { subject, refl } = phraseParts(chunks, i, auxIdx);
  const candidates = [[subject, refl, auxPrefix, verbText]];
  if (refl) candidates.push([refl, auxPrefix, verbText]);
  if (auxPrefix) candidates.push([auxPrefix, verbText]);
  candidates.push([verbText]);
  const speak = joinChunks(candidates[0]);
  for (const parts of candidates) {
    const entries = index.phrases.get(key(joinChunks(parts))) || [];
    const hit = entries.find((e) => e.id === rec.id);
    if (hit) {
      return {
        text: pickVariant(hit.pronunciation, hit.variant),
        of: "phrase",
        label: `${hit.text} (from your guide)`,
        speak,
      };
    }
  }
  return { text: rec.pronunciation, of: "infinitive", label: `${rec.infinitive} (from your guide)`, speak };
}

/** Ground one verb chunk (§8.3 steps 1-5). */
function groundVerb(index, chunks, i, auxPrefix, auxIdx) {
  const chunk = chunks[i];
  const verb = chunk.verb && typeof chunk.verb === "object" ? chunk.verb : null;
  const L = String((verb && verb.infinitive) || chunk.lemma || "").trim();

  let prev = null;
  for (let k = i - 1; k >= 0; k--) {
    const c = chunks[k];
    if (!c || c.pos === "negation" || c.pos === "auxiliary" || k === auxIdx) continue;
    prev = c;
    break;
  }
  const reflexive = (verb && verb.reflexive === true) || REFLEXIVE_PREFIX.test(lower(L)) || (prev && prev.pos === "reflexive-pronoun");

  const lemmaId = lemmaLookup(index, L, reflexive);
  const text = auxPrefix ? joinChunks([auxPrefix, chunk.french]) : chunk.french;
  const forms = analyseForms(index, text, verb ? verb.tense : undefined);
  const { formIds } = forms;
  const formChecked = formIds.size > 0;
  const formText = forms.candidates.join(" ") || lower(text);

  let status;
  let id = null;
  const disagreements = [];
  if (lemmaId) {
    status = "matched";
    id = lemmaId;
    if (formIds.size && !formIds.has(lemmaId)) {
      disagreements.push({
        field: "lemma",
        model: L,
        guide: orList(infinitivesOf(index, formIds)),
        severity: "conflict",
        message: `The AI says this comes from ${L}; your guide lists '${formText}' under ${orList(infinitivesOf(index, formIds))}.`,
      });
    }
  } else if (formIds.size === 1) {
    status = "matched-by-form";
    id = [...formIds][0];
    const inf = index.byId.get(id).infinitive;
    disagreements.push({
      field: "lemma",
      model: L,
      guide: inf,
      severity: "conflict",
      message: L
        ? `The AI gave '${L}' as the infinitive; your guide matches this form to ${inf}.`
        : `The AI gave no infinitive; your guide matches this form to ${inf}.`,
    });
  } else if (formIds.size > 1) {
    return {
      grounding: {
        status: "ambiguous",
        candidates: [...formIds].map((v) => ({ verbId: v, infinitive: index.byId.get(v).infinitive })),
        formChecked,
        disagreements: [],
      },
    };
  } else {
    return {
      grounding: { status: "not-in-guide", formChecked, disagreements: [] },
      unknown: { lemma: L, french: text },
    };
  }

  const rec = index.byId.get(id);
  const { subject, refl } = phraseParts(chunks, i, auxIdx);
  // Sentence evidence only (not the model's reflexive flag): a reflexive-pronoun chunk before the verb
  // or a reflexive clitic inside the chunk text ("m'ai levé", "me suis levé").
  const reflexiveInSentence = !!refl || (prev && prev.pos === "reflexive-pronoun") || REFLEXIVE_CLITIC.test(lower(text));
  disagreements.push(...fieldChecks(index, rec, verb, { ...forms, subject, reflexiveInSentence }));
  const links = [verbLink(rec)];
  const badges = badgesFor(index, rec);
  const grounding = {
    status,
    verbId: rec.id,
    infinitive: rec.infinitive,
    meaning: rec.meaning,
    badges,
    typeDetail: rec.typeDetail,
    auxiliary: rec.auxiliary,
    participle: rec.participle,
    auxFromForm: forms.auxFromForm,
    formChecked,
    guidePronunciation: guidePronunciation(index, rec, chunks, i, auxPrefix, auxIdx),
    links,
    disagreements,
  };
  const occurrence = {
    verbId: rec.id,
    infinitive: rec.infinitive,
    meaning: rec.meaning,
    badges: badges.slice(),
    typeDetail: rec.typeDetail,
    auxiliary: rec.auxiliary,
    pronunciation: rec.pronunciation,
    links: links.map((l) => ({ ...l })),
    chunkIndex: i,
    french: text,
    disagreementCount: disagreements.length,
  };
  return { grounding, occurrence };
}

/**
 * Ground one sentence's chunks against the verb index.
 * @param {{french: string, chunks: object[], sentenceIndex?: number}} sentence (normalised model chunks)
 * @param {object} verbIndex from loadVerbData()
 * @returns {{chunks: object[], verbs: object[], unknownVerbs: object[]}} new objects; input is not mutated.
 *   Grounding lives on chunk.verb.grounding when the chunk has a verb object, else on chunk.grounding.
 *   A merged auxiliary chunk always carries chunk.grounding = {status: "merged", intoChunk}, whatever its pos.
 */
function groundSentence(sentence, verbIndex) {
  const src = Array.isArray(sentence && sentence.chunks) ? sentence.chunks : [];
  const chunks = src.map((c) => ({ ...c, ...(c && c.verb ? { verb: { ...c.verb } } : {}) }));
  const sentenceIndex = Number.isInteger(sentence && sentence.sentenceIndex) ? sentence.sentenceIndex : undefined;
  const verbs = [];
  const unknownVerbs = [];

  // Step 0: auxiliary merge. A chunk tagged auxiliary merges into the next verb chunk. Whatever pos
  // the model gave, a chunk that is a single present form of être/avoir followed by a single
  // participle chunk is that participle's auxiliary (the model often tags `sommes`/`est` as verb),
  // but only when that form agrees with the participle's guide auxiliary (dual-aux verbs take
  // either). Otherwise it is être + adjective ("Je suis perdu.") and the copula stays grounded.
  const auxPrefix = new Map(); // verb chunk index -> {text, auxIdx}
  const groundAsVerb = new Set();
  const merged = new Set();
  const tokenOf = (ch) => {
    const t = ch && typeof ch.french === "string" ? tokenise(ch.french) : [];
    return t.length === 1 ? t[0] : null;
  };
  const agreesWithGuide = (aux, ids) =>
    [...ids].some((id) => {
      const rec = verbIndex.byId.get(id);
      return rec && (rec.auxiliary === aux || Object.prototype.hasOwnProperty.call(DUAL_AUX_EXAMPLE, id));
    });
  chunks.forEach((c, i) => {
    if (!c || auxPrefix.has(i)) return;
    const tagged = c.pos === "auxiliary";
    const auxTok = tokenOf(c);
    const auxForm = auxTok ? auxOf(verbIndex, auxTok) : null;
    if (!tagged && !auxForm) return;
    let j = i + 1;
    while (j < chunks.length && chunks[j] && SKIP_FOR_AUX_MERGE.has(chunks[j].pos)) j++;
    const next = j < chunks.length ? chunks[j] : null;
    const partTok = auxForm ? tokenOf(next) : null;
    const partIds = partTok ? lookup(verbIndex.participles, partTok) : null;
    const designShape = tagged && next && next.pos === "verb";
    const crossPos = !designShape && !!partIds && agreesWithGuide(auxForm, partIds);
    // Learner error "j'ai allé": a verb-tagged avoir form before the participle of a verb that only
    // takes être. Merge it so the auxiliary-in-sentence check can flag it. Never fires for être, so
    // être + participle-adjective ("Je suis perdu.") is unaffected; dual-auxiliary verbs use crossPos.
    // Pronominal-only guide entries (s'arrêter, se lever …) need a reflexive pronoun in the sentence,
    // between the aux and the participle or just before the aux ("je m'ai levé"); without one,
    // "j'ai arrêté de fumer" is the ordinary verb with avoir and is correct.
    let back = i - 1;
    while (back >= 0 && chunks[back] && chunks[back].pos === "negation") back--;
    const reflNearAux =
      (back >= 0 && !!chunks[back] && chunks[back].pos === "reflexive-pronoun") ||
      chunks.slice(i + 1, j).some((x) => x && x.pos === "reflexive-pronoun");
    const learnerAux =
      !designShape && !crossPos && c.pos === "verb" && auxForm === "avoir" && !!partIds && !!next &&
      (next.pos === "verb" || next.pos === "adjective") &&
      [...partIds].every((id) => {
        const rec = verbIndex.byId.get(id);
        return rec && rec.auxiliary === "être" && !Object.prototype.hasOwnProperty.call(DUAL_AUX_EXAMPLE, id) &&
          (!rec.pronominal || reflNearAux);
      });
    if (designShape || crossPos || learnerAux) {
      auxPrefix.set(j, { text: c.french, auxIdx: i });
      merged.add(i);
      c.grounding = { status: "merged", intoChunk: j };
      if (next.pos !== "verb") groundAsVerb.add(j);
    } else if (tagged) {
      groundAsVerb.add(i);
    }
  });

  chunks.forEach((c, i) => {
    if (!c || merged.has(i)) return;
    const asVerb = groundAsVerb.has(i);
    if (c.pos !== "verb" && !asVerb) return;
    const aux = auxPrefix.get(i);
    const r = groundVerb(verbIndex, chunks, i, aux ? aux.text : null, aux ? aux.auxIdx : -1);
    if (asVerb) c.groundedAs = "verb";
    if (c.verb) c.verb.grounding = r.grounding;
    else c.grounding = r.grounding;
    const where = sentenceIndex === undefined ? {} : { sentenceIndex };
    if (r.occurrence) verbs.push({ ...where, ...r.occurrence });
    if (r.unknown) unknownVerbs.push({ lemma: r.unknown.lemma, french: r.unknown.french, ...where, chunkIndex: i });
  });

  return { chunks, verbs, unknownVerbs };
}

module.exports = { groundSentence, joinChunks, tokenise, DUAL_AUX_EXAMPLE };
