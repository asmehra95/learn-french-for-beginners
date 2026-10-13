"use strict";
// HTTP test helpers. Uses node:http (not fetch) so Host and Origin can be set freely.
const http = require("node:http");
const { loadConfig } = require("../../lib/config");
const { createServer } = require("../../server");
const { loadVerbData } = require("../../lib/verb-data");

let verbIndexCache = null;
function verbIndex() {
  if (!verbIndexCache) verbIndexCache = loadVerbData();
  return verbIndexCache;
}

/** Every response seen by request(), for file-wide assertions (e.g. no header value is "*"). */
const responses = [];

/**
 * @param {number} port
 * @param {{method?: string, path?: string, headers?: object, body?: string|Buffer|object, json?: object}} [opts]
 *   headers.host: null -> send no Host header at all. json: sent with Content-Type application/json.
 * @returns {Promise<{status: number, headers: object, body: string, json: any}>}
 */
function request(port, { method = "GET", path = "/", headers = {}, body, json } = {}) {
  return new Promise((resolve, reject) => {
    const h = { host: `127.0.0.1:${port}`, ...headers };
    let payload = body;
    if (json !== undefined) {
      payload = JSON.stringify(json);
      if (!Object.keys(h).some((k) => k.toLowerCase() === "content-type")) h["content-type"] = "application/json";
    }
    const noHost = h.host === null;
    if (noHost) delete h.host;
    if (payload !== undefined && !Object.keys(h).some((k) => ["content-length", "transfer-encoding"].includes(k.toLowerCase()))) {
      h["content-length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: h, agent: false, setHost: !noHost },
      (res) => {
        const parts = [];
        res.on("data", (c) => parts.push(c));
        res.on("end", () => {
          const text = Buffer.concat(parts).toString("utf8");
          let parsed;
          try {
            parsed = text ? JSON.parse(text) : undefined;
          } catch {
            parsed = undefined;
          }
          const out = { status: res.statusCode, headers: res.headers, body: text, json: parsed };
          responses.push(out);
          resolve(out);
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/** Config for tests: defaults, port 0, rate limits out of the way unless the test says otherwise. */
function testConfig(mutate) {
  const config = loadConfig({ env: {}, file: null });
  config.port = 0;
  config.rateLimit.explainBurst = 1000;
  config.rateLimit.explainPerMinute = 1000;
  config.rateLimit.healthPerMinute = 1000;
  if (mutate) mutate(config);
  return config;
}

function makeLog() {
  const entries = [];
  const rec = (level) => (msg, meta) => entries.push({ level, msg, meta });
  return { entries, error: rec("error"), warn: rec("warn"), info: rec("info"), debug: rec("debug") };
}

/**
 * Start createServer() on 127.0.0.1:0.
 * @returns {Promise<{server, port, config, log, close(): Promise<void>}>}
 */
async function startServer({ config = testConfig(), provider, log = makeLog(), now, explainService } = {}) {
  const server = createServer(config, { provider, verbIndex: verbIndex(), log, now, explainService });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    server,
    port,
    config,
    log,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** Poll until fn() is truthy (or fail after ms). */
async function waitFor(fn, ms = 2000, step = 10) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("waitFor: condition not met in time");
}

module.exports = { request, responses, testConfig, makeLog, startServer, verbIndex, waitFor };
