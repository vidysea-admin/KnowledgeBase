# Verdict (checker B, independent second coordinator) - ua-auth-api

**Verdict:** PASS
**Cycle checked:** 0
**Mode:** A, dual check, second coordinator (did not read or count any other coordinator's verdict, checkpoint or evidence)
**Tier:** L, dual-trigger auth `apps/api/src/user-accounts/auth-service.ts:184` (login, lockout, credential handling)
**Policy-Version:** proportional-verification/2026-10-19.17
**Checked state:** bound root `D:/KnowledgeBase/.worktrees/ua-auth-api`, code at f4790297 (base 7a4ed51a). HEAD moved to 7773f672 during my check by another coordinator's commit; `git diff f4790297 7773f672 -- apps packages` is empty, so the code I judged is the code at HEAD.
**Contract:** `docs/features/user-accounts/plan.md` row A4 acceptance 1-10 + `spec.md`; manifest `qa/manifests/ua-auth-api.md` (A4-1..A4-10). No qa/contracts file.
**Gate answers honoured:** Q-A no mail (no `mailer.ts`, forgot issues nothing, admin `issueToken`); Q-B open signup, pending gets a zero-scope session; Q9 roles; H-4 argon2id; D-210 (no consent code touched); `/admin` 503 placeholder untouched (diff on `mountUserAccounts` is empty).

## Check plan (written before execution)
1. Re-run the manifest verify commands, one file per invocation, in a pristine `git archive` copy of the code (the worktree has no node_modules; the bound tree is never edited).
2. Real-Mongo gap closed by me: loopback `mongod` on a throwaway dbpath, opt-in `auth-service.mongo.test.ts`.
3. One falsification per criterion, in throwaway copies (source copied, node_modules junctioned), green-before / red-after, copy deleted after each run; plus HEAD-fidelity hash of the bound files.
4. Adversarial probe (real Express server, real argon2, real Mongo): enumeration by body/status/headers/timing, lockout of an unregistered email, session survival after reset/change/logout-all, token reuse and cross-purpose, Bearer key on every /auth route and cookie-only routes (UA-28), secrets in `auth_events`, other-tenant signup, strict body, rate limits.
5. Diff scope read; tsc / lint-loc / lint-dirsize / lint-dupes.

## Evidence (each re-run by me)
| Check | Result |
|---|---|
| `node --test --import tsx src/user-accounts/auth-service.test.ts` | 17 pass, 0 fail |
| `.../auth-router.test.ts` | 15 pass, 0 fail |
| `.../throttle.test.ts` | 7 pass, 0 fail |
| `.../auth-service.mongo.test.ts` with `LKB_UA_AUTH_MONGO_URI` = loopback mongod, throwaway db | 5 pass, 0 fail (the real-Mongo gap the maker flagged is closed: CAS throttle, E11000 global email, atomic token consume) |
| tsc `--noEmit` on the copy | no error in any unit file (only my scratch probe file and a fixture under `qa/packets` that my copy deliberately omits) |
| `lint-loc` / `lint-dirsize` / `lint-dupes` in the bound tree | OK (1883 files / 301 dirs / 2325 exports) |
| Adversarial probe `qa/evidence/ua-auth-api/checker-b/probe.out` | 68 of 70 assertions ok; the 2 misses are probe artefacts, explained below; 0 product defects |
| HEAD fidelity | `git hash-object` of the 7 unit source/test files equals `git rev-parse f4790297:<file>` in both the bound tree and my pristine copy; bound `git status` clean under apps/ and packages/ |

The two probe misses: (a) "sweep removes stale unverified of tA" - the sweep is hourly and had already run in-process earlier in the probe, so it had nothing left to remove (the sweep itself and the verify-time staleness check are both killed by mutants, below); (b) "per-address forgot limit identical" - I called forgot once on the registered address earlier in the same probe (line 179), so its window was one hit ahead: sequences `[202,202,429,429]` vs `[202,202,202,429]` are the same 3-per-hour rule applied to both; not an oracle.

## Falsification (one per criterion plus two extra conjuncts), throwaway copies, D-020 per-mutation
Every mutant: copy built fresh, tests green before (17/15/7 as above), mutation applied once (pattern count asserted = 1), tests red after, copy removed. Bound tree untouched.

| Criterion | Mutation | Result |
|---|---|---|
| A4-1 | existing-email signup returns 409 | KILLED (service 2, router 1) |
| A4-2 | stale-unverified check removed from verify | KILLED (service 1) |
| A4-3 | unknown email skips the password verify | KILLED (service 1, spy) |
| A4-4 | `LOCK_THRESHOLD` 5 -> 6 | KILLED (throttle 1, service 4) |
| A4-5 | reset no longer revokes sessions | KILLED (service 1, router 1) |
| A4-6 | change password also revokes the current session | KILLED (service 1) |
| A4-7 | logout-all revokes nothing | KILLED (service 1, router 1) |
| A4-8 | login route without its per-IP limiter | KILLED (router 1) |
| A4-9 | `password_reset` ok writes no audit event | KILLED (service 1) |
| A4-10 | Authorization-header refusal disabled (`if (false)`) | KILLED (router 1) |
| extra | never-registered email not counted toward lockout | KILLED (service 2) |
| extra | rejected / disabled reset allowed | KILLED (service 1) |

12 of 12 killed, 0 survivors. Harness and raw results: `qa/evidence/ua-auth-api/checker-b/mutate.py`, `mutate.out`, `mutants.json`.

## Criteria
- **A4-1 PASS** Signup response (status, body, headers except `x-request-id`) is byte-equal for a new address, an existing address and an address existing in another tenant; exactly one user created for the new one, none for the others; unknown key and a `tenantId` in the body give 400 and create nothing; `USER_SIGNUP_TENANT` unset gives 503 `signup_not_configured`. E11000 from the global unique index maps to the same generic reply. Timing recorded, not asserted: signup median new 51.5 ms vs existing 48.7 ms (argon2 hash runs on every path).
- **A4-2 PASS** Token verifies once; reuse, junk, expired and wrong purpose all give the same 400 `invalid_token`; a stale unverified user can never verify; sweep removes stale unverified users only. Reviewed in code: `verifyEmail` consumes first then checks status (see P2).
- **A4-3 PASS** Unknown email and wrong password give the identical 401 body; both run a full argon2 verify (dummy verify for the unknown account, also while locked); login median 52.2 ms unknown vs 48.4 wrong password vs 46.8 locked-unregistered vs 43.7 locked-registered (no usable oracle at this resolution; recorded, not asserted). Pending with the correct password gets a session with `[]` scopes and every data route is 403; rejected / disabled get 200 `{state}` and no cookie.
- **A4-4 PASS** 5 failures in 15 min lock a registered AND a never-registered address; 15 min, doubling, 24 h cap; failure while locked changes nothing; success and admin unlock clear; locked answer is the same 401 body; 12 parallel failures cannot lose counts (CAS); Mongo CAS passes on a real server.
- **A4-5 PASS** Forgot is always 202 (identical for registered and unregistered), issues nothing; token single use; reset revokes all sessions (a pre-existing cookie gets 401 on its next request); rejected / disabled refused generically.
- **A4-6 PASS** Wrong current password gives 403 and counts toward lockout; success revokes the other sessions only and keeps the current one.
- **A4-7 PASS** Logout and logout-all revoke the right rows and clear the cookie on the exact path; logout needs CSRF.
- **A4-8 PASS** Per-IP limits (login 20 / 15 min, signup 5 / h, forgot 5 / h, token 20 / h), per-address forgot 3 / h and the global signup cap answer 429 with the standard body and Retry-After.
- **A4-9 PASS** One `auth_events` row per transition from the closed vocabulary; grep of all rows after a full scenario finds no password, token (raw or hash), cookie or raw-email substring; subject hash is a keyed per-tenant HMAC.
- **A4-10 PASS** All /auth routes (11 asserted by the maker; I probed every route again plus an unknown path, with Bearer, Basic and junk credentials, an empty Authorization header and a valid cookie together with a Bearer key) return 403 `key_not_allowed` and mint no session; the cookie-only routes (UA-28) are unreachable by a Bearer key.

## Adversarial probes, summary of what I tried
- Account enumeration via status, body, header set (except the per-request id), the forgot 202 and its per-address 429 window, signup, and login timing: no distinguisher found.
- Lockout bypass: unregistered email locks like a registered one; case and whitespace variants of the email normalise to one subject hash; parallel guesses counted; other-tenant hash differs.
- Session survival: both pre-existing sessions die after reset; change-password revokes only the other sessions; logout and logout-all revoke exactly the right rows; an active lock does not end an existing session (per spec); a stale or revoked cookie never blocks a new login; foreign, null and look-alike Origins are refused on every public POST.
- Token abuse: reuse, junk, expired, wrong purpose (verify token on reset and the reverse) all give the one generic 400; a wrong-purpose attempt does not consume the token; 6 parallel redemptions of one reset token give exactly one 200; a weak new password is refused without spending the token.
- Secrets: no password, token, cookie or email substring in any `auth_events` row; event `detail` values come only from the closed vocabulary.

## PROPOSED-ISSUE (all low, observations, none blocks; coordinator decides whether to file; per the repo verdict rule these are notes, not backlog)
- **P1 [low, availability]** The global daily signup cap (`USER_SIGNUP_DAILY_CAP`, default in `DEFAULT_SIGNUP_DAILY_CAP`) is an unauthenticated availability lever: an attacker rotating IPs under the per-IP limit can exhaust it and deny genuine signups for 24 h. Documented design; consider an admin alert or an ops metric in A6/A8. Not a security class finding (no data or access gained).
- **P2 [low, hygiene]** `verifyEmail` consumes the token before checking the account status and staleness (`auth-service.ts` verify path), so a token for a user who has since been rejected or disabled is burned without effect. Harmless (generic 400 either way); a peek-then-consume order like `resetPassword` would be uniform.
- **P3 [low, ux]** A successful password reset does not clear an active lockout on that address; the user still sees the generic 401 until the lock expires or an admin unlocks. Matches the manifest (success of login clears, reset is not listed), so noted only.
- **P4 [info]** Per-email window limiters and the signup cap are in-process memory (single API instance, UA-23); a restart resets them and a second instance doubles them. The lockout itself is in Mongo and unaffected.
- **P5 [info]** Public routes serve the single `USER_SIGNUP_TENANT`; users of any other tenant cannot sign in through /auth (maker design decision 1). `buildUserAccounts` still has no production caller, so nothing is live until the entry wires it (maker open point 2).

ISSUES-WRITTEN: none (I write no ledger rows; P1-P5 are proposals for the coordinator).
EXPLANATION: the unit does what A4 asks, and where I tried to break it (enumeration, lockout evasion, session survival, token misuse, Bearer reach, secret leakage, parallel guesses, real Mongo) it held. Every criterion has a mutant that its own tests kill, including two independent conjuncts I added. No consent code, no mailer, `/admin` placeholder untouched.

Metrics: coordinator_min=32 mutants=12 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 probes=70 tokens=unavailable
