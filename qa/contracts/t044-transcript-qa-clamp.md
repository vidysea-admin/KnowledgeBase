# Contract — t044-transcript-qa-clamp (T-044, pure module only)

> Ground truth derived by the checker from docs/meeting-bot-roadmap.md:71 ("fix timestamp drift (clamp +
> validate against the audio duration), hallucination spot-check | no turn ends past the audio duration").
> Scope: the pure module `packages/ai/src/stt/transcript-qa.ts`. Wiring into the transcription driver is
> held under D-119 and is NOT part of this contract; T-044 itself stays open.

## Criteria (each machine-checkable)

1. For a valid duration D > 0, every returned turn satisfies finite, `0 <= tStart <= tEnd <= D`.
2. The input array and its turn objects are never mutated (frozen input accepted); order is never changed;
   extra Turn fields (confidence, speakerLabel, ...) pass through.
3. Every dropped turn appears in `report.dropped` with its original input index and a reason; report counts
   reconcile: `inputCount = outputCount + dropped.length`; `clampedCount = clampedIndices.length`; no index is
   both clamped and dropped.
4. A turn starting at or after D is dropped (not zero-length-clamped) and flagged as a suspected
   hallucination; tEnd exactly D is untouched; tEnd above D is set to D.
5. Invalid duration (NaN, +-Infinity, <= 0, non-number) never returns turns unchecked: all dropped, `durationValid=false`.
6. The recorded case (223 s of turns on 186 s of audio) reports `totalTurnSec=223` and `overshootSec=37`.
7. Hallucination spot-check: runs of >= repeatThreshold consecutive turns with identical normalised text are
   reported (not removed); default threshold 3.
8. The package typechecks and the unit tests plus the neighbouring `gemini-file-upload` tests pass; the tests
   fail under mutation of each behaviour above.
9. Bounds: only the two stt source files and the manifest are touched; D-119 reserved files unchanged.
