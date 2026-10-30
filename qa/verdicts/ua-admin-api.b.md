# Verdict (coordinator B, blind) - ua-admin-api (A6)

Cycle checked: 0
Date: 2026-10-30
Policy-Version: proportional-verification/2026-10-19.17
Bound root: D:/KnowledgeBase/.worktrees/ua-admin-api   Base: 7a4ed51a   Checked head: cc08950f (code SHA 71f950c2)
Verdict path: qa/verdicts/ua-admin-api.b.md   Checkpoint: qa/checkpoints/ua-admin-api.b.md
Blindness: I did not open the other coordinator's verdict or checkpoint. NOTE (disclosure): a final `git log -1` I ran for HEAD printed the subject line of a newer commit that names a coordinator-A verdict; I did not open that file and did not use it. All evidence below is my own.

## Check plan (step 0)
Contract = plan.md "A6 ua-admin-api" items 1-7 (+ spec UA-5..8, 19, 25, 28). api-only, no browser walk. Tier L (auth, privilege assignment, tenancy; dual-trigger `admin-router.ts:54`).
Method: `git archive cc08950f` into a throwaway copy outside the bound root (node_modules junctioned; the bound worktree has none), every run and mutation done there; real loopback mongod (127.0.0.1:27981, own dbpath, PID I started, stopped at the end). Bound tree untouched (`git status` clean).
SERIAL: none needed (separate ports/DBs).

## Re-run of the manifest's verify commands (own runs, copy of cc08950f)
- admin-router.test.ts: 20/20 pass. admin.mongo.test.ts (real mongod): 8/8. create-admin.test.mjs: 10/10 (incl. real script on real mongod). `tsc --noEmit -p apps/api`: exit 0.
- `lint:structure`: 9 of 10 stages OK in the copy (loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker). The `dependencies` stage fails in my copy with an ENOENT caused by the junction/absolute-symlink layout of the copy (path `...\copy\D:\KnowledgeBase\packages\db\src\index.ts`), not by the diff; I could not run it in the bound tree (no node_modules there). That stage is UNVERIFIED by me; the new files import only `@lkb/*`, `mongodb` (type), `express` and sibling modules, the same as other apps/api files. `tick.mjs --lint-manifest` on the manifest: exit 0, no output.
- Diff scope (`git diff 7a4ed51a cc08950f --stat`): 9 files, all declared; no composition file touched (the /admin mount wiring is the declared CORE-REQUEST, judged as declared). Manifest lines present: Pre-check[A6-1..7], Tests[], dual-trigger with path:line, Metrics.

## Criteria
- A6-1 MET. Own probe: key WITH `user-admin` gets 403 on approve/role/issue-link/disable/unlock; member editing own record 403, role unchanged. Test matrix covers member/viewer/pending/keys/anon/CSRF-less/wrong-origin for all 8 mutations, state and audit untouched.
- A6-2 MET. Approve without/invalid role -> 400. One event per action with actor + target (audit row inspected). Tenant-B admin: 404 on list/detail/all mutations (memory and real scopedCollection). My probe: tenant swap via query/header/body ignored (404 / 400).
- A6-3 MET (see limit L1). Sole admin demote/disable/revoke -> 409 `last_admin`; with two admins one succeeds. Real-Mongo cross-demotion over HTTP, 10 rounds: exactly one admin. My extra real-mongod probe, 60 rounds mixed route (role vs disable) + 60 rounds 3-admin ring with SEPARATE service instances: never zero admins (outcomes: mix 58x `last_admin/last_admin->2`, 2x ->1; ring 58x ->3, 1x ->1, 1x ->2).
- A6-4 MET. Own probe: with two admins own role change (same and different) and own disable -> 403 `self_action_forbidden`.
- A6-5 MET. Disable and revoke-sessions -> target's next request 401, memory and real `user_sessions`.
- A6-6 MET. 10/10 incl. real script run: DB guard refuses before connect/stdin, production needs flag + `MONGODB_DB`, `--pass*`/`-p` refused, stdin-only one line, idempotent, never prints password (read the script: no output path carries the password; error text for argv echoes only the flag name).
- A6-7 MET. Own probe: bodies `__proto__`/`constructor` keys, arrays, string, null, extra `role/status/tenantId` -> 400, user untouched; ids `%2e%2e`, `%00`, 65 chars, `%24ne`, `;` -> 404 without reaching the store; `status[$ne]`-style query is 400; swapped-tenant approve replay -> 404; issue-link `Cache-Control: no-store`, token absent from audit rows and stored tokens, `X-Forwarded-Host`/`Forwarded` spoof ignored (link built from configured origin).

## Falsification (copy, per-mutation byte backup in `finally`, no EXIT trap, HEAD-fidelity `git hash-object` == `HEAD:<file>` after each: all restored OK; final check of 8 touched files also OK)
Script: scratchpad `falsify_b.py` (not committed); outputs `out_M*.txt` in the scratchpad. All 9 mutants KILLED by assertion failures (not import errors), by the named test:
| id | criterion | edit | killed by |
|---|---|---|---|
| M1 | A6-1 | `requireAdminSession` reduced to the scope check only (key with user-admin reaches handler) | [A6-1] only an active admin session mutates |
| M2 | A6-2 | audit event drops `targetUserId` | [A6-2] approve...one event; also A6-5, issue-link, audit tests |
| M2b | A6-2 | Mongo store `get` made tenant-unscoped | [A6-2] tenant isolation on real scoped collections |
| M3 | A6-3 | revoke-sessions sole-admin guard `<= 1` -> `<= 0` | [A6-3] last-admin guard |
| M4 | A6-4 | self check removed in `guardAdminChange` | [A6-4] |
| M4b | A6-4 | same-role self guard in `setRole` removed | [A6-4] |
| M5 | A6-5 | revoke-sessions no longer revokes | [A6-5] |
| M6 | A6-6 | script prints the password in its success line | A6-6 create test + real-script test |
| M7 | A6-7 | role route allows `status`,`tenantId` fields | [A6-7] adversarial |
Floor (1 per criterion) met; 2 extra (M2b tenancy on real Mongo, M4b) are within the L cap of 10.

## Findings (none blocks a criterion)
L1 (declared limit, accepted): two independent API instances can end a cross-demotion with TWO admins (both writes revert), never zero (own 120-round probe agrees with the manifest). Plan "exactly one" holds for the documented single-instance deployment (UA-23) and is proved on real Mongo.
PROPOSED-ISSUE: {"id":"P1","sev":"medium","area":"admin-service.ts:203-208,241-257,283-291","summary":"State change and audit event are not atomic. If the audit store fails after the CAS write, the request answers 503 with the user already changed and NO audit row (UA-25 'one event per effective action'); a retry then gets 409 invalid_state, so the gap cannot self-heal. Reproduced: wrap store.audit to throw, POST /admin/users/m1/disable -> 503, m1.status=disabled, events=0, retry -> 409.","fix_direction":"write the event first with outcome pending/or in the same Mongo transaction; or on audit failure retry/queue the event and return the real success status; at least log an error-level 'audit missing' record."}
PROPOSED-ISSUE: {"id":"P2","sev":"low","area":"admin-service.ts:183","summary":"`await revert()` ignores the CAS result of the revert in guardAdminChange; if the revert CAS fails (target changed again) the code still returns 409 last_admin while the tenant may have zero admins. Not reached in 120 real-Mongo cross-instance rounds; read from the line, not reproduced.","fix_direction":"check revert()'s boolean and log/escalate when it is false."}
PROPOSED-ISSUE: {"id":"P3","sev":"low","area":"admin-service.ts:283-291","summary":"issue-link can mint a password_reset link for any active user including another admin (account takeover by a peer admin). Audited (`link_issued`, actor+target) and admin-only, consistent with the A5-replacement design, but there is no notification and no guard against targeting another admin.","fix_direction":"decide whether peer-admin targets need a second admin / a distinct event type, or accept and document in roles.md."}
Notes: dependency-cruiser stage unverified by me (environment); sole-admin revoke-sessions race is pre-check only (declared limit 4); CORE-REQUEST mount wiring declared.

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, invariants hold (tenant scoping, no token/password leakage, CSRF path unchanged)
TIER: L (auth, privilege assignment, tenancy; dual-trigger admin-router.ts:54)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (api-only, no UI)
LIVE-BROWSER: not-applicable (apps/api + scripts only)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1, P2, P3 above)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: All seven plan criteria are evidenced by my own runs on a real mongod plus nine killed mutants and a probe suite of mass-assignment, id guessing, tenant swap, self-escalation, key-with-user-admin and cross-instance admin races. The only blocking-class risk (zero admins) did not occur in 120 independent-instance rounds. Findings are non-blocking: audit/state non-atomicity (P1) is the one worth building.
Metrics: start=2026-10-30T10:17:00+05:30 end=2026-10-30T10:52:00+05:30 wall_min=35 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=9 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=2100 mutants=2 defects_unit=0 defects_6c=0
