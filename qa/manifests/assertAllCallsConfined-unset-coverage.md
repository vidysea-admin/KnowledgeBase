# Manifest — assertAllCallsConfined-unset-coverage

**Contract:** qa/contracts/ingest-indexing-pipeline.md, criterion 3a (every `indexSession` query
confined to its tenant).
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-066

## Why

The confinement check gained an `updateOne`-body inspection last cycle (the `$set`-reassignment
fix), but that fix only ever looked at `$set` and a bare top-level `tenantId`. The checker's own
Mode A dispatch against that cycle went hunting for one more gap, as its manifest asked it to, and
found one in the same family: `$unset: {tenantId: ""}` strips the field entirely (rather than
reassigning it) and was invisible — 71/71 green, typecheck clean.

**This is the second time in two units that a per-operator special case missed the next operator.**
Patching `$unset` in by name would just be a third special case waiting for a fourth (`$rename`,
`$currentDate`, a raw replacement document via a different code path). So this unit replaces the
two hand-written checks with one generic scan: every key in the update body is inspected — if it's
a MongoDB operator (`$`-prefixed), its sub-object is checked for a `tenantId` key; if it's a bare
field name, it's treated as a raw replacement document. `$unset` touching `tenantId` always fails
(you cannot legitimately unset a required field); every other operator's `tenantId` value must
equal the accessor's tenant.

## What changed

- **`apps/api/src/indexing.test.ts`** — the two ad-hoc `$set`/bare-`tenantId` checks inside
  `assertAllCallsConfined` are replaced by a new `assertUpdateBodyConfined(call, tenantId)`
  helper that walks every key of `call.update` generically. No production code changed.

## Real evidence

### Three mutations, one of them an operator I never wrote a special case for

```
ISS-066 reproduction: $unset: {tenantId: ""} on the real sessions.updateOne call
  occurrence count asserted 0 -> 1 before running.
  BEFORE this fix: 71/71 GREEN.  AFTER: 69/71 RED — "$unset strips tenantId... (ISS-066)"

Regression check: last cycle's $set-reassignment mutation, re-run against the new generic code
  69/71 RED — "$set reassigns tenantId..."  (still caught, not weakened by the rewrite)

$rename: {tenantId: "oldTenantId"} — an operator with NO special case anywhere in the code
  69/71 RED — "$rename reassigns tenantId..."  (the generic scan catches an operator I did not
  name, which is the point of writing it generically instead of enumerating operators)
```

Each mutation reverted; `git diff --stat apps/api/src/indexing.ts` empty after every one.

### ISS-061 regression re-checked

The insert-blind-spot mutation from two cycles ago (raw untenanted `insertOne` into `turns`) still
reddens 69/71 — this rewrite touched only the `update`-body branch, not the `docs`/`filter`
branches.

### Full suite + typecheck (fresh run)

```
packages/core 7 · packages/db 8 · packages/ai 56 · packages/index 40 · packages/ingest 41 ·
packages/ask 32 · packages/meeting-bot 40 · apps/api 71 · apps/web (vitest) 40
Total 335, 0 fail.
pnpm -r typecheck -> all 9 projects Done.
```

## Disclosed limitation

The generic scan reads one level into each operator's sub-object (`$set.tenantId`,
`$unset.tenantId`, …) and the update's own top-level keys for a raw replacement. It would not
catch `tenantId` buried inside a nested sub-document field path some other operator writes through
(e.g. `$set: {"nested.tenantId": "x"}` — a dotted path, not a literal `tenantId` key) — no code in
this project does that today, and chasing every possible dotted-path shape is the same
whack-a-mole this unit exists to stop; flagged rather than silently assumed complete.

## How to verify (for the checker)

1. Reproduce the `$unset` mutation and confirm it reddens — use your own wording, not mine.
2. Try an operator this manifest did NOT test (`$currentDate`, `$inc` targeting `tenantId`, or a
   dotted-path `$set`) and see whether the generic scan catches it or not; report either way.
3. Confirm `indexing.ts` has zero diff from HEAD.
4. `pnpm -r test`, `pnpm -r typecheck` clean; apps/api 71/71.

## Status: checked-PASS

**Verdict:** `qa/verdicts/assertAllCallsConfined-unset-coverage.md` — **PASS**, `Cycle checked: 1`,
commit `985dd52`. 4/4 verify steps met · contract criterion 3a holds.

### What the checker ruled

1. **Reproduced independently, plus one operator the manifest never exercised itself:** the
   `$unset` mutation, and `$currentDate` (not `$rename`, its own choice) — both caught, confirming
   the generic scan wasn't accidentally shaped around the three demonstrated cases.
2. **The manifest's own `$set`-reassignment and `$rename` mutations reproduced with the checker's
   own wording**, also caught.
3. **`indexing.ts` confirmed zero diff from HEAD** throughout the check.
4. **Ruled on the disclosed dotted-path limitation: acceptable as-is, not a blocker.** Independently
   verified the gap is real (`$set: {"nested.tenantId": "x"}` stays 71/71 green) but confirmed no
   code path in `indexSession` touches `tenantId` via a dotted path today — an honestly-flagged
   scope boundary, not something owed inside this unit.
5. Full suite 335/335, typecheck clean across all 10 projects.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
