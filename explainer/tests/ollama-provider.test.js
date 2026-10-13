"use strict";
// OllamaProvider against a fake Ollama (node:http on an ephemeral loopback port). No real Ollama needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { OllamaProvider } = require("../lib/providers/ollama");
const { AppError } = require("../lib/errors");
const { SENTENCE_SCHEMA } = require("../lib/schema");

const OLLAMA_CFG = {
  model: "mistral:latest", temperature: 0.1, numCtx: 8192, numPredict: 1800, keepAlive: "10m",
};
const OK_ENVELOPE = {
  model: "mistral:latest",
  message: { role: "assistant", content: '{"english":"Hi."}' },
  done: true, done_reason: "stop", eval_count: 12, total_duration: 2500000000,
};

let server;
let baseUrl;
let handler;
const requests = [];

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function makeLog() {
  const entries = [];
  const rec = (level) => (msg, meta) => entries.push({ level, msg, meta });
  return { entries, error: rec("error"), warn: rec("warn"), info: rec("info"), debug: rec("debug") };
}

function provider(extra = {}, opts = {}) {
  return new OllamaProvider({ ...OLLAMA_CFG, url: baseUrl, ...extra }, { modelTimeoutMs: 5000, ...opts });
}

const call = (p, signal) => p.complete({ system: "SYS", user: "USER", schema: SENTENCE_SCHEMA, signal });

async function rejectsWith(promise, code) {
  let caught;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `expected ${code}, got success`);
  assert.ok(caught instanceof AppError, `expected AppError, got ${caught && caught.stack}`);
  assert.equal(caught.code, code);
  return caught;
}

async function closedPortUrl() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}`;
}

test.before(async () => {
  server = http.createServer(async (req, res) => {
    const raw = await readBody(req);
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    requests.push({ method: req.method, url: req.url, body });
    handler(req, res, body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

test.beforeEach(() => {
  requests.length = 0;
  handler = (req, res) => sendJson(res, 200, OK_ENVELOPE);
});

test("request body shape and result mapping", async () => {
  const p = provider();
  const r = await call(p);
  assert.deepEqual(r, { text: '{"english":"Hi."}', doneReason: "stop", evalCount: 12, durationMs: 2500 });
  assert.equal(requests.length, 1);
  const { method, url, body } = requests[0];
  assert.equal(method, "POST");
  assert.equal(url, "/api/chat");
  assert.equal(body.model, "mistral:latest");
  assert.equal(body.stream, false);
  assert.equal(typeof body.format, "object");
  assert.deepEqual(body.format, JSON.parse(JSON.stringify(SENTENCE_SCHEMA)));
  assert.equal(body.keep_alive, "10m");
  assert.equal(body.options.temperature, 0.1);
  assert.equal(body.options.top_p, 0.9);
  assert.equal(body.options.num_ctx, 8192);
  assert.equal(body.options.num_predict, 1800);
  assert.equal("seed" in body.options, false);
  assert.deepEqual(body.messages, [
    { role: "system", content: "SYS" },
    { role: "user", content: "USER" },
  ]);
});

test("seed is sent only when configured; explicit messages win over system/user", async () => {
  const p = provider({ seed: 42 });
  const messages = [
    { role: "system", content: "S" }, { role: "user", content: "U" },
    { role: "assistant", content: "{bad" }, { role: "user", content: "fix it" },
  ];
  await p.complete({ messages, schema: SENTENCE_SCHEMA });
  assert.equal(requests[0].body.options.seed, 42);
  assert.deepEqual(requests[0].body.messages, messages);
});

test("describe() reports local mode and low CEFR confidence", () => {
  assert.deepEqual(provider().describe(), {
    provider: "ollama", model: "mistral:latest", mode: "local", dataLeavesDevice: false, cefrConfidence: "low",
  });
});

test("connection refused (closed port) -> OLLAMA_UNREACHABLE with cause ECONNREFUSED", async () => {
  const log = makeLog();
  const p = new OllamaProvider({ ...OLLAMA_CFG, url: await closedPortUrl() }, { modelTimeoutMs: 5000, log });
  const err = await rejectsWith(call(p), "OLLAMA_UNREACHABLE");
  assert.equal(err.causeCode, "ECONNREFUSED");
  assert.equal(err.cause.cause.code, "ECONNREFUSED");
  assert.ok(log.entries.some((e) => e.level === "warn" && e.meta && e.meta.cause === "ECONNREFUSED"));
});

test("socket destroyed mid-response -> OLLAMA_UNREACHABLE", async () => {
  handler = (req, res) => {
    res.writeHead(200, { "content-type": "application/json", "content-length": "5000" });
    res.write('{"message": {"content": "');
    setTimeout(() => res.socket.destroy(), 20);
  };
  await rejectsWith(call(provider()), "OLLAMA_UNREACHABLE");
});

test("caller abort -> CANCELLED", async () => {
  handler = () => {}; // hang
  const ac = new AbortController();
  setTimeout(() => ac.abort(new AppError("CANCELLED")), 50);
  await rejectsWith(call(provider(), ac.signal), "CANCELLED");

  const ac2 = new AbortController();
  setTimeout(() => ac2.abort(), 50); // plain AbortError reason
  await rejectsWith(call(provider(), ac2.signal), "CANCELLED");
});

test("per-call timeout -> MODEL_TIMEOUT", async () => {
  handler = () => {}; // hang
  const started = Date.now();
  await rejectsWith(call(provider({}, { modelTimeoutMs: 100 })), "MODEL_TIMEOUT");
  assert.ok(Date.now() - started < 2000);
});

test("caller deadline (total timeout signal) -> MODEL_TIMEOUT", async () => {
  handler = () => {}; // hang
  await rejectsWith(call(provider(), AbortSignal.timeout(100)), "MODEL_TIMEOUT");
});

test("404 model not found -> MODEL_NOT_FOUND", async () => {
  handler = (req, res) => sendJson(res, 404, { error: "model 'mistral:latest' not found" });
  const err = await rejectsWith(call(provider()), "MODEL_NOT_FOUND");
  assert.equal(err.status, 503);
  assert.match(err.message, /mistral:latest/);
});

test("500 -> PROVIDER_ERROR; 2xx with a bad envelope -> PROVIDER_ERROR", async () => {
  handler = (req, res) => sendJson(res, 500, { error: "llama runner crashed" });
  const err = await rejectsWith(call(provider()), "PROVIDER_ERROR");
  assert.equal(err.message.includes("crashed"), false);

  handler = (req, res) => sendJson(res, 200, { done: true });
  await rejectsWith(call(provider()), "PROVIDER_ERROR");

  handler = (req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("not json");
  };
  await rejectsWith(call(provider()), "PROVIDER_ERROR");
});

test("400 mentioning format -> one retry with format 'json', schema in system prompt, sticky downgrade", async () => {
  handler = (req, res, body) => {
    if (typeof body.format === "object") sendJson(res, 400, { error: "invalid format: expected \"json\" or a JSON schema" });
    else sendJson(res, 200, OK_ENVELOPE);
  };
  const log = makeLog();
  const p = provider({}, { log });
  const r = await call(p);
  assert.equal(r.text, '{"english":"Hi."}');
  assert.equal(requests.length, 2);
  assert.equal(typeof requests[0].body.format, "object");
  assert.equal(requests[1].body.format, "json");
  const sys = requests[1].body.messages[0];
  assert.equal(sys.role, "system");
  assert.ok(sys.content.startsWith("SYS"));
  assert.ok(sys.content.includes('"additionalProperties":false'));

  await call(p); // sticky: goes straight to format "json"
  assert.equal(requests.length, 3);
  assert.equal(requests[2].body.format, "json");
  assert.equal(log.entries.filter((e) => e.level === "warn").length, 1);
});

test("400 not about format -> PROVIDER_ERROR without retry", async () => {
  handler = (req, res) => sendJson(res, 400, { error: "invalid options" });
  await rejectsWith(call(provider()), "PROVIDER_ERROR");
  assert.equal(requests.length, 1);
});

test("health(): reachable with the model -> ready", async () => {
  handler = (req, res) => {
    if (req.url === "/api/version") sendJson(res, 200, { version: "0.35.1" });
    else if (req.url === "/api/tags") sendJson(res, 200, { models: [{ name: "mistral:latest", model: "mistral:latest" }] });
    else sendJson(res, 404, { error: "nope" });
  };
  assert.deepEqual(await provider().health(), { reachable: true, version: "0.35.1", modelAvailable: true, ready: true });
  // "mistral" configured, "mistral:latest" listed (and vice versa) both count.
  assert.equal((await provider({ model: "mistral" }).health()).ready, true);
  handler = (req, res) => {
    if (req.url === "/api/version") sendJson(res, 200, { version: "0.35.1" });
    else sendJson(res, 200, { models: [{ name: "mistral" }] });
  };
  assert.equal((await provider().health()).ready, true);
});

test("health(): model missing -> modelAvailable false with hint", async () => {
  handler = (req, res) => {
    if (req.url === "/api/version") sendJson(res, 200, { version: "0.35.1" });
    else sendJson(res, 200, { models: [{ name: "llama3:latest" }, { name: "mistral-nemo:latest" }] });
  };
  assert.deepEqual(await provider().health(), {
    reachable: true, version: "0.35.1", modelAvailable: false, ready: false,
    hint: "Model mistral:latest not found in Ollama.",
  });
});

test("health(): Ollama down -> reachable false with hint (no throw)", async () => {
  const p = new OllamaProvider({ ...OLLAMA_CFG, url: await closedPortUrl() });
  assert.deepEqual(await p.health(), {
    reachable: false, version: null, modelAvailable: false, ready: false,
    hint: "Start the Ollama app or run: ollama serve",
  });
});
