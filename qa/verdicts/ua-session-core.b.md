# Verdict — ua-session-core (coordinator B, blind dual check)
**VERDICT:** PASS
**Cycle checked:** 1
**Checked state:** HEAD 3fb8e1f7 (base a5141234); code identical to 7624b4ab (`git diff 7624b4ab..HEAD` touches only qa/), so maker pre-check evidence was identity-valid, but every row below was re-run by me. Worktree D:/KnowledgeBase/.worktrees/ua-session-core, manifest Policy-Version proportional-verification/2026-10-19.17.
**Independence:** own runs only; the other coordinator's verdict, checkpoint and evidence were never read.
ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines below; no ledger rows, no manifest change)

## Criteria (each re-run by me, one test file per invocation, under `timeout 170`)
| Criterion | Evidence (my run) | Result |
|---|---|---|
| C1 matrix | principal.test.ts 9/9, sessions.test.ts 14/14, viewer-guard.test.ts 6/6 (incl. "pending 403 on EVERY route incl. every /admin route"); read auth.ts:76-82 and sessions.ts `resolve`; M6 killed | PASS |
| C2 existing auth | server.test.ts 10/10, system-status.test.ts 8/8, setup-status.test.ts 6/6, mint-scopes.test.mjs 10/10; the 3 source-text edits are mechanical (second argument), disclosed | PASS |
| C3 cookie | cookie.test.ts 6/6 (exact Set-Cookie for /knowledgebase, /, trailing slash) | PASS |
| C4 rotation | sessions.test.ts 14/14 + sessions.mongo.test.ts 6/6 on a real mongo:7 that I started (127.0.0.1:27097, stopped after) | PASS |
| C5 CSRF | cookie.test.ts + principal.test.ts; my probe: foreign Origin 403 csrf, wrong X-LKB-CSRF 403, Bearer and GET exempt | PASS |
| C6 viewer guard | viewer-guard.test.ts 6/6: "ua-session-core-A: 3/3 refused" (Checker A's reproductions via createServer), enumeration now includes /admin and asserts >= 6 /admin write routes exercised, detector bites, allowlist pinned; M1, M2, M3, M5, M7 killed | PASS |
| C7 roles | principal.test.ts + sessions.test.ts role-change test + mint-scopes 10/10 | PASS |
| C8 trust proxy | cookie.test.ts 6/6 | PASS |
| C9 ISS-415 / ISS-411 | sessions.mongo.test.ts 6/6 (global hash lookup, cross-tenant refused, IXSCAN, E11000 both directions); build.mjs regex `.(?:ps1|txt)` read in the diff | PASS |
T1: `npx tsc --noEmit -p apps/api/tsconfig.json` exit 0; `node scripts/snapshot.mjs --check` OK (180 lines, budget 200).

## Fix cycle 1 re-check (the defect A filed: guards read mount-stripped `req.path`)
Closed. viewer-guard.ts `fullPath(req)` = `req.baseUrl + req.path`; the only `req.path` readers were the two guards and both now use it. My own probe (fresh test file in the copy, over real HTTP with raw paths, viewer and pending sessions, through createServer with a stub admin router):
viewer POST `/admin/users`, `/Admin/users`, `/ADMIN/users`, `/admin//users`, `/admin/users/`, `/admin/%75sers`, `/admin/ask` -> all 403 read_only_role; `/ASK`, `//ask`, `/%61sk`, `/INGEST`, `/ingest` -> 403; only the exact allowlisted `/ask`, `/ask/`, `/ask?x=1` reach the handler. Pending GET/POST on `/admin/users`, `/ADMIN/users`, `/admin//users`, `/ask`, `/search`, `/authx`, `/auth.json` -> 403 account_not_active; `/auth/...` and `/AUTH/me` reach the public terminal /auth stub, as designed. `/auth/../admin/users` stays inside the /auth stub (503, never reaches admin). Credentials: bad Bearer + good cookie 401 (cookie not used to rescue it), `Basic` + cookie 401, duplicate cookie 401, good key reaches the admin stub (A6 owns scope checks).

## Falsification (in a copy of the tracked tree at HEAD under the scratchpad; node_modules junctions only to the originals; per-mutation byte backup, restore in finally, then `git hash-object` == `git rev-parse HEAD:<file>`)
7 mutants, 6 KILLED, 1 SURVIVED (a non-security-relevant lookalike, see P2), all head-fidelity=OK, bound worktree `git status` clean, copy removed (junctions unlinked first):
M1 `fullPath` returns `req.path` KILLED (viewer-guard.test.ts); M2 activeGuard reads `req.path` KILLED; M3 viewerGuard allowlist check reads `req.path` KILLED; M5 viewer may POST anything under `/admin/ask` KILLED; M6 auth.ts:76 `session && header === ""` -> `session` (cookie considered despite Authorization) KILLED (principal.test.ts); M7 activeGuard skipped for DELETE KILLED; M4 activeGuard exempt test `path.startsWith("/auth")` (adds `/authx`, `/authorize`) SURVIVED.

## Adversarial hunt (auth / tenancy / data-write paths touched)
Held: path-variant bypass of both guards (above); case, double-slash, percent-encoding and trailing-slash variants only ever fail toward 403; tenant taken from the user row only; cross-tenant row mismatch fails closed; keys cannot carry session fields; session principals have no `keyId`, so keyId-gated operator surfaces (automation, hosting, capture-readiness) answer 401/503 for them; rate limiter keys on tenantId so sessions are bucketed. No data-write path let a viewer or pending session through.

## PROPOSED-ISSUE
PROPOSED-ISSUE: {"issue":"P1","severity":"low","class":"design","title":"/admin (and public /auth) are mounted before createRateLimiter and usageRecorder, so authenticated admin traffic and login/signup are neither rate limited nor usage-recorded; maker already noted this for A6, A4 must also cover /auth brute force","file":"apps/api/src/server.ts:130-133","fix_direction":"A4/A6 apply a limiter inside their mounts or reorder"}
PROPOSED-ISSUE: {"issue":"P2","severity":"low","class":"test-gap","title":"activeGuard's /auth exemption survived a mutant widening it to any path starting with '/auth' (e.g. /authx); no test pins that a pending session is refused on a lookalike prefix. Not exploitable today (no such route; probe shows /authx -> 403) but a future /authorize route would be open to pending users","file":"apps/api/src/user-accounts/viewer-guard.ts:28","fix_direction":"add '/authx' and '/auth.json' as pending-refused cases to viewer-guard.test.ts; file-don't-fix per the round cap"}
PROPOSED-ISSUE: {"issue":"P3","severity":"low","class":"design","title":"`/auth` soft-principal attach runs csrfGuard on unsafe methods for any request carrying a valid session cookie, so a signed-in browser calling POST /auth/login or /auth/signup without Origin and X-LKB-CSRF gets 403 csrf instead of the public flow","file":"apps/api/src/composition/integrations/user-accounts.ts:93, principal.ts attach","fix_direction":"A4 decides: skip the session CSRF check on login/signup, or document that the SPA always sends the headers"}

## Notes (not issues)
- Rotation: a rotated Set-Cookie that never reaches the browser leaves the client on a token that becomes `previous`; after 30 s it reads as a replay and revokes the family. This is UA-14 as specified.
- A key principal reaches the `/admin` router; A6 must keep its own scope check on every route.
- Production wiring of `buildUserAccounts` is still absent (manifest open point 1), so nothing is live.
- Containers: I started `lkb-a3-mongo-chkB1` (--rm, 127.0.0.1:27097) and stopped it. Test files ran one per invocation under timeout.

Metrics: start=2026-10-29T06:20:00Z end=2026-10-29T06:42:00Z wall_min=22 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=7 cycle=1 resumes=0 tokens=unavailable builder_min=unavailable check_min=22 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1320 mutants=7 defects_unit=0 defects_6c=0
