#!/usr/bin/env bash
# Launch a dedicated Chrome instance with remote debugging enabled.
# Use this Chrome window for all Padlet automation scripts; they will
# attach to it via CDP on port 9222.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${REPO_ROOT}/artifacts/padlet-manual-chrome"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PADLET_CDP_PORT:-9222}"
START_URL="${1:-https://padlet.com/dashboard}"

if [[ ! -x "${CHROME_BIN}" ]]; then
  echo "Chrome binary not found at: ${CHROME_BIN}" >&2
  echo "Set CHROME_BIN to override." >&2
  exit 1
fi

mkdir -p "${PROFILE_DIR}"

# Clean up stale singleton locks from previous ungraceful shutdowns; if Chrome
# is actually still running we'll detect it below.
if ! lsof "${PROFILE_DIR}/SingletonLock" >/dev/null 2>&1; then
  rm -f "${PROFILE_DIR}/SingletonLock" "${PROFILE_DIR}/SingletonCookie" "${PROFILE_DIR}/SingletonSocket"
fi

# If a Chrome is already up on the debugging port, just exit so we don't
# launch a duplicate that ignores --app and other flags.
if curl -sS --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "Chrome already running on CDP port ${PORT}; leaving it as-is." >&2
  exit 0
fi

echo "Launching Chrome on CDP port ${PORT} with profile ${PROFILE_DIR}"
# NOTE: do NOT use --app=URL here. App windows expose a context-less CDP
# target which makes Playwright's chromium.connectOverCDP fail with
# "Browser context management is not supported".
exec "${CHROME_BIN}" \
  --remote-debugging-port="${PORT}" \
  --user-data-dir="${PROFILE_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --hide-scrollbars \
  --window-size=1920,1080 \
  --window-position=0,0 \
  "${START_URL}"
