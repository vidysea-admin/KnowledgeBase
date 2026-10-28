# Manifest — web-live-polish
**Contract:** none specific (QUEUE Wave 1 row web-live-polish, approved by Umesh 2026-10-28; scope G-A2 of docs/REMAINING-PLAN-2026-10-28.md; items taken only from references/portals/lkb-live.knowledge.md Findings)
**Goal task:** none
**Date:** 2026-10-28
**Status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: auth apps/web/src/api/client.ts:133
**Persona walk:** skip (no new screen, flow or user type; the login form gains an inline error line, /knowledge/profiles mounts an existing page)
**Issues addressed:** none (audit rows; new low rows ISS-WEB-001, ISS-WEB-002 in qa/issues.web.jsonl)
**Executor:** claude-sonnet-subagent
**Executor rationale:** small multi-file web change with precise design; edit-in-place on existing files.

## Criteria
- C1 A rejected key shows the server's own 401 message on the login form (audit: "Login gives no feedback on an invalid key").
- C2 A 401 with no usable body shows "That API key was not accepted."; a fresh gate shows no alert.
- C3 /knowledge/profiles is a mounted route rendering KnowledgeProfilesPage (audit: "renders an empty page").
- C4 /api/graph 404 ("no tree index yet") is an empty state in Analytics Citation coverage, not an error (audit: graph pages log a 404). Brain, Explorer, Knowledge directory, Profiles and Confidence graph already treat 404 as empty (read, unchanged).
- C5 Any non-404 graph failure in Analytics still shows its error alert (guard against over-broad C4).
- /analytics Developer-API symptom: NOT a web-source defect (route already renders AnalyticsPage, existing registered-in-router test passes); filed as ISS-WEB-001, no change.

## What changed (all edited in place)
- apps/web/src/api/client.ts `apiFetch` / `invalidateAuth`: the 401 body is read first, then the invalidation event carries `detail.message` (server message only when the body had one). Event ordering, session fencing and compare-and-clear logic unchanged.
- apps/web/src/auth/AuthContext.tsx: new `authError` state set when the event matches the current key (message or "That API key was not accepted."), cleared on setApiKey / clearApiKey.
- apps/web/src/auth/LoginGate.tsx: renders `authError` as `role="alert"`.
- apps/web/src/App.tsx: `<Route path="/knowledge/profiles" element={<KnowledgeProfilesPage />} />`.
- apps/web/src/pages/analytics/analyticsClient.ts: graph part maps ApiError 404 to `null`; AnalyticsPage.tsx renders the empty note for `null`.
- Tests added (no existing assertion edited): LoginGate.test.tsx C1,C2; App.routes.test.tsx C3; AnalyticsPage.test.tsx C4,C5.
- Not touched: apps/api, any other file. Dual check required because the diff changes the web 401/session-invalidation path (auth).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 9 files, 5 criteria, est 40 min, single builder, one test file per vitest invocation, no checker dispatch by the builder
slow-plan: five criteria across auth, routing and analytics, each needing its own falsification; vitest start-up is minutes per file on this loaded machine, so the round is wall-clock heavy, not large
mutant-cap-raise: one falsification per criterion is mandatory (C1-C5 are five independent criteria); no extra mutants beyond that
Tier: M (client auth-state handling plus two small UI changes; no server auth enforcement, tenancy or data write changed; dual-trigger: auth apps/web/src/api/client.ts:133)
Base / checked state: base 338d2178; code commit a6cc8074 on the web-live-polish worktree branch (the manifest commit follows and touches only qa/).
Affected tests: apps/web src/auth/*.test.tsx (4 files), src/api/client.test.ts, src/App.routes.test.tsx, src/pages/analytics/*.test.*, src/pages/knowledge/KnowledgeProfilesPage.test.tsx, profileRealShapes.test.tsx. A whole-suite vitest run was attempted once: it timed out on many unrelated tests (5 s default test timeout under heavy machine load from other sessions), so it is not claimed.
Independent review: NOT run by the builder; the checker owns review.
Known limits: server-side behaviour of /api/graph (404 vs empty 200) is unchanged (apps/api, out of scope), so the browser network log still shows the 404 (ISS-WEB-002). The LoginGate message is only as good as the server's 401 body text.
Tests[C1]: apps/web/src/auth/LoginGate.test.tsx::"[C1] a rejected key shows the server's 401 message on the login form"
Tests[C2]: apps/web/src/auth/LoginGate.test.tsx::"[C2] a 401 with no usable body falls back to a plain 'key not accepted' message, and a fresh gate shows no alert"
Tests[C3]: apps/web/src/App.routes.test.tsx::"[C3] /knowledge/profiles is a declared route and renders the profiles page, not a blank shell"
Tests[C4]: apps/web/src/pages/analytics/AnalyticsPage.test.tsx::"[C4] /graph 404 (no tree index yet) is an empty state in Citation coverage, not an error"
Tests[C5]: apps/web/src/pages/analytics/AnalyticsPage.test.tsx::"[C5] a non-404 graph failure still shows the error alert"
Tests[R1]: apps/web src/api/client.test.ts (11), src/auth/AuthContext.test.tsx (8), AuthContext.ordering.test.tsx (22), AuthContext.replay.test.tsx (2), KnowledgeProfilesPage.test.tsx (6), profileRealShapes.test.tsx (4), analytics/analyticsModel.test.ts (14) — unmodified, green
Pre-check[C1]: a6cc8074 npx vitest run src/auth/LoginGate.test.tsx (cwd apps/web) -> exit 0, 6 passed t=1 blobs=apps/web/src/auth/LoginGate.test.tsx:61de1909
Pre-check[C2]: a6cc8074 npx vitest run src/auth/LoginGate.test.tsx (cwd apps/web) -> exit 0, 6 passed t=1 blobs=apps/web/src/auth/LoginGate.test.tsx:61de1909
Pre-check[C3]: a6cc8074 npx vitest run src/App.routes.test.tsx (cwd apps/web) -> exit 0, 4 passed t=1 blobs=apps/web/src/App.routes.test.tsx:aef9f406
Pre-check[C4]: a6cc8074 npx vitest run src/pages/analytics/AnalyticsPage.test.tsx (cwd apps/web) -> exit 0, 15 passed t=1 blobs=apps/web/src/pages/analytics/AnalyticsPage.test.tsx:581c965f
Pre-check[C5]: a6cc8074 npx vitest run src/pages/analytics/AnalyticsPage.test.tsx (cwd apps/web) -> exit 0, 15 passed t=1 blobs=apps/web/src/pages/analytics/AnalyticsPage.test.tsx:581c965f
Pre-check[R1]: a6cc8074 npx vitest run src/api/client.test.ts; npx vitest run src/auth/AuthContext.test.tsx; npx vitest run src/auth/AuthContext.ordering.test.tsx; npx vitest run src/auth/AuthContext.replay.test.tsx; npx vitest run src/pages/knowledge/KnowledgeProfilesPage.test.tsx; npx vitest run src/pages/knowledge/profileRealShapes.test.tsx; npx vitest run src/pages/analytics/analyticsModel.test.ts (cwd apps/web) -> exit 0, 11+8+22+2+6+4+14 passed t=7
Pre-check[T1]: a6cc8074 npx tsc --noEmit -p tsconfig.json (cwd apps/web) -> exit 0, clean t=1
Metrics: builder_min=40 mutants=5 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
Before any source edit the new LoginGate tests ran against HEAD source: "LoginGate.test.tsx (6 tests | 2 failed)" — [C1] and [C2] failed, the 4 existing passed. C3/C4/C5 were written in the same step; their red state is shown by the falsifications below (each fails with the production change removed).

## Falsifications (one per criterion)
Per-mutation byte backup taken immediately before each single mutation and restored right after it (`timeout 200`, no EXIT trap, committed tree). After each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (fidelity OK for all 5); `git status` showed no tracked changes afterwards.

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | LoginGate.tsx removed the `{authError && <p role="alert" ...>}` line | LoginGate.test.tsx | 2 failed / 4 passed ([C1], [C2]) |
| C2 | AuthContext.tsx fallback string `"That API key was not accepted."` -> `"Error"` | LoginGate.test.tsx | 1 failed / 5 passed ([C2]) |
| C3 | App.tsx removed the `/knowledge/profiles` Route line | App.routes.test.tsx | 1 failed / 3 passed ([C3]) |
| C4 | analyticsClient.ts `status === 404) return null;` -> `throw error;` | AnalyticsPage.test.tsx | 1 failed / 14 passed ([C4]) |
| C5 | analyticsClient.ts `error instanceof ApiError && error.status === 404` -> `true` | AnalyticsPage.test.tsx | 1 failed / 14 passed ([C5]) |

## How to verify
- From apps/web, one file per run: `npx vitest run src/auth/LoginGate.test.tsx` (6), `src/App.routes.test.tsx` (4), `src/pages/analytics/AnalyticsPage.test.tsx` (15), plus the regression files listed under Tests[R1].
- `npx tsc --noEmit -p tsconfig.json` in apps/web -> exit 0.
- `git diff 338d2178 a6cc8074 --stat` touches only apps/web/src (9 files).
