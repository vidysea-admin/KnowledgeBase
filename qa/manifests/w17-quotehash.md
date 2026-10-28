# w17-quotehash

Status: checked-PASS
Fix cycle: 1
Lane: w17-quotehash (lane/w17-quotehash)
Base: 9e55b642
Candidate: see commit tip of lane/w17-quotehash
Class: security (citation integrity)

## Changed paths
- packages/ask/src/source-context.ts (optional `SourceHydration.liveTurns`; validateHydration recomputes proofs against it)
- packages/ask/src/quote-proof-live.test.ts (8 tests)

## Behaviour
When a hydration supplies `liveTurns` (the turn text it loaded), each transcript quote is checked: live turn present, sha256(turn text) == turnTextSHA256, charEnd within text, slice == quote and sha256(slice) == sliceSHA256, byteStart/byteEnd == UTF-8 prefix lengths. Failure drops only that quote (node dropped if none remain) and appends `{sessionId, turnId, reason: "quote-proof-stale: ..."}` to `excludedTurns`, which ask-graph already audits as `ask.source_rows_excluded`. Canonicalization mirrors apps/api source-context.ts quote(): raw UTF-8 sha256, no NFC, UTF-16 char offsets, UTF-8 byte offsets. Without `liveTurns` output is identical (same node objects).

## Open gap (apps/api, not edited)
apps/api/src/ask/source-context.ts does not yet populate `liveTurns` (it builds proofs from live rows, so consistent by construction; persisted-answer recheck already exists in answer-policy/answer-evidence.ts:79). Passing `liveTurns: snapshot.rows.map(...)` there activates the guard in production. Needs an apps/api unit.

## Checks
- node --test --import tsx src/quote-proof-live.test.ts: 8/8
- source-context.test.ts + ask-graph.test.ts: 77/77; plus bounded-ask.test.ts: 88/88
- tsc --noEmit -p packages/ask: clean
- D-020 mutation (skip turn-text hash compare): 7 pass / 1 fail (killed); per-mutation backup, trap, timeout, post-restore git hash-object check equal to pre-mutation blob.

## Fix cycle 1 (checker F1)
Added test: shifted byte offsets with correct char offsets and hashes are refused. File now 9/9, tsc clean. Mutation "disable byte-offset check" (whole condition wrapped in `false && (...)`): 8 pass / 1 fail, killed; restored blob equals pre-mutation and HEAD (hash-object with -c core.autocrlf=true).
