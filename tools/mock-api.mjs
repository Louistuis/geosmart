// Minimal mock of the Anthropic Messages API (SSE) for offline tests.
// Turn 1: thinking + text + run_commands tool call. Turn 2 (after tool_result): look. Turn 3: final text.
import http from 'http';
import fs from 'fs';
const PORT = +process.argv[2] || 8787;
const LOG = process.argv[3] || '/dev/null';
const DEMO = process.argv[4] === 'demo';

function sse(res, events) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    res.end();
}
const msgStart = (model) => ({ type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
const textBlock = (i, text) => [
    { type: 'content_block_start', index: i, content_block: { type: 'text', text: '' } },
    ...text.match(/.{1,12}/gs).map((t) => ({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: i },
];
const toolBlock = (i, id, name, input) => [
    { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id, name, input: {} } },
    { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } },
    { type: 'content_block_stop', index: i },
];
const end = (reason, out) => [{ type: 'message_delta', delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: out } }, { type: 'message_stop' }];

http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
        if (req.method === 'GET' && req.url.startsWith('/v1/models/')) {
            const id = decodeURIComponent(req.url.split('/').pop().split('?')[0]);
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ id, display_name: id === 'claude-opus-5-5' ? 'Claude Opus 5.5' : 'Claude Sonnet 5.5', type: 'model', created_at: '2026-01-01T00:00:00Z' }));
        }
        if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) { res.writeHead(404); return res.end(); }
        const j = JSON.parse(body);
        fs.appendFileSync(LOG, JSON.stringify({ url: req.url, beta: req.headers['anthropic-beta'], key: req.headers['x-api-key'], model: j.model, effort: j.output_config, thinking: j.thinking, fallbacks: j.fallbacks, tools: j.tools.map((t) => t.name), nmsg: j.messages.length, last: j.messages[j.messages.length - 1] }).slice(0, 4000) + '\n');
        const last = j.messages[j.messages.length - 1];
        const results = Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result') : [];
        const turn = j.messages.filter((m) => m.role === 'assistant').length; // assistants so far in this conversation
        const evs = [msgStart(j.model)];
        if (DEMO) {
            if (results.length === 0) {
                evs.push({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
                    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Find f\'(x), solve f\'(x)=0, classify with f\'\'(x), then mark the points.' } },
                    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
                    { type: 'content_block_stop', index: 0 });
                evs.push(...toolBlock(1, 'toolu_d1', 'cas', { expression: "Solve(Derivative(x^3-3x)=0)" }));
                evs.push(...toolBlock(2, 'toolu_d2', 'run_commands', { commands: ['Max=Extremum(f,-2,0)', 'Min=Extremum(f,0,2)', 'R=Root(f)', 'SetColor(Max,"#E53935")', 'SetColor(Min,"#1E88E5")'] }));
                evs.push(...end('tool_use', 90));
            } else if (results[0].tool_use_id === 'toolu_d1') {
                evs.push(...toolBlock(0, 'toolu_d3', 'look', {}));
                evs.push(...end('tool_use', 20));
            } else {
                evs.push(...textBlock(0, "Here is the shape of $f(x) = x^3 - 3x$:\n\n**Turning points.** $f'(x) = 3x^2 - 3 = 0$ gives $x = \\pm 1$.\n\n- Local maximum at $(-1, 2)$, marked **Max** in red\n- Local minimum at $(1, -2)$, marked **Min** in blue\n\n**Zeros.** $x(x^2-3)=0$, so $x = 0$ and $x = \\pm\\sqrt{3} \\approx \\pm 1.73$.\n\n$$f''(x) = 6x \\quad\\Rightarrow\\quad f''(-1) < 0,\\; f''(1) > 0$$\n\nThe graph is symmetric about the origin, because $f(-x) = -f(x)$."));
                evs.push(...end('end_turn', 160));
            }
            return sse(res, evs);
        }
        if (results.length === 0) {
            evs.push({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'The user wants a line; I will define g and check it.' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
                { type: 'content_block_stop', index: 0 });
            evs.push(...textBlock(1, 'Sure, drawing it now.'));
            evs.push(...toolBlock(2, 'toolu_1', 'run_commands', { commands: ['g(x)=2x+1', 'Bad(1,2', 'P=Intersect(f,g)'] }));
            evs.push(...end('tool_use', 60));
        } else if (results[0].tool_use_id === 'toolu_1') {
            evs.push(...toolBlock(0, 'toolu_2', 'cas', { expression: 'Solve(x^2-2=2x+1)' }));
            evs.push(...toolBlock(1, 'toolu_3', 'look', {}));
            evs.push(...end('tool_use', 30));
        } else {
            evs.push(...textBlock(0, 'Done. I drew **g** with $g(x)=2x+1$ and marked the intersections $P$:\n\n$$x^2-2=2x+1 \\iff x = 1\\pm\\sqrt{4}$$\n\n- `g(x)=2x+1`\n- `Intersect(f,g)`'));
            evs.push(...end('end_turn', 80));
        }
        sse(res, evs);
    });
}).listen(PORT, '127.0.0.1', () => console.log('mock on', PORT));
