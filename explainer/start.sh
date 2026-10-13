#!/usr/bin/env bash
# Start the French Explainer helper server (design §10.1).
# Checks Node and Ollama, never kills/restarts Ollama and never pulls a model.
# Usage: ./start.sh [--open]
set -euo pipefail

cd "$(dirname "$0")"

for arg in "$@"; do
  case "$arg" in
    --open) ;;
    *) echo "Unknown option: $arg (usage: ./start.sh [--open])" >&2; exit 1 ;;
  esac
done

# 1. Node.js 20+
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ] 2>/dev/null; then
  echo "Node.js 20+ is required" >&2
  exit 1
fi

# 2. Ollama reachable (start the app only if it is not answering; never restart it)
URL="${EXPLAINER_OLLAMA_URL:-http://127.0.0.1:11434}"
URL="${URL%/}"
ollama_up() { curl -fsS -m 2 "$URL/api/version" >/dev/null 2>&1; }

if ! ollama_up; then
  if [ -d "/Applications/Ollama.app" ]; then
    echo "Starting Ollama…"
    open -a Ollama || true
    for _ in $(seq 1 20); do
      sleep 1
      if ollama_up; then break; fi
    done
  fi
  if ! ollama_up; then
    echo "Ollama is not running at $URL." >&2
    echo "Start it with: open -a Ollama   (or run: ollama serve   in another Terminal), then run ./start.sh again." >&2
    exit 1
  fi
fi

# 3. Model installed (never pulled automatically)
MODEL="${EXPLAINER_MODEL:-mistral:latest}"
TAGS="$(curl -fsS -m 2 "$URL/api/tags" 2>/dev/null || true)"
if ! printf '%s' "$TAGS" | grep -qF "\"name\":\"$MODEL\""; then
  echo "Model $MODEL is not installed. Install it with: ollama pull mistral (about 4.4 GB)" >&2
  exit 1
fi

# 4. Run the server in this process (Ctrl+C stops it; Ollama keeps running). The server picks a free
#    port itself (8765, else 8775-8784; EXPLAINER_PORT = that port only), prints the URLs and, with
#    --open, opens the browser once it is listening.
exec node server.js "$@"
