# Verdict: w23-coreq

VERDICT: FAIL
Cycle checked: 0
Reviewed SHA: 4d8dbbedc9b70253e9ab9de570500a803c6ab324
Base: 3c99337f

## Findings

1. HIGH, acceptance violation (ISS-SCHEMAEDIT-001): `orphanGenerated` is exported but never called. `git show 4d8dbbed:scripts/gen-types.mjs | grep -n orphanGenerated` gives only line 76 (the definition), and `unlinkSync` is imported (line 11) but never used. `main()` (scripts/gen-types.mjs:85-113) is byte-identical to base. So `--check` does NOT fail on orphans and write mode does NOT delete them. The manifest and brief both claim otherwise.
   Probe (copy of the script in a scratch dir inside the lane, since removed; real schema/; a hand-placed `generated/gone.ts` carrying the banner and no schema): write mode exit 0 and `gone.ts` still present; `--check` exit 0 printing `OK: 46 generated type file(s) + index.ts match schema/`. Required behaviour was exit 1 and deletion respectively.
   Fix: in `main()`, after the drift loop, call `orphanGenerated(OUT_DIR, names)`. In CHECK mode print `ORPHAN: <rel path>`, count it into the failure and exit 1. In write mode `unlinkSync` each result. Because `orphanGenerated` only reads names from `readdirSync(outDir)` and joins them to `outDir`, traversal is not possible by construction, and it matches the banner string anywhere in the file (not strictly a leading banner; consider `startsWith` after the `/* eslint-disable */` line). Symlinks/junctions: `readdirSync` plus `unlinkSync` removes the link entry, not its target.
2. HIGH, test gap: no test covers the main() orphan path (the only tests are the pure helper and `--check` on the real tree, which passes vacuously). A mutation of the loop is moot because the loop does not exist; the existing tests would not catch its absence, which is exactly what happened. Fix: add a spawn test that copies the script plus a minimal schema/generated tree to a temp dir and asserts `--check` exit 1 on an orphan and write mode removes it while leaving a banner-less hand file.
3. Maker's mutation M1 only exercises the pure helper; it does not support the claim in the manifest title.

## Verified
- Deletion safety (write mode): not applicable as shipped, nothing is deleted. Banner filter in the helper: tested by test 1 (pass).
- Real tree: `node scripts/gen-types.mjs --check` exit 0, `OK: 46 generated type file(s)`.
- `node --test --test-force-exit scripts/gen-types.test.mjs`: pass 2, fail 0 (both vacuous for the wiring).
- Own mutation of main-loop: not possible (nothing to mutate); absence demonstrated by the probe above instead. No candidate file touched; `git hash-object` of scripts/gen-types.mjs (c356642d...) and gen-types.test.mjs (eeb35fd4...) equal `4d8dbbed:` blobs.
- ISS-JOBQUEUE-002 claim: `queue-lock.ts` exists at base 3c99337f; the cited PASS verdict qa/verdicts/iss-jobqueue-002-lost-update.md is PASS cycle 0 and states the lost-update half is met and the row stays `open-before-wiring` (pruning half ISS-JOBQLOST-001 verified; takeover ISS-JOBQLOST-003 and EPERM -004 follow-ups). Recorded repro replayed via `file-job-queue.lost-update.test.ts` run 15 times (timeout 600 each): 15/15 exit 0, pass 6 fail 0 each. The lost-update half is confirmed fixed at base. The row's own status is `open-before-wiring` by design (guards wiring, not a defect while unwired); it may be closed only if the owner accepts the lost-update + prune half as sufficient and notes ISS-JOBQLOST-003 (stall >30 s, verified status in ledger). I do not flip it here: no code in this unit changed it.
- Lint: `node scripts/lint-loc.mjs --all` (alone, timeout 600) exit 1. 9 of 10 stages exit 0 (loc, dirsize, root, dupes, migrations, codex-hooks, snapshot, lint-tests, tracker). Stage `dependencies` exit 1362: 1362 errors, 1360 of them `no-unresolvable-workspace-import` (apps/api importing express, mongodb, @lkb/*) which is a lane node_modules environment gap, plus 2 other error lines not examined. Not attributable to this unit (no import changes); not accepted as a pass either: the dependencies stage is unverified.

## Ledger rows
- ISS-SCHEMAEDIT-001: do NOT flip (the orphan check is not wired).
- ISS-JOBQUEUE-002: no change in this unit; do not flip on this verdict.

ISSUES-WRITTEN: none
Not verified: dependencies lint stage in a fully installed tree; symlink/junction deletion behaviour (no deletion code exists).
