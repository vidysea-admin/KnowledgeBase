# Manifest — t041-ocr-stage-alignment
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Tier:** 3 (roadmap task). Slice 4 of T-041. T-041 stays OPEN.
**Severity / ceremony:** no auth, tenancy or data write; no schema; nothing persisted. Not blocked by D-119 (that hold covers U4.1/T-051/T-052 upload/STT files; none touched).

## Scope
Wire keyframes -> OCR -> `alignSlidesToTurns` behind an INJECTED `OcrFn`. Fakes only: no OCR service, model, network, video or real ffmpeg in the new tests.
Files (packages/core/src/keyframes, 4 -> 6 files):
- `ocr-stage.ts` (new): `OcrFn`, `ocrKeyframes(frames, ocr)` -> `{observations, errors}`.
- `ocr-stage.test.ts` (new): 4 tests.
- `extract.ts`: optional `PipelineOptions.ocr`; when set, alignment uses OCR text instead of `keyframe:<hash>`; `SlideAlignmentRun.ocrErrors` added (always `[]` without `ocr`). `slides` still holds the stand-in; no OCR text is returned.

## Decision flagged for the checker (assumption A5 of t041-slide-turn-alignment)
OcrFn throw/reject/non-string text/bad confidence => frame OMITTED (previous slide keeps the screen) + `{frameId, code}` in `ocrErrors`; only blank text returned by OcrFn means "no slide". Errors never carry slide text. Frames OCR'd sequentially.

RESOLVED by D-137 and lane ocrretry (checker PASS cycle 0): the owner question on A5 is answered; OCR failures are retried with backoff plus one fallback attempt, and failed frames are omitted and reported with attempts.

## NOT done
No real OCR/vision adapter, no model/cost choice, no storage/retention/redaction of slide text (still an OWNER DECISION), no search indexing, no barrel export, no PNG retention (D-008).

## Evidence (packages/core)
`node --test --import tsx src/keyframes/ocr-stage.test.ts src/keyframes/keyframes.test.ts src/domain/slide-turn-alignment.test.ts` -> `ℹ tests 30 / pass 29 / fail 0 / skipped 1` (skipped = pre-existing real-ffmpeg e2e, not run: needs the ffmpeg binary). `tsc --noEmit -p tsconfig.json` exit 0.
