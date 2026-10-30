# Verdict - ua-admin-api (A6) - Mode A, dual coordinator A
Date: 2026-10-30 · Bound to D:/KnowledgeBase/.worktrees/ua-admin-api · Base 7a4ed51a · Head cc08950f · Cycle checked: 0
Policy-Version: proportional-verification/2026-10-19.17 · Checkpoint: qa/checkpoints/ua-admin-api.md
Contract: docs/features/user-accounts/plan.md "A6 ua-admin-api" items 1-7 (no qa/contracts file) + spec.md UA-5..8, 19, 25, 28.

## Check plan (step 0)
Diff = 5 new TS files (router, service, testsupport, 2 test files), 1 script + test, 1 number in structure.config.json. Signals: security/auth/tenancy and data-write -> L, dual (dual-trigger admin-router.ts:54 confirmed: requireAdminSession). api-only: no browser walk, no persona walk. Checks: (1) re-run the manifest verify commands, (2) one falsification per criterion in a throwaway copy, (3) full diff read of service/router/script, (4) own adversarial probes, (5) tsc and structure lint.
Method: git archive of cc08950f into a scratch copy OUTSIDE the bound root (node_modules junctions to the main checkout, unlinked afterwards); per-mutation byte backup + restore + cmp, no EXIT trap, 150-200 s timeouts; end state hash-equal to HEAD blobs for all 3 mutated files. Local throwaway mongod on 127.0.0.1:27961 (PID 31876, mine, stopped). No production, no .env read. Bound tree untouched (git status clean).

## Re-run of the manifest verify commands (scratch copy of cc08950f)
- admin-router.test.ts: 20/20 pass (31 s).
- admin.mongo.test.ts (real mongod): 8/8 pass, incl. 10-round cross-demotion race -> one admin, 40-round two-instance race -> never zero.
- scripts/create-admin.test.mjs: 10/10 pass (incl. real script on real mongod).
- tsc --noEmit (apps/api): exit 0, no output.
- pnpm lint:structure in the bound tree: stages loc, dirsize, root, dupes, migrations, codex-hooks, snapshot OK; the `dependencies` stage fails ONLY because the worktree has no node_modules (environment, not the diff; the structure.config.json 32->34 change is accepted by dirsize). Judged an environment artefact, not a defect.

## Criteria
| # | Result | Evidence I produced |
|---|---|---|
| A6-1 | MET | Matrix: member, viewer, pending, key with/without user-admin, anonymous, CSRF-less admin all refused on all 8 mutations, state and audit untouched. Falsified: M1 router guard no-op (`if (true \|\|`) KILLED; M1b service actor re-read drops role/status check KILLED. Read admin-router.ts:54-59 myself. |
| A6-2 | MET | One event with actor+target per action; approve without role 400. Tenant-B admin 404 on list/detail/every mutation (memory test + real scopedCollection mongo test). Falsified: M2 reject event removed KILLED; M9 getUser tenant hard-wired to tA KILLED. |
| A6-3 | MET | Sole-admin demote/disable/revoke 409; two admins ok; real-mongod cross-demotion 10 rounds -> exactly one admin (ran it). Own probe: 3-admin cyclic demote/disable race, 15 rounds, always >=1 admin. Falsified: M3 pre-check threshold KILLED; M8 post-check revert off KILLED on real mongod. |
| A6-4 | MET | Two-admin self role-change and self-disable -> 403 self_action_forbidden. Falsified: M4 self guard removed KILLED. |
| A6-5 | MET | Disable and revoke -> target next request 401, in memory and on real user_sessions. Falsified: M5 disable no longer revokes KILLED (see P3). |
| A6-6 | MET | Real script: refused with no work DB and with a prod name without the flag (exit 1, before any connection); `--password=...` refused without echoing the value; empty stdin refused; idempotent; argon2id; no password in output. Falsified: M6 idempotency off KILLED; M6b DB guard bypass KILLED. |
| A6-7 | MET | Adversarial test + own probe: extra role/status/tenantId fields 400; `__proto__` key 400; array/operator/case variants of role 400; id shapes `..%2F`, `%24ne`, NUL, 65 chars -> 404/400; swapped-tenant replay 404; query-string `role=admin` ignored. Falsified: M7 strict-body check removed KILLED. |

Floor 7/7 criteria falsified, plus 3 extras (M1b, M8, M6b); mutants 10 (L cap 10). All kills are assertion failures, none import or setup failures. Restore: cmp ok after each mutation; final `git hash-object` equals `rev-parse cc08950f:<file>` for admin-service.ts, admin-router.ts, create-admin.mjs.

## Security read of changed code (lines I opened)
Mutation routes sit behind requireAdminSession (admin-router.ts:54-59); the service re-reads the actor under a per-tenant lock (admin-service.ts:161-170); every store call carries the tenant; userView drops passwordHash and tenantId; the issue-link token goes into the URL fragment, is built from the configured origin only, is stored as sha256, and is absent from audit rows, headers and later reads (probe); `Cache-Control: no-store`; store failures are a generic 503. No secret reaches argv or stdout in the script. No cross-tenant reach, no key-based mutation, no mass assignment found.
Declared and judged as declared: /admin mount wiring is a CORE-REQUEST (composition/integrations/user-accounts.ts stays 503 until A4 merges); `subjectHash` for unlock must be A4's function; the two-instance race ends with two admins, never zero.

## Findings (non-blocking; dual check, so PROPOSED-ISSUE lines only)
PROPOSED-ISSUE: {"id":"P1","sev":"medium","type":"audit-gap","title":"state write then audit write is not atomic: a failure after the write returns 503 with the change applied and no auth_events row","file":"apps/api/src/user-accounts/admin-service.ts:206-208,215-217,237,255,264,271,278,289","evidence":"own probe (scratch chk-probe.test.ts): audit store throwing after cas -> POST /admin/users/m1/disable = 503, m1.status = disabled, events = 0","fix_direction":"write the audit row first or in one transaction where available, or return the committed result and retry the audit; at minimum log the unaudited change at error level"}
PROPOSED-ISSUE: {"id":"P2","sev":"low","type":"design-note","title":"admin issue-link password_reset works on any other admin account, so an admin can take over a peer admin (audited only as link_issued)","file":"apps/api/src/user-accounts/admin-service.ts:285","evidence":"read: only target.status is checked, role is not","fix_direction":"accept (equal privilege, audited) or refuse reset links for another admin; owner decision"}
PROPOSED-ISSUE: {"id":"P3","sev":"low","type":"test-robustness","title":"with disable no longer revoking sessions, admin-router.test.ts hangs (200 s, no assertion) instead of failing; it fails cleanly only under --test-timeout","file":"apps/api/src/user-accounts/admin-router.test.ts [A6-5]","evidence":"M5 first run rc=124 at 200 s; rerun with --test-timeout=40000 fails the [A6-5] test cleanly","fix_direction":"bound the next-request-is-401 wait or close the rig in a finally with a timeout"}
PROPOSED-ISSUE: {"id":"P4","sev":"low","type":"known-limit","title":"sole-admin revoke-sessions is pre-check only (cross-instance race can pass); the two-instance demote race leaves two admins, not one","file":"apps/api/src/user-accounts/admin-service.ts:268-273","evidence":"declared in manifest items 3-4; the mongo test proves never-zero","fix_direction":"none needed for the single-instance deployment (UA-23); revisit if a second instance is planned"}

VERDICT: PASS
SCOREBOARD: 7/7 criteria met, 0 invariants failed
TIER: L (auth + privilege assignment + tenancy + data writes; dual-trigger apps/api/src/user-accounts/admin-router.ts:54, confirmed in the diff)
FAILURES: none
CAPABILITY-COVERAGE: 7/7 criteria reproduced; 10 falsifications all killed
LIVE-BROWSER: not-applicable (api-only: apps/api/src/user-accounts/*, scripts/create-admin*)
ISSUES-WRITTEN: none (dual check: PROPOSED-ISSUE P1-P4 above)
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: Every plan A6 criterion is evidenced by tests I re-ran (router 20, real-mongod 8, script 10, tsc clean) and by a killed falsification each; my own probes (3-admin race, operator and proto injection, token leakage, id shapes) found nothing blocking. One medium finding (P1, write and audit not atomic under store failure) lies outside the stated criteria and goes to the maker as a proposed issue; the structure-lint dependencies failure is a missing node_modules in the worktree, not the diff.
Metrics: start=2026-10-30T04:52:00Z end=2026-10-30T05:15:00Z wall_min=23 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1380 mutants=10 defects_unit=0 defects_6c=0
