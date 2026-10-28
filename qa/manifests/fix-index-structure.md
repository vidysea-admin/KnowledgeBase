# Manifest — fix-index-structure

**Contract:** none (repair of RED pre-push step 6c r2 item 3; qa/verdicts/prepush-6c-2026-10-28-r2.md)
**Goal task:** none
**Date:** 2026-10-28
**Status:** merged-no-check (test-lane)
**Fix cycle:** 0 of max 2
**Dual check:** no (test-only)
**Persona walk:** skip (no new screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Branch / worktree:** wave/fix-index-structure at D:/KnowledgeBase/.worktrees/fix-index-structure (base 047f17ef)

## Criteria
- **A** lint-dirsize no longer flags packages/index/src/pipeline (33 files, budget 30). Four speaker-name-rules-*.test.ts files moved with git mv into the existing packages/index/src/pipeline/speaker-rules/ directory; the package test glob (src/**/*.test.ts) already picks them up, no config change. Directory now 29 files. No budget edited, no assertion changed, no skip added.

## What changed
- git mv packages/index/src/pipeline/speaker-name-rules-{closed-class,handover,place,speaking}.test.ts to packages/index/src/pipeline/speaker-rules/. Only edit: relative imports ./speakers-llm.js and ./speaker-name-rules.js became ../speakers-llm.js and ../speaker-name-rules.js (7 lines). Product code and docs/SNAPSHOT.md unchanged (snapshot --check green).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 4 file moves, 1 repair, single builder, per-file node --test runs, no checker dispatch
Tier: S (test-file relocation; no product, auth, tenancy, write or schema change)
Base / checked state: base 047f17ef; code commit eead8ad2 on wave/fix-index-structure.
Affected tests: the four moved files only. No full suite run.
Independent review: not required for test-lane move.
Known limits: lint:structure still fails on apps/api (health.test.ts loc, routes dirsize); owned by other units.

Tests[A]: packages/index/src/pipeline/speaker-rules/speaker-name-rules-closed-class.test.ts (3 test() calls before and after; 52 runtime tests); speaker-name-rules-handover.test.ts (6 calls; 8 runtime); speaker-name-rules-place.test.ts (14 calls; 52 runtime); speaker-name-rules-speaking.test.ts (6 calls; 22 runtime). Old vs new test() call counts identical per file (git show HEAD vs working copy).

Pre-check[A]: eead8ad2 node --test --import tsx packages/index/src/pipeline/speaker-rules/speaker-name-rules-closed-class.test.ts; node --test --import tsx packages/index/src/pipeline/speaker-rules/speaker-name-rules-handover.test.ts; node --test --import tsx packages/index/src/pipeline/speaker-rules/speaker-name-rules-place.test.ts; node --test --import tsx packages/index/src/pipeline/speaker-rules/speaker-name-rules-speaking.test.ts -> exit 0, 52 passed + 8 passed + 52 passed + 22 passed t=4 blobs=packages/index/src/pipeline/speaker-rules/speaker-name-rules-closed-class.test.ts:ea8c7d7c,packages/index/src/pipeline/speaker-rules/speaker-name-rules-handover.test.ts:aebea68d,packages/index/src/pipeline/speaker-rules/speaker-name-rules-place.test.ts:2c8f6faa,packages/index/src/pipeline/speaker-rules/speaker-name-rules-speaking.test.ts:20044d5c
Pre-check[B]: eead8ad2 pnpm lint:structure; node scripts/snapshot.mjs --check -> lint-dirsize no longer lists packages/index/src/pipeline (only apps/api/src/routes 31 remains, other unit); snapshot OK (172 lines, budget 200) t=2
Metrics: builder_min=10 mutants=0 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable
