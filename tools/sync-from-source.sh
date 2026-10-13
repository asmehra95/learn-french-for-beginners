#!/usr/bin/env bash
# sync-from-source.sh
# Idempotent rsync copy from the sibling "French Classes" source folder.
# Run from the repo root: bash tools/sync-from-source.sh
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SRC="$(dirname "$SCRIPT_DIR")/French Classes"
DEST="$SCRIPT_DIR"

if [ ! -d "$SRC" ]; then
  echo "ERROR: Source folder not found: $SRC" >&2
  exit 1
fi

echo "Syncing from: $SRC"
echo "         to: $DEST"
echo ""

RSYNC_OPTS=(-a --delete
  --exclude='.DS_Store'
  --exclude='__pycache__'
  --exclude='tts-tools/work/'
  --exclude='tts-tools/native-audio/cache/'
  --exclude='explainer/.last-port'
)

# Allowlist items to copy
ITEMS=(
  "verb-trainer"
  "explainer"
  "topics"
  "tts-tools"
  "25-most-common-french-verbs.md"
  "25-most-common-french-verbs.pdf"
  "100-more-common-french-verbs.md"
  "100-more-common-french-verbs.pdf"
  "100-more-french-verbs-workbook.pdf"
  "french-verbs-workbook.pdf"
)

for item in "${ITEMS[@]}"; do
  src_path="$SRC/$item"
  if [ ! -e "$src_path" ]; then
    echo "SKIP (not found in source): $item"
    continue
  fi

  # Determine destination: directories go into DEST/, files go directly to DEST/
  if [ -d "$src_path" ]; then
    dest_path="$DEST/"
  else
    dest_path="$DEST/$item"
  fi

  echo "rsync: $item"
  rsync "${RSYNC_OPTS[@]}" "$src_path" "$dest_path"
done

# Also copy topics into verb-trainer/topics/ so GitHub Pages can serve them from the artifact root.
TOPICS_SRC="$SRC/topics"
TOPICS_VT_DEST="$DEST/verb-trainer/topics/"
if [ -d "$TOPICS_SRC" ]; then
  echo "rsync: topics → verb-trainer/topics/"
  mkdir -p "$TOPICS_VT_DEST"
  rsync "${RSYNC_OPTS[@]}" "$TOPICS_SRC/" "$TOPICS_VT_DEST"
else
  echo "SKIP (not found in source): topics (for verb-trainer/topics/)"
fi

echo ""
echo "Done."
