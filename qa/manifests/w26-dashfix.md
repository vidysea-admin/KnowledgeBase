# w26-dashfix: dashboard panels fail independently; Sessions "index: pending" investigated

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w26-dashfix.md
Fix cycle: 0
Lane: KnowledgeBase-lanes/w26-dashfix  Branch: lane/w26-dashfix  Base: fd471686
Candidate SHA: see `git log -1 lane/w26-dashfix` (the commit that adds this file)

## Bug
Live 2026-10-21: /sessions, /sources, /gaps returned 200 but /keys returned 503 `hosting_unavailable` (T-028 not configured). `DashboardPage` used one `Promise.all` and one error state, so the whole page showed only the error.

## Fix (apps/web/src/pages/DashboardPage.tsx)
- Each of the four panels (sessions, sources, keys, gaps) has its own loading/ok/error state, filled by its own promise. A failure shows one inline note; the other panels render.
- 503 shows `API keys unavailable (hosting not configured)`; other errors show `<Panel> unavailable (<ApiError message>)`.
- Other pages with `Promise.all` were looked at and not changed (not trivial; no refactor).

## Second item: Sessions "INDEX: PENDING" (NO code change)
- Web `SessionsListPage` renders `s.status.index` verbatim (CSS uppercases it). `GET /sessions` returns raw session docs (`createMongoBrainReadDeps().listSessions`, apps/api/src/store.ts), so the web reads the correct field.
- The field is set to "pending" by design: native-archive source swap (`mutateNativeCaptureSource`, apps/api/src/indexing/native-archive/publication.ts:103,110) resets `status.index` to "pending" and unsets `indexAttempt`; "done" is only written by indexing/generation.ts:228 on a completed attempt.
- So the data says pending. Chunks existing for tenant `toc` (785) does not contradict that: chunks can exist while the session doc is reset/never flipped. Not checked against staging data (no DB access in this unit). Needs a staging look at those session docs: `status.index` vs `indexAttempt.state` vs chunk `sessionId`s. Not a display bug, so no test added for it.

## Changed paths
apps/web/src/pages/DashboardPage.tsx, apps/web/src/pages/DashboardPage.test.tsx, qa/manifests/w26-dashfix.md

## Checks (actual)
- vitest (apps/web): `DashboardPage.test.tsx` + `App.routes.test.tsx`: 2 files, 8 tests passed. New: 503-on-/keys keeps other panels and shows the hosting note; failed /gaps only affects Knowledge health. Existing 403 test updated to the per-panel wording.
- tsc: `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in apps/web: exit 0.
- lint-loc --all: under heavy load three stages hit the script's own 120 s timeout (loc, dupes, lint-tests). Re-ran individually with 500 s: loc OK (1799 files), dupes OK, lint.test.mjs 18/18 pass. dirsize, root, migrations, codex-hooks, snapshot OK in the --all run; tracker gate exit 0 (advisories only). `dependency` stage exit 150 (918 errors, `no-unresolvable-workspace-import ... -> express`): lane node_modules junction environment gap, same on any lane, unrelated to the changed files; a checker should run it on the main tree.
- D-020 mutation: swapped the per-panel error handler for a no-op. Result: 3 of 5 DashboardPage tests failed (killed). Per-mutation backup + trap on INT/TERM/ERR; restored, `cmp` against backup clean; final HEAD-fidelity hash check recorded in the commit step.
