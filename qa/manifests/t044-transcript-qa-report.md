# t044-transcript-qa-report

Status: ready-for-check
Fix cycle: 0
Priority tier: 3 — next unblocked roadmap task (T-044)
Security class: none (reads a local turns file, writes a local report JSON; no auth/tenancy/DB writes)
Lane: T044W (no issues filed; `qa/issues.t044w.jsonl` not created)

## Round cap

PASSed verdicts naming the transcript-QA clamp seam: 1 (`qa/verdicts/t044-transcript-qa-clamp.md`, PASS cycle 1). Cap is 2, so this unit is allowed. A further unit on this seam would be at the cap.

## Roadmap criterion

`docs/meeting-bot-roadmap.md:71`: "| T-044 | **Transcript QA**: fix timestamp drift (clamp + validate against the audio duration), hallucination spot-check | no turn ends past the audio duration |"

## Scope

Operator-facing QA report over an existing turns file, reusing `clampAndValidateTurns` (no clamp logic duplicated).

This unit does NOT wire the clamp into the transcription driver. `scripts/transcribe-long-session.mjs`, `gemini-file-upload.ts`, `scripts/upload/` and `scripts/lib/transcript-provenance*` are reserved by D-119 and were not touched. T-044 stays in progress.

Base note: this worktree branch was behind the clamp commits, so it was fast-forwarded (`git merge --ff-only codex/machine-migration-2026-10-09`) to obtain `transcript-qa.ts`; no content was altered.

## Files added

- `packages/ai/src/stt/transcript-qa-report.ts` — `buildTranscriptQaReport(parsed, durationSec)` (pure) and `writeTranscriptQaReport({inputPath, durationSec, outPath?, overwrite?})` (only I/O).
- `packages/ai/src/stt/transcript-qa-report.test.ts` — 11 node:test cases.
- `scripts/qa/transcript-qa-report.ts` — thin runner: `node --import tsx scripts/qa/transcript-qa-report.ts <turns.json> <durationSec> [--out p] [--overwrite]`. Exit 0 PASS, 1 FAIL verdict, 2 usage/refusal. `scripts/qa/` had 4 files (budget 30); the `scripts/` root was not touched.

No existing file edited.

## Report shape

`{ verdict: "PASS"|"FAIL", failReasons[], durationSec|null, turnsIn, turnsOut, turnsClamped[{index,tStartBefore,tStartAfter,tEndBefore,tEndAfter}], turnsDropped[{index,reason,suspectedHallucination}], remainingViolations[], hallucination{pastEndIndices,repeatThreshold,repeatedRuns}|null, qa (full clamp report)|null }`

Default output: `<input minus .json>.qa-report.json` beside the input.

## Fail-closed behaviour

- FAIL: duration missing / non-number / NaN / Infinity / <= 0; top-level not an array or `{turns:[]}`; any non-object turn; any turn dropped for invalid timing; any output turn still violating the criterion; unreadable file; empty file; malformed JSON.
- Dropping turns that start at/after the duration is the clamp's documented behaviour and is reported (with hallucination flag), not a FAIL.
- Input file is only read. Default write flag is `wx`; existing report is refused (exit 2) unless `--overwrite`; report path equal to input path is refused.

## Evidence

Node from the codex runtime; run from `...\agent-a64dd29e6b3ce84c3\packages\ai`. `node_modules` in this worktree are junctions to the main tree (gitignored); `@lkb/*` resolve to main-tree source, only `packages/ai` changed.

`node --test --import tsx src/stt/transcript-qa-report.test.ts` -> tests 11, pass 11, fail 0.
`node --test --import tsx src/stt/transcript-qa.test.ts` -> tests 16, pass 16, fail 0.
`node <root>\node_modules\typescript\lib\tsc.js --noEmit -p tsconfig.json` (packages/ai) -> no output, exit 0.
`node scripts/lint-dirsize.mjs` -> `lint-dirsize: OK (109 dir(s) within budget)`.

Coverage: past-duration ends, exactly-at-duration, start-past-duration drop, negative/zero-length/reversed, index mapping after drops, overlapping turns, missing/zero/negative/NaN/Infinity/string duration, malformed turns and shapes, empty list, empty file, malformed JSON, missing file, input byte-compare unchanged, no overwrite without flag (sentinel preserved), refuse report==input, runner exit codes.

Real sample (copy of `data/toc-migrated/2026-08-27-in-focus-4/turns.json` in a temp dir; repo untouched; SHA-256 of the copy unchanged after both runs). This is the TOC-provided transcript (51 turns, last tEnd 3080 s); the true audio duration is NOT in the repo, so durations are illustrative:
- duration 3080: `PASS in=51 out=51 clamped=0 dropped=0`.
- duration 2900: `PASS in=51 out=40 clamped=1 dropped=11` (turn 39 tEnd 2909 -> 2900; 11 turns starting after 2900 dropped); repeated runs 0, non-monotonic 0.

## Not delivered / unverified

- Not wired into the driver (D-119 hold); no real audio-derived duration source; no run on a genuine Gemini overshoot file (the repo sample does not overshoot).
- No mutation testing (checker's job). No `verify_contracts.py` run. No `qa/contracts/` entry written (forbidden for maker).
- Runner is TypeScript run via tsx; not covered by tsc (outside `packages/ai/tsconfig` include).
- Semantic hallucination detection remains the heuristics of the prior unit.

Status: ready-for-check
Fix cycle: 0
