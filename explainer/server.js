"use strict";
// Local HTTP transport for the Explainer (design §4, §5). Binds to loopback only (enforced by
// lib/config.js). Local mode has NO authentication: it is reachable only from this Mac, and must never
// be exposed beyond localhost without adding authentication first (design §5.0, §6.4).
const http = require("node:http");
const path = require("node:path");
const { AppError } = require("./lib/errors");
const { loadConfig, ConfigError } = require("./lib/config");
const { readJsonBody, sendJson, sendError, setSecurityHeaders } = require("./lib/http-util");
const { checkHost, createOriginPolicy } = require("./lib/security");
const { createRateLimiter, createSingleFlight } = require("./lib/rate-limit");
const { execFile } = require("node:child_process");
const { createStatic } = require("./lib/static");
const { portCandidates, listenFirstFree, readLastPort, writeLastPort, portMessages } = require("./lib/port");
const LAST_PORT_FILE = path.join(__dirname, ".last-port");
const { validateBody } = require("./lib/input");
const { createExplainService, SCHEMA_VERSION } = require("./lib/explain-service");

const HEALTH_CACHE_MS = 5000;
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// Exact-match routes: path -> allowed methods.
const API_ROUTES = new Map([
  ["/api/health", ["GET", "OPTIONS"]],
  ["/api/explain", ["POST", "OPTIONS"]],
]);
const STATIC_METHODS = ["GET", "HEAD"];

/** Console logger: one line per entry. Never given input text at info (design §4.6). */
function createLogger(level = "info", { out = console } = {}) {
  const max = LEVELS[level] ?? LEVELS.info;
  const line = (lvl, msg, meta) => {
    if (LEVELS[lvl] > max) return;
    const tail = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const text = `${new Date().toISOString()} ${lvl.toUpperCase()} ${msg}${tail}`;
    (lvl === "error" || lvl === "warn" ? out.error : out.log).call(out, text);
  };
  return {
    error: (m, meta) => line("error", m, meta),
    warn: (m, meta) => line("warn", m, meta),
    info: (m, meta) => line("info", m, meta),
    debug: (m, meta) => line("debug", m, meta),
  };
}

function isJsonContentType(ct) {
  return String(ct || "").split(";")[0].trim().toLowerCase() === "application/json";
}

/**
 * @param {object} config  a config from loadConfig() (not re-validated here; tests override fields)
 * @param {{provider: object, verbIndex: object, now?: () => number, log?: object, explainService?: object,
 *   siteRoot?: string, topicsRoot?: string}} deps  siteRoot/topicsRoot default to ../verb-trainer and
 *   ../topics; they are only read when config.serveSite is true
 * @returns {http.Server}  call .listen(port, host)
 */
function createServer(config, deps) {
  const { provider, verbIndex } = deps;
  const now = deps.now || Date.now;
  const log = deps.log || createLogger(config.logLevel);
  const explainService = deps.explainService || createExplainService({ provider, verbIndex, config, log, now });
  const limiter = createRateLimiter(config.rateLimit, now);
  const flight = createSingleFlight();
  const origins = createOriginPolicy(config.allowedOrigins);
  const statics = createStatic({
    serveSite: config.serveSite === true,
    siteRoot: deps.siteRoot || path.join(__dirname, "..", "verb-trainer"),
    topicsRoot: deps.topicsRoot || path.join(__dirname, "..", "topics"),
  });
  let healthCache = null; // {at, value} | {at, pending}

  // requireHostHeader:false so a missing Host gets our own 400 HOST_NOT_ALLOWED (with security headers)
  // instead of Node's bare 400; checkHost() still rejects it.
  const server = http.createServer({ requireHostHeader: false }, (req, res) => {
    handle(req, res).catch((err) => {
      log.error(`unexpected error: ${err && err.stack ? err.stack : String(err)}`);
      if (!res.headersSent) sendError(res, new AppError("INTERNAL"));
      else res.destroy();
    });
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 50;
  server.maxRequestsPerSocket = 100;

  function boundPort() {
    const a = server.address();
    return a && typeof a === "object" ? a.port : config.port;
  }

  async function healthBody() {
    const t = now();
    if (healthCache && t - healthCache.at < HEALTH_CACHE_MS) return healthCache.value;
    let h;
    try {
      h = await provider.health({});
    } catch {
      h = { reachable: false, version: null, modelAvailable: false, ready: false, hint: "Start the Ollama app or run: ollama serve" };
    }
    const d = provider.describe();
    const body = {
      ok: true,
      schemaVersion: SCHEMA_VERSION,
      provider: d.provider,
      model: d.model,
      mode: d.mode,
      dataLeavesDevice: d.dataLeavesDevice,
    };
    if (d.mode === "cloud") {
      body.region = d.region ?? null;
      body.configured = h.configured === true;
      body.ready = false; // the Bedrock stub can never serve requests in this build (§4.4)
    } else {
      body.ready = h.ready === true;
      body.ollama = { reachable: h.reachable === true, version: h.version ?? null, modelAvailable: h.modelAvailable === true };
    }
    if (h.hint) body.hint = h.hint;
    body.limits = { maxChars: config.limits.maxChars, maxSentences: config.limits.maxSentences };
    healthCache = { at: t, value: body };
    return body;
  }

  async function handleExplain(req, res, ctx) {
    if (!isJsonContentType(req.headers["content-type"])) return sendError(res, new AppError("UNSUPPORTED_MEDIA_TYPE"));
    const limited = limiter.explain();
    if (limited) return sendError(res, limited);
    let release;
    try {
      release = flight.acquire();
    } catch (err) {
      return sendError(res, err);
    }
    try {
      const controller = new AbortController();
      // Client disconnect is detected on the response side only: on Node >= 16 req emits 'close' right
      // after its body is read, so req 'close' must never be used for cancellation (§4.3).
      res.on("close", () => {
        if (!res.writableEnded) controller.abort(new AppError("CANCELLED"));
      });
      const body = await readJsonBody(req, res, config.limits.maxBodyBytes);
      const input = validateBody(body, config.limits);
      ctx.chars = input.charCount;
      ctx.sentences = input.sentences.length;
      log.debug("explain input", { head: input.text.slice(0, 200) });
      let result;
      try {
        result = await explainService.explain(input.text, input.options, { signal: controller.signal });
      } catch (err) {
        if (err instanceof AppError && err.code === "CANCELLED") {
          ctx.cancelled = true;
          log.info("client cancelled");
          return undefined;
        }
        throw err;
      }
      ctx.attempts = result.timing.attempts;
      ctx.repaired = result.sentences.filter((s) => s.repaired).length;
      if (res.destroyed || controller.signal.aborted) {
        ctx.cancelled = true;
        log.info("client cancelled");
        return undefined;
      }
      return sendJson(res, 200, result);
    } finally {
      release();
    }
  }

  async function handle(req, res) {
    const started = now();
    const urlPath = String(req.url || "/").split("?")[0];
    const isApi = urlPath.startsWith("/api/");
    const ctx = {};
    setSecurityHeaders(res);
    if (isApi) res.setHeader("Cache-Control", "no-store");
    res.on("finish", () => {
      const extra = urlPath === "/api/explain" && ctx.chars !== undefined
        ? ` chars=${ctx.chars} sentences=${ctx.sentences} attempts=${ctx.attempts ?? 0} repaired=${ctx.repaired ?? 0}`
        : "";
      log.info(`${req.method} ${urlPath} ${res.statusCode} ${Math.round(now() - started)}ms${extra}`);
    });

    const port = boundPort();
    const hostErr = checkHost(req.headers.host, port);
    if (hostErr) {
      log.warn("host not allowed", { code: hostErr.code });
      res.setHeader("Connection", "close");
      return sendError(res, hostErr);
    }

    const apiMethods = API_ROUTES.get(urlPath);
    if (!apiMethods) {
      const location = statics.redirect(urlPath);
      if (!location && !statics.has(urlPath)) return sendError(res, new AppError("NOT_FOUND"));
      if (!STATIC_METHODS.includes(req.method)) {
        return sendError(res, new AppError("METHOD_NOT_ALLOWED"), { Allow: STATIC_METHODS.join(", ") });
      }
      if (location) {
        res.statusCode = 301;
        res.setHeader("Location", location);
        res.setHeader("Content-Length", 0);
        return res.end();
      }
      return statics.serve(req, res, urlPath); // Origin is not checked for public static files (§5.2)
    }
    if (!apiMethods.includes(req.method)) {
      return sendError(res, new AppError("METHOD_NOT_ALLOWED"), { Allow: apiMethods.join(", ") });
    }

    if (req.method === "OPTIONS") {
      const pf = origins.preflight(req, port);
      if (pf.error) {
        log.warn("origin denied (preflight)", { code: pf.error.code });
        return sendError(res, pf.error);
      }
      for (const [k, v] of Object.entries(pf.headers)) res.setHeader(k, v);
      res.statusCode = 204;
      return res.end();
    }
    const oc = origins.check(req, port);
    if (oc.error) {
      log.warn("origin denied", { code: oc.error.code });
      return sendError(res, oc.error);
    }
    for (const [k, v] of Object.entries(oc.headers)) res.setHeader(k, v);

    if (urlPath === "/api/health") {
      const limited = limiter.health();
      if (limited) return sendError(res, limited);
      return sendJson(res, 200, await healthBody());
    }
    try {
      return await handleExplain(req, res, ctx);
    } catch (err) {
      if (err instanceof AppError && err.code === "CANCELLED") {
        log.info("client cancelled");
        return undefined;
      }
      if (err instanceof AppError) {
        if (["OLLAMA_UNREACHABLE", "MODEL_NOT_FOUND", "PROVIDER_NOT_CONFIGURED", "PROVIDER_NOT_IMPLEMENTED",
          "PROVIDER_ERROR", "MODEL_TIMEOUT", "MODEL_OUTPUT_INVALID"].includes(err.code)) {
          log.warn("explain failed", { code: err.code, status: err.status });
        }
        return sendError(res, err);
      }
      throw err;
    }
  }

  return server;
}

function formatHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

async function main() {
  let config;
  try {
    config = loadConfig({ env: process.env, file: path.join(__dirname, "config.json") });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Explainer config error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const log = createLogger(config.logLevel);
  const { loadVerbData } = require("./lib/verb-data");
  const { createProvider } = require("./lib/providers");
  let verbIndex;
  try {
    verbIndex = loadVerbData();
  } catch (err) {
    console.error(`Explainer startup error: ${err.message}`);
    process.exit(1);
  }
  const provider = createProvider(config, { log });
  const server = createServer(config, { provider, verbIndex, log });
  const envPort = process.env.EXPLAINER_PORT;
  const envSet = envPort !== undefined && String(envPort).trim() !== "";
  // Sticky port: progress in the browser is stored per address, so reuse last time's port when it is free.
  const lastPort = envSet ? null : readLastPort(LAST_PORT_FILE);
  const candidates = portCandidates({ port: config.port, envPort, lastPort });
  let port;
  try {
    port = await listenFirstFree(server, { host: config.host, candidates });
  } catch (err) {
    if (err && err.code === "ALL_PORTS_BUSY") {
      console.error(envSet
        ? `Port ${config.port} is busy (EXPLAINER_PORT is set, so no other port is tried). Stop the program using it, or set EXPLAINER_PORT to a free port.`
        : `Ports ${candidates.join(", ")} are all busy. Set EXPLAINER_PORT to a free port.`);
    } else {
      console.error(`Explainer could not start: ${err && err.code ? err.code : err}`);
    }
    process.exit(1);
  }
  server.on("error", (err) => {
    console.error(`Explainer server error: ${err && err.code ? err.code : err}`);
    process.exit(1);
  });

  const base = `http://${formatHost(config.host)}:${port}`;
  const d = provider.describe();
  console.log(`Provider: ${d.provider}  Model: ${d.model || "(not set)"}`);
  for (const line of portMessages({ port, configPort: config.port, lastPort })) console.log(line);
  // An explicit EXPLAINER_PORT is a one-off override: it is not remembered.
  if (!envSet && port !== lastPort && !writeLastPort(LAST_PORT_FILE, port)) {
    console.log(`Could not save the port to ${LAST_PORT_FILE}; next time the port may differ.`);
  }
  console.log(`Explainer running at ${base}/`);
  if (config.serveSite) {
    console.log(`Verb Trainer: ${base}/trainer/#home`);
    console.log(`Explain: ${base}/trainer/#explain`);
  }
  console.log(`Standalone demo: ${base}/`);
  console.log("Local mode: no authentication; reachable only from this Mac.");
  if (config.allowedOrigins.includes("null")) {
    console.warn("Warning: Origin 'null' is allowed: any sandboxed page can call this server");
  }
  if (process.argv.slice(2).includes("--open")) {
    const url = config.serveSite ? `${base}/trainer/#explain` : `${base}/`;
    execFile("open", [url], (err) => {
      if (err) console.error(`Could not open the browser (${err.code || "error"}). Open ${url} yourself.`);
    });
  }

  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`Explainer could not start: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
}

module.exports = { createServer, createLogger };
