# Plan: SessionStack implementation

## Files that change
New server.mjs, src/{store,router,providers,engine,evaluation,seed}.mjs, public/{index.html,app.js,styles.css}, scripts/{check,evaluate}.mjs, test/*.test.mjs, README.md, .env.example, package.json. Preserve research originals; update concept status after verification.

## Order of work
1. Persist the accepted concept and evidence with this implementation plan.
2. Build revisioned storage, passage routing, independent provider calls and bounded coordination.
3. Add HTTP/SSE routes and the layered workspace UI, source editing, reference review, checkpoints and comparison.
4. Exercise failure paths and isolation with Node tests; run the A/B/C demo harness.
5. Inspect the app in a browser and exercise a small live-provider smoke test when available. Document actual results and limitations.

## Risks
Stale writes, late responses after cancellation, evidence omitted by routing, unverified citation support, interrupted usage accounting, context overflow, credentials leaking to browser, cross-origin requests, and duplicate launches. Address these before visual polish.

## Proof
Automated tests for isolation, budgets, citation filtering, cross-lane retrieval, retry/idempotency, stale revisions, persistence/recovery, cancellation, frozen-set isolation, baseline replay and HTTP boundaries. Browser proof of source ownership, live board updates, central results and saved runs. Provider stub tests plus a disclosed live smoke result; never call demo quality a measured model gain.

## Stop condition
All local acceptance paths work, tests pass, the app is open for review, and remaining external/provider limitations are stated. No deployment, remote repository, or claims of million-token performance.
