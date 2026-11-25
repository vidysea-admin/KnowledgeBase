# Checkpoint - f1-whole-turn-hydration, coordinator A (cycle 0)
Evidence identity (every row): code f8565d3c (diff base f7eb479f), tests node --import tsx --test with TSX_DISABLE_CACHE=1, Windows 11, node >=24, lockfile pnpm-lock.yaml at f8565d3c (no dependency change), no config/fixture change, no live service. Attribution: checker A (claude-sonnet-subagent), verdict qa/verdicts/f1-whole-turn-hydration.md.

| Check | Command / scope | Result |
|---|---|---|
| F1B-C1 | `--test-name-pattern='\[F1B-C1\]'` corpus + source-context-lexical (bound tree) | 7 pass 0 fail |
| F1B-C2 | `[F1B-C2]` corpus + condition-fidelity | 3/3; red at base sources 2 of 3 |
| F1B-C3 | `[F1B-C3]` corpus + condition-fidelity | 12/12; probes fast 14/14, deep 14/14; base: fast 0/14, deep 14/14 |
| F1B-C4 | `[F1B-C4]` corpus + condition-fidelity | 3/3 |
| F1B-C5 | `[F1B-C5]` corpus | 2/2; ledger sha256 166085f8... = pin; repro strings verbatim |
| F1B-I1 | `[F1B-I1]` source-context-lexical | 2/2 |
| F1B-I2 | 29 files, one per process (copy; production.test.ts rerun in bound tree) | 363 tests, 362 pass, 1 skipped, 0 fail |
| Extra | 8 reference-hit tenancy/native test files (bound tree) | 153/153 pass |
| Typecheck | tsc --noEmit packages/ask (copy) | exit 0; apps/api: only a copy-missing qa/packets fixture |
| Falsification | M1-M8 in throwaway copy, per-mutation backup, restore verified (cmp + LF-normalised blob hash) | all green-before / red-after / restored |

Not run: full suite (no closed-list trigger at unit time; the 6c step decides under .13-2(a): a tenancy L unit), live retest (launch row G03). Remaining: none.
