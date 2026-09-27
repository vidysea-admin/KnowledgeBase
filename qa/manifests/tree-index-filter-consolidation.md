# Manifest — tree-index-filter-consolidation

**Contract:** qa/contracts/ingest-indexing-pipeline.md, criterion 3a (the `tree_index` exception
is bounded on "every access goes through a single shared filter definition").
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-063

## Why, and what this unit is deliberately NOT

The checker's queue named this unit "tree-index-tenant-scoping" and bundles two separate
findings: **ISS-062** (give `tree_index` a real `tenantId` schema field — a data migration
touching the live production collection) and **ISS-063** (the `tenant:<id>` node_id filter is
hand-written in three places, two of them pinned by no test at all, and one of those two had
already been caught wrong once live). **This unit builds ISS-063 only.**

A schema migration is a different risk class from a filter consolidation — it needs
`schema/tree_index.schema.json` edited, `gen:types` re-run, a real `migrations/` entry, and a
decision about what happens to the tree already sitting in the live database. Folding that into
the same cycle as everything else this session has shipped would make this unit unreviewable and
risk the actual data. ISS-062 stays open, filed as its own next unit, exactly as the checker's own
ruling on it already anticipated ("this issue tracks the schema decision... as its own unit").

## What changed

1. **`packages/index/src/tree/build.ts`** — new exported `treeIndexRootFilter(tenantId)`, the
   single source of the `tenant:<id>` / `level: "tenant"` shape. `buildTree`'s own root-node
   construction now calls it too, instead of hand-writing the same template literal a fourth time
   in the very file that defines the convention.
2. **`packages/index/src/index.ts`** — exports it.
3. **`apps/api/src/indexing.ts`** — imports it instead of its own local copy (added two cycles
   ago, for ISS-060, with a comment inviting exactly this consolidation).
4. **`apps/api/src/store.ts`** — both `createMongoTreeStore.load` and
   `createMongoGraphReadDeps.loadGraph` now call it instead of hand-writing the filter. One of
   these two carried a comment recording that this exact query was wrong once before, live,
   2026-09-04 — that comment is preserved and repointed at the shared definition.

## Real evidence

### `treeIndexRootFilter` is genuinely exercised, not just imported

`packages/index/src/tree/tree.test.ts` (+2 tests): confirms `buildTree`'s own root node_id
matches the filter's output exactly (so the two can never silently drift apart again), and that
the filter is deterministic and tenant-distinguishing.

### The consolidation itself is pinned — `store.ts` had ZERO tests before this unit

`store.ts` calls `getDb()` directly with no injectable handle (unlike `indexSession`, which
gained one for ISS-056) — a full DI refactor to exercise its real behaviour without a live Mongo
is its own unit, out of scope here. Instead: a new source-scan regression test,
`apps/api/src/tree-index-root-filter-single-source.test.ts`, asserts both `indexing.ts` and
`store.ts` import the shared filter and contain **zero** occurrences of the hand-written
`node_id: \`tenant:${...}` pattern, and that `store.ts` calls the shared function **exactly
twice** (a count of one would mean one call site silently regressed back to a hand-written copy).

### Mutation, proven applied

```
MUTATION: reintroduce a hand-written filter at ONE of store.ts's two call sites
          (createMongoTreeStore.load), leaving the other on the shared function.
          Occurrence count of the shared-call form asserted 1 -> 0 at that site before running.

BEFORE this fix: no such test existed to catch this at all.
AFTER this fix: apps/api 76/77, 1 RED —
  "store.ts imports treeIndexRootFilter and both its tree_index call sites use it, not a
   hand-written copy"
```

Mutation reverted; `grep -c "treeIndexRootFilter(tenantId)" store.ts` confirmed back to 2.

### Full suite + typecheck + dependency graph (fresh run)

```
packages/core 7 · packages/db 8 · packages/ai 56 · packages/index 42 (+2) · packages/ingest 41 ·
packages/ask 32 · packages/meeting-bot 40 · apps/api 77 (+2, new source-scan test) ·
apps/web (vitest) 40
Total 343, 0 fail.
pnpm -r typecheck -> all 10 projects Done.
npx depcruise --config .dependency-cruiser.cjs packages apps workers -> 242 modules, 712
dependencies cruised, no violations. (apps/api already imported @lkb/index; no new edge added.)
```

### Structure

`pnpm lint:structure` clean (loc/dirsize/root/dupes/migrations/snapshot/depcruise) — stays green
through this in-flight unit's own uncommitted files, confirming ISS-058's fix from two units ago
is doing its job.

## Disclosed limitations

- **`store.ts` still has no real behavioural test** — the source-scan test proves the
  consolidation held, not that `createMongoTreeStore`/`createMongoGraphReadDeps` behave correctly
  against a real database. That gap predates this unit (the whole file had zero tests) and is not
  closed here; a DI refactor to make `store.ts` injectable, matching `indexing.ts`'s
  `IndexSessionDeps` pattern, would be the real fix and is its own unit.
- **ISS-062 (the schema migration) is untouched**, as scoped above.

## How to verify (for the checker)

1. Reproduce the mutation yourself (hand-write the filter back in at either `store.ts` call site,
   your own wording) and confirm the new source-scan test catches it.
2. Confirm `treeIndexRootFilter`'s two new tests are real assertions, not tautologies — try
   breaking `buildTree`'s root-id construction and confirm the "matches buildTree's own root
   node_id" test catches the drift.
3. Judge the scope split (ISS-063 here, ISS-062 deferred) — is data-migration risk a legitimate
   reason to keep them separate, or should they have shipped together?
4. `pnpm -r test` (343), `pnpm -r typecheck`, `npx depcruise` all clean.

## Status: checked-PASS

**Verdict:** `qa/verdicts/tree-index-filter-consolidation.md` — **PASS**, `Cycle checked: 1`,
commit `024cd43`. 5/5 criteria met · 1/1 invariant holds.

### What the checker ruled

1. **Reproduced the mutation independently**, then went further: tried an adversarial mutation
   that evades the `HAND_WRITTEN_FILTER` regex (string concatenation instead of the template
   literal) — **still caught, but by the exact-call-count assertion, not the regex.** That's the
   answer to the ISS-038 blind-spot question this manifest raised: the test's real defense is
   format-agnostic, unlike the `process.exit(2)` regex that only matched by coincidence.
2. **Confirmed the `tree.test.ts` drift test is genuine** — broke `buildTree`'s own root-id
   construction and watched it fail correctly, not just pass by construction.
3. **Endorsed the scope split** (ISS-063 here, ISS-062 deferred) as a legitimate risk-class
   distinction, not scope-dodging.
4. Full suite 343/343, typecheck 10/10 clean, dependency-cruiser 712 deps no violations — all
   reproduced fresh, not pasted.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
