# t041-keyframe-extraction-and-hashing

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (roadmap task T-041, third slice). T-041 stays OPEN. No auth, tenancy or data write beyond PNG files in a caller-given directory. Verdict by the checker only.
Lane: lane/keyframes. Lane ledger `qa/issues.keyframes.jsonl`: no findings filed (file not created).
Round cap (T-041 seam): 2 prior PASSes (t041-slide-turn-alignment, t041-keyframe-dedup). This unit is a NEW capability (real extraction + image hashing), not a further round on the pure functions; flagged for the checker to confirm.

## Scope
Only `packages/core/src/keyframes/` (new dir, 4 files; the merged T-041 code lives in packages/core, so that is the one package). NOT touched: `packages/core/src/index.ts` (no export: node:child_process must not reach the web bundle via the barrel; the module is unwired), `summarize.ts`, the live session pipeline, schema, packages/index.
- `perceptual-hash.ts`: `dHashGray9x8`, `dHashRawStream`.
- `ffmpeg-args.ts`: `KeyframeExtractError` (codes bad-config, bad-input, input-missing, ffmpeg-missing, ffmpeg-failed, ffmpeg-timeout, output-too-large, bad-output, dedupe-failed), `resolveFfmpeg`, `hashPassArgs`, `framePassArgs`.
- `extract.ts`: `spawnExec` (spawn, shell:false, bounded time/stdout), `extractFrameHashes`, `extractSlideTurnAlignment`.
- `keyframes.test.ts` (10 tests).

## Choices
- ffmpeg location: same convention as packages/ingest youtube.ts: `LKB_FFMPEG_PATH` (absolute binary or directory; relative -> bad-config), else `<repo>/.cache/tools/ffmpeg-9.0.2/bin/ffmpeg(.exe)` if present (the default used for ffprobe in scripts/upload and calendar-attendance), else PATH `ffmpeg`. Unstartable -> typed `ffmpeg-missing`.
- Sampling: FIXED INTERVAL, default 2 s (`fps=1/N`), then hash dedupe. Source: the dedup manifest says dedupe is "over frame hashes" and names no scene-detect filter or interval. The 2 s value is a CONVENTION, not measured on a real recording; configurable (`intervalSec`, (0, 3600]).
- Hash: 64-bit dHash on a 9x8 grayscale frame that ffmpeg produces (`scale=9:8:flags=area,format=gray`, rawvideo to stdout). Bit = left > right, row-major, MSB first, 16 hex chars. No image library, no installs.
- Two ffmpeg runs: pass 1 hash stream (one process); pass 2 one PNG per KEPT keyframe (`-ss t -i in -frames:v 1`). Frame i is stamped `i * interval`.
- Alignment input: NO OCR in this slice, so each kept keyframe becomes a SlideObservation with stand-in text `keyframe:<hash>`; the alignment output (ids + ranges) is asserted not to contain it. `endSec` defaults to last sampled time + interval (caller can override).
- NOT done (by design): OCR, wiring into any pipeline, schema fields, storing results, a measured Hamming threshold.

## Evidence (packages/core; node off PATH; `timeout` on every command; temp dirs deleted; no network)
- ffmpeg PRESENT: `C:\Users\product\Desktop\KnowledgeBase\.cache\tools\ffmpeg-9.0.2\bin\ffmpeg.exe` (the worktree has no .cache, so it was passed via `LKB_FFMPEG_PATH`).
- With it: `node --test --import tsx src/keyframes/keyframes.test.ts` -> `tests 10, pass 10, fail 0, skipped 0`.
- Without it (no env): `tests 10, pass 9, fail 0, skipped 1` (the e2e test skips with the reason printed).
- e2e: generated 8 s 160x120 mkv (4 s smptebars + 4 s hflipped), interval 2 -> 4 frames at t=0,2,4,6; same-picture distance <= 5, flipped > 5; 2 keyframes spans [0,4) and [4,8); both PNGs valid; turns a/b get primary slide 0 / 1.
- Existing `keyframe-dedupe.test.ts` + `slide-turn-alignment.test.ts`: `tests 32, pass 32`.
- `tsc --noEmit -p tsconfig.json` in packages/core: exit 0 (once).
- Measured on the synthetic wave frame: a 1-column shift gives Hamming distance 19 of 64 (above the default threshold 5): dHash on a 9x8 grid is NOT shift-tolerant, so panning/animated slides will split keyframes. The test asserts only <= 20. Threshold and grid size need a measured corpus.

## Mutations (8 tried; harness `.mut-harness-keyframes.mjs`, untracked, deleted; per-mutation byte backup restored in `finally`; SIGKILL timeout 150 s)
All 8 KILLED: dHash comparison flipped; `scale=8:8`; `-nostdin` dropped; end without `+ interval`; ENOENT not mapped to ffmpeg-missing; frame time not multiplied by interval; partial-frame check disabled; `shell: true`. Each applied-check by string presence and content hash change. After the run `git hash-object` of the three source files equals the committed blobs.

## NOT covered
- No real webinar recording; slide-like content is synthetic. Interval, threshold and grid are unmeasured.
- Fake-exec tests prove argument arrays and plumbing; the one real-ffmpeg test covers a mpeg4/mkv input only.
- Input path is checked for existence only; no content-type or size gate on the recording.
- OCR, wiring, persistence, retention of the PNGs (D-008 purge policy) are later slices.
