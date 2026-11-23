# CommonShense validation

27 September 2026 · local prototype

## Verified

- **21 automated tests passed** on Node 26.3.1; 14 JavaScript modules passed syntax checking. The preceding 19-test suite also passed on the bundled Node 24.19.0 runtime. The final two additions cover explicit timeout reasons and malformed provider usage.
- Store tests cover revision conflicts, idempotency fingerprint conflicts, rollback, subscriber failure isolation, disk persistence and ordered event replay.
- Coordinator tests cover isolated exploration inputs, peer review, exact original passage retrieval, held-out answer-key exclusion, one/two/four-session execution, concurrent token reservations, oversized input rejection, cancellation, failed attempts, timeouts, and recovery from a snapshot containing interrupted requests.
- Provider tests cover full-request token counting, structured response payloads, independent calls without `previous_response_id`, disabled API response storage, billable incomplete outputs, sanitized failures and malformed usage.
- HTTP tests cover Host/Origin/request-token checks, cross-site rejection, malformed JSON values, static-file boundaries, source ID collision prevention, frozen reference checks, checkpoints, comparisons, exports, request inspection and SSE reconnect replay.
- Browser verification completed a two-session demo run, opened a citation's original source, displayed measured/estimated labels and request timings, saved “First demo baseline”, and reloaded the persisted result. Desktop three-panel layout was inspected. A 390px mobile viewport showed the central result first and exposed source/reference/history navigation; document content width matched the viewport (375px excluding scrollbar). No horizontal overflow was observed in that checked view.
- The browser's captured error/warning log was empty for the inspected tab after this flow. This is a scoped browser observation, not a claim about every path or browser.

## A/B/C harness

One offline trial completed for each control under the same 80,000-token maximum and 120-second wall-time cap. Demo delay was disabled for this plumbing test:

| Condition | Status | Estimated input | Estimated output | Distinct passages |
| --- | --- | ---: | ---: | ---: |
| A: single session | completed | 13,811 | 1,830 | 9 / 9 |
| B: overlapping contexts | completed | 25,110 | 3,031 | 9 / 9 |
| C: complementary SessionStack | completed | 20,785 | 2,979 | 9 / 9 |

This small corpus fits the tested budgets, so it does not demonstrate increased capacity. Demo tokens are byte-based estimates and outputs are extracts. No frozen independent reference set was supplied to this harness; no quality score was computed. These numbers provide **no evidence of model-quality improvement or superior real-world latency**.

The local report is `artifacts/evaluation-demo-1790492255441.json` (gitignored).

## Live-provider limitation

A bounded live two-session smoke test used `gpt-4.1-mini` and the five public evidence records. Both exploration inputs reached the provider token-count endpoint. The generation stage returned **HTTP 429**; no live result was accepted and the run stopped. The error response does not establish whether the cause was quota, account limits or rate limiting. No automatic retries were made.

The run retained **6,750 uncertain reserved tokens across two attempted generation calls**. These are conservative budget reservations, **not a measured bill or 6,750 consumed tokens**. A completed live model synthesis remains unverified until provider access permits it. The local report is `artifacts/live-smoke.json` (gitignored).

## Remaining limits

- Logical local enqueue timing is distinct from browser render acknowledgment and inclusion in a later model request. None proves zero latency or successful semantic uptake.
- Frozen phrase/citation checks are reproducible regression checks, not independent factual judgment or a validated gold dataset.
- Recovery tests simulate an in-flight snapshot; they do not certify power-loss behavior across all filesystems or operating systems.
- This is one local user's app, not existing-chat integration, a multi-user hosted service, a model context-window extension, or a production deployment.
- OpenAI is the only live adapter. The source router uses explicit ownership plus lexical relevance; it is not an embedding index or a model-learned router.
- No claim of pooled native attention, a 1M-per-session guarantee, or a context multiplier is made.
