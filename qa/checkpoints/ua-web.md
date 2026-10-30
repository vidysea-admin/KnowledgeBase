# Checkpoint - ua-web (coordinator A) - cycle 0
Head 7d5eef2f, base 146f23da. Policy proportional-verification/2026-10-19.17. Environment: node v24.13.1, scratch git-archive copy of the head outside the bound root (node_modules junctions), local mongod 27999, API 3399, same-origin web 5199 (all started by me, stopped by PID).
Completed checks (command -> result):
- vitest App.accounts.test.tsx + AccountPages.test.tsx -> 26 passed; App.accounts.test.tsx alone exits 1 with 3 unhandled DashboardPage errors (run twice)
- vitest LoginGate/AuthContext/client/sessions/accounts (A7-6 set) -> 60 passed in 5 files
- live walk T1..T5, viewer persona, base path /knowledgebase, session_revoked -> as in the verdict
Falsifications (copy, green-before, red-after, restored, bound blob equals HEAD): A7-1 gate (14 -> 12 red), A7-2 banner (-> 1 red), A7-3 root-absolute href (-> 3 red), A7-4a/b CSRF attach and storage (-> 5, -> 2 red), A7-5a/b stale fence and handler (33 -> 1, 43 -> 3 red), A7-6 bearer (-> 5 red), A7-7 429 text (-> 1 red) and credentials same-origin.
Attribution: coordinator A only; one Agent dispatch was refused (compact handoff required), so all evidence is first-hand; the dual partner's evidence was not read.
Cleanup: ports 5199, 3399, 27999 free; no bound-tree edits.

# Checkpoint - ua-web (coordinator A) - cycle 1 (repair check) - 2026-10-30
Head 1aa2dd93 (product code 2074f299), base 146f23da. Verdict: PASS, tier L. node v24.13.1, vitest 2.1.8, playwright-core 1.58.2 (chromium-1248).
Copy: git archive of HEAD under the session scratchpad (outside the bound root), node_modules junctions to the main repo (unlinked before removal).
Commands and results: vitest App.accounts + AccountPages -> 35 passed exit 0; App.readonly + AuthContext.session + client.session -> 47 passed exit 0; config/routes/wiring + AuthContext.ordering/replay/LoginGate/AuthContext + client/sessions -> 79 passed exit 0; apps/web tsc --noEmit exit 0.
Live stack (all started by me): mongod 27998 (db lkb_chk_uaweb), API 3398 with APP_BASE_PATH=/knowledgebase (MSYS_NO_PATHCONV=1), same-origin static+proxy 5198, scripted Chromium. Walk covered T1-T5, viewer persona over 38 routes, forced writes (403 read_only_role / csrf), cookie Path, empty storage, session revoke, sign-out failure. Scripts: scratchpad chk-live/walk.mjs, mut.py (not committed).
Falsification: 6 mutations (A7-1 fixture, A7-2 WriteScope, A7-3 fromUserId, A7-4 CSRF fence, A7-5 signOut, A7-7 409 sentence), all red, each restored in a finally with per-mutation backup; git hash-object equals the HEAD blob after each.
Proposed issues: P1 medium (any 401 ends the session; /meeting-bot bounce loop), P2-P5 low. No ledger rows written.
Cleanup: ports 5198, 3398, 27998 freed; only my PIDs stopped; no bound-tree edits besides these QA files; no secrets printed.
