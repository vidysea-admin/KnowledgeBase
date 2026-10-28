# Manifest — search-store-injectable-handle

**Contract:** qa/contracts/search-route.md (invariant **[I6]**, the superset property)
**Goal task:** none (ledger-driven)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-076** (medium, the object-vs-source-text gap), **ISS-077** (medium,
the example-based property test). ISS-073 remains open by design.

## Why

The `search-prefilter-bypass-pin` checker did what I asked and found not one fourth bypass but
**three**, each keeping every source-text assertion satisfied with **99/99 green and typecheck
clean**:

- **4A** — build the filter correctly, then mutate it: `prefilter.$or = prefilter.$or.slice(0,1)`.
  The pin's guard is `/\$or\s*:/`; `$or =` has no colon. A strict-subset filter — a direct [I6]
  break — fully invisible.
- **4B** — launder it through a wrapper module the pin doesn't know about. Call count still 1, no
  forbidden token.
- **4C** — break `buildTurnPrefilter` itself in a direction my property test didn't sample
  (dropping pure-numeric tokens). Against **production Mongo**: `"2026 intake"` returned
  **14 hits prefiltered vs 20 full-scan — 6 real hits silently lost**, with all 99 tests green.

Its diagnosis is the part that matters: **a source-text pin can only pin the previous attack's
syntax, so it loses this race by construction.** Both fix directions open by telling me what *not*
to do — ISS-076: *"DO NOT add a fourth string assertion."*

This is the fourth round of one lesson (ISS-069 → ISS-072 → ISS-074 → ISS-076/077), and the
progression is the same each time: I fix the layer just demonstrated and leave the next one open,
because I verify what I built rather than asking what an editor can still do. My own previous
manifest even named the correct remedy — an injectable collection handle — and then scoped it as
"a larger refactor, someday". The checker measured that it is not someday; it is the only remedy
that closes the class. It was right and I was wrong to defer it.

## What changed

1. **`apps/api/src/search-store.ts`** — `createMongoSearchDeps(deps: SearchStoreDeps = {})` now
   accepts `db?: Pick<Db, "collection">`, resolved **per call** (`deps.db ?? getDb()`) because
   production builds these deps at boot, before `connect()`. Tenant scoping is unchanged and still
   runs through `scopedCollection` on the injected handle — the injection does not reach past
   `scopedCollection`, it just stops it reaching past the injection to `getDb()`. This is exactly
   the shape `indexSession` gained for ISS-056, copied rather than invented.
2. **`apps/api/src/search-store.test.ts`** (new, 3 tests) — asserts the **filter object actually
   passed to `find()`**, captured through a fake db handle, is a superset of what the scorer can
   score. Also pins that an unmatchable query issues **no database query at all**, and that hits
   still resolve end-to-end through the injected handle.
3. **ISS-077 — the query set is now derived, not hard-coded.** `derivedQueries()` builds every
   single-word and adjacent-pair query from the fixture corpus (44 queries), so classes I would
   not have thought to list — numeric tokens, decimals, short words — arise on their own. The test
   asserts the generated set actually contains a numeric token, so the generator silently
   producing a weaker set is itself a failure.

## Evidence

**All three of the checker's bypasses, replayed. Each previously left 99/99 green:**

| bypass | source pin (old defence) | new object-level test |
|---|---|---|
| **4A** post-call mutation | *(green — invisible)* | **1 of 3 fails** |
| **4B** wrapper-module laundering | **3/3 PASS — blind to it** | **1 of 3 fails** |
| **4C** numeric-token removal in the builder | *(green — invisible)* | **1 of 3 fails** |

4B is the clearest evidence: the source pin passes cleanly while the object-level test catches it.
That is the structural difference the checker described, demonstrated rather than argued.

I tested all three rather than the two I was told about, because "I fixed the demonstrated case
and assumed the class" is precisely the error that produced ISS-072, ISS-074 and ISS-076 in turn.

Restored after each → `pnpm --filter @lkb/api test` **102/102** (99 pre-existing + 3 new).
`pnpm --filter @lkb/index test` 59/59 · `pnpm -r typecheck` exit 0 · `pnpm lint:structure` clean,
0 dependency violations / 264 modules.

**Live parity against production Mongo** (read-only, script deleted; exercises the **real**
`getDb()` path with no injection, so the new default parameter is proven not to have changed
production behaviour): identical turnIds and scores across all 6 queries,
`RESULT PARITY ACROSS ALL QUERIES: YES`.

**Latency: still declining to quote a headline figure.** Five measurements now exist across these
units (~30%, ~17%, ~9.8%, and runs at 957ms and 925ms against a 1422ms baseline). Direction
consistent, mechanism measured (transfer 1064ms vs compute 38ms), magnitude network-dominated. The
previous checker suggested committing to a *floor* instead — "never slower on the same query" —
which is a genuinely better shape, and I am flagging it as a follow-on rather than silently
adopting it, since it needs its own measurement design to be meaningful.

## What this does and does not close

**Closes:** any bypass that corrupts the filter object reaching Mongo, regardless of *where* the
corruption happens — inline, post-call, laundered, or inside the builder. That is the class,
because damage requires corrupting that object.

**Does not close:** a change that swaps the fake's own semantics, or that abandons
`createMongoSearchDeps` entirely for a different code path. The first is a test-integrity problem
rather than a product one; the second is what the existing source pin still covers — the two
defences are now complementary rather than redundant, which is why I kept both.

**Still open by design:** ISS-073 (Unicode case-folding, 0/2118 occurrences, needs Mongo-side
collation). The previous checker's caveat stands and I am recording it again rather than acting on
it: *"0 occurrences is a snapshot and nothing watches the transition"* — the proportionate
strengthening is monitoring that count, which is its own unit.

## How to verify (checker)

1. Read `search-store.ts` — confirm `db` is resolved per call, not at construction, and that
   `scopedCollection` still wraps the injected handle (tenant scoping must not have been weakened
   to gain testability).
2. Read `search-store.test.ts` — confirm the captured filter is the object passed to `find()` and
   is not re-derived, and that `derivedQueries()` genuinely generates rather than hard-codes.
3. **Replay all three bypasses yourself** (4A/4B/4C as described above); each must fail the new
   test. Confirm 4B still *passes* the source pin — that contrast is the unit's core claim.
4. **Then try to find a fifth.** I have been wrong about "the class is closed" three times running,
   so treat my claim as a hypothesis. In particular: can you corrupt results while keeping the
   captured filter a valid superset — e.g. by corrupting `k`, the scoring call, or the
   turn/session resolution *after* the fetch? Those are downstream of everything this unit pins.
5. `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (59/59), `pnpm lint:structure`, and
   reproduce live parity yourself against real Mongo.
6. Judge whether keeping BOTH the source pin and the object-level test is right, or whether the
   source pin is now redundant and should be deleted.

## Risk / rollback

One optional parameter with a default preserving current behaviour, plus tests. Production path
unchanged and verified live. Read-only against the database. Reversible by `git revert`.

**Status: checked-PASS** — PASS from `qa/verdicts/search-store-injectable-handle.md` (Cycle checked: 1, matching Fix cycle 1), committed `ebceae2`. The checker found a fifth bypass (5A, tenant assertion missing from the object-level test) plus four more it had predicted; filed ISS-078..082, none blocking. Closed out 2026-09-08.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
