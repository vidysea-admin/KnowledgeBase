# Checkpoint - ua-web (coordinator A) - cycle 0
Head 7d5eef2f, base 146f23da. Policy proportional-verification/2026-10-19.17. Environment: node v24.13.1, scratch git-archive copy of the head outside the bound root (node_modules junctions), local mongod 27999, API 3399, same-origin web 5199 (all started by me, stopped by PID).
Completed checks (command -> result):
- vitest App.accounts.test.tsx + AccountPages.test.tsx -> 26 passed; App.accounts.test.tsx alone exits 1 with 3 unhandled DashboardPage errors (run twice)
- vitest LoginGate/AuthContext/client/sessions/accounts (A7-6 set) -> 60 passed in 5 files
- live walk T1..T5, viewer persona, base path /knowledgebase, session_revoked -> as in the verdict
Falsifications (copy, green-before, red-after, restored, bound blob equals HEAD): A7-1 gate (14 -> 12 red), A7-2 banner (-> 1 red), A7-3 root-absolute href (-> 3 red), A7-4a/b CSRF attach and storage (-> 5, -> 2 red), A7-5a/b stale fence and handler (33 -> 1, 43 -> 3 red), A7-6 bearer (-> 5 red), A7-7 429 text (-> 1 red) and credentials same-origin.
Attribution: coordinator A only; one Agent dispatch was refused (compact handoff required), so all evidence is first-hand; the dual partner's evidence was not read.
Cleanup: ports 5199, 3399, 27999 free; no bound-tree edits.
