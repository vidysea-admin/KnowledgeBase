# Manifest — diarization-marker-frequency-fix

Status: checked-PASS (see qa/verdicts/diarization-marker-frequency-fix.md)
Contract: `qa/contracts/diarization-marker-frequency-fix.md`
Fix cycle: 2 (cycle 1 checker independently found a real, isolated corrupted-speakerRef bug
while verifying — see "Fix cycle 2" section below)

## Fix cycle 2 — the checker's own finding, fixed

The cycle-1 checker (verdict `qa/verdicts/diarization-marker-frequency-fix.md`, PASS) found one
real, disclosed defect while independently verifying: `2026-04-21-visa-blueprint-part2-italy
-france-nz-t002` had a ~280-character sentence fragment as its `speakerRef` instead of a real
label. Root cause: `parseDiarizedTranscript`'s non-greedy speaker capture (`(.+?):\s+`) had no
real short "Name:"/"spk:N:" label immediately after that marker to anchor on, so it ran on to an
unrelated `": "` deep in the following sentence, swallowing real spoken content as if it were a
speaker name.

**Fix**: `packages/ai/src/stt/gemini-file-upload.ts` — `MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH = 60`.
Any captured "speaker" longer than that is treated as a mis-split: the swallowed text is
recovered into the turn's own content (prepended), and the speaker is inherited from the
previous plausible turn. Two new tests added: the exact corruption shape (reproduces the real
bug, confirms recovery), and a control case (a normal short label is unaffected by the guard).

**Retroactive repair**: `scripts/fix-corrupted-speaker-labels.mjs` (new, one-time) scans every
session's `turns.json` for the same implausible-length pattern and applies the identical
recovery logic to already-written data (no re-transcription needed — this is a pure JSON
repair, not a re-roll of the dice). Run with `--dry-run` first across ALL 23 sessions (not just
the one the checker sampled): found exactly 1 corrupted turn, matching the checker's finding
precisely — confirms the defect was genuinely isolated. Applied for real, re-synced to Mongo,
independently re-verified via a fresh pymongo query.

```
$ node scripts/fix-corrupted-speaker-labels.mjs --dry-run
2026-04-21-visa-blueprint-part2-italy-france-nz: 1 corrupted speakerRef turn(s) repaired
1 total corrupted turn(s) found (dry run, not written) across all sessions.

$ node scripts/fix-corrupted-speaker-labels.mjs
2026-04-21-visa-blueprint-part2-italy-france-nz: 1 corrupted speakerRef turn(s) repaired
1 total corrupted turn(s) repaired across all sessions.

# real Mongo re-sync + fresh pymongo verification
speakerRef: 'spk:0'
text: "so, good evening to all our members joining from different parts of the Global South, ..."
```

`pnpm --filter @lkb/ai test`: 56/56 (was 54, +2 new tests for this fix).

## What changed

1. **`packages/ai/src/stt/gemini-file-upload.ts`** — `DIARIZE_PROMPT` now requires a fresh
   `[MM:SS]` marker at least every 15-20 seconds, even mid-monologue.
2. **`scripts/transcribe-long-session.mjs`** — `MIN_RECURSE_SECONDS` lowered 180 → 20.
3. **`data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json`**,
   **`.../2026-07-15-creative-futures/turns.json`**, **`.../2026-07-30-in-focus-3/turns.json`**
   — real diarized transcripts, replacing the T-002 placeholder data.
4. **Live `lkb` Mongo `turns` collection** — re-synced via `scripts/sync-real-turns.mjs` for all
   23 real sessions (idempotent re-run; only the 3 touched sessions' turn counts actually
   changed).
5. **`TASKS.md`** — T-003 marked `done`.
6. **`packages/ai/src/stt/gemini-file-upload.ts`** — `MAX_PLAUSIBLE_SPEAKER_LABEL_LENGTH` guard
   (fix cycle 2, see above).
7. **`packages/ai/src/stt/gemini-file-upload.test.ts`** — 2 new tests for the guard.
8. **`scripts/fix-corrupted-speaker-labels.mjs`** (new) — one-time retroactive repair script.

## Real diagnostic work (why this is the actual root cause, not a guess)

1. Ruled out ffmpeg stream-copy corruption: re-encoded (`-c:a aac`, not `-c copy`) the exact same
   300s region — identical stuck-at-30s result. Not a container issue.
2. Ruled out real silence: `ffmpeg -af silencedetect=noise=-35dB:d=5` found zero silence anywhere
   in the whole 101-minute file; `volumedetect` on the specific region showed `mean_volume: -23.7
   dB, max_volume: -2.6 dB` — normal speech level.
3. Found the real cause: the "stuck" turn's own TEXT (read directly from a raw API response)
   contained far more spoken content than 30 seconds could hold — a dense ~5-minute monologue
   about Italian universities/visas, all under ONE `[MM:SS]` marker. The parser's `tStart + 30s`
   last-turn fallback was computing `tEnd` from a turn count of 1, not from real elapsed time.
4. Confirmed the fix: the same 300s region, re-requested with an explicit "marker every 15-20s"
   instruction, came back with 20 markers spanning the full 293 real seconds,
   `finishReason: "STOP"` (natural completion, not truncation).

## Real evidence — end-to-end transcription runs

### `2026-04-21-visa-blueprint-part2-italy-france-nz` (101.2 min, 3 chunks)
```
chunk 1/3: attempt 1/3 -> 180 turns, COMPLETE (first try)
chunk 2/3: attempt 1/3 INCOMPLETE -> attempt 2/3 -> 66 turns, COMPLETE
chunk 3/3: attempt 1/3 -> 45 turns, COMPLETE (first try)
merged 291 total turns, coverage 100.4%, no internal gaps found
wrote 291 real diarized turns (replaced 107 placeholder)
```
(One earlier run in this same session hit a transient Gemini 503 before any chunk started —
retried, no relation to the fix itself.)

### `2026-07-15-creative-futures` (102.4 min, 3 chunks)
Real, honest progression across 3 real attempts as `MIN_RECURSE_SECONDS` and retries did their
work — included for transparency, not cherry-picked:
- Attempt A (before the `MIN_RECURSE_SECONDS` fix): 1 unresolved 53s gap at the chunk 0/1 seam,
  script correctly refused to write.
- Attempt B (after lowering the threshold, hit a transient 503 mid-run): retried.
- Attempt C: recursion engaged on the 53s tail, reduced the gap to 40s, script again correctly
  refused to write an incomplete transcript.
- Attempt D (final): `merged 269 total turns, coverage 100.3%, no internal gaps found` — chunk 1
  resolved cleanly on its 3rd top-level attempt (no partial-accept needed in the end).
```
wrote 269 real diarized turns -> .../2026-07-15-creative-futures/turns.json (replaced 164 placeholder)
```

### `2026-07-30-in-focus-3` (59.6 min, 2 chunks)
```
chunk 1/2: attempt 1/3 -> 33 turns, COMPLETE (first try)
chunk 2/2: attempt 1/3 INCOMPLETE (0 turns) -> attempt 2/3 -> 63 turns, COMPLETE
merged 96 total turns, coverage 99.5%, no internal gaps found
wrote 96 real diarized turns (replaced 124 placeholder)
```

### Final Mongo sync + independent verification (fresh pymongo, this session)
```python
# iterates every real `sessions` document, not a hardcoded id list
23/23 sessions fully real
```
Every one of the 23 real TOC sessions shows `speakerRef: "unknown"` count == 0.

### Full workspace test suite (fresh run, this session, after fix cycle 2)
```
$ pnpm -r test
packages/core:        7/7   pass
packages/ai:          56/56 pass   (+2 for the speaker-label guard, was 54)
packages/index:       25/25 pass
packages/ask:         30/30 pass
packages/ingest:      34/34 pass
packages/meeting-bot: 40/40 pass
apps/api:             44/44 pass
apps/web:              17/17 pass
Total: 253 tests, 253 pass, 0 fail.
$ echo $?
0
```

### Structure lint (fresh run)
```
$ pnpm lint:structure
lint-loc: OK (179 file(s) within budget)
lint-dirsize: OK (70 dir(s) within budget)
lint-root: OK (15 loose root file(s), 1 gitignored excluded)
lint-dupes: OK (218 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (882 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration
✔ no dependency violations found (200 modules, 559 dependencies cruised)
```

## How to verify (for the checker)
1. Read `packages/ai/src/stt/gemini-file-upload.ts`'s `DIARIZE_PROMPT` — confirm the frequent-
   marker instruction is present.
2. Read `scripts/transcribe-long-session.mjs` — confirm `MIN_RECURSE_SECONDS = 20`.
3. Run a fresh pymongo query (own script, not copy-pasted from this manifest) iterating every
   real `sessions._id` and counting `turns` with `speakerRef: "unknown"` — confirm zero across
   all 23.
4. Spot-check `data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json` (or
   any of the 3 touched sessions) — confirm real speaker labels, real text content, no
   placeholder markers.
5. `pnpm -r test` — expect exit 0, 251/251. `pnpm lint:structure` — expect exit 0.
6. Confirm `TASKS.md`'s T-003 line says `done`.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
