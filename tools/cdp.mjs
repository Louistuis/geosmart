// node tools/cdp.mjs <port> <js expression | @file.js | click:x,y[,button] | move:x,y>   evaluates in the GeoSmart page (awaits promises)
setTimeout(() => { console.log("CDP TIMEOUT"); process.exit(2); }, 15000).unref?.();
import fs from 'fs';
const [port, exprArg] = process.argv.slice(2);
const expr = exprArg.startsWith('@') ? fs.readFileSync(exprArg.slice(1), 'utf8') : exprArg;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const t = targets.find(x => x.type === 'page' && /html\//.test(x.url)) || targets.find(x => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const call = (method, params) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
if (exprArg.startsWith('click:')) { // click:x,y,button
  const [x, y, button] = exprArg.slice(6).split(','); const b = button || 'left';
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: +x, y: +y, button: type === 'mouseMoved' ? 'none' : b, buttons: type === 'mousePressed' ? (b === 'right' ? 2 : 1) : 0, clickCount: 1 });
  console.log('clicked'); ws.close(); process.exit(0);
}
if (exprArg.startsWith('move:')) { // move:x,y (park the pointer, e.g. to clear a tooltip)
  const [x, y] = exprArg.slice(5).split(',');
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: +x, y: +y, button: 'none', buttons: 0 });
  console.log('moved'); ws.close(); process.exit(0);
}
const res = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (res.result.exceptionDetails) console.log('EXC', JSON.stringify(res.result.exceptionDetails).slice(0, 2000));
else console.log(typeof res.result.result.value === 'string' ? res.result.result.value : JSON.stringify(res.result.result.value, null, 1));
ws.close();
