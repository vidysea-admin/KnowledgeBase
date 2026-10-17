# Verdict: nolkbdefault-api-db-required
VERDICT: PASS
Cycle checked: 0
Checker: independent, fakes only (no DB connected, no .env read). Worktree lane/nolkbdefault @ 11fef90d.

EXPLANATION:
- 009 (implicit lkb): requireDatabaseName rejects unset, "" and whitespace before connect (bootstrap runs it first). The API only ever calls client.db(<explicit name>), so a URI-path db (mongodb://host/lkb) and the driver default are never consulted; the empty-name mutant (M4) is killed. Only other API server entry, scripts/webinar/join-rules-api-host.ts, uses the same guard. Replay 009: 1/1 refused (plus ""/whitespace). Server-side connects in apps/api (activity-health queue reader, whatsapp store) use their own explicit/validated names, not MONGODB_DB.
- 010 (staging opt-in): guard paths enumerated and replayed: requireWorkDatabase, requireBackfillDatabase, requireLegacyUnboundDatabase, API requireDatabaseName, isRefusedWorkDb (store.getWorkDatabase, /gmail/scan, /meeting-candidates), validateRunGate, run-pipeline-deps preflight, sync-session. 15 replay combinations (unset/upper-case/wrong/valid opt-in, MONGODB_DB too): all refused without the exact opt-in, accepted only with it. Replay 010: 1/1 recorded case refused.
- Deploy: compose pins MONGODB_DB: lkb for api and migrate; Dockerfile CMD/HEALTHCHECK unaffected (env supplied by compose; healthcheck needs no DB name); esbuild bundle entry is src/index.ts, unchanged; CI never boots the server and no test spawns index.ts. Behaviour change (note only): compose no longer honours a MONGODB_DB override from .env. Owner action stands: main .env needs MONGODB_DB for local dev.
- Mutations (11, timeout, per-mutation byte backup restored in finally, hash == HEAD blob verified every time): killed 7 (lkb default restored, empty name accepted, gmail/scan route, API staging check, URI/driver fallback, stagingAllowed ignores opt-in, stagingRefused always false); SURVIVED 4 (validateRunGate, sync-session, run-pipeline-deps, join-rules host) -> ISS-NOLKBDEFAULT-001. These are untested but correct by inspection; not blocking.
- Tests: apps/api 764 tests, 763 pass; the one failure (activity-health router, Python subprocess 5s timeout under load) passes 3/3 in isolation with D2_FIXTURE_PYTHON set. tsc clean. scripts tests (PATH with node bin first): lib+toc 177/178 (G4 manifests gate, pre-existing), webinar targeted 139/141 (ffmpeg synthetic video, start-record backslash title; unrelated).
- Notes (not filed): remaining defaults elsewhere stay as already filed (ISS-LEGACYSEED-001/002/003/005/006; migrate-mongo-config.cjs local default per deploycompose ledger).

ISSUES-WRITTEN: ISS-NOLKBDEFAULT-001 (medium)
