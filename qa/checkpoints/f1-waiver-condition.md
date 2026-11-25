# Checkpoint — f1-waiver-condition (cycle 0, coordinator A, single check)
Verdict: PASS (see qa/verdicts/f1-waiver-condition.md). Nothing remaining.
Environment: node v24.13.1, tsx 4.23.13 (worktree pnpm store), Windows; head 16e2b75a, code 289a2420, base a9bbeb98, lockfile unchanged in diff.

## Completed checks (evidence identity)
| Check | Command / scope | Code hashes | Result |
|---|---|---|---|
| Step 3 affected set | `TSX_DISABLE_CACHE=1 node --import tsx --test <27 files of Pre-check[F1-I1]>` in the worktree root, one process | answer.ts d6a2eb40, ask-v2.ts 5e0b1460, answer-evidence.ts at 289a2420, corpus.json/test at 289a2420 | 326 tests, 325 pass, 0 fail, 1 skip |
| Extra reference hits | same runner, `ask-web-fallback.test.ts`, `activity-health/router.test.ts`, `grounded-postprocessing/visibility.test.ts` | same | 24 tests, 23 pass, 1 baseline red (router.test.ts, baseline-reds.md line 11, no .venv python) |
| Falsification rows C1-C5 | per-row copy of `git archive HEAD` (apps/api packages schema contracts config migrations data/toc-migrated/2026-07-03-inside-the-uc-session) with own @lkb junctions; `timeout 300`; one `--test-name-pattern` node per row | restored blobs: ask-v2.ts 5e0b1460, answer.ts d6a2eb40 (equal to `git rev-parse HEAD:<file>`) | green before 5/5, red after 5/5 at the named assertion |
| Corpus compare | corpus.json vs cb83c010 log (sha256 = name) lines 1739-1830, 1878-1890, 2010-2018 and f7db56df log (sha256 = name) lines 2138-2166 | corpus pin dff25270... | all recorded inputs equal |
| Contract blob | worktree vs `c32c8bbc` in main | 590329ae | equal |
| Route | `tick.mjs --route a9bbeb98..HEAD --root <bound>` | | floor L, dual false |

Scratch copies left in place (junction-bearing, not deleted): scratchpad `row1`..`row5` under C:/Users/Lenovo/AppData/Local/Temp/claude/6e9d41101c3c5a5b/3fb8d78b-cac7-406e-9e13-fe76f3d5cd42/scratchpad. No process was started that outlives its command; no PID was killed.
