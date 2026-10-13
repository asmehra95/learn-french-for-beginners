"use strict";
// Global token buckets (every client is local, same address) and the single-flight explain guard
// (design §5.3). The clock is injectable for tests.
const { AppError } = require("./errors");

const BUSY_RETRY_AFTER_S = 5;

/**
 * @param {{capacity: number, perMinute: number, now?: () => number}} opts
 */
function createBucket({ capacity, perMinute, now = Date.now }) {
  const ratePerMs = perMinute / 60000;
  let tokens = capacity;
  let last = now();
  return {
    /** @returns {{ok: true} | {ok: false, retryAfter: number}} retryAfter in whole seconds (≥ 1) */
    take() {
      const t = now();
      tokens = Math.min(capacity, tokens + Math.max(0, t - last) * ratePerMs);
      last = t;
      if (tokens >= 1) {
        tokens -= 1;
        return { ok: true };
      }
      return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - tokens) / ratePerMs / 1000)) };
    },
  };
}

/**
 * @param {{explainPerMinute: number, explainBurst: number, healthPerMinute: number}} rateLimit
 * @param {() => number} [now]
 * @returns {{explain(): AppError|null, health(): AppError|null}}  an AppError RATE_LIMITED when exhausted
 */
function createRateLimiter(rateLimit, now = Date.now) {
  const explain = createBucket({ capacity: rateLimit.explainBurst, perMinute: rateLimit.explainPerMinute, now });
  const health = createBucket({ capacity: rateLimit.healthPerMinute, perMinute: rateLimit.healthPerMinute, now });
  const asError = (r) => (r.ok ? null : new AppError("RATE_LIMITED", undefined, { retryAfter: r.retryAfter }));
  return {
    explain: () => asError(explain.take()),
    health: () => asError(health.take()),
  };
}

/** At most one explain in flight. acquire() returns a release function, or throws BUSY. */
function createSingleFlight() {
  let busy = false;
  return {
    acquire() {
      if (busy) throw new AppError("BUSY", undefined, { retryAfter: BUSY_RETRY_AFTER_S });
      busy = true;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        busy = false;
      };
    },
    get busy() {
      return busy;
    },
  };
}

module.exports = { createBucket, createRateLimiter, createSingleFlight, BUSY_RETRY_AFTER_S };
