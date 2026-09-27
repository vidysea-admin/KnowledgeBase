# Manifest — golden-set-condition3-operative

**Contract:** `qa/gates/golden-set-redesign.md` (Option C) is the binding spec — conditions 2 and 3.
**Goal task:** T-021 (tier 3, roadmap).
**Date:** 2026-09-09
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** **ISS-224**, **ISS-225**, **ISS-226** (cycle-1 failures, all mine).

## CYCLE 2 — I compared mixed corpora and reported a regression that does not exist

The FAIL is right on both counts, and the first one is worse than a mistake in a number.

### ISS-224 — the "2.3× overlap regression" was an artifact of my own comparison

`diagnose(q, page, turns)` returns overlap against the **worse of the two** corpora. I set that
`max(page, turns)` figure beside a prior of 0.071 that was **page-only**, and called the difference a
regression. Measured like-for-like there is none:

| | operative 92-set | prior 75-set |
|---|---|---|
| overlap vs **page** corpus | **0.0711** | 0.071 |
| overlap vs **turns** corpus | **0.1607** | 0.164 |

Page-to-page identical; turns-to-turns marginally **better**. `qa/verdicts/golden-set-regeneration.md:232`
states both prior numbers on one line — I read one of them.

**The part that matters more than the number:** I presented that fake regression under the heading
*"stated rather than buried"*, as evidence of my own rigour. Manufacturing a finding and then
claiming credit for disclosing it is worse than missing it, because it buys trust with the same act
that spends it. The same error ran through the pin rates — 18.5% is **page**-corpus, while 63% and
9.3% are **turns**-corpus, so that comparison was never like-for-like either.

### ISS-225 — the 0/92 was arithmetically forced, and my vacuity check missed it

`data/eval/golden-set.json` was last written by `refilter()` (`6055634`), whose keep-predicate
`judgeCandidate` **is** `buildPinTokens`. Re-applying a filter to its own output rejects nothing by
construction. The zero restates the filter; it measures no leakage.

I did check that zero — and checked the **wrong thing**. I verified the denominator was non-empty
(159 real tokens, `flywire` among them) and treated that as verifying the measurement. A non-empty
denominator rules out one way of being vacuous, not the others. That is the sixth vacuity of the
day and the first where the check I ran was itself the problem.

The number is kept and **labelled forced** rather than deleted, because "0/92, forced" is its honest
form.

### ISS-226 — two tokenizers for one lookup

My lookup used `/[a-z][a-z'-]*/g` while the pin map was built with `tokenize()`. Both give 0/92 with
zero per-question disagreement, so it changed no result — but it is a latent defect and the probe
now uses `tokenize()` throughout.

### The corrected, gate-comparable measurement

| corpus | pin rate | comparable to |
|---|---|---|
| **turns (~218k words)** | **10/92 = 10.9%** | the 63% leaky baseline and the 9.3% prior — **this is the gate-comparable row** |
| page (~3.1k words) | 17/92 = 18.5% | nothing; the leaky set's page-corpus analogue is **100%** |
| `buildPinTokens` | 0/92 | nothing; forced by `refilter()` |

The turns-corpus 10.9% is the number condition 3 actually asks for: non-zero, never optimised
against by any filter, and its pinning tokens are real content words — `distracted`, `isolated`,
`remotely`, `realistically`, `disability`. **Well below 63%.**

So cycle 1 reached the right conclusion through two unusable numbers. Same verdict, honest arithmetic.

## Why — three recall numbers rest on an unmeasured set

The gate makes condition 3 a **precondition on reporting a recall number**;
`scripts/lib/golden-set-diagnostics.mjs`'s own header says the diagnostics "must be re-run on any
regenerated set **BEFORE** its recall number is reported."

They were run — on a **75-question** set scoring recall@5 0.307. **The operative set is a different
one.** `data/eval/golden-set-provenance.json` records 92 questions generated 2026-09-08T09:01 (kept
92, rejected 0), and all three current reports score against it: heuristic 0.391, vector 0.935,
hybrid 0.870. `gen-golden-set.mjs` writes the set and the reject list and nothing else, and **no
file under `data/eval/` contained a pin rate**.

So three recall numbers rested on a set whose leakage was never measured — **including the 0.870 I
shipped this morning and cited in a PASSed unit.**

I did **not** regenerate the set. Conditions 1–3 were satisfied for the 75-set by
`golden-set-regeneration`, and the generator's provenance shows the 92-set was produced the same
Option C way (raw transcripts, `gemini-2.5-pro` against a `gemini-2.5-flash` summarizer,
near-neighbour distractors). What was missing was the measurement, so that is what this unit adds.

## What changed

- `qa/probes/golden-set-condition3.mjs` (new) — reuses `loadCorpora()` and `diagnose()` rather than
  re-deriving either. Read-only, offline, pure functions over files already on disk, so the checker
  reproduces it exactly.
- `data/eval/golden-set-diagnostics.json` (new) — the report the gate requires.

## ~~Condition 3 — measured on the OPERATIVE set~~ (CYCLE 1, SUPERSEDED — mixed corpora, see ISS-224/225 above)

| diagnostic | operative 92-set | leaky baseline | prior 75-set |
|---|---|---|---|
| verbatim overlap (mean) | **0.161** | 1.000 | 0.071 |
| verbatim overlap (max) | 0.313 | — | — |
| near-verbatim (≥ 0.8) | **0** | — | — |
| unique-token pin — **blunt** | **17/92 = 18.5%** | 29/46 = 63% | 9.3% |
| unique-token pin — **corrected** | **0/92 = 0.0%** | — | not measured |

**Both pin criteria are reported, and the second is the one that means anything.** `diagnose()` uses
the *blunt* criterion — unique in the **scored** corpus, which is only ~3.1k words, so ordinary words
land in one session by chance. Its 17 "pinned" questions are pinned by `you`, `should`, `will`,
`people`, `paths`, `skills`, `living`, `story`, `parents` — **the same word list ISS-093 recorded**
when this criterion was used as a generation filter. A question pinned by the word `you` is not
pinned. So 18.5% is an **upper bound**, kept only because it is the one number comparable to the
gate's 63% baseline.

`buildPinTokens` is ISS-093's corrected criterion — unique across the **raw transcripts** (~218k
words) *and* present in the page text. Under it, **0 of 92** questions are pinned.

**That zero is real, not an empty denominator** — the check I owed after five vacuity findings today.
The corrected pin set holds **159 tokens**, and they are what a real pin looks like: `shagun`,
`handa`, `flywire`, `cept`, `leeds`, `italia`, `provident`. `flywire` — the gate's *own* worked
example of a trivially-pinning token — **is** in the set, and no question uses it.

## Condition 2 — measured on the same set

| | value |
|---|---|
| heuristic baseline recall@5 | **0.391** (36/92) |
| misses | **56** |
| question-blind control | **0.217** (20/92) |

Strictly inside the (0.217, 1.000) band with a non-zero miss count. **Not 1.000, so no Option B
escalation.**

## ~~The number that moved the wrong way, stated rather than buried~~ (CYCLE 1, WITHDRAWN — the regression does not exist)

~~**Mean verbatim overlap is 0.161 against the prior set's 0.071 — 2.3× higher.**~~ **False.** 0.161 is a `max(page,turns)` figure and 0.071 is page-only. Like-for-like: 0.0711 vs 0.071 (page), 0.1607 vs 0.164 (turns). The gate's wording is
"must stay ~0". Max overlap is 0.313 and **zero** questions reach the 0.8 near-verbatim threshold, so
this is nowhere near a copy-detection tautology — but 0.161 is not "~0" in the way 0.071 is, and I am
not going to describe it as such. Whether that clears the gate's bar is the checker's call, not mine.

## How to verify

- `node qa/probes/golden-set-condition3.mjs` → prints the two corpora **separately**:
  turns pin **10/92 = 10.9%**, overlap mean 0.1607 / max 0.3125; page pin 17/92 = 18.5%, overlap
  mean 0.0711 / max 0.2143; near-verbatim 0 on both; forced zero 0/92 from a 159-token map
- `data/eval/recall-report.json` → hits 36 / total 92, control `recallAtK` 0.2174
- `git log -1 --format=%H -- data/eval/golden-set.json` → `6055634`, the `refilter()` commit whose
  predicate is `buildPinTokens` — the forcing ISS-225 names

## Not claimed

- **The gate is not closed by this unit.** Condition 4 remains blocked by the two defects the gate
  records — sibling-session ambiguity across the seven `uniaccess-*` sessions, and ISS-093 (status
  `fixed`, `verified_date: null`). This supplies conditions 2 and 3 on the operative set; closing is
  the checker's or the Approver's.
- **No recall number is re-derived here.** The three existing ones stand as measured; what changes is
  that the set under them now has diagnostics.

## Live browser evidence

`Not UI-touching — no surface changed.` Changed paths are `qa/probes/golden-set-condition3.mjs` and
`data/eval/golden-set-diagnostics.json`; `qa/**` is `genuinely_not_user_facing` in
`qa/ui-surfaces.json`, and `data/**` matches no pattern in it.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
