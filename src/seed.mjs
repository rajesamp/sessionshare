import { readFileSync } from 'node:fs';
import { sourceDocument } from './router.mjs';
import { referenceSet } from './evaluation.mjs';

export function seedWorkspace(store) {
  const existing = store.list();
  if (existing.length) return existing[0];
  const evidence = readFileSync(new URL('../RESEARCH_EVIDENCE.md', import.meta.url), 'utf8');
  const records = [...evidence.matchAll(/^### (E\d\d) — (.+)\n([\s\S]*?)(?=^### E\d|^## Proposed decisions)/gm)];
  const sources = records.map((m, i) => sourceDocument({ id: m[1], title: `${m[1]} · ${m[2]}`, content: m[3].trim(), owner: i % 2 }));
  if (sources.length !== 5) throw new Error('Expected five E01–E05 records in RESEARCH_EVIDENCE.md');
  const candidates = referenceSet({ name: 'SessionStack reference checks v1', cases: [
    { label: 'Distinguishes native context from aggregate capacity', contains: ['context'], sourceIds: ['E03'] },
    { label: 'Includes durable shared knowledge', contains: ['memory'], sourceIds: ['E04'] },
    { label: 'Does not claim zero latency', excludes: ['guaranteed zero latency'] }
  ] });
  return store.create({ title: 'SessionStack architecture', goal: 'Recommend how CommonShense should coordinate separate AI sessions toward one goal, distribute context, and preserve trustworthy evidence.',
    constraints: 'Keep individual context limits explicit. Retain original sources. Show uncertainty, cost, and unresolved disagreements.',
    sources, runs: [], checkpoints: [], referenceSets: [candidates], comparisons: [], latestRunId: null });
}
