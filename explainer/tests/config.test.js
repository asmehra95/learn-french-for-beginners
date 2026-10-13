"use strict";
// lib/config.js (design §4.1, §12.1 config row).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  loadConfig, ConfigError, looksLikeCredential, checkCredentials, NON_LOOPBACK_MESSAGE, CREDENTIALS_MESSAGE,
} = require("../lib/config");

const load = (file, env = {}) => loadConfig({ env, file });
function throwsConfig(fn, re) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ConfigError, `expected ConfigError, got ${err && err.stack}`);
    if (re) assert.match(err.message, re);
    return true;
  });
}

test("defaults (incl. ollama.numCtx 8192)", () => {
  const c = load(null);
  assert.equal(c.host, "127.0.0.1");
  assert.equal(c.port, 8765);
  assert.equal(c.provider, "ollama");
  assert.deepEqual(c.allowedOrigins, []);
  assert.equal(c.ollama.url, "http://127.0.0.1:11434");
  assert.equal(c.ollama.model, "mistral:latest");
  assert.equal(c.ollama.temperature, 0.1);
  assert.equal(c.ollama.numCtx, 8192);
  assert.equal(c.ollama.numPredict, 1800);
  assert.equal(c.ollama.seed, undefined);
  assert.equal(c.ollama.keepAlive, "10m");
  assert.deepEqual(c.limits, {
    maxChars: 2000, maxSentences: 8, maxBodyBytes: 16384, modelTimeoutMs: 120000, totalTimeoutMs: 300000, repairAttempts: 1,
  });
  assert.deepEqual(c.rateLimit, { explainPerMinute: 10, explainBurst: 3, healthPerMinute: 60 });
  assert.equal(c.bedrock.enabled, false);
  assert.equal(c.logLevel, "info");
  assert.equal(c.serveSite, false);
});

test("the shipped config.json holds only defaults, plus serveSite: true", () => {
  const shipped = loadConfig({ env: {}, file: path.join(__dirname, "..", "config.json") });
  assert.equal(shipped.serveSite, true);
  assert.deepEqual({ ...shipped, serveSite: false }, load(null));
});

test("serveSite: default false, boolean only, EXPLAINER_SERVE_SITE overrides", () => {
  assert.equal(load(null).serveSite, false);
  assert.equal(load({ serveSite: true }).serveSite, true);
  throwsConfig(() => load({ serveSite: "yes" }), /serveSite must be true or false/);
  throwsConfig(() => load({ serveSite: 1 }), /serveSite must be true or false/);
  for (const [v, want] of [["1", true], ["true", true], ["TRUE", true], ["0", false], ["false", false]]) {
    assert.equal(load({ serveSite: !want }, { EXPLAINER_SERVE_SITE: v }).serveSite, want, v);
  }
  assert.equal(load({ serveSite: true }, { EXPLAINER_SERVE_SITE: "" }).serveSite, true);
  throwsConfig(() => load(null, { EXPLAINER_SERVE_SITE: "maybe" }), /EXPLAINER_SERVE_SITE must be 1, true, 0 or false/);
});

test("missing config file falls back to defaults", () => {
  assert.deepEqual(load(path.join(os.tmpdir(), "explainer-no-such-config.json")), load(null));
});

test("env overrides beat config.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-config-"));
  try {
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, JSON.stringify({ port: 9000, ollama: { model: "file:latest", numCtx: 16384 }, logLevel: "warn" }));
    const fromFile = load(file);
    assert.equal(fromFile.port, 9000);
    assert.equal(fromFile.ollama.model, "file:latest");
    assert.equal(fromFile.ollama.numCtx, 16384);
    const c = load(file, {
      EXPLAINER_PORT: "9001", EXPLAINER_MODEL: "env:latest", EXPLAINER_LOG_LEVEL: "debug", EXPLAINER_SEED: "42",
      EXPLAINER_ALLOWED_ORIGINS: "http://localhost:3000, null", EXPLAINER_MODEL_TIMEOUT_MS: "60000",
      EXPLAINER_BEDROCK_ENABLED: "true", EXPLAINER_BEDROCK_REGION: "eu-west-3", EXPLAINER_BEDROCK_MODEL_ID: "mistral.mistral-large",
      EXPLAINER_PROVIDER: "bedrock",
    });
    assert.equal(c.port, 9001);
    assert.equal(c.ollama.model, "env:latest");
    assert.equal(c.ollama.numCtx, 16384); // untouched by env
    assert.equal(c.logLevel, "debug");
    assert.equal(c.ollama.seed, 42);
    assert.deepEqual(c.allowedOrigins, ["http://localhost:3000", "null"]);
    assert.equal(c.limits.modelTimeoutMs, 60000);
    assert.equal(c.provider, "bedrock");
    assert.deepEqual(c.bedrock, { enabled: true, region: "eu-west-3", modelId: "mistral.mistral-large" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('host "0.0.0.0" and "localhost" throw the non-loopback message; ::1 is allowed', () => {
  for (const host of ["0.0.0.0", "localhost", "::", "192.168.1.10", "example.com"]) {
    throwsConfig(() => load({ host }), new RegExp(NON_LOOPBACK_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  throwsConfig(() => load(null, { EXPLAINER_HOST: "0.0.0.0" }), /non-loopback/);
  assert.equal(load({ host: "::1" }).host, "::1");
});

test("credential guard: credential-like keys at any depth are rejected with the credentials message", () => {
  const msg = new RegExp(CREDENTIALS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  throwsConfig(() => load({ awsSecretAccessKey: "x" }), msg);
  throwsConfig(() => load({ bedrock: { apiKey: "x" } }), msg);
  throwsConfig(() => load({ AWS_SECRET_ACCESS_KEY: "x" }), msg);
  throwsConfig(() => load({ bedrock: { nested: { sessionToken: "x" } } }), msg);
  throwsConfig(() => load({ allowedOrigins: [{ password: "x" }] }), msg);
  for (const k of ["awsSecretAccessKey", "AWS_SECRET_ACCESS_KEY", "api_key", "apiKey", "x-api-key", "accessKeyId", "sessionToken", "password"]) {
    assert.equal(looksLikeCredential(k), true, k);
  }
  for (const k of ["maxTokens", "sessionLength", "modelId", "region"]) assert.equal(looksLikeCredential(k), false, k);
  // bedrock.maxTokens passes the guard itself (the unknown-key check would reject it separately).
  assert.doesNotThrow(() => checkCredentials({ bedrock: { maxTokens: 1800 } }));
  throwsConfig(() => load({ bedrock: { maxTokens: 1800 } }), /Unknown config key: bedrock\.maxTokens/);
});

test('allowedOrigins: "*" throws, bad shapes throw, max 10, lowercased', () => {
  throwsConfig(() => load({ allowedOrigins: ["*"] }), /"\*"/);
  throwsConfig(() => load(null, { EXPLAINER_ALLOWED_ORIGINS: "*" }), /"\*"/);
  throwsConfig(() => load({ allowedOrigins: ["http://localhost:3000/"] }));
  throwsConfig(() => load({ allowedOrigins: ["http://localhost:3000/app"] }));
  throwsConfig(() => load({ allowedOrigins: ["localhost:3000"] }));
  throwsConfig(() => load({ allowedOrigins: Array.from({ length: 11 }, (_, i) => `http://localhost:${3000 + i}`) }), /at most 10/);
  assert.deepEqual(load({ allowedOrigins: ["HTTP://LocalHost:3000", "null", "http://[::1]:3000"] }).allowedOrigins,
    ["http://localhost:3000", "null", "http://[::1]:3000"]);
});

test("ollama.url must be loopback http", () => {
  throwsConfig(() => load({ ollama: { url: "http://10.0.0.5:11434" } }), /ollama\.url/);
  throwsConfig(() => load({ ollama: { url: "https://127.0.0.1:11434" } }), /ollama\.url/);
  throwsConfig(() => load({ ollama: { url: "http://127.0.0.1.nip.io:11434" } }), /ollama\.url/);
  throwsConfig(() => load({ ollama: { url: "not a url" } }), /ollama\.url/);
  assert.equal(load({ ollama: { url: "http://localhost:11434/" } }).ollama.url, "http://localhost:11434");
  assert.equal(load({ ollama: { url: "http://[::1]:11434" } }).ollama.url, "http://[::1]:11434");
});

test("unknown keys at any level throw", () => {
  throwsConfig(() => load({ serveSites: true }), /Unknown config key: serveSites/);
  throwsConfig(() => load({ ollama: { modle: "x" } }), /Unknown config key: ollama\.modle/);
  throwsConfig(() => load({ limits: 5 }), /must be an object/);
});

test("ranges and patterns are enforced", () => {
  throwsConfig(() => load({ port: 80 }), /port/);
  throwsConfig(() => load({ port: 70000 }), /port/);
  throwsConfig(() => load(null, { EXPLAINER_PORT: "abc" }), /EXPLAINER_PORT/);
  throwsConfig(() => load({ provider: "openai" }), /provider/);
  throwsConfig(() => load({ ollama: { numCtx: 2048 } }), /numCtx/);
  throwsConfig(() => load({ ollama: { temperature: 2 } }), /temperature/);
  throwsConfig(() => load({ ollama: { model: "bad model!" } }), /ollama\.model/);
  throwsConfig(() => load({ ollama: { keepAlive: "10 minutes" } }), /keepAlive/);
  throwsConfig(() => load({ limits: { maxChars: 2001 } }), /maxChars/);
  throwsConfig(() => load({ limits: { maxSentences: 9 } }), /maxSentences/);
  throwsConfig(() => load({ limits: { modelTimeoutMs: 500 } }), /modelTimeoutMs/);
  throwsConfig(() => load({ limits: { totalTimeoutMs: 100000 } }), /totalTimeoutMs/); // < modelTimeoutMs
  throwsConfig(() => load({ limits: { totalTimeoutMs: 900001 } }), /totalTimeoutMs/);
  throwsConfig(() => load({ limits: { repairAttempts: 3 } }), /repairAttempts/);
  throwsConfig(() => load({ rateLimit: { explainBurst: 11 } }), /explainBurst/);
  throwsConfig(() => load({ bedrock: { enabled: "yes" } }), /bedrock\.enabled/);
  throwsConfig(() => load({ bedrock: { region: "Paris" } }), /bedrock\.region/);
  throwsConfig(() => load(null, { EXPLAINER_BEDROCK_ENABLED: "maybe" }), /EXPLAINER_BEDROCK_ENABLED/);
  throwsConfig(() => load({ logLevel: "verbose" }), /logLevel/);
});

test("bad config.json text is one clear error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-config-"));
  try {
    const file = path.join(dir, "config.json");
    fs.writeFileSync(file, "{ not json");
    throwsConfig(() => load(file), /not valid JSON/);
    fs.writeFileSync(file, "[]");
    throwsConfig(() => load(file), /JSON object/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("server.js exits 1 with one line for a non-loopback host", () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, EXPLAINER_HOST: "0.0.0.0" },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to bind to a non-loopback address/);
  assert.equal(r.stderr.trim().split("\n").length, 1);
});
