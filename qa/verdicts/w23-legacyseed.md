# Verdict: w23-legacyseed (ISS-LEGACYSEED-004, -007, -008)
VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 02a2a6f6ca8cd4bca490311a46ac0a92736bd65a
Base: 3c99337f
Checker: independent. Fakes only, no real database contacted, no browsers, no network.
Ledger rows: do NOT flip any row yet. -007 stays open (finding 1). -004 and -008 pass on their own evidence sites, but finding 2 (doc/launcher update) belongs to this unit, so flip all three together after cycle 1.

## Findings
1. REQUIRED FIX (ISS-LEGACYSEED-007, brief item 2): the guard does not run before every side effect. In scripts/webinar/sync-session.mjs the `--emit-files` block (lines ~156-171: `retentionWrites.emitSessionPreservingAudit` for session.json, `writeFileSync` for session_page.json and claims.json, then `bindDerivedArtifacts`) runs BEFORE `resolveWorkDb`/`requireScriptDatabase` (line ~208). Proven by running the real script with `--emit-files`, MONGO_WORK_DB=lkb_work_x and a blank MONGODB_URL against a fixture dir: exit 1 with the guard error, but claims.json, derivation-provenance.json, session.json and session_page.json had already been written (receipt: scratchpad legacyseed-evidence/emit.out). The manifest claim "before any retention state" holds only for `setSessionIndexStatus` (the --index path). Fix: move the `route`/`workDb`/`isProtectedWorkDbName`/`requireScriptDatabase` block (it needs only `sourceDoc`, defined earlier) above `register()` and the EMIT_FILES block, and add a test that spawns with `--emit-files` and a bad target and asserts no output files exist. The new spawn test does not pass `--emit-files`, so it cannot see this.
2. REQUIRED DOC/LAUNCHER UPDATE (orchestrator-accepted stricter policy): the host now needs MONGODB_URL (no localhost fallback) plus either `--i-know-this-is-production` with MONGODB_DB=lkb, or MONGO_WORK_DB=<isolated>. Documented start paths that silently break (the command shown has neither the flag nor MONGO_WORK_DB):
   - docs/docker-deployment.md:122 (Send-now host, `node --import tsx scripts/webinar/join-rules-api-host.ts`)
   - docs/meeting-bot-roadmap.md:97
   - scripts/watch/install-tasks.ps1:22 (instruction text)
   - scripts/webinar/join-rules-api-host.ts header (lines 3-5, "MONGODB_URL/MONGODB_DB" and the Run line)
   Dockerfile, apps/api/Dockerfile and docker-compose.yml do not reference the host (git grep), so no CMD breaks. Update each to show the flag and env, and state that MONGODB_URL is mandatory.

## Verified (independent)
- Diff read: 7 files, base..candidate. Lane HEAD = 02a2a6f6, tree clean at start.
- Item 1 grep (scripts/, non-test): no localhost / 127.0.0.1:27017 / `?? "lkb"` default remains in the seed, legacy, sync or join-rules scripts. The only hit is scripts/native-capture/record.ts:39 (`?? "mongodb://localhost:27017"`, still gated by requireDatabaseName), outside this unit's seed/legacy/sync scope; note only. Every `connect(` site in scripts/ uses a guard target.
- Item 3 provenance: chunk writers reached from indexSession are writeSessionLexicalChunks (replaceOne) and writeSessionChunks (updateOne upsert); both now receive `legacyChunkProvenance`. The `persist=false` call at session.ts:118 only prepares (no write). backfill.mjs:167 already stamped. No third indexSession writer found. Note (not a finding): scripts/lib/toc/toc-embedding-backfill.mjs:175 (recovery-chunks insertMany, pinned 127.0.0.1:27019, own binding) builds docs via prepareChunkDocuments without provenance; it is the TOC recovery path, not a legacy-unbound session index, and was not changed or in scope.
- Item 4 D-015 replay (each row names one evidence site, no attack corpus): 004 1/1 (join-rules-api-host.ts:29 localhost/default gone, guard precedes connect); 008 1/1 (stamp on vector and vectorless chunks, absent for no/foreign stamp); 007 evidence site (sync-session.mjs:193 localhost fallback) gone, but finding 1 shows the guard-first requirement is not met, so 007 is counted 0/1 on "guard before any side effect".
- Item 5 (timeout 600 each; exit codes in scratchpad legacyseed-evidence/*.rc):
  - 4 api test files: rc 0, 46/46 pass.
  - tsc --noEmit apps/api: rc 0, empty output.
  - scripts/lib/script-db-guard.test.mjs: rc 0, 14/14.
  - scripts/webinar/db-guard-paths.test.mjs: first run 11/12. The pre-existing `MONGO_WORK_DB=lkb exits` spawn test hit its own 60 s child kill under heavy load (empty stderr). Re-run once alone: pass (77 s). Load flake, not a product failure; the other 11, including both new spawn/replay tests, passed.
- Item 6 mutation: skipped the guard in sync-session.mjs (replaced `requireScriptDatabase(guardEnv, ...)` with `{url: process.env.MONGODB_URL, dbName: workDb}`), per-mutation byte backup, trap on EXIT/INT/TERM/ERR (restores only while applied), timeout 400. The new spawn test FAILED (killed: the blank-URL case got a MongoParseError instead of the guard refusal). Restored; `cmp` ok. HEAD fidelity: `git rev-parse HEAD:scripts/webinar/sync-session.mjs` = `git -c core.autocrlf=true hash-object --path=... file` = `git hash-object --no-filters file` = ce109aa58d43f3318a13fdd90c4ef6795820c129. Working tree clean afterwards.

## Not verified
- join-rules-api-host.ts was not spawned (state-dir lock and API server); its refusal is source-level plus the shared guard's tests.
- lint-loc --all not re-run (not requested).
- Maker's own mutations m1/m1b/m2/m3 not re-run; one independent mutation run instead.

ISSUES-WRITTEN: none (finding 1 belongs to open ISS-LEGACYSEED-007; finding 2 is a required doc update inside this unit)
