# t044-transcript-qa-clamp

Status: ready-for-check
Fix cycle: 1
Priority tier: 3 — next unblocked roadmap task (T-044)
Security class: none (pure function, no I/O, no auth/tenancy/writes)

## Unit scope

Pure transcript QA module in `packages/ai/src/stt/`. Roadmap acceptance (docs/meeting-bot-roadmap.md:71): "no turn ends past the audio duration". Recorded evidence: 223 s of turns on 186 s of audio.

This unit does NOT complete T-044. Wiring the clamp into the transcription driver is blocked by the D-119 hold (`gemini-file-upload.ts`, `scripts/transcribe-long-session.mjs`, `scripts/upload/`, `scripts/lib/transcript-provenance*` are reserved). T-044 stays open.

## Files added

- `packages/ai/src/stt/transcript-qa.ts` — `clampAndValidateTurns(turns: readonly Turn[], durationSec: number, options?: { repeatThreshold?: number; toleranceSec?: number }): { turns: Turn[]; report: TranscriptQaReport }`
- `packages/ai/src/stt/transcript-qa.test.ts` — 16 node:test cases.

No existing file edited. No barrel exists in `packages/ai/src/stt/` (no index.ts), so no export added.

## Behaviour and edge-case decisions

- Postcondition for every output: finite timings, `tStart >= 0`, `tEnd >= tStart`, `tEnd <= durationSec`. Input never mutated; output turns are fresh objects; order never changed.
- Invalid duration (NaN, +-Infinity, <= 0): all turns dropped, reason `invalid-duration`, `report.durationValid=false`. Chosen over returning input unchecked, because the postcondition cannot be established.
- Non-finite / non-number tStart or tEnd: dropped, reason `invalid-timing`.
- Negative tStart: clamped to 0. tEnd < tStart: tEnd raised to tStart. Both count as clamped.
- tStart >= duration (including exactly at it): dropped, reason `start-at-or-beyond-duration`, `suspectedHallucination: true`, index also in `hallucination.pastEndIndices`.
- tEnd > duration: set to duration, counted clamped. tEnd exactly at duration: untouched. tEnd within `toleranceSec` (default 1e-6) above duration: snapped, NOT counted clamped.
- Zero-length input turns are kept; clamping cannot create zero-length turns (only tStart < duration survives).
- Non-monotonic tStart (vs previous surviving turn) reported in `nonMonotonicIndices`, never reordered.
- Repetition spot-check: runs of >= `repeatThreshold` (default 3, minimum 2) consecutive INPUT turns with identical normalised text (lowercase, punctuation stripped, whitespace collapsed; empty text ignored). Reported as `{text, startIndex, length}`; informational only, turns are not removed.
- Report: input/output counts, clamped count + indices, dropped (index, reason), totalTurnSec, overshootSec = max(0, total - duration), maxInputEndSec, nonMonotonicIndices, hallucination block. totalTurnSec sums valid-timing input turns only (computed pre-clamp, so the recorded case gives 223 vs 186 -> 37 s).
- Empty input: valid, empty output.

## Evidence

Run from `C:\Users\product\Desktop\KnowledgeBase-lanes\transcript\packages\ai`, Node from the codex runtime.

`node --test --import tsx src/stt/transcript-qa.test.ts` -> tests 16, pass 16, fail 0, exit 0.

`node --test --import tsx src/stt/gemini-file-upload.test.ts` -> tests 22, pass 22, fail 0, exit 0 (neighbour regression).

`node C:\Users\product\Desktop\KnowledgeBase\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` -> no output, exit 0.

Test coverage: recorded 223/186 case, boundaries (tEnd==dur, tStart==dur, tStart>dur), float tolerance, negative/reversed timings, empty input, invalid durations, invalid timings, non-monotonic, repeat at/below threshold and custom threshold, empty-text/non-consecutive repeats, immutability, field passthrough, 300-run seeded property loop on the postcondition.

## NOT covered

- Mutation testing (checker's job). No ledger issue is the purpose of this unit, so no D-015 corpus applies.
- No semantic hallucination detection (only past-end and repeated-text heuristics). Overlapping turns are not flagged. Drift is clamped, not re-timed (a turn that drifted but starts inside the audio keeps a wrong tStart).
- Not run against real transcript data; no `verify_contracts.py` run (contracts empty).

## Wiring needed

- Call `clampAndValidateTurns(turns, audioDurationSec)` in the transcription driver (`scripts/transcribe-long-session.mjs` / `gemini-file-upload.ts` path) and persist `report` — blocked by D-119 hold.
- No barrel in `packages/ai/src/stt/` exports sibling modules; consumers import `./transcript-qa.js` directly unless a barrel is added.
- T-044 in TASKS.md / .goal/goal.json remains open until wired.
