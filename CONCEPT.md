# CommonShense — A way to share your Agentic AI sessions

Research and product proposal · 27 September 2026

Status: implemented as a local prototype in this directory. See [README](README.md) for startup and scope, and [validation](VALIDATION.md) for tested behavior and remaining limits. The earlier interface sketch remains a scripted concept artifact. The app has an offline demo provider and an optional live OpenAI adapter; it does not attach to existing Codex or Claude chats.

Related-work evidence and implementation implications: [SessionStack research evidence](RESEARCH_EVIDENCE.md). The follow-up brief records five close precedents, source limitations, proposed decisions, and a comparison plan. None of its external results is a measured CommonShense result.

## Product definition

CommonShense uses **SessionStack** to coordinate two or more separately invoked model sessions toward one shared idea or goal. The user keeps one prompt, one source collection, one decision history, and one final artifact. Each session has its own bounded context and assigned material, but references the same canonical workspace. Adding a session does not require forking the user conversation or copying its full transcript.

Independent lanes still require separate model executions. A shared database does not eliminate model input tokens, inference time, or the need to assemble each lane's context. UI sessions, model contexts, and operating-system processes are separate concepts; this proposal avoids conversation forks, not computation.

The left lane develops an approach. The right lane independently explores alternatives, builds evaluation cases, and compares against a selected previous result. Both exchange concise, inspectable proposals and evidence. The central foreground window assembles the current recommendation, supporting sources, verified checks, changes, and unresolved objections.

## SessionStack — separate contexts, one shared goal

**App:** CommonShense. **Coordination concept:** SessionStack.

SessionStack expands the system's aggregate working capacity by distributing relevant information across independent model sessions. It does not increase any individual model's native context window. Two panels using one underlying model context do not provide this benefit; the sessions must have independently managed model contexts.

The coordinator gives every session the same compact goal, constraints, and accepted decisions, then assigns different source material. For example, one session holds the current implementation and discussion while another holds historical sessions, research, and reference cases. Shared facts may overlap where needed, but duplicating the entire transcript in every session adds little distinct coverage.

Each session publishes concise findings, challenges, and source references to a shared board. When a conclusion depends on material owned by another session, the coordinator routes a targeted question or retrieves the original passage. Any transferred material still consumes the receiver's context. Updates become usable when the receiver processes them; fast delivery alone does not merge model state.

Persistent storage keeps full transcripts, sources, and versioned artifacts beyond the active windows. Retrieval and checkpoints let later turns recover relevant material, subject to retrieval quality and available context. Summaries can omit details, so retain original evidence and resolve cross-session dependencies explicitly.

The final synthesis operates within its own context limit and draws on selected evidence from the stack. It must preserve unresolved conflicts. More sessions add model calls, duplicated instructions, coordination cost, and possible latency; larger aggregate capacity is useful only if task quality justifies these costs.

Product description: **SessionStack lets separate AI sessions share a goal, divide the context, and contribute to one result.** The implemented prototype assembles independent contexts, exchanges explicit proposals and original passages, and synthesizes a common result. Live calls remain subject to provider access and quota.

## Interaction from the first prompt

1. **Agree on the job.** Extract the goal, constraints, deliverable, source boundaries, and acceptance criteria into a shared prompt contract. The user can correct it once for all lanes.
2. **Explore independently.** The Builder proposes a solution while the Challenger develops alternatives and checks. Share the prompt, sources, and clarification requests immediately, but briefly withhold first candidate answers to reduce anchoring. Offer a continuous-exchange mode for tasks where shared discoveries matter more.
3. **Exchange evidence.** Publish compact claim, evidence, challenge, test-result, and proposal events. Messages point to source and artifact IDs instead of repeatedly copying full histories. Show short rationale summaries, not an expectation of access to hidden model reasoning.
4. **Resolve a bounded set of disagreements.** Each challenge identifies the claim, evidence needed, and criterion for resolution. Allow one rebuttal and one revision by default. Stop when acceptance criteria pass, the agreed budget is exhausted, or a material disagreement requires the user.
5. **Verify and compose.** A deterministic check layer and a synthesis pass produce the central result. The synthesis pass may reuse a lane/model; it need not be a third permanent agent. Agreement alone never marks a claim verified.
6. **Preserve a checkpoint.** Store the final artifact, evidence versions, evaluation version, known limitations, and decisions. A future session can explicitly select that checkpoint as a baseline.

## Interface

- **Left, slightly behind:** Builder — candidate approach, assumptions, updates in response to challenges.
- **Right, slightly behind:** Challenger — alternatives, counterexamples, baseline comparisons, candidate evaluation cases.
- **Center, foreground:** shared Result / Evidence / Changes tabs. The result remains the visual priority. Keep panel contents readable despite the layered edges.
- **Below the panels:** compact shared discussion with attributable messages and links to the affected claims.
- **One composer:** address all lanes by default; optionally address one lane or a single disputed claim.
- **More than two lanes:** add a named specialist to a perspective rail; expand only the selected specialist. Avoid shrinking every session into an unreadable column.
- **One pause/cancel:** stops further model scheduling across the workspace and flags incomplete work.

The accompanying inline sketch demonstrates three scripted phases: Explore, Challenge, and Align. Its example comparison refers to an illustrative previous result, not an actual earlier user session.

## Research translated into product decisions

### Debate can help, under particular conditions

Du et al. report improvements from multiple model instances proposing and debating responses on their studied reasoning and factuality tasks. This supports testing the concept, not assuming every extra session helps. [Improving Factuality and Reasoning in Language Models through Multiagent Debate, 2023](https://arxiv.org/abs/2305.14325).

### Unstructured agreement can make the answer worse

Bertalanič and Fortuna study homogeneous 7–8B model teams and find conformity, disruption of correct reasoning, and loss of correct candidates through voting. In their tested configurations, debate used 2.1–3.4 times more tokens than isolated self-correction for equal or lower accuracy. This does not establish that all two-agent or heterogeneous systems fail. CommonShense should use independent first passes, explicit challenge roles, and evidence-based acceptance. [The Cost of Consensus, 2026](https://arxiv.org/abs/2605.00914).

### The shared board is a credible foundation

Salemi et al. use a central blackboard where agents volunteer responses to posted requests, evaluated on data-discovery tasks. CommonShense can borrow the shared-board interaction model while using simpler fixed roles for its initial two-lane version. The paper's results do not establish gains for this proposed app. [LLM-Based Multi-Agent Blackboard System for Information Discovery in Data Science, revised 2026](https://arxiv.org/abs/2510.01285).

### Coordination quality matters more than agent count

The current v3 of Kim et al. evaluates 260 configurations over six benchmarks and reports task-dependent benefits and degradations. Use this to motivate an adaptive lane budget: parallelize separable research and validation; retain a single lane for highly sequential work. [Towards a Science of Scaling Agent Systems, revised April 2026](https://arxiv.org/abs/2512.08296v3).

### Failure handling must be part of the workflow

MAST identifies 14 failure modes in system design, inter-agent alignment, and verification. CommonShense should make roles, ownership, stale context, verification status, and stopping rules explicit. [Why Do Multi-Agent LLM Systems Fail?, 2025](https://arxiv.org/abs/2503.13657v3).

### Agent conversation already exists; the product opportunity is elsewhere

AutoGen provides infrastructure for configurable multi-agent conversations. CommonShense's proposed differentiation is the user-facing combination of one canonical conversation, independent perspectives, visible evidence, historical comparison, and a single inspectable result. This is a positioning hypothesis, not a novelty or market-clearance claim. [AutoGen, 2023](https://arxiv.org/abs/2308.08155).

### Latent communication is a later research track

Latent Cache Flow translates and compresses KV caches between models and reports 8.5× faster communication in its early experiments. That is a specific communication result, not an end-to-end CommonShense performance estimate. [Latent Cache Flow, revised June 2026](https://arxiv.org/abs/2605.22863v2).

A later causal audit finds that benchmark gains alone do not demonstrate useful example-specific information transfer. Any experiment here should include mismatched-cache controls. [When Does Latent Communication Pay?, August 2026](https://arxiv.org/abs/2608.04893v2).

A survey organizes approaches by representation, sender/receiver alignment, and integration mechanism, with unresolved compatibility and security challenges. Treat KV or hidden-state sharing as an experimental feature requiring explicit runtime support, rather than assuming arbitrary hosted chat APIs expose it. [Beyond tokens, revised July 2026](https://arxiv.org/abs/2606.05711v3).

The findings summarized above were originally drawn from retrieved paper abstracts and metadata. The [follow-up evidence review](RESEARCH_EVIDENCE.md) additionally inspects selected paper methods, limitations, and official engineering documentation: independent-session messaging, shared blackboards, role-based context routing, durable shared memory, and recursive external-context processing. Neither review independently replicates results or constitutes a systematic literature review. Product choices are design inferences.

## Golden data and comparison with previous sessions

The Challenger creates **candidate reference cases**, not automatic ground truth. Each case contains the input, expected behavior, evidence/source, reviewer, status, and reference-set version. Separate machine-generated candidates from independently verified references.

Promote a candidate only when an authoritative source, executable check, or appropriate human review supports it. Keep a frozen held-out set that the current solution-generating lanes cannot inspect. Cases authored after seeing the current answer belong to exploratory testing, not an unbiased headline score.

For an earlier session, select a baseline artifact explicitly and record its task contract, source snapshot, model settings, and reference-set version. Report new claims, removed claims, changed recommendations, fixed failures, regressions, and unresolved differences. Re-evaluate both versions on the same set when possible; otherwise mark their scores as not directly comparable. Distinguish newly outdated facts from mistakes at the time of the earlier session.

For open-ended decisions, use a rubric and evidence review; a single golden answer may not exist.

## Proposed runtime and communication

Start with a local coordinator, typed event bus, embedded durable storage, two model adapters, and a responsive interface. A desktop wrapper can follow once the interaction earns its complexity.

One workspace owns the prompt contract, source references, lane views, event log, evaluations, and artifact revisions. The coordinator is the only writer of canonical state. Lanes submit proposals against a workspace revision; stale proposals are reconciled or rerun before acceptance. Each event has a unique ID, workspace ID, lane ID, sequence, base revision, type, claim/source references, and bounded payload.

Use in-process publish/subscribe within one runtime, or local IPC when isolation requires separate processes. Stream accepted board changes to the UI. Persist canonical updates before acknowledging them as durable; an optimistic preview must be labeled pending. Duplicate events are idempotent, retries preserve their IDs, and reconnecting views resume from their acknowledged sequence. Batch low-priority updates and cap queue and message sizes.

Each model request consumes an immutable snapshot plus selected deltas. A message arriving during generation can immediately update the UI, but should affect the lane at its next scheduling boundary unless the adapter explicitly supports interruption and replanning. Cancellation and discarded work count toward cost.

Use A2A only when integrating genuinely remote or external agents. Its specification supplies discovery, task lifecycle, messages, artifacts, and streaming; it does not grant access to another product's private model memory. [A2A specification](https://a2a-protocol.org/dev/specification/).

### What “fast” means

Measure three separate delays: event publication to peer queue, publication to visible UI, and publication to a useful model response. A proposed first acceptance target is p95 accepted-event-to-visible-UI below 50 ms on a stated local machine/load. This is an unmeasured target; it excludes inference, tool calls, and remote networks. End-to-end completion must be reported independently.

The practical speed levers are parallel independent work, shorter structured exchanges, retrieving only relevant deltas, bounded rounds, and reusing provider-supported prompt prefixes. Shared storage and caching never imply free inference.

## Product ideas worth prioritizing

1. **Disagreement ledger:** every unresolved objection stays attached to a claim until evidence closes it; the center can show a recommendation with qualified dissent.
2. **Reference-set workbench:** create, review, freeze, version, and reuse evaluation cases across sessions.
3. **Decision history:** click a sentence in the final output to see which evidence and challenge changed it.
4. **Baseline replay:** compare a new approach against an earlier saved result under the same evaluation conditions.
5. **On-demand specialist:** bring in another perspective only for an unresolved question and release it when its contribution is captured.
6. **Communication budget:** expose whether the next exchange is expected to add evidence, resolve a conflict, or merely repeat existing agreement; enforce hard token, time, and round limits.

Prioritize the first four for an engineering decision-review workflow. They are concrete features that help a user judge the result.

## MVP and evaluation gate

**Slice 1 — reviewable interaction:** one shared prompt; two perspectives; three-phase exchange; central result; explicit evidence states; illustrative historical comparison. Current deliverable is a scripted sketch of this slice.

**Slice 2 — functioning runtime:** concurrent model calls, bounded coordinator, revisioned board, streaming updates, cancellation, durable resume, source provenance, and an explicitly selected saved baseline. Verify duplicate delivery, stale writes, failed lanes, and budget exhaustion.

**Slice 3 — prove the value:** curated references, frozen evaluation splits, baseline replay, and optional specialist lanes. Compare single-agent direct answers, single-agent self-correction, independent proposals with selection, and CommonShense with the same total token/time caps. Count coordinator and judge costs, failures, retries, and cancellations.

For the specific aggregate-capacity claim, also compare a single session with retrieval, two sessions with overlapping context, and SessionStack with complementary source assignments under matched total token/time caps. Include tasks requiring evidence from both lanes and contradictory sources; track distinct evidence coverage and duplicated context. The [evidence brief](RESEARCH_EVIDENCE.md#experiment-to-decide-whether-sessionstack-adds-value) defines this comparison and its decision gate.

Measure task correctness, factual support, regression rate, useful disagreements resolved, end-to-end p50/p95 latency, and actual usage cost. Stratify sequential versus decomposable tasks. Use randomized blinded evaluation where feasible and confidence intervals. Reject extra complexity if the quality improvement does not justify its observed delay and cost.

## Agent boundaries for implementation

Peer content and retrieved pages are evidence, not authority to change instructions. Each lane gets an explicit tool contract; the host enforces allowed actions and tenant/workspace boundaries. The canonical-state writer and any tool executor must be separate from untrusted proposal text. Record the decision and provenance of privileged actions. A runtime classifier may grade M0–M4 as defense in depth, but is not a substitute for deterministic permissions or a reason to claim the system is safe.

For a deployed service: pinned minimal images, dependency inventory and vulnerability scanning, signed artifacts and build provenance, separate least-privilege identities, controlled egress, and immutable privileged-action audit storage. These are implementation constraints; this exploration provisions no infrastructure.

## Decisions still open

- Standalone app versus connectors into existing chat tools; the current assumption is standalone.
- First model providers and whether cross-provider data sharing is acceptable.
- First evaluation domain and who can approve reference cases.
- Local-only persistence versus multi-device collaboration.

Product tagline: **“A way to share your Agentic AI sessions.”**

Product description: CommonShense gives one conversation multiple independent perspectives and an evidence-backed result you can inspect.
