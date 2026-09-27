# Manifest — scoped-collection-updateOne

**Contract:** qa/contracts/ingest-indexing-pipeline.md (`scopedCollection` is referenced by
criterion 3a; this unit strengthens the shared primitive itself, not this contract's own scope).
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 3 of max 3 (last cycle — see below)
**Dual check:** no
**Issues addressed:** ISS-065, ISS-068, ISS-069

## Fix cycle 3 — countDocuments shipped with zero coverage

**Verdict:** `qa/verdicts/scoped-collection-updateOne.md` — **FAIL**, cycle 2, commit `fba8d3c`.
Everything from cycle 2 held (the `sync-real-turns.mjs` fix, the true repo-wide search, no
regression in the 7 original call sites). But my own dispatch had explicitly asked the checker to
"mutate [countDocuments] yourself and confirm it reddens" — and it found that `countDocuments`
had **zero automated regression coverage**: `tenantScope.test.ts`'s `fakeDb()` mock didn't even
implement a `countDocuments` stub, so stripping its tenant merge reddened **nothing** in
`pnpm --filter @lkb/db test` (10/10 stayed green). Filed as **ISS-069 (medium)**, my own
instruction to the checker catching my own gap.

**Fixed this cycle:**
1. **`packages/db/src/lib/tenantScope.test.ts`** — added a `countDocuments` stub to `fakeDb()`,
   plus three tests mirroring `updateOne`'s own coverage: tenant-merged, override-resistant, and
   an empty-filter case.
2. **Mongo answered this cycle** (the checker's cycle-2 live check was environmentally blocked —
   not held against the unit) — re-ran the same scratch-tenant proof from cycle 1 and got the
   identical result.

## Fix cycle 2 — the checker found an eighth call site cycle 1 missed

**Verdict:** `qa/verdicts/scoped-collection-updateOne.md` — **FAIL**, cycle 1. Everything in the
original scope held (all 7 named call sites genuinely migrated, mutation reproduced independently
in both `packages/db` and `apps/api`, full suite/typecheck/structure clean) — but a repo-wide
search, not scoped to `apps/`+`packages/` the way my own grep was, found an **eighth**:
`scripts/sync-real-turns.mjs`, a real, currently-runnable T-003 data-sync script sitting outside
every workspace project's typecheck/test scope. It called `turns(tenantId).raw.countDocuments(...)`
and `.raw.deleteMany(...)` directly. Removing `raw` broke it the moment it would actually run
live — confirmed by the checker via `--dry-run`, which still lists real sessions but never
reaches the now-broken line. Filed as **ISS-068 (high)**, correctly: a script this project
actually runs (T-003 phase 3) silently throwing on its next real invocation is not cosmetic.

**Fixed this cycle:**
1. **`packages/db/src/lib/tenantScope.ts`** — added a tenant-merged `countDocuments(filter)`,
   same pattern as `deleteMany`/`updateOne`. (`deleteMany` itself already existed on the accessor
   — the script had no need to reach `raw` for that half at all; only `countDocuments` was
   genuinely missing.)
2. **`scripts/sync-real-turns.mjs`** — both lines migrated off `.raw` onto the real accessor,
   dropping the hand-carried `tenantId` (already redundant — `turns(tenantId)` already scopes it).
3. **Re-ran the search properly this cycle**: a true repo-wide grep (not scoped to `apps/`+
   `packages/`) for `\.raw\.` via the Grep tool (which respects `.gitignore`, so `node_modules`
   is excluded without needing to guess exclude patterns) found exactly two more matches, both
   confirmed false positives: `packages/ingest/src/sources/recording.test.ts:24` — the literal
   string `"call.raw"`, a test fixture filename, not a property access; and
   `sources/whatsapp_msg/src/wa/sessionManager.ts` — a WhatsApp socket's own `raw` property, in a
   separate git submodule with its own independent Lab Protocol governance (this project's own
   CLAUDE.md: "do not duplicate its governance here"), unrelated to `scopedCollection` entirely.
4. **Verified live, on a scratch tenant** (not the real `toc` data `sync-real-turns.mjs` would
   touch) — see "Real evidence" below.

## Why

`scopedCollection` had `find`/`findOne`/`insertOne`/`insertMany`/`deleteMany`, but no
tenant-merged `updateOne` — so every caller that needed to update a document went around the
guard entirely via the exposed `raw` handle, hand-carrying its own `tenantId` in the filter. A
grep found **seven** such call sites, not the one (`indexing.ts`) the issue named:
`apps/api/src/indexing.ts` and six inside `packages/db/src/collections/` (`eval-runs.ts`,
`gaps.ts` ×2, `meeting-candidates.ts`, `trusted-senders.ts`, `watched-sources.ts`). Every one of
them was the exact shape ISS-060 closed for `deleteMany` — the checker's own phrase for `raw`,
"re-opens by design the exact hatch ISS-060 came through," was already true seven times over
before this unit.

## What changed

1. **`packages/db/src/lib/tenantScope.ts`** — added a tenant-merged `updateOne(filter, update)`,
   same pattern as the existing `deleteMany`. **Removed `raw` entirely** — with a real accessor
   for every write operation any caller actually uses, nothing legitimately needs it anymore.
   Also fixed a stale doc comment on the function itself (it claimed "never the raw
   `Collection<T>`" while line 47 was returning exactly that — a leftover from before ISS-060
   added `raw` as an escape hatch).
2. **Seven call sites migrated** off `.raw.updateOne(...)` onto the new accessor, each dropping
   its hand-carried `tenantId` from the filter (the accessor supplies it now, and a caller can no
   longer omit or override it): `apps/api/src/indexing.ts`,
   `packages/db/src/collections/{eval-runs,gaps,meeting-candidates,trusted-senders,
   watched-sources}.ts`.
3. **`packages/db/src/lib/tenantScope.test.ts`** — two new tests for `updateOne`: tenant-merged
   and update-body-passed-through, and the same override-resistance test `deleteMany` already
   had.

## Real evidence

### Confirmed complete — a TRUE repo-wide search now, not scoped to two directories

```
Grep tool, pattern \.raw\. , glob *.{mjs,ts,js,cjs}, respects .gitignore:
  packages/ingest/src/sources/recording.test.ts   <- "call.raw" literal string, false positive
  sources/whatsapp_msg/src/wa/sessionManager.ts   <- WhatsApp socket's own .raw, separate
                                                       submodule, out of this project's scope
No other matches. Both confirmed unrelated to scopedCollection.
```

### Live proof of the fix, on a scratch tenant (real database, zero production data touched)

```
$ npx tsx <scratch script importing packages/db/src/collections/turns.js>
cleaned start, count = 0
after insert, countDocuments({sessionId:'s1'}) = 1
deleteMany result: {"acknowledged":true,"deletedCount":1} count after = 0
cleaned end, count = 0
```
Both new/migrated methods work against the real driver. `node scripts/sync-real-turns.mjs
--dry-run` still lists all 19 real TOC sessions correctly (unchanged from before this fix — the
dry-run path never reached the broken line either way, which is exactly why cycle 1 missed this).

### Mutation, proven applied, caught two ways

```
MUTATION: updateOne stops merging tenantId (`raw.updateOne(withTenant(tenantId, filter), update)`
          -> `raw.updateOne(filter, update)`). Occurrence count asserted before running.

BEFORE this fix: updateOne didn't exist at all -- no test could have caught this.
AFTER FIX, MUTATION APPLIED: packages/db 8/10 RED, AND via every real caller: apps/api 75/77 RED.
REVERTED: packages/db 10/10, apps/api 77/77 clean.
```

The apps/api regression firing too (not just the accessor's own package) confirms the seven
migrated callers are genuinely exercising the shared code path, not just compiling against it.

### The countDocuments mutation — cycle 2's checker found this was silently vacuous, now fixed

```
MUTATION: countDocuments stops merging tenantId (`raw.countDocuments(withTenant(...))` ->
          `raw.countDocuments(filter)`). Occurrence count asserted before running.

BEFORE cycle 3's test additions: mutation applied, packages/db stayed 10/10 GREEN — the exact
  vacuous-coverage gap ISS-069 names, reproduced here rather than just asserted.
AFTER cycle 3's test additions, SAME MUTATION: packages/db 10/13 RED (3 of the 3 new tests fail).
REVERTED: packages/db 13/13 clean.
```

### Full suite + typecheck + structure (fresh run)

```
packages/core 7 · packages/db 13 (+3) · packages/ai 56 · packages/index 43 · packages/ingest 41 ·
packages/ask 32 · packages/meeting-bot 40 · apps/api 77 · apps/web (vitest) 40
Total 349, 0 fail.
pnpm -r typecheck -> all 10 projects Done.
pnpm lint:structure -> clean.
```

### Live proof re-run — Mongo was down for cycle 2's checker, up again this cycle

```
$ npx tsx <same scratch-tenant script as cycle 1>
cleaned start, count = 0
after insert, countDocuments({sessionId:'s1'}) = 1
deleteMany result: {"acknowledged":true,"deletedCount":1} count after = 0
cleaned end, count = 0
```
Identical result to cycle 1's proof — the environmental block on cycle 2's live check was
genuinely just an outage, not a symptom of anything wrong with the fix.

## Disclosed limitation

No behavioural regression test exists for the six `packages/db/collections/*.ts` call sites
beyond the shared accessor's own mutation coverage above — none of those files had a test file
before this unit (matching this project's existing pattern: collection wrapper files are
typically verified via route-level fixture tests, not unit tests of their own). This unit changed
their *filter shape* (dropping the hand-carried `tenantId`) without changing their *behavior*
(the accessor supplies the identical value), so the risk is low, but it is not independently
pinned per-file the way `indexing.ts`'s callers are.

## How to verify (for the checker)

1. Run a TRUE repo-wide search for `.raw.` yourself (not scoped to `apps/`+`packages/`) and
   confirm the only matches are the two disclosed false positives.
2. Reproduce BOTH mutations yourself (`updateOne` and `countDocuments`) and confirm each reddens
   — for `countDocuments` specifically, confirm it reddens a NON-ZERO number of tests (cycle 2's
   whole finding was that it reddened zero before this cycle's test additions).
3. Confirm `scripts/sync-real-turns.mjs` no longer references `raw` at all, and that
   `--dry-run` still lists the real sessions it did before this fix.
4. Verify `countDocuments` yourself against the real database on a scratch tenant if Mongo
   answers for you — never against the real `toc` tenant.
5. Spot-check at least one of the six migrated `packages/db/collections/*.ts` files against its
   real caller to confirm behavior is unchanged, not just that it compiles.
6. `pnpm -r test` (349), `pnpm -r typecheck`, `pnpm lint:structure` all clean.
7. This is fix cycle 3 of 3 (the max). If anything real is still wrong, say so plainly — a fourth
   cycle is not available and the unit would go to `STALLED` for the human.

## Status: checked-PASS

**Verdict:** `qa/verdicts/scoped-collection-updateOne.md` — **PASS**, `Cycle checked: 3`, commit
`b7c894d`. This unit took two real FAILs to earn: cycle 1 found an 8th `.raw` call site my own
search missed (ISS-068), cycle 2 found the fix for that shipped with zero test coverage on my own
dispatch instruction (ISS-069). Both are now genuinely closed, independently re-derived by the
checker, not carried forward on trust.

### What the checker ruled, cycle 3

1. **Reproduced both mutations independently**: `countDocuments` now reddens 3/13 (was 0/10
   before this cycle — ISS-069's exact finding, closed not papered over); `updateOne` still
   reddens both `packages/db` and `apps/api` with no regression from the two fix cycles.
2. **Recovered cycle 1's original verdict via `git show 85c6ed9`** to confirm the full history
   before judging cycle 3, rather than trusting the manifest's own account of what happened.
3. **True repo-wide `.raw` search re-run**: still only the same two disclosed false positives.
4. **`sync-real-turns.mjs --dry-run` re-confirmed working**, zero Mongo connection attempted.
5. **Live Mongo proof genuinely blocked again** (same host outage, 100% packet loss) — correctly
   not held against the unit; the code-level and mutation evidence stood on its own.
6. Full suite 349/349, typecheck 10/10, `lint:structure` clean — all fresh runs.
7. **Ledger fully reconciled**: ISS-069 fixed; ISS-065 and ISS-068 promoted `fixed → verified`
   (re-derived by the checker's own reproduction, not just re-stamped).

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
