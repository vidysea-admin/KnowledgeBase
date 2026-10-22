# Verdict: w27-standalone

VERDICT: PASS
Cycle checked: 2
Reviewed SHA: 879293478a562151c4eaac8d9eccedfeda4b0e53
Base: f9c35927 (cycle 1 diff 49bead49..9a8ea805 on top of cycle 0 candidate 49bead49; cycle 0 sections below are historical, cycle 0 was PASS at 49bead49 / verdict b4c6d6e9)
Class: SECURITY (tenancy, data writes), full ceremony.
Checker: independent, fresh context. Maker claims treated as untrusted; no candidate code edited, no DB touched (fakes only).

## Evidence produced by the checker (raw outputs: qa/evidence/w27-standalone-check/, exit codes in exit-codes.txt)
- visibility/standalone-publication.test.ts: 8/8 pass (exit 0). visibility/standalone-mongo.test.ts: 10/10 pass (exit 0).
- Related, each under `timeout 600`, all exit 0, 0 fail: indexing/{generation 8, post-commit 2, vectorless-publication 12, session 26}, answer-policy/{answer-router 5, routes 7}, ask/{graph-context 10, ask-tenant-isolation 16}, native-evidence/{whatsapp-authority 8, publication 5}, visibility/{read-side-quarantine 17, knowledge 27}.
- tsc --noEmit: apps/api exit 0, packages/db exit 0.
- Own probe (qa/evidence/w27-standalone-check/zz-checker-probe.test.ts.txt, kept out of the tree): on a standalone fake, the native publication view refuses foreign-tenant deleteMany, tenant-less updateOne and findOne (tenant_mismatch); replacePageInsertFirst with a reused _id issues exactly one tenant-scoped replaceOne and no insert. Both pass at HEAD.
- D-020 own mutation M7: removed the tenant-mismatch check in `filter()` of transactionView (packages/db/src/lib/native-publication.ts), per-mutation byte backup, trap EXIT/INT/TERM/ERR, timeout 600. My probe KILLED it (1 fail). The candidate's standalone-publication.test.ts SURVIVED it (8/8 pass), see F1. First attempt (M6) left the mutant on disk because my trap used a relative path after a cd; I restored it from the byte backup (cmp equal to HEAD blob) and re-ran M7 with absolute paths. Final HEAD fidelity: `git -c core.autocrlf=true hash-object` = bacb57423abcc9a08c123dd1240c3ed43a468e38 = `git rev-parse HEAD:packages/db/src/lib/native-publication.ts`. `git status` shows no tracked modification.
- Lane file: `apps/api/src/zz-reindex.mts` is untracked, absent from `git ls-files`, absent from the diff stat and from all history. Not committed.

## Focus results
1. Tenant isolation: OK. Read paths pass the same filters (read-snapshot standalone facade only adds readConcern local; graph-context keeps `scope()` tenant check; whatsapp-authority keeps the Proxy and session guard; native view and transactionReviewDb keep tenant filter/doc checks with session undefined). No cross-tenant read or write found.
2. Crash safety: OK for index/native publication. acquireIndexAttempt (conditional claim) -> enterIndexWrites -> finishIndexAttempt is a single conditional updateOne on generation + state running + phase writing; verifyIndexGeneration re-derives page/chunks/claims/tree digests and re-checks the flip afterward. A crash before the flip leaves state running/failed/uncertain, readers get null (hidden, fail closed), and acquire refuses a new attempt (requires recovery). persistIndexTree CAS on indexRevision (insert path has a deterministic _id so the duplicate key stops the second writer). No fail-open found. See F3/F4 for non-index consumers.
3. session_pages replaceOne: tenant-scoped (scopedCollection ANDs tenantId into filter and replacement). Concurrency is bounded by the single running attempt per session; a lost concurrent delete makes replaceOne match 0, which is not checked, but finishIndexAttempt then fails closed (pages.length !== 1). See F2.
4. Topology: standalone only when hello has no string setName and msg is not isdbgrid; hello failure or missing `command` means transactional (safe default); failures not cached. A replica set or mongos cannot be misdetected from a successful hello. Override LKB_MONGO_STANDALONE=1 on a replica set would drop transactions silently (operator-set, documented), see F5.
5. Error mapping: response is generic store_unavailable; cause is logged server-side only, with mongodb:// credentials, bearer tokens and lkb_/sk-/AIza keys redacted, 300 chars max. Test covers it.
6. Replica-set behaviour: unchanged (replica fakes still open one session/begin/commit; branch order for fakes without `command` is identical).
7. Re-runs: done as above.

## Findings (all non-blocking; none enter the ledger. Coverage and doc items are file-don't-fix per the round-cap rule)
- F1 (test gap, tenancy): the candidate's tests do not kill a mutant removing the tenant check in the native view `filter()` (packages/db/src/lib/native-publication.ts, `filter` in transactionView, about line 104) on the standalone path; only `doc()` is covered (their M5). Code at HEAD is correct (my probe proves it). Fix: add a standalone test asserting tenant_mismatch for findOne/updateOne/deleteMany with a foreign or missing tenantId.
- F2 (coverage): the session_pages replaceOne fix (grounded-write.ts replacePageInsertFirst, session.ts priorPages) has no regression test in the diff; verified only by my probe and the maker's live note. replaceOne result matchedCount is unchecked (fail-closed later, so safe). Fix: add a unit test with a unique (tenantId, sessionId) fake, and check matchedCount === 1.
- F3 (scope accuracy): runNativePublicationTransaction is also used by transcript-review/store.ts `mutate` and speaker-suggestions `decide`; on standalone they now run non-atomically. `mutate` bumps nativePublicationRevision before the head CAS, so a lost CAS leaves the bump (hides native publications, availability only). `decide` does assertNativeSuggestionCurrent, then bump, then confirm with no transaction, so a concurrent mutateNativeCaptureSource can interleave (narrow TOCTOU, root-only source swap). The manifest's "callers bump first, flip last" does not hold for `decide`; the "Still refuses" list should say so. Not a tenant-isolation issue. Owner may want a replica set or a recheck after write for this path.
- F4 (limit): refresh-executor on standalone: index publication is generation-guarded, but graph_edges rewrites (delete spoke_in then insert, changed-text edge pruning) are not gated by head.refresh status in graph readers, so a crash mid-refresh can show partially rewritten edges until the refresh retries. Idempotent, retried by the service; not tenant-affecting.
- F5 (ops note): LKB_MONGO_STANDALONE=1 on a replica set silently removes transactions; docs/GO-LIVE-UBUNTU.md covers it.

## Not verified
Live staging claims, lint-loc --all, the maker's mutations M1-M5, broader or full suites, WhatsApp review and speaker attribute/relation refusal paths (unchanged files, only the diff was reviewed), real Mongo behaviour of hello.

## Ledger
No ledger issue rows are tied to this unit; none to flip. ISSUES-WRITTEN: none.
Maker may close out the manifest to checked-PASS.

---
# Cycle 1 (authoritative, Cycle checked: 1, Reviewed SHA 9a8ea805585d8d408c616aeddfc01005316041e0)

VERDICT: PASS

Re-checked independently (raw outputs in qa/evidence/w27-standalone-check/c1/, exit codes in c1/exit-codes.txt).
- Diff 49bead49..9a8ea805 reviewed: grounded-write.ts (new reusablePageId, used by session.ts), topology.ts (override guard), two test files, docs, manifest.
- Focused tests, each under timeout 600, all exit 0: standalone-publication 10/10, standalone-mongo 11/11, indexing/session 26, vectorless-publication 12, generation 8. tsc --noEmit apps/api exit 0, packages/db exit 0.
- F1 CLOSED: my cycle-0 mutant (native-publication.ts transactionView `filter()` tenant check removed) now FAILS the new "F1 standalone native view" test (9 pass, 1 fail). Trap used an ABSOLUTE path. HEAD fidelity: `git -c core.autocrlf=true hash-object` = bacb57423abcc9a08c123dd1240c3ed43a468e38 = `git rev-parse HEAD:` for that file; no .bak left, git status clean of tracked changes.
- F2 CLOSED (partly by test): "F2 re-index replaces the existing session page atomically" proves replacePageInsertFirst does a replace with a reused _id and that a new _id would hit E11000. The session.ts wiring through reusablePageId is covered only indirectly (session.test 26 pass); matchedCount of replaceOne is still unchecked but fails closed at finishIndexAttempt (note, not a defect).
- F5 CLOSED: topology.ts now ignores LKB_MONGO_STANDALONE=1 when hello reports a replica set or mongos (one warning per client); =0 still forces transactional behaviour. My mutant disabling the `forced === true && !detected` guard FAILS the new F5 test (10 pass, 1 fail); file restored, hash = HEAD blob 1de4f7bf79eace4afb39a558ca0a11c13bae57f6. Residual note: with override=1 and a failed hello the override is honoured (operator intent).
- F3, F4: documentation only, accepted as documented limits (non-transactional decide/mutate and refresh edge-rewrite window); no ledger entry.
- Not verified: live staging, lint-loc, full suites.

ISSUES-WRITTEN: none. No ledger rows to flip. Maker may close out the manifest to checked-PASS.

---
# Cycle 2 (authoritative, Cycle checked: 2, Reviewed SHA 879293478a562151c4eaac8d9eccedfeda4b0e53)

VERDICT: PASS

Cycle 2 reverts cycle 1's reusable-_id replace (it broke the pinned insert-then-delete expectation in session-grounded-wire.test.ts). Diff 9a8ea805..87929347 reviewed: grounded-write.ts, session.ts (back to base content), F2 test. Raw outputs: qa/evidence/w27-standalone-check/c2/.

1. Crash between the E11000 prune and the re-insert: FAIL-CLOSED, NOT auto-recoverable. The index attempt is `running`/`writing` at that point, so verifyIndexGeneration returns null (state != complete) and the session is hidden; page-less sessions are not eligible in eligible-tree. No wrong data is served. The next index run is refused by acquireIndexAttempt (index_attempt_requires_recovery) until an explicit recovery, which is the same behaviour as every other mid-write crash point on standalone (documented in the manifest; no recovery command exists). On a replica set the transaction rolls back instead. Accepted as the documented limit.
2. Tenant scope on the prune: `sessionPagesColl = scopedCollection(db, "session_pages")` (tenantId ANDed in) over the tenant-scoped transactionReviewDb; oldIds come from the same tenant-scoped find; filter `{sessionId, _id:{$in: oldIds}}`. Only E11000 with a non-empty oldIds list triggers it; any other error rethrows and deletes nothing (tested).
3. Claims untouched: replaceClaimsPreserving is not in the diff; claims keep strict insert-before-delete; tests pass.
4. Tests (each timeout 600, exit codes in c2/exit-codes.txt): session-grounded-wire 11/11 pass; notes 3, strict 4, decisions 5, legacy-provenance 4, session 26, public-preserved-review 4, vectorless-publication 12, generation 8, eligible-tree 9, native-archive/publication 7, promote-entities 20, cached-root-taint 13, refresh-executor 12 (1 skipped by own guard), grounded-postprocessing 5+6+2, connector workflow 16, native-evidence/vertical 4, whatsapp review wire 8, tenant-guards/scoped-write 3, read-side-quarantine 17 + trusted 9, standalone-publication 10, standalone-mongo 11. tsc apps/api exit 0, packages/db exit 0.
   Environment note: session-grounded-wire.test.ts intermittently prints the Windows libuv teardown assertion `!(handle->flags & UV_HANDLE_CLOSING), src\winsync.c:94` under --test-force-exit (a file-level `fail 1` with all 11 tests passing). Seen on 2 of 4 runs; 11/11 pass every time and a run without --test-force-exit exits 0. Treated as an environment flake, not a candidate defect (the pinned deleteMany expectation at its lines 91 and 109 passes).
5. D-020 mutation M9: grounded-write.ts E11000-only condition weakened to `if (!oldIds.length) throw error;` (any error now prunes). Killed: the F2 test fails (9 pass, 1 fail). Per-mutation backup, trap with ABSOLUTE path, timeout 600. HEAD fidelity: `git -c core.autocrlf=true hash-object` = 77f6d940326c3b88b014a4f6137a1337eddbaa99 = `git rev-parse HEAD:apps/api/src/indexing/grounded-write.ts`; no .bak left.

Not verified: live staging, lint-loc, full suites. ISSUES-WRITTEN: none. No ledger rows to flip. Maker may close out the manifest to checked-PASS.
