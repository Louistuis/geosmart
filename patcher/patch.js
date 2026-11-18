#!/usr/bin/env node
// GeoSmart patcher (macOS and Windows). Runs under plain Node or under
// GeoGebra's own Electron with ELECTRON_RUN_AS_NODE=1.
//
//   patch.js apply   <geogebra resources/app dir> <geosmart dir> [result.json]
//   patch.js restore <geogebra resources/app dir> [result.json]
//   patch.js status  <geogebra resources/app dir> [result.json]
//
// <geosmart dir> is the repo or release folder (src/, vendor/node_modules/).
// Exit code 0 on success. A result file is written when given, because a
// Windows GUI executable run as Node has no console the caller can read.
'use strict';
const fs = require('fs');
const path = require('path');

const [cmd, appDir, a3, a4] = process.argv.slice(2);
const resultFile = cmd === 'apply' ? a4 : a3;
const BACKUP = appDir ? path.join(appDir, '.geosmart-original') : '';

function done(ok, message, extra) {
    const out = Object.assign({ ok, message }, extra || {});
    if (resultFile) { try { fs.writeFileSync(resultFile, JSON.stringify(out, null, 2)); } catch (e) { /* ignore */ } }
    (ok ? console.log : console.error)(message);
    process.exit(ok ? 0 : 1);
}
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const isPatched = () => fs.existsSync(path.join(appDir, 'main.js')) && read(path.join(appDir, 'main.js')).includes('main-geosmart');
const htmlFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.html'));

if (!cmd || !appDir) done(false, 'usage: patch.js apply|restore|status <resources/app dir> [geosmart dir] [result.json]');
if (!fs.existsSync(path.join(appDir, 'main.js')) || !fs.existsSync(path.join(appDir, 'html', 'classic.html'))) {
    done(false, `Not a GeoGebra Classic 6 app folder: ${appDir}`);
}

if (cmd === 'status') done(true, isPatched() ? 'patched' : 'not patched', { patched: isPatched() });

if (cmd === 'restore') {
    if (!fs.existsSync(path.join(BACKUP, 'main.js'))) done(false, 'No backup found, nothing to restore.');
    fs.copyFileSync(path.join(BACKUP, 'main.js'), path.join(appDir, 'main.js'));
    fs.copyFileSync(path.join(BACKUP, 'preload.js'), path.join(appDir, 'preload.js'));
    for (const f of htmlFiles(path.join(BACKUP, 'html'))) fs.copyFileSync(path.join(BACKUP, 'html', f), path.join(appDir, 'html', f));
    for (const d of [path.join(appDir, 'geosmart'), path.join(appDir, 'html', 'geosmart'), BACKUP]) fs.rmSync(d, { recursive: true, force: true });
    done(true, 'Restored the original GeoGebra files.');
}

if (cmd !== 'apply') done(false, 'unknown command ' + cmd);
const SRC = a3 && path.resolve(a3);
if (!SRC || !fs.existsSync(path.join(SRC, 'src', 'geosmart', 'main-geosmart.js'))) done(false, 'GeoSmart folder not found: ' + a3);
const NM = path.join(SRC, 'vendor', 'node_modules');
if (!fs.existsSync(path.join(NM, '@anthropic-ai', 'sdk')) || !fs.existsSync(path.join(NM, 'katex', 'dist'))) {
    done(false, 'Dependencies missing. Use a release download, or run `npm ci` in vendor/ first.');
}

// 1. Snapshot pristine files (fresh install or after a GeoGebra update).
if (!isPatched()) {
    fs.rmSync(BACKUP, { recursive: true, force: true });
    fs.mkdirSync(path.join(BACKUP, 'html'), { recursive: true });
    fs.copyFileSync(path.join(appDir, 'main.js'), path.join(BACKUP, 'main.js'));
    fs.copyFileSync(path.join(appDir, 'preload.js'), path.join(BACKUP, 'preload.js'));
    for (const f of htmlFiles(path.join(appDir, 'html'))) fs.copyFileSync(path.join(appDir, 'html', f), path.join(BACKUP, 'html', f));
    fs.writeFileSync(path.join(BACKUP, 'SAVED.json'), JSON.stringify({ saved: new Date().toISOString() }));
}
if (!fs.existsSync(path.join(BACKUP, 'main.js'))) done(false, 'Backup missing. Reinstall GeoGebra, then patch again.');

// 2. main.js: exact hooks on the pristine copy; stop if GeoGebra changed them.
let s = read(path.join(BACKUP, 'main.js'));
function rep(a, b) {
    const n = s.split(a).length - 1;
    if (n !== 1) done(false, 'GeoGebra changed its main.js; this GeoSmart version cannot hook into it (' + a.slice(0, 50) + ').');
    s = s.replace(a, b);
}
rep("const fs = require('fs');", "const fs = require('fs');\nconst GS = require('./geosmart/main-geosmart.js');");
rep('webPreferences: {\n            nodeIntegration: false,', 'webPreferences: {\n            backgroundThrottling: !GS.headless,\n            nodeIntegration: false,');
rep('win = new BrowserWindow(pref);', 'win = new BrowserWindow(pref);\n    GS.attach(win);');
rep('        pref.show = true;\n        win.show();', '        pref.show = true;\n        if (!GS.headless) win.show();');
{
    const a = s.indexOf('        Menu.setApplicationMenu(Menu.buildFromTemplate([');
    const b = a < 0 ? -1 : s.indexOf('        ));\n', a);
    if (a < 0 || b < 0) done(false, 'GeoGebra changed its main.js menu; cannot hook into it.');
    s = s.slice(0, a) + '        Menu.setApplicationMenu(GS.buildMenu());\n' + s.slice(b + '        ));\n'.length);
}
fs.writeFileSync(path.join(appDir, 'main.js'), s);

// 3. preload.js: GeoGebra's own bridge plus ours.
fs.writeFileSync(path.join(appDir, 'preload.js'), read(path.join(BACKUP, 'preload.js')) + '\n\n' + read(path.join(SRC, 'src', 'preload-addon.js')));

// 4. Code: main-process module + runtime deps, page UI + KaTeX.
const G = path.join(appDir, 'geosmart');
const H = path.join(appDir, 'html', 'geosmart');
fs.rmSync(G, { recursive: true, force: true });
fs.rmSync(H, { recursive: true, force: true });
fs.mkdirSync(path.join(G, 'vendor', 'node_modules'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'src', 'geosmart', 'main-geosmart.js'), path.join(G, 'main-geosmart.js'));
for (const m of fs.readdirSync(NM)) {
    if (m === 'katex' || m.startsWith('.')) continue;
    fs.cpSync(path.join(NM, m), path.join(G, 'vendor', 'node_modules', m), { recursive: true });
}
fs.cpSync(path.join(SRC, 'src', 'renderer'), H, { recursive: true });
const KX = path.join(NM, 'katex', 'dist');
fs.copyFileSync(path.join(KX, 'katex.min.js'), path.join(H, 'katex.min.js'));
fs.copyFileSync(path.join(KX, 'katex.min.css'), path.join(H, 'katex.min.css'));
fs.cpSync(path.join(KX, 'fonts'), path.join(H, 'fonts'), { recursive: true });

// 5. Load the UI in every page, from the pristine HTML each time.
const TAG = '<link rel="stylesheet" href="geosmart/katex.min.css"><link rel="stylesheet" href="geosmart/geosmart.css">'
    + '<script src="geosmart/katex.min.js" defer></script><script src="geosmart/geosmart.js" defer></script>\n</head>';
for (const f of htmlFiles(path.join(BACKUP, 'html'))) {
    const html = fs.readFileSync(path.join(BACKUP, 'html', f), 'utf8');
    if (!html.includes('</head>')) continue;
    fs.writeFileSync(path.join(appDir, 'html', f), html.replace('</head>', TAG));
}

done(true, `GeoSmart patched into ${appDir}.`, { patched: true });
