# Manifest — kb-route
**Contract:** none specific (D-206 "vectorless /route"; scope brief from Umesh: "make /route work like the operating brain's own retrieval"; evidence qa/evidence/vc-kb-speed/kb-slowness-analysis.md and kb-vectorless-design.md)
**Goal task:** none
**Date:** 2026-10-29
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: tenancy apps/api/src/route/route-store.ts:113
**Persona walk:** skip (API endpoint only, no screen, flow or user type)
**Issues addressed:** none (D-206 K1/K2/K5 are the kb-search-fast unit; this unit is the /route half)
**Executor:** claude-opus-subagent
**Executor rationale:** new endpoint touching tenancy and visibility; one coherent module (BM25 router, store, HTTP route) built edit-in-place against existing seams (selectNodes, treeSearch, visibility, readEffectiveTurns).

## Criteria
- C1 Step A is deterministic (no LLM) BM25 over the PageIndex tree's session and topic nodes (+ derived country / topic-axis / university facets) and routes each of the four natural questions to the right session; whole no-LLM path is under 300 ms on a synthetic 22-session / 110-topic tree.
- C2 Step B runs only when step A is low-confidence (stated margin 1.25 over the best session left out), is ONE bounded `selectNodes` round on an injected (fakeable) model with a hard timeout, and any timeout / error / garbage falls back to step A's result.
- C3 Tenancy: another tenant's sessions are never routed or returned, every database read carries the tenant, and both the routing-index cache and the result cache are per tenant.
- C4 Withdrawn and index-failed sessions are dropped AFTER selection (tree still lists them), and a withdrawn session's routing text is not offered to the model.
- C5 The response is exactly the `/search` hit shape (`{query, hits:[{turnId, sessionId, score, turn, session}]}`); answer text always comes from `turns` rows.
- C6 `GET /route` has a hard deadline (default 3 s) returning 503 `{error:"route_timeout"}`, never a hang.
- C7 Short-TTL result cache, keyed per tenant first (a tenant never receives another tenant's cached hits).
- C8 Same auth/scope/tenant middleware as `/search` (`search` scope, tenant from the verified key), `k` default 5 and max 20, `q` required.

## What changed
- NEW apps/api/src/route/bm25.ts (tokenizer + Okapi BM25; grep for an existing BM25 helper found none, only a comment in packages/index lexical.ts and the unrelated passage scorer), facets.ts (country / topic-axis / university facet builder, node-text only), bm25-router.ts (route index over the tree, step A, confidence margin, flat frontier for step B, topic/country view), route-store.ts (the real RouteDeps: index cache, step B via `selectNodes` + `treeSearch`, session gate, indexed turn fetch, review overlay, BM25 turn ranking, visibility on the ranked slice, `safeCitationSession`), route-router.ts (HTTP: validation, deadline, per-tenant TTL cache).
- NEW tests: route/bm25-router.test.ts (11), route/route-store.test.ts (15), route/route-router.test.ts (8), fixtures route/route.testsupport.ts (synthetic 22-session / 110-topic tree, two-tenant in-memory db that applies filters).
- NEW docs/api/route-endpoint.md (contract: request, response, errors, latency targets).
- EDIT apps/api/src/server.ts: import, optional `route`/`routeOptions` in `ServerDeps`, one mount line after `/search` (`if (deps.route) app.use(...)`; absent -> not mounted, existing deployments unchanged).
- EDIT apps/api/src/composition/production.ts: import + one `route:` line wiring `createRouteDeps({ tree: createMongoTreeStore(...), complete: routeComplete("ask", ...) })`.
- EDIT docs/SNAPSHOT.md: regenerated (new docs/api dir).
- The route file lives in apps/api/src/route/ not apps/api/src/routes/: `routes/` is already at the 30-file dirsize budget (lint-dirsize failed with my two files there).
- Not touched (other units own them): apps/api/src/visibility/*, search-store.ts, search-prefilter.ts, routes/search.ts. The visibility module is called only through its exported API (`sessionVisible`, `filterTurns`, `safeCitationSession`), so when kb-search-fast batches it, /route gets faster with no change here.

## Design notes (what is NOT a claim)
- Production Mongo was not touched; no live server, no provider call. The tree comes from the injected trusted `TreeStore` (production: the same `createMongoTreeStore` /ask uses, so ineligible sessions are already excluded) and is cached per tenant for 60 s, stale-while-revalidate. Cold start is slow (the trusted tree read is the same cost `/graph` pays, seconds) and may hit the 3 s ceiling once; documented in docs/api/route-endpoint.md.
- Step B in production goes through the `ask` provider chain (GLM on Ollama Cloud per config/ai-routing.yaml), NOT Gemini 3.5 flash-lite with minimal thinking: that needs a routing chain in config/ai-routing.yaml and a thinking-level option in packages/ai, neither in D-206's Changes-authorized list. The 1.2 s step-B timeout bounds the damage either way. Follow-up for Umesh/maker.
- Response `score` is a BM25 score normalised to (0,1], not the `/search` overlap ratio: ordering is meaningful within a response only. Hits are transcript turns only (no native-source hits, no `nativeTruncated`).
- A consent withdrawal can still be served from the result cache for up to 20 s (D-206 asked for a short TTL). The usage recorder (`usage/recorder.ts`) records only `/search` and `/ask`; `/route` is not counted (file is outside this unit).
- TDD honesty: tests and implementation were written together and the test files were green on first full run after two fixture fixes; the red evidence is the falsification table below (each mutant turns a specific test red), not a separate pre-implementation red run.

## Measured timings (synthetic corpus, in-memory db, no network; warm index)
`ROUTE-TIMINGS` from route-store.test.ts, whole `route()` call including turn fetch, review overlay, BM25, visibility and labels (22 sessions x 140 turns per tenant, 2 tenants in the fake db):
- cost of living in Toronto for students: 10.7 ms (51.0 ms in the final run, machine under load) | IELTS requirement for UK masters: 6.3-8.3 ms | best universities in Canada: 6.8-7.8 ms | visa requirements for Germany: 6.8-7.7 ms.
- Step A alone (index build over 110 topics + 22 sessions, then routing): single-digit ms (bm25-router.test.ts asserts < 300 ms for both).
These are CPU costs on an in-memory fake; real Mongo round trips (about 7 per request: sessions, up to 3 gates, turns, review heads, labels) and the trusted tree read are NOT included.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 11 files, 8 criteria, est 150 min, single builder, no checker dispatch by the builder
slow-plan: none; each test file runs in under 15 s
Tier: H (tenancy, visibility and a new authenticated read endpoint)
Base / checked state: base 1c864477; code commit fd470bc1; snapshot commit 65332254 (only docs/SNAPSHOT.md); the manifest commit that follows touches only qa/ (code files identical to 65332254).
Affected tests: apps/api/src/route/bm25-router.test.ts, route-store.test.ts, route-router.test.ts; regression: apps/api/src/server.test.ts, production.test.ts, composition/integrations/mounted-routes.test.ts.
Independent review: NOT run by the builder; the checker (dual) owns review.
Not run / limits: no live Mongo or provider (fakes only); no latency measurement against the real corpus or network; step B never ran against a real model; full-repo `pnpm test` not run (one test file per invocation, disk and machine load); no deploy.
Tests[C1]: apps/api/src/route/bm25-router.test.ts::"step A routes ... first, deterministically" (x4) + "no-LLM path: index build + step A over 22 sessions / 110 topics stays far under 300 ms" + apps/api/src/route/route-store.test.ts::"returns cited turns ... without calling a model" (x4) + "no-LLM end to end ... under 300 ms" — the four natural questions route to the expected session with no model, and step A plus the whole path are timed against the 300 ms target
Tests[C2]: apps/api/src/route/route-store.test.ts::"step B runs only when step A is unsure, is one bounded call, and its picks are still visibility-gated" + "step B timeout, error and garbage all fall back to step A without hanging" + "a confident step A never calls the model" + bm25-router.test.ts::"confidence: a clear top-3 is confident, a query with no lexical match is not" — step B is gated on the margin, is a single fakeable round, and every failure mode falls back to step A
Tests[C3]: apps/api/src/route/route-store.test.ts::"tenancy: every db read is tenant-confined ..." + "the per-tenant index cache never serves one tenant's tree to another" + apps/api/src/route/route-router.test.ts::"cache isolation: tenant B never receives tenant A's cached hits" + bm25-router.test.ts::"a tree carrying another tenant's marker ..." — every read is tenant-filtered and neither cache can serve another tenant
Tests[C4]: apps/api/src/route/route-store.test.ts::"withdrawn and index-failed sessions are dropped after selection ..." + "step B runs only when ..." (withdrawn s06 text never reaches the model) — a withdrawn or index-failed session is dropped after selection and its text is withheld from the model
Tests[C5]: apps/api/src/route/route-store.test.ts::"hit shape equals /search: same keys on the hit, the turn and the session" + apps/api/src/route/route-router.test.ts::"the response body is byte-identical in shape to /search for the same hit" — the hit, turn and session keys equal /search and the HTTP body equals /search for the same hit
Tests[C6]: apps/api/src/route/route-router.test.ts::"deadline: an overrun returns 503 route_timeout promptly instead of hanging" + route-store.test.ts::"deadline: an expired budget throws RouteTimeout before any turn read" — an overrun yields 503 route_timeout quickly and an expired budget aborts before any turn read
Tests[C7]: apps/api/src/route/route-router.test.ts::"cache: same tenant+query+k is served from cache within the TTL and recomputed after it" + "errors: ... failures are never cached" — a hit is served from cache inside the TTL, recomputed after it, and failures are not cached
Tests[C8]: apps/api/src/route/route-router.test.ts::"auth parity with /search: 401 ..., 403 ..., 400 ..." + "k defaults to 5, is capped at 20, and the tenant comes only from the verified key" + "not mounted when no route deps are configured" — 401/403/400 parity with /search, k default 5 and cap 20, tenant from the key, route unmounted when unconfigured
Pre-check[C1]: 65332254 node --test --import tsx apps/api/src/route/bm25-router.test.ts -> exit 0, ok: 11 passed 0 failed t=1
Pre-check[C2]: 65332254 node --test --import tsx apps/api/src/route/route-store.test.ts -> exit 0, ok: 15 passed 0 failed (includes C2, C3, C4, C5 and the ROUTE-TIMINGS line) t=1
Pre-check[C3]: 65332254 node --test --import tsx apps/api/src/route/route-router.test.ts -> exit 0, ok: 8 passed 0 failed (C3 cache isolation, C5, C6, C7, C8) t=1
Pre-check[C4]: 65332254 node --test --import tsx apps/api/src/server.test.ts apps/api/src/production.test.ts apps/api/src/composition/integrations/mounted-routes.test.ts -> exit 0, ok: 10 + 4 + 4 passed, 0 failed (server wiring and production composition regress clean) t=1
Pre-check[T1]: 65332254 npx tsc --noEmit -p apps/api/tsconfig.json -> exit 0, ok: no diagnostics t=1
Pre-check[T2]: 65332254 pnpm lint:structure; node scripts/snapshot.mjs --check -> exit 0, ok: lint:structure OK (10 stages, 0 failed), SNAPSHOT matches fresh regeneration (175 lines) t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C8); C2 and C4 carry two mutants each (two independent clauses), C3 carries two (database scope, cache scope); 11 total
Metrics: builder_min=150 mutants=11 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
See "TDD honesty" above: the red evidence is the falsification table. During the build two fixture slips were fixed in place: the Toronto answer-turn fixture did not contain the question terms (cost, living), so an unrelated Canada session outranked it; and the fake db had no `$or`/`$regex`/`.limit()` so the `/search` comparison test could not run against it. Neither changed product code.

## Falsifications (one per criterion, plus extras)
A scratch copy of the repo was not made (disk is nearly full); the mutations were applied to the committed worktree files instead, each with its OWN byte backup (`copyfile f -> mut/<id>.bak`), a single textual replacement asserted to match exactly once, the one affected test file run under `timeout 150`, restore from that mutation's own backup in a `finally`, then `git hash-object <file>` compared with `git rev-parse HEAD:<file>` (no EXIT trap). All 11 fidelity checks printed OK and `git status` showed no modified tracked file afterwards.

| Id | Criterion | falsifying edit | observed (test file) |
|---|---|---|---|
| C1 | step A ranking | bm25-router.ts session sort `b.score - a.score` -> `a.score - b.score` | bm25-router.test.ts: 7 passed / 4 failed |
| C2a | step B gating | route-store.ts `if (!a.confident && deps.complete ...` -> `if (deps.complete ...` (model always called) | route-store.test.ts: 10 passed / 5 failed |
| C2b | step B fallback | route-store.ts `} catch { llmFailed = true; }` -> `} catch (e) { throw e; }` | route-store.test.ts: 14 passed / 1 failed |
| C3a | tenant scope on turns | route-store.ts tenant-scoped turns read -> raw `db.collection("turns").find({sessionId:{$in}})` | route-store.test.ts: 4 passed / 11 failed |
| C3b | cache isolation | route-router.ts `cache.get(tenantId)` -> `cache.get('*')` | route-router.test.ts: 6 passed / 2 failed |
| C4a | index-failed dropped | route-store.ts remove `s.status?.index === "done" &&` | route-store.test.ts: 14 passed / 1 failed |
| C4b | withdrawn dropped | route-store.ts remove `&& await visibility.sessionVisible(tenantId, id)` | route-store.test.ts: 14 passed / 1 failed |
| C5 | hit shape | route-store.ts `turn: r.turn` -> `turn: { _id: r.turn._id }` | route-store.test.ts: 9 passed / 6 failed |
| C6 | deadline status | route-router.ts timeout `status(503)` -> `status(500)` | route-router.test.ts: 7 passed / 1 failed |
| C7 | cache TTL | route-router.ts `now() - hit.at < ttl` -> `>= 0` (never expires) | route-router.test.ts: 7 passed / 1 failed |
| C8 | k cap | route-router.ts `Math.min(Math.floor(kParam), ROUTE_MAX_K)` -> `Math.floor(kParam)` | route-router.test.ts: 7 passed / 1 failed |

## How to verify
- `cd apps/api && node --test --import tsx src/route/route-store.test.ts` -> 15 pass, prints `ROUTE-TIMINGS`.
- `cd apps/api && node --test --import tsx src/route/route-router.test.ts` -> 8 pass; `bm25-router.test.ts` -> 11 pass.
- `cd apps/api && npx tsc --noEmit -p tsconfig.json`; `pnpm lint:structure`; `node scripts/snapshot.mjs --check`.
- Read docs/api/route-endpoint.md for the contract.
