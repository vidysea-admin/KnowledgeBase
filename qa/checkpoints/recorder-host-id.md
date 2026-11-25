# Checkpoint — recorder-host-id (B3), coordinator A
Attribution: checker coordinator A (claude-sonnet-subagent), verdict `qa/verdicts/recorder-host-id.md`, cycle 0, policy proportional-verification/2026-11-22.19.

Common identity for every row: head e32ea0cad598162a5b93993ab7371bf021ac1d0a (base a64cb3ae108c61bd2c235609b96885f2c4827225); worktree `D:/KnowledgeBase/.worktrees/b3-check-a` (detached, left in place); code blobs capture-slot-readiness.ts 8979b77237702bd37b23924f95539c57b2f18fda, capture-slot-acceptance.ts a8b66d394346932dfb6d9201b9851cde8af99225 (unchanged), capture-slot-readiness.test.ts f491cd1cdfcfc658d928ae77879a957b1c47a162, capture-slot-acceptance.test.ts ed5b60069f54f83183c11fdafa1ef863187469b3; pnpm-lock.yaml blob 9740865ebd25b2a93527d856a50ecb7862a315a1; env: Windows 11, node v24.13.1, tsx via pnpm offline frozen install; no env override of the setting beyond what each test sets itself.

| Check | Command and scope (cwd packages/meeting-bot unless noted) | Result |
|---|---|---|
| Readiness tests | `node --test --import tsx src/capture/workspace/capture-slot-readiness.test.ts`, 13 collected | 13 pass, 0 fail |
| Acceptance tests | `node --test --import tsx src/capture/workspace/capture-slot-acceptance.test.ts`, 11 collected | 11 pass, 0 fail |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | exit 0, no output |
| Affected | `--test-concurrency=1` tab-session-workspace.test.ts + caller-failure-readiness.test.ts; from worktree root `scripts/webinar/scheduler/deps-runtime.test.mjs` | 8/8; 13/13 |
| Route | `tick.mjs --route a64cb3ae..e32ea0ca` | floor null, dual false (dual stands on the cited trigger) |
| Diff scope (4c) | `git diff --name-only a64cb3ae..HEAD`; removed-line scan of both test files; diff of acceptance.ts, record-consent/, capture/tiles/ | 3 owned files; only the node:fs import line removed; the rest empty |
| Probe | scratch `probe.mjs`, 25 values beyond the contract table, plus undefined and inherited property | all refusals fixed-message, none echoed, 0 log lines for refused values |
| Mutants | scratch `mutate.mjs`, 10 mutants over both test files, 300 s timeout each, per-mutation byte backup, restore in finally and SIGINT/SIGTERM | 10 red (fail counts 1 to 4); restored byte-equal; `git hash-object` == `git rev-parse HEAD:<file>` for readiness.ts, acceptance.ts and both test files; `git status --porcelain` empty |

Reuse rule: reuse only if head, the four blobs, lock hash, node version and the environment variable setting in each test are unchanged. Nothing of the other coordinator was read or counted. Remaining: none.
