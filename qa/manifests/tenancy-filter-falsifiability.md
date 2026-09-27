# Manifest — tenancy-filter-falsifiability

**Contract:** none. ISS-203 owns the missing vacuity criterion and the `handshake-liveness` START is
already a pending HUMAN_GATE; the cycle-1 checker of `vacuous-tenancy-assertion` explicitly declined
to open a third contract home while a gate on the second is unanswered. Judge against ISS-210 and
ISS-211's recorded fix directions.
**Goal task:** none — follow-on to `vacuous-tenancy-assertion` (PASS), same file.
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-210**, **ISS-211** (both medium, both filed against my previous
manifest's *evidence claims* rather than its fix).

## ISS-211 — my filter assertion was unfalsifiable on the half its name promises

`filterIsScoped` accepted `_id.includes(tenant)` for **every** operation. The entity writes filter on
a namespaced `_id`, so that disjunct absorbed them: removing `tenantId` from the write filter still
passed a test named *"tenant-scoped ON FILTER and body"*. My manifest claimed it "fails a filter
carrying no tenantId at all" — true of the read, **false of the writes**.

That is the fourth vacuity of the day, and it was inside the fix for the third.

**Fix — option (a) of the two ISS-211 offered**, chosen because it makes the test's name literally
true, which is the point of this whole thread:

| operation | rule |
|---|---|
| **write** | `tenantId` must be in the filter **itself**. A namespaced `_id` guards against *collision* (ISS-121), not against an unscoped update — the old helper conflated two different guarantees. |
| **read** | the namespaced-`_id` disjunct is allowed: fetching one row by an id that already contains the tenant cannot cross a boundary. |
| either | a lone `sessionId` counts for neither — session ids are not tenant-namespaced. |

**Measured, with a mutant that compiles** (`scopedCollection` replaced by the raw handle for the two
entity collections only, so the `claims` read stays scoped and the write half is isolated):

| | ISS-202 test | repo-wide |
|---|---|---|
| **M-updateOne-filter-unscoped @ `99ed8f3`** (before) | **SURVIVES** | 3 fail (ISS-154 + `session.test.ts` ×2) |
| **M-updateOne-filter-unscoped @ HEAD** (after) | **KILLED** | 4 fail (the above + this test) |

**Count correction (the checker's low note, and it is fair).** My first version of this table said
"0 failures" and "2 failures". Those were `grep -c` over the runner's output, and node prints each
failing test **twice** — once inline and once under `failing tests:` — so "2" was one failing test
counted twice, and neither cell mentioned the repo-wide total. The SURVIVES/KILLED verdicts were
right; the numbers beside them were an artifact of how I counted. That is precisely the habit
ISS-210 exists to fix, recurring inside the unit that fixes it.

The first attempt at this mutant did **not** typecheck (`as never` collapsed the return type), and a
non-compiling mutant fails everything for the wrong reason — a fake kill. The table above is from
the compiling version, typechecked before the run counted.

## ISS-210 — my `before` column was copied, not measured; and the checker's correction is also incomplete

I reported `before: survived` for both body mutants, taken from the ledger rows that first recorded
them. The checker caught it for `M-org-body`.

**I measured both at the true baseline `a032a8f`** — the commit the unit branched from, not the
unit's own commit — rather than accepting either account:

```
M-topic-body @ a032a8f -> KILLED by "ISS-126: the written topic carries the UNIONED sessionRefs"
M-org-body   @ a032a8f -> KILLED by "ISS-156: the ORG body carries tenantId too"
```

So **both** body rows are second killers. The verdict's claim that `M-topic-body` is a "first-kill by
this test" does not hold either. The one genuine first-kill in the thread is
`M-updateOne-filter-unscoped`, above.

The previous manifest is corrected in place with the original claims **struck, not deleted**.

## How to verify

- `pnpm --filter @lkb/api test` → **173 pass, 0 fail, 0 cancelled**
- `git show a032a8f:apps/api/src/indexing/promote-entities.test.ts` into place + M-topic-body →
  reddens `ISS-126 sessionRefs`, reproducing the baseline measurement
- `node scripts/lib/mutate.mjs assert-clean` → none outstanding · `pnpm lint:structure` → green

## A question I want ruled on, not answered by me

**This is the fourth consecutive round on the vacuity seam** (ISS-197 → ISS-202 → ISS-211, plus
ISS-196/199 on the parser). Each round has found something real, so it is converging rather than
grinding — but that is exactly what a grind looks like from inside it. The severity gate caps
non-security seams at 2 PASSes; this seam keeps producing *tenancy* findings, which are never
capped.

**Judge whether the seam should now close**, and say so plainly if the honest answer is that I am
polishing a test file while ISS-202 items 1+2, the enforcement HUMAN_GATE and the roadmap tier all
sit open.

## Live browser evidence

`Not UI-touching — no surface changed.` Only `apps/api/src/indexing/promote-entities.test.ts` and two
manifests changed; `qa/ui-surfaces.json`'s pattern does not reach `apps/api/src/indexing/`, verified
by the previous checker compiling that pattern and matching it, with `AskPage.tsx` as a positive
control.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
