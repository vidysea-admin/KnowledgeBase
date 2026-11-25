# Checkpoint (coordinator B): f1-whole-turn-hydration

Cycle: 0 | Verdict: qa/verdicts/f1-whole-turn-hydration.b.md | Policy: proportional-verification/2026-11-22.19

## Identity
- Bound root: D:/KnowledgeBase/.worktrees/f1-whole-turn-hydration, branch wave/f1-whole-turn-hydration
- Code f8565d3c, manifest 33e963a7, base f7eb479f. Diff f7eb479f..f8565d3c excluding qa/: 10 files, +386/-64.
- Contract qa/contracts/ask-condition-fidelity.md byte-identical to 85625836.
- Ledger qa/issues.F1WAIVERCONDITION.jsonl sha256 166085f8...3ef9 (matches manifest).
- Environment: Windows 11, node v24.13.1, python 3.11, pnpm lock sha256 prefix ad5517c3ca7464c1. No network, no model call, no db server, no .env read.
- Test runner for every row: `TSX_DISABLE_CACHE=1 timeout 300 node --import tsx --test --test-name-pattern=<pat> <files>`; one process at a time.

## Commands and result per check (bound tree)
| Check | Scope | Result |
|---|---|---|
| C1 `\[F1B-C1\]` | corpus + lexical test files | 7/7 |
| C2 | same | 3/3 |
| C3 | corpus + packages/ask condition-fidelity | 12/12, fast 14/14, deep 14/14 |
| C4 | same | 3/3 |
| C5 | same | 2/2, 14/14 both modes |
| I1 | lexical test | 2/2 |
| I2 | 29 affected files, one process per file | rc=0 each; 363 tests, 362 pass, 1 skipped, 0 fail (composition.test.ts rewrote rows.json, restored with git checkout, tree clean) |
| extra consumers | ask-tenant-hostile 70, ask-tenant-isolation 17, external-model-hydrators 26, graph-context 10, native-source-context 7, source-context-quarantine 3, routes/ask 7, packages/ask bounded-evidence + native-source-context 16 | all green |
| typecheck | tsc --noEmit -p packages/ask and apps/api | rc=0 both |
| lint-loc | node scripts/lint-loc.mjs | only answer-evidence.ts 535 (baseline 534) |
| I4 | grep added test lines | 0 matches |

## Throwaway copy (outside bound root)
Built by `git ls-files | tar` plus tracked data/toc-migrated/2026-07-03-inside-the-uc-session/*; node_modules via 69 junctions. Red-first and mutants ran there only. Cleanup: 69 junctions unlinked (link only), 0 reparse points left, copy and byte backups deleted, bound node_modules intact, `git status --short` empty before writing these files.

## Red-first (base sources, copy)
25 tests: 8 pass, 17 fail; fast probes 0/14, deep 14/14. Restored; hashes equal to bound.

## Mutants (copy; green-before / red-after; restored; fidelity copy==bound==HEAD)
| ID | File | Edit | Before | After | Result |
|---|---|---|---|---|---|
| M1-C1 | apps/api/src/ask/source-context.ts | `fits` always true | 7 pass | 4 fail | killed |
| M2-C2 | same | drop liveTurns from return | 3 pass | 2 fail | killed |
| M3-C3 | packages/ask/src/ask-graph.ts | skip judgeCitedTurns | 12 pass | 4 fail | killed |
| M4-C4 | apps/api/src/answer-policy/answer-evidence.ts | remove marker skip | 3 pass | 1 fail | killed |
| M5-C5 | packages/ask/src/answer.ts | conditionHold replaced by null | 2 pass | 2 fail | killed (substitute for the corpus-JSON cell, which is outside "What changed") |
| M6-I1 | apps/api/src/ask/source-context.ts | cited = effective | 2 pass | 1 fail | killed |
| M7-I3 | packages/ask/src/source-context.ts | remove over-cap relaxation | 7 pass | 4 fail | killed |
| M10 | packages/ask/src/answer.ts | `!live ? result` to `false ? result` | 12 pass | 2 fail | killed |
| M9 | packages/ask/src/ask-v2.ts | re-add `!web.length &&` to fast gate | 23 pass | 23 pass | SURVIVED (low test gap, PROPOSED-ISSUE in verdict) |

A first fidelity check inside the mutation script was wrong (bad `$2` after `shift`); it was redone by hand with sha256 and `git hash-object` against `git rev-parse HEAD:<f>` for all 10 touched files, all equal.

## Not done / out of scope
- Did not read coordinator A's verdict or checkpoint (commit cb3c9957 is in the branch history; those two files were not opened, diffed or shown).
- Consent paths untouched (D-210).
- Manifest status not flipped; no issue rows written.
