# Verdict: w27-standalone

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: 49bead49961b45e3fabcd58a12935043e8c9257c
Base: f9c35927 (diff f9c35927..49bead49, commits 2b86539b + 49bead49)
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
