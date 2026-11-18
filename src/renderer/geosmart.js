/* Discreet AI layer inside GeoGebra Classic 6 (renderer side).
 * - Adds a few AI items to GeoGebra's own right-click menus.
 * - Side panel (Cmd+J), quick-ask bar (Cmd+K), settings (Cmd+,).
 * - Executes the agent's tools against window.ggbApplet.
 */
(function () {
    'use strict';
    const host = window.geosmartHost;
    if (!host || window.GeoSmart) return;

    // ---------- small helpers ----------
    const $ = (sel, root) => (root || document).querySelector(sel);
    const h = (tag, attrs, ...kids) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (k === 'class') el.className = v;
            else if (k === 'html') el.innerHTML = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
        }
        for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        return el;
    };
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const api = () => window.ggbApplet;
    const ready = () => !!(api() && api().getXML && api().evalCommandGetLabels);

    const ICON = {
        spark: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5l1.9 5.6a3 3 0 0 0 1.9 1.9l5.7 1.9-5.7 1.9a3 3 0 0 0-1.9 1.9L12 21.5l-1.9-5.8a3 3 0 0 0-1.9-1.9L2.5 11.9l5.7-1.9a3 3 0 0 0 1.9-1.9z" fill="currentColor"/><path d="M19 2l.6 1.7 1.7.6-1.7.6L19 6.6l-.6-1.7-1.7-.6 1.7-.6z" fill="currentColor" opacity=".7"/></svg>',
        send: '<svg viewBox="0 0 24 24"><path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
        close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        warn: '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3.5v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
        explain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6M12 16.8v.1"/></svg>',
        analyse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M5 16l4-6 4 3 6-9"/></svg>',
        draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 6.5l3 3"/></svg>',
    };
    const svgImg = (svg, color) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" style="color:${color}" `));

    // ---------- language ----------
    const LANG = (new URLSearchParams(location.search).get('lang') || navigator.language || 'en').replace('_', '-');
    const NB = /^(nb|nn|no)\b/i.test(LANG);
    const T = NB ? {
        explain: (o) => `Forklar ${o} med KI`, analyse: (o) => `Analyser ${o} med KI`, build: (o) => `Bygg videre fra ${o} med KI`,
        work: (o) => `Bruk ${o} med KI`, draw: 'Tegn her med KI…', ask: 'Spør KI…', placeholder: 'Spør KI…',
        quick: 'Be KI tegne, løse eller forklare…', about: 'Om ',
        pExplain: (o) => `Forklar ${o}: hva det er, hvordan det er definert og hva det viser.`,
        pAnalyse: (o) => `Analyser ${o}: viktige egenskaper (nullpunkter, ekstremalpunkter, skjæringspunkter, asymptoter eller sentrum og radius, det som er relevant). Marker de viktige punktene i grafikkfeltet.`,
        pBuild: (o) => `Foreslå noen nyttige konstruksjoner med utgangspunkt i punktet ${o}, og lag den som passer best med resten av konstruksjonen min.`,
        pWork: (o) => `Bruk ${o} til å finne ut det som er interessant eller nødvendig her, og vis stegene.`,
        pExplainAll: 'Forklar konstruksjonen min steg for steg: hva hvert objekt er og hvordan de henger sammen.',
        pCheck: 'Sjekk konstruksjonen og eventuelle utregninger for feil. Pek ut det som er galt eller mistenkelig og hvordan det kan rettes. Ikke endre noe med mindre det åpenbart er feil.',
    } : {
        explain: (o) => `Explain ${o} with AI`, analyse: (o) => `Analyse ${o} with AI`, build: (o) => `Build from ${o} with AI`,
        work: (o) => `Work with ${o} using AI`, draw: 'Draw here with AI…', ask: 'Ask AI…', placeholder: 'Ask AI…',
        quick: 'Ask AI to draw, solve or explain…', about: 'About ',
        pExplain: (o) => `Explain ${o}: what it is, how it is defined and what it shows.`,
        pAnalyse: (o) => `Analyse ${o}: key features (zeros, extrema, intercepts, asymptotes or centre and radius, as relevant). Mark the important points on the graph.`,
        pBuild: (o) => `Suggest a few useful constructions starting from point ${o} and build the one that fits the rest of my construction best.`,
        pWork: (o) => `Use ${o} to work out anything interesting or required here, showing the steps.`,
        pExplainAll: 'Explain my construction step by step: what each object is and how they relate.',
        pCheck: 'Check my construction and any calculations for mistakes. Point out anything wrong or suspicious and how to fix it. Do not change anything unless it is clearly broken.',
    };

    // ---------- state ----------
    let settings = null;
    let panelOpen = false;
    let currentRun = null; // { runId, el, ... }
    let pendingContext = null; // { label, text } shown as a chip above the composer
    const PANEL_W = 400;

    async function refreshSettings() {
        settings = await host.getSettings();
        renderModelChip();
        return settings;
    }

    // ---------- construction helpers ----------
    function viewBounds() {
        try {
            const v = JSON.parse(api().getViewProperties(1));
            const xmax = v.xMin + v.width * v.invXscale;
            const ymax = v.yMin + v.height * v.invYscale;
            return { xmin: +v.xMin.toFixed(3), xmax: +xmax.toFixed(3), ymin: +v.yMin.toFixed(3), ymax: +ymax.toFixed(3), px: v };
        } catch (e) { return null; }
    }
    function describeObject(n) {
        const g = api();
        const o = { name: n, type: g.getObjectType(n) };
        try { o.value = g.getValueString(n); } catch (e) { /* ignore */ }
        try { const c = g.getCommandString(n, false); if (c) o.command = c; } catch (e) { /* ignore */ }
        try { const d = g.getDefinitionString(n); if (d && d !== o.value) o.definition = d; } catch (e) { /* ignore */ }
        try { if (!g.getVisible(n)) o.hidden = true; } catch (e) { /* ignore */ }
        try { o.color = g.getColor(n); } catch (e) { /* ignore */ }
        return o;
    }
    function constructionSummary(limit) {
        const g = api();
        const names = g.getAllObjectNames();
        const lines = names.slice(0, limit).map((n) => {
            const o = describeObject(n);
            return `- ${o.name} (${o.type}${o.hidden ? ', hidden' : ''}): ${o.value || ''}${o.command ? '   [' + o.command + ']' : ''}`;
        });
        if (names.length > limit) lines.push(`- … and ${names.length - limit} more (call get_construction)`);
        return lines;
    }

    function buildContext(target) {
        const parts = [`GeoGebra interface language: ${LANG}.`];
        try {
            if (target && target.object && api().exists(target.object)) {
                const o = describeObject(target.object);
                parts.push(`The user right-clicked ${o.type} "${o.name}": ${o.value || ''}${o.command ? ' defined by ' + o.command : ''}.`);
            }
            if (target && target.point) parts.push(`Right-click position in graph coordinates: (${target.point.x}, ${target.point.y}).`);
            if (target && target.area === 'graphics' && !target.object) parts.push('The user right-clicked an empty spot in the Graphics view.');
            const vb = viewBounds();
            if (vb) parts.push(`Visible graphics window: x from ${vb.xmin} to ${vb.xmax}, y from ${vb.ymin} to ${vb.ymax}.`);
            const lines = constructionSummary(60);
            parts.push(lines.length ? 'Construction:\n' + lines.join('\n') : 'The construction is empty.');
        } catch (e) {
            parts.push('(Could not read the construction: ' + e.message + ')');
        }
        return parts.join('\n');
    }

    // ---------- tools (called from the main process) ----------
    let casReady = false;
    async function casEval(expr) {
        const g = api();
        const before = new Set(g.getAllObjectNames());
        let out = g.evalCommandCAS(expr);
        for (let i = 0; i < 40 && (out === '?' || out === '') && !casReady; i++) {
            await sleep(150);
            out = g.evalCommandCAS(expr);
        }
        casReady = casReady || (out !== '?' && out !== '');
        // CAS evaluation can leave helper objects (e.g. integration constants) behind.
        for (const n of g.getAllObjectNames()) if (!before.has(n)) g.deleteObject(n);
        return out;
    }
    function hexToRgb(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m) return null;
        const v = parseInt(m[1], 16);
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    const tools = {
        __begin() {
            const g = api();
            try { g.setErrorDialogsActive(false); } catch (e) { /* ignore */ }
            try { g.setUndoPoint(); } catch (e) { /* ignore */ }
            return { ok: true };
        },
        __end({ edited }) {
            const g = api();
            try { g.setErrorDialogsActive(true); } catch (e) { /* ignore */ }
            if (edited) { try { g.setUndoPoint(); } catch (e) { /* ignore */ } }
            return { ok: true };
        },
        get_construction() {
            const g = api();
            const names = g.getAllObjectNames();
            const objects = names.slice(0, 400).map(describeObject);
            const vb = viewBounds();
            return {
                ok: true,
                result: { objects, more: Math.max(0, names.length - 400), view: vb && { xmin: vb.xmin, xmax: vb.xmax, ymin: vb.ymin, ymax: vb.ymax } },
                summary: `${names.length} object${names.length === 1 ? '' : 's'}`,
            };
        },
        inspect_object({ name }) {
            const g = api();
            if (!g.exists(name)) return { ok: false, error: `No object named "${name}". Names: ${g.getAllObjectNames().join(', ')}` };
            const o = describeObject(name);
            try { o.numeric = g.getValue(name); } catch (e) { /* ignore */ }
            if (/point|vector/.test(o.type)) { o.x = g.getXcoord(name); o.y = g.getYcoord(name); }
            try { o.independent = g.isIndependent(name); o.fixed = g.isFixed(name); o.layer = g.getLayer(name); } catch (e) { /* ignore */ }
            try { o.caption = g.getCaption(name, true); } catch (e) { /* ignore */ }
            try { o.xml = g.getXML(name).slice(0, 4000); } catch (e) { /* ignore */ }
            return { ok: true, result: o, summary: `${name}: ${short(o.value || o.type, 60)}` };
        },
        async cas({ expression }) {
            const out = await casEval(expression);
            if (!out || out === '?') return { ok: false, error: 'CAS could not evaluate this (undefined or invalid syntax).', summary: short(expression, 60) + ' → ?' };
            return { ok: true, result: out, summary: short(expression, 40) + ' = ' + short(out, 60) };
        },
        look() {
            const g = api();
            const png = g.getPNGBase64(1, false, 72);
            if (!png) return { ok: false, error: 'Could not capture the graphics view.' };
            return { ok: true, image: png.replace(/^data:image\/png;base64,/, ''), result: 'Screenshot of Graphics view 1.', summary: '' };
        },
        run_commands({ commands }) {
            const g = api();
            const results = [];
            let okCount = 0;
            for (const cmd of commands) {
                let labels = null;
                try { labels = g.evalCommandGetLabels(cmd); } catch (e) { labels = null; }
                if (labels === null || labels === undefined) {
                    results.push({ command: cmd, ok: false, error: 'GeoGebra rejected this command (unknown command name, wrong arguments or syntax error). Check the English command syntax.' });
                } else {
                    okCount++;
                    const made = String(labels).split(',').filter(Boolean);
                    results.push({ command: cmd, ok: true, created: made, values: made.slice(0, 6).map((n) => { try { return g.getValueString(n); } catch (e) { return n; } }) });
                }
            }
            const failed = results.length - okCount;
            return {
                ok: okCount > 0 || commands.length === 0,
                edited: okCount > 0,
                result: results,
                error: okCount === 0 ? JSON.stringify(results) : undefined,
                summary: failed ? `${failed} of ${commands.length} failed: ` + results.filter((r) => !r.ok).map((r) => r.command).join('   ') : commands.join('   '),
                partial: failed > 0,
                commands,
            };
        },
        style_object(input) {
            const g = api();
            const n = input.name;
            if (!g.exists(n)) return { ok: false, error: `No object named "${n}".` };
            const done = [];
            if (input.color) { const c = hexToRgb(input.color); if (!c) return { ok: false, error: 'color must be a hex value like #1E88E5' }; g.setColor(n, c[0], c[1], c[2]); done.push('color'); }
            if (input.thickness != null) { g.setLineThickness(n, input.thickness); done.push('thickness'); }
            if (input.line_style != null) { g.setLineStyle(n, input.line_style); done.push('line style'); }
            if (input.point_size != null) { g.setPointSize(n, input.point_size); done.push('point size'); }
            if (input.filling != null) { g.setFilling(n, input.filling); done.push('filling'); }
            if (input.visible != null) { g.setVisible(n, input.visible); done.push(input.visible ? 'shown' : 'hidden'); }
            if (input.caption != null) { g.setCaption(n, input.caption); g.setLabelStyle(n, 3); g.setLabelVisible(n, true); done.push('caption'); }
            if (input.label_visible != null) { g.setLabelVisible(n, input.label_visible); done.push('label'); }
            if (input.fixed != null) { g.setFixed(n, input.fixed, true); done.push(input.fixed ? 'fixed' : 'unfixed'); }
            return { ok: true, edited: done.length > 0, result: `Updated ${n}: ${done.join(', ') || 'nothing'}`, summary: `Styled ${n}` };
        },
        delete_objects({ names }) {
            const g = api();
            const gone = [], missing = [];
            for (const n of names) { if (g.exists(n)) { g.deleteObject(n); gone.push(n); } else missing.push(n); }
            return { ok: gone.length > 0, edited: gone.length > 0, result: { deleted: gone, missing }, error: gone.length ? undefined : 'None of these exist: ' + missing.join(', '), summary: 'Deleted ' + (gone.join(', ') || 'nothing') };
        },
        set_view({ xmin, xmax, ymin, ymax }) {
            if (!(xmax > xmin && ymax > ymin)) return { ok: false, error: 'xmax must be greater than xmin and ymax greater than ymin' };
            api().evalCommand(`ZoomIn(${xmin},${ymin},${xmax},${ymax})`);
            return { ok: true, edited: true, result: 'View updated.', summary: `View x ${xmin}…${xmax}, y ${ymin}…${ymax}` };
        },
    };

    async function runTool(name, input) {
        if (!ready()) return { ok: false, error: 'GeoGebra is still loading.' };
        const fn = tools[name];
        if (!fn) return { ok: false, error: 'Unknown tool ' + name };
        try {
            const r = await fn(input || {});
            if (r && r.edited) markEdited();
            return r;
        } catch (e) {
            return { ok: false, error: String(e && e.message || e) };
        }
    }

    // ---------- markdown + math ----------
    function renderMath(tex, display) {
        if (window.katex) {
            try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' }); } catch (e) { /* fall through */ }
        }
        return `<code>${esc(tex)}</code>`;
    }
    function inline(s) {
        // s is already HTML-escaped; placeholders protect code and math.
        return s
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
            .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" data-ext="1">$1</a>');
    }
    function markdown(src) {
        const store = [];
        const keep = (html) => `\u0000${store.push(html) - 1}\u0000`;
        let s = String(src);
        s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)(```|$)/g, (_, code) => keep(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`));
        s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => keep(`<div class="gs-math">${renderMath(t.trim(), true)}</div>`));
        s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => keep(`<div class="gs-math">${renderMath(t.trim(), true)}</div>`));
        s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => keep(renderMath(t, false)));
        s = s.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre, t) => pre + keep(renderMath(t, false)));
        s = s.replace(/`([^`\n]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
        s = esc(s);
        const lines = s.split('\n');
        const out = [];
        let list = null, para = [];
        const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = []; } };
        const flushList = () => { if (list) { out.push(`<${list.type}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.type}>`); list = null; } };
        for (const raw of lines) {
            const line = raw.trimEnd();
            let m;
            if (!line.trim()) { flushPara(); flushList(); continue; }
            if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<h${Math.min(6, m[1].length + 3)}>${inline(m[2])}</h${Math.min(6, m[1].length + 3)}>`); continue; }
            if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; } list.items.push(m[1]); continue; }
            if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; } list.items.push(m[1]); continue; }
            if (/^\u0000\d+\u0000$/.test(line.trim())) { flushPara(); flushList(); out.push(line.trim()); continue; }
            flushList();
            para.push(line);
        }
        flushPara(); flushList();
        return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => store[+i]);
    }

    // ---------- UI: launcher, panel, quick bar, settings ----------
    let ui = {};
    function buildUI() {
        ui.modelChip = h('button', { class: 'gs-chip gs-model', title: 'Model and effort', onclick: () => openSettings() });
        ui.thread = h('div', { class: 'gs-thread' });
        ui.empty = h('div', { class: 'gs-empty' },
            h('p', {}, 'Ask about anything in your construction. Right-click an object or the graph for quick AI actions.'),
            h('div', { class: 'gs-suggest' },
                suggestion('Draw f(x) = x^3 - 3x and mark its extrema'),
                suggestion('Explain my construction step by step'),
                suggestion('Make a slider that rotates a triangle'),
                suggestion('Check my work for mistakes')));
        ui.thread.append(ui.empty);

        ui.ctxChip = h('div', { class: 'gs-context hidden' });
        ui.input = h('textarea', { class: 'gs-input', rows: 1, placeholder: T.placeholder, spellcheck: 'false' });
        ui.input.addEventListener('input', autosize);
        ui.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
            e.stopPropagation();
        });
        ['keyup', 'keypress'].forEach((t) => ui.input.addEventListener(t, (e) => e.stopPropagation()));
        ui.sendBtn = h('button', { class: 'gs-send', title: 'Send (Enter)', 'aria-label': 'Send', html: ICON.send, onclick: () => (currentRun ? host.stop() : submit()) });

        ui.panel = h('aside', { class: 'gs-panel', 'aria-label': 'AI assistant' },
            h('header', { class: 'gs-head' },
                h('span', { class: 'gs-title' }, 'AI'),
                ui.modelChip,
                h('div', { class: 'gs-head-actions' },
                    h('button', { class: 'gs-icon-btn', title: 'New chat (⇧⌘K)', html: ICON.plus, onclick: newChat }),
                    h('button', { class: 'gs-icon-btn', title: 'Settings (⌘,)', html: ICON.gear, onclick: () => openSettings() }),
                    h('button', { class: 'gs-icon-btn', title: 'Close (⌘J)', html: ICON.close, onclick: () => togglePanel(false) }))),
            ui.thread,
            h('footer', { class: 'gs-composer' }, ui.ctxChip, h('div', { class: 'gs-input-row' }, ui.input, ui.sendBtn)));

        // quick ask (Cmd+K)
        ui.quickInput = h('input', { class: 'gs-quick-input', placeholder: T.quick, spellcheck: 'false' });
        ui.quickInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && ui.quickInput.value.trim()) { const t = ui.quickInput.value.trim(); closeQuick(); ask(t, pendingContext && pendingContext.target); }
            if (e.key === 'Escape') closeQuick();
        });
        ['keyup', 'keypress'].forEach((t) => ui.quickInput.addEventListener(t, (e) => e.stopPropagation()));
        ui.quickCtx = h('div', { class: 'gs-quick-ctx' });
        ui.quick = h('div', { class: 'gs-quick-wrap hidden', onmousedown: (e) => { if (e.target === ui.quick) closeQuick(); } },
            h('div', { class: 'gs-quick' }, ui.quickInput, ui.quickCtx));

        ui.settings = h('div', { class: 'gs-sheet-wrap hidden', onmousedown: (e) => { if (e.target === ui.settings) closeSettings(); } });

        document.body.append(ui.panel, ui.quick, ui.settings);
    }
    function suggestion(text) {
        return h('button', { class: 'gs-suggestion', onclick: () => ask(text, null) }, text);
    }
    function autosize() {
        ui.input.style.height = 'auto';
        ui.input.style.height = Math.min(160, ui.input.scrollHeight) + 'px';
    }
    function renderModelChip() {
        if (!ui.modelChip || !settings) return;
        const label = settings.models[settings.model] || settings.model;
        const eff = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }[settings.effort] || settings.effort;
        ui.modelChip.innerHTML = `<span>${esc(label)}</span><span class="gs-dot">·</span><span class="gs-muted">${esc(eff)}</span>`;
    }

    // Dock the panel beside GeoGebra instead of covering the drawing.
    function relayout() {
        const g = api();
        const w = window.innerWidth - (panelOpen ? PANEL_W : 0);
        document.body.classList.toggle('gs-docked', panelOpen);
        if (g && g.setSize) { try { g.setSize(Math.max(480, w), window.innerHeight); } catch (e) { /* ignore */ } }
    }
    function togglePanel(force) {
        panelOpen = typeof force === 'boolean' ? force : !panelOpen;
        ui.panel.classList.toggle('open', panelOpen);
        relayout();
        if (panelOpen) setTimeout(() => ui.input.focus(), 180);
    }
    window.addEventListener('resize', () => { if (panelOpen) setTimeout(relayout, 30); });

    function openQuick(target) {
        if (target !== undefined) pendingContext = target ? { target, label: target.label } : null;
        ui.quickCtx.textContent = pendingContext && pendingContext.label ? T.about + pendingContext.label : '';
        ui.quick.classList.remove('hidden');
        ui.quickInput.value = '';
        setTimeout(() => ui.quickInput.focus(), 20);
    }
    function closeQuick() { ui.quick.classList.add('hidden'); }

    function setContextChip(target) {
        pendingContext = target ? { target, label: target.label } : null;
        ui.ctxChip.innerHTML = '';
        if (target && target.label) {
            ui.ctxChip.append(h('span', {}, T.about + target.label), h('button', { class: 'gs-ctx-x', title: 'Remove', html: ICON.close, onclick: () => setContextChip(null) }));
            ui.ctxChip.classList.remove('hidden');
        } else ui.ctxChip.classList.add('hidden');
    }

    function submit() {
        const text = ui.input.value.trim();
        if (!text || currentRun) return;
        ui.input.value = '';
        autosize();
        ask(text, pendingContext && pendingContext.target);
    }

    async function newChat() {
        await host.newChat();
        currentRun = null;
        ui.thread.innerHTML = '';
        ui.thread.append(ui.empty);
        setBusy(false);
        setContextChip(null);
    }

    function setBusy(b) {
        ui.panel.classList.toggle('busy', b);
        ui.sendBtn.innerHTML = b ? ICON.stop : ICON.send;
        ui.sendBtn.title = b ? 'Stop (⌘.)' : 'Send (Enter)';
    }

    // ---------- conversation rendering ----------
    function scrollDown(force) {
        const t = ui.thread;
        if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 140) t.scrollTop = t.scrollHeight;
    }
    async function ask(text, target) {
        if (!ready()) return;
        if (currentRun) return;
        if (!settings) await refreshSettings();
        togglePanel(true);
        if (ui.empty.isConnected) ui.empty.remove();
        const context = buildContext(target);
        const userEl = h('div', { class: 'gs-msg gs-user' }, target && target.label ? h('div', { class: 'gs-about' }, T.about + target.label) : null, h('div', { class: 'gs-bubble' }, text));
        ui.thread.append(userEl);
        const bot = h('div', { class: 'gs-msg gs-bot' });
        const status = h('div', { class: 'gs-status' }, h('span', { class: 'gs-pulse' }), h('span', {}, 'Thinking'));
        bot.append(status);
        ui.thread.append(bot);
        scrollDown(true);
        setContextChip(null);
        setBusy(true);
        currentRun = { runId: null, bot, status, textEl: null, textBuf: '', thinkEl: null, thinkBuf: '', tools: new Map(), queued: [] };
        const runId = await host.ask(text, context);
        if (currentRun) {
            currentRun.runId = runId;
            for (const ev of currentRun.queued) onEvent(ev);
            currentRun.queued = [];
        }
    }

    let renderScheduled = false;
    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;
        requestAnimationFrame(() => {
            renderScheduled = false;
            const r = currentRun;
            if (!r) return;
            if (r.textEl) r.textEl.innerHTML = markdown(r.textBuf);
            if (r.thinkEl) r.thinkEl.querySelector('.gs-think-body').innerHTML = markdown(r.thinkBuf);
            scrollDown();
        });
    }

    const TOOL_LABEL = {
        get_construction: 'Read the construction', inspect_object: 'Inspected', cas: 'CAS', look: 'Looked at the drawing',
        run_commands: 'Ran', style_object: 'Styled', delete_objects: 'Deleted', set_view: 'Moved the view',
    };

    function onEvent(ev) {
        const r = currentRun;
        if (!r) return;
        if (!r.runId) { r.queued.push(ev); return; }
        if (ev.runId !== r.runId) return;
        switch (ev.type) {
            case 'start':
                r.status.lastChild.textContent = `${ev.model} is thinking`;
                break;
            case 'thinking-start':
                if (!r.thinkEl) {
                    r.thinkEl = h('details', { class: 'gs-think' }, h('summary', {}, 'Reasoning'), h('div', { class: 'gs-think-body' }));
                    r.bot.insertBefore(r.thinkEl, r.status);
                }
                break;
            case 'thinking':
                r.thinkBuf += ev.text;
                if (!r.thinkEl) onEvent(Object.assign({}, ev, { type: 'thinking-start' }));
                scheduleRender();
                break;
            case 'text-start':
                if (r.textEl && r.textBuf.trim()) { r.textBuf += '\n\n'; }
                if (!r.textEl) { r.textEl = h('div', { class: 'gs-text' }); r.bot.insertBefore(r.textEl, r.status); }
                else if (r.textEl.nextSibling !== r.status) { // a tool ran in between: start a new text block
                    r.textEl = h('div', { class: 'gs-text' }); r.textBuf = ''; r.bot.insertBefore(r.textEl, r.status);
                }
                r.status.classList.add('hidden');
                break;
            case 'text':
                if (!r.textEl) onEvent({ runId: r.runId, type: 'text-start' });
                r.textBuf += ev.text;
                scheduleRender();
                break;
            case 'tool-pending':
                r.status.classList.remove('hidden');
                r.status.lastChild.textContent = 'Working';
                break;
            case 'tool-start': {
                const el = h('div', { class: 'gs-tool running' }, h('span', { class: 'gs-tool-ic' }), h('span', { class: 'gs-tool-label' }, TOOL_LABEL[ev.name] || ev.name), h('span', { class: 'gs-tool-detail' }, toolDetail(ev.name, ev.input)));
                r.bot.insertBefore(el, r.status);
                r.tools.set(ev.id, el);
                r.status.classList.remove('hidden');
                r.status.lastChild.textContent = 'Working';
                scrollDown();
                break;
            }
            case 'tool-end': {
                const el = r.tools.get(ev.id);
                if (el) {
                    el.classList.remove('running');
                    el.classList.add(ev.ok && !ev.partial ? 'ok' : 'fail');
                    el.querySelector('.gs-tool-ic').innerHTML = ev.ok && !ev.partial ? ICON.check : ICON.warn;
                    if (ev.summary) el.querySelector('.gs-tool-detail').textContent = short(ev.summary, 90);
                }
                r.status.lastChild.textContent = 'Thinking';
                break;
            }
            case 'notice':
                r.bot.insertBefore(h('div', { class: 'gs-note' }, ev.message), r.status);
                break;
            case 'needs-key':
                finishRun();
                r.bot.append(h('div', { class: 'gs-note warn' }, 'Add your Claude API key to start. ', h('button', { class: 'gs-link', onclick: () => openSettings() }, 'Open Settings')));
                openSettings();
                break;
            case 'error':
                finishRun(ev.edited);
                r.bot.append(h('div', { class: 'gs-note warn' }, ev.message, ' ', /key/i.test(ev.message) ? h('button', { class: 'gs-link', onclick: () => openSettings() }, 'Open Settings') : null));
                break;
            case 'stopped':
                finishRun(ev.edited);
                r.bot.append(h('div', { class: 'gs-note' }, 'Stopped.'));
                break;
            case 'done':
                finishRun(ev.edited, ev.usage);
                break;
        }
    }

    function toolDetail(name, input) {
        input = input || {};
        if (name === 'run_commands') return short((input.commands || []).join('   '), 90);
        if (name === 'cas') return short(input.expression || '', 80);
        if (name === 'inspect_object' || name === 'style_object') return input.name || '';
        if (name === 'delete_objects') return (input.names || []).join(', ');
        if (name === 'set_view') return `x ${input.xmin}…${input.xmax}, y ${input.ymin}…${input.ymax}`;
        return '';
    }

    function finishRun(edited, usage) {
        const r = currentRun;
        if (!r) return;
        r.status.remove();
        if (r.textEl) r.textEl.innerHTML = markdown(r.textBuf);
        if (r.thinkEl) r.thinkEl.querySelector('.gs-think-body').innerHTML = markdown(r.thinkBuf || '_No summary._');
        r.bot.querySelectorAll('a[data-ext]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); host.openExternal(a.href); }));
        const foot = h('div', { class: 'gs-msg-foot' });
        if (edited) {
            const undoBtn = h('button', { class: 'gs-pill', html: ICON.undo + '<span>Undo changes</span>', onclick: () => {
                try { api().undo(); } catch (e) { /* ignore */ }
                undoBtn.disabled = true;
                undoBtn.querySelector('span').textContent = 'Undone';
            } });
            foot.append(undoBtn);
        }
        if (usage && (usage.input || usage.output)) foot.append(h('span', { class: 'gs-usage', title: 'Tokens used (input incl. cache reads / output)' }, `${fmtTok(usage.input + usage.cacheRead)} in · ${fmtTok(usage.output)} out`));
        if (foot.childNodes.length) r.bot.append(foot);
        currentRun = null;
        setBusy(false);
        scrollDown();
    }
    function fmtTok(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n); }
    function markEdited() { /* reserved for live indicators */ }

    // ---------- settings sheet ----------
    async function openSettings() {
        await refreshSettings();
        const s = settings;
        const keyInput = h('input', { class: 'gs-field', type: 'password', placeholder: s.hasKey ? `Saved in Keychain (${s.keyHint}). Paste a new key to replace it.` : 'sk-ant-…', autocomplete: 'off', spellcheck: 'false' });
        ['keydown', 'keyup', 'keypress'].forEach((t) => keyInput.addEventListener(t, (e) => { e.stopPropagation(); if (t === 'keydown' && e.key === 'Enter') saveKey(); }));
        const keyStatus = h('div', { class: 'gs-key-status' + (s.hasKey ? ' ok' : '') }, s.hasKey ? `Key saved in your macOS Keychain (${s.keyHint}).` : 'No key yet. The AI uses your own Anthropic API key.');
        async function saveKey() {
            const k = keyInput.value.trim();
            keyStatus.className = 'gs-key-status';
            if (!k) {
                keyStatus.textContent = 'Testing saved key…';
                const t = await host.testKey('');
                keyStatus.textContent = t.message; keyStatus.className = 'gs-key-status ' + (t.ok ? 'ok' : 'bad');
                return;
            }
            keyStatus.textContent = 'Checking key…';
            const t = await host.testKey(k);
            if (!t.ok) { keyStatus.textContent = t.message; keyStatus.className = 'gs-key-status bad'; return; }
            try {
                const r = await host.setKey(k);
                keyInput.value = '';
                keyInput.placeholder = `Saved in Keychain (${r.keyHint}). Paste a new key to replace it.`;
                keyStatus.textContent = t.message + ' Saved to your Keychain.';
                keyStatus.className = 'gs-key-status ok';
                refreshSettings();
            } catch (e) { keyStatus.textContent = String(e.message || e); keyStatus.className = 'gs-key-status bad'; }
        }
        const seg = (name, options, value, onPick) => {
            const wrap = h('div', { class: 'gs-seg', role: 'radiogroup', 'data-name': name });
            for (const o of options) {
                const b = h('button', { class: 'gs-seg-btn' + (o.value === value ? ' on' : ''), role: 'radio', 'aria-checked': String(o.value === value), onclick: () => {
                    wrap.querySelectorAll('.gs-seg-btn').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
                    b.classList.add('on'); b.setAttribute('aria-checked', 'true');
                    onPick(o.value);
                } }, h('span', { class: 'gs-seg-label' }, o.label), o.sub ? h('span', { class: 'gs-seg-sub' }, o.sub) : null);
                wrap.append(b);
            }
            return wrap;
        };
        const effortHelp = {
            low: 'Fastest and cheapest. Good for quick drawings and simple questions.',
            medium: 'Balanced. A good default for most homework and constructions.',
            high: 'Thinks longer. Better for proofs, tricky geometry and multi-step builds.',
            xhigh: 'Extra careful. For hard problems where accuracy matters most.',
            max: 'No limit on effort. Slowest and most expensive.',
        };
        const effortNote = h('div', { class: 'gs-help' }, effortHelp[s.effort]);
        const save = async (partial) => { settings = Object.assign(settings, await host.setSettings(partial)); renderModelChip(); };
        const toggle = (label, sub, key) => {
            const input = h('input', { type: 'checkbox', class: 'gs-switch' });
            input.checked = !!s[key];
            input.addEventListener('change', () => save({ [key]: input.checked }));
            return h('label', { class: 'gs-toggle' }, h('span', {}, h('span', { class: 'gs-toggle-label' }, label), h('span', { class: 'gs-help' }, sub)), input);
        };
        const sheet = h('div', { class: 'gs-sheet', role: 'dialog', 'aria-label': 'AI Settings' },
            h('header', { class: 'gs-sheet-head' }, h('h2', {}, 'AI Settings'), h('button', { class: 'gs-icon-btn', html: ICON.close, title: 'Close', onclick: closeSettings })),
            h('section', {},
                h('h3', {}, 'Claude API key'),
                h('div', { class: 'gs-key-row' }, keyInput, h('button', { class: 'gs-btn primary', onclick: saveKey }, s.hasKey ? 'Test / Save' : 'Save')),
                keyStatus,
                h('div', { class: 'gs-help' }, 'Get a key at ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); host.openExternal('https://console.anthropic.com/settings/keys'); } }, 'console.anthropic.com'), '. It is stored in the macOS Keychain and only sent to Anthropic.'),
                s.hasKey ? h('button', { class: 'gs-link danger', onclick: async () => { await host.clearKey(); closeSettings(); openSettings(); } }, 'Remove saved key') : null),
            h('section', {},
                h('h3', {}, 'Model'),
                seg('model', [{ value: 'sonnet', label: s.models.sonnet, sub: 'Fast and capable' }, { value: 'opus', label: s.models.opus, sub: 'Smartest, best for hard maths' }], s.model, (v) => save({ model: v }))),
            h('section', {},
                h('h3', {}, 'Effort'),
                seg('effort', [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'xhigh', label: 'Extra' }, { value: 'max', label: 'Max' }], s.effort, (v) => { effortNote.textContent = effortHelp[v]; save({ effort: v }); }),
                effortNote),
            h('section', {},
                toggle('Allow the AI to edit the construction', 'Off means it can read, look and explain, but never changes your drawing.', 'allowEdits'),
                toggle('Show reasoning summaries', 'A collapsible summary of how Claude approached the problem.', 'showThinking')));
        ui.settings.innerHTML = '';
        ui.settings.append(sheet);
        ui.settings.classList.remove('hidden');
        if (!s.hasKey) setTimeout(() => keyInput.focus(), 50);
    }
    function closeSettings() { ui.settings.classList.add('hidden'); }

    // ---------- right-click integration ----------
    let lastRight = null;
    function areaAt(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return { area: 'other' };
        const av = el.closest && el.closest('.avItem');
        if (av) return { area: 'algebra', row: av };
        if (el.closest && el.closest('.EuclidianPanel')) return { area: 'graphics' };
        return { area: 'other' };
    }
    function graphPoint(x, y) {
        const vb = viewBounds();
        if (!vb) return null;
        const v = vb.px;
        const frame = $('.GeoGebraFrame.jsloaded') || $('.GeoGebraFrame');
        const fr = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
        const px = x - fr.left - v.left, py = y - fr.top - v.top;
        if (px < 0 || py < 0 || px > v.width || py > v.height) return null;
        const gx = v.xMin + px * v.invXscale;
        const gy = (v.yMin + v.height * v.invYscale) - py * v.invYscale;
        const r = (n) => Math.round(n * 100) / 100;
        return { x: r(gx), y: r(gy) };
    }
    function objectFromText(text) {
        if (!text) return null;
        const names = api().getAllObjectNames().slice().sort((a, b) => b.length - a.length);
        const clean = text.replace(/ /g, ' ').trim();
        for (const n of names) {
            const re = new RegExp('(^|[\\s:(,])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s(=:,′\'])');
            if (re.test(clean)) return n;
        }
        return null;
    }
    function rowObject(row) {
        if (!row) return null;
        // Formulas are drawn on a canvas, so the readable text lives in aria-labels.
        const texts = [row.textContent || ''].concat([...row.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') || ''));
        const names = api().getAllObjectNames().slice().sort((a, b) => b.length - a.length);
        for (const raw of texts) {
            const t = raw.replace(/ /g, ' ').trim();
            if (!t) continue;
            for (const n of names) {
                if (t.startsWith(n + '(') || t.startsWith(n + ' ') || t.startsWith(n + '=') || t.startsWith(n + ':') || t === n) return n;
            }
        }
        return null;
    }

    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest && e.target.closest('.gs-panel, .gs-quick-wrap, .gs-sheet-wrap')) return;
        const a = areaAt(e.clientX, e.clientY);
        lastRight = { t: Date.now(), x: e.clientX, y: e.clientY, area: a.area, row: a.row, point: a.area === 'graphics' ? graphPoint(e.clientX, e.clientY) : null };
    }, true);
    document.addEventListener('pointerdown', (e) => {
        if (e.button !== 2) return;
        if (e.target.closest && e.target.closest('.gs-panel, .gs-quick-wrap, .gs-sheet-wrap')) return;
        const a = areaAt(e.clientX, e.clientY);
        lastRight = { t: Date.now(), x: e.clientX, y: e.clientY, area: a.area, row: a.row, point: a.area === 'graphics' ? graphPoint(e.clientX, e.clientY) : null };
    }, true);

    function closeGgbPopup() {
        const opts = { bubbles: true, cancelable: true, clientX: 1, clientY: 1, button: 0, view: window };
        for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
            const Ctor = t.startsWith('pointer') ? PointerEvent : MouseEvent;
            document.body.dispatchEvent(new Ctor(t, opts));
        }
    }

    function menuItem(icon, label, onPick, extraClass) {
        const li = h('li', { class: 'gwt-MenuItem listMenuItem gs-item ' + (extraClass || ''), role: 'menuitem', tabindex: '0' },
            h('img', { class: 'gwt-Image gs-item-ic', src: svgImg(icon, '#000'), alt: '' }),
            h('span', { class: 'gs-item-label' }, label));
        const fire = (e) => { e.preventDefault(); e.stopPropagation(); closeGgbPopup(); setTimeout(onPick, 30); };
        li.addEventListener('click', fire, true);
        li.addEventListener('mousedown', (e) => e.stopPropagation(), true);
        li.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
        li.addEventListener('mouseup', (e) => e.stopPropagation(), true);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fire(e); });
        return li;
    }

    function decorateMenu(popup) {
        if (popup.__gs || popup.classList.contains('KeyBoard')) return;
        const bar = popup.querySelector('ul.gwt-MenuBar-vertical');
        if (!bar || !lastRight || Date.now() - lastRight.t > 1500) return;
        if (popup.closest('.gs-panel')) return;
        popup.__gs = true;
        const titleEl = bar.querySelector('.menuTitle');
        const title = titleEl ? titleEl.textContent : '';
        let object = objectFromText(title);
        if (!object && lastRight.area === 'algebra') object = rowObject(lastRight.row);
        if (lastRight.area === 'other' && !object) return;
        const target = { area: lastRight.area, point: lastRight.point, object, label: object ? (title && objectFromText(title) ? title.trim() : object) : (lastRight.point ? `the point (${lastRight.point.x}, ${lastRight.point.y})` : null) };
        if (object && target.label.length > 40) target.label = object;

        const items = [];
        if (object) {
            const type = (() => { try { return api().getObjectType(object); } catch (e) { return ''; } })();
            items.push(menuItem(ICON.explain, T.explain(object), () => ask(T.pExplain(object), target)));
            if (/function|curve|conic|parabola|hyperbola|ellipse|circle|polynomial|implicit/.test(type)) {
                items.push(menuItem(ICON.analyse, T.analyse(object), () => ask(T.pAnalyse(object), target)));
            } else if (/point/.test(type)) {
                items.push(menuItem(ICON.analyse, T.build(object), () => ask(T.pBuild(object), target)));
            } else {
                items.push(menuItem(ICON.analyse, T.work(object), () => ask(T.pWork(object), target)));
            }
        } else {
            items.push(menuItem(ICON.draw, T.draw, () => openQuick(target)));
        }
        items.push(menuItem(ICON.spark, T.ask, () => openQuick(target)));

        const sep = h('li', { class: 'menuSeparator neutral-300 gs-sep', role: 'presentation' });
        bar.append(sep, ...items);
        // Keep the popup inside the window after growing it.
        requestAnimationFrame(() => {
            const r = popup.getBoundingClientRect();
            if (r.bottom > window.innerHeight - 8) popup.style.top = Math.max(8, parseFloat(popup.style.top || 0) - (r.bottom - window.innerHeight + 8)) + 'px';
            if (r.right > window.innerWidth - 8) popup.style.left = Math.max(8, parseFloat(popup.style.left || 0) - (r.right - window.innerWidth + 8)) + 'px';
        });
    }

    new MutationObserver((muts) => {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (n.classList.contains('gwt-PopupPanel')) decorateMenu(n);
                else if (n.querySelectorAll) n.querySelectorAll('.gwt-PopupPanel').forEach(decorateMenu);
            }
            if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('gwt-PopupPanel')) decorateMenu(m.target);
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

    // Option-right-click anywhere: straight to GeoSmart's quick bar.
    document.addEventListener('mousedown', (e) => {
        if (e.button === 2 && e.altKey) {
            e.preventDefault(); e.stopPropagation();
            const a = areaAt(e.clientX, e.clientY);
            openQuick({ area: a.area, point: a.area === 'graphics' ? graphPoint(e.clientX, e.clientY) : null, object: null, label: null });
        }
    }, true);

    // ---------- keyboard + menu bar ----------
    document.addEventListener('keydown', (e) => {
        if (!e.metaKey) return;
        if (e.key === 'k' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); openQuick(null); }
        else if (e.key === 'j') { e.preventDefault(); e.stopPropagation(); togglePanel(); }
        else if (e.key === '.') { if (currentRun) { e.preventDefault(); host.stop(); } }
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!ui.quick.classList.contains('hidden')) closeQuick();
            else if (!ui.settings.classList.contains('hidden')) closeSettings();
        }
    }, true);

    host.onMenu((action) => {
        switch (action) {
            case 'settings': openSettings(); break;
            case 'ask': openQuick(null); break;
            case 'toggle': togglePanel(); break;
            case 'new': newChat(); break;
            case 'stop': host.stop(); break;
            case 'explain-all': ask(T.pExplainAll, null); break;
            case 'check': ask(T.pCheck, null); break;
        }
    });
    host.onEvent(onEvent);

    window.GeoSmart = { runTool, ask, openQuick, togglePanel, openSettings, markdown, _test: { decorateMenu, objectFromText, graphPoint, buildContext } };

    // ---------- boot ----------
    (async function boot() {
        buildUI();
        for (let i = 0; i < 600 && !ready(); i++) await sleep(100);
        document.body.classList.add('gs-ready');
        await refreshSettings();
        // Warm up the CAS in the background so the first "cas" tool call is instant.
        setTimeout(() => { try { api().evalCommandCAS('1+1'); } catch (e) { /* ignore */ } }, 1500);
    })();
})();
