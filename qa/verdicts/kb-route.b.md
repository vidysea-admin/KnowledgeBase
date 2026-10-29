# Verdict B (blind dual coordinator) -- kb-route
Cycle checked: 0
Checked: base 1c864477 .. code fd470bc1 / snapshot 65332254, manifest commit c5c2b911 (HEAD). Worktree `git status` clean of tracked changes before and after.
Policy-Version: proportional-verification/2026-10-19.17 (judged under the manifest pin)

## Check plan (step 0)
Tier H, dual (dual-trigger tenancy apps/api/src/route/route-store.ts). Steps: read the diff and all 5 product files plus server.ts / production.ts wiring; run the 3 route test files and 3 regression files one per invocation under timeout; `tsc --noEmit`; `lint:structure`; `snapshot --check`; 9 falsifications (plus 3 extras on C2) in a scratch copy; tenancy and visibility bypass read against `/search` (search-store.ts, search-reader.ts, effective-reader.ts, visibility/knowledge.ts).

VERDICT: PASS
SCOREBOARD: 8/8 criteria met, floor met (tsc clean, lint clean, regressions green, falsification red on every criterion's primary clause). One surviving mutant on the C2 margin value, filed as a proposed non-security coverage issue.
TIER: H (new authenticated read endpoint, tenancy and visibility; no data write, no auth middleware change)

## Criteria evidence (checker's own runs, bound tree, cwd apps/api)
| Id | Evidence | Result |
|---|---|---|
| C1 | `node --test --import tsx src/route/bm25-router.test.ts` -> 11 pass 0 fail (four natural questions route to s01..s04 first, deterministic, 22 sessions / 110 topics asserted, build and step A < 300 ms). route-store.test.ts end-to-end no-LLM: my run printed `ROUTE-TIMINGS` 38.1 / 10.7 / 9.4 / 15.9 ms, all < 300 ms. Code read: bm25.ts is a real Okapi BM25; facets.ts derives country / axis / university tokens from node text only; no LLM import in bm25*.ts | met |
| C2 | `route-store.test.ts` -> 15 pass 0 fail. Code read: bm25-router.ts `margin = kept/next`, `confident = margin >= 1.25` (nothing left out = Infinity); route-store.ts step B only under `!a.confident && deps.complete`, ONE `selectNodes` round inside `withTimeout`, catch-all sets `llmFailed` and keeps step A order. My probe (scratch): 4 equal sessions -> margin 1, confident false; clear gap -> Infinity, true. The 1.25 value itself has no boundary test, see PROPOSED-ISSUE 1 | met (value untested) |
| C3 | route-store.test.ts tenancy test asserts every recorded db read has `filter.tenantId`; route-router.test.ts cache isolation; per-tenant index cache test. Code read: sessions and turns via `scopedCollection`, readEffectiveTurns reads carry `tenantId`, visibility calls take tenantId, gate also checks `s.tenantId === tenantId`, `assertValidTenantId` first, index cache keyed by tenantId, result cache `Map<tenantId, Map>` keyed from `req.auth.tenantId` only. A model-chosen node id from another tenant would still die in the tenant-scoped gate | met |
| C4 | route-store.test.ts withdrawn / index-failed test and the step B test (withdrawn s06 routing text absent from `jobs[0].messages`). Code read: `gate()` fails closed (`.catch(() => false)`), applied to `index.sessionIds` before building the frontier and to `order` before selection | met |
| C5 | route-store.test.ts hit-shape test (hit, turn, session keys equal `/search`'s) and route-router.test.ts body-shape test. Turn text always from a `turns` row run through `readEffectiveTurns` (same overlay `/search` uses) | met |
| C6 | route-router.test.ts deadline test (503 `route_timeout`, no hang); route-store.test.ts expired-budget test. Router uses `Promise.race` with a timer cleared in `finally`; no unhandled rejection path (both race arms are observed) | met |
| C7 | route-router.test.ts cache test (hit within TTL, recompute after, failures not cached); key is `tenantId` then `k + normalised query` | met |
| C8 | route-router.test.ts auth-parity test, k default 5 / cap 20, unmounted-when-absent. `requireScope("search")`, tenant from `req.auth`; mounted after the global requireAuth / rate-limit line in server.ts so it inherits both | met |
| T1 | `npx tsc --noEmit -p apps/api/tsconfig.json` -> exit 0 | met |
| T2 | `pnpm lint:structure` -> OK (10 stages, 0 failed); `node scripts/snapshot.mjs --check` -> matches fresh regeneration (175 lines) | met |
| R1 | server.test.ts 10, production.test.ts 4, composition/integrations/mounted-routes.test.ts 4: all pass 0 fail, counts match the manifest | met |

Identity: test counts (11 / 15 / 8; 10 / 4 / 4) equal the manifest Pre-check lines; commit chain 1c864477 -> fd470bc1 -> 65332254 -> c5c2b911 matches the manifest. I re-ran everything myself; no maker run was reused as evidence.

## Falsification (own mutants, in a scratch copy under the scratchpad; the bound tree was never edited)
Copy layout: `root/apps/api/src` copied, `packages/ schema/ qa/ node_modules` as junctions into the worktree (read-only use), junctions removed with `rmdir` afterwards (no rm -rf). Per-mutation byte backup restored in a `finally` right after each run (no EXIT trap); after each restore `git hash-object <copy file>` equalled `git rev-parse HEAD:<file>` (fidelity OK on all 12 runs). Mutants differ from the maker's.
| Id | Mutant | Observed |
|---|---|---|
| C1 | facets.ts `queryFacetTokens` returns `[]` | bm25-router.test.ts 10 pass / 1 fail (facets test) |
| C2a | bm25-router.ts `CONFIDENCE_MARGIN` 1.25 -> 1000 | route-store.test.ts 13 / 2 fail (confident questions now call the model) |
| C2b | bm25-router.ts `kept / next` -> `next / kept` | route-store.test.ts 13 / 2 fail |
| C2c | bm25-router.ts `CONFIDENCE_MARGIN` 1.25 -> 0 | route-store.test.ts 15 / 0 fail: SURVIVES |
| C3a | route-store.ts sessions read via raw `db.collection("sessions")` (no tenant scope) | tenancy test 14 / 1 fail |
| C3b | route-store.ts index cache keyed `"*"` instead of tenantId | per-tenant index cache test 14 / 1 fail |
| C4 | route-store.ts frontier built from `new Set(index.sessionIds)` (ungated) | step B visibility-gated test 14 / 1 fail |
| C5 | route-store.ts hit `session: null` | hit-shape test 14 / 1 fail |
| C6 | route-store.ts `check = () => {}` | expired-budget test 14 / 1 fail |
| C7 | route-router.ts drop `k` from the cache key | cache test 7 / 1 fail |
| C8 | route-router.ts remove `requireScope("search")` from the route | auth-parity test 7 / 1 fail |
Harness notes: my first scratch copy lacked `packages/` and failed to load (file-level failure, discarded); two patterns did not match on CRLF / quoting and were reported as SKIP, then fixed and re-run; the table is from valid runs only. I also tried the margin=0 mutant against bm25-router.test.ts after removing the junctions, which only produced a load failure, so that pairing is not evidence; by read, its `confidence` test covers only a clear top-3 and a zero-match query, which margin=0 also satisfies.

## Security read (tenancy / visibility / data-write paths the diff touches)
- Data write: none in /route itself. `routeComplete("ask", ...)` with `jobWrite` records a job row under the caller's tenant exactly as `/ask` does.
- Tenancy: every read confined as above. Same session ids in two tenants cannot cross because gate, turn read, overlay read and visibility are all tenant-keyed; the tree comes from the trusted `TreeStore` and `buildRouteIndex` throws on a node carrying another tenant's marker.
- Visibility parity with `/search`: both read effective (overlay) turns, then `visibility.filterTurns`, then `safeCitationSession` labels. /route additionally gates whole sessions (`status.index === "done"` and `sessionVisible`, which rejects whatsapp-batch). I found no gate that `/search` applies and `/route` omits. `/route` is stricter than `/search` on index-failed sessions.
- Model-selected ids cannot widen access: every chosen session passes the same gate before any turn is read.
- Result cache can serve a consent withdrawal for up to 20 s (documented by the maker, short TTL requested by D-206). Not a cross-tenant issue.
- Query is length-capped (512 chars), `k` capped at 20, Map-based postings (no prototype-key risk).

PROPOSED-ISSUE: {"sev":"medium","area":"route-coverage","title":"Step A confidence margin 1.25 is unpinned by any test","detail":"Mutating CONFIDENCE_MARGIN 1.25 -> 0 (bm25-router.ts) leaves route-store.test.ts 15/15 green; no test builds a near-tie (margin between 1 and 1.25, more than 3 matching sessions) to assert confident=false, or a just-over case to assert true. Only the extremes (1000, inverted ratio) are caught. A regression there silently disables step B for ambiguous queries. Behaviour is correct today (my scratch probe: 4 equal sessions -> margin 1, confident false).","fix_direction":"add one near-tie and one just-over-1.25 case to bm25-router.test.ts asserting confident false/true; non-security class, file-don't-fix under the round cap"}
PROPOSED-ISSUE: {"sev":"low","area":"route-perf","title":"Step B gates every session in the tenant before building the frontier","detail":"route-store.ts calls gate(index.sessionIds), one tenant-scoped sessions read plus sessionVisible (about two reads) per session, on every low-confidence request. On a tenant with hundreds of sessions this can consume the 3 s route deadline and return 503 route_timeout for exactly the ambiguous queries step B exists for. Not covered by the 22-session synthetic corpus.","fix_direction":"gate only the frontier candidates (top BM25 nodes plus a bounded session pad) or batch sessionVisible once kb-search-fast lands"}
PROPOSED-ISSUE: {"sev":"low","area":"route-resource","title":"Unbounded turn read and result cache across tenants","detail":"route-store.ts reads every turn of up to 3 selected sessions with no row or time bound (search uses boundedSearchDb); route-router.ts keeps up to 100 full-hit entries per tenant with FIFO eviction only, expired entries linger. A timed-out request also keeps running its reads after the 503.","fix_direction":"reuse a bounded db proxy for the turn read, evict expired entries on insert"}

FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no capability rows in the manifest)
LIVE-BROWSER: not-applicable (API endpoint; no network, no live provider, no Mongo touched)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE lines above)
Metrics: check_min=32 policy=proportional-verification/2026-10-19.17 cycle=0 mutants=12 suite_runs=9 repeat_runs=0 tokens=unavailable
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All eight criteria are evidenced by my own test runs and code read, and every primary clause is falsified by a distinct mutant that fails only its own test. Tenancy and visibility match or exceed `/search`, with no bypass found; model output cannot widen access. The one surviving mutant (margin value 1.25) is a non-security coverage gap and the two low items are scale observations, none blocking.
