# Verdict — ua-session-core (coordinator B, blind dual check)
**VERDICT:** PASS
**Cycle checked:** 0
**Checked state:** HEAD e48a92af (base a5141234), worktree D:/KnowledgeBase/.worktrees/ua-session-core, manifest Policy-Version proportional-verification/2026-10-19.17
**Independence:** own runs only; no maker evidence reused as proof; other coordinator's files never read.
ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines below; no ledger rows, no manifest change)

## Criteria (each re-run by me, one test file per invocation, under `timeout`)
| Criterion | Evidence (my run) | Result |
|---|---|---|
| C1 matrix | principal.test.ts 9/9, sessions.test.ts 14/14; read auth.ts:76-82 and sessions.ts `resolve` against every matrix row; M1, M2, M11, M12 killed | PASS |
| C2 existing auth | server.test.ts 10/10, system-status.test.ts 8/8, setup-status.test.ts 6/6, mint-scopes 10/10; tsc --noEmit exit 0. 3 source-text assertions in 2 test files were edited (`requireAuth(deps.keyStore)` -> `requireAuth(deps.keyStore`), mechanical, disclosed; requireAuth/requireScope/key-store tests unmodified | PASS (note P4) |
| C3 cookie | cookie.test.ts 6/6 exact Set-Cookie strings for /knowledgebase, /, trailing slash; M3 killed | PASS |
| C4 rotation | sessions.test.ts + sessions.mongo.test.ts 6/6 on a real mongo:7 I started (127.0.0.1:27099, stopped after); M4, M5 killed | PASS |
| C5 CSRF | cookie.test.ts + principal.test.ts; M6 killed; Bearer and GET exempt asserted | PASS |
| C6 viewer guard | viewer-guard.test.ts 4/4 (>=40 write routes enumerated, detector bites, allowlist pinned); M7 killed | PASS |
| C7 roles | principal.test.ts roles test; mint-scopes.test.mjs 10/10; M8 killed | PASS |
| C8 trust proxy | cookie.test.ts hop test (0/1/2, spoofed XFF); M9 killed | PASS |
| C9 ISS-415 / ISS-411 | sessions.mongo.test.ts (global hash lookup, cross-tenant userId refused, IXSCAN not COLLSCAN, E11000 both directions); M10 killed; ISS-411 regex `.(?:ps1|txt)` matches the `new URL("./common-passwords.txt", import.meta.url)` literal in password-policy.ts and no other `.txt` URL exists in apps/packages, so the build cannot newly throw | PASS |
T1: `pnpm lint:structure` OK (10 stages, 0 failed); `node scripts/snapshot.mjs --check` OK.

## Falsification (in a copy under the scratchpad, apps/api/src only; per-mutation byte backup, restore in finally, then `git hash-object` == `git rev-parse HEAD:<file>`)
12 mutants, all KILLED, all head-fidelity=OK, bound worktree `git status` clean afterwards: M1 precedence (`session && header===""` -> `session`), M2 tenant-equality check removed, M3 SameSite=Lax, M4 grace/replay logic narrowed to retired-only, M5 Mongo CAS filter without tokenHash+rotatedAt, M6 Origin allowlist removed, M7 viewer guard exempts DELETE, M8 admin holds `hosting`, M9 invalid hop value -> 1, M10 every E11000 counted as duplicate email, M11 key keeps session fields, M12 pending flag dropped.

## Adversarial hunt (auth / tenancy / data-write paths touched)
Held: forged/junk/duplicate cookie, session id as token, cookie+Bearer (Bearer alone, junk Bearer not rescued), Authorization present but non-Bearer, Secure downgrade via X-Forwarded-Proto in production, tenant taken from user row only, lying store returning another tenant's user, tenant-scoped touch/rotate/revokeFamily (scopedCollection rewrites bulkWrite filters), storage failure -> 503 never "logged in", path tricks under /auth stay inside the terminal 404.
Found: P1 below (guards read the mount-stripped `req.path`). Probe in the copy: viewer `POST /admin/ask` -> 503 not_implemented (not 403 read_only_role); pending `GET /admin/auth/x` -> 503 (not 403 account_not_active); `POST /admin/ingest` and `GET /admin/other` are guarded correctly. Today the /admin router is a placeholder and A6 scope checks (`user-admin`, held by neither viewer nor pending) are the real control, so nothing escalates now: not a FAIL, filed for A6/merge.

## PROPOSED-ISSUE
PROPOSED-ISSUE: {"issue":"P1","severity":"medium","class":"security","title":"viewerGuard/activeGuard use req.path, which Express strips of the mount prefix under app.use('/admin', requireAuth(...)); viewer POST /admin/ask is treated as the allowlisted POST /ask and pending GET /admin/auth/x as an exempt /auth path","file":"apps/api/src/user-accounts/viewer-guard.ts:21,29","repro":"scratch probe in a copy: viewer session POST /admin/ask -> 503 not_implemented; pending session GET /admin/auth/x -> 503","fix_direction":"derive the path from req.baseUrl + req.path (or originalUrl pathname) in isReadLikePost/activeGuard, and add the /admin cases to viewer-guard.test.ts; A6 must also keep its own requireScope on every /admin route"}
PROPOSED-ISSUE: {"issue":"P2","severity":"low","class":"design","title":"/admin is mounted before createRateLimiter and usageRecorder, so authenticated admin traffic is neither rate limited nor usage-recorded","file":"apps/api/src/server.ts:131-133","fix_direction":"A6 decides: apply the limiter inside the admin mount, or mount /admin after it"}
PROPOSED-ISSUE: {"issue":"P3","severity":"low","class":"note","title":"C2 says existing auth tests pass unmodified; 3 mechanical source-text assertions in system-status.test.ts and setup-status.test.ts were loosened to `requireAuth(deps.keyStore` (still pins mount order, but matches any second argument)","file":"apps/api/src/routes/system-status.test.ts:112,123","fix_direction":"none needed; recorded for the ledger"}
PROPOSED-ISSUE: {"issue":"P4","severity":"low","class":"process","title":"this check ran 12 mutants against the tier-L cap of 10 (.9-4); the cap should be raised per criterion class or the mutant list trimmed next time","fix_direction":"process row only"}

## Notes (not issues)
- Rotation design: a response carrying the rotated Set-Cookie that never reaches the browser leaves the client on a token that becomes `previous`; after 30 s it reads as a replay and revokes the family. This is UA-14 as specified, recorded for A9.
- roles.md is PROPOSED (H-6); do not merge before Umesh approves. `buildUserAccounts` is not yet called by production.ts/index.ts (manifest open point 1), so nothing is live.
- Real Mongo container started and stopped by me (`lkb-b-mongo`, --rm, port 27099); the maker's `lkb-a3-mongo` was already gone.

Metrics: start=2026-10-29T05:36:00Z end=2026-10-29T05:56:00Z wall_min=20 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable builder_min=unavailable check_min=20 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1200 mutants=12 defects_unit=0 defects_6c=0
