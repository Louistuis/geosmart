#!/bin/bash
# GeoSmart for macOS: add Claude to your installed GeoGebra Classic 6.
#
#   sudo ./patch.sh                 patch /Applications/GeoGebra Classic 6.app
#   sudo ./patch.sh --restore       put the original files back
#   sudo ./patch.sh "/path/to/GeoGebra Classic 6.app"
#   ./patch.sh --test               patch a throwaway copy in build/ (no sudo)
#
# Safe to re-run, e.g. after an App Store update replaced the patched files.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="/Applications/GeoGebra Classic 6.app"
MODE="apply"
for arg in "$@"; do
  case "$arg" in
    --restore) MODE="restore" ;;
    --test) rm -rf "$HERE/build"; mkdir -p "$HERE/build"; ditto "$TARGET" "$HERE/build/GeoGebra Classic 6.app"; TARGET="$HERE/build/GeoGebra Classic 6.app" ;;
    *) TARGET="$arg" ;;
  esac
done

APP="$TARGET/Contents/Resources/app"
BIN="$TARGET/Contents/MacOS/GeoGebra Classic 6"
[ -f "$APP/main.js" ] && [ -x "$BIN" ] || { echo "GeoGebra Classic 6 not found at: $TARGET"; exit 1; }
[ -w "$APP" ] || { echo "No write access to $TARGET. Run with sudo."; exit 1; }
if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1; then echo "Quit GeoGebra first, then run this again."; exit 1; fi

# A fresh App Store copy runs in Apple's app sandbox, which stops its Electron
# (run as Node below) from reading the patcher. Re-sign ad hoc first: that
# drops the sandbox, and the changed files need a new signature anyway.
if [ "$MODE" = "apply" ]; then
  codesign --force --deep --sign - "$TARGET" 2>&1 | grep -v "replacing existing signature" || true
fi

# GeoGebra's own Electron runs the patcher as Node, so nothing else is needed.
if [ "$MODE" = "restore" ]; then
  ELECTRON_RUN_AS_NODE=1 "$BIN" "$HERE/patcher/patch.js" restore "$APP"
else
  ELECTRON_RUN_AS_NODE=1 "$BIN" "$HERE/patcher/patch.js" apply "$APP" "$HERE"
fi

# Changed files break Apple's signature, so re-sign ad-hoc. That also drops
# the App Store sandbox (GeoSmart needs the Keychain tool); GeoGebra's own
# settings then live in ~/Library/Application Support/GeoGebra.
codesign --force --deep --sign - "$TARGET" 2>&1 | grep -v "replacing existing signature" || true
codesign --verify --deep "$TARGET"
[ "$MODE" = "restore" ] || echo "Done. Open GeoGebra and press Cmd+, to add your Anthropic API key."
