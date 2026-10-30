# Verdict - tooling-honest-lint

**Cycle checked:** 0
**Verdict:** PASS
**Commits:** 2b42766a (code), 6f345ced (manifest, HEAD); base 338d2178
**Policy-Version:** proportional-verification/2026-10-19.17
**Metrics:** check_min=35 mutants=5 (checker-run, in a git-archive copy) suite_runs=0 policy=proportional-verification/2026-10-19.17 cycle=0

## Evidence (checker re-ran, one test file per invocation, under timeout)
- node --test scripts/lint.test.mjs: 20 pass / 0 fail (C1, C2).
- node --test scripts/lib/tracker-audit.test.mjs: 22 pass / 0 fail (C3, C4).
- node --test --test-name-pattern="duplicate ledger|CLI gate" scripts/qa/ledger-union.test.mjs: 7 pass / 0 fail (default reader still throws; spawned CLI with --gate g1 still carries G6).
- node scripts/snapshot.mjs --check: OK, 172 lines (C5). The HEAD-vs-base diff of docs/SNAPSHOT.md is the regenerated content (D-173 text, Q5, HLD/LLD pointer), not hand edits.
- node scripts/qa/ledger-alloc-cli.mjs verify: rows=1024 findings=0 (real union has no duplicates).
- node scripts/tracker-audit.mjs --gate g1,g4,g5 and --json run clean of G6 on the real ledger; G6 is not in the advisory set (only G4 is), so it gates.
- Diff identity: ledger-rows.mjs default path unchanged (throw message and return shape); collectDuplicates only adds `duplicates`. The other readLedgerRows callers (ledger-alloc.mjs, tests) use the default and are untouched. filterByGate G6 clause matches only findings starting "G6"; no other gate emits that prefix.

## Falsifications (git-archive copy of HEAD, node_modules junction, per-mutation byte backup, git hash-object == git rev-parse HEAD:<file> after each restore, all OK)
- C1 runAll short-circuit (`if (failed) break;`): both aggregate-gate tests fail (killed).
- C1 package.json lint:structure -> `a && b` chain: the runner-pin test fails, +1 failure vs baseline (killed).
- C2 structure.config.json testPatterns drops `.test.mjs`: the real-config test and the "mjs tests use testMax" test fail (killed).
- C3 G6 `findings.push(` -> `void (`: 2 G6 reporting tests fail (killed).
- C4 filterByGate drops the G6 always-keep clause: the narrowed-gate test fails (killed).
- C5 not mutated by the checker (snapshot --check is a pure line-diff of committed vs regenerated, read at scripts/snapshot.mjs:44-67; it passes at HEAD and the file differs from base, so the pre-fix state was stale). Not a gap that changes the verdict.
- Copy-only baseline artifact: lint.test.mjs shows 2 unrelated failures in the copy (core barrel, import-resolution) because the copy has no workspace; they are identical with and without each mutation and are not in the worktree run (20/20).
- Survivor (equivalent for the audit, noted): `ledger-rows.mjs` default-throw removal (`if (false) throw`) is not caught by tracker-audit.test.mjs, only by the unwired ledger-union.test.mjs (ISS-TOOLING-002, already filed by the maker). Not a new issue.

## Adversarial notes
No auth, tenancy or data-write path is touched (read-only audit; two local ledger rows). Duplicate within one file, duplicate across shard and canonical, and 3-way collisions all report every file:line. A `--gate` selection cannot hide G6. No bypass found.

## Criteria
C1 PASS, C2 PASS, C3 PASS, C4 PASS, C5 PASS.

ISSUES-WRITTEN: none
