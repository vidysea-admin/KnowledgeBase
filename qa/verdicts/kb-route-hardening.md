# Verdict — kb-route-hardening
**Cycle checked:** 1
**VERDICT: PASS**
**Checker:** A (fresh, blind dual; bound to D:/KnowledgeBase, worktree .worktrees/kb-route-hardening)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** be9c8608..d07eac23 (cycle-1 code commits b3dafb7a, 10f74146, 43d115cc; d07eac23 adds only the manifest)
**Scope note:** consent behaviour is out of scope per D-210 (Approver directive); consent-only checks are neither passed nor failed here (same as cycle 0). Everything else is judged in full.

## Cycle-0 findings re-judged
- F1 (hung fingerprint read outside the hard-deadline race; sync getDb() throw gave 500): CLOSED. route-router.ts now starts the deadline timer before any await, the read goes through `fingerprintWithin` (resolves null = bypass at half the time left, on error, or on a sync throw; never rejects), the dep is async so a sync throw is a rejection inside the try (503 route_unavailable). The four cycle-1 router tests plus the search-cache store-level hang test pass.
- F2 (lower caller maxTimeMS/timeoutMS unpinned, mutant C7c survived): CLOSED. The new clamp-pin test is in search-cache.test.ts and passes (17/17); I did not re-run the maker's M20/M21 (see my own mutants below).

## Independent evidence (re-run by checker, one file per invocation, `timeout 150`, bound tree untouched)
- apps/api: route-router.test.ts 20/20, route-store.test.ts 21/21, bm25-router.test.ts 16/16, search-cache.test.ts 17/17, search-store.test.ts 21/21, routes/search.test.ts 11/11. packages/ai: providers.test.ts 26/26, router.test.ts 9/9. Identical to the manifest's Pre-checks.
- vectorless-routing.test.ts 3/4: the one failure ("Compose requires an explicit database and does not bake provider secrets into web builds") is the docker-compose `bot:` env check; docker-compose.yml is not in the diff, pre-existing and unrelated (same as cycle 0). The D-207 test passes.
- `tsc --noEmit -p apps/api/tsconfig.json` clean (no diagnostics).
- Source read: diff of route-router.ts, route-store.ts, search-cache.ts, search-store.ts, production.ts, ai-routing.yaml, packages/ai provider/gemini/router. No other read method (`aggregate`, `countDocuments`, `distinct`) is used on the /route or /search store paths (only read-snapshot.ts, outside them), so the find/findOne proxy covers the reads C7 names.

## Per criterion
- C1 (non-consent): PASS. Fingerprint bound into the /route cache; e2e and cache-drop tests green; cycle-0 mutant "never read fingerprint" killed (6 fail). Consent half: out of scope per D-210.
- C2: PASS. Index-failure e2e on /route and /search refresh green; cycle-0 mutant (no `status` in sessions projection) killed.
- C3: PASS. Cycle-1 helper falsified by me: error path -> constant state, timeout path -> constant state (table below); both die on /route tests, the error path also on /search tests. WhatsApp never cached, tenant from the verified key (tests green, cycle-0 mutants).
- C4: PASS (session-status pin and no-constant-on-failure pin); consent projection pin out of scope per D-210.
- C5: PASS (cycle-0 mutants 1.25 -> 1.2 / 1.3 killed; tests green).
- C6: PASS. Hard-deadline guarantee restored (F1 closed); abort on deadline, step-B abort, no further provider after abort, abort during the gate: tests green.
- C7: PASS on presence and on the lower-wins clamp. Gap: the 1 ms floor is unpinned (L1).
- C8: PASS (route chain, provider name/model, thinkingLevel; D-207 test green; yaml diff is the one `route` key only).
- C9: PASS. docs 503 row, fingerprint paragraph, abort, maxTimeMS, model all match the code read. The "floor 1 ms" statement is true of the code but unpinned (L1).

## Falsification (copy under scratchpad chkA1/ with junctioned node_modules/packages/schema/config; per-mutation byte backup restored in `finally` and byte-compared to the pre-mutation text; afterwards `git hash-object` of each touched copy == `git rev-parse HEAD:<file>`: OK for search-cache.ts, route-router.ts, search-store.ts; bound tree never mutated)
| Id | Criterion | edit | observed |
|---|---|---|---|
| X1a | C3 | `fingerprintWithin` error path resolves a constant state instead of null | search-cache.test.ts: 1 failed (killed) |
| X1b | C3 | same | route-router.test.ts: 2 failed (killed) |
| X2a | C3 | `fingerprintWithin` timeout path resolves a constant state | route-router.test.ts: 1 failed (killed) |
| X2b | C3 | same | search-cache.test.ts: 17/17 pass (SURVIVED on the /search side; killed on /route by X2a) |
| X4a | C7 | `withReadDeadline` drops the 1 ms floor (`maxTimeMS: 0` = no limit in MongoDB) | route-store.test.ts: 21/21 pass (SURVIVED) |
| X4b | C7 | same | search-cache.test.ts: 17/17 pass (SURVIVED) |
| X14a | C7 | `findOne` no longer wrapped | route-store.test.ts: 1 failed (killed) |
| X14b | C7 | same | search-cache.test.ts: 2 failed (killed) |
| X17 | C7/C3 | search-store passes `undefined` deadline to `fingerprintWithin` | search-cache.test.ts: 1 failed (killed) |
| X6 | C6 | drop `expired.catch(() => undefined)` | route-router.test.ts: 20/20 pass (SURVIVED; equivalent in practice: the timer is cleared in `finally` and a hung read resolves at half the deadline, before the race is entered) |
10 runs, 7 killed, 3 survived (none on a security path; all low).

## Adversarial hunt (auth / tenancy / data-write)
- Tenant isolation: cache bucket (`TenantSearchCache.get(tenantId, ...)`) and fingerprint both use the verified `req.auth.tenantId`; fingerprint rows are scope-checked against it; `deps.fingerprint` is called with the verified tenant only. No cross-tenant path found. No data-write added; no new route; no new auth surface.
- ABA / race: a visibility change between the fingerprint read and the end of compute is cached under the OLD fingerprint, so the next request recomputes; the only stale window is the in-flight request. A fingerprint that resolves after the half-deadline is ignored (promise already settled), so nothing is stored under it. State null -> `cache.set` guarded by `state &&`; nothing stored on bypass.
- Hung or throwing fingerprint: bounded at half the time left; sync throw -> bypass; sync `getDb()` throw -> 503 route_unavailable (fails closed, no leak).
- Abort: single abort site in the catch; the step-B controller is also aborted on its own timeout and on the request abort; the router breaks before starting another provider after an abort. `ollama-cloud` ignores `job.signal`, mitigated by the single-member `route` chain (documented).
- Out-of-scope observations, not findings: step B now sends routing text (tree frontier summaries) to Gemini instead of the ollama-cloud pair; D-207 authorizes this. The cost of the fingerprint (four tenant-wide projected scans per cacheable request) is unmeasured against real Mongo; the manifest says so.

## Findings
ISSUES-WRITTEN: none (dual check: checker A writes no ledger rows)
PROPOSED-ISSUE: low | test-coverage | apps/api/src/search-cache/search-cache.ts (withReadDeadline `left`) | the mutant removing the `Math.max(1, ...)` floor survives every route and search-cache test; a read issued in the final millisecond would carry `maxTimeMS: 0`, which MongoDB treats as no limit; docs/api/route-endpoint.md:89 states "floor 1 ms" but nothing pins it
PROPOSED-ISSUE: low | test-coverage | apps/api/src/search-cache/search-cache.test.ts ("cycle 1: a never-resolving fingerprint read is bounded...") | on the /search side the test does not assert that nothing is cached after the timeout bypass; the mutant `fingerprintWithin` timeout -> constant state survives search-cache.test.ts (killed only on /route)

## Metrics
Metrics: start=2026-10-29T00:00:00Z end=2026-10-29T00:00:00Z wall_min=25 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=1 resumes=0 tokens=unavailable builder_min=150 check_min=25 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1500 mutants=10 defects_unit=0 defects_6c=0
