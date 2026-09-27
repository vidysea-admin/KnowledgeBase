# Manifest — vector-gap-record
**Contract:** qa/contracts/ingest-indexing-pipeline.md
**Goal task:** U1.0c
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-118 (high)

## Why this unit exists

ISS-118 was filed **by the checker of the previous unit, against that unit's own weakest point.**
U1.0b surfaced the missing-vector condition in a return value and a `console.warn` on both ingest
paths. I disclosed the warn as "a weak surface". The checker then did what I had not: it **disabled
the warn on BOTH ingest paths simultaneously and the entire 124-test suite stayed green.** So the
operator half was not weak, it was *unguarded* — one careless edit from the exact silence that let
three sessions (37% of the corpus) sit outside the vector index while every status field read
`"done"`.

## What changed

- `schema/gaps.schema.json` — **additive** `kind: "vector-pending"`. The two existing kinds describe
  content we never received; this describes content we **have** and cannot retrieve. Same
  `open → received` lifecycle, so it belongs in `gaps` rather than in a new collection.
  `pnpm gen:types` re-run; `python schema/validate.py` passes (24 collections).
- `apps/api/src/indexing/vector-gap.ts` (new) — `recordVectorGap`. **Idempotent by a derived `_id`**
  (`vector-pending:<sessionId>`): a re-index cannot accumulate rows, and a later success **resolves**
  the row rather than leaving a stale `open` gap outliving the problem. Failure upserts; success
  updates `{_id, status: "open"}` **without** upsert, so a session that never failed never gains a
  gap row at all.
- `packages/db/src/lib/tenantScope.ts` — `updateOne` gained an optional `options` parameter so the
  upsert is possible. **Options-only and cannot weaken scoping:** the filter is still
  `withTenant`-merged before it reaches the driver, so an upsert's *inserted* document is built from
  a filter that already carries the `tenantId`. `raw` stays removed (ISS-065).
- `apps/api/src/indexing/` (new directory) — `session.ts`, `vector-gap.ts`, `types.ts`,
  `testutils.ts` + two test files. See the structural note below; this was forced, not cosmetic.
- `apps/api/src/indexing/testutils.ts` — shared fixtures, so the two suites do not keep **two
  copies of the tenant-confinement assertions**, which are the most safety-relevant checks here.

## The structural work was not optional

Adding the gap code broke three real gates, and each fix is recorded rather than waved through:

1. **`lint-loc`** — `indexing.ts` hit 312/300 and its test file 453/400. Split by concern.
2. **`depcruise no-circular`** — `session.ts → vector-gap.ts → session.ts`, because the gap
   recorder needs the chunk-outcome type the session produces. Resolved with `types.ts`, owned by
   neither. **A real cycle, correctly caught; not a lint technicality.**
3. **`lint-dirsize`** — `apps/api/src` was **already at exactly 30/30 at HEAD**, so *any* new file
   broke it. **I did not request a fourth budget override.** D-018's own recorded bound says a third
   raise must consolidate rather than widen, so the files moved into `apps/api/src/indexing/`,
   following the existing `routes/` precedent. `apps/api/src` drops to 28.

## How to verify (commands + expected)

- `pnpm -r typecheck` → exit 0
- `pnpm -r test` → exit 0; `@lkb/api` 128 pass, `@lkb/db` 14 pass
- `python schema/validate.py` → exit 0, 24 collections
- each structure gate individually by exit code (ISS-100)
- mutation: `if (chunks.skipped)` → `if (false)` in `vector-gap.ts` → the gap tests must fail

## Actual outputs (from maker's own run)

```
pnpm -r typecheck                 exit=0
pnpm -r test                      exit=0     @lkb/api 128/128, @lkb/db 14/14
python schema/validate.py         exit=0     PASS: 24 collection schema(s)
lint-loc=0  lint-dirsize=0  lint-root=0  lint-dupes=0  lint-migrations=0
snapshot=0  depcruise=0  (no dependency violations, cycle resolved)
tracker-audit g1=1  ← PRE-EXISTING, other lane's U2.4 (ISS-117)
```

**Mutation proof — the gap write is genuinely guarded:**

```
MUTATION ARMED: apps/api/src/indexing/vector-gap.ts
mutated: gap row never written on skip   ->  tests 128  pass 126  fail 2
RESTORED (verified identical to HEAD) · MUTATIONS CLEAN: none outstanding
git diff --quiet HEAD -- apps/api/src/indexing/vector-gap.ts  -> byte-identical
  -> tests 128  pass 128  fail 0
```

This is the specific thing ISS-118 said was missing: **deleting the surface now fails tests.**

## Disclosed — the checker should press on these

1. **`tenantScope.updateOne` is a tenancy-critical helper and I widened its signature.** I added a
   dedicated test asserting the tenant merge still happens **on the upsert path specifically**,
   because an upsert builds the inserted document from the filter — if the merge were skipped
   there, the helper whose entire job is preventing tenant-less rows would create one. Please
   attack that directly rather than trusting the test I wrote for it.
2. **No live verification.** The gap row has **never been written against real Mongo** — the three
   sessions that would have produced one are now all successfully embedded, so the failure path
   cannot be triggered without deliberately breaking something. Fixture-level only, and I am not
   claiming more. This is the same class of gap that let U1.1–U1.3 ship a capability producing zero
   rows, so it deserves suspicion rather than a pass on my say-so.
3. **`GET /gaps` and the Dashboard were not touched.** They read the `gaps` collection generically,
   so a `vector-pending` row should surface without changes — **I did not verify that end to end.**
4. **The file move is large in diff terms** (5 files relocated, imports rewired in 3 call sites, one
   source-path test updated). It is mechanical, `git mv` preserved history for the two tracked
   files, and every gate is green — but it deserves a read rather than a skim.

## Status: checked-PASS

**Verdict:** `qa/verdicts/vector-gap-record.md` — PASS, cycle 1, 8/8 criteria, 3/3 invariants,
committed `f59fb3a`. `ISSUES-WRITTEN: ISS-121 (medium)`.

**The checker retired my two live-verification disclosures rather than accepting them.** I had
disclosed that no `vector-pending` row had ever been written against real Mongo and that
`GET /gaps` was unverified end to end. It wrote its own live script against scratch tenants
(`chk118-a/b`), and proved on real rows: a real gap row written, idempotence across a re-index,
resolution to `received`, that a never-failed session gains **no** row, schema validity, zero
tenant-less rows collection-wide, and the real `gaps(tenantId)` accessor behind `GET /gaps`
(tenant A sees it, tenant B does not). It then deleted the scratch data and **read the cleanup
back from the server**. Both Dashboard renderers print `kind` with no allowlist, so the new kind
needs no UI change.

**The tenancy attack held.** It mutated `tenantScope.updateOne` to skip the merge *only on the
upsert path* — precisely the defect the new parameter makes possible — and both suites caught it
(`packages/db` 13/1, `apps/api` 126/2, independently). No tenant-less row is creatable through the
upsert path; `raw` stays gone.

**ISS-121 (medium) — a real bug I introduced, and its consequence is worse than its severity
label suggests.** `_id = vector-pending:<sessionId>` is globally unique while the *filter* is
tenant-merged, so a second tenant recording a gap for the same `sessionId` hits a live-reproduced
`E11000`. It is reachable: `whatsapp-store.ts:132` derives `sessionId` from a sha256 of
`(groupJid, ownerUserId)` with **no tenant in it**. Isolation held (A's row stayed A's, B created
nothing), so the checker correctly graded it availability rather than disclosure. But the throw
escapes `recordVectorGap`, which `session.ts` calls **before** the `tree_index` update and the
`status.index` flip — so that session stays `"pending"` forever while ingest still returns 201.
**That is a silent indexing failure introduced by the unit whose entire purpose was to end a
silent indexing failure.** Pulled immediately as the next unit under the severity gate's
tenancy/data-write clause, not deferred.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
