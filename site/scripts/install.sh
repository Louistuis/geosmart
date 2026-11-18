#!/bin/bash
# GeoSmart setup for macOS: adds Claude to your installed GeoGebra Classic 6.
#
#   Install:    curl -fsSL https://gs.lou15.com | bash
#   Uninstall:  curl -fsSL https://gs.lou15.com/uninstall | bash
#
# Downloads the latest release from github.com/Louistuis/geosmart, then runs
# its patch.sh with sudo (your Mac password is needed to change the app).
# Everything sits inside main() so a partly downloaded script never runs.

main() {
  set -euo pipefail
  local MODE=install
  local APP="/Applications/GeoGebra Classic 6.app"
  local ZIP="https://github.com/Louistuis/geosmart/releases/latest/download/GeoSmart-macOS.zip"
  local P=$'\033[38;2;101;87;210m' R=$'\033[31m' B=$'\033[1m' D=$'\033[2m' N=$'\033[0m'
  [ -t 1 ] || { P=; R=; B=; D=; N=; }
  step() { printf '%s●%s %s\n' "$P" "$N" "$*"; }
  fail() { printf '%s✕%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
  running() { pgrep -f "$APP/Contents/MacOS/GeoGebra Classic 6\$" >/dev/null 2>&1; }

  printf '\n%sGeoSmart%s %s· Claude inside GeoGebra%s\n\n' "$B" "$N" "$D" "$N"
  [ "$(uname -s)" = Darwin ] || fail "This is the macOS setup. On Windows, open PowerShell and run:  irm https://gs.lou15.com | iex"
  [ -d "$APP" ] || fail "GeoGebra Classic 6 is not in Applications. Install it first: https://apps.apple.com/app/geogebra-classic-6/id1182481622"

  if running; then
    step "GeoGebra is open and has to close first. If it has unsaved work it will ask you to save."
    printf '  Press Return to close it, or Ctrl+C to stop. '
    read -r _ </dev/tty || true
    osascript -e 'tell application "GeoGebra Classic 6" to quit' >/dev/null 2>&1 || true
    local i; for i in $(seq 1 180); do running || break; sleep 1; done
    running && fail "GeoGebra is still open. Close it, then run this again."
  fi

  local TMP; TMP="$(mktemp -d)"
  trap "rm -rf '$TMP'" EXIT
  step "Downloading GeoSmart"
  curl -fsSL "$ZIP" -o "$TMP/geosmart.zip" || fail "Download failed. Check your connection and try again."
  ditto -x -k "$TMP/geosmart.zip" "$TMP"
  cd "$TMP/GeoSmart"
  step "Version $(cat VERSION). Your Mac password is needed to change the app."
  if [ "$MODE" = uninstall ]; then
    sudo ./patch.sh --restore </dev/tty
    printf '\n%s✓%s GeoSmart removed. GeoGebra is back to its original files.\n\n' "$P" "$N"
  else
    sudo ./patch.sh </dev/tty
    printf '\n%s✓%s GeoSmart is installed. Opening GeoGebra.\n' "$P" "$N"
    printf '  Get an API key at console.anthropic.com if you need one.\n'
    printf '  %sAfter a GeoGebra update, run this again.%s\n\n' "$D" "$N"
    open -a "GeoGebra Classic 6" || true
  fi
}

main "$@"
