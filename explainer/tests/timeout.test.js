"use strict";
// Timeout policy (design §4.3 table) and cancellation (§12.1 timeout row).
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { StubProvider, validText } = require("./helpers/stub-provider");
const { request, startServer, testConfig, waitFor } = require("./helpers/http");

const explain = (port, text) => request(port, { method: "POST", path: "/api/explain", json: { text } });

test("no false abort: a normal response returns 200 and the stub's signal is not aborted", async (t) => {
  const stub = new StubProvider();
  const srv = await startServer({ config: testConfig(), provider: stub });
  t.after(() => srv.close());
  const res = await explain(srv.port, "Nous nous sommes levés tôt.");
  assert.equal(res.status, 200, res.body);
  assert.equal(stub.calls.length, 1);
  assert.equal(stub.calls[0].abortedAtReturn, false);
  await new Promise((r) => setTimeout(r, 50)); // after the response is fully sent and the socket idles
  assert.equal(stub.calls[0].signal.aborted, false);
  assert.equal(srv.log.entries.some((e) => e.msg === "client cancelled"), false);
});

test('stub "hang" with modelTimeoutMs 100 on 1 sentence -> 504 MODEL_TIMEOUT within 2 s; signal aborted', async (t) => {
  const stub = new StubProvider({ queue: ["hang"] });
  const srv = await startServer({ config: testConfig((c) => { c.limits.modelTimeoutMs = 100; }), provider: stub });
  t.after(() => srv.close());
  const started = Date.now();
  const res = await explain(srv.port, "Bonjour.");
  assert.ok(Date.now() - started < 2000);
  assert.equal(res.status, 504, res.body);
  assert.equal(res.json.error.code, "MODEL_TIMEOUT");
  assert.equal(stub.calls[0].signal.aborted, true);
});

test("3 sentences, sentence 2 hangs -> 200, sentence 0 ok, 1-2 failed MODEL_TIMEOUT, notice, only 2 calls", async (t) => {
  const stub = new StubProvider({ queue: [{ text: validText() }, "hang", { text: validText() }] });
  const srv = await startServer({ config: testConfig((c) => { c.limits.modelTimeoutMs = 100; }), provider: stub });
  t.after(() => srv.close());
  const res = await explain(srv.port, "Nous nous sommes levés tôt. Il pleut. Elle part.");
  assert.equal(res.status, 200, res.body);
  const s = res.json.sentences;
  assert.equal(s.length, 3);
  assert.equal(s[0].status, "ok");
  for (const i of [1, 2]) {
    assert.equal(s[i].status, "failed");
    assert.deepEqual(s[i].error, { code: "MODEL_TIMEOUT", message: "This sentence took too long and was skipped." });
  }
  assert.ok(res.json.notices.includes("Some sentences took too long and were skipped. Try them on their own."));
  assert.equal(res.json.notices[0], "AI-generated - may contain errors.");
  assert.equal(res.json.translation.natural, "We got up early. […] […]");
  assert.equal(stub.calls.length, 2);
});

test("total deadline (totalTimeoutMs) keeps finished sentences the same way", async (t) => {
  const slowOk = () => new Promise((r) => setTimeout(() => r({ text: validText() }), 80));
  const stub = new StubProvider({ queue: [slowOk, "hang"] });
  const srv = await startServer({
    config: testConfig((c) => { c.limits.modelTimeoutMs = 60000; c.limits.totalTimeoutMs = 300; }),
    provider: stub,
  });
  t.after(() => srv.close());
  const started = Date.now();
  const res = await explain(srv.port, "Nous nous sommes levés tôt. Il pleut.");
  assert.ok(Date.now() - started < 2000);
  assert.equal(res.status, 200, res.body);
  assert.equal(res.json.sentences[0].status, "ok");
  assert.equal(res.json.sentences[1].error.code, "MODEL_TIMEOUT");
  assert.equal(stub.calls[1].signal.aborted, true);
  assert.equal(stub.calls[1].signal.reason.name, "TimeoutError");
});

test("client destroys its socket mid-flight -> stub signal aborted, 'client cancelled' logged, nothing sent", async (t) => {
  const stub = new StubProvider({ queue: ["hang"] });
  const srv = await startServer({ config: testConfig(), provider: stub });
  t.after(() => srv.close());
  let gotResponse = false;
  const req = http.request(
    {
      host: "127.0.0.1", port: srv.port, method: "POST", path: "/api/explain", agent: false,
      headers: { host: `127.0.0.1:${srv.port}`, "content-type": "application/json" },
    },
    () => { gotResponse = true; }
  );
  req.on("error", () => {});
  req.end(JSON.stringify({ text: "Bonjour." }));
  await waitFor(() => stub.calls.length === 1);
  assert.equal(stub.calls[0].signal.aborted, false);
  req.destroy();
  await waitFor(() => stub.calls[0].signal.aborted);
  await waitFor(() => srv.log.entries.some((e) => e.level === "info" && e.msg === "client cancelled"));
  assert.equal(stub.calls[0].signal.reason.code, "CANCELLED");
  assert.equal(gotResponse, false);
  assert.equal(srv.log.entries.filter((e) => e.level === "error").length, 0);
});

test("other provider errors abort the whole request with their own code", async (t) => {
  const { AppError } = require("../lib/errors");
  const stub = new StubProvider({ queue: [{ text: validText() }, { error: new AppError("OLLAMA_UNREACHABLE") }] });
  const srv = await startServer({ config: testConfig(), provider: stub });
  t.after(() => srv.close());
  const res = await explain(srv.port, "Nous nous sommes levés tôt. Il pleut. Elle part.");
  assert.equal(res.status, 503);
  assert.equal(res.json.error.code, "OLLAMA_UNREACHABLE");
  assert.equal(res.json.error.hint, "Start the Ollama app or run: ollama serve");
  assert.equal(stub.calls.length, 2);
  for (const code of ["MODEL_NOT_FOUND", "PROVIDER_ERROR"]) {
    stub.push({ error: new AppError(code) });
    const r = await explain(srv.port, "Bonjour.");
    assert.equal(r.json.error.code, code);
    assert.equal(r.status, new AppError(code).status);
  }
});
