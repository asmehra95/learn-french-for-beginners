"use strict";
// Headless Chrome check of the demo page (design §12.3). Run: npm run test:ui
//   (always under a timeout, e.g. `timeout 120 npm run test:ui`).
// Optional: --real <port>  also loads http://127.0.0.1:<port>/ (an already-running real server with
//   Mistral), explains "Je m'appelle Marie." (poll up to 330 s) and applies the console-error and
//   Listen-present assertions. The watchdog is 420 s in that mode instead of 90 s.
//
// Talks to Chrome over the DevTools protocol with Node's global WebSocket (no packages). Cleanup never
// relies on Chrome exiting by itself: SIGTERM, SIGKILL after 2 s, pkill on the unique profile dir,
// then the profile is deleted and the fixture server stopped.
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const fixture = require("./fixture-server");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS_DIR = "/tmp/explainer-shots";
const REAL_TEXT = "Je m'appelle Marie.";

const argv = process.argv.slice(2);
const realAt = argv.indexOf("--real");
let REAL_PORT = null;
if (realAt !== -1) {
  REAL_PORT = Number(argv[realAt + 1]);
  if (!Number.isInteger(REAL_PORT) || REAL_PORT < 1 || REAL_PORT > 65535) {
    console.error("Usage: node tests/ui/headless-check.js [--real <port>]");
    process.exit(2);
  }
}
const WATCHDOG_MS = REAL_PORT ? 420000 : 90000;

const summary = {
  ok: false,
  checks: {},
  failures: [],
  consoleErrors: [],
  contrast: {},
  translator: null,
  screenshots: [],
  details: {},
  real: null,
};
function check(name, cond, detail) {
  summary.checks[name] = cond ? "pass" : "fail";
  if (!cond) summary.failures.push(detail ? `${name}: ${detail}` : name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- minimal CDP client ---------- */
class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = null;
  }
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP WebSocket error")), { once: true });
      ws.addEventListener("message", (ev) => this.onMessage(ev.data));
      ws.addEventListener("close", () => {
        for (const { reject: rj } of this.pending.values()) rj(new Error("CDP socket closed"));
        this.pending.clear();
      });
    });
  }
  onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
    } catch {
      return;
    }
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result || {});
      return;
    }
    if (msg.method) for (const fn of this.handlers.get(msg.method) || []) fn(msg.params || {}, msg.sessionId);
  }
  send(method, params = {}, sessionId, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no reply in ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  once(method, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} not received in ${ms} ms`)), ms);
      const fn = (params) => {
        clearTimeout(timer);
        const list = this.handlers.get(method);
        list.splice(list.indexOf(fn), 1);
        resolve(params);
      };
      this.on(method, fn);
    });
  }
  close() {
    try {
      if (this.ws) this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

/* ---------- process state for cleanup ---------- */
let chrome = null;
let profileDir = null;
let cdp = null;
let chromeStderr = "";
let cleaned = false;

function exited(proc, ms) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    proc.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
}

async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (cdp) cdp.close();
  if (chrome) {
    try { chrome.kill("SIGTERM"); } catch { /* already gone */ }
    if (!(await exited(chrome, 2000))) {
      try { chrome.kill("SIGKILL"); } catch { /* already gone */ }
      await exited(chrome, 2000);
    }
  }
  if (profileDir) {
    try {
      execFileSync("pkill", ["-f", `user-data-dir=${profileDir}`], { stdio: "ignore" });
    } catch {
      /* exit 1 = nothing left to kill */
    }
    await sleep(300);
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      summary.failures.push(`could not remove profile ${profileDir}: ${err.message}`);
    }
  }
  try { await fixture.stop(); } catch { /* ignore */ }
}

/* ---------- Chrome ---------- */
async function launchChrome() {
  profileDir = fs.mkdtempSync("/tmp/explainer-chrome-");
  chrome = spawn(CHROME, [
    "--headless=new",
    "--mute-audio",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.on("data", (d) => { chromeStderr = (chromeStderr + d.toString()).slice(-4000); });
  chrome.on("error", (err) => { chromeStderr += `\nspawn error: ${err.message}`; });
  const file = path.join(profileDir, "DevToolsActivePort");
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    try {
      const [port, wsPath] = fs.readFileSync(file, "utf8").split("\n");
      if (port && wsPath) return `ws://127.0.0.1:${port.trim()}${wsPath.trim()}`;
    } catch {
      /* not written yet */
    }
    await sleep(100);
  }
  throw new Error("DevToolsActivePort did not appear within 10 s");
}

/* ---------- page helpers ---------- */
function makePage(sessionId) {
  const errors = [];
  cdp.on("Runtime.consoleAPICalled", (p, sid) => {
    if (sid !== sessionId) return;
    if (p.type === "error" || p.type === "assert") {
      errors.push(`console.${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? "").join(" ")}`);
    }
  });
  cdp.on("Runtime.exceptionThrown", (p, sid) => {
    if (sid !== sessionId) return;
    const d = p.exceptionDetails || {};
    errors.push(`exception: ${(d.exception && d.exception.description) || d.text}`);
  });
  cdp.on("Log.entryAdded", (p, sid) => {
    if (sid !== sessionId) return;
    const e = p.entry || {};
    if (e.level === "error") errors.push(`log: ${e.text}${e.url ? ` (${e.url})` : ""}`);
  });
  cdp.on("Page.javascriptDialogOpening", (p, sid) => {
    if (sid !== sessionId) return;
    errors.push(`dialog opened: ${p.type} ${p.message}`);
    cdp.send("Page.handleJavaScriptDialog", { accept: false }, sessionId).catch(() => {});
  });
  const send = (m, params, ms) => cdp.send(m, params, sessionId, ms);
  async function evaluate(expression, awaitPromise = false) {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`evaluate failed: ${(d.exception && d.exception.description) || d.text}`);
    }
    return r.result ? r.result.value : undefined;
  }
  async function poll(expression, ms, step = 200) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await evaluate(expression);
      if (v) return v;
      await sleep(step);
    }
    return null;
  }
  async function navigate(url) {
    const loaded = cdp.once("Page.loadEventFired", 15000);
    const r = await send("Page.navigate", { url });
    if (r.errorText) throw new Error(`navigate ${url}: ${r.errorText}`);
    await loaded;
  }
  async function viewport(width, height, theme) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
    await sleep(300);
  }
  async function screenshot(name) {
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(SHOTS_DIR, name);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    summary.screenshots.push(file);
  }
  return { errors, send, evaluate, poll, navigate, viewport, screenshot };
}

/* ---------- in-page expressions ---------- */
const typeAndExplain = (text) => `(() => {
  const ta = document.querySelector(".vtx-input");
  if (!ta) return "no textarea";
  ta.value = ${JSON.stringify(text)};
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  const b = document.querySelector('.vtx [data-vtx-action="explain"]');
  if (!b) return "no explain button";
  if (b.disabled) return "explain disabled";
  b.click();
  return "clicked";
})()`;

const RESULTS_SHOWN = `(() => { const r = document.querySelector(".vtx-results"); return !!r && !r.hidden; })()`;
const RESULT_OR_ERROR = `(() => {
  const r = document.querySelector(".vtx-results"); const e = document.querySelector(".vtx-error");
  if (r && !r.hidden) return "results";
  if (e && !e.hidden && !document.querySelector('.vtx [data-vtx-action="cancel"]:not([hidden])')) return "error: " + e.textContent;
  return null;
})()`;

const INSPECT = `(() => {
  const root = document.querySelector(".vtx");
  const q = (s) => root.querySelectorAll(s).length;
  const first = root.querySelector(".vtx-sentence");
  const bd = first && first.querySelector(".vtx-breakdown");
  const label = document.querySelector('label[for="' + root.querySelector(".vtx-input").id + '"]');
  const unnamed = [...root.querySelectorAll("button")].filter((b) => !(b.getAttribute("aria-label") || b.textContent).trim()).length;
  return {
    speechSynthesis: typeof speechSynthesis !== "undefined",
    listenInput: q('[data-vtx-listen="input"]'),
    listenSentence: q('[data-vtx-listen="sentence"]'),
    listenChunkFirst: bd && !bd.hidden ? bd.querySelectorAll('[data-vtx-listen="chunk"]').length : 0,
    listenGuide: q('[data-vtx-listen="guide"]'),
    notice: (root.querySelector(".vtx-notice") || {}).textContent || "",
    text: root.textContent,
    imgInVtx: root.querySelectorAll("img").length,
    irregular: [...root.querySelectorAll(".vtx-badge")].some((b) => b.textContent === "Irregular"),
    focusOnResults: document.activeElement === root.querySelector(".vtx-results-title"),
    textareaLabel: label ? label.textContent : null,
    unnamedButtons: unnamed,
    status: (root.querySelector(".vtx-status") || {}).textContent || "",
    voiceNote: (root.querySelector(".vtx-note:not([hidden])") || {}).textContent || "",
    sentenceCards: q(".vtx-sentence"),
  };
})()`;

const EXPAND_ALL = `(() => {
  document.querySelectorAll('.vtx-sentence .vtx-disclosure[aria-expanded="false"]').forEach((b) => b.click());
  return document.querySelectorAll('.vtx-sentence .vtx-disclosure[aria-expanded="true"]').length;
})()`;

const LAYOUT = `(() => {
  const small = [...document.querySelectorAll(".vtx button")].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 43.5 || r.height < 43.5);
  }).map((b) => b.textContent.trim().slice(0, 30));
  return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, smallButtons: small };
})()`;

// WCAG contrast of computed colors. Background = first ancestor background with alpha > 0,
// composited over further ancestors when translucent; fallback white (light) / .vtx-page bg (dark).
const CONTRAST = (theme) => `(() => {
  const parse = (c) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || "");
    if (!m) return null;
    const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a), a: 1,
  });
  const pageBg = parse(getComputedStyle(document.body).backgroundColor);
  const fallback = ${JSON.stringify(theme)} === "dark" && pageBg && pageBg.a > 0 ? pageBg : { r: 255, g: 255, b: 255, a: 1 };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let out = fallback;
    for (let i = layers.length - 1; i >= 0; i--) out = layers[i].a >= 1 ? layers[i] : over(layers[i], out);
    return out;
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const root = document.querySelector(".vtx");
  // Sample chips/boxes for every pos color and message style (removed again below).
  const probe = document.createElement("div");
  probe.className = "vtx-card";
  const classes = ["vtx-pos-verb", "vtx-pos-noun", "vtx-pos-pronoun", "vtx-pos-adjective", "vtx-pos-negation",
    "vtx-pos-question", "vtx-pos-other", "vtx-badge vtx-badge-regular", "vtx-badge vtx-badge-irregular",
    "vtx-badge vtx-badge-reflexive", "vtx-badge vtx-badge-unknown", "vtx-topic"];
  for (const c of classes) {
    const s = document.createElement("span");
    s.className = "vtx-chip " + c;
    s.textContent = c;
    s.setAttribute("data-probe", "chip " + c.split(" ").pop());
    probe.appendChild(s);
  }
  const box = (cls, inner, name) => {
    const d = document.createElement("div"); d.className = cls;
    const p = document.createElement(inner); p.textContent = name; p.setAttribute("data-probe", name);
    d.appendChild(p); probe.appendChild(d);
  };
  box("vtx-error", "p", "error text");
  box("vtx-error vtx-error-info", "p", "info text");
  box("vtx-verb", "p", "verb panel text");
  const chk = document.createElement("p"); chk.className = "vtx-check"; chk.textContent = "Check: x"; chk.setAttribute("data-probe", "check line");
  probe.appendChild(chk);
  const warn = document.createElement("span"); warn.className = "vtx-warn-text"; warn.textContent = "Too long"; warn.setAttribute("data-probe", "warning text");
  probe.appendChild(warn);
  root.appendChild(probe);
  const targets = [
    ["body text", root.querySelector(".vtx-intro")],
    ["heading", root.querySelector(".vtx-title")],
    ["muted text", root.querySelector(".vtx-card .vtx-muted")],
    ["counter", root.querySelector(".vtx-count")],
    ["status", root.querySelector(".vtx-status-text")],
    ["voice note", root.querySelector(".vtx-note:not([hidden])")],
    ["chip (rendered)", root.querySelector(".vtx-chunk .vtx-chip")],
    ["primary button", root.querySelector(".vtx-btn-primary")],
    ["button", root.querySelector(".vtx-listen") || root.querySelector('[data-vtx-action="copy"]')],
    ["notice", root.querySelector(".vtx-notice p")],
    ["source label", root.querySelector(".vtx-source")],
    ["footer", document.querySelector(".vtx-footer")],
    ...[...probe.querySelectorAll("[data-probe]")].map((e) => [e.getAttribute("data-probe"), e]),
  ];
  const out = {};
  for (const [name, el] of targets) {
    if (!el) { out[name] = null; continue; }
    const fg = parse(getComputedStyle(el).color);
    const bg = bgOf(el);
    out[name] = fg ? Math.round(ratio(fg.a < 1 ? over(fg, bg) : fg, bg) * 100) / 100 : null;
  }
  probe.remove();
  return out;
})()`;

const TRANSLATOR = `(async () => {
  const t = typeof Translator;
  let availability = null;
  if (t !== "undefined") {
    try { availability = await Translator.availability({ sourceLanguage: "fr", targetLanguage: "en" }); }
    catch (e) { availability = "error: " + (e && e.message); }
  }
  return { typeofTranslator: t, availability };
})()`;

const SCROLL_TO = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (el) el.scrollIntoView({ block: "start" });
  return !!el;
})()`;

/* ---------- main ---------- */
async function main() {
  const { port, url } = await fixture.start();
  summary.details.fixtureUrl = url;
  const wsUrl = await launchChrome();
  cdp = new CDP(wsUrl);
  await cdp.open();
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const page = makePage(sessionId);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");

  await page.viewport(390, 844, "light");
  await page.navigate(url);
  await page.poll(`!!document.querySelector(".vtx-status-ok")`, 5000);
  const clicked = await page.evaluate(typeAndExplain(fixture.INPUT));
  check("explain clicked", clicked === "clicked", clicked);
  const shown = await page.poll(RESULTS_SHOWN, 15000);
  check("results heading shown within 15 s", !!shown);
  if (!shown) throw new Error("results never appeared");
  await sleep(300);

  const info = await page.evaluate(INSPECT);
  summary.details.inspect = { ...info, text: undefined };
  check("speechSynthesis available in headless Chrome", info.speechSynthesis);
  check("Listen for the whole input = 1", info.listenInput === 1, String(info.listenInput));
  check("Listen per sentence = 2", info.listenSentence === 2, String(info.listenSentence));
  check("Listen per chunk of the expanded sentence >= 1", info.listenChunkFirst >= 1, String(info.listenChunkFirst));
  check("guide-pronunciation Listen present", info.listenGuide >= 1, String(info.listenGuide));
  check("AI notice text", info.notice.includes("AI-generated - may contain errors"), info.notice);
  check("Irregular badge", info.irregular);
  check("XSS payload rendered as literal text", info.text.includes(fixture.XSS));
  check("no img element inside .vtx", info.imgInVtx === 0, String(info.imgInVtx));
  check("merged auxiliary shown as helper verb", info.text.includes("helper verb for 'allés'"));
  check("focus moved to results heading", info.focusOnResults);
  check("textarea has a visible label", info.textareaLabel === "French text", String(info.textareaLabel));
  check("every button has an accessible name", info.unnamedButtons === 0, String(info.unnamedButtons));
  check("status line shows Ready", /Ready/.test(info.status), info.status);

  const expanded = await page.evaluate(EXPAND_ALL);
  summary.details.expandedSentences = expanded;

  const shots = [
    { name: "mobile-light.png", w: 390, h: 844, theme: "light", scroll: ".vtx-results-title" },
    { name: "mobile-dark.png", w: 390, h: 844, theme: "dark", scroll: ".vtx-results-title" },
    { name: "desktop-light.png", w: 1280, h: 900, theme: "light", scroll: ".vtx-sentence" },
    { name: "desktop-dark.png", w: 1280, h: 900, theme: "dark", scroll: ".vtx-sentence" },
  ];
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const s of shots) {
    await page.viewport(s.w, s.h, s.theme);
    const layout = await page.evaluate(LAYOUT);
    summary.details[`layout ${s.w} ${s.theme}`] = layout;
    if (s.w === 390) {
      check(`no horizontal overflow at 390 (${s.theme})`, layout.scrollWidth <= 390, `scrollWidth ${layout.scrollWidth}`);
      check(`buttons >= 44x44 at 390 (${s.theme})`, layout.smallButtons.length === 0, layout.smallButtons.join(", "));
      const ratios = await page.evaluate(CONTRAST(s.theme));
      summary.contrast[s.theme] = ratios;
      const low = Object.entries(ratios).filter(([, r]) => r === null || r < 4.5);
      check(`contrast >= 4.5 (${s.theme})`, low.length === 0, low.map(([k, r]) => `${k}=${r}`).join(", "));
    }
    await page.evaluate(SCROLL_TO(s.scroll));
    await sleep(200);
    await page.screenshot(s.name);
  }

  summary.translator = await page.evaluate(TRANSLATOR, true);
  summary.consoleErrors.push(...page.errors);
  check("zero console errors / exceptions (fixture)", page.errors.length === 0, page.errors.join(" | "));

  if (REAL_PORT) {
    const realUrl = `http://127.0.0.1:${REAL_PORT}/`;
    const before = page.errors.length;
    await page.viewport(1280, 900, "light");
    await page.navigate(realUrl);
    await sleep(1000);
    const c = await page.evaluate(typeAndExplain(REAL_TEXT));
    const t0 = Date.now();
    const outcome = c === "clicked" ? await page.poll(RESULT_OR_ERROR, 330000, 1000) : `not clicked: ${c}`;
    const realInfo = outcome === "results" ? await page.evaluate(INSPECT) : null;
    const realErrors = page.errors.slice(before);
    summary.real = {
      url: realUrl,
      outcome: outcome || "timed out after 330 s",
      seconds: Math.round((Date.now() - t0) / 1000),
      listenInput: realInfo ? realInfo.listenInput : null,
      listenSentence: realInfo ? realInfo.listenSentence : null,
      listenChunkFirst: realInfo ? realInfo.listenChunkFirst : null,
      consoleErrors: realErrors,
    };
    check("real: explanation rendered", outcome === "results", String(outcome));
    check("real: zero console errors", realErrors.length === 0, realErrors.join(" | "));
    check("real: Listen buttons present", !!realInfo && realInfo.listenInput === 1 && realInfo.listenSentence >= 1);
  }
  void port;
}

const watchdog = setTimeout(async () => {
  summary.failures.push(`watchdog: run exceeded ${WATCHDOG_MS / 1000} s`);
  await cleanup();
  finish(1);
}, WATCHDOG_MS);

function finish(code) {
  clearTimeout(watchdog);
  summary.ok = code === 0 && summary.failures.length === 0;
  if (!summary.ok && chromeStderr) summary.details.chromeStderrTail = chromeStderr.slice(-1500);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}

main()
  .then(async () => {
    await cleanup();
    finish(0);
  })
  .catch(async (err) => {
    summary.failures.push(`error: ${err && err.message ? err.message : String(err)}`);
    await cleanup();
    finish(1);
  });
