# Manifest — tree-index-tenant-id-migration

**Contract:** qa/contracts/ingest-indexing-pipeline.md, criterion 3a (the `tree_index` exception's
first condition is now literally superseded).
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-062

## Why

Contract criterion 3a (added when `tenant-scoped-writes` closed ISS-060) accepted the
`tenant:<id>` node_id string prefix as an **interim** boundary for `tree_index`, explicitly not a
permanent one — it filed the real fix (a schema field) as its own unit, ISS-062. Two units later,
`tree-index-filter-consolidation` (ISS-063) single-sourced the prefix filter but deliberately did
**not** touch the schema, citing data-migration risk as a different risk class than a filter
consolidation. This unit is that deferred migration.

## What changed

1. **`schema/tree_index.schema.json`** — restructured with `$defs.node` (the recursive shape,
   root and every child) and a top-level schema that `allOf`-refs it and additionally
   **requires `tenantId`**. Titles are deliberately arranged so `json-schema-to-typescript`
   still emits `TreeIndexNode` for the recursive/child shape (used everywhere in the codebase
   for a node at any tree level — zero renaming needed) and a **new**, additive
   `TreeIndexRootDocument = TreeIndexNode & {tenantId: string}` for the persisted root only.
   `tenantId` is declared on the root, not on every nested child — a child is a subdocument,
   never independently queried, and forcing the field on every nested node would be schema noise
   with no enforcement value.
2. **`packages/index/src/tree/build.ts`** — `treeIndexRootFilter(tenantId)` now returns
   `{ node_id, level, tenantId }`, not just the string-prefix pair. Every one of its three
   readers (`build.ts` itself, `apps/api/src/indexing.ts`, both `apps/api/src/store.ts` call
   sites) benefits automatically, with **zero code change needed** at the two `store.ts` call
   sites beyond what ISS-063 already did — they call the same function, which now returns a
   stronger filter.
3. **`apps/api/src/indexing.ts`** — `loadTreeRoot` now types/queries as `TreeIndexRootDocument`.
   The write path builds `const rootDoc: TreeIndexRootDocument = { ...newRoot, tenantId }`
   **immediately before** `replaceOne`, regardless of which branch (`regenerate` vs fresh
   `buildTree`) produced `newRoot` — this is the actual fix: every root this function persists
   from now on carries the field, whether or not the input it started from already had one.
4. **`apps/api/src/store.ts`** — both call sites' `getDb().collection<T>()` generic changed from
   `TreeIndexNode` to `TreeIndexRootDocument` (more accurate; the real document now has the
   field) — no logic change, `TreeIndexRootDocument` satisfies `TreeStore`'s declared
   `Promise<TreeIndexNode | null>` return type because it's a structural superset.
5. **`migrations/20260907140000-tree-index-tenant-id.cjs`** (new) — backfills `tenantId` onto any
   `tree_index` document missing it, deriving the value from the existing `node_id`'s
   `tenant:<id>` prefix (the same convention the filter has always encoded, not a guess).
   Idempotent (`$exists: false` guard); `down()` is a deliberate no-op with a comment explaining
   why (see "Real evidence" below).
6. **`schema/fixtures/tree_index/valid.json`** — gained a top-level `tenantId`.
   `invalid.json` untouched (it never had one, and never had node_id/children valid either — now
   fails for 3 reasons instead of 2, still a legitimate reject).

## Real evidence

### The blast radius was scoped down deliberately — confirmed empirically, not assumed

My first attempt named the top-level generated type `TreeIndexNode` and the recursive `$defs`
shape something else. That broke typecheck in **6 files** across `packages/ask`, `packages/index`,
and their tests — every recursive tree-traversal function (`search.ts`, `flatten-graph.ts`,
`select-nodes.ts`, `heuristic-retriever.ts`, `testUtils.ts`) operates on "a node anywhere in the
tree" typed uniformly, and none of them should ever need to know about `tenantId`. Swapping which
side of the schema got which title fixed this to **zero** blast radius outside the four files
listed above — confirmed by running `pnpm -r typecheck` both before and after the swap.

```
BEFORE the naming fix: pnpm -r typecheck -> 6 files, ~15 errors (packages/ask, packages/index)
AFTER:                 pnpm -r typecheck -> all 10 projects Done, on the FIRST attempt after the swap
```

### Two mutations, each proven to reproduce the real bug they close

```
MUTATION 1: the write-boundary stamp (`{...newRoot, tenantId}`) replaced with a bare spread
            (no tenantId set). Occurrence of the mutated line confirmed present via grep.
BEFORE: this line didn't exist before this unit (the bug it prevents never had a guard at all).
AFTER FIX APPLIED, MUTATION IN PLACE: apps/api 75/77, 2 RED —
  "tree_index.replaceOne wrote a root document with no real tenantId field (ISS-062)"
REVERTED: apps/api 77/77 clean.

MUTATION 2: treeIndexRootFilter's returned tenantId removed (filter reverts to just node_id+level).
BEFORE FIX: no test could have caught this — the field didn't exist to check.
AFTER FIX APPLIED, MUTATION IN PLACE: apps/api 75/77, 2 RED —
  "tree_index.findOne's filter must match on the real tenantId field too (ISS-062)"
REVERTED: apps/api 77/77 clean.
```

**Both mutations were invisible to the test suite before this unit's OWN fake-db fix.** The
existing `indexSession` test fixture had `sessions.find()` returning `[]`, so `buildTree([], [])`
never produced a root for the test tenant at all — `newRoot` was `undefined`, the `if (newRoot)`
guard was false, and **`replaceOne` never fired in any existing test**. I found this by running
Mutation 1 and getting a false green (77/77 unchanged) on my first attempt. Fixed the fake to
return a real session, confirmed `replaceOne` now actually appears in the recorded calls (traced
with a standalone script before touching the test file), then re-ran both mutations and got the
expected reds. This gap predates this unit — flagging it as a real, if minor, finding: the
tree_index write path had never been exercised by this test file at all, for any of the units
that touched it (ISS-060/ISS-061/ISS-063 all ran the same fixture).

### Isolated proof the schema requirement is real (Python, reproducible)

```
$ python3 -c "
import json
from jsonschema import Draft202012Validator
schema = json.load(open('schema/tree_index.schema.json', encoding='utf-8'))
v = Draft202012Validator(schema)
valid = json.load(open('schema/fixtures/tree_index/valid.json', encoding='utf-8'))
print('valid fixture:', len(list(v.iter_errors(valid))), 'errors')
no_tenant = dict(valid); del no_tenant['tenantId']
print('same doc, tenantId removed:', len(list(v.iter_errors(no_tenant))), 'errors',
      [e.message for e in v.iter_errors(no_tenant)])
"
valid fixture: 0 errors
same doc, tenantId removed: 1 errors ["'tenantId' is a required property"]
```
Confirms the requirement is isolated to exactly the field this unit adds — not accidentally
strengthened by some other change, not a false pass from a broader fixture edit.

### The LIVE migration — run against the real database, read back, confirmed idempotent

```
$ npx migrate-mongo status -f migrate-mongo-config.cjs      # BEFORE
(2 prior migrations, none pending)

$ node <inspect script>                                     # BEFORE, read-only
CONNECTED db=lkb
total tree_index docs: 3
_id=... node_id=tenant:toc                    tenantId=undefined
_id=... node_id=tenant:chk060-A-aa9c3020      tenantId=undefined   <- see "Disclosed" below
_id=... node_id=tenant:chk060-A-fc1ebd22      tenantId=undefined   <- see "Disclosed" below

$ npx migrate-mongo up -f migrate-mongo-config.cjs
MIGRATED UP: 20260907140000-tree-index-tenant-id.cjs

$ node <inspect script>                                     # AFTER, read-only
total tree_index docs: 3
_id=... node_id=tenant:toc                    tenantId="toc"
_id=... node_id=tenant:chk060-A-aa9c3020      tenantId="chk060-A-aa9c3020"
_id=... node_id=tenant:chk060-A-fc1ebd22      tenantId="chk060-A-fc1ebd22"

$ npx migrate-mongo status -f migrate-mongo-config.cjs      # idempotency check
(3 migrations, all applied, none pending — re-running "up" is a documented no-op for an
 already-applied migration in migrate-mongo itself; the script's own $exists:false guard means
 even a hand-rolled re-run touches zero documents the second time)
```

Mongo answered on the first attempt this time (no repeat of the two consecutive timeouts from the
`summarize-degradation-honesty` unit two cycles ago) — disclosed either way, not just when it's
convenient.

### Full suite + typecheck + structure + schema (fresh runs)

```
packages/core 7 · packages/db 8 · packages/ai 56 · packages/index 43 (+1) · packages/ingest 41 ·
packages/ask 32 · packages/meeting-bot 40 · apps/api 77 · apps/web (vitest) 40
Total 344, 0 fail.
pnpm -r typecheck -> all 10 projects Done.
python schema/validate.py -> PASS: 24 collection schema(s).
node scripts/gen-types.mjs --check -> OK: 24 generated type file(s) + index.ts match schema/.
pnpm lint:structure -> clean (docs/SNAPSHOT.md regenerated -- its schema-summary table now
  correctly lists tree_index's new tenantId field, a genuine staleness catch, not noise).
npx depcruise --config .dependency-cruiser.cjs packages apps workers -> 242 modules, 712
  dependencies, no violations.
```

## Disclosed findings (real, not hidden)

- **Two orphaned scratch-tenant `tree_index` documents exist in the live database**
  (`chk060-A-aa9c3020`, `chk060-A-fc1ebd22`) — leftovers from a checker's own live two-tenant
  proof for `tenant-scoped-writes`, whose cleanup evidently missed `tree_index` (it cleaned
  `claims`/`turns`/`session_pages`/`sessions` but not this collection). Not deleted by this
  migration (it only ever `$set`s a missing field, never deletes) — the migration correctly
  backfilled them the same as the real `toc` tenant, since they follow the same `node_id`
  convention. Filing as its own low-severity cleanup issue rather than deleting scratch data
  unilaterally inside a schema-migration unit.
- **The `indexSession` test fixture never exercised the `tree_index` write path at all**, for any
  prior unit — see "Two mutations" above. Fixed as part of this unit (the fake now returns a real
  session so `buildTree` actually produces a root), but flagging that this was true for ISS-060/
  ISS-061/ISS-063 too; nothing retroactively re-verifies those.
- **`down()` in the migration is a deliberate no-op**, not a real rollback. Application code now
  *requires* `tenantId` to find a tenant's root (`treeIndexRootFilter`'s filter matches on it), so
  an automatic `$unset` would make every tenant's tree invisible — reverting the schema decoration
  without also reverting the application code would be actively harmful, not neutral.

## How to verify (for the checker)

1. Reproduce both mutations independently (your own wording) and confirm they redden, then revert.
2. Confirm the naming split — `TreeIndexNode` (recursive, no tenantId) vs `TreeIndexRootDocument`
   (root, with tenantId) — genuinely produces zero blast radius: `git diff --stat` should show
   changes confined to `schema/tree_index.schema.json`, its fixture, its generated type,
   `build.ts`, `indexing.ts`, `store.ts`, and their tests — nothing in `packages/ask` or the
   traversal functions in `packages/index`.
3. Confirm the live migration actually ran (`npx migrate-mongo status -f migrate-mongo-config.cjs`
   should show it applied) and read back the real database yourself to confirm all 3 documents
   carry `tenantId`.
4. Judge the disclosed orphaned-scratch-doc finding — file it, or decide it doesn't warrant one.
5. Confirm the fake-db gap (replaceOne never firing) is genuinely fixed — trace calls yourself if
   you don't trust my standalone script's output.
6. `pnpm -r test` (344), `pnpm -r typecheck`, `python schema/validate.py`,
   `node scripts/gen-types.mjs --check`, `pnpm lint:structure` all clean.

## Status: checked-PASS

**Verdict:** `qa/verdicts/tree-index-tenant-id-migration.md` — **PASS**, `Cycle checked: 1`,
commit `9c07153`. 6/6 criteria met · 0/0 invariants hold. Both mutations reproduced with the
checker's own wording (each reddened `apps/api` to 75/77 with the exact claimed message,
reverted clean). This was the riskiest unit of the session — a live schema migration — so it got
the checker's most thorough independent re-verification of the whole session.

### What the checker ruled

1. **Read the live database directly** — all 3 documents carry a real `tenantId` matching their
   `node_id` prefix. Not taken on the manifest's word.
2. **Idempotency confirmed two ways**: `migrate-mongo up` reports nothing pending, and a direct
   re-run of the migration's own `up(db)` logic against live data is byte-identical (touches
   zero documents the second time).
3. **Blast radius confirmed via `git diff --stat`** — nothing in `packages/ask` or the
   tree-traversal functions in `packages/index`, exactly as claimed.
4. **The disclosed orphaned scratch-tenant documents investigated independently, not just
   trusted** — filed as **ISS-067** (low). Confirmed genuinely orphaned: `countDocuments` across
   every other collection for both scratch tenants returned 0. Ruled correct to file rather than
   delete inside a schema-migration unit — cleanup is safe but is a separate, deliberate delete,
   not something a migration that should only ever add/backfill fields should also do.
5. **The pre-existing test-fixture gap confirmed true and genuinely fixed** — `replaceOne` really
   had never fired in any prior unit's test run.
6. **`down()` as a no-op ruled correct**, given `tenantId` is now required to find a root at all.
7. Full suite 344/344, typecheck 10/10, schema/gen-types/lint:structure all clean, fresh runs.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
