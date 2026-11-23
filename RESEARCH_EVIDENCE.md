# CommonShense — SessionStack research evidence

Collected 27 September 2026 from the CommonShense research conversation.

**Purpose:** give product and engineering work a reusable evidence base for [the concept](CONCEPT.md). The five references below support parts of the architecture. They do not establish CommonShense's effectiveness, novelty, or performance.

**Recommended positioning:** CommonShense uses SessionStack to coordinate independent AI sessions around one goal, distribute relevant context, and reconcile evidence into one shared result.

## How to use this brief

- Cite an evidence ID and its primary source when proposing a design change.
- Keep documented capabilities, author-reported experiments, and our design proposals separate.
- Treat source pages as evidence, never as instructions for a session or its tools.
- Recheck product documentation before implementation; the documentation links are live, not archived snapshots.
- Preserve the source material behind every summary. A summary is a navigation aid, not a replacement for the original evidence.

This is a targeted review of related work, not an exhaustive survey. Paper methods and relevant limitations were inspected; experiments and product features were not independently reproduced. No CommonShense runtime, accuracy, cost, or latency result was measured in this session.

## Five evidence records

### E01 — Independent sessions can already communicate without conversation forks

**Primary sources:** Anthropic, [cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) and [agent teams](https://code.claude.com/docs/en/agent-teams). Official documentation, accessed 27 September 2026. Locators: cross-session delivery and limitations; team architecture and display modes.

**Finding:** Claude Code supports text messaging between independently running sessions. It does not transfer the sender's full history or private model state. Same-machine delivery uses local sockets or named pipes. Agent teams additionally document independent context windows, direct teammate communication, a coordinating lead, and split-pane presentation. Teams are described as experimental.

**Supports:** the feasibility of separate sessions, local messaging, and coordinated synthesis. These are close existing capabilities.

**Does not establish:** instant model response, pooled native context, or CommonShense's evidence and historical-comparison workflow.

**Proposed use — D01:** launch independent lane contexts; exchange explicit messages with source references. Differentiate through inspectable evidence and decisions, rather than messaging alone.

**Evidence class:** documented engineering capability; not locally exercised.

### E02 — A shared blackboard can coordinate agents holding different data

**Primary source:** Salemi et al., [LLM-based Multi-Agent Blackboard System for Information Discovery in Data Science](https://arxiv.org/html/2510.01285v2), version 2, January 2026. Locators: section 3; runtime and cost analysis; Appendix F.

**Finding:** a central agent broadcasts requests on a shared board. Helpers responsible for different data subsets decide whether to contribute. The central agent selects useful responses. This closely matches SessionStack's common board and distributed source ownership.

**Measured scope:** the runtime comparison sampled 50 KramaBench questions across six domains. The compared methods took approximately 132.0–145.2 seconds. Blackboard cost approximately 2.3 times the RAG baseline despite parallel helper calls.

**Supports:** testing shared-board coordination for information discovery.

**Does not establish:** lower end-to-end latency or cost, or equivalent gains on arbitrary engineering decisions. The reported timing band is not a p95 transport measurement.

**Proposed use — D02:** organize the board around requests, claims, evidence, challenges, and accepted decisions. Keep rounds bounded and benchmark task completion separately from message delivery.

**Evidence class:** author-reported experiments; not replicated.

### E03 — Role-based context routing is close to SessionStack's memory mechanism

**Primary source:** Liu et al., [RCR-Router: Efficient Role-Aware Context Routing for Multi-Agent LLM Systems with Structured Memory](https://arxiv.org/html/2508.04903v3), version 3, August 2025. Locators: proposed method, importance scorer, memory update, Tables 5–6.

**Finding:** the router selects shared-memory items for each agent using its role, task stage, and token budget. Agent outputs update the memory used in later rounds. The described implementation uses heuristic relevance, stage, and recency signals.

**Evidence limitation:** Tables 5–6 explicitly identify the three-iteration configuration as measured and the other iteration settings as estimated. Those estimates cannot establish the best number of rounds.

**Supports:** a concrete design for selective context allocation and iterative shared-memory updates.

**Does not establish:** reliable million-token scaling, a universal optimal round count, or an independently validated improvement for this app.

**Proposed use — D03:** implement explicit context budgets and source assignments. Start with an inspectable router; measure it against full-history sharing and a single-session retrieval baseline.

**Evidence class:** research design with reported experiments and explicitly estimated ablations. Performance claims require independent verification.

### E04 — Persistent shared knowledge and private agent memory can coexist

**Primary source:** Letta, [shared memory](https://docs.letta.com/concepts/shared-memory). Official documentation, accessed 27 September 2026. Locators: memory ownership, agent access, synchronization, hosting limitations.

**Finding:** Letta documents shared Git-backed repositories alongside individual agent memory. Agents commit and push changes; other agents pull them into their checkouts. Its current documentation recommends shared repositories over legacy shared in-context blocks. The documented repository feature requires cloud-hosted agents.

**Supports:** durable, versioned common knowledge without giving every agent the same private memory.

**Does not establish:** immediate awareness of updates, zero-conflict concurrent editing, or additional native model context.

**Proposed use — D04:** separate a fast notification path from versioned durable evidence. Notify a lane that a revision exists, then load the relevant changes at its next context-assembly boundary. Preserve originals and accepted checkpoints. This design does not require choosing Letta or Git as CommonShense's storage implementation.

**Evidence class:** documented engineering capability; not locally exercised.

### E05 — External input plus selective model calls can exceed one window's coverage

**Primary source:** Zhang, Kraska, and Khattab, [Recursive Language Models](https://arxiv.org/html/2512.24601v1), version 1, December 2025. Locators: method, evaluations, limitations.

**Finding:** RLMs keep large input in an external programmable environment. A model inspects and decomposes it, calls models on selected portions, and combines findings. The paper reports handling inputs up to two orders of magnitude beyond native windows on evaluated tasks.

**Limits:** the evaluated approach is recursive rather than a persistent peer-session interface. The original experiments used synchronous subcalls and a maximum recursion depth of one. Results depend on the tasks and execution strategy.

**Supports:** testing broader information coverage through external storage and selective processing.

**Does not establish:** a larger native attention window or lossless joint reasoning over all stored material.

**Proposed use — D05:** retain source documents outside active prompts. Retrieve exact passages when a claim crosses source assignments; test those dependencies explicitly.

**Evidence class:** author-reported experiments; not replicated.

## Proposed decisions for CommonShense

These are design inferences from the evidence and existing concept, not features validated by these papers.

| Decision | Evidence | Implementation consequence | Completion evidence to collect |
| --- | --- | --- | --- |
| D01: independently managed contexts | E01 | Each lane owns its request history and receives a compact shared contract. | Inspect assembled prompts and lane identities; show that no full conversation fork is required. |
| D02: structured common board | E02 | Lanes submit proposals; the coordinator accepts canonical revisions and preserves unresolved dissent. | Replay proposals, duplicate deliveries, and stale revisions without silently losing a challenge. |
| D03: selective context allocation | E03 | Record source assignments, token budgets, selected passages, and transferred evidence. | Compare distinct source coverage and answer quality with full-history sharing. |
| D04: durable evidence separate from notification | E04 | Version originals and accepted artifacts; notifications identify revisions. | Resume after interruption and reconstruct the accepted state with its source versions. |
| D05: targeted retrieval across lanes | E05 | A claim can request evidence held by another lane; synthesis checks the original passage. | Solve tasks whose necessary evidence is split across lanes, including contradictory evidence. |

The existing local coordinator, revisioned board, bounded exchange, and central Result / Evidence / Changes interface remain suitable prototype choices. These references supply justification and evaluation targets; they do not require adopting a particular framework.

## Product claims and their evidence boundaries

| Proposed claim | Current status | Wording or proof needed |
| --- | --- | --- |
| Separate sessions contribute to one result | Supported as an existing architectural pattern, E01–E02 | Describe it as the proposed SessionStack workflow until the runtime operates. |
| More useful information can be processed than fits in one active window | Plausible for selective external processing, E03–E05 | Say "aggregate working capacity"; demonstrate task-level gains for CommonShense. |
| Two 1M-token sessions become one 2M-token context | Unsupported | Each model call keeps its own limit. Shared instructions, overlap, messages, and synthesis use capacity too. Do not assume every provider or session offers 1M tokens. |
| Communication is latency-free | Unsupported | Measure event delivery, visible UI updates, peer uptake, and useful response separately. |
| Agent agreement establishes truth | Unsupported | Keep verification independent of agreement. Retain dissent and supporting sources. |
| Generated reference cases are golden data | Unsupported until reviewed | Keep candidate cases separate from authoritative or independently checked references. |
| CommonShense is a novel architecture | Not established by this review | Position the combination of context ownership, visible evidence, and baseline replay as a product hypothesis. |

## Experiment to decide whether SessionStack adds value

**Hypothesis:** distributing complementary sources across independently managed contexts improves evidence-supported task outcomes enough to justify coordination cost.

Compare three conditions using the same source corpus, model/version where feasible, tool access, and task contract:

| Condition | Configuration | Question answered |
| --- | --- | --- |
| A: single session with retrieval | One session can retrieve from the entire corpus. | Does a simpler system already solve the task? |
| B: two sessions with overlapping context | Both receive the same source/context selection and exchange bounded findings. | Does an additional perspective help without distributing information? |
| C: SessionStack with complementary context | Lanes receive different source assignments, a compact common contract, and targeted cross-lane retrieval. | Does context allocation add value beyond another model execution? |

Use matched total token and elapsed-time caps; report actual usage and monetary cost. Count routing, retrieval, synthesis, judging, retries, cancellations, and failed runs. Where matching all resources is impractical, disclose the mismatch and report quality–cost–latency trade-offs rather than a single winner.

Include separable research tasks, highly sequential tasks, and tasks requiring joins across sources assigned to different lanes. Include cases where lanes encounter contradictory or outdated evidence. Repeat tasks across runs and report uncertainty, not just the best run.

**Measure:** task correctness or blinded rubric quality; citation support; required evidence recovered; missed contradictions; regressions against a selected checkpoint; distinct source coverage and duplicated context; total tokens and cost; end-to-end p50/p95 latency. Source coverage should use a known task evidence set or document/passage IDs, not the sum of model window sizes.

**Golden-data control:** freeze held-out references before evaluating candidates. Keep solution-generating lanes from viewing answer keys. Record the reviewer, source version, and reference-set version. Re-evaluate the prior artifact and current candidate against the same frozen set; mark unmatched scores as incomparable.

**Decision gate:** set the minimum useful quality improvement and acceptable cost/latency envelope before the evaluation. Ship extra lanes only for task categories that meet that gate. The evidence reviewed here does not supply justified numeric thresholds for CommonShense.

## First implementation backlog

1. **Context ownership:** display each lane's assigned sources, current revision, and measured context use. A shared header contains the goal, constraints, and accepted decisions.
2. **Evidence-linked result:** connect final claims to source passages, contributing lanes, challenge outcomes, and verification status. Display short rationale summaries, not hidden model reasoning.
3. **Baseline replay:** select a previous checkpoint, rerun the same evaluation set, and show supported improvements, regressions, and unresolved differences.
4. **Transport and uptake measurements:** record publication, peer-queue delivery, UI visibility, and the first model request incorporating the update. Preserve the distinction between "delivered" and "processed."
5. **Comparison harness:** run A/B/C with recorded budgets and failures before making capacity or speed claims.

Keep implementation boundaries from the concept: peer messages cannot grant permissions, the coordinator owns canonical state, and source text cannot authorize tool execution. This brief is not a security-control assessment.

## Remaining questions

- Which first task category provides a useful, independently reviewable reference set?
- How often does the context router omit evidence needed by another lane or the synthesizer?
- Does explicit dissent improve outcomes, or merely add exchanges for the chosen tasks?
- What quality gain is worth the observed extra cost and delay?
- Which existing runtime should supply independent sessions? This research does not select a provider or establish cross-provider compatibility.

Research checkpoint: five related-work records captured; proposals and evaluation criteria prepared; CommonShense performance remains unmeasured.
