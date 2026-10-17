# Verdict: w17-t042hook (T-042 P9 tile-speaker suggestion hook)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: f1a294bb9ac139de4355b02a836248da08124ae0
Base SHA: 9e55b642
Clauses: qa/contracts/goal-T042.md P9 (opt-in hook reachable from production session flow; malformed capture cannot falsely report complete)

## Independent evidence (all run by checker, apps/api, node via codex runtime, each under timeout 600)
- session-tile-suggest.test.ts: 6/6 pass, exit 0
- session.test.ts: 26/26 pass, exit 0
- src/indexing/tile-speaker-suggest.test.ts: 14/14 pass, exit 0
- tsc --noEmit -p tsconfig.json: exit 0, no output
- D-020 mutations (per-mutation byte backup, trap EXIT/INT/TERM/ERR, timeout 600, HEAD hash check):
  - M1 remove `committed &&`: pass 5 / fail 1, killed by "enabled but index NOT committed (degraded claims)".
  - M2 drop try/catch: pass 5 / fail 1, killed by "hook throws outside the producer (context accessor)".
  - After each: git hash-object session.ts == git rev-parse HEAD:apps/api/src/indexing/session.ts == b6a15fe8052ef01de6b0079b1f6a1612adecb36a.
- Phantom CRLF-only worktree modifications (58) ignored; only the commit was judged.

## Checks 1-6
1. Flag off byte-identical: the new result key is a conditional spread (`...(tileSpeakerSuggestions ? {...} : {})`), placed after speakerSuggestions; undefined when off, so no key and no reorder. Test 1 and 2 assert no key, no capture read, no store call. Only consumer that serializes the result, connector mongo-store recordConsumedSource, stores `result.completion` only. OK.
2. Degraded/failed index: hook gated on `committed` (set only by finishIndexAttempt; else-branch is failIndexAttempt). Test 4 (claimsFails) asserts no key, 0 reads, 0 store ops; M1 kills. OK.
3. completion: built from `committed`, computed after the hook, never read from hook state; hook try/catch swallows throws (M2 kills). Test 5 compares all other fields with the off run. OK (see note B for one real-Mongo caveat).
4. U2.4/D-141 block textually untouched in diff; hook writes only via suggestTileSpeakersForSession -> insertSuggestionsIfAbsent; test 3 asserts all ops on speaker_suggestions, none on speakers; allowTileOnly not referenced. OK.
5. Tenant scoping: tenantId/sessionId are the function's own args, turns are the session's, producer rejects turns whose tenant/session differ and ignores sidecar identity (capture-mismatch). Write is insertSuggestionsIfAbsent(tenantId, sessionId, ...) on speaker_suggestions. OK.
6. Missing fence: see Note A.

## Notes (not blockers; no issues written)
- A (fence). The hook passes no TileSuggestionPublication, so post-commit it calls neither assertCurrent nor a revision-bumping write. It could in principle attach `suggested` rows (speakerRef/personId keyed, human-confirmation required, idempotent, never final speakers) from a turns snapshot read at the start of the same call, if a concurrent reindex/review superseded it in that window. Judged a note, not a blocker: LKB_TILE_SUGGEST defaults off, nothing in production sets deps.tileSuggest (grep: no non-test caller), rows are inert suggestions, and the manifest and the contract state central integration owns the publication fence. Precondition for enabling: the central caller must supply `publication` (createNativeSuggestionPublication) or an equivalent current-generation check. File:line: apps/api/src/indexing/session.ts:317-318 (options `{ enabled: true }` only).
- B (transaction). In vectorless mode with a real Mongo client, indexSessionWithinPublication runs inside publishIndexWithCommit's transaction, so the hook writes via the transactional handle. A swallowed write error there could leave the transaction aborted and make commitTransaction fail, which would fail the index. Not exercisable without real Mongo (fakeDb tests only) and not verified here; enable-time integration test needed.
- C. Hook uses `turns` as of the start of the run (pre-review-refresh); fine for suggestions.

## Not verified
Real Mongo/transaction behaviour, real capture registry, P10 real four-panelist sample, full suites, contracts/verify_contracts.py. T-042 as a whole stays in progress; this PASS covers only the P9 hook slice at source/fixture scope.

ISSUES-WRITTEN: none
Ledger rows may be flipped: no ledger rows are tied to this unit; maker may close the manifest to checked-PASS. T-042 itself must not be flipped to done.
