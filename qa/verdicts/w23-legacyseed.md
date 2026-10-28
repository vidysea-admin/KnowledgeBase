# Verdict: w23-legacyseed (ISS-LEGACYSEED-004, -007, -008)
VERDICT: PASS
Cycle checked: 1
Reviewed SHA: cfd5c4d795ccc11c1eab83ec7089d4013534d508
Base: 3c99337f (cycle 0 reviewed 02a2a6f6)
Checker: independent. Fakes only, no real database contacted, no browsers, no network.
Ledger rows: ISS-LEGACYSEED-004, -007 and -008 may all flip to verified.

## Cycle 1 evidence
- Diff 02a2a6f6..cfd5c4d7 read (sync-session.mjs, join-rules-api-host.ts header, 3 docs, db-guard-paths.test.mjs). Lane HEAD = cfd5c4d7, tree clean; sync-session.mjs working blob = HEAD blob b3f6f135d48697e56d4fe47148cc249a2cbd714a.
- Finding 1 (guard before side effects) fixed. The route/`isProtectedWorkDbName`/`requireScriptDatabase` block now sits at lines ~155-168, before `register()`, the retention import and the `--emit-files` block. Re-ran my real-script probe: fixture session, `--emit-files`, MONGO_WORK_DB=lkb_work_x, blank MONGODB_URL and MONGODB_DB: exit 1, directory still holds only source.json and turns.json (no session.json, session_page.json, claims.json or derivation-provenance.json).
- `--dry-run`: the guard is skipped by design. Real probe with `--emit-files --dry-run` and fully blank env: exit 0, prints "would write ..." and "No Mongo connection attempted", directory still only source.json and turns.json. Every write is behind `!DRY_RUN` (lines 174, 182) and the script exits at line 192 before any connect, so skipping the guard writes nothing and connects to nothing.
- Finding 2 (docs) fixed and accurate against `requireScriptDatabase`/`requireWorkDatabase`: docs/docker-deployment.md (MONGODB_URL required, production = MONGODB_DB=lkb plus the flag, otherwise MONGO_WORK_DB and MONGODB_DB must equal it), docs/meeting-bot-roadmap.md, scripts/watch/install-tasks.ps1 comment (the script only registers tasks, it does not start the host), and the join-rules-api-host.ts header. No Dockerfile or compose file references the host.
- Tests (timeout 600 each, rc in scratchpad legacyseed-evidence-c1): 4 api test files rc 0, 46/46; scripts/lib/script-db-guard.test.mjs rc 0, 14/14; scripts/webinar/db-guard-paths.test.mjs rc 0, 13/13 (includes the new `--emit-files` spawn test; no load flake this time). tsc and the cycle 0 mutation were not repeated: the cycle 1 change touches no apps/api code, and the cycle 0 guard-skip mutation was killed by the spawn tests, which still run.
- Cycle 0 findings 3 (provenance on both chunk write paths, no third indexSession writer) and the D-015 replays still hold: 004 1/1, 007 1/1, 008 1/1.

## Not verified
- join-rules-api-host.ts not spawned (state-dir lock, API server); refusal is source-level plus shared guard tests.
- tsc for apps/api and lint-loc not re-run at cycle 1.
- scripts/native-capture/record.ts:39 still has a localhost fallback (outside this unit's seed/legacy/sync scope; note only). scripts/lib/toc/toc-embedding-backfill.mjs inserts chunks without provenance (TOC recovery path, out of scope).

ISSUES-WRITTEN: none

## Superseded history
### Cycle 0 (superseded by cycle 1)
Cycle 0 result: FAIL. Reviewed 02a2a6f6ca8cd4bca490311a46ac0a92736bd65a, base 3c99337f.
1. ISS-LEGACYSEED-007: the guard ran after the `--emit-files` block of sync-session.mjs (lines ~156-171: `emitSessionPreservingAudit`, `writeFileSync`, `bindDerivedArtifacts`) and the `register()` call. A real run with `--emit-files` and a blank MONGODB_URL exited 1 but had already written claims.json, derivation-provenance.json, session.json and session_page.json. Fix asked: move the guard block above `register()` and the emit block, with a spawn test using `--emit-files`.
2. Doc/launcher update required for the stricter join-rules host start (MONGODB_URL mandatory, production flag or MONGO_WORK_DB): docs/docker-deployment.md:122, docs/meeting-bot-roadmap.md:97, scripts/watch/install-tasks.ps1:22, join-rules-api-host.ts header.
Verified at cycle 0: grep for localhost/default fallbacks (only native-capture/record.ts:39, out of scope); provenance reaches both indexSession chunk writers (session.ts:118 `persist=false` only prepares); api tests 46/46, tsc 0, script-db-guard 14/14, db-guard-paths 11/12 then green on rerun after a load timeout of a pre-existing 60 s spawn test; independent mutation (guard skipped in sync-session.mjs) killed, restored, HEAD hash ce109aa58d43f3318a13fdd90c4ef6795820c129 matched under `core.autocrlf=true`.
Not verified at cycle 0: host not spawned; lint-loc not re-run.
