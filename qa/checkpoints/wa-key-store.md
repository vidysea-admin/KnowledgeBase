# Checkpoint — wa-key-store (C3B), coordinator A
Attribution: checker coordinator A (claude-sonnet-subagent), verdict `qa/verdicts/wa-key-store.md`, cycle 0, policy proportional-verification/2026-11-22.19.

Common identity for every row: head 350df1670df8592b411c0f0a833895a79252caef; code blobs authState.ts bcabe1d45042593d49b1bdee628413157b0d3a25, authState.test.ts 56d7e7852cf0f9858a1d2be6cc5a749d704be215; package-lock.json blob de8280e32c8643bc9e75e4e0f56c9cebc56924c7; env: Windows 11, node v24.13.1, tsx from the copied node_modules, mongod 7.0.28 standalone on 127.0.0.1:47123 (own PID 13472, own dbpath, stopped, dbpath removed); no conftest/fixtures/config differences (none exist beyond the test file); data snapshot: throwaway database `whatsapp_msg_test_<random>` dropped by the test; seed C3B_SEED=12345 (case seed 12446).

| Check | Command and scope | Result |
|---|---|---|
| Full file, mongod | `C3B_SEED=12345 C3B_TEST_MONGO_URI=mongodb://127.0.0.1:47123 node tsx --test --test-force-exit src/wa/authState.test.ts`, 93 collected | 93 pass, 0 fail, 0 skipped, 37.5 s |
| Typecheck | `npm run typecheck` | exit 0 |
| I3 | `src/wa/readOnlySocket.test.ts` | 4 pass |
| I5, scope | grep for withTransaction/startSession(/.watch(; `git diff --name-only c4bb66b3 350df167`; empty diff of the five untouched files | empty; two owned files; empty |
| Route | `tick.mjs --route c4bb66b3..350df167` | floor null, dual false (dual stands on the cited trigger) |
| Probes A1-A4 | appended to a scratch copy of the test file (not kept), `--test-name-pattern PROBE-`, fake and mongo | 8/8 pass; A3 prints the stale-handle overwrite (finding P1) |
| Mutants | scratch `mutate.mjs`, patterns per mutant, both rigs | 12 mutants, all red on at least one rig; M5 only on mongo; hashes restored equal HEAD blobs |

Reuse rule: reuse only if head, both blobs, lock hash, node/tsx/mongod versions and seed are unchanged. Nothing of the other coordinator was read or counted. Remaining: none.
