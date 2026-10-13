"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { repairJson } = require("../lib/json-repair");

test("plain JSON parses", () => {
  assert.deepEqual(repairJson('{"a":1}'), { ok: true, value: { a: 1 } });
});

test("code-fenced JSON is parsed", () => {
  const r = repairJson('```json\n{"english": "Hello.", "chunks": []}\n```');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { english: "Hello.", chunks: [] });
});

test("leading prose + JSON is parsed", () => {
  const r = repairJson('Sure! Here is the JSON you asked for:\n{"english": "Hi."}\nHope this helps.');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { english: "Hi." });
});

test("trailing commas are fixed, commas inside strings are kept", () => {
  const r = repairJson('{"a": [1, 2, ], "b": {"c": "x, }", }, }');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: [1, 2], b: { c: "x, }" } });
});

test("smart quotes used as delimiters are replaced", () => {
  const r = repairJson("{\u201cenglish\u201d: \u201cHe said \u00abhi\u00bb.\u201d}");
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { english: "He said \u00abhi\u00bb." });
});

test("hopeless text -> failure", () => {
  for (const t of ["I cannot help with that.", "{not json at all", "", "{ \"a\": }", null]) {
    const r = repairJson(t);
    assert.equal(r.ok, false, String(t));
    assert.equal(typeof r.error, "string");
  }
});
