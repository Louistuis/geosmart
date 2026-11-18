# GeoSmart

**Claude AI inside GeoGebra Classic 6, on macOS and Windows.** Right-click anything in your construction and ask Claude to explain it, analyse it, or draw something new. GeoSmart is a small patch for the GeoGebra Classic 6 you already have installed. GeoGebra itself looks and works exactly as before.

Website: [geosmart.lou15.com](https://geosmart.lou15.com)

> Unofficial. Not affiliated with or endorsed by GeoGebra GmbH. GeoGebra® is a registered trademark of GeoGebra GmbH. This repository contains no GeoGebra code; it patches your own installed copy, and GeoGebra's [license](https://www.geogebra.org/license) (non-commercial use) still applies to it.

## What you get

- **Right-click items** in GeoGebra's own menus: *Explain f with AI*, *Analyse f with AI*, *Draw here with AI…*, *Ask AI…* (in Norwegian when GeoGebra runs in Norwegian).
- **Shortcuts:** quick ask ⌘K / Ctrl+K, side panel ⌘J / Ctrl+J, settings ⌘, / Ctrl+,, stop ⌘. / Ctrl+. and Option/Alt-right-click straight to quick ask. On macOS there is also an **AI** menu.
- Claude works on the live construction through GeoGebra's own API: runs input-bar commands, checks maths with GeoGebra's CAS, looks at a screenshot of the drawing, styles and deletes objects, moves the view.
- **One-step undo** for everything the AI changed in a reply.
- Your choice of **Claude Sonnet 5.5 or Opus 5.5** and the **effort** level (low, medium, high, extra high, max). Optional reasoning summaries and a read-only mode.
- Your **own Anthropic API key**, stored encrypted (macOS Keychain, or Windows encryption tied to your user account) and sent only to Anthropic.

## Install

You need GeoGebra Classic 6 and an [Anthropic API key](https://console.anthropic.com/settings/keys).

### macOS

1. Install [GeoGebra Classic 6](https://apps.apple.com/app/geogebra-classic-6/id1182481622) into `/Applications` and quit it.
2. Download **[GeoSmart-macOS.zip](https://github.com/Louistuis/geosmart/releases/latest/download/GeoSmart-macOS.zip)** and unzip it.
3. Right-click **Install GeoSmart.command** and choose Open (it asks for your Mac password), or in Terminal: `cd GeoSmart && sudo ./patch.sh`.
4. Open GeoGebra, press **⌘,** and paste your API key.

### Windows

1. Install [GeoGebra Classic 6](https://www.geogebra.org/download?lang=en) (the installer from geogebra.org, not the Microsoft Store version) and close it.
2. Download **[GeoSmart-Windows.zip](https://github.com/Louistuis/geosmart/releases/latest/download/GeoSmart-Windows.zip)** and extract it.
3. Double-click **Install GeoSmart.cmd**. For a portable GeoGebra: `powershell -ExecutionPolicy Bypass -File patch.ps1 -Path "D:\GeoGebra"`.
4. Open GeoGebra, press **Ctrl+,** and paste your API key.

**After a GeoGebra update, install GeoSmart again.** Updates replace the patched files (App Store updates on macOS; GeoGebra updates itself on Windows). To remove GeoSmart: **Uninstall GeoSmart** (`.command` / `.cmd`), `sudo ./patch.sh --restore` or `patch.ps1 -Restore`.

### What the patch changes

- Saves GeoGebra's original `main.js`, `preload.js` and HTML pages to `resources/app/.geosmart-original/` (used by restore).
- Adds one `require` and a menu hook to `main.js`, appends a small bridge to `preload.js`, and loads `geosmart.js`, `geosmart.css` and KaTeX in the HTML pages.
- The patcher (`patcher/patch.js`) runs on GeoGebra's own Electron in Node mode, so nothing else needs installing.
- macOS only: the app is re-signed ad-hoc. Changed files break Apple's signature anyway; ad-hoc signing also removes the App Store sandbox, so GeoGebra's own settings move to `~/Library/Application Support/GeoGebra` and start fresh.

## How it works

| File | Role |
| --- | --- |
| `src/geosmart/main-geosmart.js` | Main process: settings, encrypted API key, the Claude agent loop with the official `@anthropic-ai/sdk` (streaming, adaptive thinking, effort, server-side refusal fallback). |
| `src/preload-addon.js` | The narrow bridge the page may call. |
| `src/renderer/geosmart.js` | Adds items to GeoGebra's right-click menus, the panel, quick ask and settings, and runs Claude's tools against `ggbApplet`. |
| `patcher/patch.js` | Cross-platform apply / restore / status. |
| `patch.sh`, `patch.ps1` | macOS and Windows front ends. |
| `release.sh` | Builds the two release zips with dependencies included. |

The API call runs in the main process because GeoGebra's page blocks requests to anything but its own domains.

## Development

```bash
(cd vendor && npm ci)
./patch.sh --test                       # patch a throwaway copy in build/
node tools/mock-api.mjs 8787 shots/api.log &
GEOSMART_HEADLESS=1 GEOSMART_DEBUG_PORT=9334 GEOSMART_SHOT_DIR=$PWD/shots \
GEOSMART_TEST_KEY=sk-ant-test-x GEOSMART_BASE_URL=http://127.0.0.1:8787 \
  "build/GeoGebra Classic 6.app/Contents/MacOS/GeoGebra Classic 6" &
node tools/cdp.mjs 9334 'GeoSmart.ask("draw y=2x+1", null)'
```

`tools/mock-api.mjs` fakes the Messages API and `tools/cdp.mjs` drives the hidden app over the DevTools protocol. `GEOSMART_FORCE_SAFESTORAGE=1` exercises the Windows key storage on a Mac. Kill test instances with `pkill -9`: a normal quit waits on GeoGebra's hidden "save changes?" prompt.

Tested: the full AI loop on macOS, and GeoGebra's actual Windows app files patched and run on the same Electron version. The PowerShell installer was parsed and dry-run on PowerShell 7 for Linux; it has not yet been run on a Windows PC.

## License

MIT for the code in this repository (see `LICENSE`). Bundled dependencies keep their own licenses (Anthropic SDK and KaTeX are MIT). GeoGebra is licensed separately by GeoGebra GmbH.
