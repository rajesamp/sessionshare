import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store, AppError, uid } from './src/store.mjs';
import { Engine } from './src/engine.mjs';
import { sourceDocument } from './src/router.mjs';
import { referenceSet, compareRuns, evaluate } from './src/evaluation.mjs';
import { seedWorkspace } from './src/seed.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const staticFiles = new Map([['/', ['public/index.html', 'text/html']], ['/app.js', ['public/app.js', 'text/javascript']], ['/styles.css', ['public/styles.css', 'text/css']]]);
export function publicState(state) {
  const result = structuredClone(state);
  for (const run of result.runs) {
    for (const req of [...run.lanes.flatMap(l => l.requests), ...run.synthesisRequests]) delete req.input;
    const rateIn = Number(process.env.INPUT_USD_PER_MILLION); const rateOut = Number(process.env.OUTPUT_USD_PER_MILLION);
    run.estimatedCostUsd = run.config.mode === 'demo' ? 0 : (rateIn > 0 && rateOut > 0 && !run.usage.unknownCalls)
      ? (run.usage.inputTokens * rateIn + run.usage.outputTokens * rateOut) / 1e6 : null;
  }
  return result;
}
function safeText(value, name, max) { if (typeof value !== 'string' || value.length > max) throw new AppError(`${name} must be text of at most ${max} characters`); return value; }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Expected application/json', 415);
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 1500000) throw new AppError('Request body too large', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('Invalid JSON'); }
}

export function createApp({ store = new Store(process.env.COMMONSHENSE_DB || resolve(ROOT, 'data/commonshense.sqlite')), engine } = {}) {
  engine ||= new Engine(store); engine.recover(); seedWorkspace(store);
  const csrfToken = randomBytes(24).toString('hex');
  const streams = new Set();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
    try {
      const port = server.address()?.port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) throw new AppError('Local host required', 403);
      if (req.headers.origin && !hosts.map(h => `http://${h}`).includes(req.headers.origin)) throw new AppError('Cross-origin access denied', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Cross-site access denied', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && staticFiles.has(url.pathname)) {
        const [file, type] = staticFiles.get(url.pathname); res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(readFileSync(resolve(ROOT, file))); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
        json(res, 200, { token: csrfToken, liveAvailable: Boolean(engine.providers.openai.apiKey), defaultModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          workspaces: store.list().map(s => ({ id: s.id, title: s.title })) }); return;
      }
      const match = url.pathname.match(/^\/api\/workspaces\/([a-zA-Z0-9-]+)(?:\/(.*))?$/);
      if (!match) throw new AppError('Not found', 404);
      const [, id, route = ''] = match;
      if (req.method === 'GET' && route === '') { json(res, 200, { ...publicState(store.get(id)), telemetry: store.visibility(id) }); return; }
      if (req.method === 'GET' && route === 'export') {
        res.setHeader('Content-Disposition', 'attachment; filename="commonshense-workspace.json"');
        json(res, 200, { schemaVersion: 1, exportedAt: Date.now(), workspace: store.get(id), events: store.events(id) }); return;
      }
      if (req.method === 'GET' && route === 'events') {
        store.get(id);
        const after = Number(req.headers['last-event-id'] || url.searchParams.get('after') || 0);
        if (!Number.isInteger(after) || after < 0) throw new AppError('Invalid event cursor');
        if (streams.size >= 20) throw new AppError('Too many event streams', 429);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' }); res.write(': connected\n\n'); streams.add(res);
        const send = event => { if (event.workspaceId === id && !res.destroyed) {
          if (res.writableLength > 1000000) { res.destroy(); return; }
          res.write(`id: ${event.seq}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`);
        } };
        // Replay and subscription are synchronous relative to the single canonical writer.
        for (const event of store.events(id, after)) send(event);
        const unsubscribe = store.subscribe(send); const timer = setInterval(() => res.write(': keepalive\n\n'), 15000);
        res.on('close', () => { clearInterval(timer); unsubscribe(); streams.delete(res); }); return;
      }
      const requestMatch = route.match(/^runs\/([^/]+)\/requests\/([^/]+)$/);
      if (req.method === 'GET' && requestMatch) {
        const run = engine.getRun(id, requestMatch[1]);
        const request = [...run.lanes.flatMap(l => l.requests), ...run.synthesisRequests].find(r => r.id === requestMatch[2]);
        if (!request) throw new AppError('Request not found', 404); json(res, 200, request); return;
      }
      if (req.method !== 'POST') throw new AppError('Not found', 404);
      if (req.headers['x-commonshense-token'] !== csrfToken) throw new AppError('Refresh the app to renew its local request token', 403);
      const data = await body(req);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('Expected a JSON object');
      if (route === 'ack') { store.acknowledge(id, data.seq); json(res, 200, { acknowledged: data.seq }); return; }
      if (route !== 'commands') throw new AppError('Not found', 404);
      if (!Number.isInteger(data.revision) || typeof data.commandId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(data.commandId)) throw new AppError('Command ID and current revision required');
      const p = data.payload || {}; let outcome;
      if (typeof p !== 'object' || Array.isArray(p)) throw new AppError('Expected a payload object');
      if (data.action === 'run') outcome = engine.start(id, data.revision, data.commandId, p);
      else if (data.action === 'cancel') engine.cancel(id, p.runId, data.revision, data.commandId);
      else if (data.action === 'resume') engine.resume(id, p.runId, data.revision, data.commandId);
      else {
        store.update(id, data.revision, data.commandId, `workspace.${data.action}`, state => {
          if (state.runs.some(r => r.status === 'running')) throw new AppError('Pause changes until the active run finishes or is cancelled.', 409);
          if (data.action === 'contract') {
            state.goal = safeText(p.goal, 'Goal', 6000); state.constraints = safeText(p.constraints, 'Constraints', 3000);
            if (!state.goal.trim()) throw new AppError('Goal cannot be empty');
          } else if (data.action === 'source') {
            if (state.sources.length >= 20) throw new AppError('Maximum 20 sources for this prototype');
            state.sources.push(sourceDocument({ ...p, id: uid() }));
          } else if (data.action === 'owner') {
            const source = state.sources.find(s => s.id === p.sourceId);
            if (!source || !Number.isInteger(p.owner) || p.owner < -1 || p.owner > 3) throw new AppError('Invalid source assignment');
            source.owner = p.owner;
          } else if (data.action === 'reference') {
            if (state.referenceSets.length >= 30) throw new AppError('Maximum 30 reference sets');
            const set = referenceSet(p);
            if (set.cases.some(c => c.sourceIds.some(sourceId => !state.sources.some(s => s.id === sourceId)))) throw new AppError('Reference includes an unknown source ID');
            state.referenceSets.push(set);
          } else if (data.action === 'freeze') {
            const set = state.referenceSets.find(s => s.id === p.setId);
            if (!set || set.status !== 'candidate') throw new AppError('Select an unfrozen candidate set');
            const reviewer = safeText(p.reviewer, 'Reviewer', 120).trim();
            if (!reviewer) throw new AppError('A reviewer name is required');
            set.status = 'frozen'; set.reviewer = reviewer; set.frozenAt = Date.now();
            set.sourceVersions = state.sources.map(s => ({ id: s.id, version: s.version }));
          } else if (data.action === 'checkpoint') {
            const run = state.runs.find(r => r.id === p.runId);
            if (!run || run.status !== 'completed') throw new AppError('Complete a run before saving a checkpoint');
            const label = safeText(p.label, 'Checkpoint label', 120).trim();
            if (!label) throw new AppError('Checkpoint label required');
            state.checkpoints.push({ id: uid(), runId: run.id, label, createdAt: Date.now() });
          } else if (data.action === 'compare') {
            const run = state.runs.find(r => r.id === p.runId); const checkpoint = state.checkpoints.find(c => c.id === p.checkpointId);
            const baseline = state.runs.find(r => r.id === checkpoint?.runId); const set = state.referenceSets.find(s => s.id === p.setId);
            if (!run || !baseline || !set) throw new AppError('Select a current run, checkpoint, and reference set');
            state.comparisons.push({ id: uid(), ...compareRuns(run, baseline, set) });
          } else if (data.action === 'evaluate') {
            const run = state.runs.find(r => r.id === p.runId); const set = state.referenceSets.find(s => s.id === p.setId);
            if (!run || !set) throw new AppError('Select a run and reference set');
            run.evaluations ||= []; run.evaluations.push(evaluate(run, set));
          } else throw new AppError('Unknown action');
          return { action: data.action };
        }, p);
      }
      json(res, 200, { ...outcome, workspace: publicState(store.get(id)) });
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error. Check the local server.', code: error.code || 'internal_error' });
      if (!error.status) console.error(error.stack);
    }
  });
  return { server, store, engine, async close() {
    for (const job of engine.jobs.values()) job.controller.abort(new AppError('Server shutting down', 503, 'shutdown'));
    await Promise.all([...engine.jobs.values()].map(j => j.promise));
    for (const res of streams) res.end();
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose));
    store.close();
  } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 4317);
  app.server.listen(port, '127.0.0.1', () => console.log(`CommonShense → http://127.0.0.1:${app.server.address().port}`));
  app.server.on('error', error => { console.error(`Server failed: ${error.message}`); process.exitCode = 1; app.store.close(); });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (!closing) { closing = true; await app.close(); process.exit(0); } });
}
