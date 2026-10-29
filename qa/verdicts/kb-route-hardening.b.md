# Verdict B (blind dual) — kb-route-hardening
**Cycle checked:** 1
**VERDICT: PASS**
**Checked state:** HEAD d07eac23 (code 43d115cc), base be9c8608. Policy-Version: proportional-verification/2026-10-19.17. Tier H (kept). Cycle-0 B finding (hung fingerprint read) re-checked against the cycle-1 fix.
**Scope note:** consent is out of scope per D-210. C1 consent clauses are neither PASS nor FAIL; the non-consent part of C1 (index status / session binding / other visibility change) is covered by C2 evidence. No consent probing, no consent issues raised.

## Criteria
| Id | Result | Evidence (own runs, in a scratch copy of HEAD; bound tree untouched, `git status` clean) |
|---|---|---|
| C1 | consent part out of scope (D-210); non-consent visibility PASS via C2 | route-router.test.ts 20/20, search-cache.test.ts 17/17 |
| C2 | PASS | route-router 20/20 incl. index-failed session vanishes on the very next /route; search-cache 17/17 (status change recomputes /search). B9 (fingerprint read for another tenant) -> 3 red; B10 (cache.get with constant fingerprint) -> 2 red |
| C3 | PASS (cycle-0 FAIL fixed) | Hung fingerprint is now inside the deadline race: own probe (scratch, not committed): never-resolving read with deadlineMs 100 answers in <700 ms (200 bypass, or 503 route_timeout when the work also hangs); a late fingerprint (400 ms > half of 600) is a bypass and nothing is stored; a hung fingerprint does NOT serve an existing cached entry; a read that rejects after the bypass raises no unhandledRejection; tenant B never receives tenant A's cached hits with an identical fingerprint; WhatsApp-session results are never cached; a sync throw in route() answers 503 route_unavailable. B1 (timer never armed) -> 2 red; B3 (failure -> constant fingerprint) -> 2 red; B4b (timeout -> constant fingerprint) -> 1 red in route-router.test; B8 (/search store back to the unbounded await) -> 1 red; B6 (503 -> 500) -> 2 red |
| C4 | PASS | search-cache 17/17 (projection-honouring fake, three pins) |
| C5 | PASS | bm25-router 16/16 (margin pins, unchanged since cycle 0) |
| C6 | PASS | route-store 21/21, packages/ai router 9/9, providers 26/26. Cycle-1 low fixed: B5 (drop `check()` after the step B gate) -> 1 red; B11 (router catch no longer aborts) -> 1 red |
| C7 | PASS | B7 (`withReadDeadline` clamp `Math.min(options.maxTimeMS, cap)` -> `cap`) -> 1 red; search-reader's own `maxTimeMS`+`timeoutMS` pair is handled by the proxy (both clamped) |
| C8 | PASS | vectorless-routing.test.ts D-207 test green; packages/index judge.test.ts 10/10; `route` is the only added chain, `config/ai-routing.yaml` has a single consumer (production.ts `parseRoutingYaml`) |
| C9 | PASS | docs/api/route-endpoint.md lines 40-41, 72, 83-106 match the code (timer before first await, half-deadline fingerprint, 503 rows, model) |
Regression: search-store 21/21, routes/search 11/11 pass; `tsc --noEmit` apps/api exit 0. vectorless-routing.test.ts: 3 pass, 1 fail ("Compose requires an explicit database ...") — pre-existing, re-verified failing on base be9c8608 in cycle 0, not charged.
Falsifications: 13 mutations (B1, B2a, B2b, B3, B4, B4b, B5-B11), each in the scratch copy with its OWN byte backup, restore on EXIT/INT/TERM/ERR, then `cmp` and `git hash-object` == `HEAD:<file>` after every one (all OK). Survivors: B2b (whole-time instead of half, route-router.test only; killed by B2a in search-cache.test, as the maker disclosed) and B4 (timeout -> constant fingerprint, search-cache.test only; killed by B4b in route-router.test, because both tests exercise the one shared helper). Both are coverage-placement notes, not behaviour gaps.

## Why PASS
The single cycle-0 defect (fingerprint read awaited outside the deadline race) is closed: the deadline timer now arms before any await, the read sits inside the same `try`/race, `fingerprintWithin` never rejects, never outlives the deadline, and any failure, sync throw or late answer is a cache bypass (nothing served, nothing stored). The cycle-0 low (abort landing during the step B gate) is closed and pinned. Adversarial hunt on the tenancy and cache-write paths (cross-tenant bucket, constant-fingerprint substitution on error AND on timeout, WhatsApp caching, stale-entry serve under a hung read, late-resolution/late-rejection after bypass, fingerprint scoped to the verified tenant) found no bypass.

## PROPOSED-ISSUE lines (no ledger rows written)
- PROPOSED-ISSUE low (test strength, C3 /search): apps/api/src/search-cache/search-cache.test.ts:190 `assert.ok(turnReads(calls) >= 2, "both calls recomputed")` is vacuous: one call alone reads `turns` at least twice (candidates + visibility), so a mutant making the fingerprint timeout resolve a constant `{fingerprint: ""}` (B4) survives in that file. The shared helper is pinned through route-router.test.ts, so no behaviour gap; tighten to compare read count per call.
- PROPOSED-ISSUE low (test strength, C3): route-router.test.ts cannot distinguish half the time left from all of it (B2b survives; maker already disclosed). Pinned only in search-cache.test.ts (B2a). Acceptable; note only.
- PROPOSED-ISSUE low (C7 scope, carried from cycle 0, filed-not-fixed per coordinator): the trusted tree read (`createMongoTreeStore`, apps/api/src/store.ts) carries no `maxTimeMS`.

## Notes (no backlog)
- File-scope flags (search-store.ts, production.ts, packages/ai provider/router/gemini) judged minimal and justified.
- Real-Mongo cost of the four fingerprint reads per cacheable request, and real-driver behaviour of `maxTimeMS` combined with `timeoutMS`, remain unmeasured (maker states both; no network allowed here).

Metrics: start=2026-10-29T14:10Z end=2026-10-29T14:50Z wall_min=40 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=13 cycle=1 resumes=0 tokens=unavailable check_min=40 check_s=2400 mutants=13
