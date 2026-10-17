# t057-analytics-page - independent cycle 0

VERDICT: PASS
Cycle checked: 0
ISSUES-WRITTEN: none

Scope of this PASS: SOURCE SCOPE ONLY. It certifies the read-only analytics page source at commit 071f9e6 against qa/contracts/t057-analytics-page.md C1-C9 (code reading, targeted vitest, tsc, mutations). It does NOT certify rendered behaviour: no browser, Playwright or dev server was run (shared CPU). Live-browser validation under D-024 (contract C10; manifest NOT DONE list) is still owed before the page, or T-057 analytics, is called done. Full T-057 and the other catalogue areas remain HOLD.

## Commands (worktree C:\Users\product\Desktop\KnowledgeBase-lanes\t057an, apps/web, node v24.19.0)

- `timeout 170 node node_modules/vitest/vitest.mjs run src/pages/analytics` -> exit 124, "Worker exited unexpectedly" (default parallel pool starved by the shared CPU; no assertion ran). Recorded, not hidden.
- `timeout 300 node node_modules/vitest/vitest.mjs run src/pages/analytics --maxWorkers=1 --minWorkers=1 --pool=threads` -> exit 0: `Test Files 2 passed (2)`, `Tests 20 passed (20)`, Duration 32.10s.
- `timeout 180 node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` -> exit 0, no output, real 0m51.6s.
- Hand-fixture probe (tsx, throwaway file outside the repo) over analyticsModel.ts; results in the table.
- No App/NavSidebar-specific test files exist; AnalyticsPage.test.tsx includes "registered in the protected router and navigation" (passes) and "direct route without a key shows the login gate and performs no read".

## Per-point findings

1. Scope: `git show --stat 071f9e6` = App.tsx +2, NavSidebar.tsx +1, five analytics files, manifest. Nothing in apps/api, no package.json. App.tsx adds the route directly after `/activity-health` inside the same LoginGate/AppShell; NavSidebar adds `{ to: "/analytics", label: "Analytics", icon: <DashboardIcon /> }` directly after the Activity & Health entry, same shape (DashboardIcon already imported). Neither file gates the sibling by scope or permission, so nothing diverges.

2/3. Figures (hand fixture vs probe) and route shapes:

| Figure on page | Source and field (verified to exist) | Hand-computed vs probe | Zero/invalid handling |
|---|---|---|---|
| "N sessions; M with index status done" and per-month bars | GET /sessions (brain.ts:180, unpaginated `find({})`), `date`, `status.index` (core sessions.ts: pending/processing/done/failed) | 10 rows (1 junk string, 5 undated/invalid, 2 in 2026-01 incl. `2026-01-31T23:59:59-05:00`, 2 in 2026-02) -> total 9, Jan 2, Feb 2, undated 5, indexed 1, malformed 1: matches | zero sessions -> "No sessions were returned" |
| "claims in X of Y sampled sessions; verified claims: p% (a of b)" | GET /sessions/:id `claims[]._id/status` (types.ts Claim: verified/needs-review/conflicting) | 4 raw claim entries (2 valid, 1 missing _id, 1 string) -> total 2, verified 50% (1 of 2), malformed 2: matches | 0 claims -> `n/a (no rows)` |
| "Turns with a resolved speaker name: p%" | `turns[].speakerLabel` (optional field exists: whatsapp/store.ts:175, ingest whatsapp.ts:133) | 4 turns, labels "Bob", absent, "  ", "Al" -> 2 of 4 = 50%: matches | 0 turns -> `n/a (no rows)` |
| "Graph edges with evidence: p%" | GET /graph `edges[].evidence[].turnId` (GraphEvidence.turnId), `stats.sessionsInGraph/sessionsTotal` | 4 edges, 1 with a non-empty turnId -> 25% (1 of 4): matches | 0 edges or null graph -> `n/a (no rows)` |
| Gaps by status | GET /gaps `status` open/received/expired | open 1, other 1, malformed 1: matches | unknown statuses counted as "another status", not lost |
| Jobs by status | GET /jobs?limit=50 `status`, `truncated`, `limit` (jobs/router.ts returns exactly `jobs,limit,truncated`; client re-validates and throws 503 on mismatch) | empty -> zeros | "Capped at the 50 newest jobs; older jobs are not counted." when truncated; Source line always says "A sample of recent jobs, not a lifetime total." |

No assumed field is missing. The sample qualifier ("Sample: the N most recent sessions (up to 10), not all sessions.") sits at the top of the Claims and speakers panel, which contains every sampled figure (claims, verified share, per-session bars, speaker share). The speaker figure is labelled as turns, and its Source line says claims carry no speaker. The graph Source line says "This measures graph edges, not individual claims."

Label observations (low; no number is wrong): (a) panel title "Sessions ingested over time" actually buckets the session `date`; the Source line says "month of the session date, not of upload", so the title overstates slightly. (b) Panel title "Citation coverage" over the body "Graph edges with evidence: ..." could be read as claim citation coverage; the body and Source line say edges. (c) A well-formed but calendar-impossible date (`2026-02-30`) is bucketed into February (regex checks month, not day). (d) `ratio()` returns null when numerator exceeds denominator, so an impossible ratio shows "n/a" rather than over 100%.

4. Tenancy/auth: `useAuth().apiKey` is the only input; all calls go through `listSessions/getSession/listGaps/loadGraph/listJobs` -> `apiFetch` (same helper as ActivityHealth, including the 401 invalidation event). 403 maps to "This API key lacks permission to read X." (ActivityHealth does the same for jobs). No module-level cache. `loaded` is keyed by `{key, generation}` and the effect has a `cancelled` guard, so a late old-key result is discarded. Detail ids come only from the tenant-scoped list result; `getSession` URL-encodes the id. Logged-out performs no request (tested).

5. Failure isolation: each source goes through `part()`, so one rejection yields its own `role="alert"` (tested: 403 jobs + 503 gaps while sessions still render). Detail fetches are bounded by `slice(0, 10)`, run once inside `loadAnalytics`, and the effect depends on `[apiKey, generation]` only (no fetch in render, no storm). Partial detail failures use `allSettled` and are disclosed ("N detail requests failed"). Low caveats: `apiFetch` has no timeout, so a hanging request leaves "Loading analytics…" showing (a visible message, same as siblings); GET /graph returns 404 for a tenant with no graph yet, which this page shows as the generic "Unable to load the graph." (B8 distinguishes it, this page does not).

6. Rendering safety: no dangerouslySetInnerHTML and no href or URL built from data; ids rendered as text sliced to 24 chars; bar widths are numeric from counts.

7. Tests/tsc: see Commands. Mutations below.

8. Month bucketing: prefix-only (`YYYY-MM-`), no Date parsing, so no timezone shift: `2026-01-31T23:59:59-05:00` stays January (the session's own calendar date, matching the "month of the session date" label). `2026-13-01`, `01/02/2026`, `2026-1-05`, null, missing and non-string all go to "undated" and are disclosed on the page ("N have no valid date and are not placed on the timeline"). An all-undated list gives `Math.max(...[])` = -Infinity but the Bar guard (`max > 0`) renders no bars; no crash.

9. Manifest vs observation: test count (20), clean tsc, files, route and nav registration and the left-out list all match. Test duration differs (maker 105 s, here 32 s with one worker). The NOT DONE section names states, widths, accuracy comparisons and network checks concretely.

## Mutations (per-mutation byte backup, restore in a subshell trap on EXIT/INT/TERM/ERR, 150 s timeout each, then `git hash-object` compared with `git rev-parse HEAD:<file>`)

| # | Mutation | Result |
|---|---|---|
| M1 | analyticsModel.ts `ratio`: `denominator > 0` -> `denominator >= 0` (drop zero guard) | KILLED (5 tests failed) |
| M2 | analyticsModel.ts `speakerResolution`: resolved = `good.length` (all turns resolved) | KILLED (2 failed) |
| M3 | AnalyticsPage.tsx: replace the "Sample: the N most recent sessions (up to 10), not all sessions." sentence with "Sessions." | SURVIVED (20/20 pass) |
| M4 | analyticsModel.ts month regex `(0[1-9]|1[0-2])` -> `(0[2-9]|1[0-2])` (January dropped) | KILLED (1 failed) |

M3 survived: no test asserts the sample sentence (nor the jobs "Capped at" note). This is a coverage gap on a load-bearing honesty label, not a wrong number; the source is correct. Recorded as a low observation per the Verdict rule, not entered in the backlog. The browser check, and any later unit touching this file, should look at the sentence directly.

HEAD-fidelity after all mutations: analyticsModel.ts 495e697610d078f6d066f78e2a9cdcde993e529c equals its HEAD blob; AnalyticsPage.tsx aa34e24df9732333df1f832cf628000d3a70a084 equals its HEAD blob; `git status --short` was clean before the checker files were added.

## EXPLANATION

No wrong or misleading number, no assumed field that does not exist, no tenancy or auth divergence from ActivityHealthPage. Every percentage routes through `ratio()`; zero denominators render "n/a (no rows)". Sampled and capped figures are labelled in the panel that shows them. The low observations (two slightly broad panel titles, the unasserted sample sentence, no request timeout, graph 404 shown as a generic error) do not enter the backlog. `ISSUES-WRITTEN: none` is a complete check. PASS certifies source scope for commit 071f9e6 only; live-browser validation (D-024) is still owed.
