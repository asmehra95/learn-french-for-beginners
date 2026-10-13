"use strict";
// Scripted provider for tests. Queue items:
//   {text, doneReason?, durationMs?}  -> returned as a completion
//   {error: AppError}                 -> thrown
//   "hang"                            -> waits until the call's signal aborts, then throws like a real
//                                        provider (AppError reason rethrown, TimeoutError -> MODEL_TIMEOUT,
//                                        anything else -> CANCELLED)
//   function(call) -> item | Promise<item>  (for deferred/controlled responses)
// Every call is recorded: {system, user, messages, schema, signal, abortedAtReturn}.
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("../../lib/errors");

const VALID = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "valid-sentence.json"), "utf8"));

/** A valid model answer as JSON text, with top-level overrides. */
function validText(overrides = {}) {
  return JSON.stringify({ ...structuredClone(VALID), ...overrides });
}

function abortReasonError(signal) {
  const r = signal && signal.reason;
  if (r instanceof AppError) return r;
  if (r && r.name === "TimeoutError") return new AppError("MODEL_TIMEOUT");
  return new AppError("CANCELLED");
}

class StubProvider {
  /**
   * @param {{queue?: any[], fallback?: any, describe?: object, health?: object}} [opts]
   *   fallback: item used when the queue is empty (default: a valid answer)
   */
  constructor({ queue = [], fallback = { text: validText() }, describe, health } = {}) {
    this.id = "stub";
    this.queue = [...queue];
    this.fallback = fallback;
    this.calls = [];
    this.healthCalls = 0;
    this.describeValue = describe || { provider: "stub", model: "stub-model", mode: "local", dataLeavesDevice: false };
    this.healthValue = health || { reachable: true, version: "test", modelAvailable: true, ready: true };
  }
  push(...items) {
    this.queue.push(...items);
    return this;
  }
  describe() {
    return { ...this.describeValue };
  }
  async health() {
    this.healthCalls++;
    return { ...this.healthValue };
  }
  async complete({ system, user, messages, schema, signal }) {
    const call = { system, user, messages, schema, signal, abortedAtReturn: null };
    this.calls.push(call);
    let item = this.queue.length > 0 ? this.queue.shift() : this.fallback;
    if (typeof item === "function") item = await item(call);
    if (item === "hang") {
      return new Promise((_, reject) => {
        const fire = () => reject(abortReasonError(signal));
        if (!signal) return; // never settles: tests always pass a signal
        if (signal.aborted) fire();
        else signal.addEventListener("abort", fire, { once: true });
      });
    }
    if (!item) throw new Error("stub provider: queue empty and no fallback");
    if (item.error) throw item.error;
    call.abortedAtReturn = signal ? signal.aborted : null;
    return { text: item.text, doneReason: item.doneReason ?? "stop", evalCount: 1, durationMs: item.durationMs ?? 5 };
  }
}

module.exports = { StubProvider, validText, VALID };
