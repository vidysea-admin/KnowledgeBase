# Manifest — search-route

**Contract:** none existing covers this directly (plan §10 U0.7, second half). Proposed criteria
below for the checker to adopt or amend as `qa/contracts/search-route.md`.
**Goal task:** none (plan §10 U0.7 — Phase 0 finish item, closes it out entirely)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none (new capability, not a bug fix)

## Why

Plan §10, U0.7 (second half — first half, `/health`, shipped separately this session):
"`/search` starts lexical over `turns`/`session_pages`, returning `/ask`'s citation shape."
Un-stubs the last GET route still returning an honest 501 (`/webhooks/register` is now the only
stub remaining). Also unblocks two things the plan names explicitly: the U1.5 hybrid-merge
scorer (which is meant to reuse this lexical scorer) and the Ask/Search UI.

**Scoping decision, disclosed:** built lexical search over `turns` only, not `session_pages` —
`turns` is the atomic evidence unit every other citable surface in this codebase already
resolves to (`routes/citations.ts`'s evidence, `routes/brain.ts`'s session detail), so a turn-
level hit is directly consistent with those shapes. `session_pages` (LLM-generated summaries)
would need a materially different scoring target (summary prose vs. verbatim turn text) and its
own enrichment shape — a natural, disclosed follow-on unit, not attempted here, matching the
same "build the smaller reviewable half first" discipline `health-route` used for U0.7's first
half.

**"Returning `/ask`'s citation shape" — interpreted, not literal.** `/ask`'s actual `AskResult`
returns tree-node sources (`{node_id, evidence?}`), which has no meaning for a keyword search
with no tree involved. The shape this route actually reuses is the one `routes/citations.ts`
already established this session — `{turnId, sessionId, turn, session}` — because that is the
concrete, resolvable "you can click through to the real evidence" shape the plan's language is
clearly gesturing at. Flagging this interpretation explicitly for the checker to confirm or
correct rather than silently assuming it's obviously right.

## What changed

1. **`packages/index/src/search/lexical.ts`** (new) — pure `lexicalSearchTurns(query, turns, k):
   LexicalHit[]`, same tokenize+overlap technique already used three times in this codebase
   (`apps/api/src/score.ts`'s `heuristicScore`, `packages/index/src/eval/heuristic-retriever.ts`,
   `extract-topics.ts`'s heuristic extractor) — reused deliberately rather than introducing a
   fourth, different scoring approach for what the plan itself calls a starting "lexical"
   implementation. Filters out zero-overlap turns entirely (never returns a `score: 0` hit),
   sorts descending, caps at `k`. No I/O.
2. **`packages/index/src/search/lexical.test.ts`** (new, 6 tests) — ranking, zero-overlap
   exclusion, `k` limiting, empty-query safety (never a match-all), score range `[0,1]`, sort
   order.
3. **`packages/index/src/index.ts`** — exports `lexicalSearchTurns`, `LexicalHit`,
   `SearchableTurn`.
4. **`apps/api/src/routes/search.ts`** (new) — `GET /search?q=<query>&k=<n>`, injected
   `SearchDeps.search(tenantId, query, k)`. Empty/missing `q` → 400 (never a silent empty
   200 or a stub 501). `k` defaults to 10, clamped to a max of 50 (bounds an unauthenticated-
   scope-but-otherwise-arbitrary caller from requesting an unbounded result set).
5. **`apps/api/src/store.ts`** — `createMongoSearchDeps()`: loads the tenant's turns once,
   scores with `lexicalSearchTurns`, resolves each hit's own turn (already in hand from the
   initial load, no second query) and its session (deduped — a `Set` of distinct session ids,
   fetched once each, not once per hit).
6. **`apps/api/src/server.ts`/`production.ts`/`fixtures.ts`** — wired following the exact
   pattern `citations-route`/`health-route` already established this session.
7. **`apps/api/src/routes/stubs.ts`** — removed `/search`; `/webhooks/register` is now the only
   remaining stub; top comment updated.
8. **`apps/api/src/routes/search.test.ts`** (new, 4 tests) — real hits on a match; empty array
   on no match (never an error); missing `q` → 400; missing scope → 403.
9. **Fixed 3 pre-existing tests that assumed `/search` was still a stub** (a real, necessary
   consequence of this un-stub, not scope creep): `server.test.ts`'s "hitting a stub route gets
   501" test now uses only `/webhooks/register` (the sole remaining stub) instead of asserting
   `/search` returns 501; its sibling "scope check runs before the 501" test retargeted the same
   way; its rate-limit test's expected statuses updated from `501` to `400` (no `q` param) for
   the first two requests — the rate limiter still fires identically regardless of what the
   route itself would answer, which is the actual thing that test proves. `pages.test.ts`'s
   "lists both a real live route and a real still-stubbed route" test retargeted from
   `GET /search` to `POST /webhooks/register` as its stub example.

## Evidence

`pnpm -r typecheck` — all 10 workspace projects clean.
`pnpm --filter @lkb/index test` — 49/49 (43 pre-existing + 6 new).
`pnpm --filter @lkb/api test` — 89/89 (85 pre-existing, 3 fixed for the un-stub, 4 new
`search.test.ts` tests, net +4 total — 85 → 89 confirms nothing silently vanished).
`pnpm lint:structure` — clean (235 files in budget, 257 modules / 768 dependencies cruised, 0
violations, tracker-audit gate G1 OK).

**Real, honest score movement** — `node scripts/catalogue-score.mjs`: **21.9% → 24.6% adjusted,
30.7% → 33.3% machine-derived** (57 features unchanged), driven by the route-scrape signal
detecting the real new route, no manual `.goal/catalogue.json` edit.

**Mutation-tested with proof of application, twice** (both the route's own validation and the
pure scorer's core invariant):
1. **Route**: removed the empty-`q` 400 guard in `search.ts` — confirmed via `diff` against a
   backup the file genuinely changed — re-ran `search.test.ts`: **3/4 pass, exactly the "no q
   param returns 400" test reddened** (`200 !== 400`). Restored, re-ran: 4/4 green.
2. **Scorer**: removed the `score > 0` filter in `lexicalSearchTurns` — confirmed via `diff` the
   content changed — re-ran `lexical.test.ts`: **4/6 pass**, exactly the "zero-overlap turn is
   excluded" test AND the "scores are in [0,1]" test reddened (both depend on the same
   invariant — an unrelated turn's score-0 entry leaking through broke both). Restored, re-ran:
   6/6 green.

**Real live proof against production Mongo** (read-only — `find`/`findOne` only, no writes),
via a throwaway script deleted immediately after:
```
hits: 5
  score=1.00 session="Visa Blueprint Part 2: Italy, France, New Zealand" text="...Italy...France..."
  score=1.00 session="Visa Blueprint Part 2: Italy, France, New Zealand" text="Pre-enrollment..."
  score=1.00 session="In Focus #3" text="..."
  score=1.00 session="UK: Beyond Offer Letters" text="...panelists..."
  score=1.00 session="UK: Beyond Offer Letters" text="...gym analogy..."
nonsense query hits: 0
```
Confirms the real `createMongoSearchDeps()` finds genuinely relevant real transcript turns for
`"visa student university"` against the real `toc` tenant's 2118 turns, and returns zero hits
(not an error, not stale/cached data) for a deliberately nonsensical query — the exact behavior
`lexical.test.ts`'s "empty query" and "zero-overlap excluded" tests assert in isolation, now
also shown true end-to-end against real data.

## How to verify (checker)

1. Read `packages/index/src/search/lexical.ts` — confirm zero-overlap exclusion, the `[0,1]`
   score scale, and that it's a pure function (no imports beyond types).
2. Read `apps/api/src/routes/search.ts` — confirm the 400-on-empty-`q` guard and the `k`
   clamping (default 10, max 50).
3. Read `apps/api/src/store.ts`'s `createMongoSearchDeps()` — confirm turns are loaded once
   (not re-queried per hit) and session lookups are deduped.
4. Confirm `apps/api/src/routes/stubs.ts` no longer lists `/search`.
5. Judge the two disclosed interpretive choices in "Why" above — turns-only scope, and the
   `citations.ts`-style enrichment shape as the reading of "/ask's citation shape" — agree,
   amend, or flag for a human call if you think either reading is wrong.
6. Run `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (49/49), `pnpm --filter @lkb/api
   test` (89/89).
7. Reproduce both mutations: (a) remove the route's empty-`q` guard, confirm exactly the 400
   test reddens in `search.test.ts`, restore; (b) remove the scorer's `score > 0` filter,
   confirm the exclusion + scale tests redden in `lexical.test.ts`, restore. Confirm via `git
   diff`/backup comparison that each mutation genuinely changed the file before trusting the
   red/green result.
8. **Reproduce the live check yourself** against the real database — do not just trust the
   pasted transcript excerpts above.
9. Confirm `pnpm lint:structure` clean and the score genuinely reproduces at 24.6%/33.3%.
10. Consider whether `qa/contracts/search-route.md` is warranted (checker territory per
    ISS-006 — the maker deliberately did not draft one).

## Risk / rollback

Pure additive route + one contract-relevant score change. Reversible by `git revert`. No
production data touched (read-only route). The 3 fixed pre-existing tests are a real,
unavoidable consequence of removing the stub they were testing against — not an unrelated
change bundled in.

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
