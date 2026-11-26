# Checkpoint - calendar-page-freshness (T1), cycle 0, checker (single coordinator)

Head 7832d789e8e57fa16e63513e0222fc8d3486568b, base 3357556d, contract ef054973, policy proportional-verification/2026-11-22.19. Verdict: qa/verdicts/calendar-page-freshness.md (BLOCKED-CAPABILITY, Mode D only).
Attribution: claude-sonnet-subagent checker; environment: Windows 11, node via pnpm 10.33.0 offline frozen install in `.worktrees/t1-check` and `.worktrees/t1-check-mut`; lockfile unchanged by the diff.

## Completed checks (evidence identity: command, scope, code blobs, result)
Code blobs: useUpcomingMeetings.ts 4ac293ee3deeb7ccf364b1bd093fc025de290198; CalendarPage.tsx b915a29ba2e6a4132948c9b2096cec8766df0dae; api/calendar.ts 14ee40bf52b3b282c561f576ed804d64bda20fa4; CalendarPage.test.tsx 746a57be0da675224648c43b53282d249a8088a7. Config, fixtures, conftest: none changed.
- `npx vitest run src/pages/CalendarPage.test.tsx` (cwd apps/web): 73 passed, 0 failed.
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx vitest run src/pages/calendar src/pages/join-rules/enforcedVariant.test.tsx src/App.readonly.test.tsx src/config/runtime.wiring.test.tsx`: 206 passed, 2 failed; App.readonly /knowledge-outputs passes alone (load flake); runtime.wiring "routes /knowledgebase/ask" times out at 5000 ms alone on head and on base 3357556d (pre-existing).
- `node scripts/lint-loc.mjs`, `lint-dirsize.mjs`, `lint-dupes.mjs`: OK.
- `tick.mjs --route 3357556d..7832d789`: floor null, dual false.
- `git diff --name-only 3357556d..7832d789`: three web files; nothing under apps/api.
- Mutants (copy, 35-test T1 block, `-t "T1 calendar page freshness"`): M1 killed, M2a killed, M2b killed, M2 equivalent survivor, M3 killed, M4 killed, M5 survived the unit's tests and killed by checker probe, M6 killed, M7 killed. Every restore byte-equal and hash-equal to HEAD blob. Logs under qa/evidence/calendar-page-freshness/.

## Remaining (for the next dispatch)
1. Mode D: own Playwright run against a local Vite dev server on a loopback port with a faked API (no deployed address, no network): refresh with changed data keeps view, selection, detail panel and scroll; failed refresh shows the one notice; console error count per page; write qa/evidence/browser-calendar-page-freshness-<date>-checker/report.json.
2. T1-L1 stays NOT-MEASURED (hosted app, bot interval).
Reuse: everything above is reusable while the three source blobs and the test blob are unchanged.
