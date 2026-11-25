# Checkpoint — d2-extraction-harness (cycle 0, single check, tier L)
Checker evidence identities (head 8190a0a2, base a9bbeb98, policy proportional-verification/2026-11-22.19). Result of the check: PASS (verdict qa/verdicts/d2-extraction-harness.md).

Code hashes: scripts/eval-extraction.mjs blob 35ceaa99129e9763f5755cc60ac53fde2deaba85; packages/index/src/eval/extraction.ts blob 98fbbf6e13df29f8b3c2e94cccb84ac2c7dac81d; contract blob ed501202923a16942c7fe94db3108f2c347b12c9 (equal to c32c8bbc).
Environment: node v24.13.1, win32, tsx and typescript from the bound worktree node_modules (tsx 4.23.13, typescript 5.9.3). No dependency or lockfile change in the diff.

| Check | Command and scope | Result |
|---|---|---|
| CLI tests | `node --test scripts/eval/gold/eval-extraction.test.mjs` (15 collected) | 15 pass |
| Package tests | `node --test --import tsx` extraction-gold.test.ts, corpus-reconcile.test.ts, topic-run-evidence.test.ts (23 collected) | 23 pass |
| Type check | `tsc --noEmit -p packages/index/tsconfig.json` | exit 0 |
| Dirsize lint | `node scripts/lint-dirsize.mjs` | OK |
| Replay differential | `--input` on a generated 2-claim manifest, base a9bbeb98 script vs HEAD script | byte-identical, equals replay-expected.json |
| CLI probes | six fixture variants, plus approved/real and approved/synthetic bars | exit 0/1/3 as expected (see verdict) |
| Falsifications | 8 rows, one copy each, from `git archive HEAD`, named tests only, `--test-name-pattern` | 8/8 green before, red after, intended assertion |
| Route floor | `tick.mjs --route a9bbeb98..8190a0a2` | floor L, dual false |

Copies left in place (hold junctions to the bound node_modules, so not removed): scratchpad `d2-check/copy-D2H-*` and `d2-check/base` under C:/Users/Lenovo/AppData/Local/Temp/claude/6e9d41101c3c5a5b/3fb8d78b-cac7-406e-9e13-fe76f3d5cd42/scratchpad/. Full-suite trigger: none recorded (no conftest, fixture-loaded-at-runtime, dependency or config change); pre-push 6c is the behaviour-scoped set plus collection.
