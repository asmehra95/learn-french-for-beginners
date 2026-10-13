"use strict";
// Route ids for lessons and topics (design §8.7). Topic routes carry status "available": the Verb
// Trainer resolves #topic/<topicId>[/<lessonId>] as an alias of its #topics/... route.

// Topic and sub-lesson ids/titles are copied from
// .agents/content-expansion/staged-data/topics-data.js (TOPICS_DATA.topics), which is not
// copied into explainer/. Re-check these constants if that file changes.
const TOPICS = Object.freeze({
  questions: Object.freeze({
    title: "Asking questions",
    label: "Asking questions",
    lessons: Object.freeze({
      Q1: "Yes/no questions three ways",
      Q2: "Noun subjects, negative questions and answering",
      Q3: "Where, when, how, how many, why",
      Q4: "Who and what: qui, que, qu'est-ce que, quoi",
      Q5: "Which: quel, quelle, quels, quelles (and lequel)",
      Q6: "Putting it all together (+ indirect questions preview)",
    }),
  }),
  reflexive: Object.freeze({
    title: "Reflexive (pronominal) verbs",
    label: "Reflexive verbs",
    lessons: Object.freeze({
      R1: "What pronominal verbs are + the pronouns",
      R2: "The daily-routine verbs (present tense)",
      R3: "Negatives and questions",
      R4: "Past and future",
      R5: "The imperative (commands)",
      R6: '"Each other" + reflexive or not?',
    }),
  }),
});

/** Verb lesson link: {kind, routeId, label}. */
function verbLink(record) {
  return {
    kind: "verb",
    routeId: `#browse/lesson/${record.lesson}/${record.id}`,
    label: `Lesson ${record.lesson}: ${record.lessonTitle} · ${record.infinitive}`,
  };
}

// Token matching only (never substrings or \b, which is ASCII-only in JS). Tokens keep accents.
const qTokens = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2019\u02bc]/g, "'")
    .split(/[^\p{L}']+/u)
    .flatMap((t) => {
      const m = t.match(/^(\p{L}+')(.+)$/u);
      return m ? [m[1], m[2]] : [t];
    })
    .filter(Boolean);

const Q4_WORDS = new Set(["qui", "quoi"]);
const Q5_WORDS = new Set(["quel", "quelle", "quels", "quelles", "lequel", "laquelle", "lesquels", "lesquelles"]);
const Q3_WORDS = new Set(["où", "quand", "comment", "combien", "pourquoi"]);
const R4_TENSES = new Set(["passe-compose", "plus-que-parfait", "futur-simple", "futur-proche"]);

function hasSequence(tokens, seq) {
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    if (seq.every((w, j) => tokens[i + j] === w)) return true;
  }
  return false;
}

const chunksOf = (s) => (Array.isArray(s && s.chunks) ? s.chunks : []);
const grammarOf = (s) => (Array.isArray(s && s.grammar) ? s.grammar : []);
const groundingOf = (c) => (c && c.verb && c.verb.grounding) || (c && c.grounding) || null;

function isQuestion(sentence, tokens) {
  const french = String(sentence.french ?? "").trim();
  if (/\?\s*[»")]?$/.test(french)) return true;
  if (hasSequence(tokens, ["est", "ce", "que"]) || hasSequence(tokens, ["est", "ce", "qu'"])) return true;
  if (chunksOf(sentence).some((c) => c && c.pos === "question-word")) return true;
  return grammarOf(sentence).some((g) => g && g.topic === "question");
}

function questionLesson(tokens) {
  if (
    hasSequence(tokens, ["qu'", "est", "ce", "que"]) ||
    hasSequence(tokens, ["qu'", "est", "ce", "qu'"]) ||
    tokens.some((t) => Q4_WORDS.has(t)) ||
    tokens[0] === "que" ||
    tokens[0] === "qu'"
  ) {
    return "Q4";
  }
  if (tokens.some((t) => Q5_WORDS.has(t))) return "Q5";
  if (tokens.some((t) => Q3_WORDS.has(t))) return "Q3";
  return "Q1";
}

function isReflexiveVerbChunk(c) {
  if (!c || c.pos !== "verb") return false;
  if (c.verb && c.verb.reflexive === true) return true;
  const g = groundingOf(c);
  return !!(g && Array.isArray(g.badges) && g.badges.includes("Reflexive"));
}

/** The verb chunks the reflexive sub-lesson is judged on. */
function reflexiveVerbChunks(chunks) {
  const direct = chunks.filter(isReflexiveVerbChunk);
  if (direct.length) return direct;
  const r = chunks.findIndex((c) => c && c.pos === "reflexive-pronoun");
  if (r === -1) return [];
  const next = chunks.slice(r + 1).find((c) => c && c.pos === "verb");
  return next ? [next] : [];
}

function isReflexive(sentence) {
  const chunks = chunksOf(sentence);
  if (chunks.some((c) => c && (c.pos === "reflexive-pronoun" || isReflexiveVerbChunk(c)))) return true;
  if (chunks.some((c) => c && c.verb && c.verb.reflexive === true)) return true;
  return grammarOf(sentence).some((g) => g && g.topic === "reflexive");
}

function reflexiveLesson(sentence, questionTriggered) {
  const chunks = chunksOf(sentence);
  if (reflexiveVerbChunks(chunks).some((c) => c.verb && R4_TENSES.has(c.verb.tense))) return "R4";
  if (questionTriggered || chunks.some((c) => c && c.pos === "negation")) return "R3";
  return "R2";
}

function topicLink(topicId, lessonId) {
  const t = TOPICS[topicId];
  return {
    kind: "topic",
    topicId,
    lessonId,
    routeId: `#topic/${topicId}/${lessonId}`,
    label: `${t.label} · ${lessonId}: ${t.lessons[lessonId]}`,
    status: "available",
  };
}

/**
 * Topic links for a list of sentences ({french, chunks (grounded or not), grammar}).
 * Each topic appears at most once; its sub-lesson comes from the first triggering sentence.
 */
function topicLinks(sentences) {
  const found = new Map();
  for (const s of Array.isArray(sentences) ? sentences : []) {
    if (!s) continue;
    const tokens = qTokens(s.french);
    const question = isQuestion(s, tokens);
    if (question && !found.has("questions")) found.set("questions", topicLink("questions", questionLesson(tokens)));
    if (!found.has("reflexive") && isReflexive(s)) found.set("reflexive", topicLink("reflexive", reflexiveLesson(s, question)));
  }
  return ["questions", "reflexive"].filter((t) => found.has(t)).map((t) => found.get(t));
}

module.exports = { verbLink, topicLinks, qTokens, TOPICS };
