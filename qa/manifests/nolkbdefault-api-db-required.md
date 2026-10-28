# Manifest: nolkbdefault-api-db-required
**Handshake status:** checked-PASS
Fix cycle: 0
**Lane:** nolkbdefault (branch lane/nolkbdefault, from lane/legacyseed 129e3146). **Fixes:** ISS-LEGACYSEED-009 (high), ISS-LEGACYSEED-010 (medium). Security / data-write class. No real DB was connected.

## Scope
1. API server has NO database default. `apps/api/src/index.ts` now calls `startFromEnv` (new `bootstrap.ts`), which resolves `requireDatabaseName(env)` BEFORE connect/build/listen; unset or blank `MONGODB_DB` throws "MONGODB_DB is required". `scripts/webinar/join-rules-api-host.ts` (a second API entrypoint, ISS-LEGACYSEED-004) uses the same guard.
2. lkb_staging needs `LKB_ALLOW_STAGING=lkb_staging` (exact, lowercase name) on every guard path: `requireWorkDatabase` (so also requireBackfillDatabase/requireLegacyUnboundDatabase fall-through, toc-recovery-import), the API server, `store.getWorkDatabase`, the `/gmail/scan` and `/meeting-candidates` routes (via `isRefusedWorkDb`), `run-pipeline.mjs validateRunGate`, `run-pipeline-deps.mjs`, `sync-session.mjs` (via `isProtectedWorkDbName`).
3. Deploy config: docker-compose.yml sets `MONGODB_DB: lkb` EXPLICITLY for api and migrate (no `:-lkb` fallback); .env.example and apps/api/Dockerfile document it as required. CI workflow and existing tests never boot index.ts (checked: no test imports it; demo-live.mjs already passes MONGODB_DB), so no change needed.

## OWNER ACTION
The main-tree `.env` has NO `MONGODB_DB` line (checked by presence only). A local `pnpm --filter @lkb/api dev` will now refuse to start until Umesh adds `MONGODB_DB=<name>` to `.env`. `.env` not edited.

## Files
apps/api/src/{db-name.ts,bootstrap.ts,index.ts,store.ts,routes/meeting-candidates.ts}, scripts/lib/transcript-provenance.mjs, scripts/webinar/{join-rules-api-host.ts,run-pipeline.mjs,run-pipeline-deps.mjs,sync-session.mjs}, docker-compose.yml, .env.example, apps/api/Dockerfile. Tests: apps/api/src/db-name.test.ts (new, 6), scripts/lib/legacy-unbound.test.mjs (+1).

## Criteria
1. Server refuses to start without a DB name (unset, "", whitespace) before any connect. 2. Explicit name starts (fake connect/startServer). 3. Every guard path refuses lkb_staging without the opt-in; accepts only exact `lkb_staging` + exact opt-in. 4. Ordinary work DBs and lkb refusal unchanged.

## Evidence
- Reproductions per id: ISS-LEGACYSEED-009: 1/1 (api started with no DB name -> was `lkb`; now refused; test also covers ""/whitespace). ISS-LEGACYSEED-010: 1/1 recorded case (requireWorkDatabase/requireBackfill/requireLegacyUnbound fall-through with LKB_ALLOW_STAGING undefined, MONGO_WORK_DB=lkb_staging -> now refused), plus 4 variants (MONGODB_DB set, uppercase name, empty/wrong opt-in), all refused.
- apps/api/src/db-name.test.ts: 6/6 pass. scripts/lib/legacy-unbound.test.mjs + transcript-provenance + toc-recovery-import + toc-embedding-backfill: pass.
- Full apps/api suite: 764 tests, 763 pass, 1 fail = activity-health router.test.ts (needs D2_FIXTURE_PYTHON with pymongo; same failure with my changes stashed). tsc apps/api: clean.
- scripts/lib + scripts/webinar + lint.test: 345 tests, 333 pass, 12 fail, all pre-existing/environmental (mutate.test x6 and start-record-detached x5 fail identically with changes stashed; ffmpeg synthetic video; G4 manifests gate). Not caused by this change.
- Mutations 7/7 killed, each restored and hash-verified: lkb default back in requireDatabaseName; bootstrap `?? "lkb"`; stagingAllowed ignores opt-in; store.getWorkDatabase old list; /gmail/scan route old list; requireWorkDatabase staging check removed; stagingRefused always false.
- Not touched (already filed, other writers still defaulting to lkb): ISS-LEGACYSEED-001,002,003,005,006 (seed-demo-server, mint-key, watch-config, live-verify, eval-recall). ISS-LEGACYSEED-004 (join-rules-api-host.ts) and 007's staging guard (sync-session.mjs) are covered here incidentally.
