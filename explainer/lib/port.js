"use strict";
// Port selection (integration plan D3). With EXPLAINER_PORT set, only that port is tried, so an
// explicit override stays strict. Otherwise the port used last time (explainer/.last-port, if valid),
// then config.port, then config.port+10 … +19, are tried in order.
// Each candidate is probed with a short TCP connect first (catches programs bound to 0.0.0.0 too) and
// EADDRINUSE on listen moves on to the next one.
const fs = require("node:fs");
const net = require("node:net");

const MAX_PORT = 65535;
const FALLBACK_FROM = 10;
const FALLBACK_COUNT = 10;
const PROBE_MS = 300;

/**
 * @param {{port: number, envPort?: string}} args  port: the configured port (already including any
 *   EXPLAINER_PORT override); envPort: the raw EXPLAINER_PORT value (undefined or "" = not set)
 * @returns {number[]} candidate ports, in order, deduplicated, none above 65535
 */
function portCandidates({ port, envPort, lastPort }) {
  if (envSet(envPort)) return [port];
  const out = [];
  // Sticky port (integration finding 3): the port used last time goes first, so the site keeps the same
  // address and the learner's progress (localStorage is per address). If it is busy the usual order follows.
  if (validPort(lastPort)) out.push(lastPort);
  out.push(port);
  for (let i = 0; i < FALLBACK_COUNT; i++) out.push(port + FALLBACK_FROM + i);
  return [...new Set(out)].filter((p) => Number.isInteger(p) && p >= 1 && p <= MAX_PORT);
}

const envSet = (envPort) => envPort !== undefined && envPort !== null && String(envPort).trim() !== "";

// Same range config.js allows for `port`.
const MIN_STICKY = 1024;
const validPort = (p) => Number.isInteger(p) && p >= MIN_STICKY && p <= MAX_PORT;

/**
 * Read the sticky port file (explainer/.last-port). Only a plain decimal integer in 1024-65535
 * (surrounding whitespace allowed) is accepted; a missing, unreadable, oversized or garbage file gives null.
 * @returns {number|null}
 */
function readLastPort(file) {
  let text;
  try {
    const st = fs.lstatSync(file); // a symlink is not followed: isFile() is false for it
    if (!st.isFile() || st.size > 16) return null;
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const t = text.trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return validPort(n) ? n : null;
}

/**
 * Remember the port actually used. Best effort: returns false (and changes nothing) when it can't write.
 * Written to a temp file and renamed, so a crash never leaves half a number behind.
 * @returns {boolean}
 */
function writeLastPort(file, port) {
  if (!validPort(port)) return false;
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, `${port}\n`, { encoding: "utf8", mode: 0o644 });
    fs.renameSync(tmp, file);
    return true;
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    return false;
  }
}

/**
 * Resolve true if something accepts a TCP connection on host:port within ms, else false.
 * @returns {Promise<boolean>}
 */
function probe(host, port, ms = PROBE_MS) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    let done = false;
    const finish = (busy) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(busy);
    };
    const timer = setTimeout(() => finish(false), ms);
    sock.once("connect", () => finish(true));
    sock.once("error", () => finish(false));
  });
}

function listenOnce(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Listen on the first free candidate.
 * @param {import("node:net").Server} server
 * @param {{host: string, candidates: number[], probeMs?: number, probe?: Function}} opts
 * @returns {Promise<number>} the port now listening
 * @throws {Error} code "ALL_PORTS_BUSY" (with .ports) when every candidate is taken; other listen errors as-is
 */
async function listenFirstFree(server, { host, candidates, probeMs = PROBE_MS, probe: probeFn = probe }) {
  for (const port of candidates) {
    if (await probeFn(host, port, probeMs)) continue;
    try {
      await listenOnce(server, port, host);
      return server.address().port;
    } catch (err) {
      if (err && err.code === "EADDRINUSE") continue;
      throw err;
    }
  }
  const err = new Error(`No free port among ${candidates.join(", ")}`);
  err.code = "ALL_PORTS_BUSY";
  err.ports = candidates.slice();
  throw err;
}

/**
 * Startup lines about the port choice (printed by server.js before the addresses).
 * @param {{port: number, configPort: number, lastPort: number|null}} args
 * @returns {string[]}
 */
function portMessages({ port, configPort, lastPort }) {
  if (validPort(lastPort)) {
    if (port === lastPort) {
      return lastPort === configPort
        ? []
        : [`Using port ${port} again (the port from last time, saved in .last-port), so your progress stays at the same address.`];
    }
    return [
      `Port ${lastPort} (used last time) is busy, using ${port}.`,
      `Progress saved at port ${lastPort} stays there; to move it, use Export and Import on the Progress page.`,
    ];
  }
  return port !== configPort ? [`Port ${configPort} is busy, using ${port}.`] : [];
}

module.exports = { portCandidates, probe, listenFirstFree, readLastPort, writeLastPort, portMessages, PROBE_MS };
