# Manifest — iss392-v2-refusal-coverage

**Status:** merged-no-check (test-lane) — merged 2026-10-26 by maker as 64be471e; main-tree rerun 14/14 pass
**Handshake status:** merged-no-check (test-lane) — merged 2026-10-26 by maker as 64be471e; main-tree rerun 14/14 pass
**Fix cycle:** 0
**Dual check:** no
**Issues addressed:** **ISS-392** (medium, test-coverage)
**Branch:** iss392-v2-refusal-coverage
**Base sha:** b3eabbeede7fd444b6ccdea42832be8a1d54e6ae
**Fix sha:** 1aea1be26b7253fe28737fbee38c10be7b84fb88 (the manifest commit that follows changes no test or product file)

## What changed (test-only; no product code touched)
- `packages/meeting-bot/src/workspace/index-proof-identity.test.mjs:50` — 'legacy v2 still refuses count mismatch and non-string generation' now builds its fixture with `producedProofFixture(t, 'knowledge-turns.json', 'legacy')` (it used the v4 default, so its `version: 2` proofs were also refused for the v4-only fields left in them, hiding the turnCount/generation refusal). Added a positive control: the unpatched v2 proof must be admitted, so every refusal below it is attributable to its own patch.
- `packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs` (new test before 'v3 refuses wrong source...') — 'legacy v2 refuses selected-turn count mismatch and non-integer count (ISS-392)': positive control plus `turnCount` 0, 2, '1', 1.5, undefined, each refused on a v2 proof.
- Product file `packages/meeting-bot/src/workspace/index-proof-consumer.ts` is unchanged (falsified in a copy only).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: S, test-only (two `*.test.mjs` files, no product code, fixture or helper module changed; `index-proof-fixture.mjs` untouched). Test-only rule: no checker; maker merges after pre-check, falsification floor and lint. No security/auth/tenancy/prod-write file is in the diff, so no dual-trigger line.
Affected tests / full-suite trigger: the two touched test files; no full suite (S, test-only).
Tests[C1]: packages/meeting-bot/src/workspace/index-proof-identity.test.mjs, index-proof-consumer.test.mjs — the two touched files.
Tests[C2]: same two files — ISS-392's recorded reproduction is the surviving mutant m4 (remove the v2 turnCount check); these are the tests that must kill it.
Sibling: packages/meeting-bot/src/workspace/index-proof-fixture.mjs — not affected because it is imported unchanged; `legacy` mode is an existing parameter.

Pre-check[C1]: 1aea1be node --test --import tsx packages/meeting-bot/src/workspace/index-proof-identity.test.mjs packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs -> 14 tests, 14 pass, 0 fail t=1 blobs=packages/meeting-bot/src/workspace/index-proof-identity.test.mjs:4cdf048,packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs:3b9e25f
Pre-check[C2]: 1aea1be node --test --import tsx packages/meeting-bot/src/workspace/index-proof-identity.test.mjs packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs -> in the mutcopy copy with mutant m1 applied: 12 pass, 2 fail (the two v2 tests go red); unmutated 14/14 green t=1 blobs=packages/meeting-bot/src/workspace/index-proof-identity.test.mjs:4cdf048,packages/meeting-bot/src/workspace/index-proof-consumer.test.mjs:3b9e25f

## ISS-392 recorded reproduction, re-run by id (D-015)
ISS-392 records one reproduction: mutant m4, "remove the v2 turnCount check" in `index-proof-consumer.ts`, which survived the identity test at :50. Copy of the tree at base (`git archive HEAD` of packages, scripts, config, schema, contracts) in the scratchpad; the mutation is v2-scoped, because the check at `index-proof-consumer.ts:33` is shared by v2/v3/v4 and a total removal is already killed by the v3/v4 tests.

| ISS-392 m4 (`proof.turnCount !== turns.length` skipped when `version === 2`) | unmutated | mutated |
|---|---|---|
| OLD tests (base HEAD versions) | 13 pass / 0 fail | **13 pass / 0 fail: mutant SURVIVES (issue reproduced)** |
| NEW tests (this commit) | 14 pass / 0 fail | **12 pass / 2 fail: KILLED** |

ISS-392: 1/1 recorded reproduction survived on the old tests, 1/1 killed on the new tests. Reds on the new tests: 'legacy v2 refuses selected-turn count mismatch and non-integer count (ISS-392)' and 'legacy v2 still refuses count mismatch and non-string generation' (fires on the `{ turnCount: 2 }` patch). Reds fail for the named reason: the `assert.throws(... /strict index proof/ ...)` on the mutated-away check, not for load or parse errors.

## Falsification (in a copy; D-020 + per-mutation amendment)
Each mutation was applied to `index-proof-consumer.ts` in a copy under the session scratchpad (`mutcopy`), never the bound tree, with a per-mutation `try/finally` restore and a byte comparison against the pre-mutation bytes after every mutation (all True). The copy's file was byte-equal to the worktree file before mutating. The worktree product file was never opened for writing; `git status` shows only the two test files changed.

Falsification[C1]: ISS-392 m1 (v2-only skip of `turnCount !== turns.length`) — new tests red on 'legacy v2 refuses selected-turn count mismatch and non-integer count (ISS-392)' and 'legacy v2 still refuses count mismatch and non-string generation'; unmutated green (14/14). Old tests: 13/13 green under the same mutant.
Falsification[C1]: m3 (v2-only skip of `identity(proof.generation)`) — new tests red on 'legacy v2 still refuses count mismatch and non-string generation' (1 fail); old tests 13/13 green under the same mutant, so the :50 test's generation arm was equally blind before.
(m2 below is an equivalence probe, not counted as a mutation of a criterion.) Equivalent mutant, recorded not fixed: m2 (v2-only skip of `Number.isSafeInteger(proof.turnCount)`) survives both old and new tests, because `proof.turnCount !== turns.length` already forces a safe integer (`turns.length` is one). It is not a coverage gap.
Falsify[C2]: index-proof-identity.test.mjs 'legacy v2 still refuses count mismatch and non-string generation' red@m1-mutant green@1aea1be

## Metrics
Metrics: start=2026-10-26T00:00:00Z end=2026-10-26T00:00:00Z wall_min=15 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=2 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=2 defects_unit=0 defects_6c=0

## Notes
- The worktree has `node_modules` junctions (untracked, to the main checkout's installs) so the tests can run; they are not part of the commit.
- Not touched: `qa/issues*.jsonl` (ISS-392 stays `open` until the maker closes it after merge), contracts, DECISIONS, hooks, settings.
