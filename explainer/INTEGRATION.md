# Integrating the Explainer into the Verb Trainer

This is the contract between the Explainer (UI module + local helper) and the Verb Trainer site. The helper can serve the trainer itself (`serveSite`, §8), so the site and the API share one origin. It still runs its standalone demo at `/`.

## 1. Files to copy

Copy `explainer.js` and `explainer.css` into the site as `verb-trainer/js/explainer.js` and `verb-trainer/css/explainer.css` and load them as local files. The copies are in place; `tests/site-copy.test.js` fails whenever they differ from the originals, so re-copy both after any edit:

```bash
cp explainer/explainer.js verb-trainer/js/explainer.js
cp explainer/explainer.css verb-trainer/css/explainer.css
```

Loading them cross-origin from the helper server (`<script src="http://127.0.0.1:8765/explainer.js">` on another origin) is blocked on purpose: static files are sent with `Cross-Origin-Resource-Policy: same-origin`. Serving them from the helper works only when the page itself is served by the helper on the same origin (see §8, `serveSite`).

## 2. Load order

```html
<link rel="stylesheet" href="css/explainer.css">
<!-- after the trainer's js/theme.js -->
<script src="js/theme.js"></script>
<script src="js/explainer.js"></script>
```

Load `explainer.js` after the trainer's `theme.js` so `data-theme` is set before the module renders. It depends on no other trainer script. It is a classic script (no modules, no build step) and defines exactly one global, `window.VT_EXPLAINER`. All CSS is scoped under `.vtx` with `vtx-` class prefixes. The module follows the trainer's theme: dark via `:root[data-theme="dark"] .vtx`, and `prefers-color-scheme: dark` unless `:root[data-theme="light"]`.

## 3. `mount()` API

```js
window.VT_EXPLAINER = {
  version: "1.1",
  mount(container, options) -> {
    explain(text): Promise<void>,
    setVoiceSettings({voiceURI?, voiceName?, rate?}): void,
    destroy(): void
  }
};
```

Options (all optional):

| Option | Type | Default | Notes |
|---|---|---|---|
| `apiBase` | string | `""` when the page is `http(s):` (same origin), else `"http://127.0.0.1:8765"` | must be `""` or match `^https?://[^/\s]+$` (no path, no trailing slash), else `mount` throws `TypeError` |
| `voiceSettings` | `{voiceURI?, voiceName?, rate?}` | read from trainer storage, then auto | overrides the stored settings; `rate` is clamped to 0.6-1.2 (default 0.85) |
| `onNavigate` | `function(routeId)` | none | if given, lesson/topic links render as buttons that call it; without it they render as plain text |
| `historyKey` | string | `"frenchExplainer.v1"` | localStorage key for recent explanations; any key starting with `verbTrainer` is ignored and the default is used |
| `headingLevel` | `2` or `3` | `2` | level of the module title; the results title and section titles follow one and two levels below (3 gives h3/h4/h5, for a host view that has its own h2). Anything else makes `mount` throw `TypeError` |

- `mount` throws `TypeError` if `container` is not an Element.
- Mounting twice into the same container destroys the first instance.
- `destroy()` aborts any request in flight, cancels speech, removes listeners and removes the module's DOM.
- `explain(text)` fills the textarea and runs an explanation (same as pressing Explain).
- `setVoiceSettings(vs)` replaces the voice settings (same shape and clamping as `options.voiceSettings`; a non-object falls back to trainer storage, then auto). The next Listen uses them. It does nothing after `destroy()`. Added in 1.1 because settings are otherwise read only once, at mount.
- All DOM lives in one `<section class="vtx" aria-labelledby="vtx-title-N">`, so ids stay unique across instances.

Example:

```js
var explainer = window.VT_EXPLAINER.mount(document.getElementById("explain"), {
  onNavigate: function (routeId) { location.hash = routeId; }
});
```

## 4. Response schema version

The server answers with `schemaVersion: "1.0"` on both `GET /api/health` and `POST /api/explain`. Compatibility rule: the module accepts any `schemaVersion` starting with `"1."`. Additive changes keep the major version; a breaking change bumps it to `"2.0"`, and an old module then shows "This Explainer server version isn't supported by this page." Copy the matching `explainer.js` whenever the server's major version changes.

## 5. Route ids and their status

Links in results carry a `routeId`. The module only turns ids matching `^#[A-Za-z0-9/_-]{1,80}$` into buttons (upper case is needed for lesson ids such as `#topic/reflexive/R4`), and only when `onNavigate` is given. Route ids never become `href`s.

| Route id | Example | Status |
|---|---|---|
| `#browse/lesson/<lessonId>/<verbId>` | `#browse/lesson/1/etre` | Exists in the trainer for lessons 1-5 (25 verbs). Lessons 6-25 (the other 100 verbs) need the 125-verb integration in the trainer before these links resolve. |
| `#topic/<topicId>[/<lessonId>]` | `#topic/reflexive/R2`, `#topic/questions/Q1` | Available (`status: "available"` in the response). The trainer's `learn.js` `parseRoute` treats `#topic/...` as an alias of its `#topics/...` route and rewrites the hash to `#topics/<topicId>[/<lessonId>]`. Topic ids: `questions` (Q1-Q6), `reflexive` (R1-R6). |

`onNavigate` should call the trainer's own navigation, which is hash-based:

```js
onNavigate: function (routeId) { location.hash = routeId; }
```

## 6. CSP changes the site needs

The trainer's CSP meta tag starts with `default-src 'none'`, which blocks every API call until `connect-src` is added. The site uses `connect-src 'self'`: the page is served by the helper (§8), so the API is same-origin. Under `file://`, `'self'` matches nothing, so the file version makes no requests at all (its Explain view shows how to start the helper instead).

Not used: `connect-src http://127.0.0.1:8765` for a `file://` page, which would also need the helper to allow the `null` origin (§7).

`script-src 'self'` and `style-src 'self'` already cover the copied files. The module needs no inline scripts or styles, no external fonts and no other URLs.

## 7. The `null` origin trade-off

A page opened from `file://` sends `Origin: null`. The helper refuses it by default. Allowing it (`"allowedOrigins": ["null"]` in `config.json`, or `EXPLAINER_ALLOWED_ORIGINS=null`) lets the `file://` trainer call the API, but `null` is not a unique identity: sandboxed iframes, `data:` URLs and some redirects send it too, so any website you visit could embed a sandboxed iframe and call the Explainer. Such a page could make the Mac run Mistral on text it chooses (limited by the rate limit and single-flight guard) and learn that the server exists. It cannot read files, reach credentials (none exist in local mode) or change state. The server prints a startup warning when `null` is allowed. Prefer the same-origin setup in §8.

## 8. Serving the trainer from the helper (`serveSite`)

`serveSite` (boolean, default `false` in `lib/config.js`, set to `true` in the shipped `config.json`, env `EXPLAINER_SERVE_SITE=1|true|0|false`) makes the helper also serve, read-only:

- `verb-trainer/` at `/trainer/` (`/trainer/` is `index.html`; `/trainer` redirects there with 301)
- only the `*.pdf` files directly inside `topics/` at `/topics/<name>.pdf`, so the Topics view's `../topics/*.pdf` links keep working over http

How (`lib/static.js`):

- The roots are fixed (`../verb-trainer`, `../topics` next to `explainer/`), not configurable, so config can never widen what is served.
- An exact-path allowlist is built once at startup. URL text never reaches the filesystem: the path is decoded once (malformed → 404), anything containing NUL or `\` is refused, it is NFC-normalised and looked up with an exact `Map.get`. So `..`, `%2e%2e`, `%2f`, `//`, absolute-form targets and unknown paths are 404.
- Skipped at startup: dotfiles, symlinks (files and folders), the `tests/` folder and any extension outside `.html .js .css .mp3 .svg .png .txt .md .json` (plus `.pdf` in topics). No directory listings.
- At request time a site file must still be a regular file (lstat) whose real path is inside its root; files over 2 MB are refused.
- GET and HEAD only (others → 405 with `Allow`). The Host check runs first on every path; the Origin check stays API-only (§5.2 of the design). Every response keeps `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin` and `Cache-Control: no-cache`.
- `.mp3` files send `Accept-Ranges: bytes` and answer a single `bytes=a-b`, `bytes=a-` or `bytes=-n` range with 206; unsatisfiable or multiple ranges get 416.

Port: with `EXPLAINER_PORT` unset the helper tries `port` (8765), then 8775-8784, and uses the first free one (a 300 ms connect probe skips ports something already answers on). It prints the URLs it chose, for example `Verb Trainer: http://127.0.0.1:8775/trainer/#home` and `Explain: http://127.0.0.1:8775/trainer/#explain`. With `EXPLAINER_PORT` set, only that port is tried and a busy port is a startup error. `./start.sh --open` opens the Explain URL once the server is listening.

Result:

- the trainer and the API share one origin, so no `null` origin is needed;
- the site's CSP needs only `connect-src 'self'`;
- the module can read the trainer's voice settings from localStorage (localStorage is per origin, so each port is a separate origin with its own progress);
- `file://` keeps working for everything except Explain.

## 9. Voice settings (read-only sharing)

The module picks a French voice with the same rules as `verb-trainer/js/speech.js` (re-implemented, not imported) and reads the trainer's saved voice read-only:

- Precedence: `options.voiceSettings` → `localStorage["verbTrainer.v2"]` (forward-compatible read; no such key exists today) → `localStorage["verbTrainer.v1"]` (the trainer's key: it is still named `verbTrainer.v1` and holds a schema `version: 2` object) → automatic choice.
- The site does not rely on the storage read: it passes `voiceSettings` explicitly at mount (`{voiceURI, voiceName, rate: settings.speechRate}`) and calls `setVoiceSettings(...)` whenever the learner changes the voice or rate, because the module otherwise reads settings only once, at mount.
- From the chosen key it reads `settings.voiceURI`, `settings.voiceName` and `settings.speechRate`. Parse errors, wrong types or blocked storage are ignored.
- It never calls `setItem` or `removeItem` on any `verbTrainer*` key.
- Same origin only: on `file://` or on a different origin from the trainer, those keys aren't visible and the module auto-picks a voice (or uses `options.voiceSettings`).

## 10. Client timer

The module waits at most 330 000 ms for an explain (`FETCH_TIMEOUT_MS` in `explainer.js`: the server's `limits.totalTimeoutMs` of 300 000 ms plus 30 s). If `limits.totalTimeoutMs` is raised, raise `FETCH_TIMEOUT_MS` with it.

## 11. Do not

- Do not use `innerHTML` (or `insertAdjacentHTML`, `outerHTML`, `document.write`) with anything from the Explainer's responses or history. The module builds all DOM with `createElement` and `textContent`; keep it that way in any wrapper.
- Do not write the trainer's storage keys (`verbTrainer.v1`, `verbTrainer.v1.backup`, `verbTrainer.v2`) from Explainer code, and do not pass a `historyKey` starting with `verbTrainer`.
- Do not load `explainer.js`/`explainer.css` cross-origin from the helper; copy them.
- Do not add `*` or broad origins to `allowedOrigins`, and do not expose the helper beyond localhost without authentication (README > Security).
