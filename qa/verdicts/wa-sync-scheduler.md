# Verdict - wa-sync-scheduler (checker A, dual check, coordinator 1, repair re-check)
Date: 2026-10-30 · Bound root: D:/KnowledgeBase/.worktrees/wa-sync-scheduler · Base 7b572ebc (= merge-base with docs/devops-golive-2026-10-26) · Head 7bbccd60 (code cd9f3b03) · Repair base b2fe2241 · Policy-Version: proportional-verification/2026-10-19.17
Cycle checked: 1 (manifest `Fix cycle: 1`; the dispatch text said "Cycle checked: 0", which contradicts its own "Cycle: 1" and the manifest, so the manifest value is used). Cycle-0 verdict archived at qa/verdicts/wa-sync-scheduler.r0-1.md.

## Check plan (step 0)
Repair diff b2fe2241..HEAD: sync-links.mjs (+32/-), its unit test (harness `fakeDb`/`updateHealth` extended, no assertion removed or weakened: 5 removed lines are all harness replacements), docs/whatsapp/sync.md, qa bookkeeping. Whole-unit diff 7b572ebc...HEAD: 4 product/test/doc files + qa files, no deletions or renames, nothing outside the manifest scope (4c clean). Tier L (prod-write|tenancy, scripts/whatsapp/sync-links.mjs:207; unchanged). api-only: no browser or persona walk. Changed criteria this cycle: W9-7 (tenant listing), W9-2 (lock classification), W9-3 (flag writes), W9-1 (mid-run recheck now tested), W9-8 (seed failure handling). Checks: re-run all verify commands on a clean `git archive HEAD` copy (junctioned node_modules, unlinked after), re-run my cycle-0 probes verbatim (D-015), one falsification per changed criterion in per-mutant copies, own lock-code probe, real Mongo only on my throwaway replica set 127.0.0.1:27399 (pid started and stopped by me; no production).

## Re-run (step 3)
- `W9_TEST_MONGO_URL=mongodb://127.0.0.1:27399/?replicaSet=w9chkA2 node --test --import tsx scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs` -> 26 pass, 0 fail (25 unit + 1 real-Mongo).
- Cycle-0 probes, verbatim from qa/evidence/wa-sync-scheduler/ (A-probe-p1-unlink-tenant, A-probe-run-rows, A-probe-seed): 3/3 pass. P7 now prints `tenants: ["tenant-solo"]` (was `[]`), `pending flag after cycle: undefined` (was `true`), archiver owner state `unlinked` (was `active`). Run-rows probe on the real validators accepts skipped/skipped/failed/partial rows and the health write with `$addToSet`/`$pull` (`flags:["needs-relink","stale"]`). Seed probe: env-map-only tenant seeded then synced, isolated per tenant.
- Own probe A-c1-lock-codes: real T-038 lock held -> `LockFailure code=locked`; missing lock dir -> `LockFailure code=lock-failed`. So `e.code === "locked"` (sync-links.mjs:54) separates contention from a lock-dir fault as claimed.
- Docs check: `requireScriptDatabase` uses `argv.includes("--i-know-this-is-production")` and needs `MONGODB_DB=lkb|lkb_prod` (transcript-provenance.mjs:150-163); the corrected docs line is true.

## Criteria
- W9-1 PASS · W9-2 PASS · W9-3 PASS · W9-4 PASS · W9-5 PASS · W9-6 PASS · W9-8 PASS (W9-4..W9-6 untouched this cycle: inputs unchanged, recorded cycle-0 result kept, and their tests still green in the 26).
- W9-7 PASS (was FAIL). `listTenantIds` (sync-links.mjs:201-208) now also lists tenants from `distinct("tenantId", {state:{$in:[unlinked,revoked]}, archiverUnlinkPending:true})`, so `driveArchiverUnlinks` runs for a user whose only link ended; the new wired test uses an unlinked-only and a revoked-only tenant with no faked `listTenantIds`, covers a still-failing then succeeding unlink, ignores a non-terminal pending row, and shows a confirmed tenant no longer listed. Cycle-0 repro now green on real Mongo. Residual (declared, open point 1): W8 owns `archiverUnlinkPending`; the W1 validator rejects it on insert today, so on a validated DB there is nothing to retry until W8; the criterion is proven against the contract shape, as the plan states ("retries from W8").
- Cycle-0 P2 (mid-run recheck untested): fixed, test added, falsified below. Cycle-0 B-P3 equivalent (lock fault vs held) and review lows (flag overwrite, docs flag spelling, swallowed seed failure): fixed and verified above.

## Falsification (4b), each mutant in its own copy dir, green-before exit 0 in that dir, restored by discarding the dir (no trap; D-020 per-mutation)
| Crit | Edit | Result |
|---|---|---|
| W9-1 | remove mid-run `fresh?.state !== "active"` recheck (:80) | red: "a link suspended between two groups of one run" |
| W9-2 | any acquire error = skipped (`if (true)` at :54) | red: "a held lock is skipped ... any other acquire failure ..." |
| W9-3 | drop the `$pull` (:223) | red: health flags `$addToSet/$pull` test |
| W9-7 | drop `...owing` from the returned tenants (:207) | red: "W9-7 wired: a tenant whose ONLY link is a pending terminal link" |
| W9-8 | drop env-map tenant union | red: "W9-8 wired: an env-map tenant whose seed fails once is still listed" |
Extras (cap 10, total mutations 10): `$addToSet` never adds (red: flags test AND fake-archiver wired test), revoked dropped from `owing` (red), `owing` ignoring the pending flag (red), seed failure not logged (red, same seed test), lock fault not logged (red, held-lock test). 10/10 killed, each by the assertion named for it. HEAD fidelity: `git hash-object` of the copy's sync-links.mjs, both test files and sync.md equals `git rev-parse HEAD:<file>` and the bound blobs (checked after the run); bound tree `git status` clean before writing this verdict.
CAPABILITY-COVERAGE: 5/5 floor rows plus 5 extras reproduced. Evidence: qa/evidence/wa-sync-scheduler/A-c1-mutation-harness.mjs.txt, A-c1-mutation-run.txt, A-c1-lock-codes.mjs.txt.

## Tenancy / isolation (security read of changed lines)
The new `owing` read is a second raw cross-tenant `distinct` returning tenant ids only (read-only, app DB); every per-tenant read/write after it uses the tenant-scoped accessors. `pendingUnlinks`/`confirmUnlink` act on `stores.links(tenantId)` only. `$addToSet`/`$pull` target `health.flags` of one `_id` within the tenant-scoped collection. The unlink retry trusts the terminal row's `archiverOwnerId`; owner reuse by a newer link is a W8 precondition recorded in docs/whatsapp/sync.md (open point 10), not W9 code.

PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"A lock-acquire fault records a failed run but raises no health flag or alert","evidence":"sync-links.mjs:55-56 returns persist() before any health write, so health.flags never gets `error` and no alert fires although R-35 defines `error` as last run failed; a broken lock directory therefore shows only in the run row and the log line","fix_direction":"on the lock-fault path also call updateHealth with flagsAdd [error] and raise the once-per-transition alert, or document that lock faults are log-only"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"A stale lock that T-038 refuses to steal is skipped silently every cycle","evidence":"join-rules-store-lock-steps.ts:132 throws LockFailure code `locked` for an old lock whose holder is alive, on another host, or unknowable; sync-links.mjs:54 records it as skipped with errorCode null and no log, so it looks like healthy contention indefinitely","fix_direction":"log by code (or count consecutive skipped runs and raise a flag) when the same link is skipped N cycles in a row"}

VERDICT: PASS
SCOREBOARD: 8/8 criteria met (W9-1..W9-8), 0/0 contract invariants (none in the contract file); ISS-WAOWNER-001 holds
TIER: L (prod-write|tenancy, scripts/whatsapp/sync-links.mjs:207; unchanged)
FAILURES: none
CAPABILITY-COVERAGE: 10/10 rows reproduced (5 floor, 5 extra)
LIVE-BROWSER: not-applicable (api-only: scripts and docs)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1, P2, both low, non-blocking)
EXECUTOR: claude-sonnet (checker: claude-sonnet-subagent)
EXPLANATION: The cycle-0 FAIL (unlink retries skipped tenants whose only link had ended) is fixed and my own cycle-0 repro now passes on real Mongo; the lock classification, `$addToSet`/`$pull` flag writes, mid-run recheck and seed-failure logging are each backed by a test that goes red when the code is mutated. W9-7 still depends on W8 adding `archiverUnlinkPending` to the schema, as the manifest declares. Two low observations are proposed, neither blocks.
Metrics: start=2026-10-30T11:54:59Z end=2026-10-30T12:08:00Z wall_min=13 agent_min=13 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=10 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=780 mutants=5 defects_unit=0 defects_6c=0
