"use strict";
// lib/port.js and server.js port selection (integration plan D3, item 1).
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { portCandidates, probe, listenFirstFree } = require("../lib/port");

/** A throwaway listener on 127.0.0.1:0 (the "other program" holding a port). */
async function occupy() {
  const s = net.createServer((sock) => sock.destroy());
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  return { port: s.address().port, close: () => new Promise((r) => s.close(() => r())) };
}
/** A port that was free a moment ago. */
async function freePort() {
  const o = await occupy();
  await o.close();
  return o.port;
}
const closeServer = (s) => new Promise((r) => s.close(() => r()));

test("portCandidates: no env -> port, then port+10 … port+19", () => {
  assert.deepEqual(portCandidates({ port: 8765 }), [8765, 8775, 8776, 8777, 8778, 8779, 8780, 8781, 8782, 8783, 8784]);
  assert.deepEqual(portCandidates({ port: 8765, envPort: "" }), portCandidates({ port: 8765 }));
});

test("portCandidates: EXPLAINER_PORT set -> exactly that port", () => {
  assert.deepEqual(portCandidates({ port: 9000, envPort: "9000" }), [9000]);
  assert.deepEqual(portCandidates({ port: 8765, envPort: "8765" }), [8765]);
});

test("portCandidates: capped at 65535 and deduplicated", () => {
  assert.deepEqual(portCandidates({ port: 65530 }), [65530]);
  assert.deepEqual(portCandidates({ port: 65520 }), [65520, 65530, 65531, 65532, 65533, 65534, 65535]);
  const c = portCandidates({ port: 8765 });
  assert.equal(new Set(c).size, c.length);
});

test("probe: true for a listening port, false for a free one", async () => {
  const o = await occupy();
  try {
    assert.equal(await probe("127.0.0.1", o.port, 300), true);
  } finally {
    await o.close();
  }
  assert.equal(await probe("127.0.0.1", await freePort(), 300), false);
});

test("listenFirstFree: an occupied port is skipped and the next candidate is used", async () => {
  const o = await occupy();
  const next = await freePort();
  const server = http.createServer();
  try {
    const port = await listenFirstFree(server, { host: "127.0.0.1", candidates: [o.port, next] });
    assert.equal(port, next);
    assert.equal(server.address().port, next);
  } finally {
    await closeServer(server);
    await o.close();
  }
});

test("listenFirstFree: EADDRINUSE on listen (probe missed it) moves on to the next candidate", async () => {
  const o = await occupy();
  const next = await freePort();
  const server = http.createServer();
  try {
    const port = await listenFirstFree(server, { host: "127.0.0.1", candidates: [o.port, next], probe: async () => false });
    assert.equal(port, next);
  } finally {
    await closeServer(server);
    await o.close();
  }
});

test("listenFirstFree: every candidate busy -> ALL_PORTS_BUSY", async () => {
  const a = await occupy();
  const b = await occupy();
  const server = http.createServer();
  try {
    await assert.rejects(listenFirstFree(server, { host: "127.0.0.1", candidates: [a.port, b.port] }), (err) => {
      assert.equal(err.code, "ALL_PORTS_BUSY");
      assert.deepEqual(err.ports, [a.port, b.port]);
      return true;
    });
    assert.equal(server.listening, false);
  } finally {
    await a.close();
    await b.close();
  }
});

// Sticky port (.last-port, integration finding 3).
const fs = require("node:fs");
const os = require("node:os");
const { readLastPort, writeLastPort, portMessages } = require("../lib/port");
function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-lastport-"));
  const file = path.join(dir, ".last-port");
  if (content !== undefined) fs.writeFileSync(file, content);
  return { file, dir, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test(".last-port valid: read back, and tried first", () => {
  const t = tmpFile();
  try {
    assert.equal(writeLastPort(t.file, 8775), true);
    assert.equal(fs.readFileSync(t.file, "utf8"), "8775\n");
    assert.equal(readLastPort(t.file), 8775);
    assert.deepEqual(portCandidates({ port: 8765, lastPort: readLastPort(t.file) }).slice(0, 3), [8775, 8765, 8776]);
    fs.writeFileSync(t.file, "  9001 \n");
    assert.equal(readLastPort(t.file), 9001);
    assert.deepEqual(portCandidates({ port: 8765, lastPort: 9001 }).slice(0, 3), [9001, 8765, 8775]);
    // The configured port saved last time: same order as without the file.
    assert.deepEqual(portCandidates({ port: 8765, lastPort: 8765 }), portCandidates({ port: 8765 }));
  } finally {
    t.done();
  }
});

test(".last-port missing -> null, the normal order", () => {
  const t = tmpFile();
  try {
    assert.equal(readLastPort(t.file), null);
    assert.deepEqual(portCandidates({ port: 8765, lastPort: readLastPort(t.file) }), portCandidates({ port: 8765 }));
    assert.equal(readLastPort(path.join(t.dir, "no-such-dir", ".last-port")), null);
  } finally {
    t.done();
  }
});

test(".last-port garbage -> null (never used)", () => {
  for (const bad of ["", "abc", "8775x", "87.75", "-8775", "+8775", "0x2247", "1e4", "80", "1023", "65536", "99999", "8775\n8776", "1".repeat(40)]) {
    const t = tmpFile(bad);
    try {
      assert.equal(readLastPort(t.file), null, JSON.stringify(bad));
    } finally {
      t.done();
    }
  }
  // A directory or a symlink in its place is not read.
  const d = tmpFile();
  try {
    fs.mkdirSync(d.file);
    assert.equal(readLastPort(d.file), null);
    fs.rmdirSync(d.file);
    const target = path.join(d.dir, "target");
    fs.writeFileSync(target, "8775");
    fs.symlinkSync(target, d.file);
    assert.equal(readLastPort(d.file), null);
  } finally {
    d.done();
  }
  // portCandidates ignores an invalid lastPort however it arrives.
  for (const bad of [null, undefined, NaN, 80, 70000, 8775.5, "8775"]) {
    assert.deepEqual(portCandidates({ port: 8765, lastPort: bad }), portCandidates({ port: 8765 }), String(bad));
  }
  assert.equal(writeLastPort(path.join(os.tmpdir(), "x"), 80), false);
});

test(".last-port with EXPLAINER_PORT set -> ignored, only the env port", () => {
  assert.deepEqual(portCandidates({ port: 9000, envPort: "9000", lastPort: 8775 }), [9000]);
});

test(".last-port busy -> skipped, the next candidate in the usual order is used", async () => {
  const busy = await occupy();
  const free = await freePort();
  const t = tmpFile(String(busy.port));
  const server = http.createServer();
  try {
    const lastPort = readLastPort(t.file);
    assert.equal(lastPort, busy.port);
    const candidates = portCandidates({ port: free, lastPort });
    assert.deepEqual(candidates.slice(0, 2), [busy.port, free]);
    const port = await listenFirstFree(server, { host: "127.0.0.1", candidates });
    assert.equal(port, free);
    assert.deepEqual(portMessages({ port, configPort: free, lastPort }), [
      `Port ${busy.port} (used last time) is busy, using ${free}.`,
      `Progress saved at port ${busy.port} stays there; to move it, use Export and Import on the Progress page.`,
    ]);
  } finally {
    await closeServer(server);
    await busy.close();
    t.done();
  }
});

test("portMessages: sticky reuse, plain fallback, nothing to say", () => {
  assert.deepEqual(portMessages({ port: 8775, configPort: 8765, lastPort: 8775 }), [
    "Using port 8775 again (the port from last time, saved in .last-port), so your progress stays at the same address.",
  ]);
  assert.deepEqual(portMessages({ port: 8775, configPort: 8765, lastPort: null }), ["Port 8765 is busy, using 8775."]);
  assert.deepEqual(portMessages({ port: 8765, configPort: 8765, lastPort: null }), []);
  assert.deepEqual(portMessages({ port: 8765, configPort: 8765, lastPort: 8765 }), []);
});

test("server.js with EXPLAINER_PORT set to a busy port exits 1 with one line", async () => {
  const o = await occupy();
  try {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: { ...process.env, EXPLAINER_PORT: String(o.port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (c) => { stderr += c; });
    child.stdout.on("data", (c) => { stdout += c; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    const code = await new Promise((resolve) => child.on("exit", (c) => resolve(c)));
    clearTimeout(timer);
    assert.equal(code, 1, stdout + stderr);
    assert.match(stderr, new RegExp(`Port ${o.port} is busy \\(EXPLAINER_PORT is set`));
    assert.equal(stderr.trim().split("\n").length, 1);
    assert.doesNotMatch(stdout, /Explainer running at/);
  } finally {
    await o.close();
  }
});
