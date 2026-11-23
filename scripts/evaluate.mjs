import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, uid, hash } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';
import { DemoProvider } from '../src/providers.mjs';
import { seedWorkspace } from '../src/seed.mjs';
import { evaluate } from '../src/evaluation.mjs';

const args = process.argv.slice(2); const mode = args.includes('--live') ? 'openai' : 'demo';
const repeats = Number(args.find(a => a.startsWith('--repeats='))?.split('=')[1] || 1);
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('Use --repeats=1 through 10');
const referencePath = args.find(a => a.startsWith('--references='))?.slice('--references='.length);
const reference = referencePath ? JSON.parse(readFileSync(referencePath, 'utf8')) : null;
if (reference && (reference.status !== 'frozen' || !reference.reviewer || !reference.version || !reference.sourceVersions)) throw new Error('Use a frozen reference set exported from a reviewed workspace.');
const store = new Store(); const workspace = seedWorkspace(store); const engine = new Engine(store, { demo: new DemoProvider({ delayMs: 0 }) });
const config = { mode, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', laneCount: 2, inputBudget: 10000, outputBudget: 1800, totalBudget: 80000, timeBudgetMs: 120000 };
const rows = [];
try {
  for (let trial = 0; trial < repeats; trial++) {
    // Rotate execution order to reduce a fixed-order warm-cache bias.
    const conditions = ['single', 'overlap', 'stack']; const order = [...conditions.slice(trial % 3), ...conditions.slice(0, trial % 3)];
    for (const condition of order) {
      console.log(`Running ${mode} ${condition}, trial ${trial + 1}/${repeats}…`);
      const { runId } = engine.start(workspace.id, store.get(workspace.id).revision, uid(), { ...config, condition }); await engine.wait(runId);
      const run = engine.getRun(workspace.id, runId);
      rows.push({ trial: trial + 1, condition, status: run.status, error: run.error || null, elapsedMs: run.elapsedMs, usage: run.usage, coverage: run.coverage || null,
        checks: reference && run.status === 'completed' ? evaluate(run, reference) : null,
        requests: [...run.lanes.flatMap(l => l.requests), ...run.synthesisRequests].map(({ input, ...request }) => request) });
    }
  }
  const root = fileURLToPath(new URL('..', import.meta.url)); const dir = resolve(root, 'artifacts'); mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `evaluation-${mode}-${Date.now()}.json`);
  const report = { createdAt: new Date().toISOString(), config, corpusHash: hash(workspace.sources.map(s => [s.id, s.version])), repeats, rows,
    interpretation: mode === 'demo' ? 'Deterministic plumbing exercise only. No model quality, cost or latency conclusions.' : 'Bounded A/B/C experiment with matched maximum budgets. Actual spend varies; all failures and uncertain usage are retained. Small samples cannot establish superiority.',
    evaluation: reference ? 'Held-out explicit text/citation checks only; not semantic correctness.' : 'No frozen independent reference set supplied. No quality score computed.' };
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.table(rows.map(r => ({ condition: r.condition, trial: r.trial, status: r.status, input: r.usage.inputTokens, output: r.usage.outputTokens, uncertain: r.usage.uncertainTokens, milliseconds: r.elapsedMs, passages: r.coverage?.uniquePassages ?? null })));
  console.log(report.interpretation); console.log(report.evaluation); console.log(`Saved ${path}`);
  if (rows.some(r => r.status !== 'completed')) process.exitCode = 1;
} finally { store.close(); }
