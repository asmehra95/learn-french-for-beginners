# French Explainer (local)

Paste a French sentence or short paragraph and get an English translation plus a step-by-step breakdown: each chunk with its English gloss and part of speech, verbs with tense, person and auxiliary, grammar points, an approximate pronunciation, and links to the matching lessons. Verbs are checked against the 125-verb guide (regular/irregular badges, guide pronunciations, "Check:" lines when the AI disagrees with the guide). Everything runs on this Mac: a small Node.js server (no npm packages) talks to Mistral through Ollama, and the browser reads the results aloud with the system's French voice, generated on the fly.

The Explainer is a separate tool. It does not change the Verb Trainer's flash cards or their native audio.

## Quick start

```bash
cd explainer   # from the repo root
./start.sh            # add --open to open the Explain page in the browser automatically
```

`start.sh` checks Node, starts the Ollama app if it isn't answering (it never stops or restarts a running Ollama), checks that the model is installed (it never downloads one), then runs `node server.js`. Press Ctrl+C to stop the Explainer; Ollama keeps running.

The server picks its port itself and then sticks to it. It first tries the port it used last time (saved in `explainer/.last-port`), then 8765, then the first free port of 8775-8784 (8765 is often taken by another app on this Mac). Keeping the same port matters because the browser keeps your Verb Trainer progress per address: `127.0.0.1:8765` and `127.0.0.1:8775` count as two different sites. It prints the addresses to open. The first time, for example:

```text
Port 8765 is busy, using 8775.
Explainer running at http://127.0.0.1:8775/
Verb Trainer: http://127.0.0.1:8775/trainer/#home
Explain: http://127.0.0.1:8775/trainer/#explain
Standalone demo: http://127.0.0.1:8775/
```

Later runs print `Using port 8775 again (the port from last time, saved in .last-port), so your progress stays at the same address.` If that port is busy, the server says so (`Port 8775 (used last time) is busy, using 8776.`) and reminds you that progress can be moved with Export and Import on the Progress page.

`.last-port` holds one number and nothing else. It is only used if it is a whole number from 1024 to 65535, so a damaged file is ignored. It is never served over HTTP, and `EXPLAINER_PORT` ignores it and doesn't overwrite it. To forget the port, delete it: `rm explainer/.last-port`  (from the repo root). It is a local runtime file: leave it out of backups you share and out of version control if this folder ever becomes a repository.

Use the address it prints. `./start.sh --open` (or `node server.js --open`) opens the Explain page once the server is listening. The Verb Trainer lines appear because the shipped `config.json` sets `serveSite: true` (see Configuration).

## Requirements

- macOS
- Node.js 20+ to run the server; Node.js 21+ to run the tests
- The Ollama app (https://ollama.com), running at `http://127.0.0.1:11434`
- The model `mistral:latest` installed in Ollama (`ollama pull mistral`, about 4.4 GB, done by you, never by the scripts)
- Google Chrome only for `npm run test:ui`

## Model choice and limits

`mistral:latest` (Mistral 7B) is the default because it is already installed, fits in 18 GB of RAM (about 5 GB resident) with room to spare, runs at interactive speed on Apple Silicon and handles French well.

A 7B model makes grammar mistakes: it can mislabel a tense, invent a lemma or misjudge the level. That is why every result says "AI-generated - may contain errors", why verb facts are grounded against your 125-verb guide (marked "from your guide"), and why disagreements are shown as "Check: …" lines. The CEFR level is a rough estimate.

Expected latency (measured with `mistral:latest` on this Mac, an Apple Silicon machine with 18 GB RAM, model already loaded, 7 test inputs on the current prompt): per input, median 21.8 s and max 52.5 s (the 3-sentence paragraph); per sentence, median 18.9 s and max 25.2 s. Each sentence is one model call, so a paragraph takes roughly 15-25 s per sentence.

The first answer after a while is slower because Ollama has to load the model; it then stays loaded for 10 minutes (`ollama.keepAlive`).

### Purpose-built translation models (not used yet)

The default is Mistral alone. Two options were evaluated and left for later:

- Helsinki-NLP `opus-mt-fr-en` (MarianMT, about 300 MB): purpose-built and often more literal-accurate, but it only translates (Mistral is still needed for the breakdown) and needs a Python ML stack or transformers.js plus a download. Worth trying only if natural translations turn out to be weak while breakdowns are fine.
- Chrome's built-in on-device Translator API (Chrome 138+ desktop): no install in the project, on-device, translation only, Chrome only. The cheapest add-on later, as an optional "Compare with Chrome's translation" line.

If Mistral 7B's breakdowns prove weak, the upgrade candidates are `mistral-nemo` (12B, about 7 GB) and `qwen2.5:7b-instruct` (strong at structured JSON). Switching is a configuration change only (`EXPLAINER_MODEL=mistral-nemo ./start.sh` after you pull it yourself). Nothing is pulled by this project; Mistral Small 24B is too large for this machine.

## Privacy

- In local mode your text goes only to Ollama on this Mac. Nothing leaves the machine.
- The server does not log your text or the model's output at the default log level (`info`); it logs method, path, status, timing and counts only. `logLevel: "debug"` (opt-in, for troubleshooting) logs the first 200 characters of the input and of each raw model answer to the server console.
- Recent explanations are kept in this browser's localStorage (key `frenchExplainer.v1`, up to 10 items). The "Clear history" button removes them.

## Security

Local mode has no authentication. The server listens on 127.0.0.1 only and checks Host and Origin, so only pages served by it (or origins you add) can use it.

This is a local, unauthenticated HTTP endpoint (`POST /api/explain`, `GET /api/health` and the static UI files) on `127.0.0.1` (port 8765, or 8775-8784 when 8765 is busy). With `serveSite` on it also serves two fixed folders read-only: `verb-trainer/` at `/trainer/` and the `*.pdf` files of `topics/` at `/topics/`. That is acceptable here because:

- It binds to the loopback interface only. `config.js` refuses any other address (including `localhost` as a name, `0.0.0.0` and LAN IPs), so no other machine can connect.
- The Host check (exact `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`) blocks DNS-rebinding pages.
- The Origin check uses exact matches and never `*`, so other websites can't read responses or send JSON requests. Cross-site no-cors GETs (`Sec-Fetch-Site: cross-site`) are refused.
- POST requires `Content-Type: application/json`, bodies are capped at 16 KB, input at 2000 characters and 8 sentences, there is a rate limit (10 explains per minute, burst 3) and only one explain runs at a time.
- It has no side effects beyond CPU/GPU use: it reads no files outside its own folder and the two fixed site folders, writes nothing to disk, never executes model output, and its only outbound call goes to the loopback Ollama URL. No credentials exist in local mode.
- Site files come from an exact-path allowlist built at startup (allowlisted extensions only; no dotfiles, symlinks, `tests/` folder or directory listings), GET/HEAD only. The URL is only a lookup key, so `..`, encoded slashes or backslashes and absolute-form targets cannot reach other files. The folders are fixed in code, not configurable.

Residual risks, stated plainly: any local process on this Mac can call the endpoint (it could already call Ollama directly). If you allow the `null` origin, any page that can create a sandboxed or opaque-origin document can use it (see Allowed origins).

You MUST add authentication before exposing the Explainer beyond localhost. The local origin checks are not authentication. The server refuses non-loopback binds on purpose; cloud exposure is a different deployment (see Switching providers later).

ARCC security guidance was not available when this was built, so no organisational policy was checked; standard secure practice was applied.

## Configuration

Precedence: built-in defaults < `config.json` (optional) < environment variables. The config is validated once at startup; any invalid value prints one line to stderr and the server exits with code 1. Unknown keys are rejected so a typo can't silently disable a setting.

| Key (config.json) | Env override | Default | Allowed values |
|---|---|---|---|
| `host` | `EXPLAINER_HOST` | `"127.0.0.1"` | exactly `127.0.0.1` or `::1`; anything else is refused |
| `port` | `EXPLAINER_PORT` | `8765` | integer 1024-65535. Without `EXPLAINER_PORT`, the port saved in `.last-port` is tried first, and a busy port falls back to the first free one of `port+10` … `port+19` (8775-8784); with `EXPLAINER_PORT` set, only that port is tried and a busy port stops startup |
| `provider` | `EXPLAINER_PROVIDER` | `"ollama"` | `"ollama"` or `"bedrock"` |
| `allowedOrigins` | `EXPLAINER_ALLOWED_ORIGINS` (comma-separated) | `[]` | `"null"` or origins like `http://localhost:3000` (no path, no trailing slash); `"*"` refused; max 10 |
| `ollama.url` | `EXPLAINER_OLLAMA_URL` | `"http://127.0.0.1:11434"` | `http:` URL on `127.0.0.1`, `localhost` or `[::1]` only |
| `ollama.model` | `EXPLAINER_MODEL` | `"mistral:latest"` | `^[A-Za-z0-9._:/-]{1,100}$` |
| `ollama.temperature` | — | `0.1` | number 0-1 |
| `ollama.numCtx` | — | `8192` | integer 4096-32768 |
| `ollama.numPredict` | — | `1800` | integer 256-4096 |
| `ollama.seed` | `EXPLAINER_SEED` | unset | optional integer (the live test uses 42) |
| `ollama.keepAlive` | — | `"10m"` | like `30s`, `10m`, `1h` |
| `limits.maxChars` | — | `2000` | integer 1-2000 |
| `limits.maxSentences` | — | `8` | integer 1-8 |
| `limits.maxBodyBytes` | — | `16384` | integer 1024-65536 |
| `limits.modelTimeoutMs` | `EXPLAINER_MODEL_TIMEOUT_MS` | `120000` | integer 1000-600000 (per model call) |
| `limits.totalTimeoutMs` | — | `300000` | integer ≥ `modelTimeoutMs`, ≤ 900000 |
| `limits.repairAttempts` | — | `1` | integer 0-2 |
| `rateLimit.explainPerMinute` / `explainBurst` | — | `10` / `3` | integers 1-120 / 1-10 |
| `rateLimit.healthPerMinute` | — | `60` | integer 1-600 |
| `bedrock.enabled` | `EXPLAINER_BEDROCK_ENABLED` (`1`/`true`/`0`/`false`) | `false` | boolean |
| `bedrock.region` | `EXPLAINER_BEDROCK_REGION` | unset | e.g. `eu-west-3` |
| `bedrock.modelId` | `EXPLAINER_BEDROCK_MODEL_ID` | unset | `^[A-Za-z0-9.:/_-]{1,200}$` |
| `logLevel` | `EXPLAINER_LOG_LEVEL` | `"info"` | `error`, `warn`, `info`, `debug` |
| `serveSite` | `EXPLAINER_SERVE_SITE` (`1`/`true`/`0`/`false`) | `false` (the shipped `config.json` sets `true`) | boolean. `true` also serves `verb-trainer/` at `/trainer/` and `topics/*.pdf` at `/topics/`, read-only |

`null` in a `config.json` section value means "unset". Timeouts: when a sentence runs out of time, finished sentences are kept and the rest are marked as skipped.

Note: the browser module gives up after 330 000 ms (`FETCH_TIMEOUT_MS` in `explainer.js`, the server total plus 30 s). If you raise `limits.totalTimeoutMs` above 300000, raise that client timer too, or the page will stop waiting before the server does.

### Credential guard

`config.json` must never contain credentials. At startup the config loader walks every key at any depth and refuses to start if a key looks like a credential: any name segment (camelCase, `_`, `-` and `.` split the name), or two adjacent segments joined, equal to `secret`, `password`, `passwd`, `token`, `apikey`, `accesskey`, `credential`, `credentials`, `sessiontoken`, `privatekey`, `authorization` or `bearer`. So `awsSecretAccessKey`, `AWS_SECRET_ACCESS_KEY`, `api_key`, `apiKey`, `x-api-key`, `accessKeyId`, `sessionToken` and `password` are rejected, while `modelId`, `region` and `sessionLength` pass. The exact key `maxTokens` is exempt (it is a model setting, not a credential). The message is: "Credentials do not belong in config.json. Use the AWS default credential chain (aws configure / AWS_PROFILE / SSO) on the server; see README."

## Allowed origins

By default only pages served by the Explainer itself (`http://127.0.0.1:<port>`, `http://localhost:<port>`, `http://[::1]:<port>`) can call the API. To let another local site call it, add its exact origin:

```json
{ "allowedOrigins": ["http://localhost:3000"] }
```

or `EXPLAINER_ALLOWED_ORIGINS=http://localhost:3000 ./start.sh`. The server then answers that origin with an exact `Access-Control-Allow-Origin` (never `*`, never credentials).

Why `null` is off by default: a page opened from `file://` (for example the Verb Trainer's `index.html` opened by double-click instead of through the helper) sends `Origin: null`, so it could only use the Explainer if you add `"null"`. But `null` is not a unique identity. Sandboxed iframes, `data:` URLs and some redirects send it too, so any website you visit could embed a sandboxed iframe and call the Explainer. Such a page could make your Mac run Mistral on text it chooses (limited by the rate limit and single-flight guard) and learn that the server exists. It could not read files, reach credentials or change anything. If you enable it anyway, the server prints "Warning: Origin 'null' is allowed: any sandboxed page can call this server". You don't need it: with `serveSite` on (the shipped setting) the helper serves the Verb Trainer itself at `http://127.0.0.1:<port>/trainer/`, so the site and the API share one origin and the `null` origin is unnecessary (INTEGRATION.md §8).

## Switching providers later (cloud)

The server core is transport-agnostic, so a cloud provider is a configuration change plus one new provider file. In this build `provider: "bedrock"` is a stub: with `bedrock.enabled` false (the default) every explain returns `PROVIDER_NOT_CONFIGURED`; enabled but missing `region`/`modelId` lists the missing fields; fully configured returns `PROVIDER_NOT_IMPLEMENTED` ("Bedrock support is planned but not built yet."). No AWS SDK is imported, so nothing is installed and no network call can happen. Health reports `mode: "cloud"`, `dataLeavesDevice: true` and `ready: false`.

Plan for the real Bedrock provider:

- Package `@aws-sdk/client-bedrock-runtime`, exact version pinned (`npm install --save-exact`), loaded only by `lib/providers/bedrock.js`.
- Credentials come only from the AWS SDK default credential provider chain on the server (process environment, `~/.aws` profile/SSO, or a Lambda execution role). Never in `config.json` (the credential guard rejects them), never in the browser, never in responses or logs.
- Least-privilege IAM: `bedrock:InvokeModel` on the one configured model ARN only.
- `ConverseCommand` with `modelId = bedrock.modelId`, `inferenceConfig: {temperature: 0.1, maxTokens: 1800}`, the same prompts, and the same validation and repair of the JSON answer.
- Disclosure: in cloud mode your French text leaves the Mac and is processed by AWS in the configured region. The UI shows "Cloud mode: your text is sent to AWS (<region>) for processing." and every result carries the same notice.

Cloud deployment checklist (API Gateway + Lambda, with a small `lambda.js` adapter around the same explain service; the UI only needs a new `apiBase`). All of these are required before any non-localhost exposure:

1. Authentication on the API (for example an API Gateway Cognito or IAM authorizer). The local origin checks are not authentication.
2. CORS on API Gateway with explicit origins only, never `*`.
3. API Gateway throttling to replace the in-process rate limiter.
4. TLS (API Gateway provides it).
5. A privacy notice that text leaves the device.

The local server keeps refusing non-loopback binds even then.

## Tests

Run from the explainer folder:

```bash
npm test             # = node --test "tests/*.test.js": unit + integration, stubbed model, loopback only
npm run test:live    # real mistral:latest via Ollama (needs Ollama running and the model installed); add -- --out <dir> to choose where live-results.{json,md} go
npm run test:ui      # headless Chrome check of the UI (needs Google Chrome)
```

Besides the original suites, `npm test` includes `tests/port.test.js` (port candidates, busy-port fallback, strict `EXPLAINER_PORT`), `tests/serve-site.test.js` (the `/trainer/` and `/topics/` allowlist: content types, traversal and encoding tricks, symlinks, dotfiles, Range, 405/403, `serveSite` off, plus the real site folder), `tests/site-copy.test.js` (the Verb Trainer's copies of `explainer.js`/`explainer.css` must be byte-identical) and fake-DOM `mount()` tests in `tests/ui-logic.test.js` (`headingLevel`, `setVoiceSettings`). The live run posts 7 inputs, the last one a learner error ("Hier, j'ai allé au cinéma.") that must be flagged.

The tests need Node 21+ (glob support in `node --test`); on Node 20 `npm test` fails with a missing-path error. `node --test tests/` does not work either (it would also pick up helpers and fixtures); use `npm test`.

## Data copies

`data/data.js`, `data/data-100.js` and `data/verb-types.js` are copies of the Verb Trainer's verb data (125 verbs). The server loads them read-only at startup in a sandbox. If the site's verb data changes, re-copy those 3 files into `data/` and restart the server.

## Troubleshooting

- "Mistral isn't running" / `start.sh` says Ollama is not running: open the Ollama app (`open -a Ollama`) or run `ollama serve` in Terminal, wait a few seconds and try again.
- "Model mistral:latest is not installed": run `ollama pull mistral` yourself (about 4.4 GB), or set `EXPLAINER_MODEL` to a model you have (`ollama list`).
- "Using port 8775 again …": not an error. The server reuses last time's port (`.last-port`) so your progress stays at the same address.
- "Port 8765 is busy, using 8775.": not an error. Another program (or a second Explainer) uses 8765, so the server moved to the next free port; open the address it prints. "Ports … are all busy": every fallback port is taken; run `EXPLAINER_PORT=<free port> ./start.sh`. With `EXPLAINER_PORT` set, a busy port stops startup instead of falling back.
- The first answer is slow: Ollama is loading the model. It stays loaded for 10 minutes (`ollama.keepAlive`); later answers are faster.
- "The AI's answer couldn't be read": try again, or try a shorter text or one sentence at a time.
- No French voice / Listen buttons disabled: System Settings › Accessibility › Spoken Content › System voice › Manage voices, then install a French voice (for example Amélie (Premium)). Reload the page.
- A page opened from `file://` gets "Can't reach the Explainer server…": open the address the server prints instead (for the Verb Trainer, `http://127.0.0.1:<port>/trainer/#explain`), or see Allowed origins for the `null` trade-off.
- Verb links or guide facts look out of date: re-copy the 3 data files (see Data copies) and restart.
- "Explainer config error: …" at startup: fix the named key in `config.json` or the environment variable; the message says what is allowed.
