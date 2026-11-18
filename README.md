# GeoSmart

**Claude AI inside GeoGebra Classic 6 on macOS.** Right-click anything in your construction and ask Claude to explain it, analyse it, or draw something new. GeoSmart is a small patch for the GeoGebra Classic 6 you already have installed. GeoGebra itself looks and works exactly as before.

> Unofficial. Not affiliated with or endorsed by GeoGebra GmbH. GeoGebra® is a registered trademark of GeoGebra GmbH. This repository contains no GeoGebra code; it patches your own installed copy, and GeoGebra's [license](https://www.geogebra.org/license) (non-commercial use) still applies to it.

## What you get

- **Right-click items** in GeoGebra's own menus: *Explain f with AI*, *Analyse f with AI*, *Draw here with AI…*, *Ask AI…* (shown in Norwegian when GeoGebra runs in Norwegian).
- **⌘K** quick ask, **⌘J** side panel, **⌘,** settings, **⌘.** stop, **Option-right-click** straight to quick ask. Plus an **AI** menu in the menu bar.
- Claude works on the live construction through GeoGebra's own API: runs input-bar commands, checks maths with GeoGebra's CAS, looks at a screenshot of the drawing, styles and deletes objects, moves the view.
- **One-step undo** for everything the AI changed in a reply.
- Your choice of **Claude Sonnet 5.5 or Opus 5.5** and the **effort** level (low, medium, high, extra high, max). Optional reasoning summaries, and a read-only mode.
- Your **own Anthropic API key**, kept in the macOS Keychain and sent only to Anthropic.

## Install

Requirements: macOS, [GeoGebra Classic 6](https://apps.apple.com/app/geogebra-classic-6/id1182481622) in `/Applications`, Node.js, an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone https://github.com/Louistuis/geosmart.git
cd geosmart
(cd vendor && npm ci)
sudo ./patch.sh          # quit GeoGebra first
```

Open GeoGebra, press **⌘,** and paste your API key.

Re-run `sudo ./patch.sh` after every App Store update of GeoGebra (the update replaces the patched files). To undo everything: `sudo ./patch.sh --restore`.

### What the patch does to your app

- Saves GeoGebra's original `main.js`, `preload.js` and HTML pages to `…/Resources/app/.geosmart-original/` (used by `--restore`).
- Adds one `require` and an extra menu to `main.js`, appends a small bridge to `preload.js`, and loads `geosmart.js` / `geosmart.css` / KaTeX in the HTML pages.
- Re-signs the app ad-hoc. Changed files break Apple's signature anyway; ad-hoc signing also removes the App Store sandbox, so GeoGebra's own settings move to `~/Library/Application Support/GeoGebra` and start fresh.

## How it works

| File | Role |
| --- | --- |
| `src/geosmart/main-geosmart.js` | Main process: settings, API key in the Keychain (via `/usr/bin/security`, so re-patching never triggers Keychain prompts), the Claude agent loop with the official `@anthropic-ai/sdk` (streaming, adaptive thinking, effort, server-side refusal fallback). |
| `src/preload-addon.js` | The narrow bridge the page may call. |
| `src/renderer/geosmart.js` | Adds items to GeoGebra's right-click menus, the panel, quick ask and settings, and runs Claude's tools against `ggbApplet`. |
| `patch.sh` | Applies, re-applies and restores the patch. |

The API call runs in the main process because GeoGebra's page blocks requests to anything but its own domains.

## Development

`./patch.sh --test` patches a throwaway copy in `build/`. `tools/mock-api.mjs` fakes the Messages API, and `tools/cdp.mjs` drives the hidden test app over the DevTools protocol:

```bash
node tools/mock-api.mjs 8787 shots/api.log &
GEOSMART_HEADLESS=1 GEOSMART_DEBUG_PORT=9334 GEOSMART_SHOT_DIR=$PWD/shots \
GEOSMART_TEST_KEY=sk-ant-test-x GEOSMART_BASE_URL=http://127.0.0.1:8787 \
  "build/GeoGebra Classic 6.app/Contents/MacOS/GeoGebra Classic 6" &
node tools/cdp.mjs 9334 'GeoSmart.ask("draw y=2x+1", null)'
```

Kill test instances with `pkill -9`: a normal quit waits on GeoGebra's hidden "save changes?" prompt.

## License

MIT for the code in this repository (see `LICENSE`). Installed dependencies keep their own licenses (Anthropic SDK and KaTeX are MIT). GeoGebra is licensed separately by GeoGebra GmbH.
