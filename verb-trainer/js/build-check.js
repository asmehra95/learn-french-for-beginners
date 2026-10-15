/* Verb trainer: stale-page check for restored tabs (no network).
   The deploy stamps the commit id into <meta name="vt-build"> and every ?v= asset query (pages.yml). Phones
   often restore an old tab from the back/forward cache or after hours in the background without loading
   anything, so the old version keeps running. This page records its build id in localStorage; when a restored
   page finds that a newer build has been opened since (or it has sat in the bfcache for over an hour), it
   reloads once. Offline, on file:// and on the local helper (id still "__BUILD__") it does nothing.
   Exposes window.VT_BUILD = { id, shouldReload } (shouldReload is pure, for tests). */
(function (root) {
  "use strict";

  var KEY = "verbTrainer.build"; // separate from storage.js's verbTrainer.v1
  var MAX_AGE_MS = 60 * 60 * 1000;
  var PLACEHOLDER = "__BUILD__"; // the unstamped token (only index.html is stamped at deploy)

  function isStamped(id) { return typeof id === "string" && id !== "" && id !== PLACEHOLDER; }

  /**
   * s: { kind: "pageshow" | "visible", id, storedId, persisted, ageMs, hiddenMs, online, dialogOpen, reloaded }
   * pageshow: reload a bfcache-restored page when a newer build was opened since, or it is over an hour old.
   * visible: reload after more than an hour hidden, only when a newer build was opened and no dialog is open.
   */
  function shouldReload(s) {
    if (!s || !isStamped(s.id) || s.online === false || s.reloaded) return false;
    var newer = isStamped(s.storedId) && s.storedId !== s.id;
    if (s.kind === "pageshow") return !!s.persisted && (newer || s.ageMs >= MAX_AGE_MS);
    if (s.kind === "visible") return s.hiddenMs > MAX_AGE_MS && newer && !s.dialogOpen;
    return false;
  }

  var doc = root.document;
  var meta = doc && doc.querySelector ? doc.querySelector('meta[name="vt-build"]') : null;
  var id = meta ? String(meta.getAttribute("content") || "") : "";
  root.VT_BUILD = { id: id, shouldReload: shouldReload, MAX_AGE_MS: MAX_AGE_MS };
  if (!isStamped(id) || typeof root.addEventListener !== "function") return;

  function read() {
    try { return root.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  try { root.localStorage.setItem(KEY, id); } catch (e) { /* storage blocked: the age rule still applies */ }

  var loadedAt = Date.now();
  var hiddenAt = 0;
  var reloaded = false;

  function check(kind, extra) {
    var s = {
      kind: kind, id: id, storedId: read(), reloaded: reloaded,
      online: !(root.navigator && root.navigator.onLine === false),
      ageMs: Date.now() - loadedAt,
      hiddenMs: hiddenAt ? Date.now() - hiddenAt : 0,
      dialogOpen: !!doc.querySelector("dialog[open]"),
      persisted: !!(extra && extra.persisted)
    };
    if (!shouldReload(s)) return;
    reloaded = true;
    root.location.reload();
  }

  root.addEventListener("pageshow", function (ev) { if (ev && ev.persisted) check("pageshow", ev); });
  doc.addEventListener("visibilitychange", function () {
    if (doc.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (doc.visibilityState === "visible") check("visible");
    hiddenAt = 0;
  });
})(window);
