# Manifest — w7-loc-trim
**Contract:** none (repair unit for the 6c pre-push RED, qa/verdicts/prepush-6c-2026-10-28-r5.md; no new behaviour, so no contract file; the maker never edits qa/contracts/)
**Goal task:** none
**Date:** 2026-10-28
**Status:** ready-for-check
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no
**Persona walk:** skip (no screen, flow or user type; pure refactor)
**Issues addressed:** none (pre-push RED: lint:structure stage loc, packages/meeting-bot/src/capture/record-finalize.ts:304, budget 300; owner commit 16fa9991)
**Executor:** claude-opus-subagent
**Executor rationale:** one mechanical move of a cohesive helper group; no external executor was worthy.

## Acceptance criteria (ids used below)
- **C1** behaviour unchanged: the moved helpers are byte-identical, exported names and signatures of record-finalize.ts are unchanged, the record-finalize and record-commands tests stay green.
- **C2** `pnpm lint:structure` is green, in particular stage loc (record-finalize.ts at or under 300 non-blank lines) without editing structure.config.json.

## What changed
- packages/meeting-bot/src/capture/record-finalize.ts: the block formerly at :48-98 (defaultExtractAudio, defaultMeasureVolume, SealedCaptureProviderInput, defaultRunTranscription, defaultProbeMedia, validateTranscript) removed; one import line from ./record-finalize-defaults.js and one line `export type { SealedCaptureProviderInput }` (so the exported type keeps its home name). The name-based guard (`.playable.webm` refusal for private windows, :130 (was :179)) and the whole W7 consent-clock path are untouched. File went from 304 to 255 non-blank lines (lint-loc).
- packages/meeting-bot/src/capture/record-finalize-defaults.ts (new, the only new file; the capture dir goes from 29 to 30 loose files, budget 30, not exceeded): the moved block verbatim plus the `export` keyword on five functions, a header comment, the same HERE/REPO_ROOT constants (same directory depth, so REPO_ROOT resolves identically) and the node imports the block needs.
- NOT touched: structure.config.json, any budget, any test, any contract, docs/SNAPSHOT.md (snapshot --check stays green).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 2 files, 2 criteria, est 15 min - single mechanical move, no behaviour change
Tier: S (pure refactor, no behaviour change)
Base / checked state: unit base ac4e86c6; code commit ac6cf75c (the manifest commit that follows touches only qa/).
Affected tests: the four test files that exercise record-finalize (record-commands, finalize-original-eof, lean-finalize-alert, audio-watchdog), one file per invocation under a timeout; tsc for packages/meeting-bot; lint:structure. No full suite run.
Independent review: NOT run by the builder (the checker owns review).
Known limits: none known. The 6c baseline reds listed in qa/verdicts/prepush-6c-2026-10-28-r5.md are unrelated and untouched.
Falsification (C1), per-mutation with git restore and hash-object == rev-parse HEAD:file check after each: (a) moved code, validateTranscript `turns.length === 0` -> `=== 99`: record-commands.test.ts goes 21 pass / 1 fail ("finalization rejects empty, malformed and out-of-media transcript times ..."); (b) kept code, the :130 guard `consent.privateWindows.length&&` -> `!consent.privateWindows.length&&`: finalize-original-eof.test.mjs goes 5 pass / 2 fail. Both restored; blobs equal HEAD. Done in the worktree after commit, not in a scratch copy, because a copy outside the repo cannot resolve the workspace node_modules without a junction (junction rm hazard in memory).
Tests[C1]: packages/meeting-bot/src/capture/record-commands.test.ts (22 tests); packages/meeting-bot/src/capture/finalize-original-eof.test.mjs (7 tests, includes the "raw original, not a remux" guard); packages/meeting-bot/src/lean-finalize-alert.test.ts (6 tests); packages/meeting-bot/src/capture/audio-watchdog.test.ts (18 tests)
Tests[C2]: none needed — structural; checked by `pnpm lint:structure`
Pre-check[C1]: ac6cf75c cd packages/meeting-bot; node --test --import tsx src/capture/record-commands.test.ts; node --test --import tsx src/capture/finalize-original-eof.test.mjs; node --test --import tsx src/lean-finalize-alert.test.ts; node --test --import tsx src/capture/audio-watchdog.test.ts; npx tsc --noEmit -> exit 0, 22 passed + 7 passed + 6 passed + 18 passed t=4 blobs=packages/meeting-bot/src/capture/record-commands.test.ts:ae255624,packages/meeting-bot/src/capture/finalize-original-eof.test.mjs:6cff8f35
Pre-check[C2]: ac6cf75c pnpm lint:structure (node scripts/lint-loc.mjs --all) -> exit 0, "lint:structure: OK (10 stages, 0 failed)"; lint-loc OK (1818 files within budget)

## Metrics
Metrics: wall_min=20 tests=53/53 (4 files, one per invocation) mutations=2 (both red as expected) suite_runs=0 repeat_runs=0 policy=proportional-verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
