#!/bin/sh
# update-native-audio.sh: one command to fetch/refresh the native-speaker recordings and check the site.
#   1. fetch-lingualibre.mjs (resumable: rerun it any time; finished clips are never downloaded twice)
#   2. build-download-zip.mjs (audio/downloads/native-recordings.zip for the Credits-view download link)
#   3. the site's test suite
#   4. the headless Chrome check (plays a new clip, checks Credits)
# Usage: ./update-native-audio.sh [fetch-lingualibre.mjs flags, e.g. --contact other@example.org]
# The User-Agent carries the project URL and a contact email (default: the project owner), which gets
# Wikimedia's 200 requests/min tier. It is sent to Wikimedia in the User-Agent header only.
# Output also goes to run.log next to this script. Safe to stop with Ctrl-C and run again.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SITE="$HERE/../../verb-trainer"
LOG="$HERE/run.log"

if pgrep -f "node fetch-lingualibre.mjs" >/dev/null 2>&1; then
  echo "A fetch is already running (pgrep -fl fetch-lingualibre). Wait for it, or stop it first." >&2
  exit 1
fi

echo "== 1/4 Fetching recordings ($(date)) ==" | tee -a "$LOG"
( cd "$HERE" && node fetch-lingualibre.mjs "$@" ) 2>&1 | tee -a "$LOG"
fetch_status=$?
[ "$fetch_status" -ne 0 ] && echo "Fetch exited with $fetch_status. Rerun this script to resume." | tee -a "$LOG"

echo "== 2/4 Download zip ==" | tee -a "$LOG"
( cd "$HERE" && node build-download-zip.mjs ) 2>&1 | tee -a "$LOG"

echo "== 3/4 Site tests ==" | tee -a "$LOG"
( cd "$SITE" && node --test tests/*.test.js 2>&1 | tail -8 ) | tee -a "$LOG"

echo "== 4/4 Headless Chrome check ==" | tee -a "$LOG"
TO=$(command -v timeout || command -v gtimeout || echo "")
if [ -n "$TO" ]; then "$TO" 120 node "$HERE/headless-check.mjs" > "$HERE/headless-result.json"; else node "$HERE/headless-check.mjs" > "$HERE/headless-result.json"; fi
hc=$?
pkill -f "user-data-dir=/tmp/vt-native-chrome-" 2>/dev/null || true
rm -rf /tmp/vt-native-chrome-* 2>/dev/null
echo "Headless check exit $hc (details: $HERE/headless-result.json)" | tee -a "$LOG"
echo "Done. Summary of this run: $HERE/last-run.json"
