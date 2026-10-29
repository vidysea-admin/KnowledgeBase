# Verdict - kb-route (coordinator A, blind dual check)
Cycle checked: 0
Checked state: base 1c864477 .. HEAD c5c2b911 (code commit fd470bc1, snapshot 65332254; code files identical to 65332254)
Policy-Version: proportional-verification/2026-10-19.17 | Tier H (tenancy, visibility, new authenticated read endpoint)

## Check plan
1. Reproduce every Pre-check in a scratch copy of apps/api (junctions to the worktree's node_modules/packages/schema/config/contracts/scripts, never the bound tree).
2. One falsification per criterion, per-mutation byte backup restored in `finally`, fidelity by `git hash-object` vs `git rev-parse HEAD:<file>`.
3. Adversarial tenancy probes (poisoned tree, foreign-tenant tree, unscoped reads) and a paraphrase/margin probe of step A.

## Evidence (own runs, identity = HEAD c5c2b911 code)
- bm25-router.test.ts 11/11, route-store.test.ts 15/15 (ROUTE-TIMINGS 6.7-85 ms whole call, in-memory), route-router.test.ts 8/8, server.test.ts 10/10, production.test.ts 4/4, mounted-routes.test.ts 4/4. `tsc --noEmit -p apps/api` clean. `snapshot.mjs --check` OK.
- Code read: route-store.ts, route-router.ts, bm25-router.ts, bm25.ts, server.ts and production.ts hunks, effective-reader.ts, visibility/knowledge.ts, select-nodes.ts.
- C1 four natural questions route to s01..s04 with no model; step A + index build 33 ms (< 300 ms). Paraphrases also route right (probe: "how much does it cost to live in Toronto" s01, "IELTS score for the UK" s02, "student visa Germany blocked account" s04, "universities in Toronto" s03).
- C2 `selectNodes` with a flat leaf frontier is exactly one model round; `withTimeout` bound; throw/garbage/timeout set llmFailed and keep step A order. Probe shows margin 1.188 and 1.03 -> unconfident, 1.25 constant read at bm25-router.ts `CONFIDENCE_MARGIN`.
- C3 gate (sessions) and turns reads go through `scopedCollection`; `readEffectiveTurns` rejects foreign rows; index cache and result cache are keyed by tenantId first. Probe: toc tree whose session refs a session owned by tenant `other` returns 0 hits; a tree stamped tenant `other` served to `toc` throws "route tree tenant mismatch"; 0 db reads without a tenant filter.
- C4 gate runs after selection on order[0..6]; frontierRoot offers only gated sessions; whatsapp-batch sessions are dropped by `sessionVisible` (stricter than /search, not a leak).
- C5 hit keys equal /search (test + code); answer text from `turns` rows. C6 3 s race -> 503 route_timeout, failures not cached. C7 per-tenant TTL cache. C8 requireScope("search"), k default 5 / max 20, q required/<=512 chars.

## Falsifications (copy, own mutants; all restored, FIDELITY-OK each)
| Crit | edit | result |
|---|---|---|
| C1 | drop `facetTokens` from index | SURVIVED (11/11 pass) - see P1 |
| C2 | CONFIDENCE_MARGIN 1.25 -> 1.0 | SURVIVED (15/15 pass) - see P2 |
| C2 | remove `withTimeout` around selectNodes | killed (hang, 150 s timeout) |
| C3 | index cache keyed '*' | killed 14/1 |
| C4 | frontierRoot `ok` -> always true | killed 14/1 |
| C5 | `session: null` | killed 14/1 |
| C6 | `check()` no-op | killed 14/1 |
| C7 | cache key drops k | killed 7/1 |
| C8 | scope "jobs" | killed 1/7 |
| C8 | ROUTE_DEFAULT_K 10 | killed 7/1 |
Maker-claimed 11 mutants were not re-run one by one; each criterion has an independent kill of mine (C3-C8) and the two survivors are test-pin gaps, not wrong behaviour (code and probes match the criteria text).

PROPOSED-ISSUE: {"severity":"medium","type":"test-gap","unit":"kb-route","file":"apps/api/src/route/bm25-router.test.ts","summary":"CONFIDENCE_MARGIN 1.25 is unpinned: setting it to 1.0 (always confident whenever any session matches, so step B only fires on zero-match queries) passes all 34 route tests. Probe shows real queries in the 1.0-1.25 band ('tuition fees and universities' 1.188, 'how much does it cost to live in Toronto' 1.03).","fix_direction":"add a step-A test with a query whose margin is in [1.0,1.25) asserting confident=false and a model call, and one just above 1.25 asserting confident=true"}
PROPOSED-ISSUE: {"severity":"low","type":"test-gap","unit":"kb-route","file":"apps/api/src/route/bm25-router.ts","summary":"Facet tokens (country/topic-axis/university) are claimed in C1 but no routing test depends on them: removing facetTokens from buildRouteIndex leaves 11/11 green.","fix_direction":"add a routing case whose only link to the right session is a facet (e.g. a city named in the query, country named in the node)"}
PROPOSED-ISSUE: {"severity":"low","type":"design","unit":"kb-route","file":"apps/api/src/route/bm25-router.ts","summary":"Confidence compares the 3rd kept session to the 4th, so a clear #1 with a flat tail (e.g. 'IELTS score for the UK', margin 1.000 via tied filler sessions) is classed low-confidence and pays step B (<=1.2 s) needlessly; filler ties are an artifact of the synthetic tree.","fix_direction":"consider margin between rank 1 and rank 2 as well, or measure on the real tree before tuning; no change needed for the stated criterion"}
PROPOSED-ISSUE: {"severity":"low","type":"hardening","unit":"kb-route","file":"apps/api/src/route/route-router.ts","summary":"After the 3 s race the underlying route() (and a step-B model call) keep running with no abort; concurrent slow requests are unbounded.","fix_direction":"pass an AbortSignal / honour deadlineAt inside withTimeout'd selectNodes, or cap in-flight per tenant"}

## Result
VERDICT: PASS
SCOREBOARD: 8/8 criteria met, tenancy/visibility invariants hold
TIER: H (new authenticated read endpoint touching tenancy and visibility)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (API endpoint, no UI capability table)
LIVE-BROWSER: not-applicable (apps/api/src/route/*, docs only; no screen)
ISSUES-WRITTEN: none (dual coordinator; findings are PROPOSED-ISSUE P1-P4 above)
EXECUTOR: claude-opus-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All eight criteria are evidenced by independent runs and code reading; tenant confinement held under a poisoned-tree and foreign-tree probe, and my mutants on C3-C8 were killed. Two of my extra mutants (margin constant, facet tokens) survive, which is a test-pinning gap on stated parameters, not a behaviour defect, so it is filed rather than failed. Not verified: real Mongo/provider latency, step B against a real model (maker disclosed both).
Metrics: start=2026-10-29T09:55:00+05:30 end=2026-10-29T10:35:00+05:30 wall_min=40 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable builder_min=150 check_min=40 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2400 mutants=10 defects_unit=0 defects_6c=0
