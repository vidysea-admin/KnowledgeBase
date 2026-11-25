# Verdict — golive-launch-prep (coordinator A, dual check)
Date: 2026-11-25 · Bound root: D:/KnowledgeBase/.worktrees/kb-golive · Cycle checked: 0 · Policy-Version: proportional-verification/2026-11-22.19
Base a9bbeb98 · head judged 8ba84690 (code at 7aae458e; later commit adds only the manifest) · Integration branch release/kb-golive (merge-base = HEAD's base chain, confirmed)

## Check plan (step 0)
- Diff: apps/api/src/rate-limit.ts (product, auth-adjacent), rate-limit.test.ts, scripts/live-verify.mjs (operator script), live-verify.test.mjs, live-verify.pinned-question.json (data), two contract files, manifest. No UI path, no prompt/LLM output, no data artifact, no auth.ts/server.ts edit.
- Tier: L. Cited trigger: `apps/api/src/rate-limit.ts:30-31` (bucket key derived from the authenticated session principal). `tick.mjs --route a9bbeb98..8ba84690` printed floor L, dual false (only the `contracts` rule fired); manifest tier L equals the floor, no gap. Dual check is carried by the manifest's `dual-trigger: auth apps/api/src/rate-limit.ts:31` and the dispatch.
- Checks: (1) verify commands re-run; (2) falsification rows in throwaway copies outside the root (L2 by me, L1 by one read-only sub-checker, Sonnet); (3) step 4c diff-scope read; (4) security read of limiter key and of live-verify secret handling; (5) contract files byte-identity vs c32c8bbc; (6) Mode D not applicable.
- SERIAL: test runs were one at a time on this machine; the sub-checker's L1 copy runs overlapped only one of mine.
- full-suite trigger: auth L unit -> the repo-wide suite is deferred to the pre-push check (CI on the pushed branch), per the project resource note. The apps/api package suite (concurrency 1, `node --test --test-concurrency=1 --import tsx "src/**/*.test.ts"`, 302 files) was started once and hit my 560 s per-command cap after about 71 files (log: scratchpad/api-suite-A.log): everything that ran passed except `src/activity-health/router.test.ts` (1 red) and a file-level red on `evaluation-flywheel/workflow.test.ts` that was only the timeout kill (it passes alone). The remaining ~230 files were NOT run here (wall budget). The activity-health red is environmental and not owned by this unit: it fails at router.test.ts:150 (`spawnSync` of `.venv/Scripts/python.exe` returns status null, before the test reaches `startServer` at line 164 and so before the limiter), and it fails alone on this tree; I could not get a valid baseline run of it (a bare `git archive` copy lacks the repo venv). Instead I ran the behaviour-scoped set: the 15 other test files that mention rateLimit, rate_limited, createRateLimiter or 429 -> 209 tests, 190 pass, 0 fail (rest skipped).

## Evidence (all re-run by me on this tree)
- `node --test --import tsx src/rate-limit.test.ts src/jobs/router.test.ts` (cwd apps/api): 14 pass, 0 fail (9 new + 5 router).
- `node --test --import tsx scripts/live-verify.test.mjs` (root): 18 pass, 0 fail.
- `pnpm typecheck` (apps/api): no errors.
- Contracts: `git rev-parse c32c8bbc:qa/contracts/<f>.md` equals `HEAD:qa/contracts/<f>.md` for both files (e92e1a75..., 250a93af...): byte-identical, unedited by the maker.
- `git diff a9bbeb98 HEAD --stat` lists no change to auth.ts, server.ts, session guard, csrf, roles or viewer-guard: L2-I1 and L2-I3 hold by diff and by green tests that mount the real `requireAuth`.

## Criteria
- L2-C1 MET: per-user bucket test and session-id test green; both red on the old tenant key / on a sessionId key (below).
- L2-C2 MET: default 60, API-key tenant bucket, anonymous IP bucket, 429 body and Retry-After, and no-userId fallback all asserted; `rate-limit.ts:47` mount line untouched.
- L2-C3 MET: key reads only `req.auth` (rate-limit.ts:29-34); forged header/query/body test green; red when a header feeds the userId.
- L2-C4 MET: `\u0001` + JSON array is injective; `isValidTenantId` (auth.ts:59) rejects control characters, asserted in the test (line 152). I read auth.ts:59-69 myself.
- L2-C5 MET: 6 of 9 tests go red on the old key (reproduced).
- L2-C6 OPERATOR-PENDING: operator step on a deployed test tag; forbidden for this check by the project rule (no probe against a deployed address). Not evidenced here and not waived: the owner's tagged-URL run remains required.
- L2-I1, I2, I3 HOLD. I2: 429 body and headers carry no user/session/tenant id (test + red under a prefixed message); rate-limit.ts adds no logging.
- L1-C1..C6 MET: 18 tests green through a stub that reuses the real csrf.ts, roles.ts, viewer-guard.ts; each criterion has a named test and a reproduced falsification (below). I read the changed script regions at 335-365 and the diff's removed lines (import, API/WEB defaults, `if (!KEY)`, `process.exit` refactor; no existing behaviour deleted).
- L1-C7 OPERATOR-PENDING: tagged-URL run, forbidden here by the project rule; not waived.
- L1-I1 HOLD (new test pins the no-`--base` run, flags and exit codes; no earlier test existed). L1-I2 HOLD (no credential in the diff; test account is generated; script requires role viewer).

## Capability coverage (CAPABILITY-COVERAGE: 13/13 falsifiable rows reproduced; 2 rows enumerated NO-ISOLATING-FALSIFICATION by the builder, judged below)
Copies: C:/Users/Lenovo/AppData/Local/Temp/claude/6e9d41101c3c5a5b/3fb8d78b-cac7-406e-9e13-fe76f3d5cd42/scratchpad/chkA-l2 (mine) and .../chkA-l1 (sub-checker). Each copy ran GREEN before any edit (L2 9/9, L1 18/18), one single-hunk edit per row, restored and cmp-verified, bound tree untouched (`git status` clean).
| Row | Edit | Red after | Assertion that fired |
|---|---|---|---|
| L2-C1 | key returns `auth.tenantId` | 3 pass / 6 fail | "two viewers ..." deepEqual and "one viewer signing in again ..." |
| L2-C1 session id | key uses `sessionId` | 8 / 1 | "a new login does not reset the allowance" |
| L2-C2 | `opts.max ?? 100` | 8 / 1 | default-60 test strict-equal |
| L2-C3 | userId taken from `x-user-id` header | 8 / 1 | "Bob was not charged for Alice's forged requests" |
| L2-C4 | naive `tenant:user` join | 8 / 1 | "(a:b, c) and (a, b:c) are different pairs" |
| L2-I2 | 429 message prefixed with userId | 8 / 1 | body deepEqual, message shows `alice-user too many ...` |
| L1-C1 | API base drops base path | 5 / 13 | exit 2 at sign-in (stub 404) and body asserts |
| L1-C2 | console.log(password) after login | 17 / 1 | secret-scan "is not on the console" |
| L1-C3 | `tEnd > tStart` -> `>=` | 17 / 1 | `ask: zerolength` case; stdout shows the citation step flipped to PASS |
| L1-C4 | `exists = true` | 17 / 1 | typo'd-path test, exit 2 expected |
| L1-C5 | cookie-rejected condition -> `true` | 17 / 1 | "a sign-out that leaves the session alive is a FAIL" |
| L1-C6 | NOT-covered line disabled | 17 / 1 | regex `/NOT covered by this script/` |
L2-C5 follows from the C1 row. The L1-C7/L2-C6 row (operator) and the invariant row ("nothing changed") are builder-enumerated, not debt-with-issue; judged as such.

## Security read (changed code)
- `limiterKey` (rate-limit.ts:29-34): user part comes only from `req.auth`; session bucket can neither equal an API-key bucket (control-char prefix refused by `isValidTenantId`) nor another pair's bucket; no-userId sessions keep the tenant bucket, so nothing escapes the limit. Anonymous requests keep the IPv6-safe fallback. No logging added. No defect found.
- live-verify.mjs: password only in the login body (L273 in the sub-checker's read); error paths keep `err.name` only; no response body written to disk in signed-in mode; `--password`/`--email` refused. The only POSTs are login, ask, logout and the empty-body `/ingest` probes; I confirmed apps/api/src/routes/ingest.ts:29-32 answers 400 to `{}` before any work, so the operator-key control ingests nothing.

## PROPOSED-ISSUE lines (all low, none blocks)
PROPOSED-ISSUE: {"sev":"low","type":"gap","file":"scripts/live-verify.mjs:361","title":"route-existence control counts any non-404/non-0 answer (401 from a wrong operator key, 5xx) as 'route exists'; only the 404 case is tested","fix_direction":"require the control to be a 2xx/400-class answer, and add a wrong-key test"}
PROPOSED-ISSUE: {"sev":"low","type":"gap","file":"scripts/live-verify.mjs:369","title":"the logout request's own status is not asserted by any test: replacing its pass condition with `true` leaves 18/18 green (stub logout always 200)","fix_direction":"stub a failing logout and assert the step FAILs"}
PROPOSED-ISSUE: {"sev":"low","type":"gap","file":"scripts/live-verify.mjs:353","title":"a 403 from a missing CSRF proof or a 401 from an expired session reads as a role refusal on the viewer steps; the detail prints only the status","fix_direction":"re-check the session before the refusal steps or print the error code"}
PROPOSED-ISSUE: {"sev":"low","type":"security-hygiene","file":"scripts/live-verify.mjs:120-122","title":"preflight.json/summary.md write the --base/--api/--web values verbatim (userinfo in a URL would be written), mongoUrl redaction stops at the first '@', and --key is accepted on argv; none touches the new credential path","fix_direction":"strip URL userinfo before writing; refuse --key on argv like --password"}
Note (wording, not a row): contract L1-C6 lists login, logout and Ask as the only data-changing calls; the script also sends two empty-body POST /ingest probes that L1-C4 itself requires and the server rejects with 400.

HUMAN_GATE-REQUEST: run the two operator steps (L1-C7 live-verify against the test tag; L2-C6 two-viewer probe with the instance count recorded) with the owner's approval, then record the evidence header per [GI1]; they are the owner's acceptance for these two criteria and were not run here.

VERDICT: PASS
SCOREBOARD: 11/13 criteria met (L1-C7 and L2-C6 operator-pending, forbidden for this check by the project rule), 5/5 invariants hold
TIER: L (auth: limiter key derived from the session principal, apps/api/src/rate-limit.ts:30-31)
FAILURES: none
CAPABILITY-COVERAGE: 13/13 falsifiable rows reproduced (2 enumerated no-isolating rows judged)
LIVE-BROWSER: not-applicable (apps/api/src/rate-limit.ts, apps/api/src/rate-limit.test.ts, scripts/live-verify.*; no UI surface)
ISSUES-WRITTEN: none (dual check: 4 PROPOSED-ISSUE lines above, for the maker to mint)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Both units meet every criterion that can be evidenced without a deployed address; each falsification went red for the named reason in a copy that was green first, and the limiter key is built only from server-verified session fields with an injective encoding. L1-C7 and L2-C6 are tagged-URL operator steps that this check was told it cannot run, so the PASS covers the code and tests, not those two acceptances. The apps/api package suite was run once but only partly (time cap): no red is owned by this unit, a behaviour-scoped set of 15 test files that mention the limiter is green (209 tests, 0 fail), and the full package and repo-wide suites stay recorded as `full-suite trigger: auth L unit` for the pre-push check.
Metrics: start=2026-11-25T07:25:31Z end=2026-11-25T07:56:00Z wall_min=30 agent_min=36 blocked_min=0 suite_runs=1 repeat_runs=0 mutations=13 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=1830 mutants=0 defects_unit=0 defects_6c=0
