# Manifest — indexSession-insert-confinement

**Contract:** qa/contracts/ingest-indexing-pipeline.md, criterion 3a (added last cycle: every
`indexSession` query confined to its tenant, `tree_index` exception bounded).
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-061 (+ one unfiled gap reported by a terminated checker dispatch — see "Why")

## Why

Last cycle's `tenant-scoped-writes` checker found the gap it was explicitly asked to hunt for:
the confinement test (`indexing.test.ts`) skipped every recorded call with no `filter`, and an
`insertOne`/`insertMany` call carries **documents**, never a filter. A raw, untenanted
`db.collection("turns").insertOne({tenantId: "other-tenant", ...})` added anywhere inside
`indexSession` passed the whole suite (71/71 green) and typechecked clean — the ISS-060 bypass
shape, in its insert form, with nothing pinning it.

**Fix cycle 1 covers two gaps, not one.** The first checker dispatched against this unit
terminated on an environment error (API server unreachable) before writing a verdict file — no
`Cycle checked` file exists, so per protocol that is not a check, not a fix cycle, and this is
still cycle 1. But its returned text (not a verdict, just its last observation before dying)
reported a **second, independently real** gap it had already found: `updateOne`'s *filter* can
carry the right `tenantId` while its *update body* (`$set`) reassigns the document's `tenantId`
to another tenant — a cross-tenant takeover the confinement check never inspected, because it
only ever looked at `call.filter` and `call.docs`, never at the second argument to `updateOne`.
I reproduced that independently (own mutation, own occurrence-count assertion, own test run —
not taken on the dead agent's word) before fixing it, so this manifest folds both closed rather
than shipping a fix I already knew was half of what's needed.

## What changed

- **`apps/api/src/indexing.test.ts`** — `fakeDb()`'s `insertOne`/`insertMany` now record the
  document(s) actually passed, not just the op name. The confinement check is factored into
  `assertAllCallsConfined(calls, tenantId)` and used by both the healthy-run and degraded-run
  tests; for every recorded call it asserts the filter's `tenantId` (as before) **and** now
  asserts `doc.tenantId` for every inserted document, with the same `tree_index` exception
  (no `tenantId` field exists on that schema; it never inserts, only `replaceOne`/`findOne`).
- Added a vacuity guard: the healthy-run test now asserts at least one document was actually
  inserted, so a future refactor that stops inserting anything couldn't make this check pass by
  having nothing left to check.
- `assertAllCallsConfined` now also inspects `updateOne`'s **update body**, not just its filter —
  checking both a `{$set: {tenantId: ...}}` shape and a raw replacement document for a `tenantId`
  field that disagrees with the accessor's tenant. Covers the `$set`-reassignment gap above.
- No production code changed. `indexSession` itself was already correct after last cycle's fix —
  this closes **test coverage** gaps, not a live defect (both findings are latent, not live:
  `tenantId` in `indexSession` is server-derived in every real call site).

## Real evidence

### The checker's exact mutation, reproduced, now caught

```
MUTATION: db.collection("turns").insertOne({_id:"EVIL", tenantId:"other-tenant", sessionId}) inserted
          into indexSession right after the turns are loaded. Occurrence count asserted 0 -> 1 (i.e.
          confirmed the injected line is actually present) before running.

BEFORE this fix (documented last cycle):  apps/api 71/71 GREEN, typecheck exit 0 — the bypass was invisible.
AFTER this fix:                           apps/api 69/71, 2 RED —
  "turns.insertOne wrote a document with no tenantId — it can be written into another tenant's
   data (ISS-061)"   (both the healthy-run test and the degraded-run test catch it, since both
                       call assertAllCallsConfined)
```

Mutation reverted; `git diff --stat apps/api/src/indexing.ts` shows 0 changes — production code
was never touched by this unit.

### Second mutation (the `$set`-reassignment gap the terminated checker reported)

```
MUTATION: the real production updateOne call's $set body widened to also write
          tenantId: "other-tenant" — { $set: { "status.index": "done", tenantId: "other-tenant" } }.
          Occurrence count of the mutated string asserted 0 -> 1 before running.

BEFORE this fix: apps/api 71/71 GREEN — updateOne's filter carried the right tenantId; its
                 update body reassigning the document to another tenant was never inspected.
AFTER this fix:  apps/api 69/71, 2 RED —
  "sessions.updateOne's $set reassigns tenantId — it can move a document into another tenant"
```

Mutation reverted; baseline re-confirmed 71/71 clean afterward.

### Full suite + typecheck (fresh run)

```
packages/core 7 · packages/db 8 · packages/ai 56 · packages/ingest 41 · packages/index 40 ·
packages/ask 32 · packages/meeting-bot 40 · apps/api 71 · apps/web (vitest) 40
Total 335, 0 fail.
pnpm -r typecheck -> all 9 projects Done.
```

### Structure

`lint-loc`/`lint-dirsize`/`lint-root`/`lint-dupes`/`lint-migrations`/`snapshot --check` all OK.
`lint:structure` overall fails only on the pre-existing, already-filed ISS-058 guard (this
manifest's own uncommitted `indexing.test.ts`) — no other lint fails.

## Disclosed limitation

This closes the exact gap the checker demonstrated (an untenanted `insertOne` inside
`indexSession`). It does not sweep the rest of the codebase for other tests with the same
filter-only blind spot — that would be a separate, broader unit and was not asked for by ISS-061.

## How to verify (for the checker)

1. Reproduce the mutation yourself (a raw untenanted insert anywhere inside `indexSession`) and
   confirm it reddens `apps/api` — do not reuse mine.
2. Confirm the vacuity guard is real: temporarily make the healthy-run path insert nothing and
   confirm the test fails for the right reason, not by accident.
3. `pnpm -r test`, `pnpm -r typecheck` clean; `apps/api` 71/71.
4. Judge whether `assertAllCallsConfined`'s `tree_index` exception is still exactly what
   criterion 3a bounds it to (no `deleteMany`/insert on that collection; still just
   `replaceOne`/`findOne`).

## Status: checked-PASS

**Verdict:** `qa/verdicts/indexSession-insert-confinement.md` — **PASS**, `Cycle checked: 1`, commit
`ab8168c`. 4/4 criteria met · 0/0 invariants blocked. `indexing.ts` confirmed byte-identical to
HEAD (empty diff) — this really was a pure test-coverage unit.

### What the checker ruled

1. **Both mutations reproduced with the checker's own wording/shapes, not mine** — the ISS-061
   insert blind spot and the `$set`-reassignment gap both went 71/71 green → 69/71 red under
   independent construction, then reverted clean.
2. **The vacuity guard is real** — verified it actually fails on zero inserts, not just that the
   assertion line exists.
3. **The `tree_index` exception still matches contract criterion 3a exactly.**
4. **A third gap found, same family, filed rather than blocking: ISS-066.** `assertAllCallsConfined`
   checks `$set` and a top-level `tenantId` on the update body, but never `$unset` — a mutation that
   *strips* `tenantId` (rather than reassigning it) is invisible: 71/71 green, typecheck clean.
   Latent, not live (no real `$unset` call exists in `indexSession` today), and explicitly does not
   invalidate this unit's own claim — a distinct call shape, next in the queue.
5. Full suite 335/335, typecheck 10/10 clean.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
