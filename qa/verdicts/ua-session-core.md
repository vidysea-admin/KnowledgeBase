# Verdict A — ua-session-core (coordinator A of a blind dual check), fix cycle 1
Cycle checked: 1
VERDICT: PASS
Policy-Version: proportional-verification/2026-10-19.17
TIER: H (authentication, sessions, tenancy, authorization; dual-trigger apps/api/src/auth.ts:76)
Checked code SHA: 7624b4ab (HEAD 3fb8e1f7 adds only the manifest). Base a5141234. Cycle 0 FAIL was 9c72515d (C1, C6).
Dual-check blindness: coordinator B's verdict, checkpoint and evidence were not read.

## Check plan
Read the cycle-1 diff (viewer-guard.ts, viewer-guard.test.ts, roles.md Status) plus auth.ts, principal.ts, csrf.ts, server.ts and the composition module. Re-ran every acceptance test myself, one file per `node --test --import tsx` under a 170 s timeout, real mongod in my own container `lkb-a3-mongo-chkA1` (127.0.0.1:27096, stopped afterwards). Ran tsc and the snapshot check. Ran 10 falsifications in a copy (git archive of HEAD, node_modules junctions; per-mutation byte backup in a finally; `git hash-object` == `git rev-parse HEAD:<file>` after each). One adversarial probe test inside the copy (not committed) drove the real `createServer` over HTTP. Maker evidence not reused.

## Criteria (each evidenced by me)
| Criterion | Result | Evidence |
|---|---|---|
| C1 principal matrix | PASS | principal.test.ts 9/9, sessions.test.ts 14/14, viewer-guard.test.ts 6/6 incl. "pending is 403 account_not_active on EVERY route" (all /admin stub routes). Cycle-0 defect closed: probe pending `GET /admin/auth/x` -> 403 account_not_active (was 200). M6 (cookie beats Bearer) KILLED, M7 (tenant check removed) KILLED. |
| C2 existing tests, API-key path | PASS | server.test.ts 10/10, system-status.test.ts 8/8, setup-status.test.ts 6/6, mint-scopes.test.mjs 10/10, no test modified except the 3 mechanical literal edits. |
| C3 cookie attributes | PASS | cookie.test.ts 6/6 (exact Set-Cookie for /knowledgebase, /, trailing slash). Unchanged since cycle 0. |
| C4 rotation, CAS, replay (real Mongo) | PASS | sessions.mongo.test.ts 6/6 on mongo:7. M10 (CAS filter drops tokenHash and rotatedAt) KILLED by sessions.mongo.test.ts. |
| C5 CSRF | PASS | cookie.test.ts + principal.test.ts pass. M8 (CSRF compare -> true) KILLED. |
| C6 viewer guard enumeration | PASS | Cycle-0 reproductions, by id: ua-session-core-A 3/3 refused (pending GET /admin/auth/x 403 account_not_active; viewer POST /admin/ask and POST /admin/citations/native/resolve 403 read_only_role). The enumeration no longer exempts /admin (only the public /auth perimeter) and asserts >= 6 /admin routes exercised. M1, M2, M3, M4, M5, M9 all KILLED. |
| C7 role to scope | PASS | sessions.test.ts + principal.test.ts + mint-scopes pass (unchanged since cycle 0). |
| C8 trust proxy | PASS | cookie.test.ts 6/6 (unchanged). |
| C9 ISS-415 / ISS-411 | PASS | sessions.mongo.test.ts 6/6 (global hash lookup, cross-tenant E11000, IXSCAN) and sessions.test.ts; build.mjs untouched this cycle (ISS-411 verified at cycle 0). |
| T1 tsc / snapshot | PASS | `tsc --noEmit -p apps/api/tsconfig.json` exit 0; `node scripts/snapshot.mjs --check` OK (180 lines). |

## Falsification (10 mutants, all KILLED, all head-fidelity=OK)
M1 viewerGuard back to req.path; M2 activeGuard back to req.path; M3 fullPath drops baseUrl; M4 /auth exemption `startsWith` -> `includes` (would admit /admin/auth/x); M5 allowlist widened with `POST /admin/ask`; M9 viewer check skipped when baseUrl is non-empty: all KILLED by viewer-guard.test.ts. M6 cookie beats Bearer (auth.ts:76) KILLED by principal.test.ts. M7 tenant check removed KILLED by sessions.test.ts. M8 CSRF compare -> true KILLED by principal.test.ts. M10 CAS filter weakened KILLED by sessions.mongo.test.ts. No survivors.

## Adversarial probe (real createServer, stub admin router, viewer and pending sessions)
Viewer POST to `/ADMIN/ask`, `/admin/ask/`, `/admin//ask`, `/admin/ASK`, `/admin/%61sk`, `/admin/./ask`, `/admin/ask;x=1`, `/admin/ask?x=1`, `/admin%2Fask`, `//admin/ask`, `/Admin/citations/native/resolve`, `/admin/users/x/role`: all 403 read_only_role. Viewer PUT/PATCH/DELETE `/admin/users/x`: 403 read_only_role; OPTIONS 204 (safe). Pending GET `/ADMIN/auth/x`, `/admin/AUTH/x`, `/admin//auth/x`, `/Admin/users`, `/admin/auth`, `/admin/%61uth/x`, `/sessions`: all 403 account_not_active. Case, encoding and slash variants only ever make the guards stricter (mismatch against the exact allowlist denies), none opens a hole. Pending `GET /` is 200 because `/` is a pre-existing public page mounted before the perimeter (not a regression). grep: `fullPath` is the only `req.path` reader in the unit.

## PROPOSED-ISSUE lines (dual check: no ledger rows written by me)
PROPOSED-ISSUE | severity=low (file-don't-fix, A6 note, carried from cycle 0, maker already notes it as open point 6) | seam=server.ts | `mountUserAccounts` runs before `createRateLimiter` and `usageRecorder`, so `/admin` is neither rate-limited nor usage-recorded; A6 must reorder or re-add them.
PROPOSED-ISSUE | severity=low | seam=viewer-guard.ts | the guards still match the read-like allowlist and `/auth` exemption by exact, case-sensitive string; Express routing is case-insensitive, so a differently-cased path is denied (safe direction). If A6 ever mounts a case-sensitive-matching allowlist entry the same way, keep the denial direction. Note only.

## Residual risk
No browser, no end-to-end login (A4), no production or shared Mongo, no live provider; real `dist` bundle not built (manifest open point 2). Cleanup done: junctions in my copy removed with rmdir, my Mongo container stopped, no product, test or contract file touched, no ledger row, no manifest change.

SCOREBOARD: 9/9 criteria met, T1 holds
FAILURES: none
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
Metrics: start=2026-10-29 end=2026-10-29 wall_min=30 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=1 resumes=0 tokens=unavailable builder_min=240 check_min=30 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1800 mutants=10 defects_unit=0 defects_6c=0
