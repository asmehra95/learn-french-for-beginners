#!/usr/bin/env node
/*
 * headless-check.mjs: headless Chrome check of the bundled native-speaker audio (dev-only).
 * Loads verb-trainer/index.html via file://, plays one full-phrase and one word-only clip from Lessons 6–25
 * through the native-audio button, and checks the Credits view. Prints a JSON summary; exit 0 on pass.
 * Run under a timeout: /opt/homebrew/bin/timeout 120 node headless-check.mjs
 * Cleanup never relies on Chrome exiting by itself: SIGTERM, SIGKILL after 2 s, pkill on the profile dir,
 * then the throwaway /tmp profile is deleted.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(scriptDir, "../../verb-trainer");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const summary = { ok: false, chrome: null, targets: [], played: [], credits: null, consoleErrors: [], failures: [] };
function check(cond, msg) { if (!cond) summary.failures.push(msg); return !!cond; }

/* ---------- site data (Node side) ---------- */
const require = createRequire(import.meta.url);
globalThis.window = {};
for (const f of ["data.js", "data-100.js", "verb-types.js", "topics-data.js", "merge-data.js"]) require(path.join(SITE, "js", f));
const DATA = globalThis.window.VERB_DATA;
const w = {};
new Function("window", fs.readFileSync(path.join(SITE, "js", "audio-manifest.js"), "utf8"))(w);
const ITEMS = w.VERB_AUDIO.items;
const numOf = {}, lessonOf = {};
DATA.verbs.forEach((v, i) => { numOf[v.id] = i + 1; });
DATA.lessons.forEach((l) => l.verbIds.forEach((id) => { lessonOf[id] = l.id; }));
const PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p"];
// The browse card shows infinitive + present + past/future/sentence; pick keys the card renders as listen-word buttons.
const late = Object.entries(ITEMS).filter(([k]) => numOf[k.split("|")[0]] > 25);
const pick = (scope) => {
  const e = late.find(([k, it]) => it.scope === scope && PERSONS.includes(k.split("|")[1])) || late.find(([, it]) => it.scope === scope);
  return e ? { key: e[0], item: e[1], verbId: e[0].split("|")[0], lesson: lessonOf[e[0].split("|")[0]] } : null;
};
const targets = [pick("phrase"), pick("word")].filter(Boolean);
if (!pick("phrase")) summary.notes = ["no full-phrase item for verbs 26–125; tested the word-only item only"];
const lateSpeakers = [...new Set(late.map(([, it]) => it.speaker))];

/* ---------- minimal CDP client ---------- */
class CDP {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); this.handlers = new Map(); this.ws = null; }
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("CDP WebSocket error")), { once: true });
      ws.addEventListener("message", (ev) => this.onMessage(ev.data));
      ws.addEventListener("close", () => {
        for (const p of this.pending.values()) p.reject(new Error("CDP socket closed"));
        this.pending.clear();
      });
    });
  }
  onMessage(data) {
    let msg;
    try { msg = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString("utf8")); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`)); else p.resolve(msg.result || {});
      return;
    }
    if (msg.method) for (const fn of this.handlers.get(msg.method) || []) fn(msg.params || {}, msg.sessionId);
  }
  send(method, params = {}, sessionId, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no reply in ${timeoutMs} ms`)); }, timeoutMs);
      this.pending.set(id, { method, resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  once(method, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} not received in ${ms} ms`)), ms);
      const fn = (params) => { clearTimeout(timer); const l = this.handlers.get(method); l.splice(l.indexOf(fn), 1); resolve(params); };
      this.on(method, fn);
    });
  }
  close() { try { if (this.ws) this.ws.close(); } catch { /* ignore */ } }
}

let chrome = null, profileDir = null, cdp = null, cleaned = false;
function exited(proc, ms) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), ms);
    proc.once("exit", () => { clearTimeout(t); resolve(true); });
  });
}
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (cdp) cdp.close();
  if (chrome) {
    try { chrome.kill("SIGTERM"); } catch { /* gone */ }
    if (!(await exited(chrome, 2000))) { try { chrome.kill("SIGKILL"); } catch { /* gone */ } await exited(chrome, 2000); }
  }
  if (profileDir) {
    try { execFileSync("pkill", ["-f", `user-data-dir=${profileDir}`], { stdio: "ignore" }); } catch { /* nothing left */ }
    await sleep(300);
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { summary.failures.push(`could not remove ${profileDir}: ${e.message}`); }
  }
}
async function launchChrome() {
  profileDir = fs.mkdtempSync("/tmp/vt-native-chrome-");
  chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    "--autoplay-policy=no-user-gesture-required", "--mute-audio", "--disable-audio-output", `--user-data-dir=${profileDir}`, "about:blank"
  ], { stdio: ["ignore", "ignore", "ignore"] });
  const file = path.join(profileDir, "DevToolsActivePort");
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    try {
      const [port, wsPath] = fs.readFileSync(file, "utf8").split("\n");
      if (port && wsPath) return `ws://127.0.0.1:${port.trim()}${wsPath.trim()}`;
    } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error("DevToolsActivePort did not appear within 10 s");
}

/* Records every Audio instance: { src, playing, error }. Returns the real HTMLAudioElement. */
const AUDIO_SPY = `(() => {
  const Real = window.Audio;
  window.__vtAudio = [];
  function Spy(src) {
    const a = arguments.length ? new Real(src) : new Real();
    const rec = { src: a.src || String(src || ""), playing: false, error: null };
    window.__vtAudio.push(rec);
    a.addEventListener("playing", () => { rec.playing = true; rec.src = a.currentSrc || a.src; });
    a.addEventListener("error", () => { rec.error = (a.error && a.error.code) || "error"; });
    return a;
  }
  Spy.prototype = Real.prototype;
  window.Audio = Spy;
})();`;

async function main() {
  const wsUrl = await launchChrome();
  cdp = new CDP(wsUrl);
  await cdp.open();
  const ver = await cdp.send("Browser.getVersion");
  summary.chrome = ver.product;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const errors = summary.consoleErrors;
  cdp.on("Runtime.consoleAPICalled", (p, sid) => {
    if (sid === sessionId && (p.type === "error" || p.type === "assert")) errors.push(`console.${p.type}: ${(p.args || []).map((a) => a.value ?? a.description ?? "").join(" ")}`);
  });
  cdp.on("Runtime.exceptionThrown", (p, sid) => {
    if (sid !== sessionId) return;
    const d = p.exceptionDetails || {};
    errors.push(`exception: ${(d.exception && d.exception.description) || d.text}`);
  });
  cdp.on("Log.entryAdded", (p, sid) => {
    if (sid === sessionId && p.entry && p.entry.level === "error") errors.push(`log: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ""}`);
  });
  const send = (m, params, ms) => cdp.send(m, params, sessionId, ms);
  for (const d of ["Runtime.enable", "Log.enable", "Page.enable"]) await send(d);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_SPY });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error("evaluate: " + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result ? r.result.value : undefined;
  };
  const poll = async (expression, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = await evaluate(expression); if (v) return v; await sleep(200); }
    return null;
  };
  const indexUrl = pathToFileURL(path.join(SITE, "index.html")).href;
  const loaded = cdp.once("Page.loadEventFired", 15000);
  await send("Page.navigate", { url: indexUrl });
  await loaded;
  await sleep(500);

  for (const t of targets) {
    const rec = { key: t.key, file: t.item.file, said: t.item.said, scope: t.item.scope, speaker: t.item.speaker, lesson: t.lesson };
    summary.targets.push(rec);
    await evaluate(`location.hash = ${JSON.stringify(`#browse/lesson/${t.lesson}/${t.verbId}`)}`);
    const sel = `#verb-${t.verbId} button.listen-word[data-key="${t.key}"]`;
    const found = await poll(`!!document.querySelector(${JSON.stringify(sel)})`, 5000);
    if (!check(found, `${t.key}: ${sel} not found`)) continue;
    rec.label = await evaluate(`document.querySelector(${JSON.stringify(sel)}).querySelector(".listen-text").textContent`);
    const okLabels = t.item.scope === "phrase" ? ["Native", "Native speaker"] : ["Word", "Native speaker (word only)"];
    check(okLabels.includes(rec.label), `${t.key}: label "${rec.label}" (expected ${okLabels.join(" or ")})`);
    rec.ariaLabel = await evaluate(`document.querySelector(${JSON.stringify(sel)}).getAttribute("aria-label")`);
    await sleep(600); // the router scrolls the verb card into view after rendering
    await evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: "center" })`);
    await sleep(300);
    const box = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, hidden: b.hidden }; })()`);
    if (!check(box && box.w > 0 && !box.hidden, `${t.key}: button not visible`)) continue;
    rec.hit = await evaluate(`(() => { const e = document.elementFromPoint(${box.x}, ${box.y}); const b = e && e.closest("button"); return e ? e.tagName + "." + e.className + (b ? " in button " + b.className + " " + b.getAttribute("data-key") : "") : null; })()`);
    const before = await evaluate("window.__vtAudio.length");
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
    const want = "/" + t.item.file;
    const played = await poll(`(() => { const a = window.__vtAudio; if (a.length <= ${before}) return null; const r = a[a.length - 1]; return decodeURIComponent(r.src).endsWith(${JSON.stringify(want)}) && r.playing && r.error === null ? r : null; })()`, 5000);
    rec.audio = await evaluate("window.__vtAudio.slice(-1)[0] || null");
    if (check(played, `${t.key}: <audio> did not play ${t.item.file} (last: ${JSON.stringify(rec.audio)})`)) summary.played.push(t.item.file);
    rec.status = await evaluate(`document.getElementById("audio-status").textContent`);
    check(rec.status && rec.status.includes(t.item.speaker), `${t.key}: #audio-status "${rec.status}" lacks speaker ${t.item.speaker}`);
    const prefix = t.item.scope === "phrase" ? "Native speaker:" : "Native speaker, word only:";
    check(rec.status && rec.status.trim().startsWith(prefix), `${t.key}: #audio-status should start with "${prefix}"`);
  }

  await evaluate(`location.hash = "#credits"`);
  const ok = await poll(`!!document.querySelector("#credits-body table.credits-table")`, 5000);
  if (check(ok, "Credits view: no table.credits-table")) {
    const text = await evaluate(`document.getElementById("credits-body").textContent`);
    const missing = lateSpeakers.filter((s) => !text.includes(s));
    const covRows = await evaluate(`(() => { const t = document.querySelector('#credits-body [aria-label="Native recording coverage"] table'); return t ? t.tBodies[0].rows.length : -1; })()`);
    const covText = await evaluate(`(() => { const t = document.querySelector('#credits-body [aria-label="Native recording coverage"] table'); return t ? Array.from(t.tBodies[0].rows).map((r) => Array.from(r.cells).map((c) => c.textContent).join(" | ")) : null; })()`);
    summary.credits = { speakersLessons6to25: lateSpeakers, missingSpeakers: missing, coverageRows: covRows, coverageTable: covText };
    check(missing.length === 0, "Credits view lacks speakers: " + missing.join(", "));
    check(covRows === 6, `coverage table has ${covRows} body rows (expected 6)`);
    const link = await evaluate(`(() => { const a = document.querySelector('#credits-body a[download]'); return a ? { href: a.getAttribute("href"), download: a.getAttribute("download"), text: a.textContent } : null; })()`);
    summary.credits.downloadLink = link;
    if (check(link && link.href === "audio/downloads/native-recordings.zip", "Credits view: no download link to audio/downloads/native-recordings.zip")) {
      check(fs.existsSync(path.join(SITE, link.href)), "download zip missing on disk");
      check(/^Download native recordings \(\.zip, \d+\.\d MB\)$/.test(link.text), `download link text "${link.text}"`);
    }
  }
  await sleep(300);
  check(errors.length === 0, `${errors.length} console error(s)`);
  summary.ok = summary.failures.length === 0;
}

const watchdog = setTimeout(async () => { summary.failures.push("watchdog: 100 s"); await cleanup(); console.log(JSON.stringify(summary, null, 2)); process.exit(1); }, 100000);
try {
  await main();
} catch (e) {
  summary.failures.push("error: " + (e && e.message ? e.message : e));
} finally {
  clearTimeout(watchdog);
  await cleanup();
  summary.ok = summary.failures.length === 0;
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}
