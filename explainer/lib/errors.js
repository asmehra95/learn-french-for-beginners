"use strict";
// Error codes sent from server to client (design §5.6), plus the internal CANCELLED code.
// Every error the client sees has the shape {error: {code, message, hint?}}.
// Stack traces, file paths and raw model output never leave the server.

const CODES = Object.freeze({
  HOST_NOT_ALLOWED: { status: 403, message: "This server only answers requests addressed to 127.0.0.1 or localhost." },
  ORIGIN_NOT_ALLOWED: { status: 403, message: "This page is not allowed to use the Explainer." },
  METHOD_NOT_ALLOWED: { status: 405, message: "That method is not allowed here." },
  NOT_FOUND: { status: 404, message: "Not found." },
  RANGE_NOT_SATISFIABLE: { status: 416, message: "The requested range is not available." },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "Send the request as JSON (Content-Type: application/json)." },
  BODY_TOO_LARGE: { status: 413, message: "The request is too large." },
  INVALID_JSON: { status: 400, message: "The request is not valid JSON." },
  INVALID_REQUEST: { status: 400, message: "The request is not in the expected shape." },
  EMPTY_INPUT: { status: 400, message: "Type or paste some French text first." },
  INPUT_TOO_LONG: { status: 400, message: "The text is too long. The limit is 2000 characters." },
  TOO_MANY_SENTENCES: { status: 400, message: "Too many sentences. The limit is 8." },
  RATE_LIMITED: { status: 429, message: "Too many requests. Wait a moment and try again." },
  BUSY: { status: 429, message: "The Explainer is still working on another text. Try again in a few seconds." },
  OLLAMA_UNREACHABLE: {
    status: 503,
    message: "Can't reach Ollama on this Mac.",
    hint: "Start the Ollama app or run: ollama serve",
  },
  MODEL_NOT_FOUND: { status: 503, message: "The AI model was not found in Ollama." },
  PROVIDER_NOT_CONFIGURED: {
    status: 503,
    message:
      "The Bedrock provider is not configured. It is off by default. To use it, set bedrock.enabled, " +
      "bedrock.region and bedrock.modelId (see README > Switching providers).",
  },
  PROVIDER_NOT_IMPLEMENTED: { status: 501, message: "Bedrock support is planned but not built yet." },
  PROVIDER_ERROR: { status: 502, message: "The AI model returned an error. Try again." },
  MODEL_TIMEOUT: { status: 504, message: "The AI took too long. Try a shorter text." },
  MODEL_OUTPUT_INVALID: { status: 502, message: "The AI's answer could not be read. Try again." },
  INTERNAL: { status: 500, message: "Something went wrong in the Explainer server." },
  // Internal only: client disconnected. Never sent (there is nobody to send it to).
  CANCELLED: { status: 499, message: "The request was cancelled." },
});

class AppError extends Error {
  /**
   * @param {string} code  a key of CODES (unknown codes become INTERNAL)
   * @param {string} [message]  plain-English override of the default message
   * @param {{status?: number, hint?: string, retryAfter?: number, cause?: unknown, causeCode?: string}} [opts]
   */
  constructor(code, message, opts = {}) {
    const known = Object.prototype.hasOwnProperty.call(CODES, code) ? code : "INTERNAL";
    const def = CODES[known];
    super(message || def.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = known;
    this.status = opts.status || def.status;
    this.hint = opts.hint !== undefined ? opts.hint : def.hint;
    this.retryAfter = opts.retryAfter;
    if (opts.causeCode !== undefined) this.causeCode = opts.causeCode;
  }
}

/**
 * Map any error to what the client may see.
 * @returns {{status: number, retryAfter?: number, body: {error: {code: string, message: string, hint?: string}}}}
 */
function toClientError(err) {
  const e = err instanceof AppError && err.code !== "CANCELLED" ? err : new AppError("INTERNAL");
  const body = { error: { code: e.code, message: e.message } };
  if (e.hint) body.error.hint = e.hint;
  const out = { status: e.status, body };
  if (e.retryAfter !== undefined) out.retryAfter = e.retryAfter;
  return out;
}

function isAppError(err, code) {
  return err instanceof AppError && (code === undefined || err.code === code);
}

module.exports = { AppError, CODES, toClientError, isAppError };
