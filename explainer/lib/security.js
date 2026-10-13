"use strict";
// Host check (DNS rebinding, §5.1) and Origin/CORS rules (§5.2). Never "*", never
// Access-Control-Allow-Credentials. Static paths skip the Origin check but never the Host check.
const { AppError } = require("./errors");

function selfHosts(port) {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}
function selfOrigins(port) {
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]);
}

/**
 * @param {string|undefined} host  the Host header
 * @param {number} port  the actual bound port
 * @returns {AppError|null}
 */
function checkHost(host, port) {
  if (typeof host !== "string" || host.trim() === "") return new AppError("HOST_NOT_ALLOWED", undefined, { status: 400 });
  return selfHosts(port).has(host.trim().toLowerCase()) ? null : new AppError("HOST_NOT_ALLOWED");
}

/**
 * @param {string[]} allowedOrigins  validated, lowercased config.allowedOrigins
 */
function createOriginPolicy(allowedOrigins) {
  const extra = new Set((allowedOrigins || []).filter((o) => o !== "null"));
  const allowNull = (allowedOrigins || []).includes("null");

  /** @returns {{allowed: boolean, self: boolean}} */
  function classify(origin, port) {
    if (origin === "null") return { allowed: allowNull, self: false }; // only the literal header value
    const lo = origin.toLowerCase();
    if (selfOrigins(port).has(lo)) return { allowed: true, self: true };
    return { allowed: extra.has(lo), self: false };
  }

  /**
   * Origin check for a non-preflight /api/* request.
   * @returns {{error: AppError} | {headers: object}}  headers = CORS headers to add (may be empty)
   */
  function check(req, port) {
    const origin = req.headers.origin;
    if (origin === undefined) {
      // No Origin: non-browser client, same-origin GET or cross-site no-cors GET. Block the last one
      // where the browser says so.
      if (String(req.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return { error: new AppError("ORIGIN_NOT_ALLOWED") };
      return { headers: {} };
    }
    const c = classify(String(origin), port);
    if (!c.allowed) return { error: new AppError("ORIGIN_NOT_ALLOWED") };
    if (c.self) return { headers: {} };
    return { headers: { "Access-Control-Allow-Origin": String(origin), Vary: "Origin" } };
  }

  /**
   * CORS preflight for OPTIONS /api/*.
   * @returns {{error: AppError} | {headers: object}}  204 with these headers on success
   */
  function preflight(req, port) {
    const origin = req.headers.origin;
    if (origin === undefined) return { error: new AppError("ORIGIN_NOT_ALLOWED") };
    const c = classify(String(origin), port);
    if (!c.allowed) return { error: new AppError("ORIGIN_NOT_ALLOWED") };
    const headers = {
      "Access-Control-Allow-Origin": String(origin),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    };
    if (String(req.headers["access-control-request-private-network"] || "").toLowerCase() === "true") {
      headers["Access-Control-Allow-Private-Network"] = "true";
    }
    return { headers };
  }

  return { check, preflight };
}

module.exports = { checkHost, createOriginPolicy, selfHosts, selfOrigins };
