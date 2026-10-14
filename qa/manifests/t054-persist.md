# T-054 durable atomic transcript corrections (persistence, routes, refresh execution)

**Handshake status:** ready-for-check
**Status:** ready-for-check
**Fix cycle:** 1
**Task:** T-054 (scoped unit only; whole task stays in_progress)
**Priority tier:** 3 - next unblocked roadmap feature, assigned in the current wave. Touches tenancy and data writes, so full ceremony.
**Lane:** lane/t054-persist (branched from lane/codexwave1)
**Contract:** qa/contracts/t054-transcript-review-planner-editor.md (checker-owned, not edited). It names persistence, tenant/auth routes, schema/migration and refresh execution as separate gates; this unit is those gates minus mounting and live proof. Criteria 4, 5 and 8 are the server-side obligations (receipt, If-Match, durable-before-receipt, honest refresh state).

## Design
- Originals are immutable: nothing writes `turns`. A correction is a revision of a **head** row (`transcript_reviews`, one per tenant+session: overlay of corrected turns, head audit entry, refresh state). History is append-only (`transcript_review_revisions`, `$setOnInsert` on a deterministic _id).
- Effective transcript = turns + overlay by turn id. Revision of an unreviewed transcript is `base-<hash of originals>`; afterwards it is the planner's deterministic `nextRevision`, which is the strong ETag.
- Commit = pure plan (`planner.ts`, unchanged) then ONE compare-and-set of the head on `revision` (first commit: unique `_id` insert). Receipt `{sessionId, revision, commit:"committed", refresh:"pending"}` is returned only after that write. History row is written after; a failure there does not fail the commit and is healed from the head's embedded audit on the next commit.
- Routes (scope `sessions`, tenant and actor only from the verified key): `GET/POST /sessions/:id/transcript-review`, `GET .../history`, `POST .../refresh`. Missing If-Match 428, malformed or body-mismatched 400, stale 412, lost race 409, other tenant's session 404 (no oracle), no-store.
- Refresh execution: injected idempotent executor per target (claims, session-page, chunks, tree, graph); progress persisted per target and fenced on revision so a newer commit is never overwritten; failure recorded as `failed` + `failedTarget` without echoing the error; retry resumes.
- Mount (NOT done, server.ts untouched): after `requireAuth`, `app.use(createTranscriptReviewRouter({ store: createMongoReviewStore(), refresh }))`; documented in the router.ts header.

## Files
apps/api/src/transcript-review/{store,service,router}.ts; tests persist.test.ts, refresh.test.ts, service.test.ts; support memdb.testsupport.ts, persist.testkit.ts. schema/{transcript_reviews,transcript_review_revisions}.schema.json, their fixtures, schema/index.json entries. migrations/20261014100000-transcript-reviews.cjs + transcript-reviews.migration.test.mjs. Generated (by `node scripts/gen-types.mjs`, outside the stated scope but mechanically required by `gen-types --check`): packages/core/src/generated/transcript_review{s,_revisions}.ts and two export lines in packages/core/src/index.ts.

## Evidence (all run from the lane, node on PATH)
- `cd apps/api; node --test --import tsx src/transcript-review/*.test.ts` -> see Final run below.
- Full suite `node --test --import tsx "src/**/*.test.ts"` (D2_FIXTURE_PYTHON set, TSX_TSCONFIG_PATH unset): ℹ tests 954 / ℹ pass 954 / ℹ fail 0 (taken before the last test-only edit; re-run in Final run).
- `node --test migrations/transcript-reviews.migration.test.mjs`: pass 3 / fail 0.
- `python schema/validate.py`: PASS 32 schemas. `node scripts/gen-types.mjs --check`: OK 32 files.
- tsc (`apps/api`): zero errors in transcript-review, schema or migration files. It reports errors only under src/whatsapp/review (`@lkb/core` has no `WhatsappCandidates`, implicit any); those are in files this unit did not touch and are not caused by it.
- `node scripts/lint-loc.mjs --all`: loc stage fails on packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400), a file this unit did not touch; every new file is within budget. snapshot stage fails: docs/SNAPSHOT.md is stale (118 lines); not regenerated here (shared generated file, merge-conflict magnet), regenerate at integration with `node scripts/snapshot.mjs`. Other 8 stages pass.
- Mutation run (per-mutation byte backup, restore in finally, sha verified, harness deleted): replaceHead without CAS, duplicate key treated as win, no history heal, no body/header match, no stale 412 pre-check, overlay ignored, refresh not revision-fenced: 7/7 KILLED. A first version of the race test let the CAS mutant SURVIVE (HTTP calls on the in-memory Db never truly interleave); service.test.ts now yields a macrotask before each write and kills it.

## Live gaps (do not read PASS here as T-054 done)
1. Not mounted: server.ts untouched; the route is unreachable in a running API. The SessionDetail web mount is out of scope.
2. No real MongoDB run. Everything ran on an in-memory Db behind the real `scopedCollection`. The unique-index duplicate (code 11000) and `matchedCount` CAS semantics are assumed from driver behaviour; the migration was dry-run only against a fake Db and has NOT been applied. Without the unique index on `transcript_reviews` the first-commit race is not atomic.
3. Not atomic across the head and history rows (no transaction): the head swap is the commit point; history is healed lazily. A revision whose history write failed shows no history until the next commit.
4. No real refresh executor is wired; `refresh` is an injected function and nothing re-derives claims/session page/chunks/tree/graph in production. Until one is provided every commit stays `pending`. Executors must be idempotent; two processes can run the same target concurrently (the in-process guard is per process).
5. Actor identity is `apikey:<tenantId>` because `VerifiedKey` has no key or user id: audit cannot tell which person or key corrected a turn. A distinct write scope does not exist either (`sessions` gates read and write).
6. Real web client (`apps/web/src/api/transcriptReview.ts`) was not run against this server (it needs Vite's `import.meta.env`); wire shapes were matched by reading it. No live-browser acceptance.
7. A re-ingest that renumbers turn ids silently drops overlay entries for vanished ids (tested as ignored, not surfaced); a source whose original timings are invalid is refused 422 by the planner and cannot be corrected through this path.
8. Other readers (/ask, search, notes, graph) still read the ORIGINAL `turns`; corrections reach them only through refresh targets that nothing executes yet.
9. Pre-existing and unrelated: tsc errors in src/whatsapp/review, the 408-line python test, stale SNAPSHOT.md.

## Final run
`node --test --import tsx src/transcript-review/*.test.ts`: ℹ tests 27 / ℹ pass 27 / ℹ fail 0 (6 planner, 12 persist, 5 refresh, 4 service). Full apps/api suite re-run on the final tree: ℹ tests 954 / ℹ pass 954 / ℹ fail 0.

## Fix cycle 1 (ISS-T054-PERSIST-001 / -002; test-only, no production source changed)
- Added tests: both tenants committing on the same session id; headId/revisionRowId differ per tenant (and have no delimiter ambiguity); same revision recorded for two tenants keeps both rows; `?tenantId=` query never switches tenant on GET/history/POST; history rows are insert-once; a superseded refresh stops executing the old revision's remaining targets. memdb now enforces unique `_id` on upsert like Mongo.
- Mutants (per-mutation byte backup, restore in finally, sha verified; HEAD-fidelity `git hash-object` == `git rev-parse HEAD:<file>` for store.ts, router.ts, service.ts, all equal): headId without tenant KILLED, revisionRowId without tenant KILLED, tenant from query string KILLED, history `$set` instead of `$setOnInsert` KILLED, superseded return ignored KILLED, plus the earlier 7 (replaceHead without CAS, dup key as win, no heal, no body/header match, no 412 pre-check, overlay ignored, refresh unfenced) all still KILLED: 12/12.
- `src/transcript-review/*.test.ts`: ℹ tests 32 / ℹ pass 32 / ℹ fail 0. Full apps/api suite (TSX_TSCONFIG_PATH absolute to a temporary paths tsconfig, deleted): ℹ tests 959 / ℹ pass 959 / ℹ fail 0. tsc with that temporary paths tsconfig: 0 errors (the earlier whatsapp errors were the lane's missing `@lkb/core` path resolution, not code).