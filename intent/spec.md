# Spec: SessionStack local prototype

Author: Codex. Implements the user-authorized concept and evidence brief.

## Requirements
1. D01/E01: two to four independently assembled lane contexts; single-session and overlapping-context controls; no full conversation fork.
2. D02/E02: one canonical SQLite writer with revision checks, idempotent commands, persisted events, unresolved challenges, and bounded rounds.
3. D03/E03: source ownership, exact passage IDs, inspectable selections, per-call input budgets, provider-measured input counts in live mode, labeled estimates in demo mode.
4. D04/E04: persist originals, run records, accepted checkpoints and event history; recover interrupted runs at an explicit resume boundary.
5. D05/E05: targeted requests retrieve exact passages from another lane's source assignment. Synthesis can cite only passages it actually received.
6. Central Result/Evidence/Changes views; left Builder and right Challenger; additional lane cards; one goal and run/cancel control.
7. Candidate evaluation cases can be frozen by a named reviewer. Answer keys never enter model requests. Re-evaluate a selected checkpoint and current result with one frozen set; disclose source/goal changes.
8. Record measured input/output usage, per-request timings, publication/delivery/uptake timestamps, UI render acknowledgements, corpus coverage and duplication. Unknown cost remains unknown.
9. A/B/C harness uses the same source corpus, model and maximum total token/time caps; all failures and actual usage retained. Demo results exercise plumbing only.

## Design
Node 24+ built-ins, SQLite, native HTTP + SSE, and plain browser modules. No package installation or cloud services needed for local use. Responses API is optional, with strict structured output, preflight token counting, timeout/cancellation and output validation. Offline provider is a deterministic extractive demo, not an LLM.

## Policy conformance
Localhost binding, Host/Origin and per-process request-token checks, bounded input, restricted static-file serving, text-only source ingestion, escaped UI rendering, no executable model tools. Models propose data; only the coordinator mutates canonical state. The referenced sentinel MCP skill is not part of this runtime: no MCP tools or dynamically registered third-party tools are exposed.

## Limits
This prototype is single-user and local. Semantic citation truth is not inferred from valid citation IDs. Reference checks are explicit lexical/citation checks, not an independent LLM judge. Hosting, hardened images, SBOM/signing/admission and immutable external audit storage belong to a separately reviewed deployment, not this local process.
