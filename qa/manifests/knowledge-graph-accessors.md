# Manifest — knowledge-graph-accessors

**Contract:** none existing covers this directly (plan §10 U0.9). Proposed criteria below for the
checker to adopt or amend as `qa/contracts/knowledge-graph-accessors.md`.
**Goal task:** none (plan §10 U0.9 — Phase 0 finish item, prerequisite for Phase 2 extraction work)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none (new capability, not a bug fix)

## Why

Plan §10, Phase 0 (`U0.9 — Five packages/db accessors`): `topics`, `speakers`, `decisions`,
`orgs`, `graph_edges` all have real JSON schemas + fixtures + generated TypeScript types (schema
validation already passes for all five — confirmed with `python schema/validate.py`), but had
**zero `packages/db` accessors** — nothing in the codebase could write or read a row in any of
these five collections. The plan explicitly calls this out: "Do this before anything writes
rows" — it's the prerequisite for every later extraction unit (U2.1 topics/orgs promotion, U2.3
LLM topic extraction, U2.4 speakers, U2.5 decisions, U2.6 graph_edges), none of which can exist
without a tenant-scoped way to write to these collections first.

## What changed

Five new files, each ~7 lines, following the exact existing pattern
(`packages/db/src/collections/sessions.ts`) verbatim — `coll(tenantId)` accessor wrapping
`scopedCollection<T>(getDb(), "<collection>")(tenantId)`, so a tenant-less call is a TypeScript
compile error, not a runtime bug (the same invariant every other collection accessor in this
package already enforces):

1. **`packages/db/src/collections/topics.ts`** → `topics(tenantId)`, backed by `Topics` type,
   Mongo collection `"topics"`.
2. **`packages/db/src/collections/speakers.ts`** → `speakers(tenantId)`, `Speakers` type,
   collection `"speakers"`.
3. **`packages/db/src/collections/decisions.ts`** → `decisions(tenantId)`, `Decisions` type,
   collection `"decisions"`.
4. **`packages/db/src/collections/orgs.ts`** → `orgs(tenantId)`, `Orgs` type, collection
   `"orgs"`.
5. **`packages/db/src/collections/graph-edges.ts`** → `graphEdges(tenantId)`, `GraphEdges` type,
   collection `"graph_edges"` (filename hyphenated per the repo's existing convention for
   multi-word collection files, e.g. no existing precedent conflicts; function name camelCased
   since `graph-edges` isn't a valid JS identifier).

All five types (`Topics`, `Speakers`, `Decisions`, `Orgs`, `GraphEdges`) already existed in
`packages/core/src/generated/*.ts` (generated from the schemas) and were already re-exported
from `@lkb/core`'s `index.ts` — no `packages/core` change needed, confirming the plan's own note
that "types + fixtures already exist."

**`packages/db/src/collections/tenantScope.typecheck-test.ts`** — extended with the five new
accessors: each gets both the `@ts-expect-error` no-argument-call assertion (proves a tenant-less
call is a compile error) and a valid-call assertion in `validCalls()` (proves the accessor
actually works when called correctly) — the same pair of assertions every existing listed
accessor (`sources`, `sessions`, `turns`, `claims`, `gaps`) already carries.

No new runtime tests were needed beyond that: `packages/db/src/lib/tenantScope.test.ts`'s 13
tests already cover every method `scopedCollection` exposes (`find`, `findOne`, `insertOne`,
`insertMany`, `deleteMany`, `updateOne`, `countDocuments`) against the shared underlying
mechanism every one of these five new accessors is a thin wrapper over — there is no
collection-specific logic in any of the five files to test independently (this matches the
existing pattern: none of `sessions.ts`/`claims.ts`/`turns.ts`/etc. has its own test file
either, by the same reasoning).

## Evidence

`pnpm --filter @lkb/db typecheck` — clean, no errors.
`pnpm -r typecheck` — all 8 packages/apps clean (confirms zero ripple into any consumer).
`pnpm --filter @lkb/db test` — 13/13 pass (the shared `scopedCollection` mechanism all five new
accessors depend on).
`python schema/validate.py` — 24/24 collection schemas pass, including `topics`, `speakers`,
`decisions`, `orgs` (valid + invalid fixtures both correctly resolve).
`pnpm lint:structure` — clean (225 files in budget, 0 dependency-cruiser violations, tracker-audit
gate G1 OK).
`pnpm lint:score --check` — correctly REFUSES pre-commit (`packages/db/src/collections/{decisions,
graph-edges,orgs,speakers,topics}.ts is not what the repository holds (untracked)`) — this is the
expected, designed behavior of the trust check (ISS-047's fix) on any uncommitted scraped source,
not a defect; it resolves once the checker commits these files.

## How to verify (checker)

1. Read each of the five new accessor files — confirm each follows the exact
   `scopedCollection<T>(getDb(), "<name>")(tenantId)` pattern with the correct collection name
   and imported type.
2. Confirm `tenantScope.typecheck-test.ts` correctly asserts both the tenant-less-call compile
   error and the valid-call form for all five new accessors.
3. Run `pnpm --filter @lkb/db typecheck` and `pnpm -r typecheck` — both clean.
4. Run `pnpm --filter @lkb/db test` — 13/13 (confirms the shared mechanism these accessors rely
   on is sound; there's no accessor-specific logic to test beyond that).
5. Run `python schema/validate.py` — 24/24.
6. After committing, re-run `pnpm lint:score --check` — should now pass (no longer refuses on
   these files being untracked).
7. Consider writing `qa/contracts/knowledge-graph-accessors.md` (this manifest proposes criteria
   above) — this is checker territory per the project's segregation-of-duties rule (ISS-006), not
   something the maker should draft as a full contract file itself; noting the proposed shape
   here for the checker's convenience is as far as the maker goes.

## Risk / rollback

Pure additive code, zero behavioral change to any existing path (nothing calls these new
functions yet — they exist so a LATER unit, e.g. plan §10 U2.1, can write/read rows). Reversible
by `git revert`. No production data touched.

**Status: checked-PASS**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
