"use strict";
// Static safety checks on the UI files (design §5.5, §12.1 ui-static row).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const JS = read("explainer.js");
const CSS = read("explainer.css");
const HTML = read("demo/index.html");
const DEMO_JS = read("demo/demo.js");

test("explainer.js compiles as a classic script", () => {
  assert.doesNotThrow(() => new vm.Script(JS, { filename: "explainer.js" }));
  assert.doesNotThrow(() => new vm.Script(DEMO_JS, { filename: "demo.js" }));
});

test("explainer.js has no import/export statements", () => {
  for (const src of [JS, DEMO_JS]) {
    assert.doesNotMatch(src, /^\s*(import|export)\s/m);
    assert.doesNotMatch(src, /\bimport\s*\(/);
  }
});

test("explainer.js uses no HTML-injection or dynamic-code APIs", () => {
  const forbidden = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"];
  for (const src of [JS, DEMO_JS]) {
    for (const token of forbidden) assert.equal(src.includes(token), false, `found forbidden token ${token}`);
    assert.doesNotMatch(src, /setTimeout\(\s*["'`]/, "string setTimeout");
    assert.doesNotMatch(src, /\.(href|src)\s*=/, "href/src assignment");
  }
});

test("explainer.js contains no URL except the default local server", () => {
  const urls = JS.match(/https?:\/\/[^\s"'`)\\]+/g) || [];
  assert.ok(urls.length >= 1, "the default apiBase literal is present");
  for (const u of urls) assert.equal(u, "http://127.0.0.1:8765", `unexpected URL ${u}`);
});

test("explainer.js never writes the Verb Trainer's storage keys", () => {
  const writes = JS.match(/\b(setItem|removeItem)\s*\([^)]*\)/g) || [];
  assert.ok(writes.length >= 1, "history writes exist");
  for (const w of writes) assert.doesNotMatch(w, /verbTrainer/i, `write touches trainer key: ${w}`);
  // The only writes use the history key variable.
  for (const w of writes) assert.match(w, /^(setItem|removeItem)\s*\(\s*historyKey\b/);
});

test("explainer.css has no url( and no @import", () => {
  assert.equal(CSS.includes("url("), false);
  assert.equal(/@import/i.test(CSS), false);
});

test("explainer.css scopes every rule under vtx classes", () => {
  const noComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(noComments)) !== null) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith("@") || /^(from|to|\d+%)$/.test(sel)) continue;
    selectors.push(...sel.split(",").map((s) => s.trim()));
  }
  assert.ok(selectors.length > 20);
  for (const s of selectors) assert.match(s, /\.vtx(\b|-)/, `unscoped selector: ${s}`);
});

test("demo HTML has no inline script body and no on*= attributes", () => {
  const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 2);
  for (const [, attrs, body] of scripts) {
    assert.equal(body.trim(), "", "inline script body");
    assert.match(attrs, /\bsrc="\/[^"]+"/);
  }
  assert.doesNotMatch(HTML, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(HTML, /style\s*=/i);
});
