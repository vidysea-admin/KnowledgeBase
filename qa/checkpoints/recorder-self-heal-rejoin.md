# Checkpoint - recorder-self-heal-rejoin (H1), coordinator A

Status: COMPLETE (verdict PASS at cycle 1; no mandatory check remains)
Cycle-0 checkpoint (PASS on e327d86b) is superseded by this one; its evidence identities for unchanged criteria are carried below by blob hash.
Head judged: c42c9559ca7c92fbb1378b41cd90e85404e7ec4b; contract commit 7e683dff; policy proportional-verification/2026-11-22.19
Worktree left in place: D:/KnowledgeBase/.worktrees/h1-check-a (detached at c42c9559, clean; node_modules, do not remove)
Verdict: qa/verdicts/recorder-self-heal-rejoin.md (cycle-0 verdict: qa/verdicts/recorder-self-heal-rejoin.r0-1.md)
Original checker attribution: coordinator A, claude-sonnet-subagent, this file's verdict.

## Evidence identity (cycle 1, run by me; node v24.13.1, tsx 4.23.13 from the pnpm store; pnpm-lock.yaml unchanged by the repair)
| Check | Command and scope | Code blobs | Result |
|---|---|---|---|
| C10 probe | `node --import tsx probe-c10-a.mjs` (scratchpad h1a), real canonicalOperationAlert + raiseAlert, 24 titles | bot-events.ts c47b198d, lifecycle-alerts.mjs 35a20fba, alerts.ts 232168d7 | literal scenario clean; 7 of 24 residual-shape rows leak (P1) |
| D-015 | maker C10_TITLES (10 rows, first 4 = recorded reproductions) through my harness | same | 4/4 recorded, 10/10 total redacted |
| scheduler set | `node --test --test-timeout=60000 self-heal-rejoin dispatch lifecycle-alerts alert-kinds skip-reason-vocabulary deps-runtime` | self-heal test 4bda9aa0, dispatch.mjs 605e300f | 62/62 |
| pipeline set | `node --test run-pipeline.test.mjs scheduler/pipeline.test.mjs` | run-pipeline.mjs 0693ae46 | 36/36 |
| meeting-bot | `node --test --import tsx src/autojoin/*.test.ts` (6 files, cwd packages/meeting-bot) | bot-events.ts c47b198d | 54/54 |
| host test | `node --test --import tsx scripts/watch/bot-events-host.test.ts` | same | 1/1 |
| typecheck | `npx tsc --noEmit -p tsconfig.json` (packages/meeting-bot) | same | exit 0 |
| mutants (copy) | F1 BARE_LINK, M2 CRED_PAIR, M3 digit lookahead, M4 zoom host; `node --test scripts/webinar/scheduler/self-heal-rejoin.test.mjs` in a copy | same | 4/4 red for the named test, green before and after |
| HEAD fidelity | `git hash-object` copy / worktree / HEAD | bot-events.ts c47b198d x3; test 4bda9aa0 x3 | equal |

## Carried from cycle 0 (unchanged files, evidence identity)
dispatch.mjs 605e300f, lifecycle-alerts.mjs 35a20fba, run-pipeline.mjs 0693ae46, alerts.ts 232168d7 are byte-identical at c42c9559 (`git diff --name-only e327d86b c42c9559` = bot-events.ts and the test file only), so the cycle-0 results for C1-C9 and I1-I6, and the tenancy dual-trigger at dispatch.mjs:51, stand.

Remaining: none. If questioned, re-run the commands in the table from D:/KnowledgeBase/.worktrees/h1-check-a and `git hash-object` the two changed files against HEAD.
