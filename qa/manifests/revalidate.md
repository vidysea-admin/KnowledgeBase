# Manifest — revalidate

**Contract:** none (no qa/contracts file governs webinar re-validation).
**Goal task:** none (live-run defect: p2 webinar `validation.json` stuck at failed after a successful re-transcription).
**Date:** 2026-10-14
**Fix cycle:** 0
**Status:** checked-PASS
**Branch:** lane/revalidate

## Defect

`data/toc-migrated/2026-10-13-zoom-webinar-p2/validation.json` = `{stage: transcript, status: failed}` after the first
transcription threw. A later `transcribe-long-session.mjs` run succeeded (73 turns, 100% coverage, QA clean) but nothing
rewrites validation.json, so `sync-session.mjs` refuses with "webinar validation has not passed" (`session-rows.mjs:45`).
Only `scripts/upload/submit.mjs:54` writes a passed file, for fresh uploads. Hand-writing it bypasses the gate.

## Change

- NEW `scripts/webinar/validate/validate-session.mjs` (own dir: `scripts/webinar` is at its 30-file budget). Standalone
  subcommand, not folded into transcribe-long-session: it must also run when the transcript came from any other path.
  Reuses `validateTurns` (process-video.mjs), `assertTurnTimings`, `immutableTranscriptTurns`, `findTimeGaps`,
  `loadWebinarSession` (reported as "sync gate"), `transcript-qa.json`. Passed -> `status: passed, transcriptValidated: true`
  plus durationSec, turnCount, lastTEnd, coverage, partial, gaps, QA counts, turnsSha256, validatedAt. Failed -> `stage:
  transcript, status: failed, error, reasons[]`. The previous validation.json is archived to `.validation-history/<sha>.json`
  (same convention as `.transcript-history/`). `--dry-run` writes nothing; `--root` points at another checkout's data.
- `scripts/lib/transcription-wiring.mjs`: exports `GAP_THRESHOLD_SECONDS` (30) and `SHORTFALL_THRESHOLD_SECONDS` (45),
  moved out of transcribe-long-session.mjs so the validator and the transcriber share one definition.
- `scripts/transcribe-long-session.mjs`: new `--range START:END` (seconds). Chunk boundaries are computed over the window and
  offset, so turn times stay absolute; the single-call path is skipped with --range. START>0 leaves a leading gap and needs
  `--allow-partial`. Flag absent: byte-identical behaviour (boundaries, thresholds unchanged).

## Policy question (NOT decided here)

`--allow-partial` / `--range` sessions: the validator records `coverage` and `partial: true`. It fails them by default and
passes them only with the explicit `--accept-partial`. But `session-rows.mjs:45` reads only `status` and `transcriptValidated`,
never `partial`, so an accepted partial session PASSES the sync gate (test asserts this). Is syncing a partial transcript allowed?

## Evidence

- `node --test scripts/webinar/validate/validate-session.test.mjs`: 8 tests, pass 8 / fail 0 (failed -> re-transcribed ->
  validate -> passed -> `loadWebinarSession` accepts; bad transcript -> failed -> gate still refuses; hand-edited ids; partial
  with/without accept; internal gap; QA missing/stale/hallucination/clean; dry-run; unsafe sessionId).
- Wider run (scripts/webinar/*.test.mjs, validate test, transcription-wiring, find-audio-file, transcript-provenance tests): 159 pass / 0 fail.
- `node scripts/lint-loc.mjs --all`: lint:structure OK (10 stages, 0 failed); lint-dirsize OK.
- No TypeScript touched; there is no root tsconfig.json (tsc -p tsconfig.json: TS5058), so tsc was not applicable.
- Real p2 data, `--dry-run --root <main>` (read-only): would write passed, 73 turns, coverage 1, partial false, QA clean.
- `transcribe-long-session.mjs x --range 5:2` prints usage; `--range 0:360 600` reaches the API-key check (arg parsing ok). No live Gemini run.

## Command to re-validate p2 (from the main tree, after merge)

`node scripts/webinar/validate/validate-session.mjs 2026-10-13-zoom-webinar-p2`