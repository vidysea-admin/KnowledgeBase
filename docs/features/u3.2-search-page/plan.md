# Plan - u3.2-search-page

**Status:** U3.2 is `in_progress`. One slice is merged; the rest is pending.

| # | unit | state | notes |
|---|---|---|---|
| 1 | `authenticated-search-transcript-navigation` (U1.5 base) | PASS (`qa/verdicts/authenticated-search-transcript-navigation.md`) | Search page, result links to transcript turns |
| 2 | `u3-2-global-search-bar` | checked-PASS cycle 0, source scope (vitest + jsdom + tsc) | global bar, URL-driven Search page, 512 cap. Manifest `qa/manifests/u3-2-global-search-bar.md` |
| 3 | live browser check, D-146 | done 2026-10-13: 21 PASS, 1 dev-server FAIL (ISS-U32LIVE-001), 2 not-yet items | `qa/evidence/u32-browser-check-2026-10-13/` |
| 4 | semantic / hybrid ranking on the Search page | pending embeddings | re-run live check P1 after embeddings finish (expected 14-15 Oct) |
| 5 | "Send to Ask" handoff | not built | needs an Ask-page `?q=` contract first |
| 6 | Mode D checker browser walk with personas (plan row 15) | not done | the D-146 run is a scripted check, not a persona walk |

## Order

4 depends on embeddings and an API change to `GET /search`; 5 depends on an Ask-page contract; 6 should follow 4 so the walk covers ranked results. None of them is scheduled by this document.

## Done condition for U3.2

Not set here. `.goal/goal.json` keeps U3.2 `in_progress`; closing it is the Approver's call.
