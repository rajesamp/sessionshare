import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { Store, uid } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { DemoProvider, OpenAIProvider } from '../src/providers.mjs';
import { createApp } from '../server.mjs';

async function fixture(t) {
  const store = new Store(); const engine = new Engine(store, { demo: new DemoProvider({ delayMs: 0 }), openai: new OpenAIProvider({ apiKey: '' }) });
  const app = createApp({ store, engine }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); t.after(() => app.close());
  const root = `http://127.0.0.1:${app.server.address().port}`; const bootstrap = await (await fetch(`${root}/api/bootstrap`)).json();
  const id = bootstrap.workspaces[0].id; const url = `${root}/api/workspaces/${id}`;
  const post = (data, token = bootstrap.token, extra = {}) => fetch(`${url}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-commonshense-token': token, ...extra }, body: JSON.stringify(data) });
  const cmd = async (action, payload) => { const revision = store.get(id).revision; const res = await post({ action, payload, revision, commandId: uid() }); const data = await res.json(); assert.equal(res.status, 200, JSON.stringify(data)); return data; };
  return { app, root, url, id, store, engine, bootstrap, post, cmd };
}
test('HTTP local access, CSRF, static boundaries and escaped-output contract', async t => {
  const { root, url, post, bootstrap, cmd } = await fixture(t);
  const hostStatus = await new Promise((resolve, reject) => { const req = httpRequest(root, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(hostStatus, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post({}, 'incorrect')).status, 403);
  assert.equal((await post(null)).status, 400);
  assert.equal((await post({}, bootstrap.token, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await fetch(`${root}/src/providers.mjs`)).status, 404);
  const html = await fetch(root); assert.ok(html.headers.get('content-security-policy').includes("script-src 'self'"));
  const js = await (await fetch(`${root}/app.js`)).text(); assert.ok(js.includes('node.textContent = text')); assert.ok(!js.includes('innerHTML'));
  const source = await cmd('source', { title: '<script>untrusted</script>', content: '<img src=x onerror=alert(1)>', id: 'E01', owner: 1 });
  assert.equal(source.workspace.sources.length, 6); assert.notEqual(source.workspace.sources[5].id, 'E01');
  assert.equal(bootstrap.apiKey, undefined);
});
test('HTTP run, held-out reference freeze, checkpoint, compare, export and prompt inspection', async t => {
  const { url, cmd, engine, id } = await fixture(t);
  const initial = await (await fetch(url)).json(); const setId = initial.referenceSets[0].id;
  await cmd('freeze', { setId, reviewer: 'Test reviewer' });
  const first = await cmd('run', { condition: 'single' }); await engine.wait(first.runId);
  const checkpoint = await cmd('checkpoint', { runId: first.runId, label: 'Baseline' });
  const second = await cmd('run', { condition: 'stack' }); await engine.wait(second.runId);
  const compared = await cmd('compare', { runId: second.runId, checkpointId: checkpoint.workspace.checkpoints[0].id, setId });
  assert.equal(compared.workspace.comparisons[0].comparable, true);
  const run = engine.getRun(id, second.runId); assert.equal(run.status, 'completed');
  const publicRun = compared.workspace.runs.find(r => r.id === second.runId); assert.equal(publicRun.lanes[0].requests[0].input, undefined);
  const detail = await (await fetch(`${url}/runs/${run.id}/requests/${run.lanes[0].requests[0].id}`)).json(); assert.ok(detail.input.includes('passages'));
  const exported = await (await fetch(`${url}/export`)).json(); assert.equal(exported.workspace.runs.length, 2); assert.ok(exported.events.length > 10);
});
test('SSE reconnect replays ordered events after its cursor', async t => {
  const { url, cmd, store, id } = await fixture(t);
  await cmd('contract', { goal: 'First goal', constraints: '' }); await cmd('contract', { goal: 'Second goal', constraints: '' });
  const abort = new AbortController(); const response = await fetch(`${url}/events?after=1`, { signal: abort.signal });
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let data = '';
  while (!data.includes('id: 2')) { const chunk = await reader.read(); data += decoder.decode(chunk.value); }
  assert.ok(!data.includes('id: 1')); assert.ok(data.includes('workspace.contract'));
  assert.equal(store.get(id).revision, 2); abort.abort(); await reader.cancel().catch(() => {});
});
