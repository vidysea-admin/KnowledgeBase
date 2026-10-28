# Manifest — citations-route

**Contract:** none existing covers this directly (plan §10 U0.8). Proposed criteria below for the
checker to adopt or amend as `qa/contracts/citations-route.md`.
**Goal task:** none (plan §10 U0.8 — Phase 0 finish item)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none (un-stubs a route, not a bug fix)

## Why

Plan §10, Phase 0 (`U0.8 — GET /citations/:claimId un-stub`): claim → evidence turnIds → real
turn text + session + timestamp, so an `/ask` answer's citation chip can be drilled into and
checked against the actual transcript. This was one of three remaining honest `501` stubs in
`apps/api/src/routes/stubs.ts` (`/search`, `/citations/:claimId`, `/webhooks/register`). Depends
on nothing new — `claims`, `turns`, `sessions` accessors and their generated types already
existed (used by `routes/brain.ts` already).

## What changed

1. **`apps/api/src/routes/citations.ts`** (new) — `GET /citations/:claimId`, injected
   `CitationsDeps.getCitation(tenantId, claimId)`, same pattern as `routes/brain.ts`: requires
   the `citations` scope, 200 with `{claim, evidence: [{turnId, sessionId, turn, session}]}` on a
   hit, 404 (not a stub 501) on an unknown claim id for that tenant. Each evidence entry's `turn`/
   `session` fields are independently nullable (`null` if the cited row no longer exists) rather
   than the whole citation failing — evidence integrity should be visible per-item, not all-or-
   nothing.
2. **`apps/api/src/store.ts`** — `createMongoCitationsDeps()`: `claimsColl(tenantId).findOne`
   for the claim, then resolves every `evidence[]` entry's turn + session in parallel via
   `Promise.all` (bounded — a claim's evidence array is JSON-Schema `@minItems 1`, never
   unbounded, so no batching/pagination layer is warranted at this scale).
3. **`apps/api/src/server.ts`** — added `citations: CitationsDeps` to `ServerDeps`, mounted
   `createCitationsRouter(deps.citations)` right after the brain router (before `createStubsRouter()`,
   so the real route wins over any stub match — Express matches in registration order).
4. **`apps/api/src/production.ts`** — wires the real `createMongoCitationsDeps()`.
5. **`apps/api/src/fixtures.ts`** — `fakeCitationsDeps()`, sharing the same `claim-1`/`t1`/
   `session-1` fixture ids `fakeBrainReadDeps()` already uses, so a test can cross-check
   consistency between the two routes' fixture data.
6. **`apps/api/src/routes/stubs.ts`** — removed the `/citations/:claimId` entry from
   `STUB_ROUTES` (its `501` no longer fires — the real router matches first) and updated the
   file's own top comment, which named it explicitly.
7. **`apps/api/src/routes/citations.test.ts`** (new, 3 tests) — 200 with real claim+evidence
   shape (resolved turn text, resolved session title); unknown id → 404 not 501; missing scope →
   403 not a silent 200.

No `packages/*` change was needed — `Claims`, `Turns`, `Sessions` types and their `@lkb/db`
accessors already existed. `scripts/seed-demo-server.mjs` already registers the `citations`
scope (unused until now).

## Evidence

`pnpm --filter @lkb/api typecheck` — clean.
`pnpm -r typecheck` — all 10 workspace projects clean.
`pnpm --filter @lkb/api test` — 80/80 pass (76 pre-existing + the 3 new citations tests + the
pre-existing "hitting a stub route gets 501" test still passes, unaffected — it only exercises
`/search` and `/webhooks/register`, not `/citations`).
`pnpm lint:structure` — clean (227 files in budget, 249 modules / 741 dependencies cruised, 0
violations, tracker-audit gate G1 OK).

**Mutation-tested with proof of application**: reverted the 404 branch's condition from
`if (!citation)` to `if (false)` (confirmed via `git diff`/note the file content changed), re-ran
`citations.test.ts`: **2/3 pass, exactly the "unknown id returns 404" test reddened**
(`AssertionError: 200 !== 404`). Restored, re-ran: 3/3 green.

**Real, honest score movement** — `node scripts/catalogue-score.mjs`: **20.2% → 21.9% adjusted,
28.9% → 30.7% machine-derived** (57 features unchanged). This un-stub flips a feature's derived
verdict from STUB to REAL/PARTIAL per the catalogue's route probe against `GET /citations/:claimId`
(the scorer's route-scrape signal, not a manual edit — confirmed no `.goal/catalogue.json` manual
override was touched). This is the expected, honest kind of movement plan §10 explicitly wants:
a real capability going from stub to real, measured by the same machine signals as everything
else, not a metric-gaming edit.

## How to verify (checker)

1. Read `apps/api/src/routes/citations.ts` — confirm the injected-deps pattern, the 404-vs-501
   distinction, and per-evidence-item null-safety.
2. Confirm `apps/api/src/routes/stubs.ts` no longer lists `/citations/:claimId` and its comment
   is updated.
3. Run `pnpm --filter @lkb/api typecheck` and `pnpm -r typecheck` — both clean.
4. Run `pnpm --filter @lkb/api test` — 80/80.
5. Reproduce the mutation: revert the 404 condition to `if (false)`, confirm via `git diff` the
   content changed, re-run `citations.test.ts`, confirm exactly the 404 test reddens, restore,
   confirm 3/3 green again.
6. Confirm `pnpm lint:structure` clean and `node scripts/catalogue-score.mjs` reproduces the same
   21.9%/30.7% figures (re-derive, don't trust the paste).
7. Consider whether `qa/contracts/citations-route.md` is warranted (checker territory per
   ISS-006 — the maker deliberately did not draft one).

## Risk / rollback

Pure additive route + one contract-relevant score change. Reversible by `git revert`. No
production data touched (read-only route).

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
