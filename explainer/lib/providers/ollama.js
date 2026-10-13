"use strict";
// OllamaProvider (design §6.1-6.2): one chat call -> raw text. Local only (loopback URL is enforced by
// lib/config.js). Prompts, validation, repair and grounding live in lib/explain-service.js.

const { AppError } = require("../errors");

const DEFAULTS = Object.freeze({
  url: "http://127.0.0.1:11434",
  model: "mistral:latest",
  temperature: 0.1,
  numCtx: 8192,
  numPredict: 1800,
  seed: undefined,
  keepAlive: "10m",
});
const DEFAULT_MODEL_TIMEOUT_MS = 120000;
const HEALTH_TIMEOUT_MS = 2000;
const UNREACHABLE_HINT = "Start the Ollama app or run: ollama serve";

const NOOP_LOG = { error() {}, warn() {}, info() {}, debug() {} };

// Thrown internally when Ollama rejects a JSON-Schema `format` (older Ollama); triggers the downgrade.
class FormatUnsupported extends Error {}

function withTag(name) {
  return name.includes(":") ? name : `${name}:latest`;
}

function combine(signal, ms) {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

class OllamaProvider {
  /**
   * @param {{url?, model?, temperature?, numCtx?, numPredict?, seed?, keepAlive?}} ollamaConfig  config.ollama
   * @param {{modelTimeoutMs?: number, log?: object}} [opts]
   */
  constructor(ollamaConfig = {}, { modelTimeoutMs = DEFAULT_MODEL_TIMEOUT_MS, log } = {}) {
    this.id = "ollama";
    this.cfg = { ...DEFAULTS, ...ollamaConfig };
    this.baseUrl = String(this.cfg.url).replace(/\/+$/, "");
    this.modelTimeoutMs = modelTimeoutMs;
    this.log = { ...NOOP_LOG, ...(log || {}) };
    this.jsonFormatFallback = false; // sticky for the process lifetime once Ollama rejects a schema format
  }

  describe() {
    return { provider: "ollama", model: this.cfg.model, mode: "local", dataLeavesDevice: false, cefrConfidence: "low" };
  }

  /**
   * @param {{system?: string, user?: string, messages?: {role: string, content: string}[], schema: object,
   *          signal?: AbortSignal}} args  `messages` (e.g. a repair turn) takes precedence over system/user
   * @returns {Promise<{text: string, doneReason: string|undefined, evalCount: number|undefined, durationMs: number}>}
   */
  async complete({ system, user, messages, schema, signal }) {
    const msgs =
      Array.isArray(messages) && messages.length > 0
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : [
            { role: "system", content: system || "" },
            { role: "user", content: user || "" },
          ];
    const callSignal = combine(signal, this.modelTimeoutMs);
    try {
      return await this._chat(msgs, schema, callSignal, this.jsonFormatFallback);
    } catch (err) {
      if (!(err instanceof FormatUnsupported)) throw err;
      if (!this.jsonFormatFallback) {
        this.jsonFormatFallback = true;
        this.log.warn("ollama rejected the JSON schema format; using format \"json\" with the schema in the prompt from now on");
      }
      try {
        return await this._chat(msgs, schema, callSignal, true);
      } catch (err2) {
        if (err2 instanceof FormatUnsupported) throw new AppError("PROVIDER_ERROR");
        throw err2;
      }
    }
  }

  async _chat(msgs, schema, signal, jsonMode) {
    const messages = msgs.map((m) => ({ ...m }));
    if (jsonMode) {
      const schemaText = `\n\nThe JSON must match this JSON Schema:\n${JSON.stringify(schema)}`;
      const sys = messages.find((m) => m.role === "system");
      if (sys) sys.content += schemaText;
      else messages.unshift({ role: "system", content: schemaText.trim() });
    }
    const options = {
      temperature: this.cfg.temperature,
      top_p: 0.9,
      num_ctx: this.cfg.numCtx,
      num_predict: this.cfg.numPredict,
    };
    if (Number.isInteger(this.cfg.seed)) options.seed = this.cfg.seed;
    const body = {
      model: this.cfg.model,
      stream: false,
      format: jsonMode ? "json" : schema,
      keep_alive: this.cfg.keepAlive,
      options,
      messages,
    };

    const started = Date.now();
    let res;
    let raw;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      raw = await res.text();
    } catch (err) {
      throw this._mapFetchError(err, signal);
    }

    if (!res.ok) {
      if (res.status === 404 && /not found/i.test(raw)) {
        this.log.warn("ollama error", { code: "MODEL_NOT_FOUND", status: 404 });
        throw new AppError("MODEL_NOT_FOUND", `Model ${this.cfg.model} not found in Ollama.`, {
          hint: `Install it in Ollama (ollama pull ${this.cfg.model}), then try again.`,
        });
      }
      if (res.status === 400 && /format/i.test(raw) && !jsonMode) throw new FormatUnsupported();
      this.log.warn("ollama error", { code: "PROVIDER_ERROR", status: res.status });
      throw new AppError("PROVIDER_ERROR");
    }

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      envelope = null;
    }
    if (!envelope || typeof envelope !== "object" || !envelope.message || typeof envelope.message.content !== "string") {
      this.log.warn("ollama error", { code: "PROVIDER_ERROR", status: res.status, reason: "bad envelope" });
      throw new AppError("PROVIDER_ERROR");
    }
    return {
      text: envelope.message.content,
      doneReason: envelope.done_reason,
      evalCount: envelope.eval_count,
      durationMs: typeof envelope.total_duration === "number" ? envelope.total_duration / 1e6 : Date.now() - started,
    };
  }

  _mapFetchError(err, signal) {
    if (err instanceof AppError) return err;
    // Abort first: the reason tells a timeout (per-call or total deadline) from a client cancel.
    if (signal && signal.aborted) {
      const reason = signal.reason;
      if (reason instanceof AppError) return reason; // CANCELLED from the disconnect handler
      if (reason && reason.name === "TimeoutError") return new AppError("MODEL_TIMEOUT");
      return new AppError("CANCELLED");
    }
    if (err instanceof TypeError) {
      const causeCode = (err.cause && err.cause.code) || undefined;
      this.log.warn("ollama unreachable", { code: "OLLAMA_UNREACHABLE", cause: causeCode });
      return new AppError("OLLAMA_UNREACHABLE", undefined, { cause: err, causeCode });
    }
    this.log.warn("ollama error", { code: "PROVIDER_ERROR" });
    return new AppError("PROVIDER_ERROR", undefined, { cause: err });
  }

  /** @returns {Promise<{reachable: boolean, version: string|null, modelAvailable: boolean, ready: boolean, hint?: string}>} */
  async health({ signal } = {}) {
    const getJson = async (path) => {
      const res = await fetch(`${this.baseUrl}${path}`, { signal: combine(signal, HEALTH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    let version;
    try {
      const v = await getJson("/api/version");
      version = v && typeof v.version === "string" ? v.version : null;
    } catch {
      return { reachable: false, version: null, modelAvailable: false, ready: false, hint: UNREACHABLE_HINT };
    }
    let names = [];
    try {
      const tags = await getJson("/api/tags");
      const models = tags && Array.isArray(tags.models) ? tags.models : [];
      names = models.flatMap((m) => [m && m.name, m && m.model]).filter((n) => typeof n === "string");
    } catch {
      return {
        reachable: true, version, modelAvailable: false, ready: false,
        hint: "Could not list the models in Ollama.",
      };
    }
    const want = withTag(this.cfg.model);
    const modelAvailable = names.some((n) => withTag(n) === want);
    const out = { reachable: true, version, modelAvailable, ready: modelAvailable };
    if (!modelAvailable) out.hint = `Model ${this.cfg.model} not found in Ollama.`;
    return out;
  }
}

module.exports = { OllamaProvider, DEFAULTS };
