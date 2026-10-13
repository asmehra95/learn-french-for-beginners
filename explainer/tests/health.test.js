"use strict";
// GET /api/health (design §4.4, §12.1 health row) with the real OllamaProvider against a fake Ollama.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { OllamaProvider } = require("../lib/providers/ollama");
const { StubProvider } = require("./helpers/stub-provider");
const { request, startServer, testConfig } = require("./helpers/http");

let fake;
let fakeUrl;
let hits;
let models;
test.before(async () => {
  fake = http.createServer((req, res) => {
    hits.push(req.url);
    const send = (obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
      res.end(body);
    };
    if (req.url === "/api/version") return send({ version: "0.35.1" });
    if (req.url === "/api/tags") return send({ models: models.map((name) => ({ name, model: name })) });
    res.writeHead(404);
    return res.end();
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  fakeUrl = `http://127.0.0.1:${fake.address().port}`;
});
test.after(() => new Promise((r) => fake.close(r)));
test.beforeEach(() => {
  hits = [];
  models = ["mistral:latest"];
});

async function closedPortUrl() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}`;
}

function ollamaServer(url, opts = {}) {
  const config = testConfig((c) => { c.ollama.url = url; });
  return startServer({ config, provider: new OllamaProvider(config.ollama, { modelTimeoutMs: 5000 }), ...opts });
}

test("fake Ollama up -> 200 ready:true with the §4.4 body", async (t) => {
  const srv = await ollamaServer(fakeUrl);
  t.after(() => srv.close());
  const r = await request(srv.port, { path: "/api/health" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, {
    ok: true,
    schemaVersion: "1.0",
    provider: "ollama",
    model: "mistral:latest",
    mode: "local",
    dataLeavesDevice: false,
    ready: true,
    ollama: { reachable: true, version: "0.35.1", modelAvailable: true },
    limits: { maxChars: 2000, maxSentences: 8 },
  });
  assert.equal(r.headers["cache-control"], "no-store");
});

test("model missing -> ready:false with the model hint", async (t) => {
  models = ["llama3:latest"];
  const srv = await ollamaServer(fakeUrl);
  t.after(() => srv.close());
  const r = await request(srv.port, { path: "/api/health" });
  assert.equal(r.status, 200);
  assert.equal(r.json.ready, false);
  assert.equal(r.json.ollama.modelAvailable, false);
  assert.equal(r.json.hint, "Model mistral:latest not found in Ollama.");
});

test("Ollama down -> reachable:false + hint, still HTTP 200", async (t) => {
  const srv = await ollamaServer(await closedPortUrl());
  t.after(() => srv.close());
  const r = await request(srv.port, { path: "/api/health" });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.ready, false);
  assert.deepEqual(r.json.ollama, { reachable: false, version: null, modelAvailable: false });
  assert.equal(r.json.hint, "Start the Ollama app or run: ollama serve");
  assert.doesNotMatch(r.body, /\/Users\/|ECONNREFUSED/);
});

test("cache: two calls within 5 s -> one upstream call; after 5 s a fresh one", async (t) => {
  let clock = 1_000_000;
  const srv = await ollamaServer(fakeUrl, { now: () => clock });
  t.after(() => srv.close());
  await request(srv.port, { path: "/api/health" });
  clock += 4000;
  await request(srv.port, { path: "/api/health" });
  assert.deepEqual(hits, ["/api/version", "/api/tags"]);
  clock += 1500;
  await request(srv.port, { path: "/api/health" });
  assert.equal(hits.filter((h) => h === "/api/version").length, 2);
});

test("cache with a stub provider counts provider.health() calls", async (t) => {
  let clock = 0;
  const stub = new StubProvider();
  const srv = await startServer({ config: testConfig(), provider: stub, now: () => clock });
  t.after(() => srv.close());
  await request(srv.port, { path: "/api/health" });
  await request(srv.port, { path: "/api/health" });
  assert.equal(stub.healthCalls, 1);
  clock += 5000;
  await request(srv.port, { path: "/api/health" });
  assert.equal(stub.healthCalls, 2);
});
