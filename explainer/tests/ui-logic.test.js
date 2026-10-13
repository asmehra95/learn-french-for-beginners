"use strict";
// Pure UI helpers on VT_EXPLAINER._test, run in a vm context with a minimal fake window
// (design §12.1 ui-logic row).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { splitSentences: serverSplit } = require("../lib/sentences");

const SRC = fs.readFileSync(path.join(__dirname, "..", "explainer.js"), "utf8");

function load() {
  const window = {};
  const ctx = vm.createContext({ window });
  new vm.Script(SRC, { filename: "explainer.js" }).runInContext(ctx, { timeout: 1000 });
  return window;
}
const WIN = load();
const T = WIN.VT_EXPLAINER._test;
// Values from the vm realm: compare through JSON so prototypes don't matter.
const plain = (v) => JSON.parse(JSON.stringify(v));

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  const calls = [];
  return {
    calls,
    getItem(k) { calls.push(["getItem", k]); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { calls.push(["setItem", k]); map.set(k, String(v)); },
    removeItem(k) { calls.push(["removeItem", k]); map.delete(k); },
  };
}
function noTrainerWrites(storage) {
  const writes = storage.calls.filter(([op, k]) => op !== "getItem" && /verbTrainer/.test(k));
  assert.deepEqual(writes, []);
}
const trainer = (settings) => JSON.stringify({ version: 2, settings });

const voice = (name, lang, voiceURI = `com.apple.voice.${name}`) => ({ name, lang, voiceURI });
const AMELIE = voice("Amélie (Premium)", "fr-CA", "com.apple.voice.premium.fr-CA.Amelie");
const THOMAS = voice("Thomas", "fr-FR", "com.apple.voice.compact.fr-FR.Thomas");
const GRANDMA = voice("Grandma (French (France))", "fr-FR", "com.apple.eloquence.fr-FR.Grandma");

test("the IIFE defines only window.VT_EXPLAINER with version, mount and _test", () => {
  assert.deepEqual(Object.keys(WIN), ["VT_EXPLAINER"]);
  assert.equal(WIN.VT_EXPLAINER.version, "1.1");
  assert.equal(typeof WIN.VT_EXPLAINER.mount, "function");
  assert.deepEqual(Object.keys(T).sort(), ["autoPick", "historyTrim", "isRoute", "readVoiceSettings", "splitSentences"]);
});

test("route ids: topic lesson ids (upper case) and verb routes become buttons; anything else does not", () => {
  for (const r of ["#topic/reflexive/R4", "#topic/questions/Q1", "#topic/questions", "#browse/lesson/23/se-lever", "#lesson/1"]) {
    assert.equal(T.isRoute(r), true, r);
  }
  for (const r of ["", "#", "topic/reflexive/R4", "javascript:alert(1)", "#a b", "#<img>", "#a?b", "#a.b", "#é", "#" + "a".repeat(81), null, 4]) {
    assert.equal(T.isRoute(r), false, String(r));
  }
});

test("mount throws TypeError for a non-Element container", () => {
  assert.throws(() => WIN.VT_EXPLAINER.mount({}), (e) => e && e.name === "TypeError");
});

test("autoPick: Amélie Premium fr-CA beats Thomas fr-FR and Grandma", () => {
  assert.equal(T.autoPick([AMELIE, THOMAS, GRANDMA]).name, "Amélie (Premium)");
});

test("autoPick: Thomas fr-FR beats the novelty Grandma voice", () => {
  assert.equal(T.autoPick([GRANDMA, THOMAS]).name, "Thomas");
});

test("autoPick: a Premium fr-FR voice wins when present", () => {
  const audreyPremium = voice("Audrey (Premium)", "fr-FR", "com.apple.voice.premium.fr-FR.Audrey");
  assert.equal(T.autoPick([AMELIE, THOMAS, GRANDMA, audreyPremium]).name, "Audrey (Premium)");
  const enhanced = voice("Thomas (Enhanced)", "fr_FR", "com.apple.voice.enhanced.fr-FR.Thomas");
  assert.equal(T.autoPick([AMELIE, enhanced]).name, "Thomas (Enhanced)");
});

test("autoPick: non-French voices are ignored; only novelty voices -> one of them; none -> null", () => {
  assert.equal(T.autoPick([voice("Samantha", "en-US")]), null);
  assert.equal(T.autoPick([GRANDMA]).name, GRANDMA.name);
  assert.equal(T.autoPick([]), null);
});

test("readVoiceSettings: options.voiceSettings beats stored settings", () => {
  const storage = fakeStorage({ "verbTrainer.v1": trainer({ voiceURI: "v1-uri", voiceName: "v1", speechRate: 1 }) });
  const s = plain(T.readVoiceSettings({ voiceSettings: { voiceURI: "opt-uri", rate: 2 } }, storage));
  assert.deepEqual(s, { voiceURI: "opt-uri", voiceName: "", rate: 1.2, source: "options" });
  noTrainerWrites(storage);
});

test("readVoiceSettings: v2 (if present) beats v1", () => {
  const storage = fakeStorage({
    "verbTrainer.v2": trainer({ voiceURI: "v2-uri", voiceName: "V2", speechRate: 0.7 }),
    "verbTrainer.v1": trainer({ voiceURI: "v1-uri", voiceName: "V1", speechRate: 1 }),
  });
  assert.deepEqual(plain(T.readVoiceSettings({}, storage)), { voiceURI: "v2-uri", voiceName: "V2", rate: 0.7, source: "verbTrainer.v2" });
  noTrainerWrites(storage);
});

test("readVoiceSettings: only v1 present (today's real layout) -> v1 is used, rate clamped", () => {
  const storage = fakeStorage({ "verbTrainer.v1": trainer({ voiceURI: "u", voiceName: "Amélie (Premium)", speechRate: 0.3 }) });
  assert.deepEqual(plain(T.readVoiceSettings(undefined, storage)), { voiceURI: "u", voiceName: "Amélie (Premium)", rate: 0.6, source: "verbTrainer.v1" });
  const noRate = fakeStorage({ "verbTrainer.v1": trainer({ voiceName: "Thomas" }) });
  assert.equal(T.readVoiceSettings({}, noRate).rate, 0.85);
  noTrainerWrites(storage);
  noTrainerWrites(noRate);
});

test("readVoiceSettings: corrupt v1, wrong types, blocked or missing storage -> auto", () => {
  const auto = { voiceURI: "", voiceName: "", rate: 0.85, source: "auto" };
  const corrupt = fakeStorage({ "verbTrainer.v1": "{not json" });
  assert.deepEqual(plain(T.readVoiceSettings({}, corrupt)), auto);
  const wrong = fakeStorage({ "verbTrainer.v1": JSON.stringify({ settings: "nope" }) });
  assert.deepEqual(plain(T.readVoiceSettings({}, wrong)), auto);
  const blocked = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("x"); }, removeItem() {} };
  assert.deepEqual(plain(T.readVoiceSettings({}, blocked)), auto);
  assert.deepEqual(plain(T.readVoiceSettings({}, null)), auto);
  // Wrong field types are ignored individually.
  const types = fakeStorage({ "verbTrainer.v1": trainer({ voiceURI: 5, voiceName: null, speechRate: "fast" }) });
  assert.deepEqual(plain(T.readVoiceSettings({}, types)), { voiceURI: "", voiceName: "", rate: 0.85, source: "verbTrainer.v1" });
  for (const s of [corrupt, wrong, types]) noTrainerWrites(s);
});

test("splitSentences mirror matches lib/sentences.js", () => {
  const cases = [
    "Est-ce que tu viens ce soir ?",
    "M. Dupont est là. Il parle.",
    "Quoi ?! Non…",
    "« Tu viens ? » dit-elle.",
    "« Tu viens ? » Elle part.",
    "je suis là. tu viens ?",
    "Il a 3.5 ans. Mme. Durand aussi.",
    "J. K. Rowling écrit. p. ex. ceci. Fin.",
    "Je m'appelle Paul. J'habite à Lyon avec ma sœur. Le week-end, nous allons au marché.",
    "Ligne un\nLigne deux. Trois !",
    "Pas de ponctuation",
    "",
  ];
  for (const c of cases) assert.deepEqual(plain(T.splitSentences(c)), serverSplit(c), c);
  assert.equal(T.splitSentences("« Tu viens ? » dit-elle.").length, 1);
});

test("historyTrim keeps at most 10 items, newest first", () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ id: `id${i}`, createdAt: "2025-01-01T00:00:00Z", text: `t${i}`, result: {} }));
  const out = plain(T.historyTrim(items));
  assert.equal(out.length, 10);
  assert.equal(out[0].id, "id0");
  assert.equal(out[9].id, "id9");
});

test("historyTrim drops the oldest items until the stored value is <= 400 KB", () => {
  const big = "é".repeat(60 * 1024); // 120 KB in UTF-8 per item
  const items = Array.from({ length: 6 }, (_, i) => ({ id: `id${i}`, text: "x", result: { pad: big } }));
  const out = plain(T.historyTrim(items));
  const bytes = Buffer.byteLength(JSON.stringify({ version: 1, items: out }), "utf8");
  assert.ok(bytes <= 400 * 1024, `size ${bytes}`);
  assert.equal(out.length, 3);
  assert.equal(out[0].id, "id0");
  // A single oversized item cannot be stored at all.
  assert.equal(T.historyTrim([{ id: "huge", result: { pad: "x".repeat(500 * 1024) } }]).length, 0);
});

// ---- mount() with a minimal fake DOM (no jsdom): headingLevel and setVoiceSettings (API 1.1) ----

class FakeNode {
  constructor(doc, tag, text) {
    this.ownerDocument = doc;
    this.nodeType = tag ? 1 : 3;
    this.tagName = tag ? tag.toUpperCase() : undefined;
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = [];
    this.text = text || "";
    this.value = "";
    this.disabled = false;
    const self = this;
    this.classList = {
      toggle(c, on) {
        const set = new Set(self.className.split(" ").filter(Boolean));
        if (on === undefined ? !set.has(c) : on) set.add(c);
        else set.delete(c);
        self.className = [...set].join(" ");
      },
    };
  }
  get firstChild() { return this.childNodes[0] || null; }
  get className() { return this.attrs.get("class") || ""; }
  set className(v) { this.attrs.set("class", String(v)); }
  get hidden() { return this.attrs.has("hidden"); }
  set hidden(v) { if (v) this.attrs.set("hidden", ""); else this.attrs.delete("hidden"); }
  get textContent() { return this.nodeType === 3 ? this.text : this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = v === "" ? [] : [new FakeNode(this.ownerDocument, null, String(v))];
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) {
    if (c.parentNode) c.parentNode.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  removeChild(c) {
    this.childNodes = this.childNodes.filter((x) => x !== c);
    c.parentNode = null;
    return c;
  }
  contains(n) {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  addEventListener(t, fn) { this.listeners.push([t, fn]); }
  removeEventListener(t, fn) { this.listeners = this.listeners.filter(([a, b]) => !(a === t && b === fn)); }
  focus() {}
  select() {}
  click() { for (const [t, fn] of this.listeners.slice()) if (t === "click") fn({ preventDefault() {} }); }
  /** Every element below this one, depth first. */
  all() { return this.childNodes.filter((c) => c.nodeType === 1).flatMap((c) => [c, ...c.all()]); }
}

function fakeWindow({ storage } = {}) {
  const doc = { createElement: (tag) => new FakeNode(doc, tag), createTextNode: (t) => new FakeNode(doc, null, t), execCommand: () => false };
  doc.body = new FakeNode(doc, "body");
  doc.activeElement = doc.body;
  const spoken = [];
  const synth = {
    getVoices: () => [THOMAS],
    speak: (u) => spoken.push(u),
    cancel() {},
    addEventListener() {},
    removeEventListener() {},
  };
  function SpeechSynthesisUtterance(text) { this.text = text; }
  const window = {
    document: doc,
    Element: FakeNode,
    localStorage: storage || fakeStorage(),
    speechSynthesis: synth,
    SpeechSynthesisUtterance,
    setTimeout,
    clearTimeout,
  };
  const ctx = vm.createContext({ window });
  new vm.Script(SRC, { filename: "explainer.js" }).runInContext(ctx, { timeout: 1000 });
  return { window, doc, spoken };
}

// One stored history item, so a result can be rendered without any fetch (the fake window has none).
const RESULT = {
  schemaVersion: "1.0",
  translation: { natural: "Hello." },
  sentences: [{ index: 0, status: "ok", french: "Bonjour.", english: "Hello.", chunks: [] }],
};
const historyStorage = () => fakeStorage({
  "frenchExplainer.v1": JSON.stringify({ version: 1, items: [{ id: "h1", createdAt: "2025-01-01T00:00:00Z", text: "Bonjour.", result: RESULT }] }),
});
const byClass = (root, cls) => root.all().filter((n) => n.className.split(" ").includes(cls));
function showStoredResult(container) {
  byClass(container, "vtx-hitem")[0].click();
}
function listenWhole(container) {
  const btn = container.all().find((n) => n.getAttribute("data-vtx-listen") === "input");
  btn.click();
}

test("mount: default heading levels are h2 title, h3 results, h4 sections", () => {
  const { window, doc } = fakeWindow({ storage: historyStorage() });
  const container = doc.createElement("div");
  const inst = window.VT_EXPLAINER.mount(container, { apiBase: "" });
  try {
    showStoredResult(container);
    assert.equal(byClass(container, "vtx-title")[0].tagName, "H2");
    assert.equal(byClass(container, "vtx-results-title")[0].tagName, "H3");
    const sections = byClass(container, "vtx-h4");
    assert.ok(sections.length >= 2);
    for (const s of sections) assert.equal(s.tagName, "H4");
  } finally {
    inst.destroy();
  }
});

test("mount: headingLevel 3 gives an h3 title, h4 results and h5 sections", () => {
  const { window, doc } = fakeWindow({ storage: historyStorage() });
  const container = doc.createElement("div");
  const inst = window.VT_EXPLAINER.mount(container, { apiBase: "", headingLevel: 3 });
  try {
    showStoredResult(container);
    assert.equal(byClass(container, "vtx-title")[0].tagName, "H3");
    assert.equal(byClass(container, "vtx-results-title")[0].tagName, "H4");
    const sections = byClass(container, "vtx-h4");
    assert.ok(sections.length >= 2);
    for (const s of sections) assert.equal(s.tagName, "H5");
    assert.equal(container.all().filter((n) => n.tagName === "H2").length, 0);
  } finally {
    inst.destroy();
  }
});

test("mount: an invalid headingLevel throws TypeError and mounts nothing", () => {
  const { window, doc } = fakeWindow();
  for (const bad of [1, 4, "3", null, 2.5, true]) {
    const container = doc.createElement("div");
    assert.throws(() => window.VT_EXPLAINER.mount(container, { apiBase: "", headingLevel: bad }),
      (e) => e && e.name === "TypeError" && /headingLevel/.test(e.message), String(bad));
    assert.equal(container.childNodes.length, 0);
  }
});

test("setVoiceSettings changes the rate (clamped 0.6-1.2) used by the next utterance; no-op after destroy", () => {
  const { window, doc, spoken } = fakeWindow({ storage: historyStorage() });
  const container = doc.createElement("div");
  const inst = window.VT_EXPLAINER.mount(container, { apiBase: "", voiceSettings: { rate: 0.7 } });
  assert.equal(typeof inst.setVoiceSettings, "function");
  showStoredResult(container);
  const say = () => {
    listenWhole(container);
    const u = spoken[spoken.length - 1];
    if (u.onend) u.onend(); // finish, so the next click speaks again instead of stopping
    return u;
  };
  try {
    assert.equal(say().rate, 0.7);
    inst.setVoiceSettings({ rate: 1.1 });
    assert.equal(say().rate, 1.1);
    inst.setVoiceSettings({ rate: 5 });
    assert.equal(say().rate, 1.2);
    inst.setVoiceSettings({ rate: 0.1 });
    const u = say();
    assert.equal(u.rate, 0.6);
    assert.equal(u.text, "Bonjour.");
    assert.equal(u.voice.name, "Thomas");
  } finally {
    inst.destroy();
  }
  assert.doesNotThrow(() => inst.setVoiceSettings({ rate: 1 }));
});
