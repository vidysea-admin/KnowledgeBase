# w27-standalone: make the read side (Ask, graph, session decisions) work on a STANDALONE MongoDB

Status: ready-for-check
Fix cycle: 1
Lane: KnowledgeBase-lanes/w27-standalone  Branch: lane/w27-standalone  Base: f9c35927
Candidate SHA: see `git log -1 lane/w27-standalone` (the commit that adds this file)
Decision: Umesh 2026-10-22 "db essa hi rhegaa isko ko use krna hai". Mongo 13.202.206.101 is a standalone mongod (hello has no setName), and stays one.

## Survey of transaction/session uses (non-test code)
READ paths (7), now fall back on standalone:
1. visibility/read-snapshot.ts `withKnowledgeReadSnapshot` (consumers: trusted-readers tree + graph, session-decisions/reader, speaker-profiles/store get+getKnowledge, whatsapp-review/review-source)
2. ask/graph-context.ts `createMongoGraphSnapshotReader`
3. native-evidence/whatsapp-authority.ts `snapshot()` (only when no outer session/readView is supplied)

WRITE paths (9 sites), UNCHANGED, still refuse on standalone (real transactions, no safe non-transactional fallback exists; there was no existing standalone pattern to follow, publication.test.ts asserts the refusal):
indexing/post-commit.ts publishIndexWithCommit; packages/db native-publication.ts runNativePublicationTransaction; transcript-review/refresh-executor.ts; whatsapp/review/{store (2), invalidate, quarantine}.ts; speaker-attributes/mongo-store.ts and speaker-relations/mongo-store.ts (read-then-CAS-write in one snapshot).

## Change
- visibility/topology.ts (new): `isStandaloneMongo(db)` runs `hello` once per client (cached WeakMap, failures not cached): standalone = no `setName` and `msg !== "isdbgrid"`. `LKB_MONGO_STANDALONE=1|true` forces standalone, `0|false` forces replica behaviour. A db handle with no `command` (fakes) keeps transactional behaviour.
- read paths on standalone: same queries, same tenant filters, no session/transaction, `readConcern: {level:"local"}`. Predicates not touched. Weaker cross-collection consistency documented in code comments and the guide.
- answer-policy/answer-router.ts: unknown errors no longer masked as `answer_history_unavailable`; now 503 `store_unavailable`, real cause logged server-side via visibility/safe-cause.ts (connection-string credentials, bearer tokens and key-like values redacted, 300 chars max). Typed workflow errors unchanged. trusted-readers.ts tree/graph catches now log the real cause before the same 503.
- docs/GO-LIVE-UBUNTU.md: replica set recommended, no longer required; caveat; what still needs a replica set; override env.

## Changed paths
apps/api/src/visibility/{topology.ts,safe-cause.ts,read-snapshot.ts,standalone-mongo.test.ts}, apps/api/src/ask/graph-context.ts, apps/api/src/native-evidence/whatsapp-authority.ts, apps/api/src/answer-policy/answer-router.ts, apps/api/src/composition/integrations/trusted-readers.ts, docs/GO-LIVE-UBUNTU.md, qa/manifests/w27-standalone.md

## Checks a checker should run
- `cd apps/api && node --test --import tsx src/visibility/standalone-mongo.test.ts` (10 tests), plus consumers: answer-policy/{answer-router,routes,answer-workflow}, ask/{graph-context,ask-tenant-isolation}, composition/integrations/native-{read-view-binding,tree-reader}, native-evidence/whatsapp-authority, session-decisions/reader, speaker-profiles/{store,router}, visibility/{read-side-quarantine,read-side-quarantine-trusted,knowledge}, tree-index-root-filter-single-source.
- tsc `apps/api` and `node scripts/lint-loc.mjs --all` (needs an apps/web node_modules junction in a lane).
- D-020 mutations below; HEAD-fidelity hash after.
- Review that standalone is never selected on a replica set / mongos (hello probe), and that no write path was loosened.

## Evidence
- New test file: 10/10 pass. Existing consumers: 160 tests, 158 pass, 0 fail (2 skipped by their own guards).
- tsc apps/api: 0 errors. lint-loc --all: OK, 10 stages, 0 failed (first run flagged dirsize apps/api/src 32>31; safe-cause.ts moved into visibility/).
- D-020 (per-mutation byte backup, trap, scripts in the scratchpad `w27sa/mut.sh`):
  - M1 standalone facade `find(filter,...)` -> `find({},...)` (tenant filter dropped): 3 tests FAIL (filter byte-identical, tenant B isolation, tree tenant scope).
  - M2 `isStandaloneHello` -> `return true`: 3 tests FAIL (detection, caching, replica-set unchanged).
  - Both restored, `cmp` against backup clean; hash vs HEAD checked after commit.
- Live (lkb_staging, API from the lane, `LKB_ALLOW_STAGING=lkb_staging`, host 13.202.206.101, hello setName null = standalone):
  - Before-vs-after on the same db handle: `withKnowledgeReadSnapshot` auto -> ok (22 toc sessions); with `LKB_MONGO_STANDALONE=0` -> `Transaction numbers are only allowed on a replica set member or mongos` (the original failure, reproduced).
  - GET /sessions 200, GET /answer-history 200, POST /ask 404 `not_found no tree index built for this tenant yet`, GET /graph 404 (no 503, no `answer_history_unavailable`).
  - POST /ask did NOT reach 200 with citations: lkb_staging tenant toc has 22 legacy session_pages (index status `pending`, no indexArtifact); only 1 passes the legacy text-support gate (`eligibleTreeInput`), so the cached root is not retained and the trusted tree is null. That is the fail-closed visibility gate on seed data, not topology. Producing a trusted tree needs indexing, whose publication (`publishIndexWithCommit`) is a transaction and refuses on standalone.

## Addendum (same cycle 0): Ask-critical WRITES on standalone (Umesh: this standalone DB is production)
Design: publication is already a pointer flip. `sessions.indexAttempt` (fresh generation id) is flipped to complete by ONE conditional single-document update (`finishIndexAttempt`); `persistIndexTree` flips the tree head by CAS on `indexRevision`; readers (`verifyIndexGeneration`) serve only a complete generation whose artifacts match the manifest digests. So no transaction is needed and no new publicationId machinery was added; standalone just skips the session.
- packages/db/src/lib/topology.ts (moved from apps/api, exported from @lkb/db; apps/api/src/visibility/topology.ts re-exports).
- native-publication.ts `runNativePublicationTransaction`: sessionless tenant-pinned serialized view on standalone (no rollback; callers bump/invalidate first, flip last; readers fail closed).
- indexing/post-commit.ts `publishIndexWithCommit`: standalone path runs the indexer through `transactionReviewDb(db, undefined, tenant)`.
- transcript-review/refresh-executor.ts and transaction-db.ts: optional session; the review-head revision write remains the final fence.
- Pre-existing bug found live: vectorless re-index of a session that already has a page failed with E11000 on unique `session_pages (tenantId, sessionId)` (insert-first replace). Fixed: re-index reuses the previous page `_id` and `replacePageInsertFirst` does one atomic `replaceOne` (grounded-write.ts, session.ts).
- Tests (visibility/standalone-publication.test.ts, 8): standalone/replica publication, crash after flip, crash before flip (hidden, needs recovery), stale generation/other tenant never verify, concurrent tree-head flip (one winner), native tenant isolation. 89/89 related pass (1 skipped). tsc apps/api and packages/db 0 errors; lint-loc 10/10.
- D-020: M3 drop CAS expected-revision in persistIndexTree: race test FAILS; M4 drop generation check in verifyIndexGeneration: stale-generation test FAILS; M5 drop tenant check on native insert: isolation test FAILS; all restored.
- Recovery: an `uncertain`/stale `running` attempt keeps refusing a new attempt (pinned by generation.test.ts). No supported recovery command exists; only `mutateNativeCaptureSource` clears `indexAttempt` as part of a source swap. Two toc staging sessions (funding-dreams, uniaccess) are `uncertain` after the E11000 failure and were left untouched.

## Fix cycle 1 (checker b4c6d6e9 findings)
- F1: standalone native-view tenant test added (visibility/standalone-publication.test.ts "F1"); the checker's mutant (disable the tenant throw in `filter()`, native-publication.ts) is now KILLED (9 pass, 1 fail).
- F2: regression test "F2" for the session_pages replace (unique tenantId+sessionId: same-_id replaceOne succeeds, new-_id insert would collide).
- F3: runNativePublicationTransaction is also used by speaker-suggestions `decide` and transcript-review `mutate`; on standalone they are NON-ATOMIC. `mutate`: the revision bump precedes the head CAS, so a lost CAS leaves the bump (native publications hidden, availability only). `decide`: currency check, bump, confirm without a transaction, so a concurrent root-only source swap can interleave in a narrow window (not a tenant-isolation issue; a replica set removes it). Guide updated.
- F4 (note): refresh-executor on standalone: index publication is generation-guarded, but graph_edges rewrites (delete spoke_in then insert, changed-text pruning) are not gated by head.refresh status in graph readers, so a crash mid-refresh can show partially rewritten edges until the service retries (idempotent, not tenant-affecting).
- F5: `LKB_MONGO_STANDALONE=1` is now ignored with a one-time warning when `hello` reports a setName or mongos (topology.ts); test "F5"; mutation (drop the guard) KILLED.
- Live: remaining toc sessions indexed one at a time on standalone (see reply); the 2 uncertain sessions and the visa session were skipped.

## STILL REFUSES on standalone (needs a replica set)
WhatsApp review store insert/decide (whatsapp/review/store.ts), invalidate.ts, quarantine audit; speaker attribute store and speaker relationship store. A half-applied write there would be visible (approved without claim, revoked-claim races, CAS plus authority read), and none is needed for Ask. Also any caller that needs an `uncertain` attempt recovered.

## Open for the owner
Reads are unblocked. New indexing/publication, transcript-review refresh, WhatsApp review writes and speaker attribute/relationship edits still need a replica set, so on a permanently standalone DB Ask can serve only data that already carries valid index proofs. Making index publication standalone-safe is a separate, larger design decision (non-transactional generation publish with fail-closed readers).
