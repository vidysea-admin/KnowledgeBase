# t057-analytics-page

Status: ready-for-check
**Handshake status:** ready-for-check
Fix cycle: 0

Task T-057 (Sessions explorer graph health jobs analytics notifications Sheets and setup UI), the "analytics" part only. Lane T057AN (branch lane/t057an, base 536a56a). Read-only page; no API route added or changed, no dependency added, no write path. UI-touching (D-024): this unit can reach ready-for-check but CANNOT PASS until a live browser check is run (no browser on this machine now). No qa/contracts file exists for this unit; the checker must supply one. No ledger issue is being fixed (D-015 corpus not applicable). No new issues filed (qa/issues.t057an.jsonl not created).

## Files

New (apps/web/src/pages/analytics/): analyticsModel.ts (86), analyticsClient.ts (39), AnalyticsPage.tsx (95), analyticsModel.test.ts (87), AnalyticsPage.test.tsx (71). Edited: apps/web/src/App.tsx (+2: import and `/analytics` route inside the existing LoginGate/AppShell, beside `/activity-health`), apps/web/src/layout/NavSidebar.tsx (+1: "Analytics" link). Budgets: all source < 300, tests < 400; `node scripts/lint-dirsize.mjs` OK before (109 dirs) and after (110 dirs).

## Figures and data source

| Figure | Route and field | Pure function |
|---|---|---|
| Sessions ingested over time (per month of the session `date`), sessions total, indexed count, undated | GET /sessions: `date`, `status.index === "done"` | sessionsOverTime |
| Claims total, sessions with claims, claims per session, verified share | GET /sessions/:id for the 10 newest sessions (sample, stated on the page): `claims[].status` | claimsPerSession |
| Share of turns with a resolved speaker (non-empty `speakerLabel`) | same detail fetches: `turns[].speakerLabel` | speakerResolution |
| Citation coverage: share of graph edges with at least one `evidence[].turnId`; sessions in graph of total | GET /graph: `edges[].evidence`, `stats.sessionsInGraph/sessionsTotal` | graphEvidence |
| Knowledge gaps by status | GET /gaps: `status` | gapCounts |
| Recent provider jobs by status (50 newest, truncation noted) | GET /jobs?limit=50: `status`, `truncated` | jobCounts |

Every percentage goes through `ratio()`: zero or invalid denominator gives null, shown as "n/a (no rows)". Every panel prints its own source line. Each source fails independently (own role=alert, 403 gives a permission message). Tenant scope is the API key only via the existing `useAuth` + `apiFetch`; there is no tenant input on the page.

## Left out (would need an API unit)

- Share of claims with a resolved speaker: claims carry no speaker or turn reference in any served route (Claim = _id, text, status). Turn-level speaker resolution is shown instead and labelled as turns.
- Per-claim citation coverage: no served route links claims to evidence. Graph-edge evidence coverage is shown instead and labelled as edges.
- Full-corpus claims per session: needs a bulk claims/counts route; only the 10 newest sessions are sampled (N+1 detail fetches otherwise).
- Lifetime job/upload counts and over-time job trends: /jobs is a 50-row sample; the upload-queue totals live in the activity-health client and were not duplicated.

## Evidence

Commands run from `apps/web` in the worktree, node v24.19.0 from the codex runtime on PATH, node_modules junctioned to the main tree (toolchain note).

`timeout 170 node node_modules/vitest/vitest.mjs run src/pages/analytics` ->
```
 ✓ src/pages/analytics/analyticsModel.test.ts (14 tests) 35ms
 ✓ src/pages/analytics/AnalyticsPage.test.tsx (6 tests) 1985ms
 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  105.45s
```
`timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` (apps/web) -> no output (no errors), 51.8 s.
Not run: full web suite, other pages' tests (CPU shared with production worker). The nav/App edits are additive; sibling integration tests assert specific links, not link counts, but were not re-run.

## NOT DONE (for the later browser check)

Nothing here has been rendered in a browser; jsdom tests only. A browser check must open `/analytics` (via the sidebar link "Analytics" and by direct URL) and look at:
- States: loading ("Loading analytics…"), populated, empty tenant (all five empty notes, no NaN/Infinity), one source failing (403 on /jobs, 5xx on /gaps) with others intact, logged-out (login gate, no requests), Refresh.
- Widths: ~360 px, ~768 px and desktop. Check month bar rows wrap without horizontal scroll (bars use `maxWidth: 60%` of an inline-block in a wrapping flex row, so bar length is relative to its container, not to the row; confirm it looks sensible), long session ids truncated at 24 chars in the claims list, and light/dark theme contrast of bars (`var(--accent)`).
- Accuracy against a real tenant: month counts vs the Sessions page, claims sample size note, graph evidence percentage vs /graph.
- Network: only GET requests, Authorization header present, no tenant parameter.
