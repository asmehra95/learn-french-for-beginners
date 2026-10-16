/* Cache busting: ?v=__BUILD__ on every local asset, the vt-build meta, the deploy stamp in pages.yml,
   no service worker, and the restored-tab check in js/build-check.js (node --test). */
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");
var HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var WORKFLOW = fs.readFileSync(path.join(ROOT, "..", ".github", "workflows", "pages.yml"), "utf8");
var CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'\">";

function assets(html) {
  var out = [];
  var re = /<script\b[^>]*\bsrc="([^"]*)"|<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*)"/g;
  var m;
  while ((m = re.exec(html))) out.push(m[1] || m[2]);
  return out;
}

test("every local <script src> and stylesheet <link> carries ?v=__BUILD__", function () {
  var list = assets(HTML);
  assert.ok(list.length >= 32, "found " + list.length);
  list.forEach(function (u) {
    assert.match(u, /^(js\/[a-z0-9-]+\.js|css\/[a-z0-9-]+\.css)\?v=__BUILD__$/, u);
    assert.ok(fs.existsSync(path.join(ROOT, u.split("?")[0])), u + " exists");
  });
  assert.equal((HTML.match(/<script\b/g) || []).length, list.filter(function (u) { return /^js\//.test(u); }).length, "no inline or unversioned script");
  assert.equal((HTML.match(/rel="stylesheet"/g) || []).length, 2);
  assert.ok(!/(src|href)="(https?:)?\/\//.test(HTML), "no external URLs");
});

test("one vt-build meta, CSP unchanged, build-check.js in <head> after theme.js", function () {
  assert.equal((HTML.match(/<meta name="vt-build" content="__BUILD__">/g) || []).length, 1);
  assert.ok(HTML.indexOf(CSP) !== -1);
  var head = HTML.slice(0, HTML.indexOf("</head>"));
  var theme = head.indexOf('<script src="js/theme.js?v=__BUILD__"></script>');
  var check = head.indexOf('<script src="js/build-check.js?v=__BUILD__"></script>');
  assert.ok(theme !== -1 && check > theme);
  assert.ok(HTML.indexOf("<meta name=\"vt-build\"") < check);
});

test("media is not versioned: no ?v= on mp3/pdf references", function () {
  ["index.html", "js/app.js", "js/audio-manifest.js", "js/tts-manifest.js", "js/tts-manifest-qwen3-fr-m-bf16.js", "js/views-tables.js", "js/views-topics.js", "js/views-dialogues.js"].forEach(function (f) {
    var s = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/\.(mp3|pdf)\?v=/.test(s), f);
  });
});

test("no service worker, Cache Storage or app manifest anywhere in the site", function () {
  var files = ["index.html"].concat(fs.readdirSync(path.join(ROOT, "js")).map(function (f) { return "js/" + f; }));
  files.forEach(function (f) {
    var s = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(!/serviceWorker|caches\.open|rel="manifest"|\.webmanifest/.test(s), f);
  });
});

test("pages.yml stamps the build before upload; permissions and pinned versions unchanged", function () {
  var stamp = WORKFLOW.indexOf('sed -i "s/__BUILD__/${GITHUB_SHA::7}/g" verb-trainer/index.html');
  var upload = WORKFLOW.indexOf("uses: actions/upload-pages-artifact@v3");
  assert.ok(stamp !== -1 && upload !== -1 && stamp < upload);
  assert.ok(WORKFLOW.indexOf("uses: actions/configure-pages@v5") < stamp);
  assert.match(WORKFLOW, /\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n\n/);
  var uses = WORKFLOW.match(/uses: \S+/g);
  assert.deepEqual(uses, ["uses: actions/checkout@v4", "uses: actions/configure-pages@v5", "uses: actions/upload-pages-artifact@v3", "uses: actions/deploy-pages@v4"]);
  assert.ok(WORKFLOW.indexOf("git push") === -1 && WORKFLOW.indexOf("git commit") === -1, "nothing committed back");
});

test("simulated deploy stamp: no token left, every asset carries ?v=<sha>", function () {
  var out = HTML.replace(/__BUILD__/g, "abc1234");
  assert.equal(out.indexOf("__BUILD__"), -1);
  assets(out).forEach(function (u) { assert.match(u, /\?v=abc1234$/, u); });
  assert.ok(out.indexOf('<meta name="vt-build" content="abc1234">') !== -1);
  assert.ok(out.indexOf(CSP) !== -1);
});

/* ---------- js/build-check.js ---------- */
function loadCheck(metaContent) {
  var listeners = {};
  var docListeners = {};
  var stored = {};
  var reloads = 0;
  var doc = {
    visibilityState: "visible",
    querySelector: function (sel) {
      if (sel === 'meta[name="vt-build"]') return metaContent == null ? null : { getAttribute: function () { return metaContent; } };
      return null;
    },
    addEventListener: function (t, fn) { docListeners[t] = fn; }
  };
  var win = {
    document: doc,
    navigator: { onLine: true },
    location: { reload: function () { reloads += 1; } },
    localStorage: { getItem: function (k) { return k in stored ? stored[k] : null; }, setItem: function (k, v) { stored[k] = String(v); } },
    addEventListener: function (t, fn) { listeners[t] = fn; }
  };
  global.window = win;
  var src = fs.readFileSync(path.join(ROOT, "js", "build-check.js"), "utf8");
  new Function("window", src)(win);
  return { B: win.VT_BUILD, win: win, doc: doc, stored: stored, listeners: listeners, docListeners: docListeners, reloads: function () { return reloads; } };
}

test("shouldReload truth table", function () {
  var R = loadCheck("__BUILD__").B.shouldReload;
  var H = 60 * 60 * 1000;
  var base = { id: "abc1234", storedId: "abc1234", online: true, ageMs: 0, hiddenMs: 0, dialogOpen: false, reloaded: false };
  function s(o) { return Object.assign({}, base, o); }
  assert.equal(R(s({ kind: "pageshow", persisted: true, id: "__BUILD__", storedId: "x", ageMs: 9 * H })), false, "unstamped: never");
  assert.equal(R(s({ kind: "pageshow", persisted: true, storedId: "def5678", online: false })), false, "offline: never");
  assert.equal(R(s({ kind: "pageshow", persisted: true, storedId: "def5678" })), true, "newer build opened");
  assert.equal(R(s({ kind: "pageshow", persisted: false, storedId: "def5678" })), false, "not restored");
  assert.equal(R(s({ kind: "pageshow", persisted: true, ageMs: H - 1 })), false, "same id, young");
  assert.equal(R(s({ kind: "pageshow", persisted: true, ageMs: H })), true, "same id, an hour old");
  assert.equal(R(s({ kind: "pageshow", persisted: true, storedId: "__BUILD__" })), false, "placeholder stored id is not newer");
  assert.equal(R(s({ kind: "visible", hiddenMs: H + 1, storedId: "def5678" })), true);
  assert.equal(R(s({ kind: "visible", hiddenMs: H + 1, storedId: "def5678", dialogOpen: true })), false, "dialog open");
  assert.equal(R(s({ kind: "visible", hiddenMs: H + 1 })), false, "same id: never just for being old");
  assert.equal(R(s({ kind: "visible", hiddenMs: H, storedId: "def5678" })), false, "not hidden long enough");
  assert.equal(R(s({ kind: "pageshow", persisted: true, storedId: "def5678", reloaded: true })), false, "once per page");
  assert.equal(R(null), false);
});

test("unstamped (file://, helper): no listeners, no storage write", function () {
  var t = loadCheck("__BUILD__");
  assert.equal(t.B.id, "__BUILD__");
  assert.deepEqual(Object.keys(t.listeners), []);
  assert.deepEqual(Object.keys(t.docListeners), []);
  assert.deepEqual(t.stored, {});
  var t2 = loadCheck(null);
  assert.equal(t2.B.id, "");
  assert.deepEqual(Object.keys(t2.listeners), []);
});

test("stamped: records its id; a restored page reloads once when a newer build was opened", function () {
  var t = loadCheck("abc1234");
  assert.equal(t.stored["verbTrainer.build"], "abc1234");
  t.listeners.pageshow({ persisted: true });
  assert.equal(t.reloads(), 0, "same build, young: no reload");
  t.stored["verbTrainer.build"] = "def5678";
  t.listeners.pageshow({ persisted: false });
  assert.equal(t.reloads(), 0, "fresh load: no reload");
  t.win.navigator.onLine = false;
  t.listeners.pageshow({ persisted: true });
  assert.equal(t.reloads(), 0, "offline: no reload");
  t.win.navigator.onLine = true;
  t.listeners.pageshow({ persisted: true });
  assert.equal(t.reloads(), 1);
  t.listeners.pageshow({ persisted: true });
  assert.equal(t.reloads(), 1, "at most once");
});

test("build-check.js: no network, no innerHTML, no modules, no service worker", function () {
  var src = fs.readFileSync(path.join(ROOT, "js", "build-check.js"), "utf8");
  assert.ok(!/\bfetch\b|XMLHttpRequest|innerHTML|\bimport\b|serviceWorker|sendBeacon|WebSocket/.test(src));
});
