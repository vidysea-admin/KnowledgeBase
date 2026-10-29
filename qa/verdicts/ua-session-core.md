# Verdict A — ua-session-core (coordinator A of a blind dual check)
Cycle checked: 0
VERDICT: FAIL
Policy-Version: proportional-verification/2026-10-19.17
TIER: H (authentication, sessions, tenancy, authorization; dual-trigger apps/api/src/auth.ts:76)
Checked code SHA: 979ae0b1 (HEAD e48a92af adds only qa/ and the generated docs/SNAPSHOT.md line). Base a5141234.
Dual-check blindness: coordinator B's verdict, checkpoint and evidence were not read.

## Check plan
Read the whole auth.ts/server.ts diff and all 8 new user-accounts modules; re-ran every acceptance test myself (one file per `node --test --import tsx`, 170 s timeout; real mongod in my own container `lkb-a3-mongo-chkA` on 127.0.0.1:27097, stopped afterwards); tsc; snapshot check; 13 falsifications in a copy (per-mutation byte backup, `git hash-object` == `git rev-parse HEAD:<file>` after each); one adversarial probe script outside the tree driving the real `createServer` over HTTP.

## Criteria (each evidenced by me)
| Criterion | Result | Evidence |
|---|---|---|
| C1 principal matrix | FAIL (one cell) | principal.test.ts 9/9, sessions.test.ts 14/14 pass. But the probe shows pending `GET /admin/auth/x` answered 200 (reached the admin router), not 403 `account_not_active`. See PROPOSED-ISSUE 1. |
| C2 existing tests unmodified, API-key path | PASS | server.test.ts 10/10, system-status.test.ts 8/8, setup-status.test.ts 6/6, mint-scopes.test.mjs 10/10. The three `requireAuth(deps.keyStore` literal edits are mechanical and correct (the old literal would fail line 123). Falsification: key-strip disabled -> KILLED (principal.test.ts). |
| C3 cookie attributes | PASS | cookie.test.ts 6/6; exact Set-Cookie strings for /knowledgebase, /, trailing slash. SameSite Strict->Lax KILLED. |
| C4 rotation, CAS, replay (real Mongo) | PASS | sessions.mongo.test.ts 6/6 on mongo:7 (parallel rotation: exactly one winner, family not forked; replay after grace revokes and audits). CAS result ignored (loser also gets a token) -> KILLED (sessions.test.ts). |
| C5 CSRF | PASS | cookie.test.ts + principal.test.ts. GET made unsafe -> KILLED. Bearer-exemption: a single edit is equivalent (see below); a two-edit mutant (guard run for keys AND principal clause dropped) -> KILLED. |
| C6 viewer guard enumeration | FAIL (coverage hole) | viewer-guard.test.ts 4/4 pass, guard removal KILLED. But the test exempts `/admin` and `/auth` wholesale, and the guard behaves wrongly under the `/admin` mount (PROPOSED-ISSUE 1/2). |
| C7 role to scope, no operator scope | PASS | `hosting` injected into admin scopes -> KILLED (principal.test.ts); pending scopes widened -> KILLED (sessions.test.ts). |
| C8 trust proxy | PASS | cookie.test.ts incl. spoofed X-Forwarded-For. Invalid value trusting 1 hop -> KILLED. The regex-widening mutant `[0-5]`->`[0-9]` SURVIVED: EQUIVALENT (the `<= TRUST_PROXY_MAX_HOPS` clause still rejects 6-9). |
| C9 ISS-415 / ISS-411 | PASS | tenant equality check removed -> KILLED; duplicate-email mapper made `true` -> KILLED; three lookups IXSCAN and cross-tenant E11000 pass on real Mongo. ISS-411: I applied the new and old build regexes to password-policy.ts: new matches `./common-passwords.txt` (2 hits incl. the doc comment, harmless), old matched 0. |
| T1 tsc / snapshot | PASS | `tsc --noEmit -p apps/api/tsconfig.json` exit 0; `node scripts/snapshot.mjs --check` OK (180 lines). |

Falsification result: 13 mutants (12 distinct behaviours + 1 two-edit): 12 KILLED, 1 equivalent survivor (C8 regex), 1 single-edit equivalent (C5 Bearer clause: `requireAuth` only calls `guard` on the cookie path and `attach` never sets `req.auth` for a Bearer request, so the principal clause is redundant defence in depth). All 13 `head-fidelity=OK`.

## Adversarial finding (the reason for FAIL)
`activeGuard` and `viewerGuard` decide on `req.path`. `mountUserAccounts` runs `requireAuth(keyStore, session)` INSIDE `app.use("/admin", ...)`, where Express strips the mount prefix, so `req.path` is relative (`/auth/x`, `/ask`). Reproduced over HTTP against the real `createServer` with an injected admin router (probe outside the tree, sessions via the real session service):
- pending user, `GET /admin/auth/x` -> 200, request reached the admin router (expected 403 `account_not_active`).
- viewer, `POST /admin/ask` and `POST /admin/citations/native/resolve` -> 200, reached the admin router (expected 403 `read_only_role`).
- controls: pending `GET /ask-nothing` 403 `account_not_active`; viewer `POST /admin/users` and `DELETE /admin/ask` 403 `read_only_role`.
Impact today is latent: pending scopes are `[]` and a viewer has no `user-admin`, and the A6 router is stated to do its own scope checks, so no data is exposed by a scoped route. But UA-9a/UA-9b say the viewer and non-active rules hold "by construction", C1 says 403 outside `/auth`, and the enumeration test skips `/admin`, so A6 would inherit a guard that does not guard and a test that cannot see it. Fix is small: compute the path from `req.baseUrl + req.path` (or `originalUrl` without the query) in both guards, and drop the `/admin` exemption from the enumeration test.

## PROPOSED-ISSUE lines (dual check: no ledger rows written by me)
PROPOSED-ISSUE | severity=high (security class: auth) | seam=ua-session-core guards | activeGuard/viewerGuard (apps/api/src/user-accounts/viewer-guard.ts:20,27) use the mount-relative `req.path`; under the `/admin` mount (composition/integrations/user-accounts.ts mountUserAccounts) a pending user passes at `/admin/auth/*` and a viewer passes the read-like POST allowlist at `/admin/ask` and `/admin/citations/native/resolve`. fix_direction: use `req.baseUrl + req.path`; add recorded reproductions (pending GET /admin/auth/x, viewer POST /admin/ask, viewer POST /admin/citations/native/resolve) as a standing test through createServer with a stub adminRouter.
PROPOSED-ISSUE | severity=medium | seam=viewer-guard.test.ts | the route-enumeration test exempts `/auth` and `/admin` by prefix, so it could not detect the finding above; /admin POST/PUT/PATCH/DELETE paths (once A6 mounts them) should be enumerated and sent as pending and viewer sessions too.
PROPOSED-ISSUE | severity=low (file-don't-fix, A6 note) | seam=server.ts | `mountUserAccounts` runs before `createRateLimiter` and `usageRecorder`, so `/admin` (authenticated, tenant-keyed) is neither rate-limited nor usage-recorded; spec UA-23 gives `/auth` its own per-IP limiters (A4), but nothing covers `/admin`.

## Reuse
Maker evidence was not reused; every test above was re-run by me at the checked SHA. Maker's Pre-check lines match what I observed (principal 9 + sessions 14 = 23; C2 24; cookie 6; viewer-guard 4; mongo 6).

## Residual risk
No browser, no end-to-end login (A4), no production Mongo, no live provider; real `dist` bundle not built (manifest open point 2). Cleanup done: junctions removed with rmdir before the copy was deleted, my mongo container stopped, no product, test or contract file touched, no ledger row, no manifest change.

Metrics: check_min=45 mutants=13 suite_runs=0 repeat_runs=0 policy=proportional-verification/2026-10-19.17 cycle=0 tokens=unavailable
