"use strict";
// Small HTTP helpers: streamed JSON body with a size cap, JSON responses, the error envelope and the
// security headers every response carries (design §4.3, §5.3, §5.6).
const { AppError, toClientError } = require("./errors");

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
});
const DRAIN_LIMIT_BYTES = 1024 * 1024; // after a 413, discard at most this much before dropping the socket

function setSecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

/**
 * Discard the rest of an oversized body so the 413 reaches the client (closing a socket with unread
 * data makes the kernel send a reset). Bounded: a huge body just gets the socket destroyed.
 */
function drain(req) {
  let discarded = 0;
  req.removeAllListeners("data");
  req.on("data", (c) => {
    discarded += c.length;
    if (discarded > DRAIN_LIMIT_BYTES) req.destroy();
  });
  req.on("error", () => {});
  req.resume();
}

/**
 * Read the request body as UTF-8, stopping at maxBytes (413 BODY_TOO_LARGE, connection closed), then
 * JSON.parse it (400 INVALID_JSON).
 * @returns {Promise<unknown>}
 */
function readJsonBody(req, res, maxBytes) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => {
      res.setHeader("Connection", "close");
      drain(req);
      reject(new AppError("BODY_TOO_LARGE"));
    };
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      tooLarge();
      return;
    }
    const parts = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        tooLarge();
        return;
      }
      parts.push(chunk);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      const text = Buffer.concat(parts).toString("utf8");
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new AppError("INVALID_JSON"));
      }
    });
    req.on("error", () => {
      if (done) return;
      done = true;
      reject(new AppError("CANCELLED")); // client went away mid-upload
    });
  });
}

function sendJson(res, status, obj, headers = {}) {
  if (res.headersSent || res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(obj);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.statusCode = status;
  res.end(body);
}

/** Send the {error: {code, message, hint?}} envelope; non-AppErrors become INTERNAL. */
function sendError(res, err, headers = {}) {
  const c = toClientError(err);
  const extra = { ...headers };
  if (c.retryAfter !== undefined) extra["Retry-After"] = String(c.retryAfter);
  sendJson(res, c.status, c.body, extra);
}

module.exports = { readJsonBody, sendJson, sendError, setSecurityHeaders, SECURITY_HEADERS };
