import { AppError, uid } from './store.mjs';
import { passages, selectPassages, retrieve, estimateTokens, rankPassages, coverage } from './router.mjs';
import { DemoProvider, OpenAIProvider, validateOutput } from './providers.mjs';

const ROLES = ['Builder', 'Challenger', 'Evaluator', 'Alternative'];
const ROLE_BRIEFS = {
  Builder: 'Propose an actionable approach with supporting evidence, assumptions, and tradeoffs.',
  Challenger: 'Find counterexamples, unsupported assumptions, and risks. Offer a concrete alternative where warranted.',
  Evaluator: 'Identify testable acceptance criteria and evidence gaps. Propose candidate checks; do not call them verified gold data.',
  Alternative: 'Explore a materially different approach and explain when it would work better.',
  'Single session': 'Develop an approach, then critically review it against the source evidence.',
  Synthesizer: 'Produce a useful final recommendation for the goal. Weigh evidence, explain tradeoffs, and retain dissent.'
};
export function runConfig(input = {}) {
  const c = { mode: input.mode || 'demo', condition: input.condition || 'stack', laneCount: input.laneCount ?? 2,
    model: input.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini', inputBudget: input.inputBudget ?? 10000,
    outputBudget: input.outputBudget ?? 1800, totalBudget: input.totalBudget ?? 80000, timeBudgetMs: input.timeBudgetMs ?? 120000 };
  if (!['demo', 'openai'].includes(c.mode) || !['single', 'overlap', 'stack'].includes(c.condition)) throw new AppError('Invalid run mode');
  if (typeof c.model !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(c.model)) throw new AppError('Invalid model name');
  for (const [key, min, max] of [['laneCount', 2, 4], ['inputBudget', 3000, 32000], ['outputBudget', 1000, 4000], ['totalBudget', 6000, 300000], ['timeBudgetMs', 1000, 600000]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new AppError(`${key} must be an integer from ${min} to ${max}`);
  }
  return c;
}

export class Engine {
  constructor(store, { demo = new DemoProvider(), openai = new OpenAIProvider() } = {}) {
    this.store = store; this.providers = { demo, openai }; this.jobs = new Map();
  }
  change(workspaceId, runId, type, fn) {
    const s = this.store.get(workspaceId);
    return this.store.update(workspaceId, s.revision, uid(), type, state => {
      const run = state.runs.find(r => r.id === runId);
      if (!run) throw new AppError('Run not found', 404);
      return { runId, ...fn(run, state) };
    });
  }
  start(workspaceId, revision, commandId, input = {}) {
    const config = runConfig(input);
    const runId = uid();
    const update = this.store.update(workspaceId, revision, commandId, 'run.started', state => {
      if (state.runs.some(r => r.status === 'running')) throw new AppError('A run is already active', 409);
      if (state.runs.length >= 100) throw new AppError('This prototype is limited to 100 runs per workspace. Export the workspace before starting a new one.');
      if (!state.goal.trim()) throw new AppError('Enter a shared goal first');
      if (!state.sources.length) throw new AppError('Add at least one source');
      if (config.mode === 'openai' && !this.providers.openai.apiKey) throw new AppError('Live mode needs OPENAI_API_KEY on the server.', 503);
      const count = config.condition === 'single' ? 1 : config.laneCount;
      state.runs.push({ id: runId, goal: state.goal, constraints: state.constraints, sources: structuredClone(state.sources),
        config, createdAt: Date.now(), startedAt: Date.now(), status: 'running', phase: 'explore', result: null,
        lanes: Array.from({ length: count }, (_, index) => ({ id: uid(), index, role: count === 1 ? 'Single session' : ROLES[index],
          status: 'ready', requests: [], outputs: {}, history: [], heldPassageIds: [] })),
        messages: [], synthesisRequests: [], usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reservedTokens: 0,
          uncertainTokens: 0, unknownCalls: 0, measured: config.mode === 'openai' }, resumes: 0, elapsedMs: 0 });
      state.latestRunId = runId;
      return { runId };
    }, input);
    const actualId = update.event.detail.runId;
    if (!update.duplicate) this.launch(workspaceId, actualId);
    return { runId: actualId, duplicate: update.duplicate };
  }
  getRun(workspaceId, runId) {
    const run = this.store.get(workspaceId).runs.find(r => r.id === runId);
    if (!run) throw new AppError('Run not found', 404);
    return run;
  }
  launch(workspaceId, runId) {
    const controller = new AbortController();
    const job = { controller, promise: null };
    this.jobs.set(runId, job);
    job.promise = this.drive(workspaceId, runId, controller).finally(() => this.jobs.delete(runId));
  }
  async wait(runId) { await this.jobs.get(runId)?.promise; }
  cancel(workspaceId, runId, revision, commandId) {
    const update = this.store.update(workspaceId, revision, commandId, 'run.cancelled', state => {
      const run = state.runs.find(r => r.id === runId);
      if (!run || run.status !== 'running') throw new AppError('Run is not active', 409);
      run.status = 'cancelled'; run.finishedAt = Date.now();
      return { runId };
    }, { runId });
    if (!update.duplicate) this.jobs.get(runId)?.controller.abort(new AppError('Run cancelled', 409, 'cancelled'));
    return update.state;
  }
  recover() {
    for (const state of this.store.list()) {
      if (!state.runs.some(r => r.status === 'running')) continue;
      this.store.update(state.id, state.revision, uid(), 'run.interrupted', s => {
        for (const run of s.runs.filter(r => r.status === 'running')) {
          run.status = 'interrupted'; run.elapsedMs += Math.max(0, Date.now() - run.startedAt);
          for (const request of [...run.lanes.flatMap(l => l.requests), ...run.synthesisRequests].filter(r => r.status === 'running')) {
            request.status = 'interrupted'; request.usageUnknown = true; run.usage.unknownCalls++;
          }
          run.usage.uncertainTokens += run.usage.reservedTokens; run.usage.reservedTokens = 0;
          run.lanes.forEach(l => { if (l.status === 'running') l.status = 'interrupted'; });
        }
        return { reason: 'Server restart; unknown in-flight usage remains reserved against the total cap.' };
      });
    }
  }
  resume(workspaceId, runId, revision, commandId) {
    const update = this.store.update(workspaceId, revision, commandId, 'run.resumed', state => {
      const run = state.runs.find(r => r.id === runId);
      if (!run || run.status !== 'interrupted') throw new AppError('Only interrupted runs can resume. Start a new run for a failed or cancelled attempt.', 409);
      if (state.runs.some(r => r.status === 'running')) throw new AppError('Another run is active', 409);
      if (run.elapsedMs >= run.config.timeBudgetMs) throw new AppError('Original time budget is exhausted. Start a new run.');
      run.status = 'running'; run.startedAt = Date.now(); run.resumes++; run.error = null;
      return { runId };
    }, { runId });
    if (!update.duplicate) this.launch(workspaceId, runId);
    return update.state;
  }
  context(run, lane, stage) {
    const catalog = run.sources.map(s => ({ id: s.id, title: s.title, owner: s.owner, version: s.version }));
    const board = stage === 'explore' ? [] : run.messages.filter(m => m.kind === 'proposal').map(m => ({ id: m.id, from: m.from,
      summary: m.summary, claims: m.claims, challenges: m.challenges }));
    const context = { goal: run.goal, constraints: run.constraints, role: lane?.role || 'Synthesizer', stage, catalog,
      roleBrief: ROLE_BRIEFS[lane?.role || 'Synthesizer'], prior: lane?.history.slice(-1) || [], board, passages: [] };
    // Reserve room for instructions/schema. Actual provider count is the authoritative gate.
    const available = Math.max(0, run.config.inputBudget - estimateTokens(JSON.stringify(context)) - 1800);
    let selected;
    if (stage === 'synthesis') {
      const ids = new Set(run.lanes.flatMap(l => l.heldPassageIds));
      const candidates = rankPassages(passages(run.sources).filter(p => ids.has(p.id)), run.goal);
      selected = []; let size = 0;
      for (const p of candidates) { const n = estimateTokens(JSON.stringify(p)); if (size + n <= available) { selected.push(p); size += n; } }
    } else {
      selected = selectPassages(run.sources, { laneIndex: lane.index, laneCount: run.lanes.length,
        condition: run.config.condition, query: run.goal, budget: available }).selected;
      if (stage === 'review') {
        const requested = run.messages.filter(m => m.kind === 'evidence' && m.to === lane.id).flatMap(m => m.passages);
        selected = [...requested, ...selected].filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);
      }
    }
    context.passages = selected;
    // Keep transmitted evidence first. Drop low-priority sources, then old board proposals, never silently overrun.
    while (estimateTokens(JSON.stringify(context)) + 1800 > run.config.inputBudget && context.passages.length) context.passages.pop();
    while (estimateTokens(JSON.stringify(context)) + 1800 > run.config.inputBudget && context.board.length > 1) context.board.shift();
    return context;
  }
  async invoke(workspaceId, runId, laneId, stage, signal) {
    signal.throwIfAborted();
    const snapshot = this.getRun(workspaceId, runId);
    const lane = snapshot.lanes.find(l => l.id === laneId);
    const context = this.context(snapshot, lane, stage);
    const provider = this.providers[snapshot.config.mode];
    const payload = { model: snapshot.config.model, input: JSON.stringify(context), outputBudget: snapshot.config.outputBudget };
    const countStarted = Date.now();
    const count = await provider.count(payload, { signal });
    signal.throwIfAborted();
    if (count.tokens > snapshot.config.inputBudget) throw new AppError('Assembled context exceeds the per-call input budget. Increase it or shorten the goal and sources.', 400, 'context_budget');
    const requestId = uid(); const reservation = count.tokens + snapshot.config.outputBudget;
    const includedMessages = new Set([...context.board.map(m => m.id), ...snapshot.messages.filter(m => m.kind === 'evidence' && m.to === laneId && m.passages.some(p => context.passages.some(s => s.id === p.id))).map(m => m.id)]);
    this.change(workspaceId, runId, 'request.started', run => {
      if (run.status !== 'running') throw new AppError('Run is no longer active', 409, 'cancelled');
      const spent = run.usage.inputTokens + run.usage.outputTokens + run.usage.reservedTokens + run.usage.uncertainTokens;
      if (spent + reservation > run.config.totalBudget) throw new AppError('Total token budget exhausted before scheduling the next call.', 400, 'total_budget');
      run.usage.reservedTokens += reservation;
      const target = run.lanes.find(l => l.id === laneId);
      if (target) target.status = 'running';
      const request = { id: requestId, stage, baseRevision: this.store.get(workspaceId).revision, input: payload.input,
        passageIds: context.passages.map(p => p.id), messageIds: [...includedMessages], status: 'running', startedAt: Date.now(),
        inputTokens: count.tokens, countMeasured: count.measured, countMs: Date.now() - countStarted, reservation };
      (target ? target.requests : run.synthesisRequests).push(request);
      for (const message of run.messages.filter(m => includedMessages.has(m.id))) {
        message.processedBy ||= {};
        message.processedBy[laneId || 'synthesis'] ||= { requestId, at: request.startedAt };
      }
      if (target) target.heldPassageIds = [...new Set([...target.heldPassageIds, ...request.passageIds])];
      return { requestId, laneId, stage, inputTokens: count.tokens, measured: count.measured };
    });
    let response;
    try {
      response = await provider.generate(payload, { signal, inputCount: count.tokens });
      signal.throwIfAborted();
      const output = validateOutput(response.output, context.passages);
      this.change(workspaceId, runId, 'proposal.accepted', run => {
        const target = run.lanes.find(l => l.id === laneId);
        this.account(run, target, requestId, response.usage);
        if (run.status !== 'running') throw new AppError('Run cancelled before accepting output', 409, 'cancelled');
        const request = (target ? target.requests : run.synthesisRequests).find(r => r.id === requestId);
        request.status = 'completed'; request.responseId = response.responseId;
        request.acceptedRevision = this.store.get(workspaceId).revision + 1;
        // Append-only proposals are explicitly rebased; they never overwrite a peer proposal.
        request.rebased = request.baseRevision !== this.store.get(workspaceId).revision;
        if (target) { target.outputs[stage] = output; target.history.push({ stage, summary: output.summary, claims: output.claims }); target.status = 'ready'; }
        else {
          const dissent = run.messages.filter(m => m.kind === 'proposal').flatMap(m => m.challenges.map(c => ({ ...c, from: m.role })));
          run.result = { ...output, unresolved: dissent.filter((c, i, a) => a.findIndex(x => x.text === c.text) === i), createdAt: Date.now(), verification: 'Evidence references checked; semantic claims require review.' };
        }
        const at = Date.now();
        run.messages.push({ id: uid(), kind: 'proposal', stage, from: laneId || 'synthesis', role: target?.role || 'Synthesizer', to: 'all',
          summary: output.summary, claims: output.claims, challenges: output.challenges, publishedAt: at, deliveredAt: Date.now(), processedBy: {} });
        return { requestId, laneId, stage, rebased: request.rebased, rejectedCitations: output.rejectedCitations.length };
      });
    } catch (error) {
      this.change(workspaceId, runId, 'request.failed', run => {
        const target = run.lanes.find(l => l.id === laneId);
        const request = (target ? target.requests : run.synthesisRequests).find(r => r.id === requestId);
        if (request.status === 'running') {
          this.account(run, target, requestId, response?.usage || error.usage || null);
          request.status = signal.aborted ? 'cancelled' : 'failed'; request.error = error.message;
        }
        if (target) target.status = request.status;
        return { requestId, laneId, message: error.message };
      });
      throw error;
    }
  }
  account(run, lane, requestId, usage) {
    const request = (lane ? lane.requests : run.synthesisRequests).find(r => r.id === requestId);
    if (request.finishedAt) return;
    request.finishedAt = Date.now(); request.durationMs = request.finishedAt - request.startedAt;
    run.usage.reservedTokens -= request.reservation;
    if (usage) {
      request.usage = usage; run.usage.inputTokens += usage.inputTokens; run.usage.outputTokens += usage.outputTokens;
      run.usage.cachedTokens += usage.cachedTokens || 0;
    } else { request.usageUnknown = true; run.usage.unknownCalls++; run.usage.uncertainTokens += request.reservation; }
  }
  transfer(workspaceId, runId) {
    this.change(workspaceId, runId, 'evidence.delivered', run => {
      const transfers = [];
      for (const lane of run.lanes) {
        for (const query of lane.outputs.explore?.requests || []) {
          if (run.messages.some(m => m.kind === 'evidence' && m.to === lane.id && m.query === query)) continue;
          const found = retrieve(run.sources, query, lane.heldPassageIds, 1400);
          const at = Date.now();
          const message = { id: uid(), kind: 'evidence', from: 'router', role: 'Context router', to: lane.id, query,
            summary: found.length ? `Retrieved ${found.length} original passage(s) for ${lane.role}: ${query}` : `No additional passages fit the retrieval budget for: ${query}`,
            passages: found, publishedAt: at, deliveredAt: Date.now(), processedBy: {} };
          run.messages.push(message); transfers.push({ laneId: lane.id, passageIds: found.map(p => p.id) });
        }
      }
      return { transfers };
    });
  }
  async drive(workspaceId, runId, controller) {
    const initial = this.getRun(workspaceId, runId);
    const remaining = Math.max(1, initial.config.timeBudgetMs - initial.elapsedMs);
    const timer = setTimeout(() => controller.abort(new AppError('Run time budget exhausted', 408, 'time_budget')), remaining);
    try {
      for (const stage of ['explore', 'review']) {
        controller.signal.throwIfAborted();
        this.change(workspaceId, runId, 'phase.changed', run => { run.phase = stage; return { stage }; });
        const run = this.getRun(workspaceId, runId);
        const results = await Promise.allSettled(run.lanes.filter(l => !l.outputs[stage]).map(l => this.invoke(workspaceId, runId, l.id, stage, controller.signal)));
        const failed = results.find(r => r.status === 'rejected');
        if (failed) throw failed.reason;
        if (stage === 'explore') this.transfer(workspaceId, runId);
      }
      controller.signal.throwIfAborted();
      this.change(workspaceId, runId, 'phase.changed', run => { run.phase = 'synthesis'; return { stage: 'synthesis' }; });
      if (!this.getRun(workspaceId, runId).result) await this.invoke(workspaceId, runId, null, 'synthesis', controller.signal);
      controller.signal.throwIfAborted();
      this.change(workspaceId, runId, 'run.completed', run => {
        run.status = 'completed'; run.phase = 'complete'; run.finishedAt = Date.now();
        run.elapsedMs += run.finishedAt - run.startedAt; run.coverage = coverage(run);
        run.lanes.forEach(l => l.status = 'completed'); return { coverage: run.coverage };
      });
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      this.change(workspaceId, runId, 'run.stopped', run => {
        if (run.status !== 'cancelled') run.status = 'failed';
        run.finishedAt = Date.now(); run.elapsedMs += run.finishedAt - run.startedAt;
        run.error = { message: reason.message || 'Run failed', code: reason.code || 'run_failed' };
        run.lanes.forEach(l => { if (l.status === 'running' || l.status === 'ready') l.status = run.status; });
        return { status: run.status, message: run.error.message };
      });
    } finally { clearTimeout(timer); }
  }
}
