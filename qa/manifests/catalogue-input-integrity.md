# Manifest — catalogue-input-integrity

**Contract:** qa/contracts/catalogue-progress-score.md — specifically **I9 and I10**, which the
cycle-2 checker added and marked "effective from cycle 3". This unit is that cycle.
**Goal task:** plan §10 U0.5 (follow-up)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-034 (medium), ISS-035 (medium)

## Why

The progress scorer PASSed cycle 2, and in the same breath the checker found **two larger
inflation levers than anything in cycle 1** — both the same shape as ISS-029: *the verdicts and
the numerator were guarded; the inputs were not.*

- **ISS-035 (+19.3 points — the largest found in either cycle).** `loadCollectionCounts` picked
  the **lexically last** `qa/evidence/live-*` folder, which made the folder **name** the input.
  One folder called `live-2026-12-31-…` whose `preflight.json` replaced every zero count with 4242
  moved the headline **20.2% → 39.5%** with `--check`, `lint:structure` and all 10 tests green and
  the probe fingerprint unchanged.
- **ISS-034 (+8.3 points).** Rewriting `POINTS` inflated the headline with every test passing, and
  the generated doc **kept asserting `STUB/MISSING=0` while actually scoring STUB at 0.5** —
  because that line was a hardcoded string rather than rendered from `POINTS`. A generated document
  that misstates its own scale is worse than no document.

Leaving a known 19-point hole open in the instrument whose entire purpose is being un-inflatable
would be precisely the failure this project keeps catching, so these were fixed immediately rather
than queued.

## What changed

1. **`scripts/lib/catalogue.mjs` — evidence selection is by content, not by name.**
   `loadCollectionCounts` now parses every candidate `preflight.json` and selects on the **`stamp`
   inside the file**, never the directory name. It additionally returns the file's content `hash`
   and its **git-tracked status**.
2. **Future-dated evidence is refused outright** (exit 2), not merely flagged — a run dated ahead
   of now is either fabricated or a broken clock, and neither should quietly set the headline.
3. **`docs/PROGRESS.md` now names its evidence precisely** — path, internal run stamp, content sha,
   and a loud `**UNCOMMITTED — this evidence is not in git, so nobody else can reproduce this
   score**` banner when applicable.
4. **`--check` refuses uncommitted evidence entirely** (exit 2). This is the gate inside
   `pnpm lint:structure`, so it holds the stricter line: *a score computed from evidence nobody
   else has is not a shared fact.* Write mode still permits it (with the banner) so local iteration
   is not blocked — the strictness lands where trust is placed.
5. **`scaleDescription()` renders the scale from `POINTS`**, so the doc can no longer disagree with
   the arithmetic it describes.
6. **5 new tests** (15 total in this file, 29 across `pnpm test:lint`): scale pinned to POINTS;
   scale line rendered not restated; evidence chosen by internal stamp even when the lexically-last
   folder is the older run; future-dated evidence refused; evidence fingerprint changes when the
   file's content changes.

## Real evidence — the checker's own attacks, re-run

**ISS-035, the exact attack (future-dated folder, counts 0 → 4242):**
```
$ node scripts/catalogue-score.mjs
REFUSED: evidence run "qa/evidence/live-2026-12-31-23-59-59" is dated in the future
         (2026-12-31T23:59:59.000Z) — refusing to score from it
exit=2                                    # was: 20.2% -> 39.5%, exit 0, all gates green
```

**The harder variant I then tried myself — a *plausibly*-dated fabrication (stamp = 5 minutes ago),
which no timestamp check can catch.** Reported honestly rather than claimed closed:
```
$ node scripts/catalogue-score.mjs
wrote docs/PROGRESS.md — 39.5% adjusted / 50% machine-derived     # write mode: still inflates
# …but the generated doc now says, unmissably:
Collection counts from `qa/evidence/live-2026-09-07-02-30-00/preflight.json`
(run 2026-09-07T03:11:34Z, sha `359ab6498bf4`,
 **UNCOMMITTED — this evidence is not in git, so nobody else can reproduce this score**)

$ node scripts/catalogue-score.mjs --check          # the gate in lint:structure
REFUSED: scored from UNCOMMITTED evidence qa/evidence/live-2026-09-07-02-30-00/preflight.json
         — commit it, or re-run `pnpm verify:live` and commit that, so the score is
         reproducible by someone else.
exit=2
```
So: fabrication can no longer pass the gate, and cannot happen invisibly in write mode. It is
**not** claimed to be impossible — someone who commits fabricated evidence defeats this, and no
scorer can tell a well-formed lie from the truth. What it now costs is a visible commit with a
changed sha, which is the honest ceiling.

**Restoration verified** after every attack: `catalogue.json` and `docs/PROGRESS.md` byte-identical,
`--check` back to `OK: docs/PROGRESS.md is current (20.2% of 57 features)`.

**The score did not move: still 20.2% / 28.9%.** Hardening the inputs changed no verdict, which is
the outcome to want — if a security fix had moved the headline, one of the two would be wrong.

### Tests + lint
```
$ node --test scripts/catalogue.test.mjs   → 15/15 pass (was 10)
$ pnpm test:lint                           → 29 pass, 0 fail (was 24)
$ pnpm lint:structure                      → exit 0, all OK
LOC (countLoc): catalogue-score 129 · lib/catalogue 248 · catalogue.test 146   (budget 300)
```

## Disclosed limitations

- **Committed fabricated evidence still defeats this**, as above. Mitigation is review, not code.
- **`lib/catalogue.mjs` is now 248/300 LOC.** The next addition should extract, not append — the
  same note the checker made about `live-verify.mjs` at 292/300.
- **`--check` now requires committed evidence**, which is a real workflow change: after
  `pnpm verify:live` you must commit the evidence before `lint:structure` will pass. Deliberate,
  and the refusal message says exactly what to do.
- The git-tracked probe shells out to `git ls-files`; in a non-git checkout it returns false, so
  `--check` would refuse. Acceptable — this repo is always a git repo, and the Lab Protocol
  requires it.

## How to verify (for the checker)
1. Re-run **your own ISS-035 attack** (future-dated `live-*` folder with inflated counts) → expect
   exit 2 and a refusal naming the folder, in both write and `--check` mode.
2. Then try the **plausibly-dated** variant (stamp a few minutes in the past, uncommitted): write
   mode must still produce the score **but** with the UNCOMMITTED banner; `--check` must exit 2.
   Confirm I am not overclaiming here — the manifest says this is not fully preventable.
3. Try **selection by folder name**: create two evidence folders where the lexically-last one has
   the *older* internal stamp; confirm the newer-stamped one is chosen.
4. **ISS-034:** rewrite `POINTS` in `scripts/lib/catalogue.mjs` → a test must fail, AND the scale
   line in a regenerated `docs/PROGRESS.md` must change to match. Restore.
5. Mutation-test the new guards as you did last cycle: neuter the future-date refusal, the
   stamp-based selection, and the `--check` tracked-evidence refusal one at a time; each must turn
   a test red or a documented behaviour false.
6. `pnpm test:lint` (29) and `pnpm lint:structure` → exit 0; all three files ≤ 300 non-blank LOC.
7. Confirm the score is still **20.2% / 28.9%** and that no verdict changed as a result of this
   unit.
8. Look once more for a remaining inflation lever — the pattern across three cycles has been that
   each fix reveals the next layer (verdicts → numerator → denominator → inputs).

## Status: checked-PASS (see qa/verdicts/catalogue-input-integrity.md, Cycle checked: 1)

Closed out late: I read the PASS and chained straight into fixing the two issues it filed
(ISS-037, the `git ls-files` path-vs-content hole) without flipping this manifest, so it sat at
`ready-for-check` while three more units shipped. The maker-checker cycle's step 0 is *reconcile
disk state before starting new work* — a PASS is not closed until the manifest says so, and I
skipped that four times running. Caught by the pre-commit guard, not by me.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
