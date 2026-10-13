"use strict";
// Test-only server for the headless UI check (design §12.3): the real createServer() + real verb data,
// with a stub provider that returns canned, schema-valid answers. server.js can never load this file.
//
// Canned input (2 sentences): "Je suis content. Ils sont allés au marché."
//   sentence 1: être (Irregular), and an English gloss carrying an HTML payload that must render as text;
//   sentence 2: "sont" (auxiliary, merged) + "allés" (aller, Irregular, être) + preposition + noun.
const { createServer } = require("../../server");
const { loadConfig } = require("../../lib/config");
const { loadVerbData } = require("../../lib/verb-data");
const { StubProvider } = require("../helpers/stub-provider");

const INPUT = "Je suis content. Ils sont allés au marché.";
const XSS = "<img src=x onerror=alert(1)>";

const ANSWERS = {
  "Je suis content.": {
    english: "I am happy.",
    literal: "I am content.",
    pronunciation: "zhuh swee kohN-tahN",
    cefr: "A1",
    cefrNote: "A short present-tense sentence with être.",
    chunks: [
      { french: "Je", english: "I", pos: "pronoun", lemma: "je" },
      {
        french: "suis", english: "am", pos: "verb", lemma: "être",
        verb: { infinitive: "être", tense: "present", person: "1s", regularity: "irregular", auxiliary: "none", reflexive: false },
      },
      { french: "content", english: `happy ${XSS}`, pos: "adjective", lemma: "content" },
    ],
    grammar: [
      {
        topic: "agreement", title: "content agrees with je",
        explanation: "Adjectives agree with the subject. A woman would say contente.",
        example: "Elle est contente.",
      },
    ],
  },
  "Ils sont allés au marché.": {
    english: "They went to the market.",
    literal: "They are gone to the market.",
    pronunciation: "eel sohN tah-lay oh mar-shay",
    cefr: "A2",
    cefrNote: "Passé composé with être.",
    chunks: [
      { french: "Ils", english: "they", pos: "pronoun", lemma: "ils" },
      { french: "sont", english: "are (helper)", pos: "auxiliary", lemma: "être" },
      {
        french: "allés", english: "gone", pos: "verb", lemma: "aller",
        verb: { infinitive: "aller", tense: "passe-compose", person: "3p", regularity: "irregular", auxiliary: "être", reflexive: false },
      },
      { french: "au", english: "to the", pos: "preposition", lemma: "à" },
      { french: "marché", english: "market", pos: "noun", lemma: "marché" },
    ],
    grammar: [
      {
        topic: "tense", title: "aller uses être in the passé composé",
        explanation: "Verbs of movement like aller build the past with être, and the participle agrees: allés.",
        example: "Elles sont allées au marché.",
      },
    ],
  },
};

function answerFor(call) {
  const m = /<french_text>([\s\S]*?)<\/french_text>/.exec(call.user || "");
  const sentence = m ? m[1].trim() : "";
  const a = ANSWERS[sentence] || ANSWERS["Je suis content."];
  return { text: JSON.stringify(a) };
}

let server = null;

/** Start on 127.0.0.1:<ephemeral>. @returns {Promise<{port: number, url: string}>} */
async function start() {
  const config = loadConfig({ env: {}, file: null });
  config.port = 0;
  config.rateLimit.explainBurst = 1000;
  config.rateLimit.explainPerMinute = 1000;
  config.rateLimit.healthPerMinute = 1000;
  const provider = new StubProvider({
    fallback: answerFor,
    describe: { provider: "stub", model: "mistral:latest", mode: "local", dataLeavesDevice: false },
  });
  const quiet = { error() {}, warn() {}, info() {}, debug() {} };
  server = createServer(config, { provider, verbIndex: loadVerbData(), log: quiet });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return { port, url: `http://127.0.0.1:${port}/` };
}

async function stop() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise((resolve) => {
    s.close(() => resolve());
    s.closeAllConnections();
  });
}

module.exports = { start, stop, INPUT, XSS };
