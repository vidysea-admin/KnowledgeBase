# Verdict B (blind dual) — kb-route-hardening
**Cycle checked:** 0
**VERDICT: FAIL**
**Checked state:** HEAD 8e0263d1 (code 419b198e), base be9c8608. Policy-Version: proportional-verification/2026-10-19.17. Tier H (kept).
**Scope note:** consent is out of scope per D-210 (backend team owns it). C1 consent clauses are marked "out of scope per D-210" (neither PASS nor FAIL); the non-consent part of C1 ("any other visibility change") is covered by C2 evidence. No consent probing, no consent issues raised.

## Criteria
| Id | Result | Evidence (own runs, in a scratch worktree copy of HEAD) |
|---|---|---|
| C1 | consent part out of scope per D-210; non-consent visibility (index status/session binding) PASS via C2 | route-router.test.ts 16/16, search-cache.test.ts 15/15 |
| C2 | PASS | route-router 16/16. Falsify C2a: drop `status` from the sessions projection -> "index-failed vanishes from the very next /route" red (1 fail), restored |
| C3 | **FAIL** (hung read, see PROPOSED-ISSUE 1); the bypass-on-throw and no-WhatsApp-cache clauses hold | C3a constant fingerprint on failure -> 1 red; C3b cache WhatsApp results -> 1 red; both restored |
| C4 | PASS | search-cache 15/15; C4 mutant (consent out of sources projection) -> 2 red |
| C5 | PASS | bm25-router 16/16; margin 1.25 -> 1.0 -> 3+ red (constant, tie, near-tie) |
| C6 | PASS for the listed clauses (route() work, step B, router stop) with a low race (PROPOSED-ISSUE 2) | route-store 20/20, packages/ai router 9/9, providers 26/26. C6a no abort in router catch -> 1 red; C6b `check()` ignores signal -> 2 red; C6c router keeps trying after abort -> 1 red |
| C7 | PASS | C7 `maxTimeMS` no longer added -> route-store 2 red; real transport already honours `req.signal` (ai-transport.ts:39-49) |
| C8 | PASS | C8a no `thinkingConfig` -> 1 red; C8b `minimal`->`low` in production.ts -> 2 red (1 pre-existing); C8c yaml route chain changed -> judge.test 1 red. No other chain/provider changed (diff read) |
| C9 | PASS | docs/api/route-endpoint.md sections present and match the code (read) |
Regression: search-store 21, routes/search 11, server 10, production.test 4, mounted-routes 4, all green; `pnpm typecheck` (apps/api) clean; `snapshot.mjs --check` OK.
Pre-existing red re-verified on base be9c8608 (not charged): vectorless-routing.test.ts "Compose requires an explicit database ..." fails identically at base.
Falsifications: 12 mutations, each in the copy with its own byte backup, restored, `git hash-object` == `HEAD:<file>` after every one (all OK). Bound tree untouched.

## Why FAIL (one narrow defect, regression of a stated invariant)
route-router.ts awaits `deps.fingerprint(...)` BEFORE the `Promise.race` and its timer. The handler's own header and docs promise "hard deadline -> 503 route_timeout, never a hang". Probe (scratch test, not committed): fingerprint that never resolves, `deadlineMs: 100` -> request still pending at 1500 ms (HUNG), no 503. Before this diff nothing in /route awaited outside the race. `maxTimeMS` only bounds server execution, so a driver-side wait (server selection / pool exhaustion, default 30 s) blocks the request far past 3 s, once per request for every cacheable call. Fix direction: race the fingerprint read against the same deadline and treat a timeout as `state = null` (bypass the cache, then fall into the existing race / 503 path).

## PROPOSED-ISSUE lines
- PROPOSED-ISSUE medium (availability / hard-deadline regression, C3): apps/api/src/route/route-router.ts:~37 `await deps.fingerprint(tenantId, { deadlineAt })` sits outside the deadline race; a hung fingerprint read hangs /route past the hard deadline (probe: pending at 1500 ms with deadlineMs=100). Add a failing test with a never-resolving `fingerprint`, then bound it by the deadline and bypass the cache on timeout.
- PROPOSED-ISSUE low (C6): apps/api/src/route/route-store.ts:~113-115 the request-abort listener is added after `await gate(...)`; if the request signal aborted during that await the listener never fires, so the step B model call runs unaborted for up to its budget (<=1.2 s) before `check()` rejects. Fix: `if (ctl.signal?.aborted) throw new RouteTimeout()` before attaching, plus a test.
- PROPOSED-ISSUE low (C7 scope): the trusted tree read (`createMongoTreeStore`, apps/api/src/store.ts) carries no `maxTimeMS`; docs list only the fingerprint/gate/turns/overlay/visibility reads so no false claim, but the stated purpose of ISS-427 is not met for that read. File, do not fix now.

## Notes (no backlog)
- Maker's file-scope flag (search-store.ts, production.ts, packages/ai provider/router/gemini beyond the literal D-207 list) is a justified, minimal move/addition; not a defect.
- The fingerprint costs four tenant-wide projected reads per cacheable request; real-Mongo cost is unmeasured (maker says so).

Metrics: start=2026-10-29T12:05Z end=2026-10-29T12:50Z wall_min=45 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable check_min=45 check_s=2700 mutants=12
