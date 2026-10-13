"use strict";
// Transport-agnostic orchestration (design §3, §7.3, §7.4): split -> provider per sentence (sequential)
// -> local JSON repair -> normalise/validate -> (≤ repairAttempts repair turns) -> ground -> assemble.
// Timer values and the keep-finished-work rule come from the design §4.3 timeout policy table.
const crypto = require("node:crypto");
const { AppError } = require("./errors");
const { prepareInput } = require("./input");
const { buildSystemPrompt, buildUserMessage, buildRepairMessage, buildMessages } = require("./prompt");
const { SENTENCE_SCHEMA, normaliseSentence, validateSentence, POS_LABEL, TENSE_LABEL, PERSON_LABEL, TOPIC_LABEL, ENUMS } =
  require("./schema");
const { repairJson } = require("./json-repair");
const { groundSentence } = require("./grounding");
const { topicLinks } = require("./links");
const { lower } = require("./verb-data");

const SCHEMA_VERSION = "1.0";
const MAX_GRAMMAR_POINTS = 12;
const NOTICE_AI = "AI-generated - may contain errors.";
const NOTICE_TIMEOUT = "Some sentences took too long and were skipped. Try them on their own.";
const NOTICE_INVALID = "The AI's answer for some sentences could not be read. Try them again on their own.";
const SENTENCE_NOTICE_COVERAGE = "Some pieces may not match your sentence exactly.";
const SENTENCE_NOTICE_NO_VERB = "The AI did not mark a verb in this sentence.";
const SENTENCE_TIMEOUT_ERROR = Object.freeze({ code: "MODEL_TIMEOUT", message: "This sentence took too long and was skipped." });
const SENTENCE_INVALID_ERROR = Object.freeze({
  code: "MODEL_OUTPUT_INVALID",
  message: "The AI's answer for this sentence could not be read. Try again.",
});
const FAILED_TEXT = "[…]";
const NOOP_LOG = { error() {}, warn() {}, info() {}, debug() {} };

/** Map an aborted signal's reason to the error the pipeline acts on. */
function abortError(signal) {
  const r = signal.reason;
  if (r instanceof AppError) return r; // CANCELLED from the disconnect handler
  if (r && r.name === "TimeoutError") return new AppError("MODEL_TIMEOUT");
  return new AppError("CANCELLED");
}

function conflictNotice(n) {
  return `The AI and your verb guide disagree on ${n} detail${n === 1 ? "" : "s"}. Your guide is shown.`;
}

function cloudNotice(d) {
  return d.region
    ? `Cloud mode: your text is sent to AWS (${d.region}) for processing.`
    : "Cloud mode: your text is sent to a cloud service for processing.";
}

function groundingOf(chunk) {
  return (chunk.verb && chunk.verb.grounding) || chunk.grounding || null;
}

/** Chunk coverage (§7.3): each piece of a chunk's French must appear in the sentence. */
function markCoverage(chunks, sentence) {
  const hay = lower(sentence);
  let missing = false;
  for (const c of chunks) {
    const parts = String(c.french ?? "")
      .split(/…|\.\.\./)
      .map((p) => lower(p))
      .filter(Boolean);
    if (parts.length === 0 || parts.some((p) => !hay.includes(p))) {
      c.notInSentence = true;
      missing = true;
    }
  }
  return missing;
}

/** Add the server-side labels (never taken from the model) in the §7.4 key order. */
function labelChunk(c) {
  const out = { french: c.french, english: c.english, pos: c.pos, posLabel: POS_LABEL[c.pos] || POS_LABEL.other, lemma: c.lemma };
  if (c.verb) {
    const v = c.verb;
    out.verb = {
      infinitive: v.infinitive,
      tense: v.tense,
      tenseLabel: TENSE_LABEL[v.tense] || TENSE_LABEL.other,
      person: v.person,
      personLabel: PERSON_LABEL[v.person] || v.person,
      regularity: v.regularity,
      auxiliary: v.auxiliary,
      reflexive: v.reflexive,
    };
    if (v.grounding) out.verb.grounding = v.grounding;
  }
  for (const k of Object.keys(c)) {
    if (!(k in out) && k !== "verb") out[k] = c[k]; // grounding, groundedAs, notInSentence
  }
  return out;
}

function labelGrammar(g) {
  const out = { topic: g.topic, topicLabel: TOPIC_LABEL[g.topic] || TOPIC_LABEL.other, title: g.title, explanation: g.explanation };
  if (typeof g.example === "string" && g.example) out.example = g.example;
  return out;
}

/**
 * @param {{provider: object, verbIndex: object, config: object, log?: object, now?: () => number}} deps
 * @returns {{explain(text: string, options?: {literal?: boolean}, ctx?: {signal?: AbortSignal}): Promise<object>}}
 */
function createExplainService({ provider, verbIndex, config, log, now = Date.now }) {
  const lg = { ...NOOP_LOG, ...(log || {}) };
  const system = buildSystemPrompt({ pronunciationKeyText: verbIndex && verbIndex.pronunciationKeyText });
  const { limits } = config;
  const numCtx = config.ollama.numCtx;
  const numPredict = config.ollama.numPredict;

  /** One sentence through §7.3. Returns the ok/failed sentence record; throws provider errors. */
  async function explainSentence(index, sentence, contextText, literal, signal, stats) {
    const user = buildUserMessage(sentence, { context: contextText, literal });
    const maxAttempts = 1 + limits.repairAttempts;
    let attempts = 0;
    let lastText = "";
    let errors = [];
    let value = null;
    while (attempts < maxAttempts) {
      if (signal.aborted) throw abortError(signal);
      const repair = attempts > 0;
      const built = buildMessages({
        system,
        user,
        previousOutput: repair ? lastText : null,
        repairText: repair ? buildRepairMessage(errors) : null,
        numCtx,
        numPredict,
        contextText,
        log: lg,
      });
      attempts++;
      stats.attempts++;
      // Per-call timer (§4.3) applied here too, so every provider gets the same deadline semantics;
      // OllamaProvider also enforces it internally.
      const callSignal = AbortSignal.any([signal, AbortSignal.timeout(limits.modelTimeoutMs)]);
      let r;
      try {
        r = await provider.complete({
          system,
          user: built.messages[1].content,
          messages: built.messages,
          schema: SENTENCE_SCHEMA,
          signal: callSignal,
        });
      } catch (err) {
        if (!(err instanceof AppError) && callSignal.aborted) throw abortError(callSignal);
        throw err;
      }
      stats.modelMs += typeof r.durationMs === "number" && Number.isFinite(r.durationMs) ? r.durationMs : 0;
      lastText = typeof r.text === "string" ? r.text : "";
      lg.debug("model output", { sentence: index, attempt: attempts, head: lastText.slice(0, 200) });
      if (r.doneReason === "length") {
        errors = ["output was cut off"];
        continue;
      }
      const parsed = repairJson(lastText);
      if (!parsed.ok) {
        errors = [parsed.error];
        continue;
      }
      const norm = normaliseSentence(parsed.value);
      const problems = validateSentence(norm.value);
      if (problems.length === 0) {
        value = norm.value;
        break;
      }
      errors = problems;
    }
    if (!value) {
      return { index, status: "failed", french: sentence, error: { ...SENTENCE_INVALID_ERROR }, notices: [], attempts, repaired: false };
    }

    const notices = [];
    if (markCoverage(value.chunks, sentence)) notices.push(SENTENCE_NOTICE_COVERAGE);
    if (!value.chunks.some((c) => c.pos === "verb")) notices.push(SENTENCE_NOTICE_NO_VERB);
    const grounded = groundSentence({ french: sentence, chunks: value.chunks, sentenceIndex: index }, verbIndex);
    return {
      index,
      status: "ok",
      french: sentence,
      english: value.english,
      literal: literal ? value.literal : null,
      pronunciation: { text: value.pronunciation, approximate: true, source: "ai" },
      cefr: value.cefr,
      cefrNote: value.cefrNote,
      chunks: grounded.chunks.map(labelChunk),
      grammar: (value.grammar || []).map(labelGrammar),
      notices,
      attempts,
      repaired: attempts > 1,
      _verbs: grounded.verbs,
      _unknownVerbs: grounded.unknownVerbs,
      _rawGrammar: value.grammar || [],
    };
  }

  function assemble(input, literal, sentences, stats, started, timedOut) {
    const d = provider.describe();
    const ok = sentences.filter((s) => s.status === "ok");

    const natural = sentences.map((s) => (s.status === "ok" ? s.english : FAILED_TEXT)).join(" ");
    const lit = literal ? sentences.map((s) => (s.status === "ok" ? s.literal || s.english : FAILED_TEXT)).join(" ") : null;

    const rank = (lvl) => ENUMS.CEFR.indexOf(lvl);
    const top = ok.reduce((best, s) => (best && rank(best.cefr) >= rank(s.cefr) ? best : s), null);
    const confidence = d.cefrConfidence ?? "low";
    const prefix = confidence === "low"
      ? "Estimated by a small AI model; treat it as a rough guide."
      : "Estimated by the AI model; treat it as a guide.";

    const grammarPoints = [];
    const seen = new Map();
    for (const s of ok) {
      for (const g of s.grammar) {
        const k = `${g.topic}\u0000${String(g.title).toLowerCase()}`;
        if (seen.has(k)) {
          const gp = seen.get(k);
          if (!gp.sentenceIndexes.includes(s.index)) gp.sentenceIndexes.push(s.index);
          continue;
        }
        if (grammarPoints.length >= MAX_GRAMMAR_POINTS) continue;
        const gp = { ...g, sentenceIndexes: [s.index] };
        seen.set(k, gp);
        grammarPoints.push(gp);
      }
    }

    const verbs = [];
    const byVerb = new Map();
    for (const s of ok) {
      for (const occ of s._verbs) {
        let v = byVerb.get(occ.verbId);
        if (!v) {
          v = {
            verbId: occ.verbId, infinitive: occ.infinitive, meaning: occ.meaning, badges: occ.badges,
            typeDetail: occ.typeDetail, auxiliary: occ.auxiliary, pronunciation: occ.pronunciation,
            occurrences: [], links: occ.links, disagreementCount: 0,
          };
          byVerb.set(occ.verbId, v);
          verbs.push(v);
        }
        v.occurrences.push({ sentenceIndex: s.index, chunkIndex: occ.chunkIndex, french: occ.french });
        v.disagreementCount += occ.disagreementCount;
      }
    }
    const unknownVerbs = ok.flatMap((s) => s._unknownVerbs.map((u) => ({ ...u, sentenceIndex: s.index })));
    const links = topicLinks(ok.map((s) => ({ french: s.french, chunks: s.chunks, grammar: s._rawGrammar })));

    let conflicts = 0;
    for (const s of ok) {
      for (const c of s.chunks) {
        const g = groundingOf(c);
        if (g && Array.isArray(g.disagreements)) conflicts += g.disagreements.filter((x) => x.severity === "conflict").length;
      }
    }
    const notices = [NOTICE_AI];
    if (d.dataLeavesDevice) notices.push(cloudNotice(d));
    if (timedOut) notices.push(NOTICE_TIMEOUT);
    if (sentences.some((s) => s.status === "failed" && s.error.code === "MODEL_OUTPUT_INVALID")) notices.push(NOTICE_INVALID);
    if (conflicts > 0) notices.push(conflictNotice(conflicts));

    const providerInfo = { id: d.provider, model: d.model, mode: d.mode, dataLeavesDevice: d.dataLeavesDevice };
    if (d.region) providerInfo.region = d.region;

    const publicSentences = sentences.map((s) => {
      const { _verbs, _unknownVerbs, _rawGrammar, ...rest } = s;
      return rest;
    });

    return {
      schemaVersion: SCHEMA_VERSION,
      id: crypto.randomUUID(),
      createdAt: new Date(now()).toISOString(),
      input: { text: input.text, charCount: input.charCount, sentenceCount: input.sentences.length },
      provider: providerInfo,
      translation: { natural, literal: lit },
      cefr: {
        level: top ? top.cefr : null,
        confidence,
        note: top && top.cefrNote ? `${prefix} ${top.cefrNote}` : prefix,
      },
      sentences: publicSentences,
      grammarPoints,
      verbs,
      unknownVerbs,
      topicLinks: links,
      notices,
      timing: {
        totalMs: Math.max(0, Math.round(now() - started)),
        modelMs: Math.round(stats.modelMs),
        attempts: stats.attempts,
        repairs: sentences.reduce((n, s) => n + Math.max(0, (s.attempts || 0) - 1), 0),
      },
    };
  }

  /**
   * @param {string} text  raw text (normalised and validated here as well)
   * @param {{literal?: boolean}} [options]
   * @param {{signal?: AbortSignal}} [ctx]  caller signal (client disconnect -> AppError CANCELLED)
   */
  async function explain(text, options, { signal } = {}) {
    const started = now();
    const input = prepareInput(text, options, limits);
    const literal = input.options.literal;
    const total = AbortSignal.timeout(limits.totalTimeoutMs);
    const runSignal = signal ? AbortSignal.any([signal, total]) : total;
    const contextText = input.sentences.length > 1 ? input.text : null;
    const stats = { attempts: 0, modelMs: 0 };
    const results = [];
    let timedOut = false;

    for (let k = 0; k < input.sentences.length; k++) {
      const sentence = input.sentences[k];
      if (timedOut) {
        results.push({ index: k, status: "failed", french: sentence, error: { ...SENTENCE_TIMEOUT_ERROR }, notices: [], attempts: 0, repaired: false });
        continue;
      }
      try {
        results.push(await explainSentence(k, sentence, contextText, literal, runSignal, stats));
      } catch (err) {
        if (err instanceof AppError && err.code === "MODEL_TIMEOUT") {
          // Keep finished work: this sentence and every later one are marked skipped (§4.3).
          lg.warn("model timeout", { code: "MODEL_TIMEOUT", sentence: k });
          timedOut = true;
          results.push({ index: k, status: "failed", french: sentence, error: { ...SENTENCE_TIMEOUT_ERROR }, notices: [], attempts: 0, repaired: false });
          continue;
        }
        throw err; // CANCELLED (silent), OLLAMA_UNREACHABLE, MODEL_NOT_FOUND, PROVIDER_* abort the request
      }
    }

    if (!results.some((s) => s.status === "ok")) {
      if (timedOut) throw new AppError("MODEL_TIMEOUT");
      lg.warn("all sentences invalid", { code: "MODEL_OUTPUT_INVALID" });
      throw new AppError("MODEL_OUTPUT_INVALID");
    }
    return assemble(input, literal, results, stats, started, timedOut);
  }

  return { explain, systemPrompt: system };
}

module.exports = {
  createExplainService,
  SCHEMA_VERSION,
  NOTICE_AI,
  NOTICE_TIMEOUT,
  NOTICE_INVALID,
  SENTENCE_NOTICE_COVERAGE,
  SENTENCE_NOTICE_NO_VERB,
};
