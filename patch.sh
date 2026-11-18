#!/bin/bash
# Inject a discreet AI layer into an installed GeoGebra Classic 6.
#
#   sudo ./patch.sh                      patch /Applications/GeoGebra Classic 6.app
#   sudo ./patch.sh --restore            put the original files back
#   ./patch.sh --test                    patch a throwaway copy in build/ (no sudo)
#
# Safe to re-run (e.g. after an App Store update replaced the patched files).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="/Applications/GeoGebra Classic 6.app"
MODE="patch"
case "${1:-}" in
  --restore) MODE="restore" ;;
  --test) MODE="patch"; rm -rf "$HERE/build"; mkdir -p "$HERE/build"; ditto "$TARGET" "$HERE/build/GeoGebra Classic 6.app"; TARGET="$HERE/build/GeoGebra Classic 6.app" ;;
  "") ;;
  *) TARGET="$1" ;;
esac

APP="$TARGET/Contents/Resources/app"
PL="$TARGET/Contents/Info.plist"
BACKUP="$APP/.geosmart-original"
[ -f "$APP/main.js" ] || { echo "Not a GeoGebra Classic 6 app: $TARGET"; exit 1; }
[ -d "$HERE/vendor/node_modules/@anthropic-ai/sdk" ] || { echo "Run: (cd vendor && npm ci) first"; exit 1; }
if [ ! -w "$APP" ]; then echo "No write access to $TARGET. Run with sudo."; exit 1; fi
if pgrep -f "$TARGET/Contents/MacOS/" >/dev/null 2>&1; then echo "Quit GeoGebra first."; exit 1; fi

if [ "$MODE" = "restore" ]; then
  [ -d "$BACKUP" ] || { echo "No backup found, nothing to restore."; exit 1; }
  cp "$BACKUP/main.js" "$BACKUP/preload.js" "$APP/"
  for f in "$BACKUP"/html/*.html; do cp "$f" "$APP/html/"; done
  rm -rf "$APP/geosmart" "$APP/html/geosmart" "$BACKUP"
  codesign --force --deep --sign - "$TARGET" 2>&1 | grep -v "replacing existing signature" || true
  echo "Restored original GeoGebra files (now ad-hoc signed; reinstall from the App Store for Apple's signature)."
  exit 0
fi

# 1. Back up the pristine files once per GeoGebra version.
VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$BACKUP/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PL")
if ! grep -q "main-geosmart" "$APP/main.js"; then
  # Unpatched (fresh install or App Store update): snapshot the pristine files.
  rm -rf "$BACKUP"; mkdir -p "$BACKUP/html"
  cp "$APP/main.js" "$APP/preload.js" "$BACKUP/"
  cp "$APP"/html/*.html "$BACKUP/html/"
  cp "$PL" "$BACKUP/Info.plist"
  VER=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PL")
  echo "$VER" > "$BACKUP/VERSION"
fi
[ -f "$BACKUP/main.js" ] || { echo "Backup missing; reinstall GeoGebra from the App Store, then re-run."; exit 1; }

# 2. main.js: patch the pristine copy with exact replacements (fails loudly if
#    a GeoGebra update changed the code we hook into).
python3 - "$BACKUP/main.js" "$APP/main.js" <<'EOF'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()
def rep(a, b):
    global s
    if s.count(a) != 1:
        sys.exit("GeoSmart: main.js changed upstream, hook not found: " + a[:60])
    s = s.replace(a, b)
rep("const fs = require('fs');", "const fs = require('fs');\nconst GS = require('./geosmart/main-geosmart.js');")
rep('webPreferences: {\n            nodeIntegration: false,', 'webPreferences: {\n            backgroundThrottling: !GS.headless,\n            nodeIntegration: false,')
rep("win = new BrowserWindow(pref);", "win = new BrowserWindow(pref);\n    GS.attach(win);")
rep("        pref.show = true;\n        win.show();", "        pref.show = true;\n        if (!GS.headless) win.show();")
a = s.index("        Menu.setApplicationMenu(Menu.buildFromTemplate([")
b = s.index("        ));\n", a) + len("        ));\n")
s = s[:a] + "        Menu.setApplicationMenu(GS.buildMenu());\n" + s[b:]
open(dst, "w", encoding="utf-8").write(s)
EOF
{ cat "$BACKUP/preload.js"; printf '\n\n'; cat "$HERE/src/preload-addon.js"; } > "$APP/preload.js"

# 3. AI layer code: main-process module + Claude SDK, renderer UI + KaTeX.
rm -rf "$APP/geosmart" "$APP/html/geosmart"
mkdir -p "$APP/geosmart/vendor/node_modules" "$APP/html/geosmart"
cp "$HERE/src/geosmart/main-geosmart.js" "$APP/geosmart/"
rsync -a --exclude katex "$HERE/vendor/node_modules/" "$APP/geosmart/vendor/node_modules/"
ditto "$HERE/src/renderer" "$APP/html/geosmart"
KX="$HERE/vendor/node_modules/katex/dist"
cp "$KX/katex.min.js" "$KX/katex.min.css" "$APP/html/geosmart/"
ditto "$KX/fonts" "$APP/html/geosmart/fonts"

# 4. Load the UI in every app page (from the pristine HTML each time).
for f in "$BACKUP"/html/*.html; do
  python3 - "$f" "$APP/html/$(basename "$f")" <<'EOF'
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()
tag = ('<link rel="stylesheet" href="geosmart/katex.min.css"><link rel="stylesheet" href="geosmart/geosmart.css">'
       '<script src="geosmart/katex.min.js" defer></script><script src="geosmart/geosmart.js" defer></script>')
s = s.replace("</head>", tag + "\n</head>", 1)
open(dst, "w", encoding="utf-8").write(s)
EOF
done

# 6. Re-sign ad-hoc. Modified resources break Apple's seal anyway; ad-hoc also
#    drops the App Store sandbox, which the AI layer needs for the Keychain tool.
#    Settings move from the sandbox container to ~/Library/Application Support/GeoGebra.
codesign --force --deep --sign - "$TARGET" 2>&1 | grep -v "replacing existing signature" || true
codesign --verify --deep "$TARGET"
echo "AI layer patched into: $TARGET (GeoGebra $VER)"
