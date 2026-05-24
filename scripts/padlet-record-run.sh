#!/usr/bin/env bash
# Run a Padlet automation script while screen-recording with ffmpeg.
#
# Usage:
#   scripts/padlet-record-run.sh scripts/padlet-module-a-create-padlet.mjs [extra args...]
#
# Output: artifacts/videos/<script-basename>-<timestamp>.mov
#
# Requirements:
#   - ffmpeg with avfoundation support (brew install ffmpeg)
#   - macOS Screen Recording permission granted to your terminal
#   - A Chrome instance already running on PADLET_CDP_PORT (default 9222);
#     use scripts/padlet-chrome-launch.sh to start one.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <node-script> [args...]" >&2
  exit 1
fi

SCRIPT_PATH="$1"
shift

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIDEO_DIR="${REPO_ROOT}/artifacts/videos"
mkdir -p "${VIDEO_DIR}"

SCRIPT_NAME="$(basename "${SCRIPT_PATH}" .mjs)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
VIDEO_PATH="${VIDEO_DIR}/${SCRIPT_NAME}-${TIMESTAMP}.mov"

# AVFoundation device index for the primary display. Override via FFMPEG_AV_INPUT.
# To list devices: ffmpeg -f avfoundation -list_devices true -i ""
FFMPEG_AV_INPUT="${FFMPEG_AV_INPUT:-1:none}"

echo "[record] capturing ${FFMPEG_AV_INPUT} -> ${VIDEO_PATH}"
# .mov container + VideoToolbox hardware encoder works around the broken
# AVFoundation screen-capture timing on modern macOS that prevents libx264
# from estimating a frame rate.
ffmpeg -hide_banner -loglevel warning \
  -probesize 50M -analyzeduration 100M \
  -f avfoundation -pixel_format nv12 -i "${FFMPEG_AV_INPUT}" \
  -vf "scale=1920:-2,fps=30" \
  -c:v h264_videotoolbox -b:v 8M -r 30 \
  "${VIDEO_PATH}" &
RECORDER_PID=$!

cleanup() {
  if kill -0 "${RECORDER_PID}" 2>/dev/null; then
    echo "[record] stopping ffmpeg (pid ${RECORDER_PID})"
    kill -INT "${RECORDER_PID}" 2>/dev/null || true
    wait "${RECORDER_PID}" 2>/dev/null || true
  fi

  if [[ -s "${VIDEO_PATH}" ]]; then
    echo "[record] video: ${VIDEO_PATH}"
  else
    echo "[record] WARNING: no video captured at ${VIDEO_PATH}"
  fi
}
trap cleanup EXIT

# Give screencapture a moment to initialize.
sleep 2

set +e
node "${SCRIPT_PATH}" "$@"
SCRIPT_EXIT=$?
set -e

exit "${SCRIPT_EXIT}"
