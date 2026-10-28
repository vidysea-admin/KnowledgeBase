# Checkpoint (coordinator B) — ask-fast-rag, cycle 1
Verdict: PASS (see qa/verdicts/ask-fast-rag.b.md). Judged head 6a9dbfc8; product files == commit bd6af83b. Repair base feee65eb.

Evidence identity (all runs by this coordinator; env: Windows 11, node v24.13.1, tsx 4.23.13, no lockfile change, no live provider, no DB):
- node --test --import tsx <file> from repo root, one file per run, HEAD 6a9dbfc8: packages/ask/src/ask-fast.test.ts 10 pass; apps/api answer-fast 10, vertical 4, message-vertical 4, usage 14, passage-lexical 5, answer-workflow 18, ask-tenant-isolation 17, ask-tenant-hostile 70, routes/ask 7, server 10; packages/ask answer.test.ts 6; all 14 packages/ask/src/*.test.ts 0 fail
- npx tsc --noEmit -p . in packages/ask and apps/api -> exit 0
- tenant probe (scratch, outside the tree): 2 pass at HEAD; red when ask-graph.ts membership resolve is bypassed in the copy
- falsification table: 4 distinct edits (F4, F1 tree arm, F2 wiring, tenant guard) in a throwaway copy (scratchpad fc1, byte-equal to the worktree for the touched files), green-before, red-after, restored (cmp)
- HEAD-fidelity: bound tree has no tracked changes from this coordinator
Nothing pending.
