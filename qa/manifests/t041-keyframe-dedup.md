# Manifest — t041-keyframe-dedup
**Status:** ready-for-check
**Fix cycle:** 0
**Tier:** 3 (roadmap task). Second slice of T-041; T-041 stays OPEN.
**Scope: pure function; SYNTHETIC hashes only; unwired.** No ffmpeg, no image hashing, no OCR, no storage, no wiring, no schema/contract change. Severity: no auth, tenancy or data write.
**Round cap (T-041 seam):** 1 prior PASS verdict (qa/verdicts/t041-slide-turn-alignment.md); cap is 2, so this slice is allowed. No issues filed (qa/issues.keyframes.jsonl not created).

## Source in the prior manifest (qa/manifests/t041-slide-turn-alignment.md)
- L44: "Keyframe selection (pure scene-change dedupe over frame hashes; needs a sample recording, ffmpeg run on a quiet machine)." This is the slice built here, minus the recording.
- L19 (A1): keyframe dedupe "may or may not have run"; L25: near-duplicate slides are not merged by alignment, "needs a policy and a measured corpus".
- The manifest does NOT specify the hash representation or the comparison rule. Chosen here: equal-length hex hash (64-bit = 16 hex expected); compare to the last KEPT frame (anti-drift), as the brief's default.

## Files (packages/core/src/domain, 21 -> 24 files, limit 30)
- `keyframe-dedupe.ts` (96) `dedupeKeyframes`, `hexHammingDistance`, `DEFAULT_KEYFRAME_HAMMING_THRESHOLD`, `Keyframe`, `KeyframeDedupeResult`
- `keyframe-dedupe-validate.ts` (70) `KeyframeFrame`, `KeyframeDedupeOptions`, `KeyframeDedupeError(Code)`, validators
- `keyframe-dedupe.test.ts` (160), `keyframe-dedupe.property.test.ts` (84)
- `packages/core/src/index.ts`: one `export *` line (the existing explicit-list pattern; names are repo-unique, lint-dupes OK).

## Behaviour
- Input `KeyframeFrame {id, tSec, hash, diff?}`; options `hammingThreshold` (default 5 bits, UNVALIDATED), `minDurationMs` (default off), `sceneCutDiff` (default off; diff >= it forces a keyframe), `endSec`.
- Output `Keyframe {id, tSec, hash, from, to, frameIds}`; spans half-open, tile [first frame time, endSec ?? last frame time]. `id`/`tSec` are exactly SlideObservation's fields: the OCR stage adds `text`; a test feeds them to `alignSlidesToTurns` (`{id, tSec, text}`; a `{...k, text}` spread also type-checks). No other conversion.
- Comparison is against the last KEPT frame (drift test: steps of 2 bits, never chained into one run). Flicker (< minDurationMs) merges into the previous run; a leading flicker merges forward (span.from moves back, keyframe stays its own frame). After a merge, a following same-looking run re-joins (A, flicker, A = one run). Final 1-frame run counts as flicker unless `endSec` is given.
- Fail-closed typed errors, never throws: invalid-input, invalid-id, duplicate-id, invalid-time, negative-time, unsorted-time, duplicate-time, invalid-hash, mixed-hash-length, invalid-diff, invalid-option. Empty input -> empty.

## Evidence (worktree keyframes, packages/core)
- `node --test --import tsx src/domain/keyframe-dedupe.test.ts` -> `tests 16 / pass 16 / fail 0` (includes 100,000 frames in ~0.2 s vs 5 s bound, drift, boundaries, errors, alignment feed).
- `node --test --import tsx src/domain/keyframe-dedupe.property.test.ts` -> `tests 1 / pass 1 / fail 0`: 2,500 seeded cases (spans tile with no gap/overlap, only input times/ids/hashes appear, every frame in exactly one keyframe in order, members within threshold when no flicker/cut merging, adjacent keyframes differ, determinism). It found one real bug during build (leading-flicker frame ids lost), fixed.
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0.
- `lint-dirsize: OK`; `lint-dupes: OK (1082 unique export(s))`; lint-loc: no keyframe file over budget (all < 300). Pre-existing, unrelated failures in `lint-loc --all`: `packages/meeting-bot/py/sb_join.py` 1142 lines, root loose files 18 > 15, a dependency-cruiser violation, tracker-audit G4 findings (not touched here).
- Mutations: 18, per-mutation byte backup, 120 s timeout, restore in finally, `git hash-object` equal before/after each; harness untracked, deleted before commit. **18/18 KILLED, 0 survived** (threshold `<=`/`<`, chain-compare, flicker `<`/`<=`, merge-without-extend, rejoin removed, cut ignored / `>`, default threshold, default end, leading carry, ids carry, all-flicker fallback, popcount table, case folding, unsorted / duplicate-time / mixed-length / negative-time validation).

## NOT covered
- **Validated on SYNTHETIC hashes only; the default threshold (5 of 64 bits) and any minDurationMs are UNVALIDATED against a real recording.** No real pHash/dHash implementation, so which hash algorithm and bit length the capture stage emits is open.
- `sceneCutDiff` semantics (what scale the caller's `diff` has) is an assumption; ffmpeg's scene score is 0..1 but nothing here reads it.
- Not wired into any stage; no OCR; no storage; T-041 not done; TASKS.md and goal.json untouched.
- Next slices (prior manifest L40-48): slide-observation schema + owner decision on storage/retention/redaction, OCR adapter, wiring, search index.
