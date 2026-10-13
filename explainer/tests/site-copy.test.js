"use strict";
// The Verb Trainer loads its own copies of the UI module (integration plan D1). They must stay
// byte-identical to the originals: after editing explainer.js or explainer.css, copy them again:
//   cp explainer/explainer.js verb-trainer/js/explainer.js
//   cp explainer/explainer.css verb-trainer/css/explainer.css
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXPLAINER = path.join(__dirname, "..");
const SITE = path.join(EXPLAINER, "..", "verb-trainer");

for (const [original, copy] of [
  ["explainer.js", path.join("js", "explainer.js")],
  ["explainer.css", path.join("css", "explainer.css")],
]) {
  test(`verb-trainer/${copy} is byte-identical to explainer/${original}`, () => {
    const a = fs.readFileSync(path.join(EXPLAINER, original));
    const target = path.join(SITE, copy);
    assert.ok(fs.existsSync(target), `missing ${target}: copy explainer/${original} there`);
    const b = fs.readFileSync(target);
    assert.ok(a.equals(b), `verb-trainer/${copy} differs from explainer/${original}: copy it again`);
  });
}
