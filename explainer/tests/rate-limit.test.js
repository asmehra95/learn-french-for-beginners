"use strict";
// Token buckets + single-flight (design §5.3, §12.1 rate-limit row). This file keeps the real limits.
const test = require("node:test");
const assert = require("node:assert/strict");
const { StubProvider } = require("./helpers/stub-provider");
const { request, startServer, testConfig, waitFor } = require("./helpers/http");
const { createBucket } = require("../lib/rate-limit");

const realLimits = (mutate) => testConfig((c) => {
  c.rateLimit.explainBurst = 3;
  c.rateLimit.explainPerMinute = 10;
  c.rateLimit.healthPerMinute = 60;
  if (mutate) mutate(c);
});
const explain = (port) => request(port, { method: "POST", path: "/api/explain", json: { text: "Bonjour." } });

test("burst 3 then the 4th -> 429 RATE_LIMITED with integer Retry-After; +6 s allows one more", async (t) => {
  let clock = 1_000_000;
  const srv = await startServer({ config: realLimits(), provider: new StubProvider(), now: () => clock });
  t.after(() => srv.close());
  for (let i = 0; i < 3; i++) assert.equal((await explain(srv.port)).status, 200);
  const limited = await explain(srv.port);
  assert.equal(limited.status, 429);
  assert.equal(limited.json.error.code, "RATE_LIMITED");
  assert.match(limited.headers["retry-after"], /^\d+$/);
  assert.equal(Number(limited.headers["retry-after"]), 6); // 10/min refill = 1 token per 6 s
  clock += 6000;
  assert.equal((await explain(srv.port)).status, 200);
  assert.equal((await explain(srv.port)).status, 429);
});

test("two concurrent explains -> second gets 429 BUSY with Retry-After 5", async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const stub = new StubProvider({ queue: [async () => { await gate; return { text: require("./helpers/stub-provider").validText() }; }] });
  const srv = await startServer({ config: realLimits(), provider: stub });
  t.after(() => srv.close());
  const first = explain(srv.port);
  await waitFor(() => stub.calls.length === 1);
  const second = await explain(srv.port);
  assert.equal(second.status, 429);
  assert.equal(second.json.error.code, "BUSY");
  assert.equal(second.headers["retry-after"], "5");
  release();
  assert.equal((await first).status, 200);
  assert.equal((await explain(srv.port)).status, 200); // guard released
});

test("a hanging explain holds the guard; cancelling it releases the guard", async (t) => {
  const stub = new StubProvider({ queue: ["hang"] });
  const srv = await startServer({ config: realLimits(), provider: stub });
  t.after(() => srv.close());
  const http = require("node:http");
  const req = http.request({
    host: "127.0.0.1", port: srv.port, method: "POST", path: "/api/explain", agent: false,
    headers: { host: `127.0.0.1:${srv.port}`, "content-type": "application/json" },
  });
  req.on("error", () => {});
  req.end(JSON.stringify({ text: "Bonjour." }));
  await waitFor(() => stub.calls.length === 1);
  assert.equal((await explain(srv.port)).json.error.code, "BUSY");
  req.destroy();
  await waitFor(() => srv.log.entries.some((e) => e.msg === "client cancelled"));
  assert.equal((await explain(srv.port)).status, 200);
});

test("health limit is independent of the explain limit", async (t) => {
  let clock = 5_000_000;
  const srv = await startServer({
    config: realLimits((c) => { c.rateLimit.healthPerMinute = 2; }),
    provider: new StubProvider(),
    now: () => clock,
  });
  t.after(() => srv.close());
  for (let i = 0; i < 3; i++) assert.equal((await explain(srv.port)).status, 200);
  assert.equal((await explain(srv.port)).status, 429);
  assert.equal((await request(srv.port, { path: "/api/health" })).status, 200); // explain exhausted, health fine
  assert.equal((await request(srv.port, { path: "/api/health" })).status, 200);
  const h = await request(srv.port, { path: "/api/health" });
  assert.equal(h.status, 429);
  assert.equal(h.json.error.code, "RATE_LIMITED");
  assert.match(h.headers["retry-after"], /^\d+$/);
  clock += 6000;
  assert.equal((await explain(srv.port)).status, 200); // health exhausted, explain refilled
});

test("static files are not rate limited", async (t) => {
  const srv = await startServer({ config: realLimits((c) => { c.rateLimit.healthPerMinute = 1; }), provider: new StubProvider() });
  t.after(() => srv.close());
  for (let i = 0; i < 20; i++) assert.equal((await request(srv.port, { path: "/explainer.css" })).status, 200);
});

test("bucket unit: refill is capped at capacity, retryAfter rounds up to whole seconds", () => {
  let t = 0;
  const b = createBucket({ capacity: 2, perMinute: 7, now: () => t });
  assert.equal(b.take().ok, true);
  assert.equal(b.take().ok, true);
  const r = b.take();
  assert.equal(r.ok, false);
  assert.equal(r.retryAfter, Math.ceil(60 / 7));
  t += 10 * 60000; // long idle: still only `capacity` tokens
  assert.equal(b.take().ok, true);
  assert.equal(b.take().ok, true);
  assert.equal(b.take().ok, false);
});
