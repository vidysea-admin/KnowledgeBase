# Checkpoint (coordinator B) — ask-fast-rag, cycle 0
Verdict: FAIL (see qa/verdicts/ask-fast-rag.b.md). Judged head 8f493875; product files == commit f6b353b9 state.

Evidence identity (all runs by this coordinator; env: Windows 11, node v24.13.1, tsx 4.23.13, no lockfile change, no live provider, no DB):
- node --test --import tsx packages/ask/src/ask-fast.test.ts (cwd packages/ask) -> 8 pass; blob ask-fast.test.ts at HEAD; result PASS
- same for the other packages/ask test files (35) -> 0 fail
- apps/api: answer-fast 8/8, answer-workflow 18/18, ask-tenant-isolation 17/17, ask-tenant-hostile 70/70, vertical 4/4, message-vertical 4/4, server 10/10, routes/ask 7/7; 31 importer files green
- apps/api/src/usage/usage.test.ts -> 13 pass 1 fail (HEAD); base product state in copy -> 14 pass 0 fail
- default-mode run of vertical.test.ts / message-vertical.test.ts / server.test.ts in a copy (only the mode:"deep" knob removed): 3 fail / 4 fail / 1 fail
- falsification table: 8 rows, each green-before, red-after, restored; restore verified by git hash-object == git rev-parse HEAD:<file> in the copy
- HEAD-fidelity of the 17 diff files in the bound tree: all equal
All mutation and base-state runs were in a throwaway copy outside the bound tree; the bound tree was never edited. Nothing remains pending except the FAIL findings.
