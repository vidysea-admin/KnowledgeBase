# Verdict — ua-web (coordinator B, cycle 1, repair check)
Date: 2026-10-30 · Bound root: D:/KnowledgeBase/.worktrees/ua-web · Base 146f23da · Head 1aa2dd93 (fix diff 7d5eef2f..HEAD, code 2074f299) · Policy-Version: proportional-verification/2026-10-19.17 · Cycle checked: 1
(The prior-cycle B verdict is kept as qa/verdicts/ua-web.b.r0-1.md and was not consulted.)

## Check plan (step 0)
Tier L (dual trigger apps/web/src/api/client.ts:42). UI changed -> live browser walk on a local stack (mongod 7.0 on 127.0.0.1:27555, db uacheck_work; API started with a clean environment from a git-archive copy outside the bound root; production never touched). Logic -> re-run the A7 verify commands + falsification floor. Security read of the repair diff (client.ts, AuthContext.tsx, WriteScope.tsx, LoginPage safeFrom). Everything ran in a copy under the session scratchpad; the bound tree stayed clean before this verdict. All PIDs I started (mongod, 2 API, 2 static/proxy servers) were stopped.

## Evidence
- A7 verify commands, one combined run of 14 files (App.accounts, App.readonly, AccountPages, AuthContext.session, client.session, AuthContext.ordering, AuthContext.replay, LoginGate, AuthContext, client, sessions, noRootAbsoluteHrefs, App.routes, App.wiring): 161 passed, 0 failed, exit 0, no "Unhandled Errors" block (FAIL-1 exit is fixed). `tsc --noEmit` exit 0.
- LIVE, root mount (one origin): T1 signed-out `/` -> `/login`; "Create an account" -> `/signup` -> `/signup/check-email`; users row `unverified`. T2 admin issues the link (shown once); a private window opens `/verify#token=..`, address bar becomes `/verify`, Confirm -> row `pending`. T3 sign-in -> `/pending`; `/ask` -> `/pending`. T4 admin Approve with role member -> row `active`/`member`, `approved` auth_event. T5 member: `/ask` works, no banner, no Users nav; localStorage and sessionStorage empty after login; cookie `lkb_sid` httpOnly, SameSite Strict, persistent; a new context holding only persistent cookies is still signed in on `/ask`; Sign out -> `/login`; `fetch('/api/sessions')` 200 before, 401 after. Zero JS pageerrors on every page walked.
- LIVE A7-2: a viewer (approved by the admin through the UI) sees the read-only banner everywhere. On the 16 whole-page write routes (/ingest /settings /connectors /knowledge-outputs /accounts /automation /automation/forms /championship /calibration-review /extraction-review /label-review /answer-review /answer-policy /answer-policies /knowledge/collections /whatsapp) a `fieldset.write-scope[disabled]` is present and no enabled control sits outside the sidebar and search box; `/ask` stays usable. Devtools `POST /api/ingest` and `POST /api/keys` with a valid CSRF proof -> 403 `read_only_role`; without the proof -> 403 `csrf`.
- LIVE A7-3, mount `/knowledgebase` (API APP_BASE_PATH=/knowledgebase): `/knowledgebase/` -> `/knowledgebase/login`; auth links `/knowledgebase/signup|forgot|login/key`; no root-absolute href after login; cookie `Path=/knowledgebase/api`; `/knowledgebase/ask` works; Sign out -> `/knowledgebase/login`, API 401.
- LIVE A7-5: admin "Sign out all sessions" on a logged-in member; the member's next call -> 401 `session_revoked`, UI on `/login` showing "this session has ended; sign in again", exactly one 401, no loop after 2.5 s, re-login returns to `/sessions`.
- A7-6 / A7-7: existing LoginGate / AuthContext / client suites are green in the run above; A7-7 failure states (cookies blocked, 429, 503, locked) were checked by component tests only, not live.

## Falsification floor (throwaway copy, per-mutation byte backup, `git hash-object` == `rev-parse HEAD:` after each)
| Crit | Mutation | Result |
|---|---|---|
| A7-1 | fixture catch-all `sources/keys/gaps` removed (App.accounts.test.tsx) | 19 pass, but exit 1 with Unhandled Errors (FAIL-1 reproduced) |
| A7-2 | `WriteScope` made inert (WriteScope.tsx) | 20 failed / 4 passed in App.readonly |
| A7-5 | signOut not-confirmed branch removed (AuthContext.tsx:175) | 3 failed |
| A7-5 | stale-401 guard `sentSession !== authSession` removed (client.ts:61) | 2 failed |
| A7-4 | CSRF token mirrored to localStorage (client.ts:39) | 3 failed |
All five restored with hashes equal to HEAD. Mutants beyond the floor: 0.

## Criteria
A7-1 MET (live T1..T5 asserted by state change; console count see P2) · A7-2 MET as "disabled inside a read-only scope" (builder open point 3 accepted: control present but inert, server 403 proven live) · A7-3 MET live + guard test · A7-4 MET · A7-5 MET live + unit · A7-6 MET · A7-7 MET (tests).
FAIL-1 (test exit) fixed. FAIL-2 (viewer write controls) fixed on every route reachable live; /meeting-bot is covered by tests only because of P1.

PROPOSED-ISSUE: {"id":"P1","sev":"high","type":"integration","title":"Opening /meeting-bot signs every account user out","evidence":"live: member and viewer session, GET /api/meeting-bot/capture-readiness -> 401 {error:unauthorized} (apps/api/src/capture-readiness/router.ts:14 requires req.auth.keyId, a cookie session principal has none); apps/web/src/api/client.ts:164 treats every 401 on the session credential as session end, so the UI shows the login page 'You were signed out'. Only /meeting-bot among 40 routes did this. About 20 other routers read auth.keyId (hosting, automation, counsellor-accounts, label-review, ...) and may do the same for data-gated calls.","fix_direction":"server: keyless session principals get 403 (or resolve to a principal) on keyId-guarded routers; optionally web: sign out only on 401 session_revoked/session_expired or a 401 from /auth/session, not on a route-level 401","owner":"api integration (A4/A6 principal) plus web"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","type":"console","title":"Browser console error lines on normal account use","evidence":"live: 401 GET /auth/session on every signed-out first load (restore probe); 403 GET /api/keys from DashboardPage for every account user; 403 GET /api/answer-policies on /ask for a member. No JS exceptions. The criterion text says console error count 0; the brief put 401/403 console wording out of scope, so not blocking.","fix_direction":"skip listKeys for session principals; accept the session probe 401 or answer it 200 anonymous"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","type":"ux","title":"Whole-page WriteScope also disables read-only interactions on those pages","evidence":"the fieldset disables every button/select inside the wrapped route (filters and tabs on /automation, /championship, ...), so a viewer cannot browse them. Also POST /api/ask returned 429 for a viewer after one earlier call in the run (rate limiter, not investigated).","fix_direction":"scope only the write sections where a page mixes reads and writes"}

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, 3/3 invariants hold (storage clean, stale-401 guard, base path)
TIER: L (client session/CSRF handling, dual-trigger apps/web/src/api/client.ts:42)
FAILURES: none (P1..P3 are proposed issues, non-blocking under reviewer scope; read P1 first)
CAPABILITY-COVERAGE: not-applicable (web client)
LIVE-BROWSER: performed on a local stack with Playwright, no BLOCKED-CAPABILITY
ISSUES-WRITTEN: none (dual check, PROPOSED-ISSUE lines only)
EXECUTOR: claude-sonnet (maker-delegate) (checker: claude-sonnet-subagent)
EXPLANATION: All seven A7 criteria hold on HEAD 1aa2dd93, both cycle-0 failures are fixed and falsifiable, and the signup-verify-approve-login-persist-logout walk plus viewer, base-path and revoke cases work live with no JS errors. One real defect surfaced live outside the changed lines: an API router that rejects cookie principals with 401 makes the web client sign the user out on /meeting-bot (P1); it is a proposed issue, not a FAIL, because the root cause is unchanged server code and the client rule matches the A7 plan text.
Metrics: start=2026-10-30T12:48:00+05:30 end=2026-10-30T13:12:00+05:30 wall_min=24 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=5 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1440 mutants=0 defects_unit=0 defects_6c=0
