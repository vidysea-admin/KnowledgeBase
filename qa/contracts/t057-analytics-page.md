# T-057 / analytics page - criterion contract

Checker-owned. Scope: the "analytics" part of T-057 only: a read-only `/analytics` page built from existing routes GET /sessions, GET /sessions/:id (10 newest, a sample), GET /graph, GET /gaps, GET /jobs?limit=50. This contract certifies source behaviour only. Live-browser validation (D-024; apps/web is in qa/ui-surfaces.json pattern) is a separate, still-owed criterion (C10). No ledger issue is being fixed, so no D-015 corpus applies.

## Criteria

- **C1 - Scope.** Only the five files under apps/web/src/pages/analytics/, a 2-line App.tsx edit, a 1-line NavSidebar.tsx edit and the manifest. No API route, no dependency, no change to other pages. The route sits inside the same LoginGate/AppShell as `/activity-health` and uses the same `useAuth` + `apiFetch` client.
- **C2 - Honest labels.** Each figure's label states what it measures: turn-level speaker resolution is labelled as turns (claims carry no speaker); graph-edge evidence is labelled as edges, not claims; the 10-session sample is stated wherever a sampled figure appears; the jobs list is stated as a capped recent sample, never a lifetime total.
- **C3 - Correct arithmetic.** Counts and percentages match a hand-computed fixture. Any zero, non-finite or numerator-over-denominator case yields the no-data text, never 0%, NaN or Infinity. Malformed rows are counted and disclosed, not silently dropped.
- **C4 - Producer compatibility.** Every field read exists in the served shape: sessions `date`, `status.index`; detail `claims[]._id/status`, `turns[].speakerLabel`; graph `edges[].evidence[].turnId`, `stats.sessionsInGraph/sessionsTotal`; gaps `status` (open|received|expired); jobs `status`, `truncated`, `limit`.
- **C5 - Auth and tenancy.** Tenant scope comes only from the API key via the shared client; no tenant or user input; no module-level cache; detail ids come only from the tenant-scoped list; logged-out state performs no request; 403 is explained as siblings do; late old-key results cannot overwrite a replacement key.
- **C6 - Failure isolation and load.** One failing source shows its own alert and leaves the others intact; detail fetches are bounded (<= 10, no fetch-in-render, stable effect dependencies); loading shows a status message.
- **C7 - Rendering safety.** API data is rendered as text only; no dangerouslySetInnerHTML; no URL built from API data.
- **C8 - Date bucketing.** Month buckets come from the `date` prefix; missing, non-string or malformed dates are counted as "undated" and disclosed, and never crash the page.
- **C9 - Verification.** Focused `vitest run src/pages/analytics` and apps/web `tsc --noEmit` pass; mutations of the zero guard, speaker count and month bucketing are killed. Mutation runs use a timeout and a per-mutation byte backup, and end with a HEAD-fidelity hash check.
- **C10 - Live browser (OWED, not certified by a source-scope PASS).** Open `/analytics` in a browser: loading, populated, empty, partial-failure, logged-out and Refresh states; ~360/768/desktop widths; bar rendering and theme contrast; month counts against the Sessions page; network shows GET only with Authorization and no tenant parameter.
