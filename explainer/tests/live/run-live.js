"use strict";
// Live model test (design §12.2): real server + real Ollama provider (mistral:latest, seed 42) on an
// ephemeral port. Posts the 6 required inputs plus the "j'ai allé" learner-error input one at a time and
// writes live-results.json and live-results.md to the agent artifacts folder (or to --out <dir>). Spot-check failures are recorded, not hidden: the
// script exits 0 once every request has completed (2 = Ollama not ready, 1 = runner error).
// Not matched by the npm test glob; run with `npm run test:live`.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { loadConfig } = require("../../lib/config");
const { loadVerbData } = require("../../lib/verb-data");
const { createProvider } = require("../../lib/providers");
const { createServer, createLogger } = require("../../server");

const DEFAULT_OUT_DIR = path.join(__dirname, '..', '..', '..', 'live-results');

/** `--out <dir>` (or `--out=<dir>`) picks the output folder; default unchanged. */
function outDir(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) return path.resolve(argv[i + 1]);
    if (argv[i].startsWith("--out=") && argv[i].length > 6) return path.resolve(argv[i].slice(6));
  }
  return DEFAULT_OUT_DIR;
}
const OUT_DIR = outDir(process.argv.slice(2));
const JSON_OUT = path.join(OUT_DIR, "live-results.json");
const MD_OUT = path.join(OUT_DIR, "live-results.md");
// Client timer per input. The server's own total deadline is limits.totalTimeoutMs (300 s); this is
// kept above it so the server's 504/partial answer is seen. Raise both together (review NIT 2).
const PER_INPUT_MS = 330000;

// Input 1 deliberately differs from the system prompt's few-shot ("Je m'appelle Marie.") so it measures
// generalisation rather than copying (review iteration 1, NIT 3).
const INPUTS = [
  "Tu t'appelles Léa.",
  "Est-ce que tu viens ce soir ?",
  "Nous nous sommes levés tôt.",
  "Je ne parle pas espagnol.",
  "Elle est arrivée hier soir.",
  "Je m'appelle Paul. J'habite à Lyon avec ma sœur. Le week-end, nous allons au marché.",
  // Learner error (integration plan D10): avoir with an être verb must be flagged.
  "Hier, j'ai allé au cinéma.",
];

function request(port, { method = "GET", path: p = "/", json, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const payload = json === undefined ? undefined : JSON.stringify(json);
    const headers = { host: `127.0.0.1:${port}` };
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers, agent: false }, (res) => {
      const parts = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => {
        const text = Buffer.concat(parts).toString("utf8");
        let body;
        try {
          body = text ? JSON.parse(text) : undefined;
        } catch {
          body = undefined;
        }
        resolve({ status: res.statusCode, body, text });
      });
      res.on("error", reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`client timer: no response after ${timeoutMs} ms`)));
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// ---- extraction helpers ---------------------------------------------------------------------------

function groundingOf(chunk) {
  return (chunk.verb && chunk.verb.grounding) || chunk.grounding || null;
}

function groundedChunks(body) {
  const out = [];
  for (const s of body.sentences || []) {
    (s.chunks || []).forEach((c, ci) => {
      const g = groundingOf(c);
      if (!g) return;
      out.push({
        sentenceIndex: s.index,
        chunkIndex: ci,
        french: c.french,
        pos: c.pos,
        lemma: c.lemma,
        status: g.status,
        verbId: g.verbId ?? null,
        badges: g.badges ?? null,
        auxiliary: g.auxiliary ?? null,
        auxFromForm: g.auxFromForm ?? null,
        guidePronunciation: g.guidePronunciation ?? null,
        intoChunk: g.intoChunk ?? null,
        candidates: g.candidates ? g.candidates.map((x) => x.verbId) : undefined,
        disagreements: (g.disagreements || []).map((d) => ({ field: d.field, severity: d.severity, message: d.message })),
      });
    });
  }
  return out;
}

function grammarItems(body) {
  const items = [];
  for (const s of body.sentences || []) for (const g of s.grammar || []) items.push({ sentenceIndex: s.index, ...g });
  return items;
}

const grammarText = (g) => `${g.title || ""} ${g.explanation || ""} ${g.example || ""}`;
const findChunk = (gc, id) => gc.find((g) => g.verbId === id && (g.status === "matched" || g.status === "matched-by-form"));
const hasBadge = (g, b) => !!g && Array.isArray(g.badges) && g.badges.includes(b);
const hasTopicLink = (body, prefix) => (body.topicLinks || []).some((l) => String(l.routeId).startsWith(prefix));
const natural = (body) => (body.translation && body.translation.natural) || "";

function spotChecks(i, res) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: !!pass, ...(detail !== undefined ? { detail } : {}) });
  add("HTTP 200", res.status === 200, String(res.status));
  if (res.status !== 200 || !res.body) return checks;
  const b = res.body;
  const gc = groundedChunks(b);
  const gr = grammarItems(b);
  const nat = natural(b);
  if (i === 0) {
    add("translation mentions 'Your name is Léa' / 'You are called Léa'", /your name is l[ée]a|you are called l[ée]a|you're called l[ée]a/i.test(nat), nat);
    const g = findChunk(gc, "s-appeler");
    add("s-appeler grounded with badges [Regular (spelling change), Reflexive]",
      g && JSON.stringify(g.badges) === JSON.stringify(["Regular (spelling change)", "Reflexive"]), g ? g.badges : "not grounded");
    add("guide pronunciation is the phrase 'tew tah-pel' (of: phrase)",
      g && g.guidePronunciation && g.guidePronunciation.text === "tew tah-pel" && g.guidePronunciation.of === "phrase",
      g ? g.guidePronunciation : null);
    add("#topic/reflexive link", hasTopicLink(b, "#topic/reflexive"));
    add("grammar point on elision or reflexive",
      gr.some((x) => x.topic === "elision" || x.topic === "reflexive" || /elision|elide|reflexive/i.test(grammarText(x))),
      gr.map((x) => x.topic));
  } else if (i === 1) {
    add("translation ≈ 'Are you coming tonight/this evening?'", /are you coming (tonight|this evening)/i.test(nat), nat);
    const g = findChunk(gc, "venir");
    add("venir grounded, Irregular", hasBadge(g, "Irregular"), g ? g.badges : "not grounded");
    add("#topic/questions link", hasTopicLink(b, "#topic/questions"));
    add("question grammar point", gr.some((x) => x.topic === "question"), gr.map((x) => x.topic));
  } else if (i === 2) {
    add("translation ≈ 'We got up early'", /we (got|get) up early|we rose early/i.test(nat), nat);
    const g = findChunk(gc, "se-lever");
    add("se-lever grounded, Reflexive, auxiliary être", hasBadge(g, "Reflexive") && g.auxiliary === "être",
      g ? { badges: g.badges, auxiliary: g.auxiliary } : "not grounded");
    add("agreement or reflexive grammar point",
      gr.some((x) => x.topic === "agreement" || x.topic === "reflexive"), gr.map((x) => x.topic));
  } else if (i === 3) {
    add("translation ≈ 'I don't speak Spanish'", /i (don't|do not|don’t) speak spanish/i.test(nat), nat);
    const g = findChunk(gc, "parler");
    add("parler grounded, Regular", hasBadge(g, "Regular"), g ? g.badges : "not grounded");
    const negChunk = (b.sentences || []).some((s) => (s.chunks || []).some((c) => c.pos === "negation"));
    add("negation chunk or grammar point", negChunk || gr.some((x) => x.topic === "negation"),
      { negationChunk: negChunk, topics: gr.map((x) => x.topic) });
  } else if (i === 4) {
    add("translation ≈ 'She arrived last night/yesterday evening'", /she arrived (last night|yesterday evening|last evening)/i.test(nat), nat);
    const g = findChunk(gc, "arriver");
    add("arriver grounded, auxiliary être, auxFromForm être", g && g.auxiliary === "être" && g.auxFromForm === "être",
      g ? { auxiliary: g.auxiliary, auxFromForm: g.auxFromForm, french: g.french } : "not grounded");
    add("verbs[] does not list être", !(b.verbs || []).some((v) => v.verbId === "etre"), (b.verbs || []).map((v) => v.verbId));
    const agr = gr.filter((x) => x.topic === "agreement" || /agree/i.test(grammarText(x)));
    add("agreement point mentions the extra -e",
      agr.some((x) => /-e\b|extra\s*["'‘’]?e\b|added?\s*["'‘’]?e\b|an\s*["'‘’]e["'‘’]|feminine/i.test(grammarText(x))),
      agr.map((x) => grammarText(x)));
  } else if (i === 5) {
    const ok = (b.sentences || []).filter((s) => s.status === "ok").length;
    add("3 sentences ok", (b.sentences || []).length === 3 && ok === 3, `${ok}/${(b.sentences || []).length}`);
    const ga = findChunk(gc, "s-appeler");
    const gh = findChunk(gc, "habiter");
    const gl = findChunk(gc, "aller");
    add("s-appeler grounded", !!ga);
    add("habiter grounded, Regular", hasBadge(gh, "Regular"), gh ? gh.badges : "not grounded");
    add("aller grounded, Irregular", hasBadge(gl, "Irregular"), gl ? gl.badges : "not grounded");
    const parts = nat.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
    add("natural translation is 3 English sentences", parts.length === 3, nat);
  } else if (i === 6) {
    const flags = gc.filter((g) => g.verbId === "aller")
      .flatMap((g) => g.disagreements.filter((d) => d.field === "auxiliary-in-sentence"));
    add("auxiliary-in-sentence disagreement present for aller", flags.length > 0,
      flags.length ? flags.map((d) => `${d.severity}: ${d.message}`) : gc.map((g) => `${g.french}:${g.status}${g.verbId ? `:${g.verbId}` : ""}`));
  }
  return checks;
}

function auxShape(body) {
  // Input 5 (§8.3 step 0): did the model return "est arrivée" as one chunk, or split "est" out?
  const s = (body.sentences || [])[0];
  if (!s || s.status !== "ok") return null;
  const merged = (s.chunks || []).find((c) => c.grounding && c.grounding.status === "merged");
  if (merged) return { shape: "split-aux-merged", auxChunk: merged.french, intoChunk: merged.grounding.intoChunk };
  const v = (s.chunks || []).find((c) => /arriv/i.test(c.french || ""));
  if (v && /\best\b/i.test(v.french)) return { shape: "single-chunk", chunk: v.french };
  return { shape: "other", chunks: (s.chunks || []).map((c) => `${c.french}:${c.pos}`) };
}

function median(xs) {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

// ---- markdown -------------------------------------------------------------------------------------

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function toMarkdown(report) {
  const a = report.aggregates;
  const L = [];
  L.push("# Live model results (mistral:latest)", "");
  L.push(`Run: ${report.startedAt} → ${report.finishedAt}. Model ${report.model}, seed ${report.seed}, Ollama ${report.ollamaVersion}.`, "");
  L.push("| # | Input | HTTP | Latency (s) | Attempts | Repairs | Sentences | Natural translation | Grounded verbs | Spot checks |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  report.results.forEach((r, i) => {
    const verbs = (r.groundedVerbs || [])
      .filter((g) => g.verbId)
      .map((g) => `${g.verbId} [${(g.badges || []).join(", ")}]${g.auxiliary ? ` aux ${g.auxiliary}` : ""}${g.auxFromForm ? ` (form ${g.auxFromForm})` : ""}`)
      .join("; ");
    const passed = r.spotChecks.filter((c) => c.pass).length;
    L.push(`| ${i + 1} | ${cell(r.input)} | ${r.status} | ${(r.latencyMs / 1000).toFixed(1)} | ${r.attempts ?? ""} | ${r.repairs ?? ""} | ${cell((r.sentenceStatuses || []).join(", "))} | ${cell(r.translation && r.translation.natural)} | ${cell(verbs)} | ${passed}/${r.spotChecks.length} |`);
  });
  L.push("", "## Aggregates", "");
  L.push(`- JSON valid on first try: ${a.validFirstTry}/${a.inputs} inputs (${a.sentencesValidFirstTry}/${a.sentences} sentences)`);
  L.push(`- Valid after repair: ${a.validAfterRepair} sentence(s)`);
  L.push(`- Failed: ${a.failedSentences} sentence(s); inputs with all sentences ok: ${a.allOkInputs}/${a.inputs}; HTTP 200: ${a.http200}/${a.inputs}`);
  L.push(`- Latency per input: median ${(a.medianLatencyMs / 1000).toFixed(1)} s, max ${(a.maxLatencyMs / 1000).toFixed(1)} s; per sentence: median ${(a.medianPerSentenceMs / 1000).toFixed(1)} s, max ${(a.maxPerSentenceMs / 1000).toFixed(1)} s`);
  L.push(`- Inputs over 120 s: ${a.over120s.length ? a.over120s.join(", ") : "none"}`);
  L.push(`- Spot checks passed: ${a.spotChecksPassed}/${a.spotChecksTotal}`);
  L.push(`- Done rule (§12.2: all 200, ≥ ${a.inputs - 1}/${a.inputs} all-ok): ${a.doneRuleMet ? "met" : "NOT met"}`);
  L.push("", "## Spot checks", "");
  report.results.forEach((r, i) => {
    L.push(`### ${i + 1}. ${r.input}`, "");
    for (const c of r.spotChecks) {
      const d = c.detail === undefined ? "" : ` (${cell(typeof c.detail === "string" ? c.detail : JSON.stringify(c.detail))})`;
      L.push(`- ${c.pass ? "PASS" : "FAIL"}: ${c.name}${d}`);
    }
    if (r.auxShape) L.push(`- Auxiliary shape: ${JSON.stringify(r.auxShape)}`);
    if (r.disagreements && r.disagreements.length) L.push(`- Disagreements: ${r.disagreements.map((d) => `${d.field}/${d.severity}: ${d.message}`).join("; ")}`);
    if (r.topicLinks && r.topicLinks.length) L.push(`- Topic links: ${r.topicLinks.map((t) => t.routeId).join(", ")}`);
    if (r.translation && r.translation.literal) L.push(`- Literal: ${r.translation.literal}`);
    if (r.grammar && r.grammar.length) L.push(`- Grammar: ${r.grammar.map((g) => `[${g.topic}] ${g.title}`).join("; ")}`);
    if (r.error) L.push(`- Error: ${r.error}`);
    L.push("");
  });
  return L.join("\n");
}

// ---- main -----------------------------------------------------------------------------------------

async function main() {
  const config = loadConfig({ env: { ...process.env, EXPLAINER_SEED: "42" }, file: null });
  config.port = 0;
  const log = createLogger(process.env.EXPLAINER_LOG_LEVEL || "info");
  const verbIndex = loadVerbData();
  const provider = createProvider(config, { log });
  const server = createServer(config, { provider, verbIndex, log });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });

  try {
    const health = await request(port, { path: "/api/health" });
    if (health.status !== 200 || !health.body || health.body.ready !== true) {
      console.error(`Ollama is not ready (${health.text}). Start Ollama and make sure ${config.ollama.model} is installed, then rerun. Not a test failure.`);
      await close();
      process.exit(2);
    }
    const report = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      model: health.body.model,
      seed: config.ollama.seed,
      ollamaVersion: health.body.ollama && health.body.ollama.version,
      perInputTimerMs: PER_INPUT_MS,
      serverTotalTimeoutMs: config.limits.totalTimeoutMs,
      results: [],
      aggregates: null,
    };
    for (let i = 0; i < INPUTS.length; i++) {
      const text = INPUTS[i];
      console.log(`[live] ${i + 1}/${INPUTS.length} ${text}`);
      const t0 = Date.now();
      let res;
      let error = null;
      try {
        res = await request(port, { method: "POST", path: "/api/explain", json: { text }, timeoutMs: PER_INPUT_MS });
      } catch (err) {
        error = err.message;
        res = { status: 0, body: null };
      }
      const latencyMs = Date.now() - t0;
      const b = res.status === 200 ? res.body : null;
      const entry = {
        input: text,
        status: res.status,
        latencyMs,
        error: error || (res.status !== 200 && res.body && res.body.error ? `${res.body.error.code}: ${res.body.error.message}` : null),
      };
      if (b) {
        entry.attempts = b.timing.attempts;
        entry.repairs = b.timing.repairs;
        entry.modelMs = b.timing.modelMs;
        entry.sentenceCount = b.sentences.length;
        entry.sentenceStatuses = b.sentences.map((s) => s.status);
        entry.sentences = b.sentences.map((s) => ({
          index: s.index,
          status: s.status,
          french: s.french,
          english: s.english,
          literal: s.literal,
          pronunciation: s.pronunciation && s.pronunciation.text,
          cefr: s.cefr,
          attempts: s.attempts,
          repaired: s.repaired,
          error: s.error,
          chunks: (s.chunks || []).map((c) => ({ french: c.french, english: c.english, pos: c.pos, lemma: c.lemma, tense: c.verb && c.verb.tense })),
        }));
        entry.translation = b.translation;
        entry.cefr = b.cefr;
        entry.groundedVerbs = groundedChunks(b);
        entry.verbs = (b.verbs || []).map((v) => ({ verbId: v.verbId, badges: v.badges, auxiliary: v.auxiliary, occurrences: v.occurrences.map((o) => o.french) }));
        entry.unknownVerbs = b.unknownVerbs;
        entry.disagreements = entry.groundedVerbs.flatMap((g) => g.disagreements.map((d) => ({ verbId: g.verbId, ...d })));
        entry.topicLinks = b.topicLinks;
        entry.grammar = grammarItems(b).map((g) => ({ sentenceIndex: g.sentenceIndex, topic: g.topic, title: g.title, explanation: g.explanation, example: g.example }));
        entry.notices = b.notices;
        if (i === 4) entry.auxShape = auxShape(b);
        if (i === 6) entry.auxShape = { chunks: ((b.sentences || [])[0] && b.sentences[0].chunks || []).map((c) => `${c.french}:${c.pos}`) };
      }
      entry.spotChecks = spotChecks(i, res);
      report.results.push(entry);
      console.log(`[live]   -> ${res.status} in ${(latencyMs / 1000).toFixed(1)} s; checks ${entry.spotChecks.filter((c) => c.pass).length}/${entry.spotChecks.length}`);
    }
    report.finishedAt = new Date().toISOString();

    const rs = report.results;
    const ok200 = rs.filter((r) => r.status === 200);
    const allSent = ok200.flatMap((r) => r.sentences);
    const lat = rs.map((r) => r.latencyMs);
    const perSentence = ok200.map((r) => r.latencyMs / Math.max(1, r.sentenceCount));
    const all = rs.flatMap((r) => r.spotChecks);
    const allOkInputs = ok200.filter((r) => r.sentenceStatuses.every((s) => s === "ok")).length;
    report.aggregates = {
      inputs: rs.length,
      http200: ok200.length,
      sentences: allSent.length,
      validFirstTry: ok200.filter((r) => r.sentences.every((s) => s.status === "ok" && s.attempts === 1)).length,
      sentencesValidFirstTry: allSent.filter((s) => s.status === "ok" && s.attempts === 1).length,
      validAfterRepair: allSent.filter((s) => s.status === "ok" && s.repaired).length,
      failedSentences: allSent.filter((s) => s.status !== "ok").length,
      allOkInputs,
      medianLatencyMs: median(lat),
      maxLatencyMs: Math.max(...lat),
      medianPerSentenceMs: Math.round(median(perSentence) || 0),
      maxPerSentenceMs: Math.round(perSentence.length ? Math.max(...perSentence) : 0),
      over120s: rs.map((r, i) => (r.latencyMs > 120000 ? `#${i + 1} (${(r.latencyMs / 1000).toFixed(1)} s)` : null)).filter(Boolean),
      spotChecksPassed: all.filter((c) => c.pass).length,
      spotChecksTotal: all.length,
      doneRuleMet: ok200.length === rs.length && allOkInputs >= rs.length - 1,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(MD_OUT, toMarkdown(report) + "\n");
    console.log(`[live] wrote ${JSON_OUT}`);
    console.log(`[live] wrote ${MD_OUT}`);
    console.log(`[live] aggregates ${JSON.stringify(report.aggregates)}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(`[live] runner error: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
