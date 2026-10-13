"use strict";
// serveSite (integration plan D2, item 2): read-only exact-path allowlist of the Verb Trainer folder at
// /trainer/ and topics/*.pdf at /topics/, on a temp fixture tree, plus a smoke check of the real tree.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("../server");
const { StubProvider } = require("./helpers/stub-provider");
const { request, testConfig, makeLog, verbIndex } = require("./helpers/http");

const MP3 = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04]);
let tmp;
let srv; // serveSite on, temp tree
let off; // serveSite off (DEFAULTS), same temp tree
let real; // serveSite on, real verb-trainer/ and topics/

async function start(serveSite, roots = {}) {
  const config = testConfig((c) => { c.serveSite = serveSite; });
  const server = createServer(config, { provider: new StubProvider(), verbIndex: verbIndex(), log: makeLog(), ...roots });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    }),
  };
}

test.before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-site-"));
  const w = (rel, data) => {
    const f = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  };
  w("site/index.html", "<!doctype html><title>t</title>");
  w("site/js/a.js", "var a = 1;");
  w("site/css/s.css", "body{}");
  w("site/audio/x.mp3", MP3);
  w("site/icons/i.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  w("site/.secret", "dotfile");
  w("site/tests/t.test.js", "test file");
  w("site/run.sh", "#!/bin/sh");
  w("site/js/éte.js", "var nfc = 1;");
  w("topics/a.pdf", "%PDF-1.4");
  w("topics/notes.md", "# not served");
  w("secret.txt", "TOP SECRET");
  fs.symlinkSync(path.join("..", "secret.txt"), path.join(tmp, "site", "link"));
  fs.symlinkSync(path.join("..", "secret.txt"), path.join(tmp, "site", "link.txt"));
  fs.symlinkSync(path.join("..", "topics"), path.join(tmp, "site", "linkdir"));
  const roots = { siteRoot: path.join(tmp, "site"), topicsRoot: path.join(tmp, "topics") };
  srv = await start(true, roots);
  off = await start(false, roots);
  real = await start(true);
});
test.after(async () => {
  await srv.close();
  await off.close();
  await real.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const get = (s, p, headers) => request(s.port, { path: p, headers });

test("site files: 200 with the right Content-Type and the usual headers", async () => {
  const types = {
    "/trainer/": "text/html; charset=utf-8",
    "/trainer/index.html": "text/html; charset=utf-8",
    "/trainer/js/a.js": "text/javascript; charset=utf-8",
    "/trainer/css/s.css": "text/css; charset=utf-8",
    "/trainer/audio/x.mp3": "audio/mpeg",
    "/trainer/icons/i.svg": "image/svg+xml",
    "/topics/a.pdf": "application/pdf",
  };
  for (const [p, type] of Object.entries(types)) {
    const r = await get(srv, p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers["content-type"], type, p);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["referrer-policy"], "no-referrer");
    assert.equal(r.headers["x-frame-options"], "DENY");
    assert.equal(r.headers["cross-origin-resource-policy"], "same-origin");
    assert.equal(r.headers["cache-control"], "no-cache");
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  }
  assert.equal((await get(srv, "/trainer/js/a.js?v=2")).body, "var a = 1;");
  // Percent-encoded and NFD request paths both reach the NFC key.
  assert.equal((await get(srv, "/trainer/js/%C3%A9te.js")).status, 200);
  assert.equal((await get(srv, `/trainer/js/${encodeURIComponent("éte.js".normalize("NFD"))}`)).status, 200);
  // The module files are still served next to the site.
  assert.equal((await get(srv, "/explainer.js")).status, 200);
});

test("HEAD has headers and no body", async () => {
  const r = await request(srv.port, { method: "HEAD", path: "/trainer/js/a.js" });
  assert.equal(r.status, 200);
  assert.equal(r.body, "");
  assert.equal(Number(r.headers["content-length"]), "var a = 1;".length);
});

test("/trainer (no slash) -> 301 Location /trainer/", async () => {
  const r = await get(srv, "/trainer");
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, "/trainer/");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
});

test("traversal, encoding tricks, dotfiles, tests/, symlinks, unknown types and directories -> 404", async () => {
  const paths = [
    "/trainer/../secret.txt",
    "/trainer/%2e%2e/secret.txt",
    "/trainer/%2E%2E%2Fsecret.txt",
    "/trainer/..%5csecret.txt",
    "/trainer/..%5Csecret.txt",
    "/trainer/js%5ca.js",
    "/trainer//etc/passwd",
    "/trainer/%2Fetc%2Fpasswd",
    "//etc/passwd",
    "/trainer/%00",
    "/trainer/js/a.js%00",
    "/trainer/%E0%A4%A",
    "/trainer/.secret",
    "/trainer/tests/t.test.js",
    "/trainer/link",
    "/trainer/link.txt",
    "/trainer/linkdir/a.pdf",
    "/trainer/run.sh",
    "/trainer/js/",
    "/trainer/js",
    "/trainer/JS/A.JS",
    "/topics/notes.md",
    "/topics/",
    "/topics/../secret.txt",
    "/secret.txt",
  ];
  for (const p of paths) {
    const r = await get(srv, p);
    assert.equal(r.status, 404, p);
    assert.equal(r.json.error.code, "NOT_FOUND", p);
    assert.doesNotMatch(r.body, /TOP SECRET|dotfile|test file/, p);
  }
});

test("absolute-form request target -> 404", async () => {
  for (const p of [`http://127.0.0.1:${srv.port}/trainer/../secret.txt`, `http://127.0.0.1:${srv.port}/trainer/js/a.js`]) {
    const r = await get(srv, p);
    assert.equal(r.status, 404, p);
    assert.doesNotMatch(r.body, /TOP SECRET/);
  }
});

test("POST to a site file -> 405 with Allow; wrong Host -> 403 before anything else", async () => {
  const r = await request(srv.port, { method: "POST", path: "/trainer/js/a.js", json: {} });
  assert.equal(r.status, 405);
  assert.equal(r.headers.allow, "GET, HEAD");
  const t = await request(srv.port, { method: "PUT", path: "/trainer", body: "x" });
  assert.equal(t.status, 405);
  for (const p of ["/trainer/", "/trainer/js/a.js", "/trainer", "/topics/a.pdf", "/trainer/../secret.txt"]) {
    const h = await get(srv, p, { host: `evil.example:${srv.port}` });
    assert.equal(h.status, 403, p);
    assert.equal(h.json.error.code, "HOST_NOT_ALLOWED");
  }
});

test("serveSite false (the default) -> /trainer/ and /topics/ are 404, /trainer is not redirected", async () => {
  for (const p of ["/trainer/", "/trainer/index.html", "/trainer/js/a.js", "/trainer", "/topics/a.pdf"]) {
    const r = await get(off, p);
    assert.equal(r.status, 404, p);
  }
  assert.equal((await get(off, "/")).status, 200);
});

test("mp3 Range: Accept-Ranges, 206 for a single range, 416 for unsatisfiable or multiple ranges", async () => {
  const full = await get(srv, "/trainer/audio/x.mp3");
  assert.equal(full.status, 200);
  assert.equal(full.headers["accept-ranges"], "bytes");
  assert.equal(Number(full.headers["content-length"]), MP3.length);

  const two = await get(srv, "/trainer/audio/x.mp3", { range: "bytes=0-1" });
  assert.equal(two.status, 206);
  assert.equal(two.headers["content-range"], `bytes 0-1/${MP3.length}`);
  assert.equal(Number(two.headers["content-length"]), 2);
  assert.equal(two.headers["content-type"], "audio/mpeg");

  const tail = await get(srv, "/trainer/audio/x.mp3", { range: "bytes=4-" });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers["content-range"], `bytes 4-${MP3.length - 1}/${MP3.length}`);
  assert.equal(Number(tail.headers["content-length"]), MP3.length - 4);

  for (const range of ["bytes=999999-", "bytes=0-1,4-5", "bytes=5-2", "bytes=-0", "bytes=abc"]) {
    const r = await get(srv, "/trainer/audio/x.mp3", { range });
    assert.equal(r.status, 416, range);
    assert.equal(r.headers["content-range"], `bytes */${MP3.length}`, range);
  }
  // Range is only honoured for audio; other files ignore it.
  const js = await get(srv, "/trainer/js/a.js", { range: "bytes=0-1" });
  assert.equal(js.status, 200);
  assert.equal(js.headers["accept-ranges"], undefined);
});

test("real tree: /trainer/ and /trainer/js/app.js are 200; tests/ and dotfiles are not served", async () => {
  const home = await get(real, "/trainer/");
  assert.equal(home.status, 200);
  assert.equal(home.headers["content-type"], "text/html; charset=utf-8");
  assert.match(home.body, /<html/i);
  const app = await get(real, "/trainer/js/app.js");
  assert.equal(app.status, 200);
  assert.equal(app.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal((await get(real, "/trainer/css/styles.css")).status, 200);
  assert.equal((await get(real, "/trainer/tests/learn.test.js")).status, 404);
  assert.equal((await get(real, "/trainer/.DS_Store")).status, 404);
  assert.equal((await get(real, "/topics/01-asking-questions.md")).status, 404);
  const pdf = await request(real.port, { method: "HEAD", path: "/topics/01-asking-questions.pdf" });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers["content-type"], "application/pdf");
});
