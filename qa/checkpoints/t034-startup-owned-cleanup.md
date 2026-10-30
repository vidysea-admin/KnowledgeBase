# Checkpoint t034-startup-owned-cleanup (checker, cycle 0, 2026-10-26)
- cmd: node --test --test-concurrency=1 --test-timeout=20000 --import tsx src/capture/tab-startup-cleanup.test.ts (cwd packages/meeting-bot) -> 2/2 pass, exit 0, 9.05 s; node v24.13.1.
- code: tab-browser.ts worktree sha256 f149985b40a7e991a19e0bbcb1a6a1904d67f7b12215c6acebd7068097901fec (HEAD blob c3de52d5; LF-normalised 57600ff2fbca4b3c...); test sha256 3735b8c6b70434584531bdf43bc2774b4c27f6a56ce8f7c7f21e195be2dc45cd; contract A819BCCD...
- tab-stop-cleanup.test.ts -> 3/3 pass, 14.8 s (ISS-003, other unit).
- finalize-original-eof.test.mjs -> 0/5 ENOENT, corpus missing (ISS-002, other unit, ISS-387).
- contracts/verify_contracts.py -> exit 0, vacuous.
- falsification copies in the session scratchpad (row1..row3, outside the root): F1/F2/F3 all red on the intended assertion.
- attribution: all evidence independently produced by this checker; none reused from maker receipts.
