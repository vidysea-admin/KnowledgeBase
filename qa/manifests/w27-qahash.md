# w27-qahash: ISS-REVALIDATE-001 (QA report bound by turns.json content hash)

Status: ready-for-check
Fix cycle: 0
Base: 4264418c7488d95e76bc0d86e3920efb0e0ccd72 (origin/master)
Changed paths: qa/manifests/w27-qahash.md only (NO source change: the fix is already on base)

## Finding
Base already binds QA to the turns.json content hash. No source edit was needed or made.
- Writer: scripts/lib/transcription/transcript-qa-generation.mjs `buildTranscriptQaGeneration` writes `turnsSha256: transcriptBytesSha256(turnsBytes)`; scripts/transcribe-long-session.mjs:316 publishes it.
- Validator: scripts/webinar/validate/transcript-qa-binding.mjs refuses when `proof.turnsSha256 !== transcriptBytesSha256(turnsBytes)` ("generation hash mismatch"). The turn-count comparison remains only as a secondary check.
- Consumer: scripts/webinar/session-rows.mjs re-checks validation.turnsSha256 and qaSha256 against the bytes.
- Landed in 0f3d9bb4 with test "ISS-REVALIDATE-001: stale same-count ..." in validate-session.test.mjs. The ledger row (qa/issues.revalidate.jsonl) still says open; ledger not flipped per rules.

## Checks (node --test --import tsx, lane w27-qahash)
validate-session.test.mjs + transcript-qa-binding.test.mjs: tests 32, pass 32, fail 0.
- same-count/different-content refused: ISS-REVALIDATE-001 test (/generation hash mismatch/) and binding test line 21.
- matching hash accepted: "clean report passes" cases in validate-session.test.mjs.

## D-015
ISS-REVALIDATE-001 recorded reproductions: (a) stale same-count QA, (b) clamped=20/dropped=5/overshoot=400, (c) overlap/swapped turns, (d) 75 identical-text turns without QA, (e) three surviving mutations. (a) and (b) are replayed by the existing test: 2/2. (c), (d) and the validator-side recompute in fix_direction are NOT addressed here (beyond the requested hash binding); left open.

## D-020 mutation
Mutated transcript-qa-binding.mjs hash check to `if (false)`: 30 pass / 2 fail (ISS-REVALIDATE-001 test killed). Restored from per-mutation backup; `git -c core.autocrlf=true hash-object` equals HEAD blob 73b0b468b179dd6bd976d7165c5d386b19808141.
