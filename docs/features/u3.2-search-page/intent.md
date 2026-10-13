# Intent - u3.2-search-page

**Status:** documents what shipped for U3.2 as of 2026-10-13. Written after the build (slice `u3-2-global-search-bar`, checker PASS cycle 0, source scope) and the live browser check (D-146). U3.2 stays `in_progress` in `.goal/goal.json`; this folder satisfies the `docs/plan.md` row 15 precondition ("needs `docs/features/u3.2-search-page/` first").
**Feature of:** goal.json U3.2 "Search page / global search bar" (deps U3.1, delivery group G5). Builds on U0.7 (`GET /search`) and U1.5 (web search page).

## Problem

A signed-in user could search only from the `/search` page itself. From any other screen there was no way to ask "where was this said?" without first navigating there.

## Outcome

- A global search bar on every signed-in screen that takes the user to `/search?q=<query>`.
- A Search page that shows lexical passage hits from the user's own tenant, each with a link that opens the transcript on the cited turn.

## Users

`docs/plan.md` row 15 names two personas for the persona walk: `umesh-operator` and `external-developer`. The live check in `qa/evidence/u32-browser-check-2026-10-13/README.md` was a single scripted Chrome session; it is not a per-persona walk.

## Constraints

- Tenant scope comes from the API key. The client never sends a tenant selector.
- Query text is untrusted (URL `?q=`): rendered as text only, decoded once, capped at 512 code points. See spec.md.
- Retrieval is lexical only today. Semantic and hybrid ranking are pending embeddings (see spec.md, Pending).

## Not in this feature yet

- "Send to Ask" handoff (needs an Ask-page `?q=` contract first).
- Filters and pagination on the Search page; autosuggest on the bar.
- Semantic or hybrid ranking.
