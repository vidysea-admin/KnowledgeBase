# Verdict — reindex-sync-fix (coordinator A, blind dual check)
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** A (fresh, bound to D:/KnowledgeBase/.worktrees/reindex-sync-fix)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** be9c8608..eea47f2a (product code at e81f2cbf, f28b5873, 8f52d32d; eea47f2a adds only the manifest). Later commits on the branch touch only qa/ and were not read.

## Independent evidence (re-run by checker, one file per invocation, timeout 240s)
- C1: session-rows.test.mjs 11/11 pass (includes the throwaway-mongod test, not skipped). Migrated-shape test, 10-case refusal enumeration and the unchanged titled shape all green. Separately, a scratch copy of the real UCAS session (turn inversion clamped in the copy only) loads through loadWebinarSession with legacy=true: title, date, org and status taken from session.json, 230 turns, nothing invented.
- C2: same file 11/11 (assertIndexComplete reasons; indexExistingRows refuses with no indexer call when session/source/turns are missing; real-Mongo run). Read: indexExistingRows only reads and calls the injected indexer, scoped via scopedCollection (packages/db tenantScope tests pin tenantId-wins for findOne/countDocuments/updateOne); no insert/replace of session/source/turn rows; testData source refused outside lkb_staging.
- C3: db-guard-paths.test.mjs 24/24 pass (the unchanged D-204 tests plus the D-207 refusal matrix for --index-existing asserting no PRODUCTION line and zero connection attempts). scripts/lib is untouched by the diff. The guard body was moved verbatim into guardDatabase(testData); the only change is sourceDoc.testData -> testData. One allowProduction:true, one isProtectedWorkDbName( call; both modes call it; dry run of --index-existing exits before the guard (as the original dry run did).
- C4: recordIndexFailure/clearIndexFailure covered by session-rows tests and the real-Mongo test (reason persisted, indexAttempt shape unchanged, cleared on success). schema/sessions.schema.json has top-level additionalProperties true, so the sibling indexFailure field is accepted; no collection-level $jsonSchema validator on sessions found in packages/apps/scripts.
- C5: --dry-run --index for both shapes, --index-existing --dry-run (prints plan, connects to nothing), synthetic fixtures and a real throwaway mongod: all in the two files above, green. I also ran the real dry runs for the two TOC sessions: both stop at "invalid turn timing, write refused" (Visa t141 tEnd 213 < tStart 2008; UCAS t114 tEnd 1868 < tStart 1883), exactly as the manifest and docs state. `--index-existing --tenant toc --dry-run` prints the plan and exits 0.
- C6: docs/GO-LIVE-UBUNTU.md section "Cutover: reindex the 3 FAILED sessions" lists dry-run then live commands per session, prerequisites (opt-in, mongodump, turn-count record) and the indexFailure read query; it states the timing blocker honestly. Commands match those the tests exercise.

## Falsification (throwaway copy scripts/webinar-chkA inside the worktree, deleted afterwards; the db-guard test copy was re-pointed at the copy's sync-session.mjs; per-mutation byte backup restored in finally; git hash-object == git rev-parse HEAD:<path> verified after every mutation, all restored=true; bound scripts/webinar and git status untouched)
- C1: providedSessionRow drop `row.sourceId === source._id &&` -> KILLED (10 pass, 1 fail, the title-less refusal test).
- C2: assertIndexComplete drop the `treeWritten` check -> KILLED (assertIndexComplete test).
- C3: drop the `MONGODB_DB === lkb_prod` part of productionOptIn -> KILLED (22 pass, 2 fail: D-204 missing-part test and the D-207 matrix).
- C3: replace guardDatabase(undefined) in the index-existing block with a direct env read -> KILLED (matrix + one-guard source test).
- C3 (equivalent mutant, noted): dropping `process.argv.includes(PRODUCTION_FLAG)` from productionOptIn SURVIVED (24/24). Not a gap: requireScriptDatabase(..., {allowProduction:true}) itself requires the flag in argv and otherwise falls to requireLegacyUnboundDatabase, which refuses with the same message; the externally visible behaviour is identical. Defence in depth, not a weakening.
- C4: drop the mongodb-URL redaction replacement -> KILLED. C4: clearIndexFailure `$unset` made a no-op -> KILLED (3 fail incl. the real-Mongo test).
- C5: --index-existing dry-run no longer exits before the guard -> KILLED (dry-run test).

## Adversarial bypass hunt (auth / tenancy / data-write)
- Production opt-in: the three-part gate is unchanged and shared; no second opt-in; refusal matrix (flag missing, MONGODB_DB unset/lkb/wrong case, MONGO_WORK_DB mismatch, `=true` flag spelling, global_university_db) refuses with zero connection attempts. No bypass found.
- Tenant: --tenant is an operator argument validated by regex; every read/count/update goes through scopedCollection, so a session/source/turn of another tenant cannot be found or modified; a session whose sourceId points cross-tenant yields "source not found".
- testData: index-existing re-checks source.testData against lkb_staging after connect; testData sync still routes to lkb_staging before the guard.
- Legacy loader: providedSessionRow requires captureMode "provided", no captureConsent, no audioLevel, matching _id/tenantId/sourceId, non-blank title, valid date; a captured or silent source cannot enter the title-less path (10-case test). Reads only session.json from the given dir.
- indexFailure write: updateOne without upsert, tenant-scoped, after connect and after the guard only.

## Issues
PROPOSED-ISSUE: low | scripts/webinar/sync-session.mjs:175-187 (EMIT_FILES block) | `--emit-files` on a migrated provided session would overwrite the hand-curated session.json (the title/date/org source of truth for the title-less shape) with a derived one; docs do not recommend it, operator-only, no test pins it. File-don't-fix (low).
PROPOSED-ISSUE: low | scripts/webinar/sync-session.mjs:289-298 | on the legacy sync path, if the indexer commits (status.index=done) and assertIndexComplete then throws, the row shows done while the script exits non-zero and indexFailure is recorded and never cleared. Visible, not silent; maker already disclosed it. File-don't-fix (low).
PROPOSED-ISSUE: medium (data, outside this unit's criteria, already in the manifest as a blocker) | data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json t141, data/toc-migrated/2026-08-10-ucas-what-changed-what-matters/turns.json t114 | inverted turn timings stop `--index` for both TOC sessions; needs a human-approved repair before the real reindex. Not a defect of this diff; the coordinator should gate it.
Not run / limits: no lkb_prod, no lkb, no live provider; `sync-session` sync-path (as opposed to index-existing) failure persistence is covered by a source-level assertion only, as the manifest states; session-inputs.test.mjs pre-existing failure not re-run.

## Metrics
Metrics: start=2026-10-29T06:44:52Z end=2026-10-29T06:56:00Z wall_min=11 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=8 cycle=0 resumes=0 tokens=unavailable builder_min=150 check_min=11 maker_tokens=unavailable checker_tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=240 mutants=8 defects_unit=0 defects_6c=0
