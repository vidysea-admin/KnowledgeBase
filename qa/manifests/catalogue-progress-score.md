# Manifest — catalogue-progress-score

**Contract:** qa/contracts/catalogue-progress-score.md — **NEW this cycle.** The cycle-1 checker
correctly observed that this unit was being checked against `snapshot-features-ledger.md`, a
contract about a different artifact, so no document stated this unit's own acceptance criteria and
each checker had to re-derive the honesty rules from the code. The new contract states them as
invariants I1–I8. Drafted by the maker per this directory's convention; the checker adopts or
amends.
**Goal task:** plan §10 U0.5
**Date:** 2026-09-07
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** ISS-029 (high), ISS-030 (high), ISS-031, ISS-032 (medium), ISS-033 (low)

## Fix cycle 2 (2026-09-07)

Cycle-1 verdict (`qa/verdicts/catalogue-progress-score.md`, commit `b5596e6`): **FAIL**. The
checker confirmed the instrument was sound — 7/7 spot-checked verdicts correct against source and
live Mongo, byte-deterministic, fully re-derivable from a deleted file, staleness gate genuinely in
`lint:structure`, and the advertised guard really does exit 2 and refuse to write — then found an
inflation path that **beats the guard outright**. All five issues fixed:

- **ISS-029 (high) — denominator inflation, the real hole.** I guarded the *numerator* (manual
  upgrades) and left the *denominator* wide open: deleting the 19 probe-less rows moved the score
  **20.2% → 30.3%** with `--check` and `lint:structure` both still green. Dropping inconvenient
  features is the cheapest way to flatter a percentage and I had not defended it at all.
  **Fixed:** `CATALOGUE_SPEC` pins the id set to plan §4c (A×13 B×13 C×14 D×8 E×7 F×2 = 57) and
  `assertDenominator()` refuses a dropped, added, renamed or duplicated id. Re-running the
  checker's exact attack now gives exit 2 and names all 19 dropped rows.
- **ISS-030 (high) — the guards had no tests.** Every guard was proven by hand once and then left
  uncovered, so a refactor could have silently deleted them. **Fixed:** `scripts/catalogue.test.mjs`
  (10 tests, each an *attack* rather than a happy path), registered in `pnpm test:lint`.
- **ISS-031 (medium) — the vocabulary bypass.** A `manual.verdict` of e.g. `"EXCELLENT"` made
  `ORDER[m]` undefined, and `undefined > n` is false, so the upgrade branch was skipped and the
  bogus verdict was written out **labelled "lowered", exit 0**. **Fixed:** the vocabulary is
  validated before the ordering comparison; an unknown value is refused.
- **ISS-032 (medium) — probe weakening.** Disclosed but ungated. **Fixed as far as it honestly can
  be:** `docs/PROGRESS.md` now carries a fingerprint of every probe + manual verdict, so an edit
  shows up as a one-line diff in a committed file. This is *reviewability, not prevention*, and the
  contract says so rather than overclaiming.
- **ISS-033 (low) — "13 features declare no probe" was wrong; the real count is 19**, and my own
  list enumerated 17. **Fixed by deriving it**: the count and the full id list are now computed and
  printed into `docs/PROGRESS.md`. Third hand-typed number I have got wrong in this session (after
  the `jobs` constant and the LOC figures) — the lesson is now applied by construction, not by
  resolve.

### Attack re-run after the fix (the checker's exact attack)
```
$ python -c "...drop every probe-less feature..."   # 57 -> 38 features
$ node scripts/catalogue-score.mjs
REFUSED: catalogue denominator drifted from plan §4c (57 features expected):
  dropped feature(s): A12, B12, C5, C6, C7, C10, C11, C12, C13, C14, D2, D4, D5, D6, E4, E5, E7, F1, F2
exit=2
$ (restored) node scripts/catalogue-score.mjs --check
OK: docs/PROGRESS.md is current (20.2% of 57 features)      # catalogue.json byte-identical
```

### Tests + lint after the fix
```
$ node --test scripts/catalogue.test.mjs      → 10/10 pass
$ pnpm test:lint                              → 24 pass, 0 fail  (was 14)
$ pnpm lint:structure                         → exit 0, all checks OK
LOC (countLoc): catalogue-score 120 · lib/catalogue 200 · catalogue.test 87   (budget 300)
```

### Also carried forward from the checker's non-blocking notes
- The **pre-existing** malformed line in `qa/issues.jsonl` (ISS-017, an invalid `\s` escape) is
  untouched — it is not this unit's defect, it is append-only history, and it is already tracked as
  ISS-020 for a Mode B sweep.

## Why

`.goal/goal.json` reported **79%**. That number counts 29 *foundation* tasks, not the 57-feature
product catalogue — so it answered a far easier question than the one everyone was reading it as,
and it did not even cover all of its own tracker (5 `TASKS.md` rows are absent from it). Umesh
asked for what is actually done vs remaining; this unit makes that answerable by a command instead
of by my judgement.

## What changed

1. **`.goal/catalogue.json`** (new) — one row per feature in plan §4c (57 rows: A×13, B×13, C×14,
   D×8, E×7, F×2). Hand-authored fields are only `probes` (what would *prove* the feature real) and
   `manual` (a downgrade **with a reason**). Verdicts themselves are never hand-written.
2. **`scripts/lib/catalogue.mjs`** (new, 200 LOC) — four machine signals, all read off the real
   repo/deployment:
   - **routes** — scraped from `apps/api/src/routes/*`, with `stubs.ts`'s `STUB_ROUTES` table
     subtracted so a deliberate 501 scores STUB, not REAL
   - **collections** — real `countDocuments` reused from the newest `qa/evidence/live-<stamp>/preflight.json`
     (so the score is tied to live-verify evidence, and the scorer needs no Mongo connection)
   - **pages** — scraped from `apps/web/src/App.tsx`'s `Route path=` entries
   - **packages** — reachability: `@lkb/<name>` imported by anything *outside* its own package.
     Dead code is not a feature.
3. **`scripts/catalogue-score.mjs`** (new, 120 LOC) — generates `docs/PROGRESS.md`; `--check` fails
   if the committed file is stale, exactly like `scripts/snapshot.mjs`.
4. **`package.json`** — `pnpm progress`, and `catalogue-score --check` added to `lint:structure`.
5. **`docs/PROGRESS.md`** (generated, 103 lines).

### The honesty rule, enforced in code
A `manual` entry may only **lower** a derived verdict. An attempted upgrade **exits 2 and refuses
to write** — otherwise the score quietly becomes self-assessment again, which is the exact disease
this instrument exists to cure. `docs/PROGRESS.md` prints the machine-derived score **and** the
human-adjusted score side by side, so how much rests on judgement is always visible.

## Real evidence

### The honesty rule caught ME, on the first run
I had written `manual: PARTIAL` for **B3** (speaker identity) and **E1** (multi-tenant hosting).
Both are collection-probed, both collections are empty, so the derived verdict was MISSING — and
the scorer refused:
```
REFUSED: .goal/catalogue.json tries to UPGRADE a derived verdict:
  B3: manual "PARTIAL" > auto "MISSING"
  E1: manual "PARTIAL" > auto "MISSING"
A manual entry may only lower a verdict — otherwise the score is self-assessment.
```
It was right and I was wrong: WhatsApp `speakerLabel` is an *input* to B3, not B3; and `tenantId`
plumbing is groundwork, not multi-tenant hosting. Both are now scored **MISSING** with the
reasoning kept as a non-verdict-changing `note`. This is the single best piece of evidence that the
guard works, so it is recorded rather than tidied away.

### Result
```
$ pnpm progress
wrote docs/PROGRESS.md — 20.2% adjusted / 28.9% machine-derived, 57 features
```
Machine-derived (28.9%) is *higher* than adjusted (20.2%) — the only permitted direction.

| group | score | REAL | PARTIAL | STUB | MISSING |
|---|---|---|---|---|---|
| A. LEARN | 30.8% | 2 | 4 | 1 | 6 |
| B. REMEMBER | 34.6% | 4 | 1 | 0 | 8 |
| C. REASON | **3.6%** | 0 | 1 | 3 | 10 |
| D. IMPROVE | 18.8% | 0 | 3 | 0 | 5 |
| E. PLATFORM | 14.3% | 0 | 2 | 0 | 5 |
| F. OPERATIONS | 0% | 0 | 0 | 0 | 2 |

### Spot-check that the probes are real, not plausible-looking
```
| A8  | WhatsApp Connector   | REAL                        | route GET /whatsapp/groups; route POST /whatsapp/ingest; page /whatsapp |
| A10 | Meeting Bot          | STUB (auto: PARTIAL, lowered)| page /meeting-bot            |   <- dead-code detector fired
| B4  | Claim extraction     | REAL                        | collection claims (81 docs)   |
| B6  | Vector index         | MISSING                     | collection chunks (empty)     |
| C2  | Ask AI UI            | MISSING                     | page /ask (absent)            |   <- the no-Ask-UI finding
| C8  | Universal Search     | STUB                        | route GET /search (501 stub)  |
| E3  | Developer API        | PARTIAL                     | 3 of 6 probed routes live     |
```

### Staleness gate really fails (not a trivially-passing check)
```
$ echo "tampered" >> docs/PROGRESS.md && node scripts/catalogue-score.mjs --check
STALE: docs/PROGRESS.md differs from a fresh regeneration.  → exit 1
$ (restored) node scripts/catalogue-score.mjs --check
OK: docs/PROGRESS.md is current (20.2% of 57 features)      → exit 0
```

### Lint / structure
```
$ pnpm lint:structure
lint-loc: OK (211 file(s) within budget)     # catalogue-score 106 LOC, lib/catalogue 151 LOC
lint-dirsize / lint-root / lint-dupes / lint-migrations: OK
OK: docs/SNAPSHOT.md matches a fresh regeneration
OK: docs/PROGRESS.md is current (20.2% of 57 features)
✔ no dependency violations found (239 modules, 702 dependencies cruised)
```

### A real bug found and fixed while building
`scripts/lib/catalogue.mjs` failed to parse: a doc-comment line containing the glob
`live-*/preflight.json` — the `*/` **closed the block comment**, turning the next line into code.
Reworded. Noted because it is invisible on inspection and the error pointed at the wrong line.

## Disclosed limitations

- **Probes are hand-authored, so the catalogue can still be wrong by omission** — a feature with an
  under-specified probe scores lower than reality, and one with a too-easy probe scores higher.
  The mitigation is that probes are *visible in the generated table* ("derived from" column), so a
  reviewer can attack the probe rather than argue with the number.
- **19 features declare no probe at all** and score MISSING by default (correct today — none of
  them exist). If one is built, its probe must be added or it will keep reading MISSING; no gate
  catches that. The count and the full id list are now DERIVED and printed into
  `docs/PROGRESS.md` rather than hand-counted (my hand-count said 13 — ISS-033).
- **Collection counts are as fresh as the last `pnpm verify:live` run**, not live at scoring time.
  Deliberate (keeps the scorer offline and ties the score to reproducible evidence); the generated
  doc names the exact evidence file it used.
- Route scraping is regex over source, not a live probe — a route that exists but crashes at
  runtime would still score as live. `pnpm verify:live` is the complement that catches that.

## How to verify (for the checker)
1. `pnpm progress` → writes `docs/PROGRESS.md`, prints `20.2% adjusted / 28.9% machine-derived`.
   Run it **twice**; the second run must produce a byte-identical file.
2. `node scripts/catalogue-score.mjs --check` → exit 0. Then append a line to `docs/PROGRESS.md`
   and re-run → exit 1. Restore.
3. **Test the honesty rule yourself**: edit `.goal/catalogue.json` to set any MISSING feature's
   `manual.verdict` to `"REAL"` → the scorer must exit 2 and refuse to write. Revert.
4. **Attack the probes, not the number.** Pick 5 rows and independently confirm the verdict:
   e.g. confirm `/ask` page really is absent from `apps/web/src/App.tsx`; confirm `chunks` really is
   empty in Mongo; confirm `@lkb/meeting-bot` really is imported by nothing outside itself
   (`grep -rn '@lkb/meeting-bot' apps packages --include=*.ts | grep -v '^packages/meeting-bot'`).
5. `pnpm lint:structure` → exit 0, and confirm the new `--check` is actually in the chain.
6. Confirm no verdict in `docs/PROGRESS.md` was hand-written: every row's verdict must be
   reproducible by deleting `docs/PROGRESS.md` and regenerating.

## Status: checked-PASS (see qa/verdicts/catalogue-progress-score.md, Cycle checked: 2, commit f2e9927)

Checker cycle 2: **PASS, 10/10 verify steps, 8/8 invariants**. ISS-029..ISS-033 all closed as
verified. It **adopted I1-I8 as drafted** and **amended** the contract with I9/I10, effective
cycle 3 (it declined to judge cycle 2 against goalposts it moved mid-verdict -- correct).
Notably it **mutation-tested** the new suite: neutering each of six guards in turn (vocabulary,
upgrade ordering, `assertDenominator`, dead-package->STUB, 501-stub subtraction, fingerprint)
turned a test red **6/6**, so the tests have teeth rather than merely existing.

**Two larger inflation levers found and filed as NEW issues -- not failures of this cycle, but
they are the same shape as ISS-029 and must not be left open in an instrument whose entire
purpose is being un-inflatable:**

- **ISS-035 (medium, +19.3 points -- the largest found in either cycle).** `loadCollectionCounts`
  selects the *lexically last* `qa/evidence/live-*` folder, so the folder NAME is attacker-
  controlled: one future-dated `preflight.json` with fabricated counts takes the score
  20.2% -> 39.5% with `--check`, `lint:structure` and all 10 tests green and the probe fingerprint
  unchanged.
- **ISS-034 (medium, +8.3 points).** Rewriting `POINTS` inflates the headline with every test
  still passing, and the generated doc keeps asserting `STUB/MISSING=0` while actually scoring
  STUB at 0.5 -- because that line is a hardcoded string rather than rendered from `POINTS`.

Both are addressed in the immediately following unit (`catalogue-input-integrity`) rather than
tacked onto this PASSed one.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
