"use strict";
// Request validation over HTTP (design §4.3 steps 1-6, §12.1 input row) plus normaliseText units.
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { StubProvider } = require("./helpers/stub-provider");
const { request, startServer, testConfig } = require("./helpers/http");
const { normaliseText } = require("../lib/input");

let srv;
let stub;
test.before(async () => {
  stub = new StubProvider();
  srv = await startServer({ config: testConfig(), provider: stub });
});
test.after(() => srv.close());

const explain = (json, extra = {}) => request(srv.port, { method: "POST", path: "/api/explain", json, ...extra });
async function expectError(res, status, code) {
  assert.equal(res.status, status, res.body);
  assert.equal(res.json.error.code, code);
  assert.equal(typeof res.json.error.message, "string");
}

test("exactly 2000 code points accepted (counted in code points, not UTF-16 units)", async () => {
  const text = "é".repeat(1000) + "😀a".repeat(500); // 1000 + 1000 code points, 2500 UTF-16 units
  assert.equal([...text].length, 2000);
  const res = await explain({ text });
  assert.equal(res.status, 200, res.body);
  assert.equal(res.json.input.charCount, 2000);
});

test("2001 code points -> 400 INPUT_TOO_LONG stating the limit", async () => {
  const res = await explain({ text: "a".repeat(2001) });
  await expectError(res, 400, "INPUT_TOO_LONG");
  assert.match(res.json.error.message, /2000/);
});

test("body > 16 KB -> 413 BODY_TOO_LARGE and the connection is closed", async () => {
  const before = stub.calls.length;
  const res = await explain({ text: "a".repeat(17000) });
  await expectError(res, 413, "BODY_TOO_LARGE");
  assert.equal(res.headers.connection, "close");
  assert.equal(stub.calls.length, before);
});

test("body > 16 KB sent chunked (no Content-Length) -> 413", async () => {
  const res = await request(srv.port, {
    method: "POST", path: "/api/explain",
    headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
    body: JSON.stringify({ text: "a".repeat(17000) }),
  });
  await expectError(res, 413, "BODY_TOO_LARGE");
});

test("empty / whitespace / digits-only / punctuation-only -> 400 EMPTY_INPUT", async () => {
  for (const text of ["", "   \n\t  ", "12345", "… !!", "\u0000\u0007"]) {
    await expectError(await explain({ text }), 400, "EMPTY_INPUT");
  }
});

test("text: 5 and missing text -> 400 INVALID_REQUEST", async () => {
  await expectError(await explain({ text: 5 }), 400, "INVALID_REQUEST");
  await expectError(await explain({ options: { literal: true } }), 400, "INVALID_REQUEST");
});

test("unknown top-level key and non-object bodies -> 400 INVALID_REQUEST", async () => {
  const res = await explain({ text: "Bonjour.", mode: "x" });
  await expectError(res, 400, "INVALID_REQUEST");
  assert.match(res.json.error.message, /Unknown field: mode/);
  await expectError(await explain(["Bonjour."]), 400, "INVALID_REQUEST");
  await expectError(await explain("Bonjour."), 400, "INVALID_REQUEST");
  await expectError(await explain(null), 400, "INVALID_REQUEST");
});

test('options.literal: "yes", unknown option, options not an object -> 400 INVALID_REQUEST', async () => {
  await expectError(await explain({ text: "Bonjour.", options: { literal: "yes" } }), 400, "INVALID_REQUEST");
  await expectError(await explain({ text: "Bonjour.", options: { speed: 2 } }), 400, "INVALID_REQUEST");
  await expectError(await explain({ text: "Bonjour.", options: [] }), 400, "INVALID_REQUEST");
  await expectError(await explain({ text: "Bonjour.", options: null }), 400, "INVALID_REQUEST");
});

test("9 sentences -> 400 TOO_MANY_SENTENCES; 8 are accepted", async () => {
  const nine = Array.from({ length: 9 }, (_, i) => `Phrase ${i}.`).join(" ");
  const res = await explain({ text: nine });
  await expectError(res, 400, "TOO_MANY_SENTENCES");
  assert.match(res.json.error.message, /8/);
  const eight = Array.from({ length: 8 }, (_, i) => `Phrase ${i}.`).join(" ");
  const ok = await explain({ text: eight });
  assert.equal(ok.status, 200, ok.body);
  assert.equal(ok.json.input.sentenceCount, 8);
});

test("text/plain and missing Content-Type -> 415; charset parameter is fine", async () => {
  const body = JSON.stringify({ text: "Bonjour." });
  await expectError(await request(srv.port, { method: "POST", path: "/api/explain", headers: { "content-type": "text/plain" }, body }), 415, "UNSUPPORTED_MEDIA_TYPE");
  await expectError(await request(srv.port, { method: "POST", path: "/api/explain", body }), 415, "UNSUPPORTED_MEDIA_TYPE");
  const ok = await request(srv.port, { method: "POST", path: "/api/explain", headers: { "content-type": "application/json; charset=utf-8" }, body });
  assert.equal(ok.status, 200, ok.body);
});

test("invalid JSON -> 400 INVALID_JSON", async () => {
  const res = await request(srv.port, {
    method: "POST", path: "/api/explain", headers: { "content-type": "application/json" }, body: '{"text": "Bonjour.",',
  });
  await expectError(res, 400, "INVALID_JSON");
});

test("client vanishing mid-upload does not crash or log an error", async () => {
  await new Promise((resolve) => {
    const sock = net.connect(srv.port, "127.0.0.1", () => {
      sock.write(`POST /api/explain HTTP/1.1\r\nHost: 127.0.0.1:${srv.port}\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n{"text":`);
      setTimeout(() => { sock.destroy(); resolve(); }, 50);
    });
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(srv.log.entries.filter((e) => e.level === "error").length, 0);
  const res = await explain({ text: "Bonjour." }); // the single-flight guard was released
  assert.equal(res.status, 200, res.body);
});

test("normaliseText: NFC, CRLF, controls, apostrophes, spaces", () => {
  assert.equal(normaliseText("e\u0301te\u0301"), "été");
  assert.equal(normaliseText("a\r\nb"), "a\nb");
  assert.equal(normaliseText("a\u0000b\u0085c\u007f"), "abc");
  assert.equal(normaliseText("je m’appelle et ʼici"), "je m'appelle et 'ici");
  assert.equal(normaliseText("  un \t\t deux\u00a0\u00a0?  "), "un deux ?");
  assert.equal(normaliseText("ligne\tun\nligne deux"), "ligne un\nligne deux");
});

test("the model receives the normalised sentence", async () => {
  stub.calls.length = 0;
  const res = await explain({ text: "  Je  m’appelle\u00a0Marie.  " });
  assert.equal(res.status, 200, res.body);
  assert.equal(res.json.input.text, "Je m'appelle Marie.");
  assert.match(stub.calls[0].user, /<french_text>Je m'appelle Marie\.<\/french_text>/);
});
