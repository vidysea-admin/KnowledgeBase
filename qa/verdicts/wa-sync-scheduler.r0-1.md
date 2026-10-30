# Verdict - wa-sync-scheduler (checker A, dual check, coordinator 1)
Date: 2026-10-30 · Bound root: D:/KnowledgeBase/.worktrees/wa-sync-scheduler · Base 7b572ebc (= merge-base with docs/devops-golive-2026-10-26) · Head b2fe2241 · Policy-Version: proportional-verification/2026-10-19.17
Cycle checked: 0

## Check plan (step 0)
Diff = 5 added files, 0 deleted (4c clean: scripts/whatsapp/sync-links.mjs, its 2 test files, docs/whatsapp/sync.md, the manifest). Tier L (prod-write|tenancy, sync-links.mjs:207). api-only: no browser walk, no persona walk. Checks: re-run each verify command on a clean `git archive HEAD` copy (the bound worktree has no node_modules; it was never edited); one falsification per criterion in per-mutant copies; own real-Mongo probes on a local replica set (127.0.0.1:27299, started and stopped by me; no production). Worktree blobs equal HEAD for all 4 product/test/doc files before and after (git hash-object = git rev-parse HEAD:<file>).

## Re-run (step 3)
- `node --test --import tsx scripts/whatsapp/sync-links.test.mjs` -> 20 pass, 0 fail.
- Same plus `sync-links.mongo.test.mjs` with W9_TEST_MONGO_URL (replica set) -> 21 pass, 0 fail.
- Own probes on the real validators/migration: run rows of every shape (skipped for a held lock, skipped/logged_out, failed, partial) all accepted, health written (A-probe-run-rows); env-map-only tenant on an empty `whatsapp_links` is seeded then synced, turns only under its own tenant (A-probe-seed): ISS-WAOWNER-001 and W9-8 hold. `main` refuses lkb/lkb_prod/global_university_db without the production flag.

## Criteria
- W9-1 PASS · W9-2 PASS · W9-3 PASS · W9-4 PASS · W9-5 PASS · W9-6 PASS · W9-8 PASS
- W9-7 FAIL: retries are only driven for tenants returned by `listTenantIds`, which is `distinct(tenantId, {state:"active"})` plus env-map tenants (sync-links.mjs:196). `driveArchiverUnlinks` runs per listed tenant (sync-links.mjs:135). A tenant whose only link was unlinked/revoked with `archiverUnlinkPending: true` is never listed, so its archiver `unlinkSession` is never retried. Repro (my command, real Mongo): `W9_TEST_MONGO_URL=mongodb://127.0.0.1:<port>/?replicaSet=<rs> node --test --import tsx <copy>/scripts/whatsapp/w9chkA-probe7.test.mjs` printed `tenants: []`, `pending flag after cycle: true`, `archiver owner state: active`, test red. Source at qa/evidence/wa-sync-scheduler/A-probe-p1-unlink-tenant.mjs.txt. The builder's W9-7 tests pass only because the unlinked row sits in a tenant that also has an active link, or `listTenantIds` is faked.

## Falsification (4b), isolated copy per mutant, green-before exit 0 in the copy each time
| Crit | Edit | Result |
|---|---|---|
| W9-1 | MIN_INTERVAL_MIN 5->1 | red: cadence test |
| W9-2 | lock acquire ignored | red: two-instance test |
| W9-3 | store upstream `e.message` as group errorCode | red: link A failing test |
| W9-4 | newTurns = after.turns.size | red: re-run idempotency test |
| W9-5 | remove Promise.race time cap | red: hung-ingest test (8 s test timeout) |
| W9-6 | never raise needs-relink | red: status-poll test |
| W9-7 | skip confirmUnlink | red: retry test |
| W9-8 | remove seed before first read | red: ISS-WAOWNER-001 test |
CAPABILITY-COVERAGE: 8/8 reproduced. Extras (cap 10, used 3), each survived the whole 21-test set: (a) builder's M1c, owner filter in `listGroups`: judged EQUIVALENT, store.ts:146 filters `g.ownerUserId === ownerUserId` and the pinned resolver yields one owner, so it is defence in depth, accepted. (b) builder's MO1, env-map tenant union: judged REDUNDANT, a seeded tenant is already in `distinct`, a non-seeded one has no active link, accepted. (c) mine, mid-run `fresh?.state !== "active"` recheck (sync-links.mjs:73) removed: SURVIVES, no test suspends a link between groups of one run (the pinned resolver would still fail closed); P2.

## Tenancy / isolation
Each link syncs only its own owner: pinned resolver re-reads the link row (active + same owner) and returns one grant; `getLink` check at :58; real-Mongo test shows tenant-a/tenant-b turns only under their own owner; `listTenantIds` is the one cross-tenant read and returns tenant ids only. Lock: T-038 takeover needs a dead pid, so a live long run never loses its lock; ownership is re-checked before each group and before every write.

PROPOSED-ISSUE: {"severity":"high","feature":"wa-sync-scheduler","title":"Pending archiver unlink retries (W9-7) are never driven for a tenant whose only links are terminal","evidence":"scripts/whatsapp/sync-links.mjs:196 (listTenantIds = distinct tenantId where state active, plus env map), :135 (driveArchiverUnlinks only per listed tenant); repro qa/evidence/wa-sync-scheduler/A-probe-p1-unlink-tenant.mjs.txt: tenants [] and flag stays true","fix_direction":"include tenants with {state in [unlinked,revoked], archiverUnlinkPending:true} in listTenantIds (or drive unlinks in a separate pass over that query); add a runCycle test with a tenant that has only a pending terminal link"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"Mid-run active recheck between groups (sync-links.mjs:73) has no test","evidence":"mutant removing it passes 21/21; only the pre-enumeration recheck (:58) is tested","fix_direction":"test that suspends a link after group 1 and asserts group 2 is not ingested"}

VERDICT: FAIL
SCOREBOARD: 7/8 criteria met (W9-1..W9-6, W9-8), W9-7 failed; invariants: none in contract file, ISS-WAOWNER-001 holds
TIER: L (prod-write|tenancy, scripts/whatsapp/sync-links.mjs:207; unchanged)
FAILURES:
- [W9-7] sev: high · unlink retries skip tenants with no active link, so an unlink the archiver missed is never retried (privacy-relevant) · enumerate terminal-pending tenants too · issue: P1
CAPABILITY-COVERAGE: 8/8 rows reproduced
LIVE-BROWSER: not-applicable (api-only, scripts and docs)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1, P2)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: Seven criteria are met with fresh green runs and killed falsifications, and ISS-WAOWNER-001 is closed in the scheduler. W9-7 fails on a reproduced gap: tenant enumeration only sees tenants with an active link, so the most common unlink case (a user's only link) is never retried. Note for the maker: the Mongo test stubs the data plane (`listGroups`/`fetchMessages`), so the real `listTrackableGroups` path is only covered by reading store.ts; the lazy-seed residual (skipped when a tenant already has link rows) is the already-open ISS-WAOWNER-001 and not new.
Metrics: start=2026-10-30T11:24:55Z end=2026-10-30T11:38:00Z wall_min=13 agent_min=13 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=11 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=785 mutants=3 defects_unit=1 defects_6c=0
