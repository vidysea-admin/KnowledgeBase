# Verdict: w27-recover

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: b013191b8e9d29fbbdafbecf989e085fc8de12bb
Base: 2ff2b7f3

## Evidence (independently produced)
- Diff base..candidate read in full: recover-index-attempt.mjs, its test, docs/GO-LIVE-UBUNTU.md, manifest. No other source touched.
- Tests: `timeout 600 node --test --test-force-exit --import tsx scripts/operations/recover-index-attempt.test.mjs` -> exit 0, 11/11 pass (log: scratchpad w27-green.txt). No --apply run against any DB.
- Own D-020 mutations (per-mutation byte backup at absolute lane path, trap on EXIT/INT/TERM/ERR, timeout 600, cmp + git hash-object):
  1. Drop `indexAttempt.phase` from the update predicate -> 1 fail (apply test, predicate key list). Killed.
  2. Reset `status.index` to "done" instead of "failed" -> 1 fail. Killed.
  Both restored; final `git hash-object` d28f4315b5e5b1976368cbae4f765db477a76a5c == `git rev-parse b013191b:<file>`. Tree clean.

## Focus clauses
1. Conditional match: updateOne filter = _id, tenantId, sourceId, indexAttempt.generation/.state/.phase as read; matchedCount!==1 -> `conflict`, nothing written. Same shape as acquireIndexAttempt/failIndexAttempt predicates. Race tests (generation swap, state->complete) pass. A live indexer cannot finish after a forced reset (finishIndexAttempt requires state running).
2. Tenant: scopedCollection(...)(tenantId) merges tenantId into the filter, plus explicit tenantId in the predicate. Cross-tenant test: other tenant's stuck session not found/unwritable; artifact counts exclude other tenants.
3. Readers: verifyIndexGeneration (generation.ts:211) requires status.index==="done" AND state==="complete" AND manifest AND exact artifacts; every consumer (post-commit, publication, binding, graph-context, tile-suggest, mongo-store) goes through it. failed/preflight with status.index=failed is hidden, never served. The attempt is a single overwritten pointer (a prior good generation is already replaced when a new attempt starts), so reset cannot expose a partial generation. acquireIndexAttempt accepts failed/preflight (generation.ts:67-69); test proves claim after recovery.
4. indexRecovery: sessions schema top-level additionalProperties true (schema/sessions.schema.json:296); indexAttempt (additionalProperties false) is only set on existing keys. trusted-readers strips indexAttempt/indexArtifact only; extra field harmless.
5. DB guard: requireScriptDatabase -> staging opt-in (LKB_ALLOW_STAGING + MONGO_WORK_DB), production only with flag + MONGODB_DB=lkb; guard runs before connect (test).
6. Args: --tenant/--session required, duplicates and unknown flags (no --all) rejected, --apply requires non-blank --reason (<=500), dry run default, young running refused without --force-running. Nothing deleted (test asserts artifacts unchanged).

## Notes (not issues)
- No test races the `phase` field specifically; the predicate key-list assertion covers it.
- Not verified: behaviour against real Mongo (forbidden by brief); lint-loc not re-run.

ISSUES-WRITTEN: none
Ledger rows: none to flip.
