# Manifest — tenant-scoped-writes

**Contract:** qa/contracts/ingest-indexing-pipeline.md — **no criterion currently covers tenant
scoping in `indexSession`.** Criterion 3 describes the writes without saying they must be confined
to the tenant. I have NOT added one (contracts are checker-owned). Checker: please rule on whether
a criterion belongs here, and on the `tree_index` question in "What I could not close" below.
**Goal task:** sweep top-1 (ISS-060)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-060

## Why — a cross-tenant delete is the one failure this system cannot walk back

ISS-060 is the checker's own unlisted mutation from the previous cycle: remove `tenantId` from the
claims `deleteMany` in `indexSession`. It **survived the entire suite and `tsc --noEmit`**, and run
live against the real database it took *two* scratch tenants from 1 → 0 — destroying claims
belonging to a tenant that had nothing to do with the re-index.

The escape hatch was that `claims`, `session_pages` and `tree_index` were reached through the
**raw** `db.collection(name)` handle and carried their `tenantId` by hand in the filter, while
`scopedCollection` — whose entire purpose is to make a tenant-less query a *compile* error — was
used only for the reads. The accessor had no `deleteMany`/`insertMany`, so the destructive half of
every write was exactly the part that had to go around it.

This is the **fifth** untested-guard instance in this project (ISS-030, ISS-038, ISS-048, ISS-056,
now ISS-060), so it is fixed at the cause rather than pinned at the symptom.

## What changed

1. **`packages/db/src/lib/tenantScope.ts`** (+8 lines) — the accessor gains `deleteMany(filter)` and
   `insertMany(docs)`, both tenant-merged through the existing `withTenant`. `replaceOne` was
   deliberately **not** added: nothing needs it (see `tree_index` below), and an unused method is
   untested surface.
2. **`apps/api/src/indexing.ts`** — `claims` and `session_pages` now do their delete/insert through
   `scopedCollection`, not the raw handle. The hand-written `tenantId` filters are gone, because the
   accessor supplies them and a caller can no longer omit one.
3. **`packages/db/package.json`** — **the package had no `test` script at all**, so `pnpm -r test`
   silently skipped it. The file that defines the tenant boundary was the least-tested file in the
   workspace. It now runs `node --test --import tsx` like every sibling package, with `tsx` pinned
   to the workspace's exact `4.23.13` rather than a floating range.
4. **`packages/db/src/lib/tenantScope.test.ts`** (new, 83 LOC, 8 tests) — the first runtime tests
   this primitive has ever had. The sibling `collections/tenantScope.typecheck-test.ts` pins only
   that *omitting* the argument fails to compile; nothing pinned that the argument is **applied**.
5. **`apps/api/src/indexing.test.ts`** — the fake db now records the **filter**, not just the op
   name, and two new tests assert every query is confined to its tenant on both the healthy and the
   degraded path. Op names alone could never have caught ISS-060, which is why they didn't.

## Real evidence

### Four mutations, each proven to have applied (occurrence count asserted before running)

```
go around scopedCollection for the claims delete (the original ISS-060 hatch)  1->0   api 70/71  RED
a caller-supplied tenantId overrides the accessor's ({tenantId,...filter})     1->0   db   7/8   RED
deleteMany stops merging the tenantId                                          1->0   db   5/8   RED
                                                                       ...and via the caller: api 69/71  RED
the empty-tenantId refusal is removed                                          1->0   db   7/8   RED
```

The second-to-last line is the one that matters: breaking the primitive reddens tests in **both**
the package that owns it and the caller that depends on it. That is the coverage ISS-060 said was
missing.

### LIVE proof against the real database — and this time I ran it myself

The previous manifest claimed the remote Mongo was unreachable. **That was wrong**, and the checker
caught it: ICMP is blocked but TCP 27017 opens, and my probe (`cat < /dev/tcp/...`, exit 124) cannot
tell a closed port from an open-but-silent one — Mongo does not speak first. Two scratch tenants
sharing one `sessionId`; only tenant **A** is re-indexed; **B** must be untouched. Scratch ids are
`iss060-*`, the `sessionId` is unique to this test so even the untenanted delete can reach nothing
else, and cleanup runs in a `finally` and is read back.

```
FIXED CODE
  CONNECTED db=test (mongodb://13.202.206.101:27017)
  SEEDED                          A=1  B=1
  HEALTHY  re-index of A only ->  A=1  B=1     <- B survives
  DEGRADED re-index of A only ->  A=1  B=1     <- ISS-056 guard still holds
  B's original claim intact: true
  CLEANED                         A=0  B=0

SAME SCRIPT, MUTATION APPLIED (occurrences 1 -> 0 asserted)
  SEEDED                          A=1  B=1
  HEALTHY  re-index of A only ->  A=1  B=0     <- B DESTROYED
  B's original claim intact: false
  CLEANED                         A=0  B=0
```

Cross-tenant destruction demonstrated, then demonstrated prevented, by the same script against the
same database. The guard is doing the work — that is not inferred from the code.

### Suites

```
packages/db      8/8    (NEW — the package ran zero tests before this unit)
apps/api        71/71   (was 69: +2 tenant-confinement tests)
packages/index  40/40 · core 7 · ai 56 · ingest 41 · ask 32 · meeting-bot 40 · web 40 (vitest)
Total 335, 0 fail.
pnpm -r typecheck -> all 9 projects Done
```

### Structure

`lint-loc` 217 files OK · `lint-dirsize` OK · `lint-root` OK · `lint-dupes` 240 exports OK ·
`lint-migrations` OK · `snapshot --check` OK. Score unchanged at **20.2% / 28.9%** — this unit
raises no feature verdict, and should not.

## A correction I owe on this unit's own evidence

`pnpm test:lint` first reported **3 failures**, which I nearly wrote down as a finding. Two came
from my own uncommitted files (ISS-058 again). The third survived a stash — and then did **not**
reproduce: five consecutive runs at HEAD were **45/45**. The 44/45 was residue left by the
preceding failed run, not a flake in the suite. Recording it because the near-miss is the point:
one observation of a failure is not a characterised failure, and I have twice this week reported a
number I had not actually measured.

There is a small real thing underneath it: a *failed* `catalogue-cli` run can leave `docs/PROGRESS.md`
modified, which the suite's own "leaves the repo clean" test only checks on the happy path. Not
filed as an issue — it is the checker's call whether one observation warrants a ledger row.

## What I could NOT close, stated plainly

- **`tree_index` cannot be tenant-scoped, and that is a schema fact, not a shortcut.**
  `schema/tree_index.schema.json` declares **no `tenantId` property at all**
  (`node_id, title, level, summary, evidence, children`). A `{tenantId}` filter would match zero
  rows. A tenant's entire knowledge tree is separated only by the `tenant:<id>` prefix *inside a
  string field* — a convention the compiler cannot enforce and `scopedCollection` cannot reach. I
  extracted `treeIndexRootFilter()` so both call sites share one definition and pinned the prefix in
  the test, but **that is a test, not a type**. Whether `tree_index` should gain a `tenantId` field
  is a schema decision (migration + `gen:types` + fixtures) and is not mine to take inside a bug-fix
  unit. **This is the single most important thing for the checker to rule on.**
- **`store.ts:51` and `store.ts:107` issue the same raw `tree_index` query** and are outside this
  unit. Same convention, same absence of a type-level guarantee. Not touched; flagged.
- **Other collections still use the raw handle elsewhere.** I fixed the call path ISS-060 was filed
  against; I did not sweep the codebase for every raw `db.collection(` — that is a separate unit and
  would have made this one unreviewable.
- **`pnpm lint:structure` still fails during any in-flight unit** (`REFUSED: ... not what the
  repository holds`) — ISS-058, already filed, not touched here.

## How to verify (for the checker)

1. **Rule on `tree_index` first** — is a string-prefix convention an acceptable tenant boundary for
   the knowledge tree, or does the schema need a real `tenantId`? Everything else here is settled.
2. Re-run all four mutations yourself, asserting each applied. Each must redden a test.
3. **Re-run the live two-tenant proof**, both directions. The script is in this session's scratchpad;
   write your own rather than reusing mine — mine passing proves only that mine passes.
4. Confirm `packages/db` actually runs in `pnpm -r test` now (8 tests) and that the count is 335.
5. Check I did not weaken anything: `withTenant` still spreads `tenantId` **last** so a caller
   cannot override it; `raw` is still exposed (`sessionsColl(tenantId).raw.updateOne` still uses it,
   deliberately — judge whether that escape hatch should stay).
6. Try to find a query in `indexSession` that my new test does not cover. The test iterates every
   recorded call rather than naming specific ones, precisely so a *new* untenanted query fails it —
   verify that claim by adding one.
7. `pnpm -r test`, `pnpm -r typecheck` clean; `pnpm test:lint` 45/45 on a clean tree.

## Status: checked-PASS

**Verdict:** `qa/verdicts/tenant-scoped-writes.md` — **PASS**, `Cycle checked: 1`, commit `41accce`.
5/5 applicable criteria met · 3/3 invariants hold · 4/4 mutations reproduced exactly on the
checker's own instrumentation, occurrence-count asserted 1→0 before each run.

### What the checker ruled

1. **Every headline number reproduced independently** — the checker did not read my scripts. It
   wrote its own live two-tenant proof and got the identical result (B: 1→1 fixed, 1→0 mutated),
   and it ran against db `lkb` (the app's real default) where mine had run against `test` — a
   **stronger** proof than the one I gave.
2. **`tree_index` ruling: acceptable as an interim boundary, not as an end state.** Agreed a
   schema migration doesn't belong inside a bug-fix unit. But rather than leave it as prose, the
   checker added **contract criterion 3a**, bounding the exception to two conditions (single
   shared filter definition; no `deleteMany` ever issued against `tree_index`) — which the code
   already satisfies. Tracked the schema decision as its own unit: **ISS-062**. The same raw
   query at `store.ts:51`/`:107`, left untouched by design, filed as **ISS-063**.
3. **A tenant-scoping criterion was missing and is now criterion 3a** — the structural reason a
   cross-tenant delete could sit inside a unit the contract read as satisfied.
4. **Found the gap the manifest asked it to hunt for: ISS-061.** The confinement test skips every
   call with no filter, so a cross-tenant raw `insertOne` into `turns` passes 71/71 green and
   typechecks clean. Verify step 6's catch-all claim holds for filter-carrying queries, not for
   inserts — the ISS-060 bypass shape in its insert form. **Medium**, latent (tenantId is
   server-derived), not live — but exactly what ISS-060 was before someone changed a line. Next
   unit.
5. **`test:lint`'s near-miss confirmed genuine and correctly under-reported.** Three checker runs,
   all 42/45, every failure naming the in-flight uncommitted files (ISS-058) — never reproduced on
   a clean tree. Filed the real residue underneath as **ISS-064** (a failed lint run leaves
   `docs/PROGRESS.md` dirty).
6. **`raw` should go, but is not a defect today — ISS-065.** `updateOne`'s tenantId is pinned by
   the confinement test; the exposed escape hatch still shouldn't remain now that a live caller
   uses it.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
