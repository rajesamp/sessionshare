import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, uid } from '../src/store.mjs';
import { sourceDocument, passages, selectPassages, retrieve } from '../src/router.mjs';
import { referenceSet, evaluate, compareRuns } from '../src/evaluation.mjs';
import { seedWorkspace } from '../src/seed.mjs';
import { validateOutput } from '../src/providers.mjs';

test('canonical writes reject stale state, replay exact commands, and roll back failures', () => {
  const store = new Store(); const s = seedWorkspace(store); const id = uid();
  store.subscribe(() => { throw new Error('subscriber disconnected'); });
  store.update(s.id, 0, id, 'change', draft => { draft.goal = 'new goal'; }, { goal: 'new goal' });
  assert.equal(store.get(s.id).revision, 1);
  assert.equal(store.update(s.id, 0, id, 'change', () => assert.fail(), { goal: 'new goal' }).duplicate, true);
  assert.throws(() => store.update(s.id, 1, id, 'change', () => {}, { goal: 'different' }), /different content/);
  assert.throws(() => store.update(s.id, 0, uid(), 'change', () => {}), /Workspace changed/);
  assert.throws(() => store.update(s.id, 1, uid(), 'change', draft => { draft.goal = 'bad'; throw new Error('reject'); }), /reject/);
  assert.equal(store.get(s.id).goal, 'new goal'); assert.equal(store.events(s.id).length, 1);
  store.acknowledge(s.id, 1); store.acknowledge(s.id, 1); assert.equal(store.visibility(s.id).length, 1);
  store.close();
});

test('SQLite state and ordered event replay survive closing and reopening', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'commonshense-store-')), 'workspace.sqlite');
  let store = new Store(path); const s = seedWorkspace(store);
  for (let i = 0; i < 3; i++) store.update(s.id, i, uid(), 'checkpoint', draft => { draft.title = `Revision ${i + 1}`; });
  store.close(); store = new Store(path);
  assert.equal(store.get(s.id).title, 'Revision 3'); assert.deepEqual(store.events(s.id, 1).map(e => e.seq), [2, 3]); store.close();
});

test('owned context stays separate, overlapping control matches, retrieval keeps exact originals', () => {
  const sources = [0, 1].map(owner => sourceDocument({ id: `S${owner}`, title: `Evidence ${owner}`, content: `Context evidence ${owner}\n`.repeat(160), owner }));
  const a = selectPassages(sources, { laneIndex: 0, query: 'context evidence', budget: 2500 });
  const b = selectPassages(sources, { laneIndex: 1, query: 'context evidence', budget: 2500 });
  assert.ok(a.selected.length && b.selected.length); assert.ok(a.selected.every(p => !b.selected.some(q => q.id === p.id)));
  const overlap = index => selectPassages(sources, { laneIndex: index, condition: 'overlap', query: 'context evidence', budget: 2500 });
  assert.deepEqual(overlap(0), overlap(1));
  for (const p of passages(sources)) assert.equal(p.text, sources.find(s => s.id === p.sourceId).content.slice(p.start, p.end));
  const held = passages([sources[0]]).map(p => p.id); assert.ok(retrieve(sources, 'Evidence 1', held).every(p => p.sourceId === 'S1'));
  assert.throws(() => sourceDocument({ ...sources[0], id: 'x@forged:p1' }), /Invalid source ID/);
});

test('citation validation removes forged references and never marks claims as true', () => {
  const output = validateOutput({ summary: 'Summary', claims: [{ text: 'Claim', citations: ['allowed', 'forged'] }, { text: 'Unsupported', citations: ['forged'] }], challenges: [], requests: [], candidateCases: [] }, [{ id: 'allowed' }]);
  assert.deepEqual(output.claims[0].citations, ['allowed']); assert.equal(output.claims[0].evidenceState, 'linked');
  assert.equal(output.claims[1].evidenceState, 'unverified'); assert.equal(output.rejectedCitations.length, 2);
  assert.throws(() => validateOutput({ summary: 'Invalid' }, []), /invalid claims/);
});

test('reference replay requires freeze and flags corpus, goal, model and budget changes', () => {
  const set = referenceSet({ name: 'Review', cases: [{ label: 'Required evidence', contains: ['context'], excludes: ['zero latency'], sourceIds: ['S1'] }] });
  const source = sourceDocument({ id: 'S1', title: 'Source', content: 'Context evidence' });
  const run = { id: 'run1', status: 'completed', goal: 'goal', constraints: '', sources: [source], config: { model: 'test', totalBudget: 10000 }, result: { summary: 'Context capacity', claims: [{ text: 'Supported', citations: [`S1@${source.version}:p1`] }] } };
  assert.throws(() => evaluate(run, set), /Freeze/);
  set.status = 'frozen'; set.sourceVersions = [{ id: source.id, version: source.version }];
  assert.equal(evaluate(run, set).passed, 1); assert.equal(compareRuns(run, run, set).comparable, true);
  const changed = structuredClone(run); changed.result.summary = 'Guaranteed zero latency'; changed.config.totalBudget = 20000;
  const comparison = compareRuns(changed, run, set); assert.equal(comparison.comparable, false); assert.equal(comparison.regressions.length, 1);
  changed.sources[0].version = 'different'; assert.equal(evaluate(changed, set).sameReferenceCorpus, false);
  assert.throws(() => evaluate({ ...run, status: 'failed' }, set), /completed/);
});
