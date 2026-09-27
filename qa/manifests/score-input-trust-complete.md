# Manifest — score-input-trust-complete

**Contract:** qa/contracts/catalogue-progress-score.md — **I12 and I13** (added by the previous
checker, effective this cycle), plus no regression on I1–I11.
**Goal task:** plan §10 U0.5 (follow-up 3)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-041 (high), ISS-038 (reopened), ISS-042, ISS-043 (medium)

## Why — two things I got wrong, stated plainly

**1. My "test" for the `--check` gate was worthless, and the checker proved it in one token.**
I asserted the CLI's *source text* matched `/process\.exit\(2\)/` and argued a real end-to-end test
would need a fixture repo. Both were wrong. The regex matched **other** exits already in the file,
so flipping the gate's own `exit(2)` → `exit(0)` left **19/19 and 33/33 green** while `--check` and
`lint:structure` passed at a **39.5%** headline. And no fixture repo is needed — **this repo is the
fixture**: tamper the real file, spawn the CLI, assert the status, restore in a `finally`. The
checker's judgement was correct and my cost argument was an excuse.

**2. There was a sixth layer, and it was the largest of all (+42.1 points).**
`.goal/catalogue.json` — all 57 probes *and* every human downgrade — was a score-raising input with
**no trust check of any kind**, not even the path check the evidence file used to have. Repointing
the 19 probe-less rows at a populated collection and nulling the 11 downgrades moved the headline
**20.2% → 62.3%** with every gate green. Neither existing guard could see it:
- the probe fingerprint (I5) is **printed into the document the same run regenerates** —
  reviewability with no reviewer;
- the one-directional guard (I2) has nothing to object to, because **deleting a downgrade is not
  an upgrade**.

The pattern, now six deep: **verdicts → numerator → denominator → inputs → the trust check on the
inputs → the other input nobody had checked.**

## What changed

1. **Every score-raising input is trusted, not just the evidence (ISS-041).** `SCORE_INPUTS`
   applies the same content-vs-HEAD `trustOf()` to `.goal/catalogue.json`; `--check` refuses any
   untrusted input and names each one, and write mode prints the warning into the doc.
2. **The gate is pinned by BEHAVIOUR, not by source text (ISS-038, I12).** Three spawn-based tests
   run the real CLI against this repo: `--check` must exit **2** with tampered evidence, exit
   **0** when clean, and write mode must emit the *EDITED SINCE COMMIT* banner. Each tampering is
   undone in a `finally`, so the suite cannot leave the repo dirty.
3. **Trust is pinned to HEAD, including the staged case (ISS-042).** A test stages a tampered file
   with `git add` and asserts it still reads `modified` — if the `HEAD` argument were ever dropped,
   `git diff --quiet -- <path>` would compare against the *index* and a bare `git add` would launder
   the tampering.
4. **`--check` compares line-ending-insensitively (ISS-043).** Under `core.autocrlf=true` the
   committed doc materialises with CRLF while generation emits LF, which sent `--check` STALE on an
   untouched clone. A staleness gate that cries wolf on a fresh checkout gets ignored, and then
   catches nothing.

## Real evidence

### The checker's +42.1-point attack (ISS-041), re-run
```
$ python - <<'…'   # repoint 19 probe-less rows at `claims`; null all 11 downgrades; do not commit
$ node scripts/catalogue-score.mjs
wrote docs/PROGRESS.md — 62.3% adjusted / 62.3% machine-derived     # write mode computes it…
> **EDITED SINCE COMMIT — `.goal/catalogue.json` no longer matches the version in git,
>   so this score is not the one the repository supports**                    # …and says so

$ node scripts/catalogue-score.mjs --check
REFUSED: .goal/catalogue.json is not what the repository holds (modified).
exit=2
```

### Mutation tests — including the exact mutation that defeated the old assertion
```
the gate's own exit(2) -> exit(0)   (this previously left 19/19 GREEN)   -> RED, caught
drop HEAD from the trust diff       (staged tampering would read clean)  -> RED, caught
drop .goal/catalogue.json from SCORE_INPUTS                              -> RED, caught
```
Plus the five guards from the previous unit, all still RED when neutered.

### Suite, lint, LOC, score — all re-derived
```
$ node --test scripts/catalogue.test.mjs   → 23/23   (was 19)
$ pnpm test:lint                           → 37 pass, 0 fail   (was 33)
$ pnpm lint:structure                      → exit 0
countLoc: catalogue-score 158 · lib/catalogue 194 · lib/evidence 115 · catalogue.test 278  (/300)
score: 20.2% adjusted / 28.9% machine-derived — unchanged, no verdict row moved
```

### The suite does not dirty the repo
After the full run: `git diff` reports no content change to the evidence file or the catalogue
(the `M` flags in `git status` are index-stat noise; `git update-index --refresh` clears them and
`trustOf` reports `committed` for both). `--check` is exit 0.

## Disclosed limitations

- **Committed fabricated inputs still defeat this**, for both the evidence and the catalogue. That
  is the real ceiling: a scorer cannot distinguish a well-formed lie from the truth. The cost is
  now a genuine commit, to a reviewed history, with a changed content fingerprint — and this time
  the claim is accurate for *both* inputs, which is exactly what the previous manifest got wrong.
- **`scripts/catalogue.test.mjs` is at 278/300.** The next addition must extract, not append.
- **The spawn tests run the real CLI against the real repo**, so they are slower than the pure unit
  tests and they briefly write to two tracked files. Restoration is in a `finally` and verified
  above, but a hard kill (SIGKILL) mid-test would leave a tampered file behind — recoverable with
  `git checkout --`, and worth knowing.
- `SCORE_INPUTS` is a hand-maintained list of one. If a future input starts feeding the score
  (a config file, a second catalogue), it must be added there or it inherits the ISS-041 hole. No
  gate catches that omission — the same class of gap as an under-specified probe.

## How to verify (for the checker)
1. **Re-run your ISS-041 attack** (repoint probe-less rows + null the downgrades, uncommitted):
   write mode must print the banner naming `.goal/catalogue.json`; `--check` must exit 2.
2. **Re-run your ISS-038 disproof**: change the gate's `exit(2)` to `exit(0)` and confirm a test now
   goes RED. That is the specific mutation that previously survived.
3. **ISS-042**: `git add` a tampered evidence file in a throwaway repo → `trustOf` must still say
   `modified`. Then drop `HEAD` from the diff call and confirm a test fails.
4. **ISS-043**: force the CRLF materialisation (`rm` + `git checkout --`) and confirm `--check`
   stays exit 0 rather than going STALE.
5. Mutation-test the guards, including at least one I did not list.
6. No regression on I1–I11; re-verify ≥3 verdicts against reality; score still 20.2%/28.9%.
7. `pnpm test:lint` (37), `pnpm lint:structure` exit 0, all four files ≤300 non-blank LOC.
8. **Confirm the suite leaves the repo clean** — run it, then `git diff` the evidence file and the
   catalogue. A test suite that dirties what it measures would be its own finding.
9. **Seventh layer?** Six have held. In particular, judge my `SCORE_INPUTS` limitation above: is a
   hand-maintained list an acceptable answer, or is that the next hole?

## Status: superseded-by derived-input-trust

Checker cycle 1 (`qa/verdicts/score-input-trust-complete.md`): **FAIL** — ISS-047, the seventh
layer: the route/page/package scrapers read source with no trust check, so uncommitted source edits
moved the headline +10.5 points with every gate green, and a hand-maintained `SCORE_INPUTS` list
was ruled unacceptable because "which files did this program read" is a fact the program knows.
Fixed in the next unit, `derived-input-trust` (which derives the input set from a recording
reader), rather than in a fix cycle here — so this manifest is superseded, not stalled. Its own
contributions (behaviour-pinned gates, trust for `.goal/catalogue.json`, the staged-file and CRLF
fixes) shipped and were re-verified as holding through cycle 2 of the successor unit.

**Handshake status:** superseded — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
