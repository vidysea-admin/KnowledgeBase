# Verdict: ua-auth-api (coordinator A, dual check)

VERDICT: PASS
Status: PASS
Cycle checked: 0
Reviewed SHA: f4790297c693fb3e432f68a86060931d54f1beab
Base SHA: 7a4ed51a
Unit: A4 ua-auth-api (plan.md acceptance 1-10; spec UA-1, 4, 5, 11, 12, 18, 20-25, 28). Tier L, API only.
Policy: proportional-verification/2026-10-19.17. No `qa/contracts` file exists; the contract is plan.md + spec.md.
ISSUES-WRITTEN: none (dual check: findings are PROPOSED-ISSUE lines below; no ledger row written, no goal task closed).

## Check plan (step 0)
- TIER L. Trigger: auth/credential handling (`auth-service.ts:184`, login and lockout) and tenancy-scoped writes.
- Routed checks: manifest verify commands, one falsification per criterion, adversarial probes (enumeration by body/status/headers/timing, lockout for an unregistered email, session survival after reset, token reuse and cross-purpose, Bearer key on cookie-only routes, secrets in `auth_events`). No browser walk (api-only, no `.tsx` in the diff). No full suite.
- Run in a throwaway copy of HEAD outside the bound root (`git archive`, `node_modules` junctions). The bound tree was never edited; HEAD-fidelity: `git hash-object` equals `git rev-parse HEAD:<file>` for auth-service.ts, auth-router.ts and throttle.ts, `git status` clean.

## Re-run of the manifest verify commands (copy of HEAD)
throttle.test 7/7, auth-service.test 17/17, auth-router.test 15/15. `tsc --noEmit`: no error in `user-accounts` files (the one error is a missing `qa/packets` fixture, a copy artefact). Evidence: `qa/evidence/ua-auth-api/checker-a/`.

## Falsification, one mutant per criterion (cap 10 at L; each in its own copy, green before, red after, copy removed)
| Mutant | Criterion | Result |
|---|---|---|
| A4-1 unknown body keys no longer rejected | #1 signup, strict body | KILLED (auth-router #1) |
| A4-2 stale unverified user may verify | #2 verify, 7-day sweep | KILLED (auth-service #2) |
| A4-3 wrong password accepted | #3 login | KILLED (5 tests) |
| A4-4 lock check disabled | #4 lockout | KILLED (2 tests) |
| A4-5 reset token not consumed | #5 reset | KILLED (auth-service #5) |
| A4-6 change-password revokes no other session | #6 change password | KILLED (auth-service #6) |
| A4-7 logout does not clear the cookie | #7 logout | KILLED (service #7 and router #7; first run was UNVERIFIED on CRLF, re-run with CRLF-aware find) |
| A4-8 verify-email loses its per-IP limiter | #8 rate limits | KILLED (router #8) |
| A4-9 login success writes no audit row | #9 audit events | KILLED (service #9) |
| A4-10 only exact-case `Bearer ` refused | #10 UA-28 key refusal | SURVIVED the repo tests (15/15); KILLED by my probe P7 (6/7, P7 red) |

## Adversarial probes (all hold; real argon2 where timing matters)
- P1 enumeration: signup for new, existing, rejected and disabled addresses is byte-equal in body, status and headers. Login for ghost, wrong password, bad-shape email, locked ghost and locked existing (even with the right password) is one identical 401, no cookie. Forgot-password is the same 202 for known and unknown. Timing medians (ms): unknown 30.7, wrong 31.2, badshape 28.5, locked 33.2 (recorded, noisy, not asserted). Unknown and locked accounts run a dummy verify.
- P3: case, space and NFKC variants of one address share one throttle row; an unregistered address locks after 5 and stays indistinguishable.
- P6: cross-purpose, reused and expired tokens give one identical 400; reset revokes every prior session (401 `session_revoked`) and the old password; weak new password does not spend the token; 1 of 8 parallel redemptions wins.
- P7: any Authorization header (valid key, junk, Basic, lowercase, empty, `Token`) on every `/auth` route, with or without cookie, gives 403 `key_not_allowed` and mints no session. `/admin` placeholder still 503.
- P8: after a full scenario, `auth_events` and throttle rows hold none of the passwords, tokens, cookie, CSRF token, raw emails or a User-Agent password canary; the key set is the closed vocabulary.
- P9/P10: CSRF is required on change-password; the logout cookie clear matches the login cookie path; per-IP 429 shape and Retry-After 900; a spoofed `X-Forwarded-For` does not reset it; the per-email forgot limiter is 3 per hour.
- Q2: lock 5 per 15 min, then 30, then 60 min; success and admin unlock clear; hammering while locked changes nothing; 4+4 failures across 16 min do not lock; locks do not end live sessions.

## PROPOSED-ISSUE
PROPOSED-ISSUE: {"id":"P1","severity":"medium","class":"security","criterion":"#4 / UA-24","summary":"Lock check precedes the password verify and the failure is counted after it, so a parallel burst slips past the lock. Probe Q3: 12 concurrent logins ran 12 verifies (sequential ran 5) and the correct password sent inside the burst returned 200. Bound only by the per-IP login limiter (20 per 15 min).","fix_direction":"Count the attempt (CAS increment) before the verify, or re-check the lock after the verify and refuse a success when the row locked meanwhile; add a concurrency test.","evidence":"qa/evidence/ua-auth-api/checker-a/probe-lockout-timing-toctou.test.ts (Q3), probe2c.out"}
PROPOSED-ISSUE: {"id":"P2","severity":"low","class":"behaviour","criterion":"#2 / UA-21","summary":"A stale unverified address (older than 7 days) is swept only by the hourly signup-triggered sweep. Until then a fresh signup for that address gets the generic 202 and no new account, and the old token cannot verify. Not an enumeration leak (response stays generic).","fix_direction":"Treat a stale unverified row as absent inside signup, or sweep it inline for that email.","evidence":"probe Q4"}
PROPOSED-ISSUE: {"id":"P3","severity":"low","class":"test-strength","criterion":"#10 / UA-28","summary":"Mutant A4-10 (refuse only an exact-case `Bearer ` header) survives the repo tests; auth-router.test only sends Bearer. The code refuses any Authorization header, which is stronger than the criterion, so this is a test gap only.","fix_direction":"Add Basic, lowercase `bearer`, empty and `Token` cases to auth-router test #10.","evidence":"mutants-run1.json (A4-10), mutant-A4-10-probe.out"}
PROPOSED-ISSUE: {"id":"P4","severity":"low","class":"coverage","criterion":"store","summary":"createMongoAuthStore and the CAS throttle `put` were reviewed by reading only; auth-service.mongo.test.ts is skipped without a server. Observed trade-off, not a defect: five wrong change-password attempts by a session holder lock the owner's login (Q5, UA-24 accepted).","fix_direction":"Run auth-service.mongo.test.ts against the local/work Mongo before the A4 close-out.","evidence":"this verdict"}

## Gaps (named, not hidden)
- BLOCKED-CAPABILITY for real Mongo only: no Docker daemon and no mongod here. The skipped Mongo test and the unique and TTL index behaviour for `auth_throttles` are UNVERIFIED-by-checker; the in-memory store covers the service logic. This does not change the verdict because the manifest scopes the Mongo store as reviewed-by-reading and the Mongo test is a named skip.
- Dual check: coordinator B's verdict is separate and both must PASS. I did not read it.

CAPABILITY-COVERAGE: not-applicable (api-only; no capability matrix rows for this unit)
LIVE-BROWSER: not-applicable (api-only; changed paths under apps/api)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)

Metrics: start=2026-10-30T04:52:23Z end=2026-10-30T05:18:00Z wall_min=26 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=11 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1560 mutants=11 defects_unit=0 defects_6c=0
