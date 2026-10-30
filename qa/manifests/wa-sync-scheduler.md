# Manifest — wa-sync-scheduler
**Contract:** none specific; scope `docs/features/whatsapp-multiuser/plan.md` W9 (R-31, R-33..R-35, R-37), plus ISS-WAOWNER-001 (`qa/issues.waowner.jsonl`). Authorization: the whatsapp-multiuser plan, W9 row.
**Goal task:** whatsapp-multiuser W9 `wa-sync-scheduler`
**Date:** 2026-10-30
**Policy-Version:** proportional-verification/2026-10-19.17
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** required
dual-trigger: prod-write|tenancy scripts/whatsapp/sync-links.mjs:207
**Persona walk:** skip (no screen; a scheduled script and an operator doc)
**Issues addressed:** ISS-WAOWNER-001 (scheduler half; the seed now runs before whatsapp_links is read)
**Executor:** claude-sonnet (builder subagent for the maker)
**Round:** one round, est 60 min, tier H by the prod-write and tenancy triggers.

## Criteria
- W9-1 Fake clock: ticks at the configured cadence (clamped 5..1440 min); an active link syncs, a suspended/unlinked/requested/approved one never does; unmarked groups are never listed.
- W9-2 Two instances: the second refuses via the lock and records `skipped`; stale-lock handling follows t038.
- W9-3 Link A failing (`archive_unreachable`) does not stop link B; both have a `whatsapp_sync_runs` row with a closed-list `errorCode`; no upstream free text is stored.
- W9-4 Re-run with no new messages: zero new turns and candidates (idempotency proven by counts).
- W9-5 Per-group size/time cap yields `partial`, not a hang.
- W9-6 Status poll updates `health.lastStatus`; `logged_out` sets `needs-relink` and raises one admin alert.
- W9-7 Pending archiver `unlinkSession` retries from W8 are driven here and stop once confirmed.
- W9-8 (from the brief, ISS-WAOWNER-001) The scheduler seeds the legacy owner map before it reads `whatsapp_links`; a tenant with only the env map still syncs.

## What changed (base 7b572ebc, head 05944b47)
- NEW `scripts/whatsapp/sync-links.mjs` (224 non-blank lines): `syncLink` (one link, T-038 token-owned lock `data/whatsapp-sync/link-<id>.lock`, ownership re-checked before every write), `runCycle`, `startScheduler` (clamped cadence), `driveArchiverUnlinks`, `createFileLock`, `createWiredDeps` (real wiring over the W1 stores, W4 resolver and W3 client). Entry: `node --import tsx scripts/whatsapp/sync-links.mjs [--once]`; `requireScriptDatabase` refuses `lkb`/`lkb_prod` without the explicit production flag.
- NEW `scripts/whatsapp/sync-links.test.mjs` (20 tests, fakes plus the in-repo W3 fake archiver; no Mongo).
- NEW `scripts/whatsapp/sync-links.mongo.test.mjs` (1 test, opt-in via `W9_TEST_MONGO_URL`, needs a replica set; writes only a throwaway `lkb_test_w9_*` database). A second test file beyond the plan's "+ test", because the review ingest uses transactions and the real validators and indexes only exist in Mongo.
- NEW `docs/whatsapp/sync.md` (operator notes).
- No existing file is edited. Per-link ingest uses a resolver pinned to that one link (the re-read link row must still be `active` with the same owner), because `review/ingest.ts` drops the resolve scope (ISS-WAOWNER-002).

## Evidence
Pre-check[W9-1]: 05944b47 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 20 passed, 0 failed
Pre-check[W9-2]: 05944b47 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 20 passed, 0 failed
Pre-check[W9-3]: 05944b47 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 20 passed, 0 failed
Pre-check[W9-4]: 05944b47 W9_TEST_MONGO_URL=mongodb://127.0.0.1:27099/?replicaSet=w9rs node --test --import tsx scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs -> 21 passed, 0 failed
Pre-check[W9-5]: 05944b47 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 20 passed, 0 failed
Pre-check[W9-6]: 05944b47 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 20 passed, 0 failed
Pre-check[W9-7]: 05944b47 node --test --import tsx scripts/whatsapp/sync-links.test.mjs -> 20 passed, 0 failed
Pre-check[W9-8]: 05944b47 W9_TEST_MONGO_URL=mongodb://127.0.0.1:27099/?replicaSet=w9rs node --test --import tsx scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs -> 21 passed, 0 failed
Tests[W9-1]: scripts/whatsapp/sync-links.test.mjs — fake-clock cadence and clamp, the active-only link filter, and the owner-scoped group listing
Tests[W9-2]: scripts/whatsapp/sync-links.test.mjs — two instances over one real lock dir, the t038 stale-takeover cases, and a lock lost mid-run
Tests[W9-3]: scripts/whatsapp/sync-links.test.mjs — A fails and B still syncs, closed-list codes with no upstream text, and a store failure recording A's run
Tests[W9-4]: scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs — idempotent re-run by id-set counts, then by real collection counts on a replica set
Tests[W9-5]: scripts/whatsapp/sync-links.test.mjs — the time cap with a hung ingest, the size cap as a typed error, and the size cap through the wired fetch
Tests[W9-6]: scripts/whatsapp/sync-links.test.mjs — status into health, `needs-relink` with skip and one alert, an unreachable control plane, and the real W3 client against the fake archiver
Tests[W9-7]: scripts/whatsapp/sync-links.test.mjs — retries each cycle until confirmed, failures logged by code only, and the real client unlinking on the fake archiver
Tests[W9-8]: scripts/whatsapp/sync-links.test.mjs scripts/whatsapp/sync-links.mongo.test.mjs — env-map-only tenant read-order spy, and per-owner isolation of two links of one tenant on real Mongo
Falsification[W9-1]: remove the 5..1440 clamp (M1a) -> cadence test red; drop the `state !== "active"` re-check (M1b) -> active-only test red; drop the pinned resolver's active+owner check (M1d) -> wired-deps test red. (M1c, removing the scheduler's own owner filter in `listGroups`, survives: an equivalent mutant, because `apps/api/src/whatsapp/store.ts:146` filters by owner independently. Declared, kept as defence in depth.)
Falsification[W9-2]: ignore a held lock (M2a) -> two-instance and stale-lock tests red; drop the ownership re-check (M2b) -> lost-lock test red.
Falsification[W9-3]: store upstream message text for unknown errors (M3a) -> closed-list and per-link-failure tests red; rethrow out of the per-link catch in `runCycle` (M3b) -> new isolation test red (this one SURVIVED the first pass and the test was added); make a shrink-refused group `failed` (M3c) -> partial test red.
Falsification[W9-4]: count all turns instead of the diff (M4a) and all candidates instead of the diff (M4b) -> the idempotency test and the real-Mongo test red (2 red each).
Falsification[W9-5]: remove the time cap (M5a) -> the hung-ingest test is cancelled at the 25 s test timeout (the hang is detected, not passed); count a size-cap error as failed (M5b) -> size-cap test red; remove the wired size check (M5c) -> new wired size-cap test red (SURVIVED the first pass; test added).
Falsification[W9-6]: never raise `needs-relink` (M6a) -> status and fake-archiver tests red; sync even when logged out (M6b) -> status test red; alert on every cycle instead of each transition (M6c) -> status and failure tests red; never compute `stale` (M6d) -> control-plane test red.
Falsification[W9-7]: skip `confirmUnlink` (M7a) -> retry test and fake-archiver test red; drive no retries (M7b) -> the same two red.
Falsification[W9-8]: remove the seed before the first read (MO2) -> the env-map-only test red; combined seed and tenant union removal (MO3) -> env-map-only test and real-Mongo test red. (MO1, removing only the env-map tenant union, survives by design: the seed alone makes `distinct` find the tenant.)
Mutation method (D-020): each mutation was applied to `scripts/whatsapp/sync-links.mjs` in the worktree with its own in-memory byte backup, restored in a `finally` (no `trap EXIT`), and after every mutation `git hash-object` was compared to `git rev-parse HEAD:<file>`; every restore matched HEAD. Two passes (23 mutations, then 7 re-runs after the new tests); the harness lived outside the repo. Real-Mongo mutations ran against a throwaway local replica set on 127.0.0.1:27099.

## Open points (declared, not defects)
1. **W8 owns `archiverUnlinkPending`.** The default `pendingUnlinks`/`confirmUnlink` adapter assumes a boolean `archiverUnlinkPending` on terminal `whatsapp_links` rows; W8 must add it to the schema. Until it exists there is nothing to retry (W9-7 is proven against the contract with fakes and the fake archiver).
2. **No cap code in the closed `errorCode` list.** Time and size caps record `errorCode: "unknown"` with status `partial`. A new code would need a schema change owned by W1.
3. **`quiet` flag not computed.** Only `needs-relink`, `error`, `stale` are. Event rows (`sync.completed`/`sync.failed`) are W12's; none are written here.
4. **Alerts go to `console.error`** (ids only) until H-13 confirms the Telegram channel.
5. **`listTenantIds` uses one deliberate raw cross-tenant read** (`distinct("tenantId", {state:"active"})`) on the app database; every per-tenant read and write after it goes through the tenant-scoped accessors.
6. **ISS-WAOWNER-001 residual:** the lazy seed is skipped for a tenant that already has link rows (W4 behaviour). Not changed here.
7. **Pinned resolver instead of threading scope**, because `review/ingest.ts` drops the scope (ISS-WAOWNER-002); the pinned resolver re-reads the link row on every call, so a suspension between enumeration and ingest fails closed.
8. **A timed-out ingest is detached.** Its late completion is an idempotent upsert; the in-flight set (in memory, per instance, not shared across processes) makes the next cycle skip that group until it settles. The file lock prevents two processes from syncing the same link at once.
9. **Data plane** is read through the existing `WHATSAPP_MONGO_*` store (`listTrackableGroups`); no new connection code. Production Mongo was never touched: every proof used fakes, the in-repo fake archiver, or the throwaway local replica set.
