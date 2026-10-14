# t046-retention-live

**Handshake status:** ready-for-check
Fix cycle: 0
Tier: 3 (roadmap T-046, closes the gaps the executor and schedule manifests listed). Class: DATA DELETE path (clip-before-purge gate), FULL ceremony. Lane: lane/t046-retention-live (branched from lane/codexwave1). No ledger issue is fixed or filed.
Authority: D-008 (clip of +/-15 s per cited turn retained permanently before media purge), D-145 (90 days).

## Scope (only packages/ingest/src/retention/**)
1. processedAt writer: `retention-processed.ts` (`markSessionProcessed(sessionDir, now)`) + `retention-processed-cli.ts`. Stamps processedAt into session.json atomically only when status.transcribe and status.index are both "done"; idempotent (never moves an existing valid stamp); changes no other field. The pipeline call site is OUTSIDE packages/ingest and is NOT edited: hook for the integrator, one line in scripts/webinar/sync-session.mjs right after the index-proof.json rename (end of the `if (INDEX)` block): `(await import("../../packages/ingest/src/retention/retention-processed.ts")).markSessionProcessed(dir, Date.now());` (documented in the helper header too).
2. Evidence clips (D-008): `retention-clips.ts` (ffmpeg, spawn without shell, argv array, location per repo convention LKB_FFMPEG_PATH / .cache/tools / PATH, stream copy so no codec requirement; cut may start a little earlier than the window at a keyframe, never later). `retention-purge.ts` gains optional `deps.clips`: in EXECUTE mode clips are extracted into `<data-root>/<tenant>/<session>/evidence-clips/` BEFORE the unlink; any failure (ffmpeg missing, nonzero exit, empty output, bad window) vetoes the item and the raw media is KEPT. Dry run only prints `WOULD-EXTRACT-CLIPS`. `deps.clips` unset = previous behaviour byte-for-byte (existing tests untouched). Both CLIs now pass the real extractor (`retention-clips-wire.ts`).
3. Last-run summary: `retention-last-run.ts` documents and builds the version-1 shape; `runPurgeJob` writes it when `deps.lastRunFile` is set; the job CLI defaults it to `data/retention/last-run.json` (cwd-relative, override `LKB_RETENTION_LAST_RUN`). Fields: version, mode, dryRun, startedAt, finishedAt, exitCode, ok, candidates, deleted, bytes, vetoed, failed, clipsRetained, reportFile. No transcript/title text. Endpoint and UI are follow-ups.

## Safety
Deletions remain DRY RUN by default; `--execute` still the only delete path. No real delete was enabled, scheduled or run. Tests use temp dirs and an injected ffmpeg/unlink; no real raw/ media, no real ffmpeg. HUMAN_GATE for Umesh: enabling real deletion (`-Execute -ConfirmDeletion` on the scheduled task) and supplying `--min-age-days` / `--clip-padding-seconds` (ARCHITECTURE Q6) remain owner decisions; also confirm the evidence-clips location (inside the session dir) and that stream-copy clips are acceptable.

## Evidence (Node 24, from the lane worktree)
- `node --test --import tsx src/retention/retention-live.test.ts`: pass 13 / fail 0 (new).
- All retention tests (`src/retention/*.test.ts src/retention/**/*.test.ts`): pass 120 / fail 0.
- Full packages/ingest suite (`src/**/*.test.ts`): tests 364 / pass 364 / fail 0.
- `tsc --noEmit -p tsconfig.json` (packages/ingest): exit 0.
- `node scripts/lint-loc.mjs --all`: stages dependencies (circular import I introduced and fixed) and dupes (FFMPEG_ENV duplicate, fixed) now pass. Remaining failures are PRE-EXISTING on lane/codexwave1 (verified by stashing my work): loc `packages/meeting-bot/py/test_sb_join_ownership.py:408 (budget 400)` and snapshot stale (docs/SNAPSHOT.md). Not touched.
- End-to-end test: with no processedAt `eligible to purge: 0`; after markSessionProcessed the 100-day-old recording is a WOULD-PURGE candidate.
- Mutation testing: NOT run in this cycle.

## Not delivered / not verified
Real ffmpeg never run (injected); no clip made from a real recording. Integrator hook not applied. processedAt for already-indexed historical sessions is not backfilled. Clip retention policy for the evidence-clips directory (tenant isolation, serving) is a follow-up. Endpoint/UI for last-run.json.
