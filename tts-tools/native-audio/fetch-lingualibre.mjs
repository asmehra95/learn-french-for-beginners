#!/usr/bin/env node
/*
 * fetch-lingualibre.mjs: fetch native-speaker recordings (Lingua Libre, via Wikimedia Commons) for the
 * verb trainer, process them with ffmpeg and regenerate js/audio-manifest.js and audio/CREDITS.md.
 * Dependency-free ESM, Node >= 18. See README.md next to this file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/* ---------- CLI ---------- */
function parseArgs(argv) {
  const o = {
    dryRun: false,
    site: path.resolve(scriptDir, "../../verb-trainer"),
    only: null,
    process: true,
    contact: process.env.LL_CONTACT || "",  // set LL_CONTACT=you@example.com for faster downloads
    report: path.join(scriptDir, "last-run.json")
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") o.dryRun = true;
    else if (a === "--outputs-only") o.outputsOnly = true;
    else if (a === "--no-process") o.process = false;
    else if (a === "--site") o.site = path.resolve(argv[++i]);
    else if (a === "--only") o.only = new Set(argv[++i].split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--contact") o.contact = argv[++i];
    else if (a === "--report") o.report = path.resolve(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node fetch-lingualibre.mjs [--dry-run | --outputs-only] [--site <dir>] [--only id,id] [--no-process] [--contact <email>] [--report <file>]");
      process.exit(0);
    } else {
      console.error("Unknown argument: " + a);
      process.exit(2);
    }
  }
  return o;
}
const opts = parseArgs(process.argv.slice(2));
const STATE_FILE = path.join(scriptDir, "state.json");
const SPEAKER_CACHE = path.join(scriptDir, "cache", "speakers.json");
const AUDIO_DIR = path.join(opts.site, "audio");
const MANIFEST_FILE = path.join(opts.site, "js", "audio-manifest.js");
const CREDITS_FILE = path.join(AUDIO_DIR, "CREDITS.md");

/* ---------- a. site loading ---------- */
function loadSite() {
  const require = createRequire(import.meta.url);
  globalThis.window = {};
  for (const f of ["data.js", "data-100.js", "verb-types.js", "topics-data.js", "merge-data.js"]) {
    require(path.join(opts.site, "js", f));
  }
  const L = require(path.join(opts.site, "js", "logic.js"));
  const DATA = globalThis.window.VERB_DATA;
  const src = fs.readFileSync(MANIFEST_FILE, "utf8");
  const w = {};
  new Function("window", src)(w);
  return { L, DATA, manifest: w.VERB_AUDIO };
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/* ---------- b. HTTP client (one serial queue, >= 1 s between request starts) ---------- */
const PROJECT_URL = "https://github.com/asmehra95/say-it-in-french";
const UA = `FrenchVerbTrainer/1.0 (${PROJECT_URL}; ${opts.contact}) node-fetch`;
/* Wikimedia's 2026 API rate limits: 200 req/min with a compliant User-Agent (contact email or URL),
   10 req/min without one. Without a real --contact the script stays under 10/min. */
const HAS_CONTACT = /@|https?:\/\//.test(opts.contact);
const MIN_GAP_MS = HAS_CONTACT ? 1000 : 6500;
const MAX_GAP_MS = Math.max(4000, MIN_GAP_MS * 2);
/* Per-host minimum gap on top of the shared 1 s: API hosts use MIN_GAP_MS; upload.wikimedia.org (MP3 files,
   not the API) uses 1 s. A 429 doubles that host's gap (max MAX_GAP_MS); 50 clean requests ease it back. */
const hostState = {};
function hostOf(host) {
  if (!hostState[host]) {
    const base = host === "upload.wikimedia.org" ? 1000 : MIN_GAP_MS;
    hostState[host] = { base, gap: base, last: 0, clean: 0 };
  }
  return hostState[host];
}
const BACKOFF_S = [2, 4, 8, 16, 32];
const MAX_ATTEMPTS = 6;
const stats = { requests: {}, total: 0, retries: 0, started: Date.now() };
let lastStart = 0;
let chain = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function http(url, kind, maxAttempts) {
  const limit = maxAttempts || MAX_ATTEMPTS;
  const run = async () => {
    const host = new URL(url).host;
    const hs = hostOf(host);
    for (let attempt = 1; attempt <= limit; attempt++) {
      const wait = Math.max(lastStart + 1000, hs.last + hs.gap) - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = hs.last = Date.now();
      stats.requests[host] = (stats.requests[host] || 0) + 1;
      stats.total++;
      let retryAfter = null;
      let why = "";
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, redirect: "follow" });
        if (res.status === 429 || res.status === 503) {
          retryAfter = Number(res.headers.get("retry-after")) || null;
          if (res.status === 429) { hs.gap = Math.min(Math.max(MAX_GAP_MS, hs.base), hs.gap * 2); hs.clean = 0; }
          why = "HTTP " + res.status;
          await res.arrayBuffer().catch(() => {});
        } else if (!res.ok) {
          await res.arrayBuffer().catch(() => {});
          throw Object.assign(new Error("HTTP " + res.status + " for " + url), { fatal: res.status === 404 });
        } else if (kind === "json") {
          const j = await res.json();
          if (j && j.error && j.error.code === "maxlag") {
            retryAfter = Number(res.headers.get("retry-after")) || 5;
            why = "maxlag";
          } else {
            noteSuccess(hs);
            return j;
          }
        } else {
          noteSuccess(hs);
          return Buffer.from(await res.arrayBuffer());
        }
      } catch (e) {
        if (e.fatal) throw e;
        why = e.message;
      }
      if (attempt === limit) throw new Error("Giving up after " + attempt + " attempts (" + why + "): " + url);
      const s = retryAfter || BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)];
      stats.retries++;
      console.warn(`  retry ${attempt} in ${s}s (${why}, ${host}, gap ${hs.gap} ms, ${new Date().toISOString().slice(11, 19)})`);
      await sleep(s * 1000);
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}
function noteSuccess(hs) {
  if (++hs.clean >= 50 && hs.gap > hs.base) { hs.gap = Math.max(hs.base, Math.round(hs.gap / 1.5)); hs.clean = 0; }
}
const API = "https://commons.wikimedia.org/w/api.php";
function api(params) {
  const q = new URLSearchParams(Object.assign({}, params, { format: "json", formatversion: "2", maxlag: "5" }));
  return http(API + "?" + q.toString(), "json");
}

/* ---------- c. targets ---------- */
const PERSONS = ["1s", "2s", "3s", "1p", "2p", "3p"];
const KIND_ORDER = ["inf"].concat(PERSONS, ["past", "future", "sentence"]);
const HOMOGRAPHS = new Set(["es", "as", "fait", "est", "sens", "vis", "lis"]);
const COV_KEY = { inf: "inf", past: "past", future: "future", sentence: "sentences" };
PERSONS.forEach((p) => { COV_KEY[p] = "forms"; });

function fileFor(id, kind) {
  if (kind === "inf") return `audio/${id}-infinitive.mp3`;
  if (PERSONS.includes(kind)) return `audio/${id}-present-${kind}.mp3`;
  return `audio/${id}-${kind}.mp3`;
}
function apostropheVariants(list) {
  const out = [];
  for (const t of list) {
    for (const v of [t, t.replace(/'/g, "’"), t.replace(/’/g, "'")]) if (!out.includes(v)) out.push(v);
  }
  return out;
}
/* "il/elle" -> il, elle; "ils/elles" -> ils, elles; "(e)" -> "" and "e". */
function textVariants(s) {
  let list = [String(s).replace(/\s+/g, " ").trim()];
  const expand = (re, a, b) => {
    const next = [];
    for (const t of list) {
      if (re.test(t)) { next.push(t.replace(re, a)); next.push(t.replace(re, b)); } else next.push(t);
    }
    list = next;
  };
  expand(/\bils\/elles\b/g, "ils", "elles");
  expand(/\bil\/elle\b/g, "il", "elle");
  expand(/\(e\)/g, "", "e");
  return [...new Set(list)];
}
function stripPunct(s) { return String(s).replace(/[\s.!?…]+$/u, ""); }

function buildTargets(L, DATA) {
  const targets = [];
  DATA.verbs.forEach((v, idx) => {
    const num = idx + 1;
    const add = (kind, phraseTerms, wordTerms, searchTokens, fallbackPhrase) => {
      targets.push({
        key: `${v.id}|${kind}`, file: fileFor(v.id, kind), verb: v.id, num, kind,
        phraseTerms: apostropheVariants(phraseTerms), wordTerms: apostropheVariants(wordTerms),
        searchTokens: [...new Set(searchTokens)], fallbackPhrase: !!fallbackPhrase
      });
    };
    // infinitive
    const bareInf = v.infinitive.replace(/^(s'|s’|se )/, "");
    // phrase-search fallback only for elided "s'": "se lever" contains the token "lever", "s'appeler" may not
    add("inf", [v.infinitive], bareInf !== v.infinitive ? [bareInf] : [], [bareInf], /^(s'|s’)/.test(v.infinitive));
    // present
    const impersonal = v.present.length === 1;
    for (const row of v.present) {
      const acc = L.acceptedForms(v, row.person);
      let phrase = acc.slice(1);
      if (impersonal) phrase = phrase.filter((t) => !/^on /.test(t));
      const word = HOMOGRAPHS.has(L.normalize(acc[0])) ? [] : [acc[0]];
      const elided = /['’]$/.test(String(row.pronoun).trim());
      add(row.person, phrase, word, [row.form], elided);
    }
    // past
    if (v.past && v.past.french) {
      const phrase = textVariants(v.past.french);
      const word = v.past.participle && !HOMOGRAPHS.has(L.normalize(v.past.participle)) ? [v.past.participle] : [];
      // the participle is its own word in every phrase ("j'ai entendu"), so no phrase fallback unless saturated
      add("past", phrase, word, [v.past.participle || stripPunct(L.speakableText(v.past.french)).split(" ").pop()], false);
    }
    // future (phrase only)
    if (v.future && v.future.french) {
      const phrase = textVariants(v.future.french);
      // the last word is the token ("j'entendrai" stays whole), so no phrase fallback unless saturated
      add("future", phrase, [], [stripPunct(L.speakableText(v.future.french)).split(" ").pop()], false);
    }
    // sentence (phrase only)
    if (v.sentence && v.sentence.french) {
      add("sentence", textVariants(v.sentence.french), [], [stripPunct(v.sentence.french)], false);
    }
  });
  return targets;
}

/* ---------- d. search ---------- */
function norm(s) {
  return String(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’ʼ]/g, "'")
    .replace(/_/g, " ")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .!?…]+$/u, "");
}
const PREFIX = "file:ll-q150 (fra)-";
/* Split "File:LL-Q150 (fra)-<speaker>-<words>.wav" so that <words> matches `term`. */
function matchTitle(title, term) {
  const t = String(title).normalize("NFC").replace(/_/g, " ");
  if (!t.toLowerCase().startsWith(PREFIX) || !/\.wav$/i.test(t)) return null;
  const rest = t.slice(PREFIX.length, -4);
  const want = norm(term);
  for (let i = rest.indexOf("-"); i > 0; i = rest.indexOf("-", i + 1)) {
    const words = rest.slice(i + 1);
    if (norm(words) === want) return { speakerPart: rest.slice(0, i), said: words };
  }
  return null;
}
/* Search results are cached in memory and, outside dry runs, in cache/search.json so that a resumed run does
   not repeat its searches (delete the file to search afresh). */
const SEARCH_CACHE = path.join(scriptDir, "cache", "search.json");
const searchCache = new Map(Object.entries(opts.dryRun ? {} : readJson(SEARCH_CACHE, {})));
let searchDirty = 0;
function saveSearchCache(force) {
  if (opts.dryRun || (!force && searchDirty < 20) || !searchDirty) return;
  writeJsonAtomic(SEARCH_CACHE, Object.fromEntries(searchCache));
  searchDirty = 0;
}
async function search(token) {
  const k = norm(token);
  if (searchCache.has(k)) return searchCache.get(k);
  const safe = String(token).replace(/"/g, "");
  const j = await api({ action: "query", list: "search", srnamespace: "6", srlimit: "500", srprop: "", srsearch: `intitle:"LL-Q150 (fra)" intitle:"${safe}"` });
  const res = {
    titles: ((j.query && j.query.search) || []).map((r) => r.title),
    total: (j.query && j.query.searchinfo && j.query.searchinfo.totalhits) || 0
  };
  searchCache.set(k, res);
  searchDirty++;
  saveSearchCache(false);
  return res;
}
function matchesFor(titles, terms) {
  const out = [];
  for (const title of titles) {
    for (const term of terms) {
      const m = matchTitle(title, term);
      if (m) { out.push(Object.assign({ title }, m)); break; }
    }
  }
  return out;
}

/* ---------- e. candidates / metadata ---------- */
const metaCache = new Map();
const LICENSE_RE = /^(CC0( 1\.0)?|CC BY( [0-9.]+)?|CC BY-SA( [0-9.]+)?)$/;
async function fetchMeta(titles) {
  const need = [...new Set(titles)].filter((t) => !metaCache.has(t));
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    let j;
    try {
      j = await api({ action: "query", prop: "videoinfo", viprop: "url|extmetadata|derivatives", titles: batch.join("|") });
    } catch (e) {
      // not cached: these titles are rejected as "no metadata" in this run and retried by the next one
      console.warn(`  metadata batch failed (${batch.length} titles): ${e.message}`);
      continue;
    }
    const pages = (j.query && j.query.pages) || [];
    const norms = {};
    for (const n of (j.query && j.query.normalized) || []) norms[n.to] = n.from;
    for (const p of pages) {
      const key = norms[p.title] || p.title;
      metaCache.set(key, p.missing || !p.videoinfo ? null : p.videoinfo[0]);
    }
    for (const t of batch) if (!metaCache.has(t)) metaCache.set(t, null);
  }
}
function decodeEntities(s) {
  return String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)));
}
function stripTags(s) { return decodeEntities(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim(); }
function evaluate(match) {
  const vi = metaCache.get(match.title);
  if (!vi) return { ok: false, why: "no metadata" };
  const em = vi.extmetadata || {};
  const val = (k) => (em[k] && em[k].value != null ? String(em[k].value) : "");
  const license = stripTags(val("LicenseShortName"));
  if (!LICENSE_RE.test(license)) return { ok: false, why: "license " + (license || "missing") };
  let licenseUrl = stripTags(val("LicenseUrl"));
  if (!licenseUrl && /^CC0/.test(license)) licenseUrl = "https://creativecommons.org/publicdomain/zero/1.0/";
  if (!licenseUrl) return { ok: false, why: "no license URL" };
  licenseUrl = licenseUrl.replace(/^\/\//, "https://").replace(/^http:/, "https:");
  const mp3 = (vi.derivatives || []).find((d) => d.type === "audio/mpeg" || d.transcodekey === "mp3");
  if (!mp3 || !mp3.src) return { ok: false, why: "no MP3 derivative" };
  const artist = val("Artist");
  const sm = /Speaker:\s*<a[^>]*>([^<]+)<\/a>/i.exec(artist);
  const speaker = (sm ? decodeEntities(sm[1]).trim() : "") || match.speakerPart;
  const qm = /lingualibre\.org\/wiki\/(Q\d+)/.exec(artist);
  return {
    ok: true,
    entry: {
      said: match.said,
      speaker,
      license,
      licenseUrl,
      source: vi.descriptionurl,
      title: match.title.replace(/^File:/, "")
    },
    mp3: mp3.src.replace(/^\/\//, "https://"),
    qid: qm ? qm[1] : null,
    hint: stripTags(val("Categories") + " " + val("ImageDescription"))
  };
}

/* ---------- f. speaker region ---------- */
let speakerCache = readJson(SPEAKER_CACHE, {});
/* Lingua Libre's speaker pages are best-effort: after one failed lookup (2 attempts) they are skipped for
   the rest of the run, and the region falls back to the Commons text hints. Failures are not cached. */
let lingualibreDown = false;
async function regionFor(cand) {
  if (cand.qid && !speakerCache[cand.qid] && lingualibreDown) {
    // fall through to the text hints below
  } else if (cand.qid) {
    if (!speakerCache[cand.qid]) {
      let failed = false;
      let country = null;
      try {
        const ll = await http(`https://archive.lingualibre.org/wiki/Special:EntityData/${cand.qid}.json`, "json", 2);
        const ent = ll && ll.entities && Object.values(ll.entities)[0];
        const p14 = ent && ent.claims && ent.claims.P14 && ent.claims.P14[0];
        const place = p14 && p14.mainsnak && p14.mainsnak.datavalue && p14.mainsnak.datavalue.value;
        const placeId = typeof place === "string" ? place : place && place.id;
        if (placeId && /^Q\d+$/.test(placeId)) {
          const wd = await http(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: "wbgetentities", ids: placeId, props: "claims", format: "json", maxlag: "5" })}`, "json", 3);
          const c = wd && wd.entities && wd.entities[placeId] && wd.entities[placeId].claims && wd.entities[placeId].claims.P17;
          const cv = c && c[0] && c[0].mainsnak && c[0].mainsnak.datavalue && c[0].mainsnak.datavalue.value;
          country = cv && cv.id ? cv.id : null;
        }
      } catch (e) {
        failed = true;
        lingualibreDown = true;
        console.warn(`  speaker lookup failed for ${cand.qid} (${e.message}); skipping Lingua Libre speaker pages for the rest of this run`);
      }
      if (!failed) speakerCache[cand.qid] = { speaker: cand.entry.speaker, country };
    }
    const c = speakerCache[cand.qid] && speakerCache[cand.qid].country;
    if (c === "Q142") return 0;
    if (c) return 2;
  }
  const h = cand.hint;
  if (/\b(France|Paris)\b/i.test(h)) return 0;
  if (/(Québec|Quebec|Canada|Belgique|Suisse|Belgium|Switzerland)/i.test(h)) return 2;
  return 1;
}

/* ---------- h. download + processing ---------- */
const FFMPEG_AF = "silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,areverse,loudnorm=I=-18:TP=-1.5:LRA=11,adelay=50:all=1,apad=pad_dur=0.1";
function findBin(name) {
  for (const p of ["/opt/homebrew/bin/" + name, "/usr/local/bin/" + name, "/usr/bin/" + name]) if (fs.existsSync(p)) return p;
  const r = spawnSync("which", [name], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}
const FFMPEG = findBin("ffmpeg");
const FFPROBE = findBin("ffprobe");
let tmpDir = null;
function processAudio(inFile, outFile) {
  if (!opts.process) return { edited: false, reason: "--no-process" };
  if (!FFMPEG || !FFPROBE) return { edited: false, reason: "ffmpeg not found" };
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", inFile, "-af", FFMPEG_AF, "-ar", "44100", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", outFile], { encoding: "utf8" });
  if (r.status !== 0) return { edited: false, reason: "ffmpeg failed: " + String(r.stderr).trim().slice(0, 200) };
  const p = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", outFile], { encoding: "utf8" });
  const dur = Number(String(p.stdout).trim());
  if (!(dur >= 0.2)) return { edited: false, reason: "processed duration " + (isFinite(dur) ? dur.toFixed(2) + "s" : "unknown") };
  return { edited: true };
}
async function downloadTo(cand, targetFile) {
  const buf = await http(cand.mp3, "binary");
  if (!buf || buf.length < 1024) throw new Error("download too small (" + (buf ? buf.length : 0) + " bytes)");
  const base = path.basename(targetFile, ".mp3");
  const raw = path.join(tmpDir, base + ".raw.mp3");
  const out = path.join(tmpDir, base + ".out.mp3");
  fs.writeFileSync(raw, buf);
  const pr = processAudio(raw, out);
  const chosen = pr.edited ? out : raw;
  const dest = path.join(opts.site, targetFile);
  const staging = path.join(AUDIO_DIR, "." + path.basename(targetFile) + ".partial");
  fs.copyFileSync(chosen, staging);
  fs.renameSync(staging, dest);
  for (const f of [raw, out]) fs.rmSync(f, { force: true });
  return pr;
}

/* ---------- i. outputs ---------- */
const FIELD_ORDER_NEW = ["file", "said", "exact", "scope", "speaker", "license", "licenseUrl", "source", "title", "edited"];
function withScope(item) {
  if (item.scope) return item;
  const out = {};
  for (const k of Object.keys(item)) {
    out[k] = item[k];
    if (k === "exact") out.scope = item.exact ? "phrase" : "word";
  }
  if (!out.scope) out.scope = "word";
  return out;
}
function orderNew(e) {
  const out = {};
  for (const k of FIELD_ORDER_NEW) {
    if (k === "edited") { if (e.edited === true) out.edited = true; continue; }
    out[k] = e[k];
  }
  return out;
}
function emptyCov(totals) {
  const c = {};
  for (const k of ["inf", "forms", "past", "future", "sentences"]) c[k] = { found: 0, total: totals ? totals[k] : 0, exact: 0 };
  return c;
}
function computeCoverage(DATA, items) {
  const lessonOf = {};
  for (const l of DATA.lessons) for (const id of l.verbIds) lessonOf[id] = l.id;
  const numOf = {};
  DATA.verbs.forEach((v, i) => { numOf[v.id] = i + 1; });
  const total = emptyCov();
  const ranges = [];
  for (let r = 0; r < 5; r++) {
    const a = r * 5 + 1, b = r * 5 + 5;
    ranges.push(Object.assign({ label: `Lessons ${a}–${b}`, lessons: [a, b], verbs: [Infinity, -Infinity] }, emptyCov()));
  }
  const rangeOf = (id) => ranges[Math.min(4, Math.floor((lessonOf[id] - 1) / 5))];
  for (const v of DATA.verbs) {
    const rg = rangeOf(v.id);
    rg.verbs[0] = Math.min(rg.verbs[0], numOf[v.id]);
    rg.verbs[1] = Math.max(rg.verbs[1], numOf[v.id]);
    const kinds = ["inf"].concat(v.present.map((p) => p.person));
    if (v.past && v.past.french) kinds.push("past");
    if (v.future && v.future.french) kinds.push("future");
    if (v.sentence && v.sentence.french) kinds.push("sentence");
    for (const kind of kinds) {
      const ck = COV_KEY[kind];
      const it = items[`${v.id}|${kind}`];
      for (const c of [total, rg]) {
        c[ck].total++;
        if (it) { c[ck].found++; if (it.scope === "phrase") c[ck].exact++; }
      }
    }
  }
  const all = Object.values(items);
  let bytes = 0;
  for (const it of all) bytes += fs.statSync(path.join(opts.site, it.file)).size;
  return Object.assign(total, {
    ranges,
    files: all.length,
    bytes,
    speakers: new Set(all.map((it) => it.speaker)).size,
    edited: all.filter((it) => it.edited === true).length
  });
}
function creditsRow(it) {
  return `| \`${path.basename(it.file)}\` | ${it.said} | ${it.speaker} | [${it.license}](${it.licenseUrl}) | [${it.title}](${it.source}) |`;
}
function writeOutputs(DATA, items, newFiles, download) {
  const cov = computeCoverage(DATA, items);
  const header = "/* Generated by tts-tools/native-audio/fetch-lingualibre.mjs from Lingua Libre recordings on Wikimedia Commons (verbs 1–25 were first fetched by the earlier fetch-audio.mjs). Do not edit by hand. */";
  const obj = { coverage: cov, items };
  if (download) obj.download = download; // kept until build-download-zip.mjs rebuilds the zip
  const tmp = MANIFEST_FILE + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, header + "\nwindow.VERB_AUDIO = " + JSON.stringify(obj, null, 2) + ";\n");
  fs.renameSync(tmp, MANIFEST_FILE);

  const old = fs.readFileSync(CREDITS_FILE, "utf8").split("\n");
  const line4 = old[4].split(" This applies to the files from the first download")[0].split(" Files added later")[0];
  const line8 = old[8].split(" Full-phrase recordings play")[0];
  const kept = newFiles.filter((f) => !f.edited).map((f) => "`" + path.basename(f.file) + "`");
  const c = cov;
  // Change notice (CC BY-SA): every file this script added counts, i.e. all of state.items (= the `edited` items
  // plus the `except` list), not just verbs 26–125. tests/audio-manifest.test.js checks the number against the manifest.
  const lines = [
    old[0], "",
    old[2], "",
    line4 + ` This applies to the files from the first download (Lessons 1–5). The ${newFiles.length} files added later (every clip for verbs 26–125, plus the new and upgraded clips for verbs 1–25) were also trimmed of leading and trailing silence and loudness-normalised with ffmpeg, except: ` + (kept.length ? kept.join(", ") : "none") + ".", "",
    `Coverage (all 125 verbs): infinitives ${c.inf.found} / ${c.inf.total}, present-tense forms ${c.forms.found} / ${c.forms.total} (${c.forms.exact} say the full phrase with the pronoun), past forms ${c.past.found} / ${c.past.total}, future forms ${c.future.found} / ${c.future.total}, example sentences ${c.sentences.found} / ${c.sentences.total}. Items without a recording use the browser's computer voice instead.`, "",
    line8 + ' Full-phrase recordings play from the "Native speaker" button; the others from "Native speaker (word only)".', "",
    old[10], old[11]
  ].concat(Object.values(items).map(creditsRow));
  const ctmp = CREDITS_FILE + ".tmp-" + process.pid;
  fs.writeFileSync(ctmp, lines.join("\n") + "\n");
  fs.renameSync(ctmp, CREDITS_FILE);
  writeReadmeBlock(cov, items);
  return cov;
}
/* README.md: the text between the native-audio markers is regenerated from the coverage figures. */
const README_START = "<!-- native-audio:start (generated by tts-tools/native-audio/fetch-lingualibre.mjs) -->";
const README_END = "<!-- native-audio:end -->";
function writeReadmeBlock(c, items) {
  const file = path.join(opts.site, "README.md");
  if (!fs.existsSync(file)) return;
  const src = fs.readFileSync(file, "utf8");
  const a = src.indexOf(README_START), b = src.indexOf(README_END);
  if (a < 0 || b < a) { console.warn("README.md has no native-audio markers; not updated."); return; }
  const f = (x) => `${x.found} / ${x.total}`;
  const phrase = (x) => ["inf", "forms", "past", "future", "sentences"].reduce((n, k) => n + x[k].exact, 0);
  const row = (label, x) => `| ${label} | ${f(x.inf)} | ${f(x.forms)} | ${phrase(x)} | ${f(x.past)} | ${f(x.future)} | ${f(x.sentences)} |`;
  const licenses = [...new Set(Object.values(items).map((it) => it.license))].sort();
  const lines = [
    README_START,
    `Native recordings come from [Lingua Libre](https://lingualibre.org/) volunteers via Wikimedia Commons: ${c.files} recordings by ${c.speakers} speakers, about ${(c.bytes / 1048576).toFixed(1)} MB in total, under ${licenses.join(", ")}. Coverage per lesson range ("full-phrase clips" include the pronoun):`,
    "",
    "| Lessons | Infinitives | Present forms | Full-phrase clips | Past | Future | Sentences |",
    "|---|---|---|---|---|---|---|"
  ].concat(c.ranges.map((r) => row(r.label, r)), [row("All lessons", c), "",
    `The ${c.edited} recordings added after the first download (Lessons 1–5) were trimmed of silence and loudness-normalised with ffmpeg. The topic lessons use the computer voice only. Full attribution is in the Credits view and in \`audio/CREDITS.md\`. The Credits view also has a **Download native recordings (.zip)** link (\`audio/downloads/native-recordings.zip\`: every clip plus CREDITS.md and the licence terms; the synthetic recorded voice is not included). To fetch more recordings, run \`../tts-tools/native-audio/update-native-audio.sh\`.`,
    README_END]);
  fs.writeFileSync(file, src.slice(0, a) + lines.join("\n") + src.slice(b + README_END.length));
}
function sortItems(DATA, items) {
  const out = {};
  for (const v of DATA.verbs) for (const k of KIND_ORDER) {
    const key = `${v.id}|${k}`;
    if (items[key]) out[key] = items[key];
  }
  for (const key of Object.keys(items)) if (!out[key]) throw new Error("Manifest key not in data: " + key);
  return out;
}

/* ---------- main ---------- */
async function main() {
  const { L, DATA, manifest } = loadSite();
  const state = readJson(STATE_FILE, { items: {}, upgrades: [] });
  state.items = state.items || {};
  state.upgrades = state.upgrades || [];
  state.kept = state.kept || {};
  const items = {};
  for (const [k, v] of Object.entries(manifest.items)) items[k] = withScope(v);
  for (const [k, v] of Object.entries(state.items)) items[k] = v; // a crash-interrupted run's clips win
  const fileExists = (f) => fs.existsSync(path.join(opts.site, f));

  if (opts.outputsOnly) {
    // no network: rewrite js/audio-manifest.js, audio/CREDITS.md and the README block from state.json
    const allNew = Object.entries(state.items).map(([key, e]) => ({ key, file: e.file, edited: e.edited === true }));
    writeOutputs(DATA, sortItems(DATA, items), allNew, manifest.download);
    console.log("Wrote " + MANIFEST_FILE + ", " + CREDITS_FILE + " (outputs only, no requests)");
    return;
  }

  console.log((opts.dryRun ? "DRY RUN. " : "") + "Site: " + opts.site);
  console.log("User-Agent: " + UA);
  if (!HAS_CONTACT) console.log("No contact email/URL (--contact or LL_CONTACT): Wikimedia allows 10 requests/min, so requests are spaced " + MIN_GAP_MS + " ms apart.");
  // self-check of the search syntax
  searchCache.delete(norm("avez")); // always check the live search syntax
  const sc = await search("avez");
  if (!sc.titles.includes("File:LL-Q150 (fra)-Guilhelma-avez.wav")) {
    console.error("Self-check failed: searching 'avez' did not return File:LL-Q150 (fra)-Guilhelma-avez.wav. The Commons search syntax may have changed; aborting.");
    process.exit(3);
  }
  console.log("Self-check passed (avez → Guilhelma-avez.wav).");

  let targets = buildTargets(L, DATA);
  if (opts.only) targets = targets.filter((t) => opts.only.has(t.verb));
  if (!opts.dryRun) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-ll-"));

  const decisions = [];
  const newFiles = [];
  const speakersByVerb = {};
  const manifestSpeakers = new Set();
  for (const [k, it] of Object.entries(items)) {
    manifestSpeakers.add(it.speaker);
    const vid = k.split("|")[0];
    (speakersByVerb[vid] = speakersByVerb[vid] || new Set()).add(it.speaker);
  }

  /* Pass 1: searches for every pending target. Pass 2: metadata for all matched titles in batches of 50.
     Pass 3 (below): per target, evaluate, rank and download, in data order. */
  const pending = [];
  for (const t of targets) {
    const cur = items[t.key];
    const curOk = cur && fileExists(cur.file);
    if (curOk && cur.scope === "phrase") {
      decisions.push({ key: t.key, decision: "skip", note: "already a full-phrase clip", said: cur.said });
      continue;
    }
    if (curOk && state.items[t.key]) {
      // fetched by an earlier run of this script (resume): its search already preferred phrase clips
      decisions.push({ key: t.key, decision: "skip", note: "fetched by an earlier run", said: cur.said });
      continue;
    }
    const upgrade = !!curOk; // existing word entry: only a phrase clip counts
    const tried = [];
    let titles = [];
    let saturated = false;
    try {
    for (const tok of t.searchTokens) {
      tried.push(tok);
      const r = await search(tok);
      titles = titles.concat(r.titles);
      if (r.total > r.titles.length) saturated = true;
    }
    let phrase0 = matchesFor(titles, t.phraseTerms);
    if (!phrase0.length && (t.fallbackPhrase || saturated)) {
      const seen = new Set(t.searchTokens.map(norm));
      for (const term of t.phraseTerms) {
        const n = norm(term);
        if (seen.has(n)) continue;
        seen.add(n);
        tried.push(term);
        const r = await search(term);
        titles = titles.concat(r.titles);
      }
    }
    } catch (e) {
      // gave up after the retries: log this item and continue (a rerun searches it again)
      console.warn(`  search failed for ${t.key}: ${e.message}`);
      decisions.push({ key: t.key, decision: upgrade ? "keep" : "failed", note: "search failed: " + e.message, tokens: tried });
      continue;
    }
    let phrase = matchesFor(titles, t.phraseTerms);
    const word = upgrade ? [] : matchesFor(titles, t.wordTerms).filter((m) => !phrase.some((p) => p.title === m.title));
    const pool = phrase.map((m) => Object.assign(m, { scope: "phrase" })).concat(word.map((m) => Object.assign(m, { scope: "word" })));
    const uniq = [];
    for (const m of pool) if (!uniq.some((u) => u.title === m.title)) uniq.push(m);
    if (!uniq.length) {
      decisions.push({ key: t.key, decision: upgrade ? "keep" : "none", note: upgrade ? "no full-phrase clip found" : "no recording", tokens: tried });
      continue;
    }
    pending.push({ t, cur, upgrade, tried, uniq });
  }
  saveSearchCache(true);
  console.log(`Searches done: ${pending.length} targets with candidates; fetching metadata.`);
  await fetchMeta(pending.flatMap((p) => p.uniq.map((m) => m.title)));

  for (const { t, cur, upgrade, tried, uniq } of pending) {
    const cands = [];
    const rejected = [];
    for (const m of uniq) {
      const ev = evaluate(m);
      if (!ev.ok) { rejected.push(m.title + ": " + ev.why); continue; }
      ev.scope = m.scope;
      ev.region = await regionFor(ev);
      cands.push(ev);
    }
    const verbSpk = speakersByVerb[t.verb] || new Set();
    const rank = (c) => [c.scope === "phrase" ? 0 : 1, c.region, verbSpk.has(c.entry.speaker) ? 0 : manifestSpeakers.has(c.entry.speaker) ? 1 : 2];
    cands.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
      return a.entry.title < b.entry.title ? -1 : a.entry.title > b.entry.title ? 1 : 0;
    });
    if (!cands.length) {
      decisions.push({ key: t.key, decision: upgrade ? "keep" : "none", note: "no acceptable candidate", rejected, tokens: tried });
      continue;
    }
    if (opts.dryRun) {
      const b = cands[0];
      decisions.push({ key: t.key, decision: upgrade ? "would-upgrade" : "would-add", scope: b.scope, said: b.entry.said, speaker: b.entry.speaker, title: b.entry.title, region: b.region, candidates: cands.length, tokens: tried });
      continue;
    }
    let done = false;
    for (const c of cands) {
      try {
        const pr = await downloadTo(c, t.file);
        const entry = orderNew(Object.assign({ file: t.file, exact: c.scope === "phrase", scope: c.scope }, c.entry, { edited: pr.edited }));
        if (upgrade) state.upgrades = state.upgrades.filter((u) => u.key !== t.key).concat([{ key: t.key, oldSaid: cur.said, oldTitle: cur.title, oldSpeaker: cur.speaker, newSaid: entry.said, newTitle: entry.title, newSpeaker: entry.speaker }]);
        state.items[t.key] = entry;
        if (pr.edited) delete state.kept[t.key]; else state.kept[t.key] = pr.reason;
        writeJsonAtomic(STATE_FILE, state);
        items[t.key] = entry;
        newFiles.push({ key: t.key, file: t.file, edited: pr.edited, reason: pr.reason });
        manifestSpeakers.add(entry.speaker);
        (speakersByVerb[t.verb] = speakersByVerb[t.verb] || new Set()).add(entry.speaker);
        decisions.push({ key: t.key, decision: upgrade ? "upgrade" : "add", scope: c.scope, said: entry.said, speaker: entry.speaker, title: entry.title, edited: pr.edited, note: pr.edited ? undefined : "kept as downloaded (" + pr.reason + ")", tokens: tried });
        console.log(`${upgrade ? "UPGRADE" : "ADD"} ${t.key} ← ${entry.title}${pr.edited ? "" : " [kept as downloaded: " + pr.reason + "]"}`);
        done = true;
        break;
      } catch (e) {
        console.warn(`  download failed for ${c.entry.title}: ${e.message}`);
        rejected.push(c.entry.title + ": " + e.message);
      }
    }
    if (!done) decisions.push({ key: t.key, decision: upgrade ? "keep" : "failed", note: "all downloads failed", rejected, tokens: tried });
  }

  // per-target table, in data order
  const orderOf = new Map(targets.map((t, i) => [t.key, i]));
  decisions.sort((a, b) => orderOf.get(a.key) - orderOf.get(b.key));
  for (const d of decisions) {
    if (d.decision === "skip") continue;
    console.log([opts.dryRun ? "DRY RUN" : "", d.decision.padEnd(13), d.key.padEnd(24), d.scope || "", d.said ? "“" + d.said + "”" : "", d.speaker || "", d.note || "", d.tokens ? "tokens: " + d.tokens.join(" | ") : ""].filter(Boolean).join("  "));
  }
  const count = (x) => decisions.filter((d) => d.decision === x).length;
  const totals = {
    targets: decisions.length, skipped: count("skip"), added: count("add") + count("would-add"), upgraded: count("upgrade") + count("would-upgrade"),
    none: count("none"), kept: count("keep"), failed: count("failed")
  };
  const seconds = Math.round((Date.now() - stats.started) / 1000);
  console.log((opts.dryRun ? "DRY RUN " : "") + "Totals: " + JSON.stringify(totals));
  console.log("Requests: " + JSON.stringify(stats.requests) + " total " + stats.total + ", retries " + stats.retries + ", " + seconds + " s");

  if (opts.dryRun) return;
  saveSearchCache(true);
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  writeJsonAtomic(SPEAKER_CACHE, speakerCache);
  // all clips from earlier interrupted runs count as new files for the CREDITS exception list
  const allNew = Object.entries(state.items).map(([key, e]) => ({ key, file: e.file, edited: e.edited === true }));
  const sorted = sortItems(DATA, items);
  const cov = writeOutputs(DATA, sorted, allNew, manifest.download);
  writeJsonAtomic(opts.report, {
    finished: new Date().toISOString(),
    totals,
    coverage: cov,
    requests: stats.requests,
    requestTotal: stats.total,
    retries: stats.retries,
    seconds,
    upgrades: state.upgrades,
    processed: allNew.filter((f) => f.edited).map((f) => f.file),
    keptAsDownloaded: Object.entries(state.items).filter(([, e]) => e.edited !== true).map(([key, e]) => ({ key, file: e.file, reason: state.kept[key] || "" })),
    decisions
  });
  console.log("Wrote " + MANIFEST_FILE + ", " + CREDITS_FILE + ", " + opts.report);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  try { saveSearchCache(true); } catch (e2) { /* ignore */ }
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
