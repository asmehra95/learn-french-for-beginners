"use strict";
// Configuration (design §4.1): built-in defaults < config.json < environment variables.
// loadConfig() is the only place that validates. Any problem throws a ConfigError with one clear line;
// server.js prints it and exits 1, so nothing listens with a bad config.
const fs = require("node:fs");

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

const NON_LOOPBACK_MESSAGE =
  "Refusing to bind to a non-loopback address. Exposing the Explainer needs authentication; see README > Cloud deployment.";
const CREDENTIALS_MESSAGE =
  "Credentials do not belong in config.json. Use the AWS default credential chain (aws configure / AWS_PROFILE / SSO) on the server; see README.";

const DEFAULTS = Object.freeze({
  host: "127.0.0.1",
  port: 8765,
  provider: "ollama",
  allowedOrigins: [],
  ollama: {
    url: "http://127.0.0.1:11434",
    model: "mistral:latest",
    temperature: 0.1,
    numCtx: 8192,
    numPredict: 1800,
    seed: undefined,
    keepAlive: "10m",
  },
  limits: {
    maxChars: 2000,
    maxSentences: 8,
    maxBodyBytes: 16384,
    modelTimeoutMs: 120000,
    totalTimeoutMs: 300000,
    repairAttempts: 1,
  },
  rateLimit: { explainPerMinute: 10, explainBurst: 3, healthPerMinute: 60 },
  bedrock: { enabled: false, region: undefined, modelId: undefined },
  logLevel: "info",
  // Opt-in: also serve verb-trainer/ at /trainer/ and topics/*.pdf at /topics/ (read-only, fixed roots).
  serveSite: false,
});

// Allowed keys (nested objects are sections). Anything else at any level is fatal.
const SECTIONS = { ollama: DEFAULTS.ollama, limits: DEFAULTS.limits, rateLimit: DEFAULTS.rateLimit, bedrock: DEFAULTS.bedrock };
const TOP_KEYS = new Set(Object.keys(DEFAULTS));

// ---- Credential guard (segment-based, design §4.1) ----
const DENY = new Set(["secret", "password", "passwd", "token", "apikey", "accesskey", "credential",
  "credentials", "sessiontoken", "privatekey", "authorization", "bearer"]);
const EXEMPT = new Set(["maxTokens"]); // exact key names, documented in README
function segments(k) { // "awsSecretAccessKey" -> ["aws","secret","access","key"]
  return k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_.-]+/).filter(Boolean);
}
function looksLikeCredential(k) {
  if (EXEMPT.has(k)) return false;
  const s = segments(k); // a segment, or two adjacent segments joined, in DENY
  return s.some((x, i) => DENY.has(x) || (i > 0 && DENY.has(s[i - 1] + x)));
}
/** Walk every key at any depth (objects inside arrays too); throw on the first credential-like key. */
function checkCredentials(value) {
  if (Array.isArray(value)) {
    for (const v of value) checkCredentials(v);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (looksLikeCredential(k)) throw new ConfigError(CREDENTIALS_MESSAGE);
      checkCredentials(v);
    }
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(o) {
  return {
    ...o,
    allowedOrigins: [...o.allowedOrigins],
    ollama: { ...o.ollama },
    limits: { ...o.limits },
    rateLimit: { ...o.rateLimit },
    bedrock: { ...o.bedrock },
  };
}

function readFileConfig(file) {
  if (file === null || file === undefined) return {};
  if (isPlainObject(file)) return file; // already-parsed contents (tests)
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return {}; // optional file
    throw new ConfigError(`config.json cannot be read (${err && err.code ? err.code : "error"}).`);
  }
  let parsed;
  try {
    parsed = JSON.parse(src);
  } catch {
    throw new ConfigError("config.json is not valid JSON.");
  }
  if (!isPlainObject(parsed)) throw new ConfigError("config.json must contain a JSON object.");
  return parsed;
}

function mergeFile(cfg, fileCfg) {
  for (const [k, v] of Object.entries(fileCfg)) {
    if (!TOP_KEYS.has(k)) throw new ConfigError(`Unknown config key: ${k}`);
    if (Object.prototype.hasOwnProperty.call(SECTIONS, k)) {
      if (!isPlainObject(v)) throw new ConfigError(`Config key ${k} must be an object.`);
      for (const [sk, sv] of Object.entries(v)) {
        if (!Object.prototype.hasOwnProperty.call(SECTIONS[k], sk)) throw new ConfigError(`Unknown config key: ${k}.${sk}`);
        cfg[k][sk] = sv === null ? undefined : sv; // null = unset (optional keys)
      }
    } else {
      cfg[k] = v;
    }
  }
}

function envInt(env, name) {
  const raw = env[name];
  if (raw === undefined || raw === "") return undefined;
  if (!/^-?\d+$/.test(String(raw).trim())) throw new ConfigError(`${name} must be an integer.`);
  return Number(String(raw).trim());
}
function envStr(env, name) {
  const raw = env[name];
  return raw === undefined || raw === "" ? undefined : String(raw);
}

function envBool(env, name) {
  const raw = envStr(env, name);
  if (raw === undefined) return undefined;
  const e = raw.trim().toLowerCase();
  if (e === "1" || e === "true") return true;
  if (e === "0" || e === "false") return false;
  throw new ConfigError(`${name} must be 1, true, 0 or false.`);
}

function applyEnv(cfg, env) {
  const set = (obj, k, v) => { if (v !== undefined) obj[k] = v; };
  set(cfg, "host", envStr(env, "EXPLAINER_HOST"));
  set(cfg, "port", envInt(env, "EXPLAINER_PORT"));
  set(cfg, "provider", envStr(env, "EXPLAINER_PROVIDER"));
  const origins = envStr(env, "EXPLAINER_ALLOWED_ORIGINS");
  if (origins !== undefined) cfg.allowedOrigins = origins.split(",").map((s) => s.trim()).filter(Boolean);
  set(cfg.ollama, "url", envStr(env, "EXPLAINER_OLLAMA_URL"));
  set(cfg.ollama, "model", envStr(env, "EXPLAINER_MODEL"));
  set(cfg.ollama, "seed", envInt(env, "EXPLAINER_SEED"));
  set(cfg.limits, "modelTimeoutMs", envInt(env, "EXPLAINER_MODEL_TIMEOUT_MS"));
  set(cfg.bedrock, "enabled", envBool(env, "EXPLAINER_BEDROCK_ENABLED"));
  set(cfg.bedrock, "region", envStr(env, "EXPLAINER_BEDROCK_REGION"));
  set(cfg.bedrock, "modelId", envStr(env, "EXPLAINER_BEDROCK_MODEL_ID"));
  set(cfg, "logLevel", envStr(env, "EXPLAINER_LOG_LEVEL"));
  set(cfg, "serveSite", envBool(env, "EXPLAINER_SERVE_SITE"));
}

function int(name, v, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) throw new ConfigError(`${name} must be an integer from ${min} to ${max}.`);
}
function num(name, v, min, max) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new ConfigError(`${name} must be a number from ${min} to ${max}.`);
}
function str(name, v, re, what) {
  if (typeof v !== "string" || !re.test(v)) throw new ConfigError(`${name} ${what}`);
}

const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
const ORIGIN_V6_RE = /^http:\/\/\[::1\](:\d+)?$/;

function validate(cfg) {
  if (cfg.host !== "127.0.0.1" && cfg.host !== "::1") throw new ConfigError(NON_LOOPBACK_MESSAGE);
  int("port", cfg.port, 1024, 65535);
  if (cfg.provider !== "ollama" && cfg.provider !== "bedrock") throw new ConfigError('provider must be "ollama" or "bedrock".');

  if (!Array.isArray(cfg.allowedOrigins)) throw new ConfigError("allowedOrigins must be a list of origins.");
  if (cfg.allowedOrigins.length > 10) throw new ConfigError("allowedOrigins may list at most 10 origins.");
  cfg.allowedOrigins = cfg.allowedOrigins.map((o) => {
    if (typeof o !== "string") throw new ConfigError("allowedOrigins entries must be strings.");
    if (o.trim() === "*") throw new ConfigError('allowedOrigins must not contain "*". List exact origins instead.');
    const lo = o.trim().toLowerCase();
    if (lo !== "null" && !ORIGIN_RE.test(lo) && !ORIGIN_V6_RE.test(lo)) {
      throw new ConfigError(`allowedOrigins entry is not an origin like http://localhost:3000 (no path, no trailing slash): ${o}`);
    }
    return lo;
  });

  const o = cfg.ollama;
  let url;
  try {
    url = new URL(String(o.url));
  } catch {
    throw new ConfigError("ollama.url is not a valid URL.");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new ConfigError("ollama.url must be an http:// URL on 127.0.0.1, localhost or [::1] (no remote model server).");
  }
  o.url = String(o.url).replace(/\/+$/, "");
  str("ollama.model", o.model, /^[A-Za-z0-9._:/-]{1,100}$/, "must be a model name like mistral:latest.");
  num("ollama.temperature", o.temperature, 0, 1);
  int("ollama.numCtx", o.numCtx, 4096, 32768);
  int("ollama.numPredict", o.numPredict, 256, 4096);
  if (o.seed !== undefined && !Number.isInteger(o.seed)) throw new ConfigError("ollama.seed must be an integer.");
  str("ollama.keepAlive", o.keepAlive, /^\d+[smh]$/, "must look like 10m, 30s or 1h.");

  const l = cfg.limits;
  int("limits.maxChars", l.maxChars, 1, 2000);
  int("limits.maxSentences", l.maxSentences, 1, 8);
  int("limits.maxBodyBytes", l.maxBodyBytes, 1024, 65536);
  int("limits.modelTimeoutMs", l.modelTimeoutMs, 1000, 600000);
  if (!Number.isInteger(l.totalTimeoutMs) || l.totalTimeoutMs < l.modelTimeoutMs || l.totalTimeoutMs > 900000) {
    throw new ConfigError("limits.totalTimeoutMs must be an integer at least limits.modelTimeoutMs and at most 900000.");
  }
  int("limits.repairAttempts", l.repairAttempts, 0, 2);

  const r = cfg.rateLimit;
  int("rateLimit.explainPerMinute", r.explainPerMinute, 1, 120);
  int("rateLimit.explainBurst", r.explainBurst, 1, 10);
  int("rateLimit.healthPerMinute", r.healthPerMinute, 1, 600);

  const b = cfg.bedrock;
  if (typeof b.enabled !== "boolean") throw new ConfigError("bedrock.enabled must be true or false.");
  if (b.region !== undefined) str("bedrock.region", b.region, /^[a-z]{2}(-[a-z]+)+-\d$/, "must be an AWS region like eu-west-3.");
  if (b.modelId !== undefined) str("bedrock.modelId", b.modelId, /^[A-Za-z0-9.:/_-]{1,200}$/, "must be a Bedrock model id.");

  if (!["error", "warn", "info", "debug"].includes(cfg.logLevel)) throw new ConfigError("logLevel must be error, warn, info or debug.");
  if (typeof cfg.serveSite !== "boolean") throw new ConfigError("serveSite must be true or false.");
  return cfg;
}

/**
 * @param {{env?: object, file?: string|object|null}} [args]  file: path to config.json (missing file =
 *   defaults), an already-parsed object, or null for none.
 * @returns {object} validated config (plain object; callers may override fields in tests)
 */
function loadConfig({ env = {}, file = null } = {}) {
  const fileCfg = readFileConfig(file);
  checkCredentials(fileCfg); // before the unknown-key check so credential keys get the credentials message
  const cfg = clone(DEFAULTS);
  mergeFile(cfg, fileCfg);
  applyEnv(cfg, env || {});
  return validate(cfg);
}

module.exports = {
  loadConfig,
  ConfigError,
  DEFAULTS,
  DENY,
  EXEMPT,
  segments,
  looksLikeCredential,
  checkCredentials,
  NON_LOOPBACK_MESSAGE,
  CREDENTIALS_MESSAGE,
};
