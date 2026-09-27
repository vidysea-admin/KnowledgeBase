# Manifest — divergence-mapping-correction

**Contract:** `qa/contracts/` — no contract governs the gate corpus; checker, please author
`qa/contracts/audit-trail-integrity.md` if you judge one is owed.
**Goal task:** none (tier-1 QUEUE row 2).
**Date:** 2026-09-09
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-132** (high). Flags the ISS-101/ISS-111 duplicate.
**Status:** checked-PASS (cycle 1)

## Why

`qa/gates/ledger-id-divergence.md` holds the record of what the shared issue-id counter cost when
two maker loops ran concurrently — which id a lane's manifests cite versus which id that finding
carries on master. D-019 deliberately preserved it as the historical record and forbade renumbering.

The sweep found the table wrong and filed ISS-132. **Checking it, both of the sweep's corrections
are also wrong** — two independent careful readings of one ledger disagreed with each other and
with the ledger. That is the finding this unit is actually about.

## What changed

| File | Change |
|---|---|
| `scripts/lib/id-divergence.mjs` | **new** — derives the mapping from git + the ledger union. |
| `scripts/lib/id-divergence.test.mjs` | **new** — 9 tests, 8 on injected git output, 1 on the repo. |
| `qa/gates/ledger-id-divergence.md` | appended the derived correction; **original table byte-intact**. |
| `qa/issues.jsonl` | `ISS-111` flagged `duplicate_of: ISS-101`; ISS-132 → fixed. No renumbering. |

## The corrections, and what each earlier reading got wrong

**The table listed 4 rows. There are 12.** ISS-091/092/094/096/099 and the second collision pair
ISS-102/103 were absent, so eight of the twelve displacements had no record at all.

- **`ISS-093 → ISS-104` is CORRECT.** The sweep called it "unevidenced". Commit `2a44b7e` filed it
  as ISS-093; master carries the identical finding as ISS-104. The sweep compared the table's
  *paraphrase* against ISS-104's *title* and concluded they differed.
- **`ISS-097 → ISS-108` is CORRECT, and the sweep inverted it.** It called ISS-108 "an unrelated
  gazetteer residue" and proposed `→ ISS-111` alone. ISS-108 **is** lane-A's ISS-097 — both are
  *"'English speaking students may apply.' ships person:english"*. **Transcribing that correction
  would have replaced the one row the table got right with a wrong one.**
- The `+ ISS-111` in the original row *was* wrong — right symptom, wrong diagnosis. ISS-111 belongs
  to ISS-100.
- **ISS-101/ISS-111 are one finding under two ids**, not "byte-identical" (ISS-101 carries a
  `[RENUMBERED …]` suffix ISS-111 lacks) — identical *once that suffix is stripped*, which is what
  makes it a duplicate rather than two rows.

## The fix is the derivation, not the table

The table was wrong because it was hand-maintained: its only evidence was that someone had read
carefully. `deriveDivergence` asks git which ids a commit allocated (present at the commit, absent
at its parent) and the ledger **union** (D-019: `qa/issues.jsonl` + every `qa/issues.*.jsonl`)
which id carries that finding now, matching titles with the `[RENUMBERED …]` suffix stripped —
because that suffix is exactly what a renumbering appends. `duplicated` and `absent` are distinct
outcomes from `displaced`, so a finding that reached no master row is never silently dropped.

## How to verify

- `node --test scripts/lib/id-divergence.test.mjs` → 9 pass, 0 fail, 0 cancelled.
- `node -e "import('./scripts/lib/id-divergence.mjs').then(async m => console.log(m.deriveDivergence('.', m.checkerCommits('.', 'speaker'))))"`
  → the twelve rows in the gate's corrected table.
- `git diff HEAD~1 -- qa/gates/ledger-id-divergence.md` → **additions only**; the original table is
  untouched, per D-019.
- `pnpm lint:structure` → exit 0.

## Actual outputs

```
$ node --test scripts/lib/id-divergence.test.mjs
ℹ tests 9   ℹ pass 9   ℹ fail 0   ℹ cancelled 0

$ node -e "...deriveDivergence('.', checkerCommits('.', 'speaker'))"
ISS-091 -> ISS-102 [displaced]      ISS-097 -> ISS-108 [displaced]
ISS-092 -> ISS-103 [displaced]      ISS-098 -> ISS-109 [displaced]
ISS-093 -> ISS-104 [displaced]      ISS-099 -> ISS-110 [displaced]
ISS-094 -> ISS-105 [displaced]      ISS-100 -> ISS-101/ISS-111 [duplicated]
ISS-095 -> ISS-106 [displaced]      ISS-102 -> ISS-114 [displaced]
ISS-096 -> ISS-107 [displaced]      ISS-103 -> ISS-115 [displaced]
```

## Known gaps

1. **The derivation is title-matched.** A finding whose title was *edited* between filing and
   re-filing would read as `absent` rather than `displaced`. None of the twelve is, but the method
   has that limit and I would rather state it than let the word "derived" imply more than it does.
2. **Only the `speaker` lane is derived.** `checkerCommits(root, pattern)` takes any pattern, but no
   caller sweeps every lane. If another lane diverged, nothing here would surface it.
3. **Nothing re-runs this.** The test pins today's twelve, so a *change* is caught — but the gate
   file's table is still a copy, and a future divergence needs someone to re-run and re-paste.
   Wiring it into `lint:structure` would close that; I did not, because that gate is already shared
   mutable state the sweep flagged as ownerless.
4. **`ISS-111` keeps `status: open` alongside its `duplicate_of`.** Closing it would be a judgement
   about the *finding*, which belongs to a checker, not to this bookkeeping unit.

## Note to the checker

Gap 3 is where I would push. This unit's own thesis is that hand-maintained records rot, and its
remedy still ends in a hand-pasted table. If you think the correction is not real until something
re-derives it automatically, FAIL it — that would be consistent with the argument I just made.


---

# Close-out — PASS at cycle 1

Verdict `qa/verdicts/divergence-mapping-correction.md` (`Cycle checked: 1`, commit `3dbbde8`):
**PASS, 8/8 verification items, 3/3 invariants.** The checker re-derived all three disputed points
with its **own** script rather than re-running the module under test, and confirmed the maker wins
all three; it then verified all **12/12** pairs by title identity via an independent all-branch
allocation walk. 8/8 mutants killed with a green no-op control; the kills are specific rather than
blanket (M6 reddens only the D-019 union test).

**A wrinkle it found that strengthens the case, which I had missed:** `ISS-093` was allocated
**twice on different branches** — also at `a1fa870` in the golden-set lane. The `speaker` commit
filter is what disambiguates them, correctly but *incidentally*. That is a real limit of the
derivation: it is right here because the filter happens to separate two same-id allocations, not
because the method distinguishes them.

**Gap 3 (the invited FAIL) was declined on the merits**, and the reasoning is better than mine: the
twelve pairs are pinned in the test suite, so drift in either the ledger or the derivation now goes
red — the *silent* rot the unit targets is gone. The residual is narrower than I stated (the gate
table is a copy of the pin, so the two can drift), which is ISS-145, a medium.

**Three new mediums, one of which is mine and undisclosed: ISS-144.** The commit silently
re-encoded **46 unrelated ledger rows** to backslash-u escapes — semantically null, but it repoints
`git blame` on 46 audit rows at this commit rather than at the checks that filed them. That is the
same provenance harm this unit exists to repair, committed by the unit repairing it. Cause: my
rewrite used Python's `json.dumps` default `ensure_ascii=True`. Fixed in the next unit.

**One open decision for the Approver.** The checker **declined** to author
`qa/contracts/audit-trail-integrity.md` even though this manifest delegated it, on the ground that
initial contract creation is always human-approved and the maker is not the human — in a repo
measured at 26k lines of governance prose against 10k of source, a self-authorised contract is
exactly what the D-013 override exists to stop. It recommended a four-criterion version to Umesh in
the verdict instead. I think it was right to refuse.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
