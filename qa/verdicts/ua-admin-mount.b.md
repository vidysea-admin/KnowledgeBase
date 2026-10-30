# Verdict (coordinator B, blind) — ua-admin-mount
Cycle checked: 0
Date: 2026-10-30 · Base cdc61b36 · Head a956d368 (product blobs verified equal to HEAD) · Policy: proportional-verification/2026-10-19.17
Bound root: D:/KnowledgeBase · Dual check: required (dual-trigger auth apps/api/src/composition/integrations/user-accounts.ts:141) · Verdict path: qa/verdicts/ua-admin-mount.b.md

## Check plan (step 0)
Diff: 2 product files (`composition/integrations/user-accounts.ts` +7/-4, `user-accounts/admin-router.test.ts` +8), `structure.config.json` one override, bookkeeping md. api-only, so no browser or persona walk. Signals: logic/wiring changed -> affected tests + floor; auth composition -> security read of the changed lines (S1-S3 below); config -> lint:structure. No contract file: the plan A6 acceptance and manifest M-1..M-3 are the contract. No full suite (task rule); real Mongo not used (in-memory fake Db only, nothing contacted).
Serial: none needed (no shared port/DB; probe binds an ephemeral 127.0.0.1 port).

## Criteria
- [M-1] MET. Read `user-accounts.ts:141-142`: `createAdminRouter({ store: createMongoAdminStore(db), subjectHash: auth.subjectHash, publicOrigin: env.APP_PUBLIC_ORIGIN, basePath: env.APP_BASE_PATH, log })`, returned as `adminRouter`; `mountUserAccounts` line 151 uses `ua.adminRouter ?? placeholder`. Same function A4 uses: `auth.subjectHash` is the one closure `auth-service.ts:107` (HMAC over `lkb-subject:<tenant>:<email>` keyed by AUTH_CSRF_SECRET), used by login/failedLogin (188/129), changePassword (280), unlockEmail (315); the admin store clears `authThrottles(...).deleteMany({subjectHash})` (`admin-service.ts:324`), the same collection A4's throttle `put/clear` use (`user-accounts.ts:93-106`). Email key parity: signup stores `emailNormalized: parsed.email` (`auth-service.ts:158`) and admin hashes `target.emailNormalized`. basePath goes through the same `normalizeBasePath` as the cookie (`admin-service.ts:140`).
  Independent probe (evidence/ua-admin-mount-b/subjecthash-unlock-probe.ts.txt, in-memory Db): `buildUserAccounts(...)` -> 8 wrong logins through A4 (`ua.auth.login`) write one throttle row keyed `ua.auth.subjectHash(toc, t@example.org)` and locked; `POST /admin/users/target1/unlock` on the built `adminRouter` returns 200 `cleared:true`, the row is gone, `unlocked` audit event written. GREEN in a copy.
- [M-2] MET. Re-ran in the bound tree: admin-router.test 21/21, principal 9 + auth-router 15 + auth-service 17 + throttle 7 = 48/48, plus importer cookie.test 6/6. 0 failed.
- [M-3] MET. `pnpm -s lint:structure` -> 10 stages, 0 failed (exit 0); `tsc --noEmit -p apps/api` exit 0. Dir holds exactly 34 files at HEAD (`git ls-tree`) = the new budget 34; the `$comment` states the reason.
Invariants (checker-derived, none in a contract): `/admin` stays behind `requireAuth(keyStore, ua.session)` (`user-accounts.ts:152`, unchanged); mutations are session-admin only via `requireAdminSession` (`admin-router.ts:54-59`); no route, export, config key or test removed or renamed (4c).

## Falsification (floor: 1 per changed criterion; all in copies outside the bound root, each green-before then red-after then restored)
- F-M1 drop `adminRouter` from the returned runtime: copy green (21 pass) -> red, `[A6 wiring]` assertion "adminRouter is built, not left to the placeholder" (actual undefined, expected function) -> restored, blob == HEAD.
- F-M2 (beyond floor, 1 mutant, `subjectHash: auth.subjectHash` -> `(t,e)=>"other:"+t+e`): probe green -> red at "unlock reports it cleared a throttle row" (actual false) -> restored == HEAD. The same mutant SURVIVES the committed suites (admin-router, auth-router, auth-service, throttle: 60/60 pass, identical to unmutated; principal.test fails to load in the copy for a missing `scripts/` dir, identically with and without the mutant). See P1.
- F-M3 `lint-dirsize` `check()` with the override removed or set to 33 (in-memory config, bound tree untouched): red `apps/api/src/user-accounts: 34 files (budget 30|33)`; with the override green.
Mutation-run discipline (D-020): per-mutation byte backup and trap (EXIT INT TERM), HEAD-fidelity by `git hash-object` == `git rev-parse a956d368:<file>` after each; bound tree hashes equal HEAD blobs at the end. Note for the record: my first trap used `ERR` and fired on a harmless `diff` exit 1, restoring the mutant before the run; I discarded those runs as invalid and redid them without `ERR`.

## Security read of the changed lines (L)
S1 fail-closed wiring: an absent `adminRouter` still answers 503, never opens /admin. S2 link origin comes from `APP_PUBLIC_ORIGIN`, never the request Host; unset -> issue-link 503 (admin-service). S3 the store handle is the same tenant-scoped accessors (`authThrottles`, `users`) A6 already proved on real Mongo (A6's own admin.mongo.test, not re-run here). No credential, secret or key is logged or returned by the changed lines. No defect found.

## Findings (PROPOSED, no ledger rows written)
PROPOSED-ISSUE: {"id":"P1","severity":"medium","class":"security-adjacent test gap","title":"Nothing in the committed suite pins that the admin router's subjectHash is auth.subjectHash","detail":"user-accounts.ts:141 could pass any function and admin-router.test (all 21), auth-router, auth-service and throttle suites stay green (verified by mutant). The [A6 wiring] test only asserts typeof adminRouter === 'function'. A drift makes admin unlock a silent no-op (cleared:false, locked user stays locked) while audit still records `unlocked`. The admin tests inject their own subjectHashFor and the mongo test its own sha256.","fix_direction":"Extend the [A6 wiring] test with an in-memory Db: fail logins via ua.auth, POST /admin/users/:id/unlock through ua.adminRouter, assert the throttle row is gone (a ready template is qa/evidence/ua-admin-mount-b/subjecthash-unlock-probe.ts.txt).","file":"apps/api/src/user-accounts/admin-router.test.ts:386"}
PROPOSED-ISSUE: {"id":"P2","severity":"low","class":"process","title":"apps/api/src/user-accounts is at exactly its 34-file budget","detail":"Any further file in the directory (e.g. a test split or the ua-production-enable unit's helper) turns lint-dirsize red; the budget was set to the current count with no headroom.","fix_direction":"Split tests into a subfolder or raise the override with a stated reason when the next file lands."}
Declared, not a finding: `buildUserAccounts` has no production caller (`grep` of non-test src: server.ts only declares `userAccounts?`), so /auth and /admin are not live in production; queued as ua-production-enable. Not counted toward this verdict.

VERDICT: PASS
SCOREBOARD: 3/3 criteria met, 3/3 invariants hold
TIER: L (auth composition apps/api/src/composition/integrations/user-accounts.ts:141; dual-trigger line present and valid)
FAILURES: none
CAPABILITY-COVERAGE: 3/3 rows reproduced (F-M1, F-M3 floor; F-M2 extra)
LIVE-BROWSER: not-applicable (api-only; changed paths under apps/api/src and structure.config.json)
ISSUES-WRITTEN: none (dual coordinator; P1, P2 proposed only)
EXECUTOR: claude-opus (checker: claude-sonnet-subagent)
EXPLANATION: The three-line wiring is correct and uses the very closure A4 uses for throttle rows; my own probe shows an admin unlock through the built router removes the row an A4 login lockout wrote. The only gap is test strength (P1): the subjectHash identity is not pinned by any committed test, which I demonstrated with a surviving mutant, so it is a proposed issue and not a FAIL of M-1.
Metrics: start=2026-10-30T11:04:06+05:30 end=2026-10-30T11:12:00+05:30 wall_min=8 agent_min=8 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=474 mutants=1 defects_unit=0 defects_6c=0
