# Verdict B (blind dual coordinator) -- web-live-polish
Cycle checked: 0
Checked: base 338d2178 .. code a6cc8074, manifest commit 98ce63e9 (worktree clean, `git status` empty before and after).
Policy-Version: proportional-verification/2026-10-19.17 (judged under the manifest pin)

## Check plan (step 0)
Tier M, dual (dual-trigger auth apps/web/src/api/client.ts:133). Steps: identity check of the diff vs manifest; read all 6 product files; run the 3 criterion test files and 7 regression files one per vitest invocation under timeout; `tsc --noEmit`; 5 falsifications in a copy; auth-path bypass read.

VERDICT: PASS
SCOREBOARD: 5/5 criteria met, floor met (tsc clean, regressions green, falsification red on every criterion)
TIER: M (web client 401 message plumbing, one route, one empty state; no server auth, tenancy or write change)

## Criteria evidence (checker's own runs, bound tree, cwd apps/web)
| Id | Evidence | Result |
|---|---|---|
| C1 | `npx vitest run src/auth/LoginGate.test.tsx` -> 6 passed; code read: client.ts apiFetch reads the 401 body, then `invalidateAuth(apiKey, sentSession, serverMessage)`; AuthContext sets `authError` only when `keyRef.current === failed`; LoginGate renders `role="alert"` | met |
| C2 | same file; fallback string "That API key was not accepted." in AuthContext handleAuthInvalidated; `[C2]` asserts no alert on a fresh gate | met |
| C3 | `npx vitest run src/App.routes.test.tsx` -> 4 passed; App.tsx:81 `<Route path="/knowledge/profiles" element={<KnowledgeProfilesPage />} />` inside the gated shell | met |
| C4 | `npx vitest run src/pages/analytics/AnalyticsPage.test.tsx` -> 15 passed; analyticsClient.ts:39 maps ApiError 404 to null, AnalyticsPage.tsx:72 renders the empty note | met |
| C5 | same file; non-404 (503) still yields `Unable to load the graph.` alert | met |
| T1 | `npx tsc --noEmit -p tsconfig.json` -> exit 0 | met |
| R1 | client.test.ts 11, AuthContext.test.tsx 8, AuthContext.ordering.test.tsx 22, AuthContext.replay.test.tsx 2, KnowledgeProfilesPage.test.tsx 6, profileRealShapes.test.tsx 4, analyticsModel.test.ts 14: all exit 0, counts match the manifest | met |

Identity: the manifest's blobs matched (LoginGate.test 61de1909, App.routes.test aef9f406, AnalyticsPage.test 581c965f); test counts equal the manifest's Pre-check lines. I re-ran everything myself; no maker run was reused as evidence.

## Falsification (own mutants, in a copy under the scratchpad with node_modules and packages as junctions; the bound tree was never edited)
Per-mutation byte backup, restored right after each run (no EXIT trap); after each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (restored_ok=yes x5). Mutants differ from the maker's.
| Id | Mutant | Observed |
|---|---|---|
| C1 | client.ts drop `serverMessage` from the invalidateAuth call | only [C1] failed (1 failed / 5 passed) |
| C2 | AuthContext fallback string -> `null` | only [C2] failed (1 failed / 5 passed) |
| C3 | App.tsx route path `/knowledge/profiles` -> `/knowledge/profile` | only [C3] failed (1 failed / 3 passed) |
| C4 | analyticsClient.ts `status === 404` -> `=== 410` | only [C4] failed (1 failed / 14 passed) |
| C5 | analyticsClient.ts drop the `status === 404` test (swallow every ApiError) | only [C5] failed (1 failed / 14 passed) |
Harness note: my first C3/C4/C5 attempt was invalid (copy lacked `packages/`, suite failed to load; and an MSYS path-conversion mangled the C3 pattern so the mutant never applied, rc=0). Both were fixed and C3-C5 re-run; the table is from the valid runs only.

## Security read (auth path the diff touches)
- 401 handling: invalidation now runs after the body read. Session fence (`sentSession !== authSession`) and compare-and-clear are unchanged and still evaluated at dispatch time, so a stale or other-tab 401 cannot set `authError` (it requires `keyRef.current === failed`) or clear a newer key. setApiKey and clearApiKey reset `authError`.
- The displayed text is the server's own 401 message rendered as a React text node (no HTML injection). apps/api auth.ts:46,53 messages do not echo the submitted key. A non-string `message` falls back to the plain text.
- No tenancy, data-write or server enforcement change; apps/api untouched.

PROPOSED-ISSUE: {"sev":"low","area":"web-auth","title":"401 invalidation now waits on the response body read","detail":"apiFetch/invalidateAuth ran before res.json(); it now runs after it (client.ts ~L120-133). A server that sends a 401 head and then stalls the body delays logout; there is no fetch timeout or abort. Practical impact is small (same-origin own API).","fix_direction":"read the body with a short race/timeout, or invalidate first and attach the message through a second event"}
PROPOSED-ISSUE: {"sev":"low","area":"web-auth","title":"Any 401 body message is shown on the login form","detail":"AuthContext shows detail.message for any 401, including one the API might proxy from a downstream provider. The API's own 401 texts are safe (auth.ts:46,53).","fix_direction":"optionally allow-list the two known auth messages or cap the length"}

FAILURES: none
CAPABILITY-COVERAGE: not-applicable (no capability rows in the manifest)
LIVE-BROWSER: not-applicable (jsdom component tests only; no network or browser run by instruction)
ISSUES-WRITTEN: none (dual coordinator; PROPOSED-ISSUE lines above)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All five criteria are evidenced by my own test runs and each is falsified by a distinct mutant that fails only its own test. The auth-path change preserves the session fence and compare-and-clear, adds no key echo or HTML injection, and no regression file moved. The two low observations are non-blocking.
Metrics: start=2026-10-28T10:36:00Z end=2026-10-28T11:08:00Z wall_min=32 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1920 mutants=0 defects_unit=0 defects_6c=0 check_min=32 slow: vitest start-up 30-150 s per file under machine load (13 file runs + 6 mutant runs)
