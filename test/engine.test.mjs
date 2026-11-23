import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Store, uid } from '../src/store.mjs';
import { seedWorkspace } from '../src/seed.mjs';
import { Engine } from '../src/engine.mjs';
import { DemoProvider } from '../src/providers.mjs';

function fixture(provider = new DemoProvider({ delayMs: 0 })) { const store = new Store(); const state = seedWorkspace(store); return { store, state, engine: new Engine(store, { demo: provider }) }; }
async function until(predicate) { for (let n = 0; n < 200; n++) { if (predicate()) return; await delay(5); } assert.fail('Expected state was not reached'); }

test('two independent contexts exchange originals, preserve dissent, and exclude reference keys', async () => {
  const { store, state, engine } = fixture();
  store.update(state.id, 0, uid(), 'test.reference', s => { s.referenceSets[0].cases[0].contains = ['PRIVATE_HELDOUT_ANSWER_71']; });
  const commandId = uid(); const { runId } = engine.start(state.id, 1, commandId);
  assert.equal(engine.start(state.id, 1, commandId).runId, runId);
  await engine.wait(runId); const run = engine.getRun(state.id, runId);
  assert.equal(run.status, 'completed', run.error?.message); assert.equal(store.get(state.id).runs.length, 1);
  assert.equal(run.lanes.length, 2); assert.notEqual(run.lanes[0].id, run.lanes[1].id);
  const inputs = run.lanes.map(l => JSON.parse(l.requests[0].input));
  assert.ok(inputs.every(i => i.board.length === 0 && i.prior.length === 0));
  assert.ok(inputs[0].passages.every(p => !inputs[1].passages.some(q => q.id === p.id)));
  const all = [...run.lanes.flatMap(l => l.requests), ...run.synthesisRequests];
  assert.equal(all.length, 5); assert.ok(all.every(r => !r.input.includes('PRIVATE_HELDOUT_ANSWER_71')));
  for (const lane of run.lanes) {
    const review = JSON.parse(lane.requests[1].input); assert.ok(review.board.length >= 2); assert.equal(review.prior.length, 1);
    assert.ok(review.passages.some(p => p.owner !== lane.index));
  }
  const transfers = run.messages.filter(m => m.kind === 'evidence'); assert.ok(transfers.length >= 2);
  for (const message of transfers) { assert.ok(message.processedBy[message.to].at >= message.deliveredAt); assert.ok(message.passages.length); }
  assert.ok(run.result.unresolved.length); const allowed = new Set(run.synthesisRequests[0].passageIds);
  assert.ok(run.result.claims.every(c => c.citations.every(id => allowed.has(id))));
  assert.equal(run.usage.reservedTokens, 0); assert.equal(run.usage.unknownCalls, 0); assert.ok(run.usage.inputTokens + run.usage.outputTokens <= run.config.totalBudget); store.close();
});

test('single and overlap controls retain their expected context strategy', async () => {
  for (const condition of ['single', 'overlap']) {
    const { store, state, engine } = fixture(); const { runId } = engine.start(state.id, 0, uid(), { condition }); await engine.wait(runId);
    const run = engine.getRun(state.id, runId); assert.equal(run.status, 'completed', run.error?.message);
    assert.equal(run.lanes.length, condition === 'single' ? 1 : 2);
    if (condition === 'overlap') assert.deepEqual(run.lanes[0].requests[0].passageIds, run.lanes[1].requests[0].passageIds);
    store.close();
  }
});

test('four sessions complete without copying a peer exploration transcript', async () => {
  const { store, state, engine } = fixture(); const { runId } = engine.start(state.id, 0, uid(), { laneCount: 4, totalBudget: 160000 }); await engine.wait(runId);
  const run = engine.getRun(state.id, runId); assert.equal(run.status, 'completed', run.error?.message); assert.equal(run.lanes.length, 4);
  assert.ok(run.lanes.every(l => JSON.parse(l.requests[0].input).board.length === 0)); store.close();
});

test('concurrent reservations prevent dispatch past the total budget', async () => {
  class Costly extends DemoProvider { async count() { return { tokens: 3000, measured: false }; } }
  const { store, state, engine } = fixture(new Costly({ delayMs: 0 }));
  const { runId } = engine.start(state.id, 0, uid(), { totalBudget: 6000, outputBudget: 1000 }); await engine.wait(runId);
  const run = engine.getRun(state.id, runId); assert.equal(run.status, 'failed'); assert.equal(run.error.code, 'total_budget');
  assert.equal(run.lanes.flatMap(l => l.requests).length, 1); assert.ok(run.usage.inputTokens + run.usage.outputTokens <= 6000); assert.equal(run.result, null); store.close();
});

test('oversized counted input fails before generation', async () => {
  class Oversized extends DemoProvider { async count() { return { tokens: 50000, measured: true }; } async generate() { assert.fail('Must not dispatch'); } }
  const { store, state, engine } = fixture(new Oversized()); const { runId } = engine.start(state.id, 0, uid()); await engine.wait(runId);
  const run = engine.getRun(state.id, runId); assert.equal(run.error.code, 'context_budget'); assert.equal(run.usage.inputTokens, 0); store.close();
});

test('cancellation stops result acceptance and retains unknown in-flight reservations', async () => {
  const { store, state, engine } = fixture(new DemoProvider({ delayMs: 5000 })); const { runId } = engine.start(state.id, 0, uid());
  await until(() => engine.getRun(state.id, runId).lanes.every(l => l.requests.length));
  engine.cancel(state.id, runId, store.get(state.id).revision, uid()); await engine.wait(runId);
  const run = engine.getRun(state.id, runId); assert.equal(run.status, 'cancelled'); assert.equal(run.result, null);
  assert.equal(run.usage.reservedTokens, 0); assert.equal(run.usage.unknownCalls, 2); assert.ok(run.usage.uncertainTokens > 0); store.close();
});

test('failed attempts retain known usage and do not synthesize a successful peer alone', async () => {
  class Partial extends DemoProvider {
    async generate(payload, options) {
      if (JSON.parse(payload.input).role === 'Challenger') { const error = new Error('Simulated provider failure'); error.usage = { inputTokens: options.inputCount, outputTokens: 17, cachedTokens: 0 }; throw error; }
      return super.generate(payload, options);
    }
  }
  const { store, state, engine } = fixture(new Partial({ delayMs: 0 })); const { runId } = engine.start(state.id, 0, uid()); await engine.wait(runId);
  const run = engine.getRun(state.id, runId); assert.equal(run.status, 'failed'); assert.equal(run.result, null); assert.ok(run.usage.outputTokens >= 17); assert.equal(run.usage.unknownCalls, 0); store.close();
});

test('time caps abort in-flight work with an explicit budget reason', async () => {
  const { store, state, engine } = fixture(new DemoProvider({ delayMs: 5000 }));
  const { runId } = engine.start(state.id, 0, uid(), { timeBudgetMs: 1000 }); await engine.wait(runId);
  const run = engine.getRun(state.id, runId); assert.equal(run.status, 'failed'); assert.equal(run.error.code, 'time_budget'); assert.equal(run.result, null);
  assert.equal(run.usage.reservedTokens, 0); assert.ok(run.usage.uncertainTokens > 0); store.close();
});

test('interrupted snapshots resume only unfinished stages and keep uncertain usage', async () => {
  class Paused extends DemoProvider {
    async generate(payload, options) { if (JSON.parse(payload.input).stage === 'review') await delay(10000, null, { signal: options.signal }); return super.generate(payload, options); }
  }
  const { store, state, engine } = fixture(new Paused({ delayMs: 0 })); const { runId } = engine.start(state.id, 0, uid());
  await until(() => engine.getRun(state.id, runId).lanes.every(l => l.requests.length === 2));
  const restored = new Store(); restored.create(store.get(state.id)); // Snapshot taken while review calls are in flight.
  engine.cancel(state.id, runId, store.get(state.id).revision, uid()); await engine.wait(runId); store.close();
  const recovered = new Engine(restored, { demo: new DemoProvider({ delayMs: 0 }) }); recovered.recover();
  const interrupted = recovered.getRun(state.id, runId); assert.equal(interrupted.status, 'interrupted'); assert.equal(interrupted.usage.unknownCalls, 2);
  recovered.resume(state.id, runId, restored.get(state.id).revision, uid()); await recovered.wait(runId);
  const run = recovered.getRun(state.id, runId); assert.equal(run.status, 'completed', run.error?.message); assert.equal(run.resumes, 1);
  assert.ok(run.lanes.every(l => l.requests.filter(r => r.stage === 'explore').length === 1)); assert.ok(run.usage.uncertainTokens > 0); restored.close();
});
