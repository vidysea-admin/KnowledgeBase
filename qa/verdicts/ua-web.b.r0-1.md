# Verdict: ua-web (coordinator B, blind dual check)

**Cycle checked:** 0
**Unit:** A7 ua-web · **Base:** 146f23da · **Head:** 7d5eef2f · **Tier:** L (auth, apps/web/src/api/client.ts:42)
**Policy-Version:** proportional-verification/2026-10-19.17
**Checkpoint:** qa/checkpoints/ua-web.b.md
**VERDICT: PASS**

## Check plan (step 0)
Contract: docs/features/user-accounts/plan.md A7 items 1-7 + spec.md (no qa/contracts file). Evidence rebuilt on a pristine `git archive` of HEAD
(junctioned node_modules; the bound worktree was never written). Real browser (Playwright/Chromium) against a vite production build served by a
stand-in for the nginx routing, a real API (A3 routes, `AUTH_CSRF_SECRET`, `USER_SIGNUP_TENANT=toc`) and a throwaway local mongod 7.0. SERIAL: own
execution, because delegation of sub-checkers was refused by the handoff adapter (unknown Claude agent schema); no work was skipped for it.

## Per-criterion
- A7-1 PASS. Live T1..T5 on the work stack: signup -> check-email (DB `unverified`) -> admin issue-link (csrf present) -> `/verify#token` strips the fragment,
  no API call before the click, then verify 200 (`pending`) -> pending login lands on `/pending`, `/ask` bounces back -> admin approve role member (DB active,
  `approved` auth_event) -> member uses app, nav has no admin entries -> reopen restores via `GET /auth/session` -> sign out `POST /auth/logout` 200 -> `/api/sessions` 401.
  Zero uncaught JS or React errors on any page. Browser-logged resource errors exist (see P2); that is the literal "console error count 0" wording.
- A7-2 PASS. Live viewer: read-only banner shown, no admin nav; forced `POST /sessions`, `POST /keys`, `PUT /answer-policies`, `DELETE /sessions/x` with a valid CSRF proof all 403 `read_only_role`; reads 200.
- A7-3 PASS. Live under `/knowledgebase` (API `APP_BASE_PATH=/knowledgebase`): `/` redirects to `/knowledgebase/login`, all 46 anchors carry the prefix (0 root-absolute), cookie `lkb_sid` Path=/knowledgebase/api HttpOnly SameSite=Strict, deep link reload works, protected route signed out goes to login; `noRootAbsoluteHrefs` green (suite 126/126).
- A7-4 PASS. localStorage and sessionStorage empty after login, restore and logout; `document.cookie` empty; CSRF proof re-fetched from `GET /auth/session` after reload (write without header 403 `csrf`).
- A7-5 PASS. Admin `revoke-sessions` while the viewer was signed in: next call 401 -> login page with "this session has ended; sign in again", exactly 1 request, no loop after a further 2.5 s. Stale-401 fence killed by mutant 5b.
- A7-6 PASS. LoginGate/AuthContext/client/sessions suites green, `/login/key` path and flag-off path covered (mutant 6 killed 5 tests).
- A7-7 PASS. Failure states render under test (cookies blocked, 429, 503 not configured and unavailable, locked looks like wrong password, `signup_not_configured`, rejected). Live: 502 from a dead API shows a clear message.

## Falsification (floor; per-mutation copy, green-before, red-after, restore, hash equals pristine)
M2 readOnly=false: killed (2 tests). M3 `<a href="/login">`: killed (guard). M4 csrf to localStorage: killed (3). M4b unsafe-method set minus POST: killed (7).
M5a revoked clears no session: killed (1). M5b stale-401 fence removed: killed (3). M6 `Token` for `Bearer`: killed (5). M7 signup_not_configured message removed: killed (1).
**M1 SURVIVED**: deleting `if (accountState === "pending") return <Navigate to="/pending" />` (App.tsx:140) leaves 14/14 green. Live walk shows the guard works (T3), so product behaviour holds; the test gap is P3.

## Diff scope (4c)
23 files, all inside A7 (apps/web/src/api, auth, layout, pages/user-accounts, App.tsx, styles.css, tests), 1702 insertions, no deletions, LoginGate.tsx and config/ untouched. Bound worktree clean.

## Proposed issues (dual check: no ledger writes)
PROPOSED-ISSUE: {"id":"P1","sev":"medium","criterion":"A7-6","title":"App.accounts.test.tsx exits 1: 14/14 pass but 3 unhandled errors","detail":"Test 'API key path still works (item 6)' renders the real DashboardPage against a fake returning {}; DashboardPage.tsx:53/54/60 throw 'Cannot read properties of undefined (reading filter/length)'. `vitest run src/App.accounts.test.tsx` exits 1 (reproduced twice); manifest said '0 failed'.","fix_direction":"make the fake return arrays for /sources /keys /gaps (or stub the page)"}
PROPOSED-ISSUE: {"id":"P2","sev":"medium","criterion":"A7-1","title":"Browser console shows resource-load errors on normal pages","detail":"Every signed-out load logs 'Failed to load resource: 401' from the restore probe GET /auth/session; Dashboard fires GET /keys which 403s for every cookie principal (also admin); /answer-policies 403 for member on /ask. No JS errors. Literal 'console error count 0 per page' is unattainable without a server non-401 probe response or the dashboard skipping /keys for cookie sessions.","fix_direction":"amend A7-1 wording to 'no uncaught JS errors' or add a quiet probe route and gate /keys on API-key principals"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","criterion":"A7-1","title":"No test kills removal of the AccountGate pending redirect","detail":"App.tsx:140 survives mutation (14/14 green); the T3 test only covers the redirect made by LoginPage after sign-in, not a pending session navigating directly to a gated URL.","fix_direction":"add a test: pending session, visit /ask, expect /pending"}
PROPOSED-ISSUE: {"id":"P4","sev":"low","criterion":"A7-5","title":"Login redirect state `from` survives sign-out and is honoured by the next user","detail":"After sign-out the redirect to /login carries state from=<page>; a different account signing in on that history entry lands on the previous user's page (a member landed on an admin user-detail URL, 403 only). Mostly an info-leak of a URL; no data shown.","fix_direction":"clear `from` on sign-out or ignore it when the signed-in user differs"}

## Not defects (builder-declared)
`userAccounts` runtime flag missing from docker/40-lkb-runtime-config.sh; viewer controls not hidden per page (server 403 proven live); dev mode cross-origin; KnowledgeSpeakerProfilePage.test.tsx pre-existing red.

LIVE-BROWSER: Playwright/Chromium, local stack http://localhost:8099 (base "") and http://localhost:8098/knowledgebase; screenshots only in the checker scratchpad.
CAPABILITY-COVERAGE: not-applicable (no capability rows in the A7 contract)
ISSUES-WRITTEN: none (dual check; findings are PROPOSED-ISSUE P1..P4)
EXECUTOR: claude-sonnet-subagent
Metrics: start=2026-10-30T06:05:00Z end=2026-10-30T06:48:00Z wall_min=43 agent_min=unavailable blocked_min=0 suite_runs=3 repeat_runs=2 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2580 mutants=9 defects_unit=0 defects_6c=0
