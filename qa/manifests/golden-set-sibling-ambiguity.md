# Manifest — golden-set-sibling-ambiguity

**Contract:** `qa/gates/golden-set-redesign.md` (Option C) — the sibling-ambiguity half of the two
defects blocking **condition 4**.
**Goal task:** T-021 (tier 3, roadmap).
**Date:** 2026-09-09
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** **ISS-234**, **ISS-235**, **ISS-236**, **ISS-237** (cycle 1) · **ISS-239**, **ISS-240** (cycle 2).

## CYCLE 2 — the measure fails its own known-positive test, and that is the result

The FAIL was right on all four counts. Fixing them turns the unit's conclusion over completely.

### ISS-234 — my known-positive test passed by accident, in the unit where I claimed it as a virtue

I pinned the test to **`gq01`** — *"What kind of support is available for students looking for
internships?"* The gate's example is **`gq02`** — *"Is the university located right in the city or is
it more of a secluded campus?"*

**The contradiction was already in the artifact I shipped:** `golden-set-ambiguity.json` recorded
gq01's id and gq01's text under gq02's justification, and the manifest printed gq02's text beside
gq01's id. Anyone reading the JSON could have caught it. I wrote it and did not.

And gq01 ranked 21 **not because siblings answer it** but because its own transcript lacks the words
`support` and `looking`. It was flagged for an unrelated reason — the accidental known-positive that
this test exists to prevent, inside the section where I called the test "the discipline I kept
failing today".

### With the right question, the measure fails

```
KNOWN POSITIVE — 2026-05-23-uniaccess-atlas-skilltech-gq02
  "Is the university located right in the city or is it more of a secluded campus?"
  rank 1/23, rivals 0  ->  NOT FLAGGED
```

The gate states this question is answerable by **all seven** `uniaccess` sessions. Under my measure
it is the **single most discriminating question in the set**. That is not a near miss; it is the
measure pointing the opposite way on the one case with an independent answer.

**So the lexical proxy does not detect the property condition 4 turns on**, and I am reporting that
rather than the numbers it produces. The probe now says so in its own output, so the next reader
cannot lift a figure out of the report without meeting the disclaimer first.

### ISS-235 / ISS-236 — the other two defects, fixed, and they changed the numbers

| | cycle 1 | cycle 2 |
|---|---|---|
| weighting | `1/df` — floors at 1/23; four all-session words held **36%** of the weight | `log(N/df)` — exactly zero at df = N |
| length | none — 6 of 13 tail questions were the two **shortest** transcripts | each session's own mean subtracted; now **3 of 11** |
| rank 1 | 26.1% | **32.6%** |
| top-3 | 62.0% | **66.3%** |
| median rank | 3 | **2** |

My cycle-1 claim that IDF weighting made a stopword list unnecessary was **wrong**: `1/df` is not
IDF, and it was not suppressing generic vocabulary.

### ISS-237 — I argued the cluster claim from the statistic I had just called unusable

Cycle 1 said the `uniaccess` cluster was *less* contested and used that to undercut the gate's
seven-sibling story — reasoning from the binary flag I had declared unusable two paragraphs earlier.
The checker also showed my "ties" explanation was wrong: a strict `>` keeps the inversion.

Restated from rank, the honest answer is **neither**:

| cluster | mean rank | tail share |
|---|---|---|
| `uniaccess` | 3.75 | 10.0% |
| all other | 3.99 | 12.5% |

Indistinguishable. This measure neither supports nor refutes the gate's structural claim, and my
cycle-1 refutation is **withdrawn**. Note this also differs from the checker's own cycle-1 figures
(5.70 vs 4.44) — because the measure changed under both fixes, not because either count was wrong.

### What the unit now delivers

A **negative result about the LEXICAL cheap path**, which is worth more than a number I cannot defend: a
deterministic lexical measure, corrected on every axis the checker named, **fails to detect the
gate's own worked example.** Condition 4 needs semantic adjudication; it cannot be reached this way.

The 11-question tail ships as a **reading list**, explicitly not an adjudication list (ISS-240):
**7 of its 11 slots are still explicable by transcript length** even after normalisation, and the
gate's own ambiguous question is absent from it. Its value is bounded and stated as such.

**Scope correction the checker required:** "the cheap path is closed" is too broad — what is closed
is the **lexical** family. It ran four operationalisations (`1/df` raw, log-IDF raw, `1/df`+baseline,
log-IDF+baseline) and gq02 ranks **1 or 2 of 23 in every one**, with no tail threshold catching a
rank-2 question without flagging 68 of 92. So the non-detection is a property of the family rather
than of my parameterisation — the result generalises **further** than I demonstrated. An embedding
pass tests a hypothesis none of this touches.

---

## What the gate asks for, and what I can honestly deliver

The gate records: *"An independent read of **12** questions found ~4 genuinely answerable by more
than one session, driven by seven identically-formatted `uniaccess-*` sessions."* Condition 4 is
blocked on that, measured on 13% of the set.

**"Genuinely answerable by more than one session" is a semantic judgement and no deterministic
script can make it.** What is measurable is **lexical non-discrimination** — whether the question's
distinguishing vocabulary appears in the target's transcript any more than in its siblings'. That is
a proxy **in both directions**: a session can share the vocabulary without answering, and answer
without sharing it.

So this unit does not claim to quantify ambiguity. It reports what a lexical measure sees, **tests
that measure against the gate's own worked example**, and — its actual deliverable — reduces
adjudication from 92 questions to 11.

## ~~The headline finding is that my first statistic was wrong~~ (CYCLE 1 — still true, but its cluster reasoning is WITHDRAWN, see ISS-237)

I built the obvious measure first: *contested* = any other session covers the question's weighted
vocabulary at least as well as the target. It flags **71/92 = 77.2%**.

**I am not reporting that as the answer, because it disagrees with the reference reading in both
rate and direction:**

| | this measure | gate's hand read |
|---|---|---|
| ambiguity rate | 77.2% | 33.3% (4/12) |
| `uniaccess-*` cluster | **70.0% — LESS contested** | named as *the driver* |
| all other sessions | 79.2% | — |

A statistic that fires on 2.3× as many questions as the reference *and* inverts its structural claim
is measuring something else. The cause is mechanical: `rivals >= expectedCoverage` counts every
**tie**, and at a mean target coverage of 0.769 across 23 sessions, ties dominate.

It is kept in the report **labelled unusable**, not deleted, because the next reader will otherwise
recompute the obvious statistic and believe it.

**I did not tune the threshold until the rate matched 33.3%.** That would be fitting the instrument
to the answer — the metric-gaming this repo's own D-015 exists to stop — and it would have been easy
to do and hard to detect.

## ~~The usable signal: where the target actually ranks~~ (CYCLE 1 FIGURES, SUPERSEDED — ISS-239)

~~24/92 = 26.1% at rank 1 · 57/92 = 62.0% top-3 · median 3 · tail 13.~~
**Cycle-2 figures, from the corrected measure: 30/92 = 32.6% at rank 1, 61/92 = 66.3% top-3, median
rank 2, tail 11.** The "moderately discriminating set" reading survives the correction — but it is
now beside the point, since the measure fails on the gate's own example and none of these figures
is evidence about ambiguity.

## ~~Known-positive test — the discipline I kept failing today~~ (CYCLE 1, VOID — wrong question, ISS-234)

The gate's worked example is literally in the set:
`2026-05-23-uniaccess-atlas-skilltech-gq01` — *"Is the university located right in the city or is it
more of a secluded campus?"*, stated by the gate to be answerable by all seven `uniaccess` sessions.

~~**It is flagged: rank 21 of 23, 20 rivals.** The measure fires on the one case whose answer is
already known.~~ **VOID (ISS-234).** That id is `gq01`, which is NOT the gate's example, and it
ranked 21 because its own transcript lacks `support` and `looking` — not because siblings answer
it. The gate's actual example is `gq02`, which ranks **1/23, NOT FLAGGED**. The closing sentence of
this section — that without a known-positive a low finding anywhere else would mean nothing — is
the one part that survives, and it convicts the section it appears in.

## ~~The deliverable: 13 questions, not 92~~ (CYCLE 1, SUPERSEDED — 11 questions after length normalisation)

`data/eval/golden-set-ambiguity.json` → `tailForAdjudication`. Worst first:

```
rank 23  2026-05-29-decoding-ever-expanding-cast-gq04
rank 22  2026-05-29-decoding-ever-expanding-cast-gq02
rank 21  2026-05-23-uniaccess-atlas-skilltech-gq01   ← NOT the gate's example (ISS-234); gq02 is, and it ranks 1
rank 19  2026-05-29-decoding-ever-expanding-cast-gq03
rank 19  2026-05-23-uniaccess-atlas-skilltech-gq04
rank 18  2026-05-29-decoding-ever-expanding-cast-gq01
rank 17  2026-05-20-telling-your-brand-story-better-gq02
rank 13  2026-08-03-uk-beyond-offer-letters-gq04
rank 11  2026-06-19-entrance-exams-pathways-india-part1-gq01
rank 11  2026-07-22-uniaccess-cept-university-gq01
rank 11  2026-08-12-uniaccess-ashoka-university-gq01
rank 10  2026-08-12-uniaccess-ashoka-university-gq02
```

Note what the tail contains: **four of thirteen are `decoding-ever-expanding-cast`**, a session the
gate never mentions, while only five are `uniaccess-*`. If the gate's seven-sibling story were the
whole driver, the tail would not look like this.

## ~~No stopword list, deliberately~~ (CYCLE 1, WRONG — `1/df` is not IDF and did not suppress generic vocabulary, ISS-236)

The repo already carries two (`extract-topics.ts`'s `STOPWORDS`, `gen-golden-set.mjs`'s module-local
`STOP`). A third would be a third definition to drift. Tokens are weighted by **inverse session
frequency** instead — a word in every session carries ~0 weight, a word in one carries nearly all of
it — which is what a stopword list crudely approximates.

## How to verify (CYCLE 3 — this section stated cycle-1 expectations, ISS-239)

- `node qa/probes/golden-set-ambiguity.mjs` → `--write` persists
- known positive `…-gq02` → **`NOT FLAGGED`, rank 1/23, 0 rivals.** That non-detection **is the
  unit's finding**, not a failure of the run. The cycle-1 wording here read "→ `FLAGGED`, rank
  21/23. If it ever prints NOT FLAGGED, every other number in the report is void" — which the
  output this unit ships as its result trips on its own terms. The rule was right for a probe whose
  purpose was to *measure* ambiguity; this probe's result is that it cannot.
- `data/eval/golden-set-ambiguity.json` → `knownPositive.flagged` **false**, `headline.medianRank`
  **2**, `headline.rank1` **30**, `tailForAdjudication.count` **11**,
  `tailForAdjudication.fromTwoShortestTranscripts` **3**

## What this does NOT settle

**CYCLE 3 — the next step is three-way, and the first leg is mine, not the Approver's.** The
cycle-2 checker flipped its earlier position and I am recording its correction rather than my
framing: before paying for an LLM pass or a human read, a **bounded embedding pass** (cosine
question ↔ transcript, flag a near-tied top-2) is **unblocked maker work needing no approval**, and
it tests the one hypothesis this lexical negative does not touch. Only after that is the
human-vs-LLM choice a real one.

**Condition 4 is not unblocked by this unit.** A lexical proxy cannot decide semantic answerability,
and its disagreement with the gate's hand read is unresolved in both directions — I do not know
whether the hand read was conservative or my measure over-flags. What the unit provides is a
**prioritised 11-question reading list with known transcript-length bias**, so the adjudication that
does settle it (a human read, or a bounded LLM pass) is tractable. Choosing between those two, and paying for the second, is the
Approver's call — as is ISS-232's caveat that this set shares ~82% of its questions with the one the
earlier hand read sampled.

## Live browser evidence

`Not UI-touching — no surface changed.` Changed paths: `qa/probes/golden-set-ambiguity.mjs`,
`data/eval/golden-set-ambiguity.json`. `qa/**` is `genuinely_not_user_facing` in
`qa/ui-surfaces.json`; `data/**` matches no pattern in it.

## Status: checked-PASS

Independent checker PASS recorded in `qa/verdicts/golden-set-sibling-ambiguity.md` (cycle 3: 7/7
criteria, 3/3 invariants). ISS-241 was corrected during maker close-out.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
