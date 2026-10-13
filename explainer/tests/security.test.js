"use strict";
// Host / Origin / CORS / routing / headers (design §4.2, §5.1-5.3, §12.1 security row).
const test = require("node:test");
const assert = require("node:assert/strict");
const { StubProvider } = require("./helpers/stub-provider");
const { request, responses, startServer, testConfig } = require("./helpers/http");
const { DEMO_CSP } = require("../lib/static");

let srv; // default config
let open; // allowedOrigins: ["null", "http://localhost:3000"]
let stub;
let stubOpen;
test.before(async () => {
  stub = new StubProvider();
  stubOpen = new StubProvider();
  srv = await startServer({ config: testConfig(), provider: stub });
  open = await startServer({
    config: testConfig((c) => { c.allowedOrigins = ["null", "http://localhost:3000"]; }),
    provider: stubOpen,
  });
});
test.after(async () => {
  await srv.close();
  await open.close();
});

const EXPLAIN_BODY = { text: "Bonjour." };
const post = (s, headers = {}) => request(s.port, { method: "POST", path: "/api/explain", json: EXPLAIN_BODY, headers });

test("Origin https://evil.example -> 403 ORIGIN_NOT_ALLOWED on every API route, no ACAO, stub not called", async () => {
  const before = stub.calls.length;
  const evil = { origin: "https://evil.example" };
  const res = await post(srv, evil);
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, "ORIGIN_NOT_ALLOWED");
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  const health = await request(srv.port, { path: "/api/health", headers: evil });
  assert.equal(health.status, 403);
  assert.equal(health.json.error.code, "ORIGIN_NOT_ALLOWED");
  for (const p of ["/api/explain", "/api/health"]) {
    const pf = await request(srv.port, { method: "OPTIONS", path: p, headers: { ...evil, "access-control-request-method": "POST" } });
    assert.equal(pf.status, 403, p);
    assert.equal(pf.headers["access-control-allow-origin"], undefined);
    assert.equal(pf.headers["access-control-allow-methods"], undefined);
  }
  // Static files are public: Origin is not checked, but no CORS header is ever added and CORP applies.
  const page = await request(srv.port, { path: "/", headers: evil });
  assert.equal(page.status, 200);
  assert.equal(page.headers["access-control-allow-origin"], undefined);
  assert.equal(page.headers["cross-origin-resource-policy"], "same-origin");
  assert.equal(stub.calls.length, before);
});

test("Host evil.example:<port> -> 403 HOST_NOT_ALLOWED on /, /api/health, /api/explain, OPTIONS and every static path", async () => {
  const before = stub.calls.length;
  for (const host of [`evil.example:${srv.port}`, `127.0.0.1.nip.io:${srv.port}`]) {
    const h = { host };
    const checks = [
      await request(srv.port, { path: "/", headers: h }),
      await request(srv.port, { path: "/explainer.js", headers: h }),
      await request(srv.port, { path: "/explainer.css", headers: h }),
      await request(srv.port, { path: "/demo/demo.js", headers: h }),
      await request(srv.port, { path: "/api/health", headers: h }),
      await post(srv, h),
      await request(srv.port, { method: "OPTIONS", path: "/api/explain", headers: { ...h, origin: `http://127.0.0.1:${srv.port}` } }),
      await request(srv.port, { method: "OPTIONS", path: "/api/health", headers: { ...h, origin: `http://127.0.0.1:${srv.port}` } }),
      await request(srv.port, { path: "/nope", headers: h }),
    ];
    for (const r of checks) {
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, "HOST_NOT_ALLOWED");
      assert.equal(r.headers["access-control-allow-origin"], undefined);
      assert.equal(r.headers.connection, "close");
    }
  }
  assert.equal(stub.calls.length, before);
});

test("Host without port or with the wrong port -> 403; missing Host -> 400", async () => {
  const noPort = await request(srv.port, { path: "/api/health", headers: { host: "127.0.0.1" } });
  assert.equal(noPort.status, 403);
  const wrongPort = await request(srv.port, { path: "/api/health", headers: { host: `127.0.0.1:${srv.port + 1}` } });
  assert.equal(wrongPort.status, 403);
  const missing = await request(srv.port, { path: "/api/health", headers: { host: null } });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error.code, "HOST_NOT_ALLOWED");
});

test("Host localhost:<port> and [::1]:<port> are accepted (case-insensitive)", async () => {
  for (const host of [`localhost:${srv.port}`, `LOCALHOST:${srv.port}`, `[::1]:${srv.port}`]) {
    const r = await request(srv.port, { path: "/api/health", headers: { host } });
    assert.equal(r.status, 200, host);
  }
});

test("self Origin is allowed without ACAO", async () => {
  for (const origin of [`http://127.0.0.1:${srv.port}`, `http://localhost:${srv.port}`]) {
    const r = await post(srv, { origin });
    assert.equal(r.status, 200, r.body);
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  }
});

test("Origin: null -> 403 by default; allowlisted -> 200 with ACAO: null", async () => {
  const denied = await post(srv, { origin: "null" });
  assert.equal(denied.status, 403);
  assert.equal(denied.json.error.code, "ORIGIN_NOT_ALLOWED");
  const ok = await post(open, { origin: "null" });
  assert.equal(ok.status, 200, ok.body);
  assert.equal(ok.headers["access-control-allow-origin"], "null");
  assert.equal(ok.headers.vary, "Origin");
  assert.equal(ok.headers["access-control-allow-credentials"], undefined);
});

test("allowlisted http://localhost:3000: preflight 204 with exact ACAO + Vary: Origin; request gets ACAO", async () => {
  const pf = await request(open.port, {
    method: "OPTIONS", path: "/api/explain",
    headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  assert.equal(pf.status, 204);
  assert.equal(pf.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(pf.headers["access-control-allow-methods"], "GET, POST, OPTIONS");
  assert.equal(pf.headers["access-control-allow-headers"], "Content-Type");
  assert.equal(pf.headers["access-control-max-age"], "600");
  assert.equal(pf.headers.vary, "Origin");
  assert.equal(pf.headers["access-control-allow-private-network"], undefined);
  assert.equal(pf.headers["access-control-allow-credentials"], undefined);
  const r = await post(open, { origin: "http://localhost:3000" });
  assert.equal(r.status, 200, r.body);
  assert.equal(r.headers["access-control-allow-origin"], "http://localhost:3000");
  assert.equal(r.headers.vary, "Origin");
});

test("Private Network Access preflight is answered only for allowed origins", async () => {
  const pna = { "access-control-request-method": "POST", "access-control-request-private-network": "true" };
  const ok = await request(open.port, { method: "OPTIONS", path: "/api/explain", headers: { origin: "http://localhost:3000", ...pna } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers["access-control-allow-private-network"], "true");
  const bad = await request(open.port, { method: "OPTIONS", path: "/api/explain", headers: { origin: "http://localhost:4000", ...pna } });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers["access-control-allow-private-network"], undefined);
});

test("disallowed preflight -> 403 with no CORS headers", async () => {
  const r = await request(srv.port, {
    method: "OPTIONS", path: "/api/explain", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
  });
  assert.equal(r.status, 403);
  assert.equal(r.headers["access-control-allow-origin"], undefined);
});

test("Sec-Fetch-Site: cross-site without Origin -> 403", async () => {
  const r = await request(srv.port, { path: "/api/health", headers: { "sec-fetch-site": "cross-site" } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, "ORIGIN_NOT_ALLOWED");
  const same = await request(srv.port, { path: "/api/health", headers: { "sec-fetch-site": "same-origin" } });
  assert.equal(same.status, 200);
});

test("wrong methods -> 405 with Allow", async () => {
  const r = await request(srv.port, { path: "/api/explain" });
  assert.equal(r.status, 405);
  assert.equal(r.json.error.code, "METHOD_NOT_ALLOWED");
  assert.equal(r.headers.allow, "POST, OPTIONS");
  const h = await request(srv.port, { method: "POST", path: "/api/health", json: {} });
  assert.equal(h.status, 405);
  assert.equal(h.headers.allow, "GET, OPTIONS");
  const s = await request(srv.port, { method: "POST", path: "/", json: {} });
  assert.equal(s.status, 405);
  assert.equal(s.headers.allow, "GET, HEAD");
  const d = await request(srv.port, { method: "DELETE", path: "/explainer.js" });
  assert.equal(d.status, 405);
});

test("path tricks and non-public files -> 404", async () => {
  for (const p of ["/../server.js", "/%2e%2e/server.js", "/lib/config.js", "/data/data.js", "//server.js",
    "/config.json", "/demo/index.html", "/explainer.js/", "/EXPLAINER.JS", "/package.json", "/api/explain/"]) {
    const r = await request(srv.port, { path: p });
    assert.equal(r.status, 404, p);
    assert.equal(r.json.error.code, "NOT_FOUND");
    assert.doesNotMatch(r.body, /require\(|use strict/);
  }
});

test("static files: content types, no-cache, CORP, query strings ignored, HEAD has no body", async () => {
  const types = {
    "/": "text/html; charset=utf-8",
    "/explainer.js": "text/javascript; charset=utf-8",
    "/explainer.css": "text/css; charset=utf-8",
    "/demo/demo.js": "text/javascript; charset=utf-8",
  };
  for (const [p, type] of Object.entries(types)) {
    const r = await request(srv.port, { path: `${p}?v=1` });
    assert.equal(r.status, 200, p);
    assert.equal(r.headers["content-type"], type);
    assert.equal(r.headers["cache-control"], "no-cache");
    assert.equal(r.headers["cross-origin-resource-policy"], "same-origin");
    const head = await request(srv.port, { method: "HEAD", path: p });
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.equal(Number(head.headers["content-length"]), Buffer.byteLength(r.body));
  }
});

test("security headers on every response; no-store on /api/*; CSP header on the demo HTML", async () => {
  const all = [
    await request(srv.port, { path: "/" }),
    await request(srv.port, { path: "/explainer.js" }),
    await request(srv.port, { path: "/api/health" }),
    await post(srv),
    await request(srv.port, { path: "/nope" }),
    await request(srv.port, { path: "/api/health", headers: { host: "evil.example" } }),
  ];
  for (const r of all) {
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.equal(r.headers["referrer-policy"], "no-referrer");
    assert.equal(r.headers["x-frame-options"], "DENY");
  }
  assert.equal(all[2].headers["cache-control"], "no-store");
  assert.equal(all[3].headers["cache-control"], "no-store");
  assert.equal(all[2].headers["cross-origin-resource-policy"], undefined);
  assert.equal(all[0].headers["content-security-policy"], DEMO_CSP);
  assert.match(DEMO_CSP, /frame-ancestors 'none'/);
  assert.equal(all[1].headers["content-security-policy"], undefined);
  // The meta CSP is the same policy minus frame-ancestors.
  assert.ok(all[0].body.includes(`content="${DEMO_CSP.replace(/; frame-ancestors 'none'$/, "")}"`));
});

test("errors never include stack traces or file paths", async () => {
  for (const r of responses.filter((x) => x.status >= 400)) {
    assert.doesNotMatch(r.body, /\bat .+:\d+:\d+|\/Users\/|node:internal/);
  }
});

test("across every response collected in this file, no header value is *", () => {
  assert.ok(responses.length > 40);
  for (const r of responses) {
    for (const [k, v] of Object.entries(r.headers)) {
      const values = Array.isArray(v) ? v : [v];
      for (const x of values) assert.notEqual(String(x).trim(), "*", `${k}: ${x}`);
    }
  }
});
