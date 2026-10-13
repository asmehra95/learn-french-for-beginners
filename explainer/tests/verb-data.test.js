"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadVerbData, key, slug, stripHtml, DEFAULT_DIR } = require("../lib/verb-data");

const index = loadVerbData();

function walkKeys(value, visit, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Map) {
    for (const [k, v] of value) {
      visit(String(k));
      walkKeys(v, visit, seen);
    }
    return;
  }
  if (value instanceof Set) {
    for (const v of value) walkKeys(v, visit, seen);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    visit(k);
    walkKeys(v, visit, seen);
  }
}

test("loads the real three files: 125 unique ids", () => {
  assert.equal(index.verbCount, 125);
  assert.equal(index.byId.size, 125);
  assert.equal(new Set(index.byId.keys()).size, 125);
  assert.equal(index.byLemma.size, 125);
});

test("every id has a type and a known category", () => {
  for (const rec of index.byId.values()) {
    assert.ok(rec.typeDetail, rec.id);
    assert.ok(["regular", "regular-spelling-change", "irregular"].includes(rec.category), rec.id);
    assert.ok(["avoir", "être"].includes(rec.auxiliary), rec.id);
  }
});

test("badge labels are exactly the 4 allowed strings", () => {
  const labels = new Set();
  for (const rec of index.byId.values()) {
    labels.add(rec.badgeLabel);
    if (rec.pronominal) labels.add(index.pronominalLabel);
  }
  assert.deepEqual([...labels].sort(), ["Irregular", "Reflexive", "Regular", "Regular (spelling change)"]);
  assert.equal([...index.byId.values()].filter((r) => r.pronominal).length, 10);
});

test("key() and slug() follow the data id rule", () => {
  assert.equal(key("  Être  Là\u2019 "), "etre la'");
  assert.equal(slug("s'appeler"), "s-appeler");
  assert.equal(slug("se lever"), "se-lever");
  assert.equal(slug("connaître"), "connaitre");
  for (const rec of index.byId.values()) assert.equal(slug(rec.infinitive), rec.id);
});

test("form indexes keep collisions and accent-free keys", () => {
  assert.deepEqual([...index.byForm.get("suis")].sort(), ["etre", "suivre"]);
  assert.deepEqual([...index.byForm.get("est")], ["etre"]);
  assert.deepEqual([...index.byForm.get("sommes")], ["etre"]);
  assert.deepEqual([...index.byForm.get("fait")], ["faire"]);
  assert.deepEqual([...index.byForm.get("alles")], ["aller"]);
  assert.deepEqual([...index.byForm.get("lever")], ["se-lever"]);
  assert.deepEqual([...index.byForm.get("serai")], ["etre"]);
  assert.deepEqual([...index.byForm.get("faudra")], ["falloir"]);
  assert.equal(index.byForm.get("faudrons"), undefined, "impersonal future: 'a' only");
  assert.deepEqual([...index.participles.get("assises")], ["s-asseoir"]);
  assert.equal(index.participles.get("assiss"), undefined, "no s-doubling");
  assert.deepEqual([...index.participles.get("été")], ["etre"]);
  assert.deepEqual([...index.participles.get("levés")], ["se-lever"]);
  assert.deepEqual([...index.participles.get("arrivée")], ["arriver"]);
  assert.equal(index.auxForms.get("etes"), "être");
  assert.equal(index.auxForms.get("a"), "avoir");
  assert.equal(index.auxForms.get("été"), undefined, "participles are not auxiliaries");
  assert.ok(index.infinitiveWords.has("être") && index.infinitiveWords.has("etre") && index.infinitiveWords.has("lever"));
});

test("phrases expand il/elle rows and drop (e) from the past", () => {
  assert.deepEqual(index.phrases.get("elle est").find((e) => e.id === "etre"), {
    id: "etre",
    text: "elle est",
    pronunciation: "eel/el eh",
    variant: 1,
  });
  assert.equal(index.phrases.get("il est")[0].variant, 0);
  assert.equal(index.phrases.get("je me suis leve")[0].pronunciation, "zhuh muh swee luh-vay");
  assert.equal(index.phrases.get("je suis")[0].variant, null);
});

test("lessons map and pronunciationKeyText are plain text", () => {
  assert.equal(index.lessons.get(1), "The Essentials");
  assert.equal(index.lessons.get(23), "Promises and first reflexive verbs");
  assert.match(index.pronunciationKeyText, /^zh = the "s" in measure/);
  assert.doesNotMatch(index.pronunciationKeyText, /[<>]|&[a-z#0-9]+;/i);
  assert.equal(stripHtml("<strong>a</strong> &quot;b&quot; don&#39;t"), "a \"b\" don't");
});

test("no html keys or markup in records", () => {
  walkKeys(index, (k) => assert.doesNotMatch(k, /html$/i, k));
  for (const rec of index.byId.values()) {
    assert.doesNotMatch(JSON.stringify(rec), /<\/?[a-z][^>]*>/i, rec.id);
  }
});

test("sandbox has no process/require: crafted data file fails with a clear error", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-verbdata-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "data.js"), "window.VERB_DATA = { verbs: [], leak: process.env.HOME };\n");
  fs.copyFileSync(path.join(DEFAULT_DIR, "data-100.js"), path.join(dir, "data-100.js"));
  fs.copyFileSync(path.join(DEFAULT_DIR, "verb-types.js"), path.join(dir, "verb-types.js"));
  assert.throws(() => loadVerbData(dir), (err) => {
    assert.match(err.message, /data\.js/);
    assert.match(err.message, /process is not defined/);
    return true;
  });

  fs.writeFileSync(path.join(dir, "data.js"), "window.VERB_DATA = { verbs: [], fs: require('node:fs') };\n");
  assert.throws(() => loadVerbData(dir), /data\.js: failed to run in the data sandbox \(require is not defined\)/);

  fs.writeFileSync(path.join(dir, "data.js"), "window.VERB_DATA = { verbs: [] };\n");
  fs.writeFileSync(path.join(dir, "verb-types.js"), "window.VERB_TYPES = { categories: {}, verbs: {} };\n");
  assert.throws(() => loadVerbData(dir), /verb-types\.js: no VERB_TYPES entry/);
});

test("missing file and malformed data fail naming the file", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-verbdata-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => loadVerbData(dir), /data\.js: cannot be read/);
  fs.writeFileSync(path.join(dir, "data.js"), "window.VERB_DATA = { verbs: {} };\n");
  fs.writeFileSync(path.join(dir, "data-100.js"), "window.VERB_DATA_100 = { verbs: [] };\n");
  fs.writeFileSync(path.join(dir, "verb-types.js"), "window.VERB_TYPES = { categories: {}, verbs: {} };\n");
  assert.throws(() => loadVerbData(dir), /data\.js: window\.VERB_DATA\.verbs is not an array/);
});
