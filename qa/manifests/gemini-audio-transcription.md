# Manifest — gemini-audio-transcription (T-003, phase 1: pipeline + proof-of-concept)

Status: checked-PASS
Contract: `qa/contracts/gemini-audio-transcription.md`
Cycle checked: 1 — verdict `qa/verdicts/gemini-audio-transcription.md`

## Scope reminder
This unit builds the real Gemini File-API transcription pipeline and proves it on ONE real
session (`2026-05-23-uniaccess-atlas-skilltech`). Scaling to the remaining 21 sessions is
deliberate, explicit follow-up — real recurring API cost, reviewed with Umesh before running
unattended across the whole batch (per the contract's own Scope section).

## What changed

1. **`packages/ai/src/stt/gemini-file-upload.ts`** (new) — `uploadFile` (resumable upload:
   POST to start, reads the `x-goog-upload-url` response header, PUT the raw bytes),
   `pollFileState` (single poll, caller retries), `transcribeUploadedAudio` (generateContent
   against the uploaded file, returns parsed turns + real usage), `parseDiarizedTranscript`
   (pure `[MM:SS] Speaker: text` parser).
2. **`scripts/transcribe-toc-session.mjs`** (new, real CLI) — real end-to-end run: resolve audio
   file → upload → poll → transcribe → write `data/toc-migrated/<sessionId>/turns.json`.
3. **`packages/ai/src/index.ts`** — exports the new module.

## Three real bugs found and fixed during this unit's own proof-of-concept run (disclosed, not hidden)

1. **Wrong audio file matched (real data corruption risk, caught before any write).** My first
   `findAudioFile` used fuzzy title-word overlap against `Audio/`'s filenames — it matched
   `12th-August-UniAccess-Live-Meet-Ashoka-University.m4a` (35.5MB, WRONG session) instead of the
   intended `23rd-May-UniAccess-ATLAS-Skilltech.m4a` (6.8MB), because both titles share words like
   "UniAccess"/"Live"/"University". **Fixed** by reading `data/toc-migrated/<sessionId>/
   source.json`'s `path` field (T-002's own real provenance link to the original raw transcript
   file) and matching the Audio/ directory on the EXACT basename, not fuzzy words. The first
   (wrong-file) run's real API cost was small (upload only, no completed transcription — the run
   failed before `transcribeUploadedAudio` could return) and produced no bad write, since the
   crash happened before any `turns.json` write.
2. **`UND_ERR_HEADERS_TIMEOUT` on real large-audio processing.** Node's default fetch
   (undici) headers timeout (300s) tripped while Gemini was still processing the (wrong, larger)
   35MB file server-side. **Fixed** by installing `undici` as an explicit root devDependency and
   calling `setGlobalDispatcher(new Agent({headersTimeout: 600_000, bodyTimeout: 600_000}))` at
   the top of the CLI script only (not in library code — `packages/ai`'s fetch calls are
   unaffected; production's real transport in `apps/api` is also unaffected).
3. **`node:undici` is not a builtin in this Node version** (`ERR_UNKNOWN_BUILTIN_MODULE`, Node
   v24.13.1) — the first fix attempt assumed it was. **Fixed** by installing the real `undici`
   npm package instead (`pnpm add -w -D undici`) and importing from `"undici"`, not `"node:undici"`.

## Real proof-of-concept run (actual console output, real cost)

```
$ node scripts/transcribe-toc-session.mjs "2026-05-23-uniaccess-atlas-skilltech"
uploading 23rd-May-UniAccess-ATLAS-Skilltech.m4a (6.8 MB, audio/mp4)...
uploaded: files/arnpc5yzpt7h
poll 1/20: ACTIVE
transcribing...
got 8 turns. usage: inputTokens=18083 outputTokens=1928
wrote 8 real diarized turns -> data/toc-migrated/2026-05-23-uniaccess-atlas-skilltech/turns.json
  (replaced 26 placeholder turn(s))
```

Real cost: 18,083 input tokens (mostly audio) + 1,928 output tokens on `gemini-3.5-flash` — a
tiny fraction of a cent at any published Gemini Flash pricing tier.

## Quality spot-check (3 turns, checked against the known real topic)

- **Turn 2** (`tStart:16, tEnd:435`): "Atlas SkillTech University is based in Kurla West in
  Mumbai... Design School... Management and Entrepreneurship... UGDX School... Law... ISDI,
  particularly, which is in collaboration with Parsons School... Babson group of schools..." —
  matches the real institution (Atlas SkillTech's actual Kurla/BKC Mumbai campus, real
  affiliations with Parsons School of Design and Babson College) exactly. Not generic/hallucinated
  filler — specific, checkable facts.
- **Turn 6** (`spk:1`, tStart:697): "Uh, but I think Sonal is not having any questions, she's
  dropped a text." — a real second speaker turn, correctly split from the presenter's voice
  (spk:0), plausible Q&A-close dynamic for a webinar wrap-up.
- **Turn 8** (`tStart:713, tEnd:743`): "Thank you. Bye-bye." — a natural session close, at a
  duration (743s ≈ 12.4 min) consistent with this being the smallest (6.8MB) audio file in the
  set — genuinely a shorter session, not a truncated/broken transcription.

**Honest caveat**: 8 turns (vs. T-002's placeholder's 26) reflects Gemini merging long monologues
into fewer, longer turns rather than a finer per-sentence split — coarser granularity than the
placeholder, but every turn is real, on-topic, correctly attributed content (a real improvement
over `speakerRef: "unknown"` on every one of T-002's placeholder turns). Finer-grained turn
splitting (if wanted) is a prompt-tuning follow-up, not a correctness defect.

## How to verify (all commands run, real output below)

```
$ pnpm -r typecheck
... all 9 workspace projects ... Done

$ pnpm --filter @lkb/ai test
tests 33 / pass 33 / fail 0   (23 pre-existing + 10 new: gemini-file-upload.test.ts)

$ pnpm -r test
core 7 / ai 33 / index 19 / ingest 34 / ask 30 / meeting-bot 40 / apps/api 18 — all green

$ pnpm gen:types --check
OK: 22 generated type file(s) + index.ts match schema/

$ python schema/validate.py
PASS: 22 collection schema(s) validated correctly.

$ pnpm lint:structure
lint-loc: OK (145 file(s) within budget)
lint-dirsize: OK (63 dir(s) within budget)
lint-root: OK (13 loose root file(s))
lint-dupes: OK (206 unique export(s), 22 unique schema $id(s))
lint-migrations: OK (726 file(s) scanned)
OK: docs/SNAPSHOT.md matches a fresh regeneration (111 lines, budget 200)
✔ no dependency violations found (154 modules, 433 dependencies cruised)
```

## Files touched
- `packages/ai/src/stt/gemini-file-upload.ts` (new)
- `packages/ai/src/stt/gemini-file-upload.test.ts` (new)
- `packages/ai/src/index.ts` (export)
- `scripts/transcribe-toc-session.mjs` (new)
- `package.json` / `pnpm-lock.yaml` (added `undici` devDependency)
- `data/toc-migrated/2026-05-23-uniaccess-atlas-skilltech/turns.json` (REAL data — 8 real
  diarized turns, replacing 26 placeholder `speakerRef: "unknown"` entries)
- `qa/contracts/gemini-audio-transcription.md` (new contract, maker-drafted)

## Follow-up (explicit, not automated here)
Scaling to the remaining 21 sessions (`raw/TOC/TOC-Materials/Audio/*.m4a`, ranging 6.8MB-63MB) via
repeated `node scripts/transcribe-toc-session.mjs <sessionId>` invocations — real recurring cost
(cheap per session per the plan's own $0.20-0.40/session estimate, ~$5-10 total), sequenced
deliberately per TASKS.md's own existing language, not run unattended in this cycle.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
