# Verdict: small-fix-batch-2026-10-10

VERDICT: PASS (source scope; D-024 live-browser check still owed)
Cycle checked: 0

## Commands and results
- `git show --stat 377d8bc`: apps/web/src/App.tsx (1 deletion) and apps/web/src/App.routes.test.tsx (45 added). Nothing else.
- `git show 377d8bc^:apps/web/src/App.tsx`: both `/ask` routes were direct children of the one `<Routes>`, inside AuthProvider > LoginGate > BrowserRouter > AppShell, no per-route guard. The removed route was the LATER one (last line, after /whatsapp). DashboardPage is still routed at `/` (line 1 of the table), so no page became unreachable.
- Demonstrated pre-fix behaviour: re-inserted `<Route path="/ask" element={<DashboardPage />} />` into App.tsx (byte backup, restored after; `git hash-object` = `git rev-parse HEAD:` = efc72368f297d3d94241e56342e22ec243368e27). Under that mutation the test "/ask with a key renders the Ask page once" PASSED (Question label present exactly once), i.e. react-router v6.x (vitest 2.1.8 env) renders the earlier AskPage; the later duplicate is dead. Behaviour is unchanged by the fix.
- Mutated run: `vitest run src/App.routes.test.tsx` -> 1 failed | 2 passed; the failure is "every <Route path> is declared exactly once": `expected [ '/ask' ] to deeply equal []`. So the tests catch the regression.
- Fixed tree: `vitest run src/App.routes.test.tsx src/pages/AskPage.test.tsx` -> Test Files 2 passed, Tests 12 passed (3 + 9).
- `tsc --noEmit -p tsconfig.json` (apps/web): exit 0.
- `node --import tsx --test src/routes/ask/ask.test.ts` (apps/api): tests 3, pass 3, fail 0.
- (`--maxWorkers=1 --pool=threads` errors in vitest 2.1.8 with a Tinypool minThreads conflict; default flags work.)

## ISS-T057-B8-KNOWLEDGE-EXPLORER-004
Stale expectation is gone. apps/api/src/routes/ask/ask.test.ts reads `JSON.parse(job.messages[1].content).context` and asserts `context.strips[0].sourceIndex/text` and `context.sources[0].source/sourceId`, matching `PackedContext {sources, strips}` (packages/ask/src/bounded-refine.ts:10). Before, the line was a double `JSON.parse(JSON.parse(...).context)` (array shape). Fixed by commit c979bff ("Move API production, ask and WhatsApp store into folders", 2026-10-10 16:20), which rewrote those lines while moving the file. The assertion is meaningful: with the old array shape `context.strips[0]` throws TypeError and the test fails. Test file passes 3/3.

## Notes
- The "declared once" test greps `<Route path="...">` from the raw source (regex), which is somewhat brittle (misses `path={...}` or multi-line `<Route\n path=`), but the render tests are independent, and it fails correctly on the real regression. Not worth an issue.
- The logged-out test proves the login gate shows (API key field present, Question field absent) at `/ask`; adequate.

ISSUES-WRITTEN: none

EXPLANATION: The removal is behaviour-preserving (shown by running the mutated pre-fix table), DashboardPage remains at `/`, and the tests are real (one fails on the pre-fix table). Owed: D-024 live-browser check that `/ask` loads once, behind login, in the app shell.

Recommended ledger changes (not applied): ISS-335 -> fixed (377d8bc, checker PASS); ISS-T057-B8-KNOWLEDGE-EXPLORER-004 -> already fixed by c979bff (no longer reproduces).
