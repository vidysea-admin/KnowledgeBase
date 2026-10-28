# Manifest — Search turns-query count guard

**Contract:** `qa/contracts/search-route.md` C9 and I3
**Goal task:** retrieval reliability follow-up supporting U1.5/U3.2
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-085 (medium)
**Status:** checked-PASS

## Why

The shipped search store loads candidate turns once and resolves hits from an in-memory map, but
the suite did not count turns-collection calls. A regression that performed one additional
`turns.findOne` per hit preserved every returned value and left the full API suite green, despite
breaking the contract's explicit no-N+1 rule and adding up to 50 database round trips per request.

## Change, in place

The existing N+1 test in `apps/api/src/search-store.test.ts` now asserts all three query-shape
properties from the same captured request:

- exactly one `turns.find` loads candidates;
- zero `turns.findOne` calls occur while resolving hits;
- session lookups remain deduplicated to one per distinct session.

No production code, schema, route, database, UI, or source data changed.

## Acceptance evidence produced by the maker

1. Focused baseline: `node --test --import tsx --test-name-pattern="turns load once"
   src/search-store.test.ts` passed 1/1 from `apps/api`.
2. Mutation replay: temporarily adding one real `turnsColl(tenantId).findOne({_id: hit.turnId})`
   per scored hit made that focused test fail 0/1 with the exact evidence
   `3 turns.findOne calls — per-hit turn lookup reintroduces N+1`.
3. Restore proof: `git hash-object apps/api/src/search-store.ts` equals
   `git rev-parse HEAD:apps/api/src/search-store.ts` at
   `7ca2c8315ef8b50083dac920d1c4dd2c319c8a4f`; the mutation is absent.
4. Full API suite: 173/173 passed after restoration.
5. API typecheck: `tsc --noEmit -p apps/api/tsconfig.json` passed.
6. `git diff --check` reported no whitespace errors. The only source change is the existing test
   block; `.goal/goal.json` is concurrent user-owned state and is excluded.
7. `npm run lint:structure` passed: 288 files within LOC budget, 78 directories within file-count
   budget, tracker gates G1/G4 green, and zero dependency violations across 305 modules.
8. Fresh senior engineering review returned `VERDICT: Approve` with no findings. It confirmed the
   three-hit/two-session fixture and repeated-session precondition make the guard non-vacuous.

## Checker dispatch

Mode A. Independently run the focused and full API tests, inspect the captured call assertions,
and replay an output-preserving per-hit `turns.findOne` mutation against
`apps/api/src/search-store.ts`. Confirm the mutation is restored byte-identically. No live browser
run is required because neither UI code nor browser-facing behavior changed.

## Checker close-out

**PASS — cycle 1.** Independent verdict: `qa/verdicts/search-turn-query-count.md`. The checker
replayed an output-preserving per-hit `turns.findOne` mutation, observed the focused test fail with
three forbidden lookups, restored `search-store.ts` byte-identically, and re-confirmed focused 1/1,
full API 173/173, API typecheck, structure lint, and diff-check. ISS-085 moved `open -> fixed` and
remains unverified. Closed 2026-09-09.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
