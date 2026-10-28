# Verdict — w7-loc-trim
**Cycle checked:** 0
**Checker:** A (fresh context, read-only toward product code)
**Policy-Version:** proportional-verification/2026-10-19.17
**Checked state:** ac6cf75c (code) + e84721fb (manifest only, qa/ only)
**VERDICT: PASS**

## Criteria
- **C1 PASS** Behaviour unchanged. Diff ac4e86c6..ac6cf75c: the removed block in record-finalize.ts and the added block in record-finalize-defaults.ts are line-for-line identical except `export` added on five functions; constants HERE/REPO_ROOT retained in both files (same dir depth). Exported type SealedCaptureProviderInput is re-exported from record-finalize.ts via `export type {...} from`, so the public surface is unchanged. node:child_process/fs imports in record-finalize.ts are still used (lines 107, 180, 222, 245). The :130 private-window `.playable.webm` guard and the consent path are untouched. Independently run, one file per invocation, under timeout: record-commands.test.ts 22/22, finalize-original-eof.test.mjs 7/7, lean-finalize-alert.test.ts 6/6, audio-watchdog.test.ts 18/18; `npx tsc --noEmit` in packages/meeting-bot exit 0.
- **C2 PASS** `pnpm lint:structure` run independently: "lint:structure: OK (10 stages, 0 failed)", stage loc green; structure.config.json not in the diff (diff touches only the two source files and the manifest).

## Falsification (copy src-chk inside packages/meeting-bot, deleted after; no node_modules in it)
- (a) moved code: validateTranscript `turns.length === 0` -> `=== 99` : record-commands.test.ts 21 pass / 1 fail (red as expected).
- (b) kept code: :130 guard `consent.privateWindows.length&&` -> `!consent...`: finalize-original-eof.test.mjs 5 pass / 2 fail (red as expected).
- Per-mutation byte backup restored with cmp; bound tree never mutated: git hash-object of record-finalize.ts = 885a32b1..., record-finalize-defaults.ts = 59bbd10c..., both equal HEAD blobs; `git status` shows no tracked modifications.

## Adversarial hunt (auth/tenancy/data-write)
The diff is a verbatim move; no auth, tenancy or write logic changed. The private-window raw-original guard and tenant/session owner plumbing remain in record-finalize.ts. The moved defaultRunTranscription still takes the sealed input over stdin (fd 0) with the same argv. No new exports leak beyond the module's own helpers (five default I/O functions now exported from a sibling file, only imported by record-finalize.ts). No bypass found.

## Notes (not backlog)
- Capture dir is at 30 loose files (budget 30): any further file added there needs a trim or a subdirectory. Informational.

ISSUES-WRITTEN: none
PROPOSED-ISSUE: none

Metrics: check_min=14 tests=53/53 mutations=2 (both red) suite_runs=0 policy=proportional-verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
