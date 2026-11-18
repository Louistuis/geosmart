#!/bin/bash
# Build the two downloads in dist/: GeoSmart-macOS.zip and GeoSmart-Windows.zip.
# Each holds everything needed (runtime dependencies included, no Node or npm).
set -euo pipefail
cd "$(dirname "$0")"
VERSION=$(node -p "require('./vendor/package.json').version")
rm -rf dist && mkdir -p dist/stage
(cd vendor && npm ci --omit=dev --silent)

stage() { # $1 = folder
  local d="dist/stage/$1/GeoSmart"
  mkdir -p "$d/vendor"
  cp -R patcher src LICENSE README.md "$d/"
  cp vendor/package.json vendor/package-lock.json "$d/vendor/"
  cp -R vendor/node_modules "$d/vendor/node_modules"
  echo "$VERSION" > "$d/VERSION"
  echo "$d"
}

M=$(stage mac)
cp patch.sh "$M/"
cat > "$M/Install GeoSmart.command" <<'EOF'
#!/bin/bash
# Double-click (or right-click > Open the first time). Asks for your Mac password.
cd "$(dirname "$0")" && sudo ./patch.sh; echo; read -n 1 -s -r -p "Press any key to close."
EOF
cat > "$M/Uninstall GeoSmart.command" <<'EOF'
#!/bin/bash
cd "$(dirname "$0")" && sudo ./patch.sh --restore; echo; read -n 1 -s -r -p "Press any key to close."
EOF
chmod +x "$M/patch.sh" "$M"/*.command
(cd dist/stage/mac && ditto -c -k --keepParent GeoSmart ../../GeoSmart-macOS.zip)

W=$(stage win)
cp patch.ps1 "Install GeoSmart.cmd" "Uninstall GeoSmart.cmd" "$W/"
(cd dist/stage/win && zip -qr -X ../../GeoSmart-Windows.zip GeoSmart)

rm -rf dist/stage
ls -lh dist
echo "version $VERSION"
