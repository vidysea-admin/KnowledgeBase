# Manifest: ocrretry-ocr-retry-fallback
**Handshake status:** ready-for-check
Fix cycle: 0
**Authority:** D-137 (pending append) - Umesh: "there must be a fallback or retry mechanism". Amends assumption A5 of t041-ocr-stage-alignment.

## Scope
OCR failure on a keyframe: retry `retries` (default 2) with exponential backoff `backoffMs*2^n` (default 250, injectable `sleep`, optional per-attempt `timeoutMs`), then one attempt on optional injected `fallback` OcrFn, else omit the frame and report `{frameId, code, attempts}` in `ocrErrors`. Retryable = throw/reject/timeout/malformed result. Definitive = well-formed `{text}` incl. blank: never retried, never an error. Failure is never turned into blank text.

## Files
packages/core/src/keyframes/ocr-stage.ts, extract.ts (new `ocrRetry` option), ocr-stage.test.ts. `OcrStageError` gained `attempts`.

## Criteria / Evidence
- `node --test --import tsx src/keyframes/ocr-stage.test.ts src/keyframes/keyframes.test.ts`: tests 21, pass 20, fail 0, skipped 1 (pre-existing). tsc --noEmit clean.
- Fakes only, no sleeping (injected sleep), no OCR text logged (console captured, asserted empty).
- Mutations (6/6 killed): fallback disabled, retries off-by-one, blank treated as failure, failure->blank obs, attempts omit fallback, no backoff growth.
