# Verdict - t041-keyframe-dedup
VERDICT: PASS
Cycle checked: 0
Commit checked: cf7faa8 (lane/keyframes, base 3f4e213)
Scope: pure function; synthetic hashes only; unwired. T-041 stays open.

EXPLANATION:
- Own cases (>20 assertions in 6 tests): identical run, alternating A/B, slow drift splits, threshold 0/63/64, single frame, empty, hex case, odd-length hex valid, endSec, flicker at start/middle/end plus two flickers in a row (mid and leading), 12 invalid-input shapes all typed errors with zero keyframes, 100,000 frames in ~0.1 s. All correct.
- Own seeded property, 1,000 cases with random threshold/minDuration/endSec: ids/times/hashes exist in input, spans tile with no gap or overlap, ascending, frameIds concatenate to input order, deterministic: 0 violations.
- Monotonicity: not guaranteed. Without minDuration 1/1000 cases got MORE keyframes at threshold+1; with minDuration 34/1000. Inherent to greedy last-kept anchoring (the anchor moves), and chosen on purpose for anti-drift. Does not matter for correctness; only means threshold tuning must be measured on a corpus, not assumed monotone. Recorded in the contract as not guaranteed.
- Consumer: output feeds alignSlidesToTurns type-checks only as-is when passed untyped-wide? It runs without conversion, but with no `text` the consumer rejects every slide (invalid-text, 3 errors, no primary slides). With `{id,tSec,text}` it runs clean. So the missing text is handled loudly by the consumer, not silently; the manifest states the OCR stage adds text. Not a defect.
- Item 4 ruling: acceptable as documented, with a design note. A caller ignoring `errors` gets zero slides for a recording; the consumer does not hide this (empty slides are indistinguishable from "no slides" though). No concrete wrong outcome in the existing consumer. Recommend (not required) a discriminated result when the function is wired, to be decided in the wiring slice.
- Manifest honesty: says synthetic only, threshold 5 and scene-cut scale unvalidated, unwired, T-041 not done. No false claim found. Maker's counts re-run: 16/16, 1/1.
- Mutations (8 own, per-mutation byte backup, finally restore, hash-object equals HEAD blob verified): 7 killed, 1 survived: rejoin comparison `<=` to `<` after a flicker merge (boundary distance == threshold). Low observation only, not filed.
- Gates: both test files pass; tsc --noEmit exit 0; lint-dirsize OK; lint-dupes OK (1082); keyframe files 70/84/97/161 lines (budget 300); lint-loc only the pre-existing sb_join.py. merge-tree against codex/machine-migration-2026-10-09: clean (exit 0, tree b8c7c5a).
- index.ts line this unit adds: `export * from "./domain/keyframe-dedupe.js";` (inserted just before `export * from "./domain/purge-policy.js";`).

ISSUES-WRITTEN: none

Merge conditions: none blocking. Manifest flip to checked-PASS is the maker's close-out. Before wiring: measure threshold on a real recording; decide discriminated result; OCR adds text.
