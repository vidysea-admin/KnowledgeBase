# Checkpoint — ask-fast-rag (coordinator A, cycle 0)
Head 8f493875 (code f6b353b9); env: win32, node 24.13.1, tsx via node --test --import tsx; no dependency lock change in diff; no data snapshot.
Attribution: checker agent afr-chk-a (claude-sonnet-subagent), verdict qa/verdicts/ask-fast-rag.md.

| check | command / scope | code blobs | result |
|---|---|---|---|
| ask-fast | packages/ask `node --test --import tsx src/ask-fast.test.ts` (8) | ask-fast.test.ts f84ec37a | pass 8 |
| answer-fast | apps/api src/answer-policy/answer-fast.test.ts (8) | 17fb34d8 | pass 8 |
| tenant | apps/api src/ask/ask-tenant-isolation.test.ts (17), ask-tenant-hostile.test.ts (70) | isolation b45d6edd | pass 17 / 70 |
| workflow | answer-workflow (18), vertical (4), message-vertical (4), server (10), routes/ask/ask (7), ask-web-fallback (4) | answer-workflow a571e36c | all pass |
| affected sweep | 21 further apps/api files that POST /ask or execute, one invocation each | HEAD | all pass |
| packages/ask sweep | every src/*.test.ts and src/bounded-evidence/*.test.ts, one invocation each | HEAD | all pass |
| tsc | `npx tsc --noEmit -p .` in apps/api and packages/ask | HEAD | exit 0 / exit 0 |
| tenant probe | scratchpad probe-tenant.test.mts (9 cases, fake provider) | HEAD | pass 9 |
| falsification | C1 C2 C3 C4a C4ab C5 C6 C7 (+C4b) in copy (git archive HEAD), green-before/red-after | HEAD | see verdict table |
| fidelity | git hash-object vs git rev-parse HEAD:<file> for 8 product files | HEAD | all equal |

## Cycle 1 (repair checker, coordinator A) — head 6a9dbfc8 (code bd6af83b), repair base feee65eb
Env: win32, node 24.13.1, tsx via node --test --import tsx, one file per invocation; no lock/dependency change; no data snapshot. Attribution: checker agent afr-chk-a1 (claude-sonnet-subagent), verdict qa/verdicts/ask-fast-rag.md.

| check | command / scope | code blobs | result |
|---|---|---|---|
| packages/ask | ask-fast.test.ts (10), answer.test.ts (6) | ask-fast.test.ts bbdc6828 | pass 10 / 6 |
| answer-policy | answer-fast.test.ts (10), answer-workflow.test.ts (18) | answer-fast b8493098, answer-workflow.ts 7574ef2a | pass 10 / 18 |
| native + lexical | passage-lexical (5), vertical (4), message-vertical (4) | passage-lexical.ts 7d2cc75b, .test 5daec137 | pass |
| tenant | ask-tenant-isolation (17), ask-tenant-hostile (70) | HEAD | pass |
| other /ask users | usage (14), server (10), routes/ask/ask (7) | HEAD | pass |
| tsc | `npx tsc --noEmit -p .` packages/ask, apps/api | HEAD | exit 0 / exit 0 |
| tenant probe (copy) | scratchpad probe-tree-arm.test.ts, P1-P4, real createSourceRequestDepsFor + BlindDb | HEAD | pass 4 |
| falsification (copy) | F1, F4, F3, C4 (green-before/red-after/restored); ask-v2.ts 31b3e177, answer-workflow.ts 7574ef2a, ask-graph.ts 5158c51b all equal HEAD blobs after restore | HEAD | see verdict table |
