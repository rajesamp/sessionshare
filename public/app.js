const $ = selector => document.querySelector(selector);
const fmt = n => Number(n || 0).toLocaleString();
const when = n => new Date(n).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const roles = ['Builder', 'Challenger', 'Evaluator', 'Alternative'];
let bootstrap, workspace, selectedRunId, activeTab = 'result', refreshTimer, stream;
let settings = { inputBudget: 10000, outputBudget: 1800, totalBudget: 80000, timeBudgetMs: 120000 };
const selectedRun = () => workspace?.runs.find(r => r.id === selectedRunId);
const activeRun = () => workspace?.runs.find(r => r.status === 'running');

// All source and model text is rendered as text, including imported HTML and Markdown.
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, callback, className = 'text-button') {
  const node = el('button', className, text); node.type = 'button';
  node.addEventListener('click', async () => { try { await callback(); } catch (error) { showError(error); } }); return node;
}
function showError(error) {
  const target = $('#dialog').open ? ($('#dialog-content .form-error') || $('#dialog-content').appendChild(el('p', 'form-error'))) : $('#error');
  target.textContent = error.message; target.hidden = false;
}
function notice(text) { $('#notice').textContent = text; $('#notice').hidden = false; }
function modal(title, ...nodes) { $('#dialog-title').textContent = title; $('#dialog-content').replaceChildren(...nodes); if (!$('#dialog').open) $('#dialog').showModal(); }
function closeModal() { $('#dialog').close(); }
function field(label, value = '', { type = 'text', maxLength, required = true, rows } = {}) {
  const wrapper = el('label', 'form-field', label); const input = el(rows ? 'textarea' : 'input');
  if (!rows) input.type = type; else input.rows = rows;
  input.value = value; input.required = required; if (maxLength) input.maxLength = maxLength; wrapper.append(input); return { wrapper, input };
}
function selectField(label, choices, value) {
  const wrapper = el('label', 'form-field', label); const input = el('select');
  for (const [id, text] of choices) { const option = el('option', '', text); option.value = id; input.append(option); }
  if (value !== undefined) input.value = value; wrapper.append(input); return { wrapper, input };
}
function form(submitText, callback, ...nodes) {
  const node = el('form', 'form-stack'); const submit = el('button', 'primary', submitText); submit.type = 'submit';
  const error = el('div', 'form-error'); error.setAttribute('role', 'alert'); node.append(...nodes, error, submit);
  node.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; error.textContent = '';
    try { await callback(); } catch (e) { error.textContent = e.message; } finally { submit.disabled = false; }
  }); return node;
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'x-commonshense-token': bootstrap?.token || '', ...options.headers } });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`); return result;
}
function accept(next) {
  if (workspace && next.revision < workspace.revision) return;
  next.telemetry ||= workspace?.telemetry || []; workspace = next;
  selectedRunId ||= workspace.latestRunId; render();
}
async function refresh() { accept(await api(`/api/workspaces/${workspace.id}`)); }
async function command(action, payload) {
  $('#error').hidden = true;
  try {
    const result = await api(`/api/workspaces/${workspace.id}/commands`, { method: 'POST', body: JSON.stringify({ action, payload, revision: workspace.revision, commandId: crypto.randomUUID() }) });
    if (result.runId) selectedRunId = result.runId;
    accept(result.workspace); return result;
  } catch (error) { await refresh().catch(() => {}); throw error; }
}
function connect() {
  stream?.close(); stream = new EventSource(`/api/workspaces/${workspace.id}/events?after=${workspace.revision}`);
  stream.onopen = () => { $('#connection').textContent = '● Board connected'; };
  stream.onerror = () => { $('#connection').textContent = 'Reconnecting…'; };
  stream.addEventListener('update', event => {
    const seq = Number(event.lastEventId);
    clearTimeout(refreshTimer); refreshTimer = setTimeout(async () => {
      try { await refresh(); requestAnimationFrame(() => {
        if (workspace.revision >= seq) api(`/api/workspaces/${workspace.id}/ack`, { method: 'POST', body: JSON.stringify({ seq }) }).catch(() => {});
      }); } catch (error) { showError(error); }
    }, 40);
  });
}
function sourcesForRun() { return selectedRun()?.sources || workspace.sources; }
function openSource(sourceId, citation) {
  const source = sourcesForRun().find(s => s.id === sourceId);
  if (!source) throw new Error('Source is unavailable in this run snapshot.');
  const note = el('p', 'dialog-note', `${source.id} · version ${source.version} · immutable original${citation ? ` · ${citation}` : ''}`);
  modal(source.title, note, el('pre', 'source-original', source.content));
}
function citation(id) { return button(id.split('@')[0] + ' · ' + id.split(':').at(-1), () => openSource(id.split('@')[0], id), 'citation'); }
function claim(item) {
  const node = el('div', 'claim'); node.append(el('p', '', item.text));
  const meta = el('div', 'claim-meta'); item.citations.forEach(id => meta.append(citation(id)));
  meta.append(el('span', 'annotation', item.citations.length ? 'Reference linked · review meaning' : 'Unverified claim')); node.append(meta); return node;
}
function laneCard(node, lane, index, run) {
  node.replaceChildren(); const role = lane?.role || roles[index];
  const head = el('div', 'lane-head'); const title = el('div', 'lane-title'); title.append(el('span', 'lane-num', String(index + 1).padStart(2, '0')), el('span', '', role));
  head.append(title, el('p', 'lane-role', index === 0 ? 'Propose an evidence-led approach' : index === 1 ? 'Test assumptions. Bring another angle.' : 'Add an independent perspective.'));
  const body = el('div', 'lane-body'); const output = lane?.outputs.review || lane?.outputs.explore;
  body.append(el('span', 'lane-status', lane?.status || 'Independent context'), el('p', '', output?.summary || 'Ready to explore the shared goal with a separate context and its own evidence.'));
  body.append(el('div', 'eyebrow', 'CONTEXT SOURCES'));
  const chips = el('div', 'source-chips'); const ids = lane?.requests.at(-1)?.passageIds.map(p => p.split('@')[0]);
  const count = run?.lanes.length || Number($('#lane-count').value);
  const sources = sourcesForRun().filter(s => ids ? ids.includes(s.id) : $('#condition').value !== 'stack' || s.owner === -1 || s.owner % count === index);
  sources.forEach(s => chips.append(button(s.id, () => openSource(s.id), 'source-chip')));
  if (!sources.length) chips.append(el('span', 'annotation', 'No passages selected yet')); body.append(chips);
  const request = lane?.requests.at(-1); const max = run?.config.inputBudget || settings.inputBudget;
  const row = el('div', 'meter-row'); row.append(el('span', '', request?.countMeasured ? 'Counted input' : 'Input estimate'), el('span', '', `${fmt(request?.inputTokens)} / ${fmt(max)}`));
  const meter = el('progress', 'context-progress'); meter.max = max; meter.value = request?.inputTokens || 0; meter.setAttribute('aria-label', `${role} input tokens`);
  body.append(row, meter);
  if (request) body.append(button('Inspect exact request ↗', () => inspectRequest(run.id, request.id), 'request-link'));
  node.append(head, body);
}
function resultView(run, target) {
  if (!run?.result) {
    const empty = el('div', 'empty-result'); empty.append(el('div', 'big-symbol', '∩'), el('h3', '', run?.status === 'running' ? 'Separate thinking. Shared progress.' : 'Your common ground starts here.'),
      el('p', '', run?.status === 'running' ? 'Sessions are contributing to the shared board below. The synthesis will appear here after their evidence exchange.' : 'Give the sessions a shared goal. Let each explore its own evidence, challenge the other, and bring a supported result into focus.'));
    if (run?.error) empty.append(el('p', 'form-error', run.error.message)); target.append(empty); return;
  }
  target.append(el('h3', '', run.config.mode === 'demo' ? 'A workflow you can inspect' : 'A shared recommendation'), el('p', 'result-summary', run.result.summary));
  run.result.claims.forEach(c => target.append(claim(c)));
  const dissent = [...run.result.challenges, ...run.result.unresolved].filter((c, i, all) => all.findIndex(x => x.text === c.text) === i);
  if (dissent.length) {
    const details = el('details', 'dissent'); details.append(el('summary', '', `${dissent.length} open challenges · retained for review`));
    dissent.forEach(c => { const p = el('p', '', `${c.from ? c.from + ': ' : ''}${c.text}`); c.citations.forEach(id => p.append(' ', citation(id))); details.append(p); }); target.append(details);
  }
  if (run.result.rejectedCitations.length) target.append(el('p', 'form-error', `${run.result.rejectedCitations.length} unknown evidence references were removed.`));
}
function evidenceView(run, target) {
  target.append(el('h3', '', 'Trace it to the source'), el('p', 'dialog-note', 'Every citation points to a versioned original. A valid reference does not prove a claim is correct.'));
  const ids = new Set(run?.lanes.flatMap(l => l.heldPassageIds).map(p => p.split('@')[0]) || []);
  sourcesForRun().forEach(s => {
    const row = el('div', 'source-row'); row.append(button(s.title, () => openSource(s.id)), el('small', '', `${s.version} · ${ids.has(s.id) ? 'Included in a session request' : 'Available in the source library'}`)); target.append(row);
  });
  const cases = run?.lanes.flatMap(l => Object.values(l.outputs).flatMap(o => o.candidateCases)) || [];
  if (cases.length) {
    target.append(el('h4', '', 'Proposed reference cases'));
    cases.filter((c, i, all) => all.findIndex(x => x.label === c.label) === i).forEach(c => {
      const card = el('div', 'candidate-case'); card.append(el('strong', '', c.label), el('p', '', c.expected), el('span', 'annotation', 'Candidate · human review required')); target.append(card);
    });
  }
  target.append(button('Manage source library ↗', openSources), document.createTextNode(' · '), button('Review reference sets ↗', openReferences));
}
function changesView(run, target) {
  target.append(el('h3', '', 'Compare with a checkpoint'), el('p', 'dialog-note', 'Replay both results against the same frozen checks. These checks match explicit text and source IDs; they do not judge semantic correctness.'));
  const frozen = workspace.referenceSets.filter(s => s.status === 'frozen');
  if (run?.status !== 'completed' || !frozen.length) {
    target.append(el('p', 'progress-note', run?.status !== 'completed' ? 'Complete a run to evaluate or compare it.' : 'Review and freeze a reference set before evaluating.'));
    target.append(button('Review reference sets ↗', openReferences)); return;
  }
  const set = selectField('Frozen reference set', frozen.map(s => [s.id, s.name]));
  const checkpoints = workspace.checkpoints.filter(c => c.runId !== run.id);
  const baseline = selectField('Baseline checkpoint', checkpoints.map(c => [c.id, c.label]));
  const controls = el('div', 'inline-form'); controls.append(set.wrapper, button('Evaluate this result', async () => { await command('evaluate', { runId: run.id, setId: set.input.value }); }, 'secondary'));
  if (checkpoints.length) controls.append(baseline.wrapper, button('Compare both results', async () => { await command('compare', { runId: run.id, checkpointId: baseline.input.value, setId: set.input.value }); }, 'primary'));
  else controls.append(el('p', 'dialog-note', 'Save this run as a checkpoint, then complete another run to compare.'));
  target.append(controls);
  const evaluation = run.evaluations?.at(-1);
  if (evaluation) {
    target.append(el('h4', '', `${evaluation.passed} / ${evaluation.total} explicit checks passed`));
    const list = el('ul', 'change-list'); evaluation.checks.forEach(c => list.append(el('li', c.pass ? 'check-pass' : 'check-fail', `${c.pass ? '✓' : '×'} ${c.label}${c.pass ? '' : ` — missing: ${[...c.missing, ...c.missingSources].join(', ') || 'none'}; prohibited: ${c.forbidden.join(', ') || 'none'}`}`))); target.append(list);
    if (evaluation.warning) target.append(el('p', 'form-error', evaluation.warning));
  }
  const comparison = workspace.comparisons.filter(c => c.current.runId === run.id).at(-1);
  if (comparison) {
    target.append(el('h4', '', `Current ${comparison.current.passed}/${comparison.current.total} · baseline ${comparison.baseline.passed}/${comparison.baseline.total}`),
      el('p', '', `Improvements: ${comparison.improvements.join(', ') || 'none'}. Regressions: ${comparison.regressions.join(', ') || 'none'}.`));
    if (comparison.warning) target.append(el('p', 'form-error', comparison.warning));
  }
}
function metricsView(run, target) {
  if (!run) { target.append(el('p', 'dialog-note', 'Run the stack to measure requests, source coverage, and update uptake.')); return; }
  const requests = [...run.lanes.flatMap(l => l.requests), ...run.synthesisRequests];
  const grid = el('div', 'metric-grid'); const cost = run.estimatedCostUsd == null ? 'Not configured' : `$${run.estimatedCostUsd.toFixed(4)}`;
  for (const [label, value] of [['Input tokens', fmt(run.usage.inputTokens)], ['Output tokens', fmt(run.usage.outputTokens)], ['Elapsed', `${((run.elapsedMs + (run.status === 'running' ? Date.now() - run.startedAt : 0)) / 1000).toFixed(1)}s`], ['Cost estimate', cost], ['Original passages', run.coverage ? `${run.coverage.uniquePassages} / ${run.coverage.totalPassages}` : 'In progress'], ['Duplicate placements', run.coverage?.duplicatedPlacements ?? '—']]) {
    const metric = el('div'); metric.append(el('small', '', label), el('strong', '', value)); grid.append(metric);
  } target.append(grid);
  target.append(el('p', 'metric-note', run.config.mode === 'demo' ? 'Demo tokens are byte-based estimates. Demo runs do not measure model quality, cost, or model latency.' : 'Tokens are provider-reported. Cost uses configured rates before cache discounts; unset rates remain unknown.'));
  target.append(el('p', 'metric-note', `Run token cap ${fmt(run.config.totalBudget)} · reserved ${fmt(run.usage.reservedTokens)} · uncertain ${fmt(run.usage.uncertainTokens)} across ${run.usage.unknownCalls} call(s).`));
  const telemetry = workspace.telemetry || []; const latest = telemetry[0];
  target.append(el('p', 'metric-note', latest ? `Last sampled board event → render acknowledgment: ${latest.renderAckMs} ms (includes browser return trip). See the board for inclusion in model requests.` : 'Render acknowledgment samples appear after live board updates. Transport delivery and model uptake are separate measurements.'));
  const details = el('div', 'metric-requests'); requests.forEach(r => details.append(button(`${r.stage} · ${r.status} · ${fmt(r.inputTokens)} input · ${r.durationMs ?? '…'} ms ↗`, () => inspectRequest(run.id, r.id)))); target.append(details);
}
function render() {
  if (!workspace) return;
  const run = selectedRun(); const running = activeRun();
  $('#goal-text').textContent = run?.goal || workspace.goal; $('#constraints-text').textContent = run?.constraints || workspace.constraints;
  $('#source-count').textContent = workspace.sources.length; $('#run-count').textContent = workspace.runs.length;
  $('#export-link').href = `/api/workspaces/${workspace.id}/export`;
  $('#mode option[value="openai"]').disabled = !bootstrap.liveAvailable;
  $('#mode-note').textContent = $('#mode').value === 'demo' ? 'Offline demo uses deterministic source extracts. No model calls.' : `Live requests send selected sources to OpenAI · ${settings.model} · API usage applies.`;
  ['#mode', '#condition', '#lane-count', '#settings', '#run', '#edit-goal'].forEach(selector => { $(selector).disabled = Boolean(running); });
  $('#lane-count').disabled ||= $('#condition').value === 'single';
  $('#cancel').hidden = !running; $('#resume').hidden = run?.status !== 'interrupted' || Boolean(running);
  $('#save-checkpoint').disabled = run?.status !== 'completed' || Boolean(running);
  $('#result-status').textContent = run ? `${run.config.mode === 'demo' ? 'Demo · ' : ''}${run.status}` : 'Ready';
  $('#run-status').textContent = run ? `${run.config.condition} · ${run.lanes.length} session(s) · ${run.status}` : 'Ready to explore';
  $('#result-footer-note').textContent = run ? `${run.config.mode === 'demo' ? 'Extractive demo' : run.config.model} · revision ${workspace.revision}` : 'One goal · versioned evidence';
  document.querySelectorAll('[data-stage]').forEach(n => n.classList.toggle('current', run?.phase === n.dataset.stage));
  const history = $('#history'); history.replaceChildren();
  if (!workspace.runs.length) history.append(el('p', 'history-empty', 'Your runs will appear here.'));
  workspace.runs.slice().reverse().forEach((r, i) => {
    const b = button(`Run ${workspace.runs.length - i} · ${r.config.condition}`, () => { selectedRunId = r.id; render(); }, r.id === selectedRunId ? 'active' : '');
    b.append(el('small', '', `${when(r.createdAt)} · ${r.config.mode} · ${r.status}`)); history.append(b);
  });
  laneCard($('#left-lane'), run?.lanes[0], 0, run);
  if (run?.lanes.length === 1 || (!run && $('#condition').value === 'single')) {
    $('#right-lane').replaceChildren(el('div', 'lane-head', 'Single-session baseline'), el('div', 'lane-body', 'One session retrieves from all sources, reviews its own proposal, and contributes to the same synthesis step.'));
  } else laneCard($('#right-lane'), run?.lanes[1], 1, run);
  const extra = $('#extra-lanes'); extra.replaceChildren();
  const count = run?.lanes.length ?? ($('#condition').value === 'single' ? 1 : Number($('#lane-count').value));
  for (let i = 2; i < count; i++) { const card = el('aside', 'lane'); laneCard(card, run?.lanes[i], i, run); extra.append(card); }
  document.querySelectorAll('[data-tab]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.tab === activeTab)); b.tabIndex = b.dataset.tab === activeTab ? 0 : -1; });
  const content = $('#result-content'); content.replaceChildren(); content.setAttribute('aria-labelledby', `tab-${activeTab}`);
  ({ result: resultView, evidence: evidenceView, changes: changesView, metrics: metricsView })[activeTab](run, content);
  $('#message-count').textContent = `${run?.messages.length || 0} contributions`;
  const messages = $('#messages'); messages.replaceChildren();
  if (!run?.messages.length) messages.append(el('p', 'dialog-note', 'Proposals, evidence requests, and review updates will appear here as they reach the board.'));
  run?.messages.forEach(m => {
    const row = el('div', 'message'); const who = el('div', 'message-who', m.role); who.append(el('small', '', `${m.stage || 'evidence transfer'} · ${when(m.publishedAt)}`));
    const body = el('div'); body.append(el('p', '', m.summary)); const status = el('div', 'message-status');
    const seen = Object.entries(m.processedBy || {}).map(([id, info]) => `${run.lanes.find(l => l.id === id)?.role || 'Synthesis'} +${info.at - m.publishedAt}ms`);
    const delta = m.deliveredAt - m.publishedAt;
    status.append(el('span', '', delta ? `Local enqueue ${delta}ms` : 'Local enqueue <1ms clock resolution'), el('span', '', seen.length ? `Included in request: ${seen.join(' · ')}` : 'Not included in a later request yet')); body.append(status);
    row.append(who, body); messages.append(row);
  });
}
async function inspectRequest(runId, requestId) {
  const request = await api(`/api/workspaces/${workspace.id}/runs/${runId}/requests/${requestId}`);
  modal('Exact model input', el('p', 'request-details', `${request.stage} · board revision ${request.baseRevision} · ${fmt(request.inputTokens)} input tokens (${request.countMeasured ? 'provider count' : 'estimate'}) · ${request.passageIds.length} passages · ${request.messageIds.length} board updates`),
    el('p', 'dialog-note', 'This is the assembled input. Server instructions and the output schema are also sent and included in token counting. Reference answer keys are held out.'), el('pre', 'source-original', JSON.stringify(JSON.parse(request.input), null, 2)));
}
function openGoal() {
  const goal = field('Shared goal', workspace.goal, { rows: 4, maxLength: 6000 });
  const constraints = field('Constraints', workspace.constraints, { rows: 3, maxLength: 3000, required: false });
  modal('Set the shared direction', form('Save goal', async () => { await command('contract', { goal: goal.input.value, constraints: constraints.input.value }); selectedRunId = null; closeModal(); render(); }, goal.wrapper, constraints.wrapper));
}
function ownerChoices() { return [[-1, 'Shared by all'], ...roles.map((r, i) => [i, `${i + 1} · ${r}`])]; }
function openSources() {
  const list = el('div', 'source-list');
  workspace.sources.forEach(s => {
    const row = el('div', 'source-row'); const info = el('div');
    info.append(button(s.title, () => modal(s.title, el('p', 'dialog-note', `Original · ${s.version}`), el('pre', 'source-original', s.content), button('← Back to source library', openSources))), el('small', '', `${s.id} · ${fmt(s.content.length)} characters`));
    const owner = selectField('Context owner', ownerChoices(), s.owner); owner.input.disabled = Boolean(activeRun());
    owner.input.addEventListener('change', async () => { try { await command('owner', { sourceId: s.id, owner: Number(owner.input.value) }); } catch (e) { showError(e); owner.input.value = s.owner; } });
    row.append(info, owner.wrapper); list.append(row);
  });
  const title = field('Source title', '', { maxLength: 160 }); const content = field('Original source text', '', { rows: 5, maxLength: 120000 });
  const owner = selectField('Assign to', ownerChoices(), 0); const upload = field('Or load a text / Markdown file', '', { type: 'file', required: false }); upload.input.accept = '.txt,.md';
  upload.input.addEventListener('change', async () => {
    try { const file = upload.input.files[0]; if (!file) return; if (file.size > 480000) throw new Error('File too large. Paste up to 120,000 characters.'); const text = await file.text(); if (text.length > 120000) throw new Error('Source exceeds 120,000 characters.'); content.input.value = text; title.input.value ||= file.name; } catch (error) { showError(error); }
  });
  const add = form('Add source', async () => { await command('source', { title: title.input.value, content: content.input.value, owner: Number(owner.input.value) }); openSources(); }, title.wrapper, upload.wrapper, content.wrapper, owner.wrapper);
  if (activeRun()) add.querySelector('button[type="submit"]').disabled = true;
  modal('Source library', el('p', 'dialog-note', 'Keep complementary source ownership for SessionStack. Shared sources go to every session. Owners 3–4 wrap to an available session when running with fewer sessions. Source text is immutable; add a new source to revise it.'), list, add);
}
function openReferences() {
  const list = el('div');
  workspace.referenceSets.forEach(set => {
    const card = el('div', 'reference'); card.append(el('h3', '', set.name), el('span', 'status-pill', `${set.status} · ${set.version}`));
    const cases = el('ul'); set.cases.forEach(c => cases.append(el('li', '', `${c.label} — contains: ${c.contains.join(', ') || '—'}; excludes: ${c.excludes.join(', ') || '—'}; sources: ${c.sourceIds.join(', ') || '—'}`))); card.append(cases);
    if (set.status === 'candidate') {
      const reviewer = field('Reviewer name', '', { maxLength: 120 });
      const freeze = form('Freeze reviewed checks', async () => { await command('freeze', { setId: set.id, reviewer: reviewer.input.value }); openReferences(); }, reviewer.wrapper);
      freeze.querySelector('button[type="submit"]').disabled = Boolean(activeRun()); card.append(freeze);
    } else card.append(el('p', 'dialog-note', `Frozen by ${set.reviewer}. Later model runs do not receive these checks.`)); list.append(card);
  });
  const name = field('Reference set name', '', { maxLength: 120 }); const editors = el('div', 'form-stack'); const caseFields = [];
  const addCase = () => {
    if (caseFields.length >= 30) return;
    const fields = { label: field('Case label', '', { maxLength: 200 }), contains: field('Required phrases (one per line)', '', { rows: 2, required: false }), excludes: field('Prohibited phrases (one per line)', '', { rows: 2, required: false }), sourceIds: field('Required source IDs (comma-separated)', '', { required: false }) };
    caseFields.push(fields); const card = el('div', 'case-editor'); Object.values(fields).forEach(f => card.append(f.wrapper)); editors.append(card);
  }; addCase();
  const lines = value => value.split('\n').map(s => s.trim()).filter(Boolean);
  const create = form('Create candidate set', async () => {
    await command('reference', { name: name.input.value, cases: caseFields.map(f => ({ label: f.label.input.value, contains: lines(f.contains.input.value), excludes: lines(f.excludes.input.value), sourceIds: f.sourceIds.input.value.split(',').map(s => s.trim()).filter(Boolean) })) }); openReferences();
  }, name.wrapper, editors, button('+ Add another case', addCase));
  create.querySelector('button[type="submit"]').disabled = Boolean(activeRun());
  modal('Reference sets', el('p', 'dialog-note', 'Review candidates before freezing. “Golden” means independently verified: these lightweight checks only test explicit phrases and source citations. Freezing records your review; it does not verify truth. Keep evaluation cases independent of model suggestions.'), list, el('h3', '', 'Create a reference set'), create);
}
function openSettings() {
  const model = field('OpenAI model', settings.model, { maxLength: 100 });
  const fields = [['inputBudget', 'Input tokens / call', 3000, 32000], ['outputBudget', 'Output tokens / call', 1000, 4000], ['totalBudget', 'Total run token cap', 6000, 300000], ['timeBudgetMs', 'Time cap (seconds)', 1, 600]].map(([key, label, min, max]) => {
    const f = field(label, key === 'timeBudgetMs' ? settings[key] / 1000 : settings[key], { type: 'number' }); f.input.min = min; f.input.max = max; f.input.step = 1; return { key, ...f };
  });
  const grid = el('div', 'form-grid'); fields.forEach(f => grid.append(f.wrapper));
  modal('Run budgets', el('p', 'dialog-note', 'Live mode counts assembled inputs before each call. The coordinator reserves input plus maximum output before dispatch. Unknown usage from interrupted calls stays charged against the cap. These are app budgets, not model context-window claims.'),
    form('Save budgets', () => { settings = { model: model.input.value, ...Object.fromEntries(fields.map(f => [f.key, Number(f.input.value) * (f.key === 'timeBudgetMs' ? 1000 : 1)])) }; closeModal(); render(); }, model.wrapper, grid));
}
$('#close-dialog').addEventListener('click', closeModal);
$('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) { const r = $('#dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
$('#edit-goal').addEventListener('click', openGoal); $('#sources-nav').addEventListener('click', openSources); $('#references-nav').addEventListener('click', openReferences); $('#settings').addEventListener('click', openSettings);
$('#mobile-sources').addEventListener('click', openSources); $('#mobile-references').addEventListener('click', openReferences);
$('#mobile-history').addEventListener('click', () => {
  const list = el('div', 'form-stack');
  workspace.runs.slice().reverse().forEach(r => list.append(button(`${when(r.createdAt)} · ${r.config.condition} · ${r.status}`, () => { selectedRunId = r.id; closeModal(); render(); }, 'secondary')));
  if (!workspace.runs.length) list.append(el('p', 'dialog-note', 'No runs yet.'));
  const link = el('a', 'text-button', 'Export workspace'); link.href = `/api/workspaces/${workspace.id}/export`; list.append(link); modal('Run history', list);
});
$('#workspace-nav').addEventListener('click', () => { selectedRunId = workspace.latestRunId; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
['#mode', '#condition', '#lane-count'].forEach(s => $(s).addEventListener('change', render));
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { activeTab = b.dataset.tab; render(); }));
$('.tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const tabs = [...document.querySelectorAll('[data-tab]')]; const index = tabs.findIndex(t => t.dataset.tab === activeTab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  activeTab = tabs[next].dataset.tab; render(); tabs[next].focus();
});
$('#run').addEventListener('click', async () => {
  $('#run').disabled = true; $('#notice').hidden = true;
  try { await command('run', { ...settings, mode: $('#mode').value, condition: $('#condition').value, laneCount: Number($('#lane-count').value) }); activeTab = 'result'; render(); } catch (error) { showError(error); render(); }
});
$('#cancel').addEventListener('click', async () => { try { await command('cancel', { runId: activeRun().id }); } catch (error) { showError(error); } });
$('#resume').addEventListener('click', async () => { try { await command('resume', { runId: selectedRun().id }); } catch (error) { showError(error); } });
$('#save-checkpoint').addEventListener('click', () => {
  const run = selectedRun(); const label = field('Checkpoint name', `${run.config.condition} · ${when(run.createdAt)}`, { maxLength: 120 });
  modal('Save a baseline checkpoint', form('Save checkpoint', async () => { await command('checkpoint', { runId: run.id, label: label.input.value }); closeModal(); notice('Checkpoint saved. Complete another run to compare it using the same frozen reference set.'); }, label.wrapper));
});
try {
  bootstrap = await api('/api/bootstrap'); settings.model = bootstrap.defaultModel;
  workspace = await api(`/api/workspaces/${bootstrap.workspaces[0].id}`); selectedRunId = workspace.latestRunId; render(); connect();
} catch (error) { showError(error); $('#connection').textContent = 'Unavailable'; $('#run').disabled = true; }
