# Manifest — vacuous-tenancy-assertion

**Contract:** none directly. The nearest is `qa/contracts/hybrid-retrieval.md` C6's tenancy
reasoning, which this test is the `indexing` counterpart of. ISS-203 rules that a vacuity criterion
must NOT be bolted onto `loop-safety.md`; judge against ISS-202's recorded reproduction.
**Goal task:** none — QUEUE row 1, tier 2 (open high, security class).
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-202 item 3** (high, security class — tenancy, therefore never round-capped).

## Why

The Mode B sweep was asked whether any *currently green* test in the repo shares the vacuity shape I
shipped three times today. It found three. This unit fixes the worst, and it is the one whose
subject is tenancy.

`promote-entities.test.ts` — named **"every write is tenant-scoped on filter and body"** — had three
independent escape hatches:

```js
for (const c of calls.filter(...)) {
  const body = c.update?.$set;
  if (body && "tenantId" in body) { assert.equal(body.tenantId, "tenant-a"); }
}
```

1. the filtered array was never asserted non-empty — **zero writes means the loop body never runs**;
2. the body check was **gated on `"tenantId" in body`**, so an implementation that drops `tenantId`
   from `$set` skips the assertion instead of failing it;
3. it never checked **the filter half of its own name**.

Hatch 2 is not hypothetical: it is exactly the mutation **ISS-156 records as having SURVIVED** on the
org body, in this same file.

## What changed

- `apps/api/src/indexing/promote-entities.test.ts` — the test rewritten. Non-emptiness asserted
  first; presence asserted **before** value so a missing `tenantId` fails rather than skips; the
  filter checked for reads and writes; a closing `writeCount > 0` so the body half cannot pass by
  seeing no writes.

**One design point I got wrong first and am recording rather than hiding.** The unconditional body
assertion initially tripped on `claims.find` — a **read**, which has no `$set`. The reflex fix is to
narrow the loop to writes. That would have dropped the read from the test entirely, and an unscoped
*read* is this repo's most expensive defect to date (ISS-078, a cross-tenant disclosure that survived
four PASSes and 102 green tests). So reads and writes are **partitioned**: both are checked on the
filter, only writes on the body.

## CORRECTION 2026-09-09 (ISS-210) — the `before` column below was COPIED, not measured

The cycle-1 checker restored this file to the unit's own baseline (`a032a8f`) and re-ran
**M-org-body**. It was **already killed there**, by the pre-existing `ISS-156` test in this same
file. My table says `before: survived`; I took that from ISS-156's ledger row, which recorded the
survival when the mutant was first found — units earlier, before that test existed.

**So this unit's contribution on M-org-body is a *second* killer, not the first**, and the table
overstates it.

**And the checker's correction is itself incomplete — I measured both rows at the true baseline
`a032a8f` rather than accepting either account.** `M-topic-body` was *also* already killed there,
by the pre-existing `ISS-126 sessionRefs` test, so the verdict's claim that it is a "first-kill by
this test" does not hold either:

```
M-topic-body @ a032a8f -> KILLED by "ISS-126: the written topic carries the UNIONED sessionRefs"
M-org-body   @ a032a8f -> KILLED by "ISS-156: the ORG body carries tenantId too"
```

The one genuine **first-kill** in this whole thread is `M-updateOne-filter-unscoped`, which survives
at `99ed8f3` and dies only after the ISS-211 split. Both body rows are second killers.

The habit, which is the actual finding and is D-015's: **a before/after mutation table's `before`
column must be measured at the commit the unit branches from** — via `git show <base>:<path>`, a
stash, or a worktree — and never copied from the issue row that first recorded the mutant. A mutant
recorded as SURVIVED units ago may have been killed since by something unrelated, and reporting it
as a fresh kill claims credit that belongs elsewhere.

Struck rather than rewritten, so the original claim and its correction are both legible.

## D-015 — measured against ISS-202's recorded reproduction

| mutation | before | now |
|---|---|---|
| **M-org-body** — drop `tenantId` from the ORG `$set` | ~~survived~~ **already killed at baseline by the ISS-156 test** (ISS-210) | **KILLED** (2 failures) — a *second* killer |
| **M-topic-body** — drop `tenantId` from the TOPIC `$set` | ~~survived~~ **already killed at baseline by the ISS-126 sessionRefs test** (ISS-210) | **KILLED** — a *second* killer |
| **M-org-filter** — de-scope the org filter to a bare slug | killed elsewhere | **survives THIS test** — see below |
| **M-updateOne-filter-unscoped** — remove `tenantId` from the WRITE filter only (ISS-211) | **survives** (measured at `99ed8f3`, compiling mutant) | **KILLED** (2 failures) after the ISS-211 split |
| CONTROL (no mutation) | — | 173 pass / 0 fail |

**M-org-filter survives my test, and that is correct rather than a gap — I checked instead of
assuming.** Printing the real captured filters shows `scopedCollection` merges `tenantId` into every
one of them:

```
topics updateOne {"_id":"tenant-a:visa-rules","tenantId":"tenant-a"}
orgs   updateOne {"_id":"tenant-a:acme","tenantId":"tenant-a"}
claims find      {"evidence.sessionId":"s1","tenantId":"tenant-a"}
```

So the mutant's filter is still tenant-scoped; its actual harm is the **cross-tenant `_id`
collision** (ISS-121's shape), which two other tests already kill — `ISS-C-TARGETING: topic and org
upserts target their own _id` and `C6: org ids are namespaced too`. My filter assertion is real
defence-in-depth (it fails a filter carrying no `tenantId` at all), but **it is not the guard for
that mutant, and I am not claiming it is.**

Every mutant was applied through `scripts/lib/mutate.mjs`, asserted present on disk, **typechecked
before its run counted** (a mutant that does not compile fails everything for the wrong reason and is
a fake kill), restored in a trap on EXIT/INT/TERM/ERR; `assert-clean` green afterwards.

## How to verify (commands + expected)

- `pnpm --filter @lkb/api test` → **173 pass, 0 fail, 0 cancelled**
- apply M-org-body → the ISS-202 test **fails**; restore → green
- `node scripts/lib/mutate.mjs assert-clean` → none outstanding

## Not in this unit

ISS-202's other two items are QUEUE row 2 (`vacuous-evidence-probes`) and deliberately left there —
one unit per cycle. They are: `live-rank-probe-2026-09-08.mjs`, whose `mismatchedPairs` is 0 **by
construction** and which never calls the store the defects it cites were *in*; and
`AskPage.test.tsx:140-147`, which never submits the form.

## Live browser evidence

`Not UI-touching — no surface changed.` The only changed path is
`apps/api/src/indexing/promote-entities.test.ts`, a test file under `apps/api/src/indexing/`;
`qa/ui-surfaces.json`'s pattern covers `apps/api/src/{server,production,ask-arms,search-store,store,
ingest-store,whatsapp-store}.ts` and does not reach it, and no page's data flows through a test.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
