# Checkpoint t039-manual-jobs-operation-authority (cycle 1 re-check) - completed 2026-10-26T16:57Z

Evidence identity: HEAD 7eb2b358; sha256 send-now-command.ts 71c51f73...39a3, send-now-command.test.ts 6c1e0a9b...a7d5, send-now/send-now-host.ts 51baf1ae...38bf, send-now/send-now-host.test.ts f06a6dc9...8598; lock pnpm-lock.yaml (ajv 8.20.0, ajv-formats 3.0.1, pdfjs-dist 6.4.299 supplied from a scratch dir, not the repo); env node v24.13.1 win32; checker claude-sonnet-subagent.

- six-node filter over 3 test files: exit 0, 6/6 (recheck-six-node-fallback.out.txt)
- two full test files: 28/28 (recheck-two-files-full.out.txt)
- verify_contracts.py: exit 0 (vacuous)
- orphan probe: 4 cases as expected (recheck-orphan-probe.out.txt)
- mutants m1-m3: green-before 6/6, red-after 4/6, 4/6, 5/6, in copies outside the repo

Result: PASS (unit-scoped); live criteria HOLD-live.
