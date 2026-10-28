# w27-partialtree

Status: checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/w27-partialtree.md
Fix cycle: 0
Base: 2ff2b7f3a64a2ebaea43781e08860de18de7f72c (lane/w27-partialtree; origin/master has since moved to 1b80673e, not merged)
Candidate: see the commit that adds this file (git log -1 on lane/w27-partialtree)
Decision: D-190 (2026-10-22, Umesh verbatim; links T-043, G5). No earlier decision mandated all-or-nothing, so no Supersedes.

## What changed
- apps/api/src/indexing/eligible-tree.ts: `eligibleTreeInput` keeps every per-page gate unchanged. The tenant-level rule (`allowed.size === sessions.length && safePages.length === pages.length`) is replaced by: a cached root is served only if every session it cites is currently eligible (`cachedContributorsSafe`), and zero eligible sessions out of a non-empty tenant serves nothing (404). Returns `excluded: { total, reasons }` (counts by category: not-visible, no-page, transcript-mismatch, page-invalid, identity-invalid, unsupported-text; no ids). Optional `{ rebuildOnNewEligible }` (index-write path) drops a cached root that lacks an eligible session other than the one being indexed.
- Pre-existing defect fixed because it kept staging at 404: `cachedContributorsSafe` required an org node title to appear in page text, but buildTree titles org nodes from `session.org`. An org node whose title exactly equals the current session's org (and has no summary) is now supported; a tampered title is still refused.
- apps/api/src/indexing/session.ts: both indexing callers pass `rebuildOnNewEligible: [sessionId]`.
- apps/api/src/composition/integrations/trusted-readers.ts, src/store.ts, src/routes/ask/ask.ts: `TreeStore.loadWithExclusions` (optional); /ask responses add `excludedSessions` and `exclusionReasons`. `load` keeps its old shape.
- apps/api/src/routes/graph.ts + trusted reader: /graph adds the same two fields.
- apps/web: `AskResponse` types; AskPage shows "N sessions not yet indexed and excluded from answers" when N > 0.
- docs/DECISIONS.md: D-190 via scripts/append_decision.ps1.
- Tests: apps/api/src/indexing/tree-cache/eligible-tree-partial.test.ts (7), AskPage.test.tsx (+2).

## Cache keying and invalidation
There is no separate cache key: the stored `tree_index` root is compared with current inputs on every read and every index write. Read: root is served only if all cited sessions are safe now. Write: `cachedRootMatchesCurrent` (packages/index, unchanged) compares reused years to a fresh build from eligible input, and the new `rebuildOnNewEligible` gap check rebuilds when an eligible session is absent. A root that cites a session that became ineligible is not served on read until the next index write rebuilds it (it 404s in the meantime).

## Checks run
- api tsc: exit 0. web tsc: exit 0.
- New test file: 7/7. Related api tests (47 files that touch eligibility, cached root, tree store, ask/graph 404; mongo-backed files excluded because they need a real server): 599 tests, 598 pass, 0 fail, 1 skipped (pre-existing).
- Web vitest AskPage.test.tsx: 13/13.
- `node scripts/lint-loc.mjs --all`: OK, 10 stages, 0 failed.
- D-020 mutations on eligible-tree.ts (per-mutation backup, restored and cmp-verified; each run killed): M1 drop the safeSessions exclusion filter (5 of 6 then-tests failed); M2 cachedContributorsSafe forced true (1 failed); M3 remove the new-eligible rebuild check (1 failed); M4 excluded count forced 0 (3 failed); M5 remove the session.org support (4 failed).

## Live (staging lkb_staging, API on port 3395, stopped afterwards)
- Before the change /ask and /graph on tenant toc returned 404.
- toc then had 22 sessions: 4 excluded, all `unsupported-text` (legacy-unbound sessions without an index binding), not the 2+2 split in the brief. The root was also rejected only by the org-title defect above.
- After: GET /graph 200 with excludedSessions 2 and exclusionReasons {"unsupported-text":2} (staging data changed meanwhile: eligible 18 -> 19+).
- POST /ask "What did the speakers say about careers in law?" got past the tree (no 404) but returned 503 `source_context_unavailable` ("answer support or relevance refused") after about 215 s, twice. No answer or citations were produced, so excludedSessions was not returned on that body. Cause is downstream of the tree (bounded answer grounding) and was not investigated here.

## For the checker
Re-run the new test file and the 47-file set; confirm no excluded session id or content appears in any response; confirm zero-eligible 404; review the org-title relaxation (the only change that loosens `cachedContributorsSafe`).
