# Security

## Static site

The verb trainer (`verb-trainer/`) is a fully static site. It makes **zero network requests**:
no external scripts, no analytics, no CDN, no API calls. When opened as a local file (`file://`),
or when served from GitHub Pages, nothing leaves the browser. The Content-Security-Policy in the
HTML headers (when served by the local helper) restricts scripts, styles and connections to
`'self'` only.

## Local helper (explainer/)

The local helper is an **unauthenticated HTTP server** that listens on `127.0.0.1` only. It is
designed for single-user, localhost use:

- It binds to the loopback interface and refuses any other bind address (including `0.0.0.0` and
  LAN IPs) at startup.
- Host and Origin headers are checked to block DNS-rebinding and cross-site requests.
- No credentials exist in local mode.
- Rate limiting, body-size caps and a single-flight guard limit resource use.

**You MUST add authentication before exposing the helper beyond localhost.** The local origin
checks are not authentication. The server refuses non-loopback binds on purpose; if you deploy
to a cloud environment, see the "Switching providers later" section of
[explainer/README.md](explainer/README.md) for the full cloud deployment checklist (API Gateway
+ authentication + TLS + CORS + privacy notice).

See [explainer/README.md](explainer/README.md) for the full security architecture, allowed
origins configuration, and residual risks.

## Reporting a vulnerability

Please open a GitHub issue or contact the maintainer directly via the repository contact. For
sensitive reports, describe the issue without publishing full exploit details.
