#!/bin/bash
# Render the Chrome Web Store assets to PNG with headless Chrome.
# Screenshots are 1280x800 (store requirement); the promo tile is 440x280.
set -e

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/out"

[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (override with CHROME=...)"; exit 1; }

rm -rf "$OUT" && mkdir -p "$OUT"

render() {
  local file="$1" size="$2"
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files \
    --virtual-time-budget=3000 --window-size="$size" \
    --screenshot="$OUT/${file%.html}.png" "file://$DIR/$file" 2>/dev/null
  echo "  $OUT/${file%.html}.png ($size)"
}

echo "Rendering store screenshots (1280x800)..."
for file in 01-full-page.html 02-popup.html 03-editor.html 04-selection.html 05-privacy.html; do
  render "$file" 1280,800
done

echo "Rendering promo tile (440x280)..."
render promo-tile.html 440,280

echo
echo "Done. Upload from: $OUT"
