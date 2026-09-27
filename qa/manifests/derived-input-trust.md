# Manifest — derived-input-trust

**Contract:** qa/contracts/catalogue-progress-score.md — **I14** (added by the previous checker,
effective this cycle) plus no regression on I1–I13.
**Goal task:** plan §10 U0.5 (follow-up 4 — and, I propose, the last on this instrument; see
"Proportionality" below)
**Date:** 2026-09-07
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** ISS-047 (high), ISS-044, ISS-045, ISS-046 (medium), plus an eighth-layer
blind spot found while a checker was down (gitignored scraped files — see below)

## Fix cycle 2 (2026-09-07)

Cycle-1 verdict (`qa/verdicts/derived-input-trust.md`, commit `ce15a02`): **FAIL** on one thing —
**I14's own test clause was never implemented**, so the derived-input mechanism was unpinned. The
proof was damning: changing `reachablePackages(root, reader.read)` back to
`reachablePackages(root)` — an entirely plausible refactor — **survived all 44 tests and
`lint:structure`** while dropping the bulk of the scraped files out of the trust check, silently
reopening ISS-047 for everything under `packages/`.

**Fixed:** `generate()` now exposes `scrapedFiles`, and a test asserts each scraper's territory is
represented plus a floor on the total. The checker's exact mutation is now **RED**.

**Two corrections to my own cycle-1 account, both from the checker:**

- **ISS-049 — my exploitability claim was ~90% right, not right.** I said the gitignore blind spot
  was "not convertible into points". The *adjusted* headline indeed does not move — the checker
  attacked it and could not falsify that — but the **machine-derived** headline moved **+0.9
  (28.9 → 29.8%)** silently via A10 package reachability, whose auto verdict the manual STUB does
  not cap. Already closed by this unit's `ls-files` fix; recorded because my characterisation was
  wrong, not merely incomplete.
- **My "472 scraped files" was wrong; the real number is 228.** My own new test caught it — I set
  the threshold at `>300` from that remembered figure and it failed immediately. That is the
  **fourth** hand-carried number I have mis-stated on this instrument (after the `jobs` constant,
  the LOC figures, and "13 probe-less features"). The threshold is now set from a measurement, and
  the measurement is in the test's comment.

**A mutation that SURVIVES and should:** dropping the recorder from `scrapeRoutes` or `scrapePages`
leaves the suite green — and I verified that is *correct*, not a gap. `reachablePackages` walks
`apps/` and re-reads those same files with recording, so the count stays 228, `App.tsx` stays
recorded, and tampering it still exits 2. Only the package scraper owns exclusive territory. I
checked rather than assuming in either direction.

**ISS-050 left open deliberately.** `git status` and `git diff --quiet HEAD --` can disagree on a
CRLF-materialised file, so the two trust instruments could answer differently. The checker ruled it
FILE-don't-FIX (it cannot inflate anything), and since I proposed that rule I am respecting it
rather than reaching for one more fix. Noting my one reservation for whoever picks it up: if it
ever fires on a *scraped* file it would be a false refusal on a fresh clone, which is the same
"cries wolf" failure mode as ISS-043 — worth a few lines then, not now.

## Why

The checker answered both questions I put to it, and was right on both:

1. **A hand-maintained `SCORE_INPUTS` list is not acceptable** — *"which files did this program
   read" is a fact the program already knows*. And it was not a future risk: it was already wrong
   by three surfaces.
2. **There is a seventh layer.** `scrapeRoutes`, `scrapePages` and `reachablePackages` read source
   code as text with **no trust check**. One untracked route file plus a few `<Route path=…>` lines
   — nothing committed — bought **+10.5 points** with every gate green and no banner. That is
   *cheaper* than the ceiling my last manifest claimed ("the cost is now a genuine commit"), so
   that claim was wrong again. And it is worse than an attack: it is a **live hazard** — anyone on
   a feature branch running `pnpm progress` would commit a score measuring their working tree
   instead of the repository.

## What changed

1. **The input set is DERIVED, not declared (ISS-047).** `createRecordingReader` wraps the file
   reads; the three scrapers take it as an injected `read`, so whatever they actually touch is
   recorded. Every recorded path is trust-checked. Only `.goal/catalogue.json` remains named
   explicitly, because it is parsed rather than scraped.
2. **`untrustedAmong()` answers for hundreds of paths in ONE `git status --porcelain
   --untracked-files=all` call** — covering modified, staged and untracked together. Per-path
   `git diff` would have been hundreds of processes; this run trust-checks **228 scraped files** in
   one (22 route files, 43 under apps/web, 21 other apps/api, 142 under packages/).
3. **ISS-044** — the manual-upgrade refusal now has a behavioural test (`if (score.upgrades.length
   > 0)` → `if (false)` is caught).
4. **ISS-045** — the `lf()` normalisation shipped last cycle is now pinned: a test writes the doc
   with CRLF and requires `--check` to stay exit 0.
5. **ISS-046** — the doc restore moved *inside* the `finally`, and a final test asserts the suite
   leaves every tracked input byte-clean.
6. **Extracted `scripts/catalogue-cli.test.mjs`** rather than appending: `catalogue.test.mjs` was
   at 278/300 and had been warned. The split is also the right seam — unit tests for pure scoring
   functions there, real-CLI exit statuses here.

## Real evidence

### The checker's ISS-047 attack, re-run
```
$ cat > apps/api/src/routes/smuggled.ts   # untracked, adds GET /topics + GET /speakers
$ …add 5 uncommitted <Route path=…> lines to apps/web/src/App.tsx…

$ node scripts/catalogue-score.mjs
wrote docs/PROGRESS.md — 28.9% adjusted / 37.7% machine-derived      # write mode computes it…
                                                                     # …with 2 banners in the doc
$ node scripts/catalogue-score.mjs --check
REFUSED: apps/web/src/App.tsx is not what the repository holds (modified).
REFUSED: apps/api/src/routes/smuggled.ts is not what the repository holds (untracked).
exit=2
```
Both the modified file and the untracked file are named. Before this unit: exit 0, no banner.

### Mutation tests — 5/5 caught
```
upgrade refusal -> if(false)                    [ISS-044]  -> RED
delete the lf() normalisation                   [ISS-045]  -> RED
stop trust-checking scraped source               [ISS-047]  -> RED
the recorder stops recording                     [ISS-047]  -> RED
the gate's own exit(2) -> exit(0)      [ISS-038 regression] -> RED
```
**A methodology note worth recording:** my first attempt at the recorder mutation reported GREEN.
It had not applied — the Python escaping never matched the target line. **A mutation that fails to
apply is indistinguishable from a surviving mutant**, so I re-ran it with `perl`, confirmed the
edit landed via `git diff --stat`, and only then read the result (RED). Any mutation test that
reports "survived" without proof the edit applied is not evidence.

### Suite, lint, LOC, score
```
$ pnpm test:lint          → 45 pass, 0 fail   (19 unit + 12 CLI + prior suites)
$ pnpm lint:structure     → exit 0
countLoc: catalogue-score 172 · lib/catalogue 213 · lib/evidence 160 ·
          catalogue.test 209 · catalogue-cli.test 168          (budget 300)
score: 20.2% / 28.9% — unchanged, no verdict row moved
inputs byte-clean after the full suite (`git diff --quiet HEAD --` on catalogue + App.tsx + evidence)
```

## Eighth layer, found by chasing a dying checker's last words

Two consecutive checker dispatches died on network errors (ENOTFOUND, then ECONNRESET). The second
got far enough to report: *"M1–M5 reproduced RED. My extra mutation **survived** — measuring
whether it is exploitable."* — and then died before saying which. Rather than wait, I hunted it.

**`git status` deliberately says nothing about IGNORED files.** So a scraped source file listed in
`.gitignore` was read by the scrapers and then vanished from the trust check — and `.gitignore` is
not itself a scraped input, so adding a line to it was free. Verified: a gitignored
`apps/api/src/routes/ghost.ts` is scraped while
`git status --porcelain --untracked-files=all -- <path>` reports **zero** lines for it, and
`--check` exited **0**.

**Honest measurement, which is what the checker was doing when it died: I could not convert it
into points today.** The routes such a file can reach (`/search`, `/citations/:claimId`) are in the
501 stub list, and the stub check wins over liveness; `scrapePages` reads only the single tracked
`App.tsx`; and the one package-reachability gain (A10) is manually downgraded to STUB anyway. So it
is a **blind spot, not a live inflation path**.

I fixed it regardless, because "not exploitable" rests entirely on which probes happen to exist
today, and probes change — that is a luck-dependent defense, not a defense. **Fix:** membership in
`git ls-files` is now required, in the same batch call; a path git does not track is untrusted
whatever `status` says.
```
$ echo "apps/api/src/routes/ghost.ts" >> .gitignore && cat > apps/api/src/routes/ghost.ts
$ git status --porcelain --untracked-files=all -- apps/api/src/routes/ghost.ts   → 0 lines
$ node scripts/catalogue-score.mjs --check
REFUSED: apps/api/src/routes/ghost.ts is not what the repository holds (untracked).   exit=2
```
Pinned by a test, and the mutation (drop the `ls-files` membership check) is caught — **verified by
counting occurrences before/after (1 → 0), not by `git diff`**, because `lib/evidence.mjs` is a new
untracked file and `git diff` reports nothing for it. That is the same "prove the edit applied"
lesson, hitting a second, different way.

## Proportionality — a judgement call I want checked, not just noted

This is the **seventh** consecutive hardening cycle on a *measurement tool*, on a project whose
actual product is 20.2% built. The chain has been real every time and I do not regret following
it, but the value of layer N+1 is falling: the remaining paths all require committing a fabricated
input to a reviewed history, which is a social control rather than a technical one.

**My proposal: if this cycle passes, stop hardening the scorer and move to plan §10 U0.6 onward
(tracker honesty, then `/health` + `/search`, the db accessors, and the honest eval baseline).**
Any further inflation path found from here should be filed as an issue and left open with its
point value recorded, not fixed immediately — unless it is exploitable *without* a commit, which
is the line that separates "attack" from "hazard". I would rather be told I am wrong about this
than quietly keep polishing the instrument.

## Disclosed limitations

- **Committed fabricated inputs still defeat this**, for evidence, catalogue and source alike. This
  time I have stopped claiming a cost I have not verified: the honest statement is that every
  remaining path requires a real commit, and I have not attempted to prove that no cheaper path
  exists — the checker has found one in each of the last three cycles.
- `untrustedAmong` parses `git status --porcelain`; the rename form (`R old -> new`) is handled by
  taking the destination, but exotic quoting of non-ASCII paths is not exercised by any test.
- The trust check covers files the scrapers *read*. A signal derived from something other than a
  file read (an env var, a network call) would inherit the same hole — none exists today.

## How to verify (for the checker)
1. **Re-run your ISS-047 attack**: an untracked route file and uncommitted `App.tsx` edits. Both
   must be named by `--check` (exit 2) and appear as banners in write mode.
2. **Try a variant I did not**: modify a file under `packages/` that only `reachablePackages` reads
   (not routes or pages) and confirm it is still caught — that path is the least exercised.
3. Mutation-test all five guards, **proving each edit applied** before reading the result.
4. **ISS-046**: make a test throw mid-tamper and confirm the repo is still restored.
5. **ISS-045**: force the CRLF materialisation and confirm `--check` stays exit 0; delete `lf()`
   and confirm a test reddens.
6. No regression on I1–I13; ≥3 verdicts re-verified; score still 20.2%/28.9%.
7. `pnpm test:lint` (45), `pnpm lint:structure` exit 0, all five files ≤300 non-blank LOC.
7b. **Re-run the gitignore blind-spot attack** and confirm exit 2; then judge my reasoning that it
    was not convertible into points today — I may have missed a payload that works.
8. **Answer the proportionality question directly.** Is stopping here right, or is there a
   remaining path cheap enough (exploitable without a commit) that it must be fixed before moving
   on? A reasoned "stop" is as useful to me as another finding.

## Status: checked-PASS (see qa/verdicts/derived-input-trust.md, Cycle checked: 2, commit 67217d9)

Checker cycle 2: **PASS, 14/14 invariants.** ISS-048 verified closed — its own mutation, re-applied
with occurrence-count proof, is now RED (30/31) where the identical edit was green at 44/44 last
cycle. It also *behaviourally* confirmed the "these two survive and that's correct" analysis rather
than accepting the reasoning: with the recorder dropped from `scrapeRoutes` and `scrapePages` in
turn, a modified `ask.ts`, a modified `App.tsx` and an untracked `smuggled.ts` are each still
refused at exit 2. Numbers confirmed exactly (228 = 22 + 43 + 21 + 142, no dupes). ISS-050 confirmed
**structurally unable to fire today** — `trustOf` and `untrustedAmong` cover disjoint path sets — so
my reservation was right as a future condition and wrong as a present one.

**ISS-052 — the fifth hand-carried number I have got wrong here.** The LOC block was stale by
exactly the size of the ISS-048 fix (`catalogue-score` 173 not 172, `catalogue-cli.test` **194** not
168, 45 tests not 44): I wrote the block, then changed the code, and did not re-derive. Now
re-derived with the project's own `countLoc`. The through-line across all five — the `jobs`
constant, the LOC figures, "13 probe-less features", "472 scraped files", and this — is identical:
**every number I typed from memory was wrong, and every number the machine computed was right.**

**ISS-051 filed, deliberately NOT fixed.** Two mutations still survive (filtering `packages/` out of
the trust call; narrowing `reachablePackages` to `apps/api` only, which stays above the floor).
Both require editing the scorer's own source, which no self-check reaches, and both carry a measured
payload of **zero** on the adjusted headline. The shipped test is a territory+floor proxy for I14's
literal subset clause — recorded so nobody later reads "the test exists" as "the clause is fully
implemented".

**Lever decay across the chain: 42.1 → 19.3 → 10.5 → 0.9 → 0.0 points.** This is the first cycle in
which the checker found no payload moving either published number without a commit. Its
recommendation, restated: **stop hardening the scorer**, do not open a thread on ISS-051, and go to
plan §10 U0.6.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
