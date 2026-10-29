# Manifest — kb-route-hardening
**Contract:** none specific (D-207 Changes-authorized list; ISS-420, ISS-417, ISS-421 abort part; ISS-425 and ISS-427 as numbered in the unit brief, not yet rows in qa/issues.jsonl; flash-lite per qa/gates/kb-speed-wa-h3-2026-10-29.md)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 1
**Dual check:** required
dual-trigger: tenancy apps/api/src/search-cache/search-cache.ts:73
**Persona walk:** skip (API and routing only, no screen, flow or user type)
**Issues addressed:** ISS-420 (medium, consent), ISS-417 (medium, test-coverage), ISS-421 abort part (low), ISS-425 and ISS-427 first part (brief ids, no ledger row yet)
**Executor:** claude-opus-subagent
**Executor rationale:** one coherent consent-cache fix across two existing seams (/route router, /search store) plus a provider option; edited in place; the shared fingerprint is moved, not duplicated.

## Criteria
- C1 (ISS-420) A consent withdrawal or any other visibility change takes effect on the VERY NEXT `/route` and `/search` call, with a long TTL and no clock movement. Mechanism chosen: re-use kb-search-fast's visibility fingerprint as part of the /route cache validity check.
- C2 (ISS-420) An index failure takes effect on the very next `/route` call (the session is dropped) and refreshes the next `/search` result (`/search` has never hidden index-failed sessions; its cached label must not go stale).
- C3 (ISS-420/425) The fingerprint is fail-safe: if it cannot be read, the cache is bypassed (nothing served from or stored in it), never replaced by a constant; results touching WhatsApp-batch sessions are never cached.
- C4 (ISS-425) The search-cache test fake honours `find()` projections and pins: consent in the sources projection, sessions in the fingerprint, no constant fingerprint on failure.
- C5 (ISS-417) CONFIDENCE_MARGIN is pinned by a tie (1.0), a near-tie just under 1.25 (1.211), just over 1.25 (1.259), and the nothing-left-out case.
- C6 (ISS-421) After the hard deadline the in-flight `route()` work is aborted (AbortSignal), and the step B model call is aborted (on its own timeout and on the request abort); the router tries no further provider after an abort.
- C7 (ISS-427 first part) Every Mongo read of `/route` (fingerprint, gate, turns, overlay, visibility) and of `/search` called with a deadline carries `maxTimeMS` derived from the time left.
- C8 (D-207 item 3) `config/ai-routing.yaml` has a `route` chain `[gemini-flash-lite]`; provider `gemini-flash-lite` = `gemini-3.5-flash-lite` with `thinkingLevel: "minimal"` (new option in packages/ai); live /route step B uses it; the 1.2 s timeout and fallback to step A are unchanged; no other chain or provider changed.
- C9 docs/api/route-endpoint.md states the cache/withdrawal semantics, abort, maxTimeMS and the model.

## What changed
- EDIT apps/api/src/search-cache/search-cache.ts: `visibilityFingerprint` MOVED here from search-store.ts (same body, now exported, plus a doc line), new `withReadDeadline(db, deadlineAt, now)` (Proxy adding `maxTimeMS` to every find/findOne, clamped by any lower value already on the call).
- EDIT apps/api/src/search-store.ts: imports the moved function, wraps `db` with `withReadDeadline(..., options.deadlineAt)`. Behaviour otherwise unchanged (the failure path still sets `state = null`).
- EDIT apps/api/src/route/route-router.ts: result cache is now the shared `TenantSearchCache` bound to `deps.fingerprint(...)`; per-request `AbortController` passed as `ctl.signal`, aborted in the catch path (timeout, error).
- EDIT apps/api/src/route/route-store.ts: `RouteControl.signal`, `RouteDeps.fingerprint`, `check()` honours the signal, db wrapped with `withReadDeadline`, step B gets its own AbortController (aborted on its timeout and on the request abort) and the job carries `signal`.
- EDIT apps/api/src/route/route.testsupport.ts and apps/api/src/search-cache/search-fixture.testsupport.ts: fakes honour `projection` and record `options` (exported `project`).
- EDIT tests: route/bm25-router.test.ts, route-store.test.ts, route-router.test.ts, search-cache/search-cache.test.ts, composition/vectorless-routing.test.ts, packages/ai providers.test.ts and router.test.ts.
- EDIT packages/ai/src/providers/gemini.ts (`thinkingLevel`, `name` options, passes `job.signal` to the transport, model listed), provider.ts (`Job.signal?`), router.ts (one line: stop trying providers once `job.signal` is aborted).
- EDIT config/ai-routing.yaml (`route: [gemini-flash-lite]`), apps/api/src/composition/production.ts (register provider `gemini-flash-lite`; /route step B calls chain `route`), packages/index/src/pipeline/notes/judge.test.ts (its exact-chains deepEqual gained `route`).
- EDIT docs/api/route-endpoint.md.

## Files outside the literal D-207 Changes-authorized list (flag for the checker)
- apps/api/src/search-store.ts: needed so the fingerprint can be shared without a second copy (moved into search-cache/, which is authorized); 3 lines changed besides the removal.
- apps/api/src/composition/production.ts: the only place the /route model call and provider registry are wired; +1 provider line, 1 chain name changed (file is at its LOC budget; the comment is trailing).
- packages/ai/src/provider.ts, router.ts and providers/gemini.ts: D-207 authorizes "packages/ai (thinking-level option)"; `name` and `Job.signal` (+ the router abort line) are the abort part of ISS-421 and a second provider instance, beyond the literal wording.
- packages/index/src/pipeline/notes/judge.test.ts and apps/api/src/composition/vectorless-routing.test.ts: tests that pin the exact set of chains.
- NOT touched: apps/api/src/transcript-review/search-reader.ts (its existing per-read maxTimeMS is clamped by the deadline proxy underneath it, so no edit was needed), qa/issues.jsonl (checker's file; ISS-425/427 rows are not filed), docs/DECISIONS.md.

## Design notes (what is NOT a claim)
- Chosen: fingerprint-in-cache-validity, not write-path invalidation. Why: withdrawals, index status, relabels, review edits and WhatsApp links are written by several processes (API, workers, scripts, the watcher), so an in-process invalidate() hook would miss every write that does not go through this server; the fingerprint reads the database itself. Cost: four small projected tenant-scoped reads per cacheable request (about 0.3 ms p50 on the in-memory fake; real Mongo round trips are not measured). `TenantSearchCache.invalidate` remains for in-process writers.
- A visibility change landing between the fingerprint read and the end of a computation is cached under the OLD fingerprint and so can never be served to the next request (fingerprint differs). The only residual window is the in-flight request itself.
- Cacheability limits are those of /search K5: WhatsApp-batch sessions are never cached; turns appended to an existing session are invisible to the fingerprint (TTL bounds that: 20 s /route, 45 s /search).
- /search does NOT hide index-failed sessions and I did not change that (a behaviour change outside this unit). The "index-failed likewise" requirement is therefore proven as: /route drops the session on the very next call; /search recomputes on the very next call and returns the fresh status label.
- Chain `route` has ONE member on purpose (see the doc): ollama-cloud ignores `job.signal`, so a fallback member would leave an un-cancelled 240 s call behind an aborted request. Missing key or provider error degrades to step A.
- Offline tree-summary build (D-207 item 3, second half): NOT wired, reason: no code path emits job kind `tree-summary` (chain exists in yaml, never requested; grep over apps, packages, scripts). Tree node summaries come from `summarizeSession`/`extractTopics` under job kinds `summarize` and `topics`, which share chains with claims extraction and are pinned to the cloud pair by three D-173 tests. Repointing them is a quality-gated change that needs Umesh's decision, so it is reported, not done.
- Pre-existing failure, not mine: `apps/api/src/composition/vectorless-routing.test.ts` "Compose requires an explicit database and does not bake provider secrets into web builds" fails on base be9c8608 as well (verified in the main checkout: pass 0 / fail 1 for that test). The other 3 tests in the file pass, including the new D-207 one.
- TDD: each new test was run red first (e.g. fingerprint/abort/maxTimeMS tests: 5 red in route-store.test.ts, 3 in providers/router before implementation), then green. One test was corrected before implementation because my assumption was wrong (it asserted /search hides index-failed sessions; it does not).
- ISS-420 / D-015 measurement: ISS-420's ledger row records no reproduction cases, only the behaviour (a withdrawn session served up to 20 s). The standing regression is the e2e test "consent withdrawn between two identical calls": 1/1 reproductions closed. ISS-417's row records no cases either (mutant 1.25 -> 0 must die): killed, see M6a-c. ISS-421's other two parts (facet-token coverage, flat-tail confidence) are NOT addressed here, left open.

- CYCLE 1 (checker A + B, C3): the fingerprint read was awaited before the deadline race, so a hung read hung the request. Fix: new `fingerprintWithin(read, deadlineAt, now)` in search-cache.ts, a race that resolves `null` (= bypass the cache, store nothing) when the read errors, throws synchronously or is still pending after HALF of the time left; it never rejects. /route: the deadline timer now starts before the fingerprint read and the read sits inside the same `try` and `Promise.race`, so a hung read costs a cache bypass, the work keeps the other half, and if the work cannot finish either the answer is 503 route_timeout at the deadline. /search: `createMongoSearchDeps.search` uses the same helper with `options.deadlineAt` (routes/search.ts already raced the whole `search()` against 5 s, so /search was HTTP-bounded; the store itself was not, and now is). Why half and not the whole deadline: with the whole deadline a hung read left zero time for the work (the store then threw VisibilityDeadlineError).
- CYCLE 1: a synchronous `getDb()` throw (the route-store `fingerprint` dependency is now `async`) is a rejection inside the router try: 503 route_unavailable instead of 500. Pinned by a test using a throwing `db` getter through the real `createRouteDeps`. Making the dependency non-async again does NOT fail a test, because `fingerprintWithin` also turns a synchronous throw into a bypass; the helper is what is pinned (M17).
- CYCLE 1 C6 low: route-store step B only relied on the listener; `check()` now runs after `await gate(...)` and before the listener is attached, so an abort that landed during the gate never starts the model call.
- CYCLE 1 left filed, not fixed (per coordinator): the trusted tree-read maxTimeMS note. Consent behaviour untouched (D-210).
- CYCLE 1 known weakness: the /route router test cannot tell "half of the time left" from "all of it" (M18 survives there; the order in which an already-rejected deadline promise and an instantly-resolving fake settle decides the outcome). The store-level test pins it (M18b).

## Measured timings (synthetic corpus, in-memory db, no network, warm index, 20 runs each, ms)
Whole call incl. turn fetch, overlay, BM25, visibility, labels. /route = `route()` (no HTTP, no result cache); /search = `createMongoSearchDeps(cacheTtlMs: 0)`; cache hit = repeat call with the cache on (includes the 4 fingerprint reads); fingerprint = alone.
| question | /route p50 / p95 | /search p50 / p95 | /search cache hit p50 / p95 | fingerprint p50 / p95 |
|---|---|---|---|---|
| cost of living in Toronto for students | 10.7 / 32.5 | 46.1 / 63.6 | 0.4 / 1.1 | 0.3 / 0.6 |
| IELTS requirement for UK masters | 8.0 / 11.4 | 29.3 / 39.1 | 0.4 / 0.7 | 0.3 / 0.5 |
| best universities in Canada | 8.1 / 27.1 | 34.9 / 66.9 | 0.4 / 0.9 | 0.3 / 0.9 |
| visa requirements for Germany | 9.0 / 21.2 | 24.2 / 30.8 | 0.4 / 0.5 | 0.3 / 0.5 |
These are CPU costs on an in-memory fake. Real Mongo round trips, the trusted tree read and the model call are NOT included. Step B (flash-lite) was never run against a real model.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 24 files, 9 criteria, est 150 min, single builder, no checker dispatch by the builder
slow-plan: none; each test file runs in under 20 s
Tier: H (consent/visibility cache on authenticated read endpoints, tenancy)
Base / checked state: base be9c8608; cycle-0 code commit 419b198e; cycle-1 code commits b3dafb7a, 10f74146, 43d115cc (the manifest commit that follows touches only qa/).
Affected tests: apps/api/src/route/*.test.ts (3), search-cache/search-cache.test.ts, search-store.test.ts, routes/search.test.ts, composition/vectorless-routing.test.ts, server.test.ts, production.test.ts, composition/integrations/mounted-routes.test.ts; packages/ai providers/router/routing-config tests (full packages/ai suite: 268 pass); packages/index judge.test.ts.
Independent review: NOT run by the builder; the dual checker owns review.
Not run / limits: no live Mongo or provider (fakes only); real-Mongo `maxTimeMS` behaviour with the driver's `timeoutMS` option unverified (the deadline proxy only clamps values already present); full-repo `pnpm test` not run (one file per invocation, disk); no deploy, no push.
Tests[C1]: apps/api/src/route/route-router.test.ts::"ISS-420 e2e: consent withdrawn between two identical calls -> the very next /route AND /search exclude that session (no TTL wait)" + "ISS-420 cache: a changed visibility fingerprint drops the cached entry on the very next request" + search-cache.test.ts::"K5 cache: consent withdrawn between two identical requests is honoured immediately" — real stores behind the real router, cached first, consent flipped, next /route and /search exclude s04
Tests[C2]: route-router.test.ts::"ISS-420 e2e: a session whose index turns failed vanishes from the very next /route call" + search-cache.test.ts::"ISS-420 index failure: a session status change invalidates the cached /search result on the very next request" — /route drops it, /search recomputes with the fresh label
Tests[C3]: route-router.test.ts::"cycle 1: a never-resolving fingerprint read is bounded by the hard deadline; the cache is bypassed and nothing is stored" + "cycle 1: a hung fingerprint read plus work that cannot finish ... answers 503 route_timeout within the deadline" + "cycle 1: a database handle that throws synchronously ... answers 503 route_unavailable, never 500" + "cycle 1: a fingerprint dependency that throws synchronously is a cache bypass" + search-cache.test.ts::"cycle 1: a never-resolving fingerprint read is bounded by the call's deadline in the store itself" (the /search side) + (cycle 0) route-router.test.ts::"ISS-420 cache: an unreadable fingerprint bypasses the cache" + "a result touching a WhatsApp-batch session is never cached" + "the fingerprint is read for the verified tenant only" + search-cache.test.ts::"ISS-425 a fingerprint that cannot be read is NOT replaced by a constant" — bypass, no store, no wa caching, tenant from the key
Tests[C4]: search-cache.test.ts::"ISS-425 fake honours projections" + "fingerprint reads sources WITH consent, sessions WITH status, ..." + the consent, index-status and unreadable-fingerprint tests above — each of the three requested mutants dies (M1, M2, M3)
Tests[C5]: bm25-router.test.ts::"ISS-417 confidence margin: ..." (5 tests: constant, tie, near-tie 1.211, just over 1.259, nothing left out)
Tests[C6]: route-store.test.ts::"cycle 1 (C6 low): a request abort that lands while the step B frontier is being gated never starts the model call" + route-router.test.ts::"ISS-421 deadline: after the hard deadline the in-flight route() work is told to stop" + route-store.test.ts::"ISS-421 step B: the model call receives an AbortSignal that fires when the step B budget runs out" + "aborting the request signal mid step B aborts the model call and rejects with RouteTimeout" + "an already-aborted signal stops before any read" + packages/ai router.test.ts::"an aborted job.signal stops the chain" + providers.test.ts::"job.signal is handed to the transport"
Tests[C7]: search-cache.test.ts::"cycle 1: withReadDeadline keeps the LOWER of the caller's own maxTimeMS/timeoutMS and the time left" + route-store.test.ts::"ISS-427 every Mongo read of a /route call carries maxTimeMS derived from the deadline" + "the fingerprint read is also deadline-bounded and tenant-confined" + search-cache.test.ts::"ISS-427 every Mongo read of a /search call carries maxTimeMS derived from the deadline"
Tests[C8]: vectorless-routing.test.ts::"D-207: /route step B has its own chain on gemini-3.5-flash-lite with minimal thinking; the cloud text chains are unchanged" + providers.test.ts::"gemini thinkingLevel: configured -> ... unset -> the body is unchanged" + judge.test.ts "config/ai-routing.yaml ... match the D-173 table" (route is the only added key) + route-store.test.ts step B timeout/garbage fallback tests (unchanged, still green)
Tests[C9]: docs only (cycle 1: the 503 route_timeout row and the fingerprint paragraph reworded) — read docs/api/route-endpoint.md sections "Caching and tenancy", "Deadline, abort and database time limits", "Wiring"
Pre-check[C1]: 43d115cc node --test --import tsx apps/api/src/route/route-router.test.ts -> exit 0, ok: 20 passed 0 failed (e2e consent withdrawal on /route and /search, fingerprint-bound cache) t=1
Pre-check[C2]: 43d115cc node --test --import tsx apps/api/src/route/route-router.test.ts; apps/api/src/search-cache/search-cache.test.ts -> exit 0, ok: 20 + 17 passed 0 failed (index status e2e, /search status refresh) t=1
Pre-check[C3]: 43d115cc node --test --import tsx apps/api/src/route/route-router.test.ts; apps/api/src/search-cache/search-cache.test.ts -> exit 0, ok: 20 + 17 passed 0 failed (bypass on unreadable fingerprint, a HUNG fingerprint read bounded by half the time left, sync throw is a bypass, 503 route_unavailable on a throwing db, no WhatsApp caching, tenant from the key) t=1
Pre-check[C4]: 43d115cc node --test --import tsx apps/api/src/search-cache/search-cache.test.ts -> exit 0, ok: 17 passed 0 failed (projection-honouring fake and the three pins) t=1
Pre-check[C5]: 43d115cc node --test --import tsx apps/api/src/route/bm25-router.test.ts -> exit 0, ok: 16 passed 0 failed (margin pins) t=1
Pre-check[C6]: 43d115cc node --test --import tsx apps/api/src/route/route-store.test.ts; packages/ai src/router.test.ts; src/providers.test.ts -> exit 0, ok: 21 + 9 + 26 passed 0 failed (abort at request deadline, abort landing during the step B gate, step B abort, provider tries stop, signal reaches the transport) t=1
Pre-check[C7]: 43d115cc node --test --import tsx apps/api/src/route/route-store.test.ts; apps/api/src/search-cache/search-cache.test.ts -> exit 0, ok: 21 + 17 passed 0 failed (maxTimeMS on every read, lower caller maxTimeMS/timeoutMS wins) t=1
Pre-check[C8]: 43d115cc node --test --import tsx --test-name-pattern=D-207 apps/api/src/composition/vectorless-routing.test.ts; packages/ai src/providers.test.ts; packages/index src/pipeline/notes/judge.test.ts -> exit 0, ok: 1 + 26 + 10 passed 0 failed (route chain, provider, thinking level, no other chain changed; one unrelated old test in that file is documented in Design notes) t=1
Pre-check[C9]: 43d115cc grep -c "Deadline, abort and database time limits|gemini-3.5-flash-lite" docs/api/route-endpoint.md -> exit 0, ok: 2 matching lines (section and model present) t=1
Pre-check[R1]: 43d115cc regression: apps/api search-store.test.ts (21), routes/search.test.ts (11), server.test.ts (10), production.test.ts (4), composition/integrations/mounted-routes.test.ts (4) -> exit 0, ok: all passed, 0 failed t=1
Pre-check[T1]: 43d115cc pnpm typecheck in apps/api and packages/ai -> exit 0, ok: no diagnostics t=1
Pre-check[T2]: 43d115cc pnpm lint:structure; node scripts/snapshot.mjs --check -> exit 0, ok: lint:structure OK (10 stages, 0 failed), SNAPSHOT matches a fresh regeneration t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C8); several criteria carry more than one (independent clauses); 31 mutants in total (20 in cycle 0, 11 more in cycle 1)
Metrics: builder_min=150 mutants=31 policy=proportional-verification/2026-10-19.17 cycle=1 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications (each: one textual replacement matching exactly once, its OWN byte backup, `timeout 150`, restore on EXIT/INT/TERM/ERR, then `git hash-object` equals `HEAD:<file>`; every row below ended HEAD-fidelity OK)
| Id | Criterion | falsifying edit | observed |
|---|---|---|---|
| M1 | C4 | search-cache.ts fingerprint projection `kind: 1, consent: 1` -> `kind: 1` (consent out of the sources projection) | search-cache.test.ts: 2 failed |
| M2 | C4/C2 | search-cache.ts drop `byId(sessions)` from the hashed array | search-cache.test.ts: 1 failed |
| M3 | C4/C3 | search-store.ts `catch { state = null; }` -> constant fingerprint `""` | search-cache.test.ts: 1 failed |
| M4 | C1 | route-router.ts never reads the fingerprint (`if (false && deps.fingerprint)`) | route-router.test.ts: 6 failed |
| M5 | C3 | route-router.ts `.catch(() => null)` -> constant fingerprint on failure | route-router.test.ts: 1 failed |
| M12 | C3 | route-router.ts cache even WhatsApp-batch results | route-router.test.ts: 1 failed |
| M6a | C5 | bm25-router.ts `CONFIDENCE_MARGIN = 1.25` -> `0` | bm25-router.test.ts: 3 failed |
| M6b | C5 | ... -> `1.2` | 2 failed |
| M6c | C5 | ... -> `1.3` | 2 failed |
| M7a | C7 | search-cache.ts `withReadDeadline` stops adding `maxTimeMS` | route-store.test.ts: 2 failed |
| M7b | C7 | same mutant, /search side | search-cache.test.ts: 1 failed |
| M8 | C6 | route-router.ts catch no longer aborts the request controller | route-router.test.ts: 1 failed |
| M9 | C6 | route-store.ts step B timeout no longer aborts the model call | route-store.test.ts: 1 failed |
| M10 | C6 | route-store.ts `check()` ignores `ctl.signal.aborted` | route-store.test.ts: 2 failed |
| M11a | C8 | gemini.ts never sends `thinkingConfig` | providers.test.ts: 1 failed |
| M11b | C6 | gemini.ts does not pass `job.signal` to the transport | providers.test.ts: 1 failed |
| M11c | C6 | router.ts keeps trying providers after an abort | router.test.ts: 1 failed |
| M13 | C8 | production.ts /route step B calls chain `ask` instead of `route` | vectorless-routing.test.ts: 2 failed (1 pre-existing + 1 new) |
| M14 | C8 | production.ts thinkingLevel `minimal` -> `high` | vectorless-routing.test.ts: 2 failed (1 pre-existing + 1 new) |
| M15 | C3 | route-router.ts awaits the raw `deps.fingerprint(...)` again (no `fingerprintWithin`) | route-router.test.ts: 3 failed (the hang tests fail at their 1.5 s fetch guard) |
| M16 | C3 | search-cache.ts `fingerprintWithin` never arms its timer | route-router.test.ts: 2 failed |
| M17 | C3 | `fingerprintWithin` calls `read()` directly (a synchronous throw escapes) | route-router.test.ts: 1 failed |
| M18 | C3 | `fingerprintWithin` waits the whole remaining time instead of half | route-router.test.ts: SURVIVED (see weakness note) |
| M18b | C3 | same mutant | search-cache.test.ts: 1 failed |
| M19 | C3 | search-store.ts back to the unbounded `try { await visibilityFingerprint } catch` | search-cache.test.ts: 1 failed (fails fast at the 1.5 s race guard) |
| M20 | C7 | withReadDeadline `Math.min(options.maxTimeMS, cap)` -> `cap` (the mutant checker A found surviving) | search-cache.test.ts: 1 failed |
| M21 | C7 | same for `timeoutMS` | search-cache.test.ts: 1 failed |
| M22 | C6 | route-store.ts drops the `check()` after the step B gate | route-store.test.ts: 1 failed |
| M23 | C3 | route-router.ts: non-timeout failures answer 500 instead of 503 route_unavailable | route-router.test.ts: 2 failed (incl. the getDb-throw test) |
| M24 | C6 | route-router.ts deadline timer never armed | route-router.test.ts: hung, killed by the 40 s timeout (the pre-existing deadline tests) |
Note on M15-M24: cycle 1 only (build-log names m1-m10; M18 = m4, M18b = m4b). Each ran with its own byte backup, `timeout`, restore on EXIT/INT/TERM/ERR, then `git hash-object` = `HEAD:<file>` (every run printed HEAD-fidelity ok); the scratch directory was removed. m1, m2 and m8 were first killed only by the 60 s timeout (a hang), so the tests were given a 1.5 s guard and the three were re-run: they now die by assertion.
Note on M8: an earlier version aborted in both the timer and the catch; mutating the timer alone survived (redundant), so the timer abort was removed and the single abort site is pinned.

## How to verify
- `cd apps/api && node --test --import tsx src/route/route-router.test.ts` (20), `route-store.test.ts` (21), `bm25-router.test.ts` (16), `src/search-cache/search-cache.test.ts` (17).
- `cd packages/ai && node --test --import tsx src/providers.test.ts` (26), `src/router.test.ts` (9).
- `cd apps/api && pnpm typecheck`; `pnpm lint:structure`; `node scripts/snapshot.mjs --check`.
