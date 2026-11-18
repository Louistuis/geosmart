// Discreet AI layer for GeoGebra Classic 6 (main process side).
// Holds the API key (macOS Keychain), settings, the per-window conversation
// and the Claude agent loop. Tools run in the renderer against ggbApplet.
'use strict';

const { app, ipcMain, Menu, shell, BrowserWindow } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const headless = process.env.GEOSMART_HEADLESS === '1';
if (process.env.GEOSMART_DEBUG_PORT) {
    app.commandLine.appendSwitch('remote-debugging-port', process.env.GEOSMART_DEBUG_PORT);
}

const MODELS = {
    opus: { id: 'claude-opus-5-5', label: 'Opus 5.5' },
    sonnet: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
};
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const DEFAULTS = { model: 'opus', effort: 'medium', showThinking: true, allowEdits: true, theme: 'auto' };
const MAX_STEPS = 30;

// ---------- settings ----------
let store = null;
function settingsStore() {
    if (!store) {
        const Config = require('electron-store');
        store = new Config({ name: 'geosmart' });
    }
    return store;
}
function getSettings() {
    const s = Object.assign({}, DEFAULTS, settingsStore().get('settings') || {});
    if (!MODELS[s.model]) s.model = DEFAULTS.model;
    if (!EFFORTS.includes(s.effort)) s.effort = DEFAULTS.effort;
    return s;
}
function setSettings(partial) {
    const cur = getSettings();
    const next = Object.assign({}, cur);
    if (partial && MODELS[partial.model]) next.model = partial.model;
    if (partial && EFFORTS.includes(partial.effort)) next.effort = partial.effort;
    if (partial && typeof partial.showThinking === 'boolean') next.showThinking = partial.showThinking;
    if (partial && typeof partial.allowEdits === 'boolean') next.allowEdits = partial.allowEdits;
    if (partial && ['auto', 'light', 'dark'].includes(partial.theme)) next.theme = partial.theme;
    settingsStore().set('settings', next);
    return next;
}

// ---------- API key in the macOS Keychain ----------
// Stored through /usr/bin/security so the item's access list trusts that
// Apple-signed tool, not this ad-hoc signed app: re-patching never
// triggers a Keychain prompt. The key goes in over stdin, never argv.
const KC_SERVICE = 'GeoGebra AI';
const KC_ACCOUNT = 'anthropic-api-key';
let cachedKey = null;
const KEY_RE = /^[A-Za-z0-9_\-]{20,400}$/;

function keychainRead() {
    return new Promise((resolve) => {
        execFile('/usr/bin/security', ['find-generic-password', '-s', KC_SERVICE, '-a', KC_ACCOUNT, '-w'],
            (err, stdout) => resolve(err ? null : String(stdout).trim() || null));
    });
}
function keychainWrite(key) {
    return new Promise((resolve, reject) => {
        if (!KEY_RE.test(key)) return reject(new Error('That does not look like an Anthropic API key.'));
        const p = spawn('/usr/bin/security', ['-i'], { stdio: ['pipe', 'ignore', 'pipe'] });
        let errText = '';
        p.stderr.on('data', (d) => { errText += d; });
        p.on('close', (code) => (code === 0 && !errText.trim()) ? resolve() : reject(new Error('Keychain write failed: ' + errText.trim())));
        p.stdin.write(`add-generic-password -U -s "${KC_SERVICE}" -a "${KC_ACCOUNT}" -l "GeoGebra AI: Claude API key" -w "${key}"\n`);
        p.stdin.end();
    });
}
function keychainDelete() {
    return new Promise((resolve) => {
        execFile('/usr/bin/security', ['delete-generic-password', '-s', KC_SERVICE, '-a', KC_ACCOUNT], () => resolve());
    });
}
async function getKey() {
    if (process.env.GEOSMART_TEST_KEY) return process.env.GEOSMART_TEST_KEY;
    if (cachedKey) return cachedKey;
    cachedKey = await keychainRead();
    return cachedKey;
}

function makeClient(key) {
    const Anthropic = require('./vendor/node_modules/@anthropic-ai/sdk').default;
    const opts = { apiKey: key, maxRetries: 2 };
    if (process.env.GEOSMART_BASE_URL) opts.baseURL = process.env.GEOSMART_BASE_URL;
    return { Anthropic, client: new Anthropic(opts) };
}

// ---------- tools (executed in the renderer) ----------
const READ_TOOLS = [
    {
        name: 'get_construction',
        description: 'List every object in the current GeoGebra construction with its name, type, definition, value, visibility and colour, plus the visible graphics window bounds and the selected objects. Call this first whenever you need to know what is on the canvas.',
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        name: 'inspect_object',
        description: 'Full detail for one object: type, command, definition, value string, numeric value, coordinates, colour, style, layer, caption, dependencies (XML).',
        input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Object label, e.g. "f" or "A"' } }, required: ['name'], additionalProperties: false },
    },
    {
        name: 'cas',
        description: 'Evaluate an expression with GeoGebra\'s CAS (Giac) and return the exact result. Use for solving, simplifying, factoring, derivatives, integrals, limits and checking algebra. Examples: "Solve(x^2-5x+6=0)", "Factor(x^3-1)", "Integral(sin(x)^2,x)", "Limit((1+1/n)^n,n,infinity)".',
        input_schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false },
    },
    {
        name: 'look',
        description: 'Take a screenshot of the graphics view so you can see the drawing as the user sees it. Use after drawing something non-trivial to check the result looks right.',
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
];
const EDIT_TOOLS = [
    {
        name: 'run_commands',
        description: 'Run GeoGebra input-bar commands in order, exactly as a user would type them into the Input bar (English command names). Each returns the labels it created, or an error. Examples: "f(x)=x^2-4", "A=(1,2)", "Circle(A,3)", "Tangent(A,f)", "Intersect(f,g)", "a=Slider(-5,5,0.1)", "SetColor(f,\\"#1565C0\\")", "ZoomIn(-10,-6,10,6)". Prefer named objects so later steps can refer to them.',
        input_schema: {
            type: 'object',
            properties: { commands: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 60 } },
            required: ['commands'],
            additionalProperties: false,
        },
    },
    {
        name: 'style_object',
        description: 'Change how an object looks. Every field is optional.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                color: { type: 'string', description: 'Hex colour like "#E53935"' },
                thickness: { type: 'integer', minimum: 1, maximum: 13 },
                line_style: { type: 'integer', minimum: 0, maximum: 4, description: '0 full, 1 dashed long, 2 dashed short, 3 dotted, 4 dash-dot' },
                point_size: { type: 'integer', minimum: 1, maximum: 9 },
                filling: { type: 'number', minimum: 0, maximum: 1 },
                visible: { type: 'boolean' },
                label_visible: { type: 'boolean' },
                caption: { type: 'string' },
                fixed: { type: 'boolean' },
            },
            required: ['name'],
            additionalProperties: false,
        },
    },
    {
        name: 'delete_objects',
        description: 'Delete objects by name (dependent objects are deleted too).',
        input_schema: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' }, minItems: 1 } }, required: ['names'], additionalProperties: false },
    },
    {
        name: 'set_view',
        description: 'Set the visible area of the graphics view.',
        input_schema: {
            type: 'object',
            properties: { xmin: { type: 'number' }, xmax: { type: 'number' }, ymin: { type: 'number' }, ymax: { type: 'number' } },
            required: ['xmin', 'xmax', 'ymin', 'ymax'],
            additionalProperties: false,
        },
    },
];

function validateInput(tool, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
    const schema = tool.input_schema;
    for (const req of schema.required || []) {
        if (!(req in input)) return `missing field "${req}"`;
    }
    for (const [k, v] of Object.entries(input)) {
        const spec = schema.properties[k];
        if (!spec) return `unknown field "${k}"`;
        if (spec.type === 'string' && typeof v !== 'string') return `"${k}" must be a string`;
        if ((spec.type === 'number' || spec.type === 'integer') && typeof v !== 'number') return `"${k}" must be a number`;
        if (spec.type === 'boolean' && typeof v !== 'boolean') return `"${k}" must be true or false`;
        if (spec.type === 'array' && (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))) return `"${k}" must be an array of strings`;
    }
    return null;
}

const SYSTEM_PROMPT = `You are a mathematics assistant built into GeoGebra Classic 6 on the user's Mac. You can see and change their live construction through tools.

How to work:
- The user's message may start with a <context> block describing what they right-clicked and the current construction. Use it; call get_construction when you need more.
- When asked to draw, build or fix something, do it with run_commands / style_object / delete_objects, then briefly say what you made (name the objects). Use clear colours, sensible names and a view that frames the result (set_view). For anything non-trivial, call look once at the end to check it.
- When asked to explain or solve, be correct first: verify algebra and numbers with the cas tool instead of computing in your head. Show the key steps a student needs, not every keystroke.
- GeoGebra commands are English input-bar syntax. Use * for multiplication when ambiguous, and quote colours as strings: SetColor(f,"#1E88E5").
- Never delete or overwrite objects the user did not ask you to change. If a command fails, read the error and try a corrected form once or twice, then tell the user.
- If edits are disabled you only have read tools: explain what the user could type instead.

Language: answer in the language the user writes in (Norwegian Bokmål if they write Norwegian).

Style for replies: short, friendly, plain language. Use Markdown: **bold** for key results, \`code\` for GeoGebra commands, and LaTeX between $...$ (inline) or $$...$$ (display) for formulas. Do not use em dashes.`;

// ---------- per-window agent state ----------
const sessions = new Map(); // webContents.id -> { messages, abort, running }

function session(wc) {
    let s = sessions.get(wc.id);
    if (!s) {
        s = { messages: [], abort: null, running: false };
        sessions.set(wc.id, s);
        wc.once('destroyed', () => sessions.delete(wc.id));
    }
    return s;
}

function send(wc, runId, type, data) {
    if (!wc.isDestroyed()) wc.send('geosmart:event', Object.assign({ runId, type }, data || {}));
}

async function runToolInRenderer(wc, name, input) {
    const code = `window.GeoSmart ? window.GeoSmart.runTool(${JSON.stringify(name)}, ${JSON.stringify(input)}) : {ok:false,error:"AI layer not loaded"}`;
    try {
        return await wc.executeJavaScript(code, true);
    } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
    }
}

function friendlyError(Anthropic, e) {
    if (e instanceof Anthropic.AuthenticationError) return 'Your Claude API key was rejected. Open AI Settings (⌘,) and paste a valid key.';
    if (e instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.';
    if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the Claude API. Wait a moment and try again.';
    if (e instanceof Anthropic.BadRequestError) return 'The Claude API rejected the request: ' + (e.message || 'bad request');
    if (e instanceof Anthropic.InternalServerError) return 'The Claude API had a server error. Try again.';
    if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your internet connection.';
    if (e instanceof Anthropic.APIError) return 'Claude API error: ' + (e.message || e.status);
    return String(e && e.message || e);
}

async function runAgent(wc, runId, userText, context) {
    const s = session(wc);
    if (s.running) { send(wc, runId, 'error', { message: 'The AI is already working on something. Stop it first.' }); return; }
    const key = await getKey();
    if (!key) { send(wc, runId, 'needs-key', {}); return; }

    const settings = getSettings();
    const model = MODELS[settings.model].id;
    const tools = settings.allowEdits ? READ_TOOLS.concat(EDIT_TOOLS) : READ_TOOLS.slice();
    tools[tools.length - 1] = Object.assign({}, tools[tools.length - 1], { cache_control: { type: 'ephemeral' } });

    const { Anthropic, client } = makeClient(key);
    const controller = new AbortController();
    s.abort = controller;
    s.running = true;

    const content = [];
    if (context) content.push({ type: 'text', text: `<context>\n${context}\n</context>` });
    content.push({ type: 'text', text: userText });
    const startLen = s.messages.length;
    s.messages.push({ role: 'user', content });

    send(wc, runId, 'start', { model: MODELS[settings.model].label, effort: settings.effort });
    let edited = false;
    const usage = { input: 0, output: 0, cacheRead: 0 };
    try {
        await runToolInRenderer(wc, '__begin', {});
        for (let step = 0; step < MAX_STEPS; step++) {
            const stream = client.beta.messages.stream({
                model,
                max_tokens: 32000,
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
                thinking: { type: 'adaptive', display: settings.showThinking ? 'summarized' : 'omitted' },
                output_config: { effort: settings.effort },
                system: [{ type: 'text', text: SYSTEM_PROMPT }],
                tools,
                messages: s.messages,
            }, { signal: controller.signal });

            stream.on('streamEvent', (ev) => {
                if (ev.type === 'content_block_start') {
                    const b = ev.content_block;
                    if (b.type === 'thinking') send(wc, runId, 'thinking-start', {});
                    else if (b.type === 'text') send(wc, runId, 'text-start', {});
                    else if (b.type === 'tool_use') send(wc, runId, 'tool-pending', { id: b.id, name: b.name });
                } else if (ev.type === 'content_block_delta') {
                    const d = ev.delta;
                    if (d.type === 'text_delta') send(wc, runId, 'text', { text: d.text });
                    else if (d.type === 'thinking_delta' && d.thinking) send(wc, runId, 'thinking', { text: d.thinking });
                }
            });

            const message = await stream.finalMessage();
            if (message.usage) {
                usage.input += message.usage.input_tokens || 0;
                usage.output += message.usage.output_tokens || 0;
                usage.cacheRead += message.usage.cache_read_input_tokens || 0;
            }

            if (message.stop_reason === 'refusal') {
                s.messages.push({ role: 'assistant', content: message.content });
                send(wc, runId, 'notice', { message: 'Claude declined this request.' });
                break;
            }
            if (message.stop_reason === 'pause_turn') {
                s.messages.push({ role: 'assistant', content: message.content });
                continue;
            }
            const toolUses = message.content.filter((b) => b.type === 'tool_use');
            s.messages.push({ role: 'assistant', content: message.content });
            if (toolUses.length === 0) break;
            if (message.stop_reason === 'max_tokens') {
                // Never run a tool whose input may be cut off.
                s.messages.push({ role: 'user', content: toolUses.map((t) => ({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Output was cut off (max_tokens). Retry with a shorter step.' })) });
                continue;
            }

            const results = [];
            for (const t of toolUses) {
                const def = tools.find((x) => x.name === t.name);
                const problem = def ? validateInput(def, t.input) : `unknown tool "${t.name}"`;
                send(wc, runId, 'tool-start', { id: t.id, name: t.name, input: t.input });
                if (problem) {
                    results.push({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Invalid input: ' + problem });
                    send(wc, runId, 'tool-end', { id: t.id, ok: false, summary: problem });
                    continue;
                }
                const r = await runToolInRenderer(wc, t.name, t.input);
                if (r && r.edited) edited = true;
                if (r && r.image) {
                    results.push({ type: 'tool_result', tool_use_id: t.id, content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: r.image } },
                        { type: 'text', text: r.result || 'Screenshot of the graphics view.' },
                    ] });
                } else {
                    const body = r && r.ok ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result)) : ('Error: ' + (r && r.error || 'failed'));
                    results.push({ type: 'tool_result', tool_use_id: t.id, content: body.slice(0, 60000), is_error: !(r && r.ok) || undefined });
                }
                send(wc, runId, 'tool-end', { id: t.id, ok: !!(r && r.ok), partial: !!(r && r.partial), summary: r && (r.summary != null ? r.summary : r.error) || '' });
            }
            s.messages.push({ role: 'user', content: results });
        }
        send(wc, runId, 'done', { usage, edited });
    } catch (e) {
        const aborted = controller.signal.aborted;
        // Roll the whole turn back so the history stays well formed (every
        // tool_use answered). The next turn's <context> block shows the canvas.
        s.messages.length = startLen;
        if (aborted) send(wc, runId, 'stopped', { edited });
        else send(wc, runId, 'error', { message: friendlyError(Anthropic, e), edited });
    } finally {
        s.running = false;
        s.abort = null;
        await runToolInRenderer(wc, '__end', { edited });
    }
}

// ---------- IPC ----------
let wired = false;
function wireIpc() {
    if (wired) return;
    wired = true;
    ipcMain.handle('geosmart:getSettings', async () => {
        const key = await getKey();
        return Object.assign(getSettings(), {
            hasKey: !!key,
            keyHint: key ? '…' + key.slice(-4) : '',
            models: Object.fromEntries(Object.entries(MODELS).map(([k, v]) => [k, v.label])),
            efforts: EFFORTS,
            version: app.getVersion(),
        });
    });
    ipcMain.handle('geosmart:setSettings', (_e, partial) => setSettings(partial));
    ipcMain.handle('geosmart:setKey', async (_e, key) => {
        key = String(key || '').trim();
        await keychainWrite(key);
        cachedKey = key;
        return { ok: true, keyHint: '…' + key.slice(-4) };
    });
    ipcMain.handle('geosmart:clearKey', async () => { await keychainDelete(); cachedKey = null; return { ok: true }; });
    ipcMain.handle('geosmart:testKey', async (_e, candidate) => {
        const key = String(candidate || '').trim() || await getKey();
        if (!key) return { ok: false, message: 'No key saved yet.' };
        const { Anthropic, client } = makeClient(key);
        try {
            const m = await client.models.retrieve(MODELS[getSettings().model].id);
            return { ok: true, message: 'Connected. ' + (m.display_name || m.id) + ' is ready.' };
        } catch (e) {
            return { ok: false, message: friendlyError(Anthropic, e) };
        }
    });
    ipcMain.handle('geosmart:ask', (e, payload) => {
        const runId = String(Date.now()) + Math.random().toString(36).slice(2, 7);
        runAgent(e.sender, runId, String(payload && payload.text || ''), payload && payload.context ? String(payload.context) : '');
        return runId;
    });
    ipcMain.handle('geosmart:stop', (e) => { const s = session(e.sender); if (s.abort) s.abort.abort(); return true; });
    ipcMain.handle('geosmart:newChat', (e) => { const s = session(e.sender); if (s.abort) s.abort.abort(); s.messages = []; return true; });
    ipcMain.handle('geosmart:openExternal', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
    if (headless && process.env.GEOSMART_SHOT_DIR) {
        ipcMain.handle('geosmart:shot', async (e, name) => {
            const win = BrowserWindow.fromWebContents(e.sender);
            const img = await win.webContents.capturePage(undefined, { stayHidden: true });
            const file = path.join(process.env.GEOSMART_SHOT_DIR, String(name).replace(/[^a-z0-9_-]/gi, '_') + '.png');
            fs.writeFileSync(file, img.toPNG());
            return file;
        });
        ipcMain.handle('geosmart:quit', () => setTimeout(() => app.exit(0), 50));
    }
}

function attach(win) {
    wireIpc();
    if (headless) {
        if (app.dock) app.dock.hide();
        win.webContents.setBackgroundThrottling(false);
    }
}

function menuSend(action) {
    return () => {
        const w = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (w) w.webContents.send('geosmart:menu', action);
    };
}

// GeoGebra's own two menus, unchanged, plus a small "AI" menu.
function buildMenu() {
    return Menu.buildFromTemplate([
        { label: 'GeoGebra', submenu: [
            { label: 'AI Settings…', accelerator: 'CmdOrCtrl+,', click: menuSend('settings') },
            { type: 'separator' },
            { role: 'quit' },
        ] },
        { label: 'Edit', submenu: [{ role: 'copy' }, { role: 'cut' }, { role: 'paste' }] },
        {
            label: 'AI',
            submenu: [
                { label: 'Ask AI…', accelerator: 'CmdOrCtrl+K', click: menuSend('ask') },
                { label: 'Show or Hide AI Panel', accelerator: 'CmdOrCtrl+J', click: menuSend('toggle') },
                { label: 'New Chat', accelerator: 'Shift+CmdOrCtrl+K', click: menuSend('new') },
                { type: 'separator' },
                { label: 'Explain My Construction', click: menuSend('explain-all') },
                { label: 'Check My Work', click: menuSend('check') },
                { type: 'separator' },
                { label: 'Stop', accelerator: 'CmdOrCtrl+.', click: menuSend('stop') },
                { type: 'separator' },
                { label: 'AI Settings…', click: menuSend('settings') },
            ],
        },
    ]);
}

module.exports = { headless, attach, buildMenu };
