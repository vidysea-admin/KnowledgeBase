# w23-legacyseed: DB-write guard for join-rules host and sync-session, provenance on indexSession chunks

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w23-legacyseed.md
Fix cycle: 1
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w23-legacyseed (branch lane/w23-legacyseed)
Base: 3c99337f (origin/master)
Candidate SHA: the commit carrying this manifest (`git log -1 lane/w23-legacyseed`; a manifest cannot name its own SHA)

## Issues fixed (qa/issues.legacyseed.jsonl)
- ISS-LEGACYSEED-004 (high): scripts/webinar/join-rules-api-host.ts connected with `MONGODB_URL ?? localhost` and no guard. Now `requireScriptDatabase(process.env, argv, {allowProduction: true})` then `connect(target.url, target.dbName)`.
- ISS-LEGACYSEED-007 (medium): scripts/webinar/sync-session.mjs fell back to `localhost:27017`. Now the resolved work DB is passed through `requireScriptDatabase` (before any retention state or connection) and `connect(target.url, target.dbName)` is used.
- ISS-LEGACYSEED-008 (medium): `indexSession` did not carry a session's `legacy-unbound` stamp to its chunks. Now `legacyChunkProvenance(session)` (apps/api/src/indexing/chunk-write.ts) feeds both `writeSessionChunks` (vector) and `writeSessionLexicalChunks` (vectorless, new optional parameter).

## Changed paths
- apps/api/src/indexing/chunk-write.ts, apps/api/src/indexing/session.ts
- apps/api/src/indexing/session-tests/legacy-provenance-chunks.test.ts (new)
- scripts/webinar/join-rules-api-host.ts, scripts/webinar/sync-session.mjs
- scripts/webinar/db-guard-paths.test.mjs (two earlier source assertions updated to the new guard; four tests added)
- qa/manifests/w23-legacyseed.md

## D-015 (recorded reproductions are the rows' own evidence sites; each row names one site and no attack corpus)
- ISS-LEGACYSEED-004: 1/1 (evidence site join-rules-api-host.ts:29 no longer has the localhost URL or a default DB; guard precedes connect)
- ISS-LEGACYSEED-007: 1/1 (evidence site sync-session.mjs:193 no longer has the localhost fallback; guard precedes connect; a real spawn with blank/whitespace MONGODB_URL or a mismatched MONGODB_DB exits non-zero and opens no connection)
- ISS-LEGACYSEED-008: 1/1 (evidence site indexSession -> writeSessionChunks: stamp present on chunks in vector and vectorless mode; absent when the session has no stamp, a foreign status, or no reason)
- Left open: none. Not proven: the join-rules host is not spawned (it takes a state-dir lock and starts an API server); its refusal is asserted at source level plus the shared guard's own tests.

## Policy note for the owner
The join-rules API host previously accepted `MONGODB_DB=lkb` through `requireDatabaseName`. `requireScriptDatabase` reaches `lkb` only with `--i-know-this-is-production` AND `MONGODB_DB=lkb` (the host passes `allowProduction: true`). A production start of that host therefore now needs the flag, and any non-production start needs `MONGO_WORK_DB`. Not decided here; flagged.

## Checks a checker should run
- `cd apps/api && node --test --import tsx src/indexing/session-tests/legacy-provenance-chunks.test.ts src/indexing/session.test.ts src/indexing/chunk-write.test.ts src/indexing/vectorless-publication.test.ts`
- `node --test --import tsx scripts/webinar/db-guard-paths.test.mjs scripts/lib/script-db-guard.test.mjs` (the sync-session spawn test takes 15-35 s)
- `cd apps/api && node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`
- `node scripts/lint-loc.mjs --all`

## Evidence (real output)
- api tests (4 files): tests 46, pass 46, fail 0
- scripts tests (2 files): tests 26, pass 26, fail 0 (one earlier run timed out under load at a 60 s child limit; limit raised to 200 s, rerun green)
- tsc (apps/api): exit 0
- lint-loc --all: `lint:structure: OK (10 stages, 0 failed)`
- Mutations (D-020, per-mutation backup and trap, scripts outside the repo): m1 session.ts vector call passes undefined (killed, 1 fail), m1b lexical call drops provenance (killed), m2 host restores the localhost fallback (killed), m3 sync-session restores the localhost fallback (killed). Each restored with `cmp`; HEAD blob fidelity checked after commit.
- No seed or script was run against a real database; the only spawned script was sync-session against an env with no valid Mongo target.

## Fix cycle 1 (checker verdict 8bb74869 FAIL on 02a2a6f6)
- sync-session.mjs: the DB guard now runs before `register()` and `--emit-files` (skipped only for `--dry-run`, which touches no DB). New spawn test `--emit-files with blank/mismatched Mongo env refuses before writing any file` asserts non-zero exit and an unchanged session directory.
- Join-rules host start instructions updated: docs/docker-deployment.md, docs/meeting-bot-roadmap.md, scripts/watch/install-tasks.ps1 (comment text only; the script never starts the host), and the host script header.
- Mutation m4 (guard moved back below emit-files): killed (pass 11, fail 2; "files were written before the refusal"); restored, cmp ok.
- db-guard-paths 13/13, script-db-guard 14/14, api tests 46/46; spawn child timeout raised to 240 s.
