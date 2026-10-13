"use strict";
// Exact-path static files (design §4.2, §5.3; integration plan D2). The URL is only ever used as a key
// into a fixed map built at startup, so "..", "%2e%2e", "//", backslashes and unknown paths can never
// reach another file.
//
// Always served: the standalone demo and the UI module (/, /explainer.js, /explainer.css, /demo/demo.js).
// With serveSite on (opt-in), also served read-only:
//   - the Verb Trainer folder at /trainer/ (every regular file with an allowlisted extension; no dotfiles,
//     no symlinks, no tests/ folder, no directory listings; /trainer/ is index.html)
//   - only the *.pdf files directly inside topics/ at /topics/<name>.pdf
// Both roots are fixed (not configurable), so config can never widen what is served.
const fs = require("node:fs");
const path = require("node:path");
const { AppError } = require("./errors");
const { sendError } = require("./http-util");

const ROOT = path.join(__dirname, "..");
const SITE_ROOT = path.join(ROOT, "..", "verb-trainer");
const TOPICS_ROOT = path.join(ROOT, "..", "topics");
const MAX_BYTES = 1024 * 1024;
const SITE_MAX_BYTES = 2 * 1024 * 1024;
const DEMO_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
// Extensions served from the Verb Trainer folder. Anything else is left out of the map.
const SITE_TYPES = Object.freeze({
  ...TYPES,
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
});
const PDF_TYPE = "application/pdf";

function moduleEntry(file) {
  return { file, type: TYPES[path.extname(file)] || "application/octet-stream", max: MAX_BYTES, site: false, range: false };
}

function buildModuleMap(root) {
  return new Map([
    ["/", moduleEntry(path.join(root, "demo", "index.html"))],
    ["/explainer.js", moduleEntry(path.join(root, "explainer.js"))],
    ["/explainer.css", moduleEntry(path.join(root, "explainer.css"))],
    ["/demo/demo.js", moduleEntry(path.join(root, "demo", "demo.js"))],
  ]);
}

function realOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** Regular, non-symlink, non-dot entries of dir (lstat-based), or [] if dir can't be read. */
function listDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const d of entries) {
    if (d.name.startsWith(".") || d.isSymbolicLink()) continue;
    const full = path.join(dir, d.name);
    let st;
    try {
      st = fs.lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push({ name: d.name, full, dir: true });
    else if (st.isFile()) out.push({ name: d.name, full, dir: false });
  }
  return out;
}

function addSite(map, siteRoot) {
  const base = realOrNull(siteRoot);
  if (!base) return;
  const walk = (dir, rel) => {
    for (const e of listDir(dir)) {
      if (e.dir) {
        if (e.name !== "tests") walk(e.full, rel.concat(e.name));
        continue;
      }
      const type = SITE_TYPES[path.extname(e.name)];
      if (!type) continue;
      const key = ("/trainer/" + rel.concat(e.name).join("/")).normalize("NFC");
      map.set(key, { file: e.full, type, max: SITE_MAX_BYTES, site: true, base, range: type === "audio/mpeg" });
    }
  };
  walk(base, []);
  const index = map.get("/trainer/index.html");
  if (index) map.set("/trainer/", index);
}

function addTopics(map, topicsRoot) {
  const base = realOrNull(topicsRoot);
  if (!base) return;
  for (const e of listDir(base)) {
    if (e.dir || path.extname(e.name) !== ".pdf") continue;
    map.set(("/topics/" + e.name).normalize("NFC"), { file: e.full, type: PDF_TYPE, max: SITE_MAX_BYTES, site: true, base, range: false });
  }
}

/**
 * Parse a Range header against a file size.
 * @returns {null | {start: number, end: number} | "unsatisfiable"}  null = no usable Range (send 200)
 */
function parseRange(header, size) {
  if (typeof header !== "string") return null;
  const h = header.trim();
  if (!/^bytes=/i.test(h)) return null; // unknown unit: ignore the header
  const spec = h.slice(6).trim();
  if (spec.includes(",")) return "unsatisfiable"; // multiple ranges are not supported
  const m = /^(\d*)-(\d*)$/.exec(spec);
  if (!m || (m[1] === "" && m[2] === "")) return "unsatisfiable";
  let start;
  let end;
  if (m[1] === "") {
    const suffix = Number(m[2]); // bytes=-N: the last N bytes
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

/**
 * @param {{root?: string, siteRoot?: string, topicsRoot?: string, serveSite?: boolean}} [opts]
 *   root: the explainer folder; siteRoot/topicsRoot: the Verb Trainer and topics folders (tests pass a
 *   temp tree); serveSite: serve those two folders (default false)
 */
function createStatic({ root = ROOT, siteRoot = SITE_ROOT, topicsRoot = TOPICS_ROOT, serveSite = false } = {}) {
  const map = buildModuleMap(root);
  if (serveSite === true) {
    addSite(map, siteRoot);
    addTopics(map, topicsRoot);
  }

  /** Exact lookup: decode once (malformed -> miss), refuse NUL and backslash, NFC, then Map.get. */
  function lookup(urlPath) {
    let p;
    try {
      p = decodeURIComponent(String(urlPath));
    } catch {
      return null;
    }
    if (p.includes("\0") || p.includes("\\")) return null;
    return map.get(p.normalize("NFC")) || null;
  }

  return {
    has: (urlPath) => lookup(urlPath) !== null,
    paths: () => [...map.keys()],
    /** "/trainer" (no slash) -> "/trainer/" when the site is served, else null. */
    redirect: (urlPath) => (serveSite === true && urlPath === "/trainer" && map.has("/trainer/") ? "/trainer/" : null),
    /** Serve a known path (GET/HEAD). Files are read at request time so edits show on reload. */
    async serve(req, res, urlPath) {
      const entry = lookup(urlPath);
      if (!entry) return sendError(res, new AppError("NOT_FOUND"));
      let data;
      try {
        // Site files: lstat (a file swapped for a symlink after startup is refused) and a realpath check
        // that it still lives under its root.
        const st = await (entry.site ? fs.promises.lstat(entry.file) : fs.promises.stat(entry.file));
        if (!st.isFile()) return sendError(res, new AppError("NOT_FOUND"));
        if (entry.site) {
          const real = await fs.promises.realpath(entry.file);
          if (!real.startsWith(entry.base + path.sep)) return sendError(res, new AppError("NOT_FOUND"));
        }
        if (st.size > entry.max) return sendError(res, new AppError("INTERNAL"));
        data = await fs.promises.readFile(entry.file);
      } catch (err) {
        if (err && err.code === "ENOENT") return sendError(res, new AppError("NOT_FOUND"));
        throw err;
      }
      if (data.length > entry.max) return sendError(res, new AppError("INTERNAL"));
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      if (urlPath === "/") res.setHeader("Content-Security-Policy", DEMO_CSP);
      let body = data;
      res.statusCode = 200;
      if (entry.range) {
        res.setHeader("Accept-Ranges", "bytes");
        const r = parseRange(req.headers.range, data.length);
        if (r === "unsatisfiable") {
          return sendError(res, new AppError("RANGE_NOT_SATISFIABLE"), { "Content-Range": `bytes */${data.length}` });
        }
        if (r) {
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${r.start}-${r.end}/${data.length}`);
          body = data.subarray(r.start, r.end + 1);
        }
      }
      res.setHeader("Content-Type", entry.type);
      res.setHeader("Content-Length", body.length);
      res.end(req.method === "HEAD" ? undefined : body);
    },
  };
}

module.exports = { createStatic, parseRange, DEMO_CSP, MAX_BYTES, SITE_MAX_BYTES, SITE_TYPES, SITE_ROOT, TOPICS_ROOT };
