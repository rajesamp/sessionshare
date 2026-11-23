import { AppError, hash, uid } from './store.mjs';

export function referenceSet({ name, cases }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || !Array.isArray(cases) || cases.length < 1 || cases.length > 30) throw new AppError('Supply a name and 1–30 reference cases');
  const normalized = cases.map(c => {
    if (typeof c.label !== 'string' || !c.label.trim() || c.label.length > 200) throw new AppError('Each case needs a label');
    const result = { id: uid(), label: c.label };
    for (const field of ['contains', 'excludes', 'sourceIds']) {
      const values = c[field] || [];
      if (!Array.isArray(values) || values.length > 20 || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 200)) throw new AppError('Invalid reference case');
      result[field] = values;
    }
    if (!result.contains.length && !result.excludes.length && !result.sourceIds.length) throw new AppError('A case must define at least one check');
    return result;
  });
  return { id: uid(), name: name.trim(), cases: normalized, status: 'candidate', createdAt: Date.now(), version: hash(normalized).slice(0, 16) };
}
export function evaluate(run, set) {
  if (set.status !== 'frozen') throw new AppError('Freeze a reviewed reference set before evaluating');
  if (run.status !== 'completed') throw new AppError('Only completed runs can be evaluated');
  const result = run.result;
  const sameReferenceCorpus = !set.sourceVersions || set.sourceVersions.every(s => run.sources.some(r => r.id === s.id && r.version === s.version)) && set.sourceVersions.length === run.sources.length;
  const text = [result.summary, ...result.claims.map(c => c.text)].join('\n').toLowerCase();
  const cited = new Set(result.claims.flatMap(c => c.citations).map(id => id.split('@')[0]));
  const checks = set.cases.map(c => {
    const missing = c.contains.filter(term => !text.includes(term.toLowerCase()));
    const forbidden = c.excludes.filter(term => text.includes(term.toLowerCase()));
    const missingSources = c.sourceIds.filter(id => !cited.has(id));
    return { id: c.id, label: c.label, pass: !missing.length && !forbidden.length && !missingSources.length, missing, forbidden, missingSources };
  });
  return { runId: run.id, setId: set.id, setVersion: set.version, checkedAt: Date.now(), checks, sameReferenceCorpus,
    warning: sameReferenceCorpus ? null : 'Run source versions differ from the frozen reference corpus. Treat these checks as diagnostic only.',
    passed: checks.filter(c => c.pass).length, total: checks.length,
    method: 'Explicit text and citation checks; not semantic correctness or model quality.' };
}
export function compareRuns(current, baseline, set) {
  const now = evaluate(current, set); const before = evaluate(baseline, set);
  const sameCorpus = hash(current.sources.map(s => [s.id, s.version])) === hash(baseline.sources.map(s => [s.id, s.version]));
  const sameGoal = current.goal === baseline.goal && current.constraints === baseline.constraints;
  const sameBudget = ['mode', 'model', 'inputBudget', 'outputBudget', 'totalBudget', 'timeBudgetMs'].every(k => current.config[k] === baseline.config[k]);
  const comparable = sameCorpus && sameGoal && sameBudget && now.sameReferenceCorpus && before.sameReferenceCorpus;
  return { current: now, baseline: before, comparable, sameCorpus, sameGoal, sameBudget,
    improvements: now.checks.filter((c, i) => c.pass && !before.checks[i].pass).map(c => c.label),
    regressions: now.checks.filter((c, i) => !c.pass && before.checks[i].pass).map(c => c.label),
    warning: comparable ? null : 'Goal, source versions, reference corpus, model, or budgets differ. These are diagnostic replays, not matched performance scores.' };
}
