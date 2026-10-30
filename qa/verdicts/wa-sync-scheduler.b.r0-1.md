# Verdict (coordinator B, blind) - wa-sync-scheduler
Date: 2026-10-30 · Bound root: D:/KnowledgeBase/.worktrees/wa-sync-scheduler · Base 7b572ebc (merge-base with docs/devops-golive-2026-10-26 confirmed) · Head b2fe2241
Cycle checked: 0 · Policy-Version: proportional-verification/2026-10-19.17 · Dual check: coordinator B (no side effects; findings as PROPOSED-ISSUE)
Contract: plan.md W9 rows (7) + the brief's ISS-WAOWNER-001 row (W9-8); spec R-31, R-33..R-35, R-37, R-7 (retry sentence). Evidence: qa/evidence/wa-sync-scheduler-b/results.md

## Check plan
api-only, no UI, no browser walk, no personas. Plan: (1) bound-tree blob fidelity vs HEAD; (2) re-run manifest verify commands incl. real-Mongo; (3) read the full diff (4c) and the code paths it composes
(owner-config.ts, review/compose.ts, store.ts, review/ingest.ts, t038 lock); (4) one falsification per criterion in a copy, plus judge builder survivors M1c and MO1;
(5) security/tenancy read of per-link scoping; (6) one differential probe on real (private, local) Mongo for the wired path.

## Steps
- Fidelity: git status clean; `sync-links.mjs`, both tests and `sync.md` hash to their HEAD blobs. 4c: diff is 5 added files only, nothing removed or renamed, all listed in "What changed". 05944b47..b2fe2241 is manifest-only.
- Environment: the bound worktree has no `apps/api/node_modules`, so 4 wired-deps tests fail there with `ERR_MODULE_NOT_FOUND @lkb/db` (not a code defect). Everything ran in a `git archive HEAD` copy outside the root with node_modules junctions.
- Verify commands in the copy: sync-links.test.mjs 20/20; with the private replica set (127.0.0.1:27199, started and stopped by this check; production never touched) plus the mongo test 21/21.
- Falsification (8 floor + 4 extra incl. M1c, MO1; each in the copy, per-mutation backup, HEAD blob verified after every one): all 8 floor rows green-before/red-after (W9-1 clamp, W9-2 held lock, W9-3 rethrow, W9-4 diff counts, W9-5 cap->hitCap, W9-6 needs-relink, W9-7 confirmUnlink, W9-8 seed). Extras W9-1b, W9-3b red. Table in results.md.
- Per-link scoping (tenancy): pinned resolver re-reads the link row on every call (owner and `active` must match); `listGroups` and footprints go through tenant-scoped accessors; lock path is built only after the 24-hex link id check; jid regex-filtered. The real-Mongo test shows own-owner-only turns per tenant and no work or run row for the suspended link. No cross-owner or cross-tenant leak found. The raw `distinct("tenantId",{state:"active"})` in `listTenantIds` returns tenant ids only and is read-only.
- ISS-WAOWNER-001 (scheduler half): `listTenantIds` runs the resolver (which seeds) for every map entry before the first `whatsapp_links` read; removing it turns the env-map test red (W9-8). Residual (seed skipped once any link row exists) is W4 behaviour, declared, issue stays open.
- Builder survivors: M1c is equivalent (store.ts:146 filters to the queried owner and the pinned resolver yields one grant). MO1 is NOT redundant: see P1.

## Findings
[W9-7] sev: high - the wired `listTenantIds` (scripts/whatsapp/sync-links.mjs:196) lists only tenants with an `active` link (plus env-map tenants), so `driveArchiverUnlinks` (:135) never runs for a tenant whose last link has just been unlinked or revoked, which is exactly the R-7 case "archiver unreachable, retried by the scheduler until it succeeds". Ran it myself (probe-single-link-tenant.mjs, real Mongo, copy): `tenants listed: []`, `pendingUnlinks(solo-tenant)` returns the row, but after a full `runCycle` unlink calls = `[]` and the flag is still set. W9-7's unit test and the W3 fake-archiver test pass only because their tenant also has an active link (test line 294) or a hard-coded `listTenantIds`. Env-map tenants are driven only because of the MO1 union: probe-env-tenant.mjs shows `raw distinct(active): []` yet the unlink is confirmed; MO1 (removing that union) survives all 21 tests. Fix direction: also include tenants with terminal links flagged `archiverUnlinkPending` in `listTenantIds` (second `distinct`), add a wired test for a tenant whose only link is unlinked+pending (this also kills MO1). Note: this is about driving the archiver unlink retry (W9-7 acceptance), not consent policy.
Open point 1 (W8 adds `archiverUnlinkPending` to the schema; the W1 validator rejects it today) is declared and not counted; the defect above exists on the wired path regardless.

PROPOSED-ISSUE: {"severity":"high","feature":"wa-sync-scheduler","title":"Wired listTenantIds omits tenants whose only links are unlinked/revoked with archiverUnlinkPending, so driveArchiverUnlinks never retries the archiver unlink for a single-link tenant (W9-7 / R-7 unmet on the wired path)","evidence":"scripts/whatsapp/sync-links.mjs:196; qa/evidence/wa-sync-scheduler-b/probe-single-link-tenant.mjs (tenants listed [], unlink calls [])","fix_direction":"union tenants having terminal links with archiverUnlinkPending into listTenantIds; wired test with a tenant whose only link is unlinked+pending"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"Mutant MO1 (env-map tenant union in listTenantIds) survives; builder called it redundant but it alone drives unlink retries for an env tenant with no active link; no test pins it","evidence":"qa/evidence/wa-sync-scheduler-b/probe-env-tenant.mjs","fix_direction":"covered by the P1 wired test"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"Any lock.acquire failure (permission or missing lock dir, not only a held lock) is recorded as status skipped with errorCode null and no log, so a permanent lock-dir fault looks like healthy skipping","evidence":"scripts/whatsapp/sync-links.mjs:53","fix_direction":"treat only the t038 held/contended outcome as skipped; log or fail other acquire errors by code"}
Non-blocking notes: alert is `console.error` until H-13 (declared); a timed-out ingest is detached and its in-flight guard is per-process (declared #8, idempotent upsert).

VERDICT: FAIL
SCOREBOARD: 7/8 criteria met (W9-7 unmet on the wired path), 0/0 invariants
TIER: L (prod-write|tenancy scripts/whatsapp/sync-links.mjs:207; dispatched floor kept)
FAILURES:
- [W9-7] sev: high · unlink retries are never driven for a tenant with no active link (sync-links.mjs:196) · add terminal+pending tenants to listTenantIds and a wired single-link test · issue: P1
CAPABILITY-COVERAGE: 12/12 mutation rows reproduced in a copy (8 floor red, 2 extra red, M1c equivalent, MO1 survives = P2)
LIVE-BROWSER: not-applicable (api-only; scripts and docs only)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1..P3 only)
EXECUTOR: claude-sonnet (builder subagent for the maker) (checker: claude-sonnet-subagent)
EXPLANATION: Seven of eight criteria hold, including per-link owner and tenant scoping, lock, caps, health flags and the seed-before-read order. The wired tenant listing only visits tenants with an active link, so the archiver unlink retry (W9-7, R-7) never runs for a single-link tenant; I reproduced this on a private local replica set. The fix is a few lines plus one test.
Metrics: start=2026-10-30T16:54:58+05:30 end=2026-10-30T17:08:00+05:30 wall_min=13 agent_min=13 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=12 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=780 mutants=4 defects_unit=1 defects_6c=0
