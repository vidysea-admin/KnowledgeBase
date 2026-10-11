# Manifest — t048-transcription-path-chooser
**Status:** checked-PASS (Checked: qa/verdicts/t048-transcription-path-chooser.md, cycle 0, a0082bc; pure chooser, unwired)
**Fix cycle:** 0
**Tier:** 3 (roadmap task). First slice of T-048. T-048 stays OPEN.
**Goal task:** T-048 "Make gemini-3.8-flash single-call the default for recordings <= ~90 min; keep chunking as fallback" (TASKS.md:140; .goal/goal.json:962-969)
**Severity / ceremony:** no auth, tenancy or data write. Pure function, nothing wired, no I/O.

## Scope
New `packages/ai/src/stt/transcription-plan.ts` (159 non-blank lines) and `transcription-plan.test.ts` (148). Exports `chooseTranscriptionPath(input)`, `TODAY_THRESHOLDS`, `T048_THRESHOLDS`, types. NOT exported from `packages/ai/src/index.ts` (untouched). No D-119 reserved file touched. `lint-dirsize` is clean for packages/ai/src/stt; it reports one pre-existing, unrelated violation (`packages/index/src/pipeline: 34 files`).

## Numbers and sources
| Value | Today | T-048 | Source |
|---|---|---|---|
| maxSingleSeconds | 2400 | 5400 | today: scripts/watch/lib/ingest-chain.mjs:26 (`40 * 60`), rule at :219 (`> threshold` -> long). T-048: "<= ~90 min" TASKS.md:140 |
| singleInclusive | true | true | today: `>` at ingest-chain.mjs:219, so exactly 40 min is single. T-048: "<=" TASKS.md:140 |
| chunkSeconds | 2400 | 2400 | scripts/transcribe-long-session.mjs:43; D-028 "Chunking stays as the fallback" (docs/DECISIONS.md:366) |
| overlapSeconds | 0 | 0 | packages/ai/src/stt/chunk-audio.ts:17 ("Non-overlapping chunks"); no overlap is specified for T-048 |
| singleCallModels | null (any) | ["gemini-3.8-flash"] | today: routing is duration-only (ingest-chain.mjs:219). T-048: TASKS.md:140, D-028 |
| maxSingleBytes | null | null | **ASSUMPTION**: no per-model byte limit is recorded anywhere in code or docs |
| minTailSeconds | 0 | 60 | today 0 = chunk-audio.ts keeps any tail (:23-25). T-048 60: **ASSUMPTION** |
| maxChunks | 1000 | 1000 | **ASSUMPTION** (no bound exists in code) |

Owner items: (1) is "~90" exactly 90 min; (2) any byte/token limit for gemini-3.8-flash (D-028 recorded one call with 92,759 in / 13,160 out tokens on a 61.8 min file, no limit); (3) minTail and maxChunks; (4) the default model is still gemini-3.5-flash (packages/ai/src/stt/gemini-file-upload.ts:31), unchanged.

## Decisions
- Boundary: INCLUSIVE ("up to 90 minutes"); `singleInclusive` is a threshold field so exclusive is expressible and tested. 90 min is single; 5400.001 s is chunked.
- Invalid/unknown/zero/negative/NaN/Infinity duration, invalid size, invalid thresholds -> chunked with typed reason and `chunks: []` (the caller must probe the real duration). Divergence from today by design: today a null duration takes the short single path (ingest-chain.mjs:219); here it is chunked.
- Unknown file size with a byte limit set passes (size is optional); invalid size is chunked.
- Tiny tail: if the final chunk adds fewer than minTailSeconds new seconds it merges into the previous chunk, so a merged chunk can exceed chunkSeconds by less than minTailSeconds. A tail of exactly minTail is kept.
- Chunk count above maxChunks -> chunked, `chunks: []`, reason `exceeds-max-chunks`.
- `single.fallback` is the chunked plan for the same duration, reason `single-call-failed`.

## Parity
Table 30, 39.9, 40, 40.1, 60, 89, 90, 91, 120, 240 min: decision under `TODAY_THRESHOLDS` equals the rule replicated in the test from ingest-chain.mjs:26/:219 (replicated, not imported: that module has fs/child_process side effects). Also, today's chunk list equals `computeChunkBoundaries(d, 2400)` (chunk-audio.ts) for 41/80/100/120 min.

## Evidence (run in the worktree)
Test: `node --test --import tsx src/stt/transcription-plan.test.ts` (packages/ai): `ℹ tests 15 / ℹ pass 15 / ℹ fail 0`. Includes seeded 500-duration property test (coverage [0,d], overlap 30 s, length bound, tail, expected count).
Typecheck: `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in packages/ai: exit 0, no output.

## Mutations (harness inside the worktree, deleted before commit; per-mutation byte backup, restore in finally, 300 s timeout; hash before == after)
All 8 killed: boundary-inclusive-flipped (boundary x2, parity); invalid-duration-single (invalid durations); size-check-dropped (size test); overlap-ignored (property); last-chunk-gap, last chunk end d-1 (acceptance, parity-chunks); fallback-omitted (acceptance, fallback test); tail-merge-dropped (property, tiny tail); model-check-dropped (model test, property). An earlier "last-chunk-gap" candidate survived because it was an equivalent mutant (redundant `end = duration` assignment); that dead line was removed from the source and the mutation re-aimed.

## NOT done
No wiring (ingest-chain.mjs and transcribe-long-session.mjs are D-119 reserved / untouched); no model call; no live re-run comparison of a TOC session; default model unchanged; T-048 remains open; no index.ts export.
