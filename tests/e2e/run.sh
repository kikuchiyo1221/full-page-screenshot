#!/bin/bash
# End-to-end checks against a real headless Chrome.
#
# Phase 1 loads the shipped extension and verifies the manifest, every extension
# page and the service worker. Phase 2 runs an actual full-page capture against a
# known 3000px fixture and measures the stitched result.
#
# Phase 2 uses a throwaway copy of the extension with <all_urls> added, because
# activeTab is only granted by a real user gesture, which CDP cannot produce.
# The shipped manifest is never modified.
set -e

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${CDP_PORT:-9333}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"

[ -x "$CHROME" ] || { echo "Chrome not found at: $CHROME (override with CHROME=...)"; exit 1; }

cleanup() {
  if [ -n "$CHROME_PID" ]; then
    kill "$CHROME_PID" 2>/dev/null || true
    wait "$CHROME_PID" 2>/dev/null || true   # let Chrome finish writing its profile
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

# Downloads must land inside the throwaway profile, never in the user's ~/Downloads.
mkdir -p "$WORK/profile/Default" "$WORK/downloads"
cat > "$WORK/profile/Default/Preferences" <<JSON
{"download":{"default_directory":"$WORK/downloads","prompt_for_download":false},"savefile":{"default_directory":"$WORK/downloads"}}
JSON

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir="$WORK/profile" --remote-debugging-port="$PORT" \
  --window-size=1440,900 about:blank \
  > "$WORK/chrome.log" 2>&1 &
CHROME_PID=$!

for _ in $(seq 1 40); do
  sleep 0.25
  curl -s --max-time 2 "http://127.0.0.1:$PORT/json/version" > /dev/null 2>&1 && break
done

EXT_ROOT="$ROOT" WORK_DIR="$WORK" CDP_PORT="$PORT" node "$HERE/verify.mjs"
