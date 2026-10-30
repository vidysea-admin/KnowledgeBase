# Verdict (coordinator B, blind) - wa-sync-scheduler, repair re-check
Date: 2026-10-30 · Bound root: D:/KnowledgeBase/.worktrees/wa-sync-scheduler · Base 7b572ebc (= merge-base with docs/devops-golive-2026-10-26) · Head 7bbccd60 (code head cd9f3b03) · Repair base: b2fe2241 (ancestor of HEAD)
Cycle checked: 1 (manifest `Fix cycle: 1`; the dispatch text said "0", the manifest and the cycle-1 repair dispatch say 1, the manifest wins) · Policy-Version: proportional-verification/2026-10-19.17 · Dual check: coordinator B (no side effects; findings as PROPOSED-ISSUE)
Cycle-0 verdict archived to qa/verdicts/wa-sync-scheduler.b.r0-1.md. Evidence: qa/evidence/wa-sync-scheduler-b/c1-*.

## Check plan
api-only, no UI, no personas. L (prod-write|tenancy, dual). Repair scope: my cycle-0 FAIL (P1 W9-7 tenant listing) and my two lows (P2 MO1 survivor, P3 lock-fault classification), plus every criterion whose input the repair diff touches:
W9-7 (listTenantIds), W9-8 (seed logging, env union), W9-2 (lock acquire), W9-3 (health flags), W9-1 (mid-run recheck). Steps: (1) blob fidelity; (2) manifest verify commands incl. real Mongo; (3) read repair diff b2fe2241..cd9f3b03 in full and
the whole-unit file list (4c); (4) cycle-0 repro probes re-run verbatim (D-015); (5) own wired probes on real Mongo for the changed paths; (6) one falsification per changed criterion in a copy, per-mutation backup, HEAD-blob check.

## Steps
- Fidelity: bound tree clean; `sync-links.mjs` blob ed8d21f0 equals HEAD in the `git archive HEAD` copy (outside the root, node_modules junctions, `@lkb/*` pointed at the copy's packages) and after all 9 mutations.
- 4c: repair diff touches only sync-links.mjs, its test, docs/whatsapp/sync.md and qa files. Removed lines are the replaced code (flags `$set`, bare catch, single `distinct`, `=true` flag text) and the old test harness; no assertion deleted or weakened; nothing outside the manifest's "What changed".
- Verify commands (copy, private replica set 127.0.0.1:28817 started and stopped by this check, production never touched): `sync-links.test.mjs` 25/25; with `W9_TEST_MONGO_URL` plus the mongo test 26/26.
- D-015 verbatim re-run of my cycle-0 probes (only the Mongo URL changed): probe-single-link-tenant `tenants listed: ["solo-tenant"]` (was []), unlink calls `[["unlink","1111..."]]` (was []), `flag still set: undefined` (was true);
  probe-env-tenant unlink confirmed. P1 fixed on the wired path.
- Own wired probes on real Mongo (c1-probe-wired.mjs, ALL OK): S1 health flags (preset `quiet` kept, `needs-relink` added by `$addToSet`, second logged_out cycle raises no second alert, `needs-relink` pulled on reconnect, clean run keeps list unique and valid);
  S2 link suspended between two groups: second group never fetched, run `partial`/`link_inactive`, row persisted; S3 held lock = `skipped`/null/no log, lock dir replaced by a file (ENOTDIR) = `failed`/`unknown`, log `lock acquire failed (lock-failed)` with no path or text, both rows pass the strict validator;
  S4 revoked-only tenant is listed, failing unlink keeps the flag and logs `archiver_api_unreachable` without upstream text, `owner_not_found` counts as confirmed and unsets the flag, no further calls, non-pending terminal rows (false or absent flag) never unlinked, tenant stops being listed.
- Lock codes: read join-rules-store-lock-steps.ts:107,132,138,139: T-038 throws `locked` only for contention (or an un-stealable stale lock) and `lock-failed` for create errors, so the new `code === "locked"` test classifies correctly.
- Falsification (copy, floor 1 per changed criterion, plus extras; table in c1-mutation-run.txt, every row green-before 1/0 (W9-8c 2/0), red-after, HEAD-OK):
  W9-7 drop `...owing` -> red (new wired pending-terminal test); W9-8a drop env-map union -> red (seed-fails-once test; this kills the cycle-0 MO1 survivor); W9-8b stop logging seed failure -> red; W9-8c remove seed -> red (ISS-WAOWNER-001 test);
  W9-2 any acquire error = skipped -> red; W9-3a never `$pull` -> red; W9-3b never `$addToSet` -> red; W9-3c whole-array `$set` again -> red; W9-1 remove mid-run active recheck -> red.
- Tenancy/security read of the changed lines: the second `distinct` returns tenant ids only and is read-only; every per-tenant read/write after it goes through `stores.links(tenantId)`; unlink retries use only `archiverOwnerId` of the same tenant's terminal row; `whatsapp_links_archiver_owner` is unique across tenants for string owners, so an owner is not shared between a terminal and another link (W8 dependency recorded in sync.md, open point 10). No leak found.
- Docs claims checked against code: bare `--i-know-this-is-production` (PRODUCTION_FLAG, `argv.includes`) is correct; the one-instance and lock-fault paragraphs match the code.

## Findings (none blocking)
All three cycle-0 findings are fixed: P1 (W9-7, high) by the `owing` union plus the wired test and my probe; P2 (MO1) now killed by the seed-fails-once test; P3 (lock) by the held-vs-fault split.
PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"A lock that is held, or stale but not stealable (other host, live holder, unknown liveness), is recorded as quiet `skipped` with errorCode null on every cycle; the health `stale` flag and alert never run because the link returns before updateHealth, so a stuck stale lock looks like healthy skipping until a human reads sync_runs","evidence":"scripts/whatsapp/sync-links.mjs:53-54 with join-rules-store-lock-steps.ts:132 (LockFailure locked for the un-stealable stale case)","fix_direction":"after N consecutive skipped runs with no ok run, raise the existing `stale` flag or log once by code; documented T-038 behaviour, not a W9 acceptance item"}
PROPOSED-ISSUE: {"severity":"low","feature":"wa-sync-scheduler","title":"updateHealth is two updates ($set+$addToSet, then $pull); if the second fails the run row is already saved and the flags are only corrected by the next cycle (self-healing, recorded as `run not recorded`)","evidence":"scripts/whatsapp/sync-links.mjs updateHealth in createWiredDeps","fix_direction":"none needed; note only (Mongo forbids both operators on one path)"}
Non-blocking notes: a concurrent writer's `stale` flag is cleared by a successful run by design (flag logic), a concurrent `quiet` is untouched (S1). Alerts stay `console.error` until H-13 (declared). W8 owns `archiverUnlinkPending` in the schema (declared, open point 1).

VERDICT: PASS
SCOREBOARD: 8/8 criteria met, 0/0 invariants
TIER: L (prod-write|tenancy scripts/whatsapp/sync-links.mjs:207 tenant listing and :218 recordRun; dispatched floor kept)
FAILURES: none
CAPABILITY-COVERAGE: 9/9 mutation rows reproduced in a copy (5 floor rows W9-7, W9-8a, W9-2, W9-3a, W9-1 red; 4 extras W9-8b, W9-8c, W9-3b, W9-3c red); cycle-0 P2 survivor now killed
LIVE-BROWSER: not-applicable (api-only; scripts and docs only)
ISSUES-WRITTEN: none (dual coordinator: PROPOSED-ISSUE P1..P2 only, both low)
EXECUTOR: claude-sonnet (builder subagent for the maker) (checker: claude-sonnet-subagent)
EXPLANATION: The cycle-0 high finding is fixed and re-proved on the wired path with real Mongo: a tenant whose only link ended with a pending unlink is now listed, the unlink is retried until confirmed and then stops. The lock-fault split, `$addToSet`/`$pull` flags and the mid-run active recheck all hold on real Mongo and each has a red-after falsification. Only two low notes remain, neither tied to an acceptance item. Process note: part of this check's setup briefly overwrote another coordinator's scratch copy (see checkpoint); no product file or verdict of another coordinator was read.
Metrics: start=2026-10-30T17:24:56+05:30 end=2026-10-30T17:48:00+05:30 wall_min=23 agent_min=23 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=9 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=1384 mutants=4 defects_unit=0 defects_6c=0
