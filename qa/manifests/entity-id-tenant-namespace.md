# Manifest — entity-id-tenant-namespace
**Contract:** qa/contracts/entity-promotion.md
**Goal task:** U2.1c
**Date:** 2026-09-09
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** contract C6 (met, cycle 1) · contract C3 / ISS-154 (the cycle-1 FAIL)

## This is the second time I have shipped this exact bug

C6 was derived by the checker **while writing the contract**, from the code and the ISS-121
precedent, and stated honestly as *believed unmet, not live-reproduced*. **I reproduced it live
before fixing anything:**

```
tenant A upsert {_id:"uk"}  -> OK
tenant B upsert {_id:"uk"}  -> E11000 duplicate key ... index: _id_ dup key: { _id: "uk" }
cleanup deleted: 1 | leftover: 0
```

`scopedCollection` merges `tenantId` into the **filter**, but Mongo's `_id_` index is unique per
**collection**. So tenant B's upsert of a slug tenant A already holds matches nothing, attempts an
insert, and is rejected.

**ISS-121 was the same bug, in `recordVectorGap`, fixed by me one unit earlier** with
`vectorGapId(tenantId, sessionId)`. I wrote that fix, wrote a comment explaining why the id must
carry the tenant, and then did not carry the lesson one file across.

**And it is worse here than it was there.** ISS-121's throw stranded one session loudly enough that
a checker found it. This one sits inside the never-throws `catch` (C2) that I also added — so
tenant B would lose **all** entity promotion, silently and permanently, while the log reads
`promotion-failed` and every status field says done.

## What changed

- `apps/api/src/indexing/promote-entities.ts` — exported `entityId(tenantId, slug)`. Both the
  `topics` and `orgs` upserts use it.
- **`claims.topicRefs` is namespaced through the SAME helper.** If the rows carried a tenant and
  the refs did not, every ref would point at an id that does not exist — two conventions that agree
  until one is edited. One function, not two.
- 3 tests: two tenants + same slug produce different ids (topics and orgs), and a `topicRef`
  equals the id actually written.

## No migration — verified, not assumed

`topics` and `orgs` are still 0 rows (the U2.1 deferral holds), and `claims.topicRefs` is empty on
all 81 claims, so no stored id carries the old shape. Both scratch probes cleaned up and were read
back at 0 leftover.

## How to verify

- `pnpm --filter @lkb/api test` → 159 pass
- mutation: `entityId` → `return slug` → must fail
- live: two tenants upserting the same slug must both succeed

## Actual outputs

```
MUTATION: entityId -> bare slug        -> 155 pass / 4 fail
RESTORED (identical to HEAD) · MUTATIONS CLEAN: none outstanding
live, WITH the fix: BOTH tenants upserted OK; rows: 2; cleanup deleted 2, leftover 0
live, BEFORE the fix: tenant B -> E11000 duplicate key on index _id_
```

## Disclosed

1. **The `_id` shape is now `<tenantId>:<slug>`**, so `topicRefs` values carry a tenant prefix. That
   is deliberate — a ref must resolve to a real `topics._id` — but it is a visible convention change
   and a checker should confirm nothing else parses these ids expecting a bare slug.
2. **The pure `promoteTreeEntities` still returns bare slugs.** Namespacing happens at the write
   boundary only, which keeps the pure function tenant-agnostic and testable. A checker should
   decide whether that split is right or whether the tenant belongs in the pure layer.
3. **Contract C6 says "either tenant-namespace the `_id`, or carry a compound unique index".** I
   took the first, matching the ISS-121 precedent. A compound `(tenantId, slug)` unique index would
   be the more database-native answer and would keep ids readable; I did not take it because it
   needs a migration and an index assertion at boot, and this project has no live rows to justify
   that yet.
4. **This does not change the U2.1 deferral.** `topics`/`orgs` remain 0 rows; C8's precondition
   still holds.

## Cycle 2 — the fixture was exempting the code from its own tenancy test

**Verdict:** FAIL, cycle 1, 8/9. **C6 is confirmed MET** — the checker settled it itself rather
than on my word: live bare-slug gives `E11000 … index: _id_`, the shipped `<tenantId>:<slug>` lets
both tenants through, cleanup read back at 0 leftover. It also re-derived my mutation to 155/4
exactly and noted the detection is not tautological, since two of the four assert hard-coded
namespaced ids.

**It also corrected the contract in my favour, having proved it live.** C6 offered "namespace the
`_id`, **or** carry a compound unique index". That "or" is false: the rejection comes from the
implicit `_id_` index, which cannot be dropped or made partial — and `orgs` *already* carries a
unique `tenantId_1_name_1` while the bare-slug collision still fired. The contract was amended.

### The FAIL — C3's mandatory mutation survived, and the cause is the fixture

Replacing `scopedCollection` with a bare `db.collection()` handle on `topics` and `orgs`
**survived at 159/0 green with a clean typecheck.** Only the `claims` handle reddened.

Cause: **no test in the repo drove an entity write through `indexSession`.** `fakeDb`'s session had
no `org`, and its `session_pages` read returned nothing, so `buildTree` produced no entity nodes,
so `promoteAndPersistEntities` wrote nothing — and the blanket tenant-confinement test in
`session.test.ts` had **nothing to confine**. The direct tests asserted the update *body*'s
`tenantId` and never the *filter*, which is exactly what a bare handle would break.

**A fixture that cannot reach a path silently exempts that path from every test that walks the
recorded calls.** This is the fifth such gap in this layer.

### What changed

- `testutils.ts` — the session now carries an `org`, and `session_pages.find` returns a real page
  with a capitalised phrase so the default extractor yields a topic node. Both are load-bearing,
  and the comment says so, so nobody "tidies" them away.
- 2 tests: one pins that a full `indexSession` run **reaches** both entity writes; one pins that
  each write is tenant-scoped **on the filter**. They fail for different reasons on purpose.

**A real bug in my own fixture, found by the new test failing:** I wrote the page with
`sessionRef`, but `buildTree`'s lookup and `schema/session_pages.schema.json` both use
**`sessionId`**. So `orgs` promoted and `topics` did not — and had I written a weaker assertion, I
would have shipped a fixture that exercised half the path while looking complete.

```
BEFORE (cycle 1): scopedCollection -> bare handle on topics+orgs  -> 159 pass / 0 fail  (SURVIVED)
AFTER  (cycle 2): same mutation                                   -> 158 pass / 3 fail  (KILLED)
restored byte-identical · MUTATIONS CLEAN · clean run 161 pass / 0 fail
```

### Carried forward

- **The checker ruled the pure/write-boundary split right** (a `tenantId` the pure function only
  string-templates would leak storage upstream). It suggested, and I agree, renaming
  `PromotedTopic._id` to `slug` — it is now the one thing it is not. Not done here: it touches the
  pure module and its tests, and this unit is a tenancy fix. Filed as a follow-up rather than
  widened into.
- **No ref is broken by the id change** — it checked `routes/graph.ts`, `flatten-graph.ts`,
  BrainPage, the accessor and the schemas: no `split(":")`, prefix strip or id regex anywhere.
- **`topics`/`orgs` still 0 rows, `topicRefs` empty on all 81 claims.** C8's deferral holds.

## Status: checked-PASS

**Verdict:** `qa/verdicts/entity-id-tenant-namespace.md` — **PASS**, cycle 2, 9/9 criteria, 4/4
invariants (cycle 2 of 3; one unused). `ISSUES-WRITTEN: ISS-156 (medium)`.

**The checker verified this better than I did, and the difference is instructive.** I ran the
mandatory mutation on `topics` and `orgs` **together** and reported 158/3. It pointed out that a
combined mutation cannot distinguish *"both are covered"* from *"one is covered and the other still
is not"* — the exact failure it had caught at cycle 1. So it ran each collection **alone**: both
kill independently at 158/3. It also confirmed the tests that die are the right ones (all three are
tenancy assertions, none an incidental crash) and that the sibling "REACHES" test correctly stays
green, since a bare handle still writes — just unscoped.

**On the risk I flagged — that a richer fixture might make some other assertion vacuous — it
audited rather than reassured:** it ran the contract's full 12-mutation battery against the new
fixture. Eleven redden, and **nothing that previously reddened now survives.** The three exact
op-list `deepEqual`s on `session_pages` are untouched because that read was *already* recorded —
only its return value changed, not the op sequence — and the blanket assertions are lower bounds,
so more calls only tighten them.

### ISS-156 — one more asymmetry, closed here rather than deferred

Dropping `tenantId` from the **org** `$set` body survived 161/0 while the identical **topic**
mutation reddened. That is the same topics-vs-orgs asymmetry as ISS-154, one layer in: I asserted
the topic body and left the org body unpinned.

It is medium (live impact nil — `scopedCollection` merges `withTenant` into the filter and Mongo
builds the upsert-insert from it), and the severity gate would let it wait for "the next unit
touching this file". **It is one assertion, and no such unit is scheduled**, which is precisely how
this project has watched mediums become permanent. Closed now: mutation drops the org `tenantId`
→ **161/1**. 162 pass clean.

"Harmless because something else covers it" is exactly the reasoning that let the first asymmetry
survive, so I am not leaning on it twice.

**Also cleared by the checker's own mutations:** the never-throws catch (a rethrow reddens the
*named* assertion, not an incidental crash) and the `tagClaims:false` branch. The C6 amendment's
provenance under D-022 was checked and found sound — logged with date, class, reason and a verdict
cite, and **committed** rather than left as a working-tree edit.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
