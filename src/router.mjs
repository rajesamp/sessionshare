import { AppError, hash, uid } from './store.mjs';

// Routing estimate only. Live requests are counted by the provider before generation.
export const estimateTokens = text => Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
export function sourceDocument({ id = uid(), title, content, owner = 0 }) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new AppError('Invalid source ID');
  if (typeof title !== 'string' || !title.trim() || title.length > 160) throw new AppError('Source title must contain 1–160 characters');
  if (typeof content !== 'string' || !content.trim() || content.length > 120000) throw new AppError('Source text must contain 1–120,000 characters');
  if (!Number.isInteger(owner) || owner < -1 || owner > 3) throw new AppError('Invalid source owner');
  return { id, title: title.trim(), content, owner, version: hash(content).slice(0, 16), createdAt: Date.now() };
}
export function passages(sources) {
  return sources.flatMap(source => {
    const items = [];
    for (let start = 0, n = 1; start < source.content.length; n++) {
      let end = Math.min(start + 1200, source.content.length);
      if (end < source.content.length) {
        const boundary = source.content.lastIndexOf('\n', end);
        if (boundary > start + 400) end = boundary + 1;
      }
      items.push({ id: `${source.id}@${source.version}:p${n}`, sourceId: source.id, version: source.version,
        title: source.title, owner: source.owner, start, end, text: source.content.slice(start, end) });
      start = end;
    }
    return items;
  });
}
const terms = text => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
export function rankPassages(items, query) {
  const queryTerms = terms(query);
  return items.map((p, index) => ({ p, index, score: [...terms(p.title + ' ' + p.text)].filter(t => queryTerms.has(t)).length }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(x => x.p);
}
export function selectPassages(sources, { laneIndex = 0, laneCount = 2, condition = 'stack', query, budget = 2500, exclude = [] }) {
  let items = passages(sources).filter(p => !exclude.includes(p.id));
  if (condition === 'stack') items = items.filter(p => p.owner === -1 || p.owner % laneCount === laneIndex);
  const selected = []; let used = 0;
  for (const passage of rankPassages(items, query)) {
    const size = estimateTokens(JSON.stringify(passage));
    if (used + size <= budget) { selected.push(passage); used += size; }
  }
  return { selected, estimate: used, available: items.length };
}
export function retrieve(sources, query, alreadyHeld, budget = 1600) {
  return selectPassages(sources, { condition: 'single', query, budget, exclude: alreadyHeld }).selected.slice(0, 3);
}
export function coverage(run) {
  const selections = run.lanes.map(l => new Set(l.requests.flatMap(r => r.passageIds)));
  const unique = new Set(selections.flatMap(s => [...s]));
  const placements = selections.reduce((n, s) => n + s.size, 0);
  return { uniquePassages: unique.size, totalPassages: passages(run.sources).length,
    duplicatedPlacements: placements - unique.size, lanePlacements: placements };
}
