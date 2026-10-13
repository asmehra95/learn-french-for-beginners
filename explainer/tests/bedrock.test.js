"use strict";
// Provider-level Bedrock stub cases. Server-level cases are appended in FEAT-003.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { BedrockProvider } = require("../lib/providers/bedrock");
const { createProvider } = require("../lib/providers");
const { OllamaProvider } = require("../lib/providers/ollama");
const { AppError } = require("../lib/errors");
const { SENTENCE_SCHEMA } = require("../lib/schema");

const ARGS = { system: "S", user: "U", schema: SENTENCE_SCHEMA };

async function codeOf(promise) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof AppError);
    return err;
  }
  assert.fail("expected an AppError");
}

test("disabled (default) -> PROVIDER_NOT_CONFIGURED", async () => {
  const err = await codeOf(new BedrockProvider().complete(ARGS));
  assert.equal(err.code, "PROVIDER_NOT_CONFIGURED");
  assert.equal(err.status, 503);
  const err2 = await codeOf(new BedrockProvider({ enabled: false, region: "eu-west-3", modelId: "m" }).complete(ARGS));
  assert.equal(err2.code, "PROVIDER_NOT_CONFIGURED");
});

test("enabled without region -> PROVIDER_NOT_CONFIGURED naming region", async () => {
  const err = await codeOf(new BedrockProvider({ enabled: true, modelId: "mistral.mistral-large" }).complete(ARGS));
  assert.equal(err.code, "PROVIDER_NOT_CONFIGURED");
  assert.match(err.message, /region/);
  assert.doesNotMatch(err.message, /modelId/);
  const err2 = await codeOf(new BedrockProvider({ enabled: true }).complete(ARGS));
  assert.match(err2.message, /bedrock\.region, bedrock\.modelId/);
});

test("enabled + configured -> PROVIDER_NOT_IMPLEMENTED", async () => {
  const p = new BedrockProvider({ enabled: true, region: "eu-west-3", modelId: "mistral.mistral-large" });
  assert.equal(p.isConfigured(), true);
  const err = await codeOf(p.complete(ARGS));
  assert.equal(err.code, "PROVIDER_NOT_IMPLEMENTED");
  assert.equal(err.status, 501);
});

test("describe() reports cloud mode and dataLeavesDevice true", () => {
  const p = new BedrockProvider({ enabled: true, region: "eu-west-3", modelId: "m1" });
  assert.equal(p.describe().dataLeavesDevice, true);
  assert.deepEqual(p.describe(), { provider: "bedrock", model: "m1", region: "eu-west-3", mode: "cloud", dataLeavesDevice: true });
  assert.deepEqual(new BedrockProvider().describe(), {
    provider: "bedrock", model: null, region: null, mode: "cloud", dataLeavesDevice: true,
  });
});

test("health() and complete() make no network call", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("network must not be used");
  });
  const off = await new BedrockProvider().health();
  assert.deepEqual(off, {
    reachable: false, version: null, modelAvailable: false, ready: false, configured: false,
    hint: "Bedrock provider is a stub in this build.",
  });
  const on = await new BedrockProvider({ enabled: true, region: "eu-west-3", modelId: "m" }).health();
  assert.equal(on.ready, false);
  assert.equal(on.configured, true);
  await new BedrockProvider({ enabled: true, region: "eu-west-3", modelId: "m" }).complete(ARGS).catch(() => {});
  assert.equal(calls, 0);
});

test("bedrock.js requires nothing outside node: built-ins and lib/", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "providers", "bedrock.js"), "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  const specs = [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  assert.ok(specs.length > 0);
  for (const s of specs) assert.ok(s.startsWith("node:") || s.startsWith("../") || s.startsWith("./"), s);
  assert.doesNotMatch(code, /@aws-sdk/);
  assert.doesNotMatch(code, /\bimport\s*\(/);
});

test("createProvider picks by config.provider", () => {
  const ollama = createProvider({ provider: "ollama", ollama: { url: "http://127.0.0.1:11434" }, limits: { modelTimeoutMs: 1234 } });
  assert.ok(ollama instanceof OllamaProvider);
  assert.equal(ollama.modelTimeoutMs, 1234);
  const bedrock = createProvider({ provider: "bedrock", bedrock: { enabled: false } });
  assert.ok(bedrock instanceof BedrockProvider);
  assert.equal(bedrock.id, "bedrock");
  assert.throws(() => createProvider({ provider: "other" }), /Unknown provider/);
});

// ---- Server-level cases (FEAT-003) ----
const { request, startServer, testConfig } = require("./helpers/http");

async function bedrockServer(mutate) {
  const config = testConfig((c) => {
    c.provider = "bedrock";
    if (mutate) mutate(c.bedrock);
  });
  return startServer({ config, provider: createProvider(config) });
}

test("server with provider bedrock, not enabled: health ready:false configured:false mode cloud; explain 503", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("network must not be used");
  });
  const srv = await bedrockServer();
  t.after(() => srv.close());
  const h = await request(srv.port, { path: "/api/health" });
  assert.equal(h.status, 200);
  assert.equal(h.json.provider, "bedrock");
  assert.equal(h.json.mode, "cloud");
  assert.equal(h.json.dataLeavesDevice, true);
  assert.equal(h.json.ready, false);
  assert.equal(h.json.configured, false);
  assert.equal(h.json.hint, "Bedrock provider is a stub in this build.");
  assert.equal(h.json.ollama, undefined);
  const e = await request(srv.port, { method: "POST", path: "/api/explain", json: { text: "Bonjour." } });
  assert.equal(e.status, 503);
  assert.equal(e.json.error.code, "PROVIDER_NOT_CONFIGURED");
  assert.equal(calls, 0);
});

test("server with bedrock enabled + region + modelId: health ready:false configured:true; explain 501", async (t) => {
  const srv = await bedrockServer((b) => {
    b.enabled = true;
    b.region = "eu-west-3";
    b.modelId = "mistral.mistral-large";
  });
  t.after(() => srv.close());
  const h = await request(srv.port, { path: "/api/health" });
  assert.equal(h.status, 200);
  assert.equal(h.json.ready, false);
  assert.equal(h.json.configured, true);
  assert.equal(h.json.region, "eu-west-3");
  assert.equal(h.json.model, "mistral.mistral-large");
  const e = await request(srv.port, { method: "POST", path: "/api/explain", json: { text: "Bonjour." } });
  assert.equal(e.status, 501);
  assert.equal(e.json.error.code, "PROVIDER_NOT_IMPLEMENTED");
});
