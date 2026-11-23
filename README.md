# CommonShense

**A way to share your Agentic AI sessions.**

CommonShense implements **SessionStack**: two to four independently assembled model contexts work toward one shared goal. A Builder and Challenger sit behind a central result. Each starts with assigned sources, publishes a proposal, reviews peer evidence, and contributes to synthesis. Additional sessions take Evaluator and Alternative roles.

This is a local, single-user prototype. It implements the decisions in [RESEARCH_EVIDENCE.md](RESEARCH_EVIDENCE.md); it does not attach to existing Codex/Claude chats or combine their hidden state. Offline mode is a clearly labeled deterministic demo. Live mode uses separate OpenAI Responses API calls with independently assembled inputs.

## Run

Requires **Node 24+** with `node:sqlite`. No third-party packages or package install are needed.

```sh
cd sessionshare
nvm use
npm start
```

Open **http://127.0.0.1:4317**. If `nvm` is not loaded, load your nvm shell initialization first, or invoke a Node 24+ executable directly with `node server.mjs`. `.nvmrc` selects the installed Node 26.3.1 runtime used during development. A Node 18 default shell will fail because it has no built-in SQLite module.

The server seeds five original evidence records from `RESEARCH_EVIDENCE.md` on first startup. Runs, source versions, messages, and checkpoints persist in `data/commonshense.sqlite`. Export the workspace from the sidebar; exports include source text, assembled prompts, results, and events, so treat them as your task data. The app does not currently import workspace exports.

To start a separate workspace while retaining the old one, set `COMMONSHENSE_DB=data/another-workspace.sqlite` and restart.

For live mode, put your own settings in a local `.env` file using `.env.example` as the template, or supply environment variables:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4.1-mini
PORT=4317
```

Restart, then choose **Live · OpenAI**. The key stays on the server. Selected source text, goals, and peer proposals go to OpenAI. Model outputs use `store: false`; that is an API response-storage setting, not a guarantee about all provider retention policies. App data remains in local SQLite. The live smoke test on 27 September 2026 reached token counting but generation returned HTTP 429; a completed live synthesis has not yet been verified on this machine.

## Use the workspace

1. **Edit goal** to set the common prompt and constraints.
2. **Source library** accepts pasted text or local `.txt` / `.md` files. Assign sources to a session or share them. Original source text is immutable; add a new source for a revised version. Source owners 3–4 wrap to an available session when running with fewer sessions.
3. Choose a strategy: **A · Single session** retrieves across all sources; **B · Overlapping** gives sessions the same ranked source pool; **C · SessionStack** routes complementary source ownership. These labels describe experimental controls, not quality rankings.
4. **Budgets** sets the model, per-call input/output limits, total token cap and wall-time cap. A two-session run schedules five generation calls: two exploration, two review, one synthesis. The single-session control schedules three. Four sessions schedule nine.
5. Run, then inspect **Result**, **Evidence**, **Changes**, and **Metrics**. The board shows proposed summaries, evidence transfers, and which later request includes an update. Click a citation for the original source, or **Inspect exact request** for the actual assembled input.
6. Save a completed result as a **checkpoint**. Review or create a reference set, then freeze it under a reviewer name. Complete a new run and use **Changes** to evaluate it or compare both results against the same frozen set.

Candidate cases are not golden truth. Freezing records a review decision and source versions; it is not authentication or independent fact verification. Checks match explicit required/prohibited phrases and source IDs. Reference answer keys stay out of model inputs. Changed source versions, goal, model or budgets flag a comparison as diagnostic instead of matched.

## Architecture and research mapping

```text
                    Shared goal + constraints
                              |
                 ownership / budget context router
                    /                     \
            Builder context         Challenger context
                    \                     /
                  proposals + evidence requests
                              |
               revisioned SQLite board + SSE updates
                              |
                  review with original passages
                              |
                     bounded synthesis
                              |
                     central shared result
```

| Research decision | Implementation |
| --- | --- |
| D01 / E01: independent contexts | Separate role, history and source selection per lane; no `previous_response_id` or conversation fork. |
| D02 / E02: shared blackboard | One canonical writer, optimistic revision checks, idempotent commands, ordered durable events, preserved dissent. |
| D03 / E03: selective routing | Source ownership and lexical relevance under a context budget; exact source-version and passage IDs. |
| D04 / E04: durable memory | SQLite sources, runs and checkpoints survive restart; SSE reconnect replays missed events. |
| D05 / E05: cross-context lookup | Targeted requests retrieve original passages outside the lane's initial selection. Synthesis can cite only passages actually in its input. |

`src/engine.mjs` coordinates bounded explore → review → synthesis rounds. `src/router.mjs` selects exact passages; `src/providers.mjs` provides deterministic demo and live adapters. `src/store.mjs` owns transactions and event ordering. `src/evaluation.mjs` replays frozen checks. `server.mjs` serves the API and browser UI.

The native HTTP process uses an in-process board and SSE to the browser; there is no external broker. A fast queue does not make an in-flight model instantly aware of new information. Updates enter a model at the next request boundary. Initial exploration requests contain no peer proposals. Reviews can contain bounded peer proposals and requested originals, not complete peer transcripts. Each run snapshots its goal and sources, so later edits do not rewrite history.

## Budgets, recovery and measurements

- Routing uses a deliberately labeled byte-based token estimate. Live mode calls the provider's input-token endpoint with the actual instructions, input and output schema before scheduling generation. Inputs beyond the chosen cap fail explicitly.
- The coordinator atomically reserves counted input plus maximum output before each concurrent call. A total cap is a maximum, not an equal-spend guarantee. Generation failures retain reported usage; interrupted attempts without usage retain conservative reservations as **uncertain tokens**. There are no automatic retries.
- Cancellation prevents later result acceptance. An abrupt server restart marks active runs **interrupted**. Explicit resume keeps completed stages and original budgets, and retries only unfinished stages. Downtime counts toward the original wall-time budget. A graceful shutdown cancels active provider requests and marks that run failed; start another run afterward.
- Token counts are provider-reported for live completions and estimated for demo. Set `INPUT_USD_PER_MILLION` and `OUTPUT_USD_PER_MILLION` for a conservative cost estimate before cache discounts. Unknown rates or usage remain unknown.
- Local enqueue timestamps have millisecond clock resolution. They measure logical queuing inside this process, not physical network latency. Render acknowledgments include persistence, browser rendering, and the return trip; they sample debounced updates, not every event. “Included in request” measures input inclusion, not confirmed model understanding.
- Source coverage measures distinct original passages included across lane requests, not retained attention or semantic recall. Adding sessions can increase aggregate working coverage; it does **not** turn two model windows into a single larger native window. More sessions can cost more and take longer.

## Verify and compare

```sh
npm run check
npm test
npm run evaluate
# Real provider calls and usage; opt in explicitly:
npm run evaluate -- --live --repeats=3
# Optional standalone frozen reference-set JSON from a workspace export:
npm run evaluate -- --references=/path/to/frozen-reference-set.json
```

The A/B/C harness uses the same seeded corpus, goal, model and maximum token/time caps. It rotates condition order across repetitions, includes failed runs, preserves usage uncertainty, and writes `artifacts/evaluation-*.json`. Without a frozen reference set it emits no quality score. Demo timings and estimates only exercise plumbing. Small samples and phrase checks cannot establish accuracy, superiority or a context multiplier. See [VALIDATION.md](VALIDATION.md).

## Local boundaries

The server binds only to `127.0.0.1`, validates Host/Origin, rejects cross-site requests, and requires a per-process request token for mutations. The browser renders source/model text with `textContent`, uses a restrictive CSP, and receives no API key. Models have no executable tools, shell access, or permission-changing capabilities. Source and peer content is treated as untrusted data.

Limits: one local workspace, 20 sources, 120,000 characters per source, 100 runs, 30 reference sets, bounded rounds. The app is not a multi-user hosted service and has no remote authentication. Do not expose it through a public tunnel. Runtime data and exports can contain task information; they are intentionally excluded from Git. A hosted product would need separate authentication, tenant isolation, retention, deployment and supply-chain review.

Protocol references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [input token counting](https://developers.openai.com/api/docs/guides/token-counting), and [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create). The five research precedents and their limitations are recorded in [RESEARCH_EVIDENCE.md](RESEARCH_EVIDENCE.md).
