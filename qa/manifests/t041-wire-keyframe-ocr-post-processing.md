# t041-wire-keyframe-ocr-post-processing

**Handshake status:** checked-PASS (qa/verdicts/t041-wire-keyframe-ocr-post-processing.md, cycle 0)
Fix cycle: 0
Tier: 3 (roadmap task T-041, wiring slice). No auth/tenancy; writes one new derived file per session (`slide-alignment.json`) only when the flag is on. T-041 stays OPEN.
Lane: lane/w041. No ledger issues fixed or filed.

## What this wires
The merged keyframes -> OCR (bounded retry + backoff, then fallback, D-137) -> slide/turn alignment stage was reachable only from tests. It is now called from the recording post-processing entry point `scripts/webinar/process-video.mjs` (the `--process-video` stage `processRecordingArtifacts` spawns), behind `LKB_KEYFRAME_OCR=1`. OFF unless exactly `1`.

## Files
- `packages/core/src/keyframes/vision-ocr.ts` (new): `createGeminiVisionOcr({transport, apiKey, model, readFrame?}) -> OcrFn`. Gemini vision on the existing gemini route; the call goes through an injected transport structurally identical to packages/ai `Transport` (core takes no dependency on ai). PNG inlineData, JSON `{text}`; non-2xx / non-JSON / missing `text` throw (so the stage retries them); blank text is a valid answer. Errors never carry key, frame bytes or slide text.
- `packages/core/src/keyframes/post-process.ts` (new): `runKeyframeOcrPostProcess` -> `disabled | skipped(no-ocr-provider) | failed(code) | done(ids, ranges, ocrErrors)`. Never throws; no slide text returned.
- `packages/core/src/keyframes/post-process.test.ts` (new, 9 tests).
- `scripts/webinar/process-video.mjs`: optional `slideAlignment` hook on `processVideo` (runs after the video stage is `done`, also on a reused stage); `runSlideAlignment` maps turns to the align shape, uses a temp dir removed in `finally` (D-008: no PNG retention), writes `slide-alignment.json` (ids/ranges only); a throwing hook never fails the video stage. `keyframeOcrHook(env, transport, load?)` builds primary OCR (`WEBINAR_VISION_MODEL`) and optional fallback OCR (`LKB_KEYFRAME_OCR_FALLBACK_MODEL`, same gemini route); CLI builds it only when the flag is `1` and the existing vision env is present.
- `scripts/webinar/process-video-slides.test.mjs` (new, 6 tests). Existing `process-video.test.mjs` untouched.

## Flag-off proof
No hook => no `slideAlignment` key in the result, no `slide-alignment.json`, reuse path unchanged. A disabled hook => state equals the no-hook state apart from the added key, output files equal after normalising the per-run frame-dir name, no file written. Flag off in core: `extract` and `ocr` are never called.

## Acceptance criteria (T-041: "Slide keyframes -> OCR -> attached to turns by time")
Met in code: keyframe sampling + dedupe (prior), OCR via provider adapter with retry/fallback (D-137), alignment of slides to turns by time, wired into the post-processing path behind a flag, failures reported by frame id + attempts, no slide text persisted.
Still need a live run (PENDING, not run, no model call made): live frames from a real recording through the real Gemini vision model, real ffmpeg binary, and `slide-alignment.json` on a real session. The real-ffmpeg e2e test remains skipped (no ffmpeg on this machine).
Owner decisions still open: storage/retention/redaction of slide TEXT (this wiring persists none), and whether alignment should feed search/index (not done).

## Evidence
See the lane's final report for counts; commands: core `node --test --import tsx src/keyframes/post-process.test.ts`; root `node --test scripts/webinar/process-video-slides.test.mjs scripts/webinar/process-video.test.mjs`; `tsc --noEmit -p packages/core/tsconfig.json`; `node scripts/lint-loc.mjs --all`.

## Results (this lane, machine under load)
- `post-process.test.ts`: tests 9 / pass 9 / fail 0. `scripts/webinar/process-video-slides.test.mjs` + `process-video.test.mjs`: tests 19 / pass 18 / fail 0 / skipped 1 (pre-existing real-ffmpeg test, no ffmpeg here).
- Full packages/core suite: 394 tests, 391 pass, 2 fail (run 1: 389 pass / 4 fail). The failures are in untouched job-queue real-process tests (`ISS-JOBQSTALL-002 ... S4`, `default start-time source ...`), vary run to run, and are load-dependent timing/process-lookup tests; they do not touch keyframes. Not re-verified on the main tree.
- `tsc --noEmit -p packages/core/tsconfig.json`: exit 0. `node scripts/lint-loc.mjs --all`: `OK (10 stages, 0 failed)`.
- Mutations (6, harness untracked in the worktree and deleted, per-mutation backup restored in `finally`, `git hash-object` equal before/after for every one): flag default-on KILLED; adapter ignores http status SURVIVED then a test was added (valid body + status 500 must throw; re-run green, mutant not re-run); wrong mime KILLED; disabled hook still writes file KILLED; hook drops fallback KILLED; temp keyframes not cleaned KILLED. 5/6 killed, 1 closed by a new test.
- Live-frames run: PENDING (not run). No model, network, Chrome or ffmpeg used.
