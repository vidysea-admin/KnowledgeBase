# Manifest — wa-sync-scheduler
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` W9 (R-31, R-33..R-35, R-37), plus ISS-WAOWNER-001 (`qa/issues.waowner.jsonl`). Authorization: the whatsapp-multiuser plan, W9 row.
**Goal task:** whatsapp-multiuser W9 `wa-sync-scheduler`
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 1
**Dual check:** required
dual-trigger: prod-write|tenancy scripts/whatsapp/sync-links.mjs:218
**Persona walk:** skip (no screen; a scheduled script and an operator doc)
**Issues addressed:** ISS-WAOWNER-001 (scheduler half; the seed now runs before whatsapp_links is read)
**Executor:** claude-sonnet (builder subagent for the maker)
**Round:** fix cycle 1, one repair round, est 30 min, tier H by the prod-write and tenancy triggers (unchanged from cycle 0).

## Criteria
- W9-1 Fake clock: ticks at the configured cadence (clamped 5..1440 min); an active link syncs, a suspended/unlinked/requested/approved one never does; unmarked groups are never listed.
- W9-2 Two instances: the second refuses via the lock and records `skipped`; stale-lock handling follows t038.
- W9-3 Link A failing (`archive_unreachable`) does not stop link B; both have a `whatsapp_sync_runs` row with a closed-list `errorCode`; no upstream free text is stored.
- W9-4 Re-run with no new messages: zero new turns and candidates (idempotency proven by counts).
- W9-5 Per-group size/time cap yields `partial`, not a hang.
- W9-6 Status poll updates `health.lastStatus`; `logged_out` sets `needs-relink` and raises one admin alert.
- W9-7 Pending archiver `unlinkSession` retries from W8 are driven here and stop once confirmed.
- W9-8 (from the brief, ISS-WAOWNER-001) The scheduler seeds the legacy owner map before it reads `whatsapp_links`; a tenant with only the env map still syncs.

## What changed (fix cycle 1; cycle-0 base 7b572ebc, cycle-0 head b2fe2241, cycle-1 code head cd9f3b03)
Cycle 0 returned FAIL from both checkers (A: `qa/verdicts/wa-sync-scheduler.md`, B: `qa/verdicts/wa-sync-scheduler.b.md`) on one shared high finding plus lows. Edited in place, no new file:
- `scripts/whatsapp/sync-links.mjs` `createWiredDeps().listTenantIds` (A-P1 = B-P1, high, W9-7): now also lists tenants that have a terminal (`unlinked`/`revoked`) link with `archiverUnlinkPending: true`, via a second `distinct`. Before, a user's only link ending meant the tenant was never visited and `driveArchiverUnlinks` never ran for it.
- Same function (review low): a failed legacy seed is logged by code (`classifyError`, never upstream text) instead of swallowed; the env-map tenant stays listed so the seed is retried in the same cycle (this is the behaviour MO1 protects).
- `syncLink` lock acquire (B-P3): only a T-038 `LockFailure` with `code: "locked"` records `skipped` (errorCode null, quiet). Any other acquire failure records `failed` / `unknown` and logs `lock acquire failed (<code>)`, no message text.
- Health flags (review low): `patch.flags` (whole-array `$set`) is replaced by `flagsAdd` / `flagsRemove` in the patch; the wired `updateHealth` issues `$set` of the scalars plus `$addToSet` (an empty `$each` still creates `health.flags: []`, checked on real Mongo), then a separate `$pull` when something is to be removed (Mongo forbids both on one path in one update). A flag another writer sets during a run is no longer overwritten.
- Header and `docs/whatsapp/sync.md` (review low): the production flag is the bare `--i-know-this-is-production` (the code does `argv.includes`), not `=true`; added "run exactly one scheduler instance per database", the lock-fault behaviour, the new tenant listing and the `$addToSet`/`$pull` note, and a W8 dependency note (see open point 10).
- `scripts/whatsapp/sync-links.test.mjs`: 20 -> 25 tests. New: wired `runCycle` with tenants whose ONLY link is a pending terminal link (no faked `listTenantIds`, also a still-failing then succeeding unlink, a non-terminal pending row ignored, confirmed tenant stops being listed); env-map seed that fails once; mid-run suspension between two groups (A-P2); held lock vs acquire fault, including a real missing lock dir; flags via `$addToSet`/`$pull` with a concurrent writer's flag. The in-memory harness and `fakeDb` now mirror `$addToSet`/`$pull`.
- `scripts/whatsapp/sync-links.mongo.test.mjs` is unchanged and still passes (its `health.flags` deep-equal `[]` check covers the `$addToSet` empty `$each` behaviour on real validators).

## Evidence
Pre-check[W9-1]: cd9f3b03 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 25 passed, 0 failed
Pre-check[W9-2]: cd9f3b03 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 25 passed, 0 failed
Pre-check[W9-3]: cd9f3b03 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 25 passed, 0 failed
Pre-check[W9-4]: cd9f3b03 W9_TEST_MONGO_URL=mongodb://127.0.0.1:27199/?replicaSet=w9bchk node --test --import tsx scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs -> 26 passed, 0 failed
Pre-check[W9-5]: cd9f3b03 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 25 passed, 0 failed
Pre-check[W9-6]: cd9f3b03 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 25 passed, 0 failed
Pre-check[W9-7]: cd9f3b03 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 25 passed, 0 failed
Pre-check[W9-8]: cd9f3b03 W9_TEST_MONGO_URL=mongodb://127.0.0.1:27199/?replicaSet=w9bchk node --test --import tsx scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs -> 26 passed, 0 failed
Tests[W9-1]: scripts/whatsapp/sync-links.test.mjs — fake-clock cadence and clamp, the active-only link filter, owner-scoped group listing, and (new) a link suspended between two groups of one run
Tests[W9-2]: scripts/whatsapp/sync-links.test.mjs — two instances over one real lock dir, t038 stale takeover, a lost lock, and (new) held lock = skipped vs acquire fault = failed/unknown, including a real missing lock directory
Tests[W9-3]: scripts/whatsapp/sync-links.test.mjs — A fails and B still syncs, closed-list codes with no upstream text, a store failure recording A's run, and (new) flags changed by `$addToSet`/`$pull` so another writer's flag survives
Tests[W9-4]: scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs — idempotent re-run by id-set counts, then by real collection counts on a replica set (health.flags `[]` through `$addToSet`)
Tests[W9-5]: scripts/whatsapp/sync-links.test.mjs — the time cap with a hung ingest, the size cap as a typed error, and the size cap through the wired fetch
Tests[W9-6]: scripts/whatsapp/sync-links.test.mjs — status into health, `needs-relink` with skip and one alert, an unreachable control plane, and the real W3 client against the fake archiver
Tests[W9-7]: scripts/whatsapp/sync-links.test.mjs — (new) wired `runCycle` over a tenant whose only link is a pending `unlinked` link and another whose only link is `revoked`: unlink called, failure keeps the flag, success clears it, no further calls, tenant no longer listed; plus the cycle-0 retry tests
Tests[W9-8]: scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs — env-map-only tenant read-order spy, (new) env-map tenant whose seed fails once is still listed and syncs in the same cycle, and per-owner isolation on real Mongo
Falsification[W9-1]: remove the mid-run `fresh?.state !== "active"` recheck (F2, A-P2) -> new suspension-between-groups test red (1 red); cycle-0 mutants M1a/M1b/M1d still red in the cycle-0 pass and were not re-run (the code they touch is unchanged).
Falsification[W9-2]: treat any lock acquire error as `skipped` (F3, B-P3) -> new held-vs-fault test red (1 red).
Falsification[W9-3]: stop pulling removed flags (F4a) -> new flags test red; never add flags (F4b) -> flags test and the fake-archiver wired test red (2 red); raise alerts on every cycle instead of on transition (F6) -> failing-link and status tests red (2 red).
Falsification[W9-4]: unchanged since cycle 0 (M4a/M4b red); the cycle-1 changes do not touch the diff counting, and the real-Mongo test re-ran green at 26/26.
Falsification[W9-5]: unchanged since cycle 0 (M5a..M5c red); not re-run, the code is untouched.
Falsification[W9-6]: unchanged since cycle 0 (M6a..M6d red); F6 above also covers the once-per-transition alert.
Falsification[W9-7]: drop the `owing` tenant union from `listTenantIds` (F1, A-P1/B-P1) -> new wired pending-terminal-link test red (1 red).
Falsification[W9-8]: drop the env-map tenant union (F1b = B-P2 / builder MO1, which survived cycle 0) -> new seed-fails-once test red (1 red); stop logging the seed failure (F5) -> same test red (1 red).
Measurement against the checkers' recorded repros (D-015), each re-run verbatim from `qa/evidence/` after the fix, on a throwaway local replica set 127.0.0.1:27199 (`w9bchk`), production never touched:
- A-P1: `A-probe-p1-unlink-tenant.mjs.txt` (run as `w9chkA-probe7.test.mjs`) 1/1 passed; `tenants: ["tenant-solo"]` (was `[]`), `pending flag after cycle: undefined` (was `true`), archiver owner state `unlinked` (was `active`).
- B-P1: `probe-single-link-tenant.mjs` 1/1: `tenants listed: ["solo-tenant"]` (was `[]`), unlink calls `[["unlink","111111111111111111111111"]]` (was `[]`), `flag still set: undefined` (was set).
- B-P2: `probe-env-tenant.mjs` 1/1: unlink confirmed; MO1 itself is now killed by the new seed-fails-once test (F1b red). The probe's env tenant is additionally covered by the `owing` union, so the probe alone no longer distinguishes MO1; the new test does.
- A-P2: no probe (a mutant); F2 above is its measurement, 1/1 killed.
- B-P3: no probe (code read); F3 above and the real missing-lock-dir case in the new test, 1/1 killed.
Mutation method (D-020, cycle 1): every mutation was applied in a `git archive HEAD` copy outside the repo (scratchpad `copy/`), never the bound tree. Each mutation had its own in-memory byte backup taken immediately before and restored in a `finally` (no `trap`, no run-scoped backup); after every mutation `git hash-object` of the copy's `sync-links.mjs` was compared with `git rev-parse HEAD:scripts/whatsapp/sync-links.mjs` and matched every time (8 of 8, plus the final check); green-before was 25/25 in the copy. The three probes were copied into `scripts/whatsapp/` only for the run and deleted after (`git status` clean apart from the manifest).

## Open points (declared, not defects)
1. **W8 owns `archiverUnlinkPending`.** The default `pendingUnlinks`/`confirmUnlink` adapter assumes a boolean `archiverUnlinkPending` on terminal `whatsapp_links` rows; W8 must add it to the schema (the W1 validator rejects it on insert today; both checkers bypassed validation to insert it, and `$unset` of it passes on real Mongo). Until it exists there is nothing to retry; W9-7 is proven against the contract with fakes, the fake archiver, and now the wired tenant listing.
2. **No cap code in the closed `errorCode` list.** Time and size caps record `errorCode: "unknown"` with status `partial`. A lock-acquire fault also records `failed`/`unknown` for the same reason. A new code would need a schema change owned by W1.
3. **`quiet` flag not computed.** Only `needs-relink`, `error`, `stale` are. Event rows (`sync.completed`/`sync.failed`) are W12's; none are written here.
4. **Alerts go to `console.error`** (ids only) until H-13 confirms the Telegram channel.
5. **`listTenantIds` uses two deliberate raw cross-tenant reads** (`distinct("tenantId", ...)` for active links and for terminal links owing an unlink) on the app database; both return tenant ids only and are read-only. Every per-tenant read and write after that goes through the tenant-scoped accessors.
6. **ISS-WAOWNER-001 residual:** the lazy seed is skipped for a tenant that already has link rows (W4 behaviour). Not changed here; the issue stays open.
7. **Pinned resolver instead of threading scope**, because `review/ingest.ts` drops the scope (ISS-WAOWNER-002); the pinned resolver re-reads the link row on every call, so a suspension between enumeration and ingest fails closed.
8. **A timed-out ingest is detached.** Its late completion is an idempotent upsert; the in-flight set (in memory, per instance) makes the next cycle skip that group until it settles. Documented in `docs/whatsapp/sync.md`: run exactly one scheduler instance per database.
9. **Data plane** is read through the existing `WHATSAPP_MONGO_*` store (`listTrackableGroups`); no new connection code. Production Mongo was never touched.
10. **W8 dependency, not built here (review note):** the unlink retry trusts `archiverOwnerId` on the terminal row. W8 must assert, before it sets `archiverUnlinkPending`, that the owner has not been reused by a newer link (the schema says it is unique and never reused). Recorded in `docs/whatsapp/sync.md`; no code in W9.
11. **`health.flags` order:** `$addToSet` appends, so the stored order is arrival order, not alphabetical. Nothing reads the order; the schema marks the list `uniqueItems`.
