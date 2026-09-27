# Manifest — transcription-empty-result-guard (T-003 critical fix)

Status: checked-PASS (Cycle checked: 1, verdict `qa/verdicts/transcription-empty-result-guard.md`)
Contract: `qa/contracts/transcription-empty-result-guard.md`

## The real incident (actual console output from the live batch run)

```
=== [1/22] 2026-04-21-visa-blueprint-part2-italy-france-nz ===
uploading 21st-April-Visa-Blueprint-Part2-Italy-France-NZ.m4a (62.7 MB, audio/mp4)...
uploaded: files/5kbaj61grx49
poll 1/20: ACTIVE
transcribing...
got 0 turns. usage: inputTokens=151828 outputTokens=1
wrote 0 real diarized turns -> data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json
  (replaced 107 placeholder turn(s))
--- 2026-04-21-visa-blueprint-part2-italy-france-nz: OK (533.6s) ---
```

Caught immediately when reviewing progress mid-batch (not after the fact). The batch process
(`transcribe-all-toc-sessions.mjs`, `TaskStop`) was stopped before session 3 could write
anything, then the affected file was restored:

```
$ git status --short data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json
 M data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json
$ git checkout -- data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json
$ python3 -c "import json; d=json.load(open('...turns.json', encoding='utf-8')); print(len(d), d[0]['speakerRef'])"
107 turns restored, first speakerRef: unknown
```

No data was actually lost in the repo (git history had the pre-incident committed state), but
this was one `git commit` away from being a silent, permanent loss on the next batch run, or on a
session whose "before" state was itself already real (irreversibly overwriting real transcribed
content with nothing).

**Session 2 in the same batch run** (`2026-05-08-funding-dreams-loans-forex`) succeeded
genuinely — 83 real diarized turns, spot-checked and confirmed matching known real speakers
(Nikhil, Dev, Ritu, Shweta — matching the session's actual FRR Forex/HDFC Credila panel).
**This result is kept**, not reverted — it's real, correct data.

## What changed

1. **`packages/ai/src/stt/gemini-file-upload.ts`** — `transcribeUploadedAudio` now throws when
   the extracted text is empty, citing `finishReason`/`blockReason` from the real response.
2. **`scripts/transcribe-toc-session.mjs`** — independent second guard: refuses to write an
   empty turns array over existing non-empty turns, regardless of why.
3. **`packages/ai/src/stt/gemini-file-upload.test.ts`** — 2 new tests reproducing the exact real
   failure shape (`finishReason: "MAX_TOKENS"`, empty parts) and a `blockReason: "SAFETY"` case.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/ai test
tests 35 / pass 35 / fail 0   (33 pre-existing + 2 new)

$ pnpm -r test
core 7 / ai 35 / index 19 / ingest 34 / ask 30 / meeting-bot 40 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (147 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (207 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (733 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (155 modules, 437 dependencies cruised)
```

## Files touched
- `packages/ai/src/stt/gemini-file-upload.ts` (empty-response guard)
- `packages/ai/src/stt/gemini-file-upload.test.ts` (2 new tests)
- `scripts/transcribe-toc-session.mjs` (second independent guard)
- `data/toc-migrated/2026-04-21-visa-blueprint-part2-italy-france-nz/turns.json` (restored to
  pre-incident state, no net change vs. last commit)
- `data/toc-migrated/2026-05-08-funding-dreams-loans-forex/turns.json` (real, kept — 83 genuine
  diarized turns)
- `qa/contracts/transcription-empty-result-guard.md` (new contract, maker-drafted)

## Follow-up (disclosed, not this unit)
Large/long audio files (60MB+) may need chunking or a different call strategy — the root cause of
WHY the 62.7MB file produced no usable output is not solved here, only made loud instead of
silent. The batch scale-up (remaining 20 sessions + a retry of this one) resumes after this fix
lands, now safe against this failure mode.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
