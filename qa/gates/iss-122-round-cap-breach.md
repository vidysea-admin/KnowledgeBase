# GATE — a built, verified unit exists that the round cap says should never have been pulled

**Opened:** 2026-09-27 by the maker, against its own dispatch. **Owner:** Umesh (Approver).
**Severity:** the code is low-risk; the governance question is not.
**Blocks:** merging `wave/vector-gap-durability` (49f49aa, 5d25837). Blocks nothing else.

## What happened

I dispatched a tier-4 unit for **ISS-122** (`vector-gap.ts`, the `recordVectorGap` blanket catch).
D-014's class-based round cap says: *"Before pulling a non-security unit, count prior PASSed verdicts
naming the same seam; at ≥2, skip it and say so."* **I did not count.** The seam has two:

- `qa/verdicts/vector-gap-record.md` — PASS
- `qa/verdicts/vector-gap-tenant-id.md` — PASS, and it is the verdict that **filed ISS-122**

That second verdict is explicit on all three points, verified by reading it rather than taking the
builder's word (`grep` output pasted in `qa/.last-tick`):

- line 157 — it considered whether ISS-122 belongs in the **security class** (which is never capped)
  and ruled that **it does not**;
- line 154 — it says the fix belongs in *"the next unit touching this file — not a unit of its own,
  and explicitly not a third round on this"*;
- line 187 — *"ISS-122 is filed and must **not** be promoted into a round-3 unit on its own. It is
  verified inside the next unit that touches vector-gap.ts for another reason."*

My dispatch was precisely the shape all three sentences forbid. The builder discovered this itself,
while reading a neighbouring manifest for a formatting template, **after** the fix was already written
and mutation-verified. It finished, disclosed it as the first section of its manifest in bold, and
refused to merge or self-certify. That was the right call and is worth saying plainly.

## What exists on disk right now

Branch `wave/vector-gap-durability`, unmerged. `recordVectorGap` returns `Promise<boolean>` instead of
`Promise<void>` (`true` from both success paths, `false` from the existing catch, which still never
rethrows); `IndexSessionResult` gains `gapRecorded`; `session.ts` threads it; `ingest-store.ts` and
`whatsapp-store.ts` warn at the boundary, mirroring the `res.chunks.skipped` check two lines above each.
Reported evidence: `pnpm -r test` 946/946, two typechecks exit 0, `lint-loc` unchanged at the same 4
violations, ISS-122 5/5 against an authored corpus (the row records no reproductions), three
self-written mutations each RED on their own assertion, mutation ledger clean.

**No checker has been dispatched, deliberately.** Dispatching one would be *conducting* round 3, which
is the thing in question. This is the one case where the no-dangling rule yields: the manifest sits at
`ready-for-check` because the check itself needs your authorization, and I am saying so out loud rather
than quietly leaving it.

## The decision

**(a) Merge it — waive the cap once, on the record.** The work is done, independently falsified, and
946/946 green. Cost: the cap is a rule this repo adopted *because* a seam ran seven rounds in one day,
and waiving it the first time it binds teaches the loop that the cap is advisory. If you pick this, it
should carry a DECISIONS entry saying the cap was waived and why, so the precedent is explicit rather
than inferred from a merge.

**(b) Hold the branch; let the cap stand — recommended.** ISS-122 stays `open` and is verified inside
the next unit that touches `vector-gap.ts` for another reason, exactly as the verdict directs. The
branch is not deleted; when that unit comes, its diff is already written and reviewed. Cost: the work
sits unmerged for an unknown period, and a real (if low-severity) silent-failure path stays open
meanwhile.

**(c) Reclassify ISS-122 as security class**, which is never capped, and let it proceed normally. I do
**not** recommend this and want to be clear why: it would be reclassifying a finding *to get past a
rule*, and the checker that filed it already considered exactly this question and ruled against it. A
class that can be re-argued after the fact when it blocks something is not a class.

## The thing I would rather you take from this than the merge decision

The cap worked — but not through me. It worked because a subordinate agent read a neighbouring verdict
by accident. Nothing in my backlog-selection step counts prior PASSes per seam, so the same breach is
available on every future tick. Filed as **ISS-346**. Whatever you answer here, that gap is the part
worth fixing, and it is mechanical: the seam's PASS count is computable from `qa/verdicts/` before a
unit is pulled.

**Answer format:** reply `iss-122-round-cap: a` (or b / c). Under (a) or (c) an authorizing DECISIONS
entry is written before the merge.

**Answered:** (pending)

**Gate status:** OPEN — awaiting the Approver; see the Answer format section in this file
