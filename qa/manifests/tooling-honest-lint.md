# Manifest — tooling-honest-lint
**Contract:** none specific (QUEUE Wave 1 row, approved by Umesh 2026-10-28; docs/REMAINING-PLAN-2026-10-28.md G-B1 + G-B3)
**Goal task:** none
**Date:** 2026-10-28
**Status:** checked-PASS (qa/verdicts/tooling-honest-lint.md, cycle 0, 2026-10-28)
**Fix cycle:** 0
**Dual check:** no
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** ISS-367 (verified) and ISS-371 (verified): already fixed at HEAD, now pinned by regression tests; G-B3 duplicate-id guard hardened
**Executor:** claude-sonnet-subagent
**Executor rationale:** small tooling change with a precise design; no external executor was worthy.

Dual check: no, because the diff touches no auth, tenancy or data-write path. It edits a read-only audit over `qa/*.jsonl` (scripts/lib/ledger-rows.mjs, scripts/lib/tracker-audit.mjs), tests, and the generated docs/SNAPSHOT.md. The only writes are two local ledger rows in qa/issues.tooling.jsonl through the project allocator.

## Scope finding (read this first)
Two of the three scoped items were ALREADY true at HEAD 338d2178; this unit does not re-implement them, it pins them and finishes the third:
- (1) `pnpm lint:structure` is `node scripts/lint-loc.mjs --all`, whose `runAll` runs all 10 stages and reports every failure (introduced a0b3094e); no `&&` chain remains. Added a test that pins package.json to that single runner. Live run: `lint:structure: FAIL (10 stages, 2 failed)`, both failures pre-existing and outside this file list (ISS-TOOLING-001).
- (2) `structure.config.json` `loc.testPatterns` already contains the `.test.mjs` pattern. Added a test on the REAL config (previously only exercised indirectly).
- (3) A duplicate id across the union already made `readLedgerRows` THROW, so `audit()` crashed with a stack trace: first collision only, no `--json` output, nothing in the finding list. Changed in place to a reported finding (below). The real ledger has NO duplicates (union of the canonical file and every shard: `ledger-alloc-cli verify` rows=1024 findings=0).
- SNAPSHOT: was stale (155 lines differ); regenerated with `node scripts/snapshot.mjs`, `--check` now OK.

## What changed
- scripts/lib/ledger-rows.mjs `readLedgerRows(root, { collectDuplicates })`: default behaviour and return shape unchanged (still throws `Duplicate ledger id X: a and b`, pinned by scripts/qa/ledger-union.test.mjs); with `collectDuplicates` it reads on and adds `duplicates: [{id, locations}]`.
- scripts/lib/tracker-audit.mjs `audit()`: new gate G6, one finding per collided id, `G6 Duplicate ledger id <id>: <file>:<line> and <file>:<line>[ and ...]` (all locations). `filterByGate` keeps G6 under every `--gate` selection (an id naming two rows corrupts what every other gate reads), so the `--gate g1,g4,g5` stage of lint:structure already carries it.
- scripts/lib/tracker-audit.test.mjs: 3 tests (G6 across two files; every duplicate plus a 3-way collision under a narrowed gate; silent when unique).
- scripts/lint.test.mjs: 2 tests (package.json runner pin; real testPatterns).
- docs/SNAPSHOT.md regenerated (never hand-edited).
- qa/issues.tooling.jsonl: ISS-TOOLING-001, ISS-TOOLING-002 (both medium, not pulled as units).

## Criteria
- C1 `pnpm lint:structure` runs every stage and reports every failure (no short-circuit, no `&&` chain).
- C2 `loc.testPatterns` in the real structure.config.json matches `.test.mjs` (and `.test.ts`, `test_*.py`), and not plain sources.
- C3 The tracker audit reports a duplicate ledger id across qa/issues.jsonl + qa/issues.*.jsonl as a finding that names the id and every file:line, reports every collision, and does not throw.
- C4 A duplicate-id finding survives any narrowed `--gate` selection (the CLI cannot hide it).
- C5 docs/SNAPSHOT.md matches a fresh regeneration.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 6 files, 5 criteria, est 40 min, single builder, per-file node --test runs
slow-plan: tooling-only unit; per-file test runs because multi-file node --test stalls on this machine
Tier: S (dev tooling; read-only audit and tests; no runtime product path)
mutant-cap-raise: policy .8-5 requires one falsification per changed criterion (5 criteria); C1 has two because it has two independent pins (runAll loop and the package.json script)
Base / checked state: base 338d2178; code commit 2b42766a on branch tooling-honest-lint (the manifest commit follows and touches only qa/).
Affected tests: scripts/lint.test.mjs, scripts/lib/tracker-audit.test.mjs, scripts/qa/ledger-alloc.test.mjs, scripts/qa/ledger-union.test.mjs (filtered). No full suite.
Independent review: NOT run by the builder (a builder does not re-delegate); the checker owns review.
Known limits: scripts/qa/ledger-union.test.mjs is not in test:lint and one of its tests is red against the real repo (ISS-TOOLING-002), so the pre-existing duplicate tests there stay unwired; the new G6 tests live in the wired tracker-audit.test.mjs. scripts/qa/ledger-alloc.test.mjs failed once (lock timeout in its concurrency test) when run in parallel with other suites and passed 31/31 alone; it is timing-based and untouched by this diff.
Tests[C1]: scripts/lint.test.mjs::"package.json lint:structure is the single aggregate runner ...", "aggregate gate executes all ten stages despite first, middle and final failures", "aggregate gate clean success and execution error/signal cannot skip later stages" — the runner pin and the two runAll tests fail if any stage is skipped after a failure or the script becomes an && chain
Tests[C2]: scripts/lint.test.mjs::the real-config testPatterns test (ISS-371) and "mjs tests use testMax while source mjs remains at source budget" — they read the real structure.config.json and prove an mjs test file gets the 400 budget while an mjs source keeps 300
Tests[C3]: scripts/lib/tracker-audit.test.mjs::"G6 a duplicate ledger id across the union is a finding naming the id and BOTH files, not a throw", "G6 reports EVERY duplicated id (and a 3-way collision lists all locations), and no narrowed --gate can hide it", "G6 is silent when ids are unique across the union"; scripts/qa/ledger-union.test.mjs::"duplicate ledger IDs refuse ..." (6, default throw unchanged) — the three G6 tests prove a finding naming the id and every file:line, all collisions, no throw; the union tests prove the default reader still throws
Tests[C4]: scripts/lib/tracker-audit.test.mjs::"G6 reports EVERY duplicated id ... no narrowed --gate can hide it" (filterByGate with G1); scripts/qa/ledger-union.test.mjs::"selected CLI gate cannot hide duplicate ledger IDs" (spawns the CLI with --gate g1) — the in-process test and the spawned CLI test both fail if a narrowed gate filters G6 out
Tests[C5]: node scripts/snapshot.mjs --check (also the snapshot stage of lint:structure) — it diffs the committed file against a fresh regeneration
Pre-check[C1]: 2b42766a node --test scripts/lint.test.mjs -> exit 0, 20 passed t=1 blobs=scripts/lint.test.mjs:d645af46
Pre-check[C2]: 2b42766a node --test scripts/lint.test.mjs -> exit 0, 20 passed t=1 blobs=scripts/lint.test.mjs:d645af46
Pre-check[C3]: 2b42766a node --test scripts/lib/tracker-audit.test.mjs; node --test scripts/qa/ledger-alloc.test.mjs; node --test --test-name-pattern="duplicate ledger|ledger IDs|ledger reader|CLI gate|ledger:" scripts/qa/ledger-union.test.mjs -> exit 0, 22 passed + 31 passed + 16 passed t=3 blobs=scripts/lib/tracker-audit.test.mjs:5c4ac7bb,scripts/lib/tracker-audit.mjs:ec0329e7,scripts/lib/ledger-rows.mjs:177c1df0
Pre-check[C4]: 2b42766a node --test scripts/lib/tracker-audit.test.mjs; node --test --test-name-pattern="CLI gate" scripts/qa/ledger-union.test.mjs -> exit 0, 22 passed + 1 passed t=2
Pre-check[C5]: 2b42766a node scripts/snapshot.mjs --check -> exit 0, OK: docs/SNAPSHOT.md matches a fresh regeneration (172 lines, budget 200) t=1
Metrics: builder_min=40 mutants=6 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Falsifications (one per criterion)
Per-mutation byte backup (taken immediately before each single mutation, restored right after it), `timeout 100`, no EXIT trap. After each restore `git hash-object <file>` equalled `git rev-parse HEAD:<file>` (fidelity OK for all 6, hashes printed in the run).

| Criterion | falsifying edit | test file | observed |
|---|---|---|---|
| C1 | lint-loc.mjs `runAll` adds `if (failed) break;` after `results.push` (short-circuit) | lint.test.mjs | pass 18 / fail 2: "aggregate gate executes all ten stages ...", "... cannot skip later stages" |
| C1 | package.json `lint:structure` set to `node scripts/lint-loc.mjs && node scripts/lint-dirsize.mjs` | lint.test.mjs | pass 19 / fail 1: "package.json lint:structure is the single aggregate runner ..." |
| C2 | structure.config.json drops the `.test.mjs` entry from testPatterns | lint.test.mjs | pass 18 / fail 2: "real structure.config.json testPatterns ...", "mjs tests use testMax ..." |
| C3 | tracker-audit.mjs `findings.push(` replaced by `void (` on the G6 line (finding never reported) | tracker-audit.test.mjs | pass 20 / fail 2: the two G6 reporting tests |
| C4 | tracker-audit.mjs `filterByGate` drops the G6 always-keep clause | tracker-audit.test.mjs | pass 21 / fail 1: "G6 reports EVERY duplicated id ... no narrowed --gate can hide it" |
| C5 | docs/SNAPSHOT.md gets one extra line appended | `node scripts/snapshot.mjs --check` | exit 1 (stale); restored blob d09dc81b equals HEAD |

## How to verify
- One file per run from the repo root: `node --test scripts/lint.test.mjs` (20), `node --test scripts/lib/tracker-audit.test.mjs` (22), `node --test scripts/qa/ledger-alloc.test.mjs` (31, run alone).
- `node scripts/tracker-audit.mjs --gate g1,g4,g5` -> OK; `node scripts/snapshot.mjs --check` -> OK; `node scripts/qa/ledger-alloc-cli.mjs verify` -> rows=1024 findings=0.
- `node scripts/lint-loc.mjs --all` -> 10 stages, 2 failed (loc: apps/api/src/knowledge-outputs/workbench.test.ts 402 > 400; dirsize: packages/ask/src and apps/api/src/answer-policy 31 > 30), both pre-existing, filed as ISS-TOOLING-001.
