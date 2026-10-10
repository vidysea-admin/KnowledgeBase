# small-fix-batch-2026-10-10 (lane SMALLFIX, branch lane/smallfix, base a71685e)

Tier: medium issues, light ceremony (severity gate). Round cap: no PASSed verdict in qa/verdicts/ names these seams (duplicate route / stale ask fixture); cap not hit.

## ISS-335 -- duplicate /ask route in apps/web/src/App.tsx
- Reproduced: YES. HEAD App.tsx declared `/ask` twice in one <Routes>: line 27 `<AskPage />` and line 49 `<DashboardPage />` (last route).
- Route-table finding (explicit): both routes are siblings in the SAME <Routes>, under the SAME <AuthProvider> > <LoginGate> > <BrowserRouter> > <AppShell>. Neither carries its own guard, layout or wrapper; they differ only in element. react-router v6 ranks equal-score siblings by index, earlier wins, so AskPage (the intended page) was already the live one. NO guard/layout difference, NO security finding. Removing the later DashboardPage route leaves behaviour unchanged. (ISS-335's fix_direction named line 35; the file has since grown, the dup was at line 49.)
- Fix: commit 377d8bc, deletes 1 line from App.tsx (no other edit). Added apps/web/src/App.routes.test.tsx (3 tests): every <Route path> declared once and /ask exactly once (the HEAD source yields dupes ['/ask']); /ask without key shows login gate not Ask page; /ask with key renders Ask page once inside .app-shell > main.app-main with the sidebar.
- D-015: the ledger row records no numeric attack corpus; its single recorded case is the duplicate-path regression_check ("a test asserting no duplicate path values in App.tsx's Routes"). Count: ISS-335: 1/1 recorded case covered (HEAD fails, fixed passes).
- Tests: vitest App.routes.test.tsx + AskPage.test.tsx: 2 files, 12 tests passed. `tsc --noEmit` apps/web: exit 0. `node scripts/lint-dirsize.mjs`: OK (110 dirs within budget).
- D-024 live browser check: NOT DONE (cannot run on this machine). To look at: /ask loads once, behind login, in the app shell.

## ISS-T057-B8-KNOWLEDGE-EXPLORER-004 -- stale packed-context fixture in ask.test.ts
- Reproduced: NO LONGER REPRODUCES in this lane. The file is now apps/api/src/routes/ask/ask.test.ts (moved by c979bff); the fixture at line 74 already reads `JSON.parse(job.messages[1].content).context` and asserts `context.strips[0].sourceIndex/text` and `context.sources[0].source/sourceId`, matching PackedContext {sources, strips} in packages/ask/src/bounded-refine.ts. The assertions are not vacuous: the HTTP reply must be 200 with citation s-t1, which requires the answer dispatch (where they run) to execute.
- Before: node --test src/routes/ask/ask.test.ts -> tests 3, pass 3, fail 0. After: unchanged (no edit), same result. No commit; no TypeScript changed in apps/api so no api tsc run.
- D-015: ISS-T057-B8-KNOWLEDGE-EXPLORER-004: 1/1 recorded reproduction passes (HTTP 200, legacyFactory 0, embedCalls 1, s-t1 citation retained).

Status: checked-PASS
Checked: qa/verdicts/small-fix-batch-2026-10-10.md (cycle 0, dbdd9d4) - SOURCE SCOPE ONLY; live-browser validation under D-024 still owed
Fix cycle: 0
