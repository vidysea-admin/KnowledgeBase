# Verdict - web-live-polish (coordinator A, blind dual check)

**Cycle checked:** 0
**VERDICT:** PASS
**Policy-Version:** proportional-verification/2026-10-19.17
**Checked state:** HEAD d6f561a3 (code a6cc8074, base 338d2178); diff touches apps/web/src (9 files) plus qa/ only.
**Tier:** M, dual (auth: apps/web/src/api/client.ts:133)

## Evidence (own runs, one vitest file per invocation, --testTimeout=60000, timeout 540)
- LoginGate.test.tsx 6/6, App.routes.test.tsx 4/4, AnalyticsPage.test.tsx 15/15 (C1-C5 all present and green).
- Regression, unmodified: client.test.ts 11/11, AuthContext.test.tsx 8/8, AuthContext.ordering.test.tsx 22/22, AuthContext.replay.test.tsx 2/2.
- npx tsc --noEmit -p apps/web/tsconfig.json: exit 0.
- Bound tree untouched: git status clean after all runs; HEAD unchanged.

## Falsification (one per criterion, in a git-archive copy of HEAD, per-mutation byte backup, git hash-object == git rev-parse HEAD:<path> after each restore)
| Crit | mutation (differs from maker's) | result |
|---|---|---|
| C1 | client.ts drop `serverMessage` arg to invalidateAuth | LoginGate: [C1] failed, 5 passed; fidelity OK |
| C2 | AuthContext.tsx fallback text -> "Error" | [C2] failed, 5 passed; fidelity OK |
| C3 | App.tsx delete the /knowledge/profiles Route line | [C3] failed (AssertionError path list), 3 passed; fidelity OK |
| C4 | analyticsClient.ts `=== 404` -> `=== 405` | [C4] failed, 14 passed; fidelity OK |
| C5 | analyticsClient.ts `=== 404` -> `>= 400` | [C5] failed, 14 passed; fidelity OK |
All five killed by exactly the named test; mutation harness ended with no EXIT trap, copy blobs equal HEAD blobs.

## Per-criterion
- C1 PASS: 401 body is read, server message flows invalidateAuth -> event detail.message -> AuthContext.authError -> LoginGate role=alert.
- C2 PASS: empty/non-JSON body falls back to "That API key was not accepted."; fresh gate has no alert; setApiKey/clearApiKey reset authError.
- C3 PASS: Route mounted before speakers routes, renders heading "Topic and speaker profiles".
- C4 PASS: 404 from /graph maps to null and renders an empty note; no alert, no NaN.
- C5 PASS: non-404 (503) still yields "Unable to load the graph."

## Adversarial hunt on the auth path (no blocking finding)
- Session fencing and compare-and-clear unchanged; fence is now checked after the body read, which is stricter (a logout/login during the read still drops the stale event). Key-equality guard still prevents a different-key tab being logged out.
- Server message is rendered as a React text child (escaped), so no injection; message only arrives on a 401 for the tab's current key.
- Behaviour change worth recording: invalidation now waits for the 401 body to finish. A server that sends 401 headers and then stalls the body would delay logout (fetch has no timeout here; the pre-existing behaviour was immediate). Not reachable with this API; low.
- 200 with literal JSON `null` for /graph previously rendered "returned no edges"; now renders "No knowledge graph has been indexed". Cosmetic.

## Notes
- ISS-WEB-001 / ISS-WEB-002 (maker-filed low rows) are plausible and correctly scoped out; not re-judged.

PROPOSED-ISSUE: low | apps/web/src/api/client.ts:127-133 | 401 invalidation now awaits res.json(); a stalled 401 body delays session invalidation (no abort/timeout on apiFetch). Consider invalidating first and patching the message after, or a body-read timeout.
PROPOSED-ISSUE: low | apps/web/src/pages/analytics/analyticsClient.ts:39 | any 404 from /graph (including a misrouted proxy path) is rendered as "not indexed yet"; same stance as the other graph pages, but the note cannot distinguish the two.

ISSUES-WRITTEN: none (dual check; coordinator writes no ledger rows)

Metrics: check_min=40 mutants=5 suite_runs=7 repeat_runs=0 policy=proportional-verification/2026-10-19.17 cycle=0 tokens=unavailable
