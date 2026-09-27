# Manifest — golden-set-pin-criterion

**Contract:** qa/contracts/golden-set-recall.md
**Gate:** qa/gates/golden-set-redesign.md (ANSWERED, Option C). **ISS-093 is recorded as binding on
gate condition 4**, so this unit is a precondition for re-pointing U1.4/U1.5.
**Goal task:** T-021 (stays open — see below)
**Date:** 2026-09-08
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** **ISS-093** (high)

## The bug, in one measurement

The post-filter rejected any question containing a token "unique in the corpus retrieval scores" —
the `session_page` text. **That corpus is 3,099 words across all 23 sessions**, about 135 words
each. At that size ordinary words land in exactly one summary **by chance** and register as rare.

| word | page-unique? | turns-unique? |
|---|---|---|
| `should`, `will`, `you`, `people`, `paths`, `skills`, `living` | **yes** (all) | **no** (all) |
| `flywire` (a real brand name) | yes | **yes** |

So the filter was discarding good questions for containing *"should"*. The checker measured it
first: **13 of 17 rejections fired on ordinary or function words.**

## The fix

Uniqueness now computes over the **turns** corpus — **217,980 words, ~70× larger** — where a token
in exactly one session is genuinely rare rather than a sampling artefact. The second condition is
unchanged and still right: the token must also appear in the target's page text, because a rare
word is only a *shortcut* if the retriever can see it.

**Pin vocabulary: 921 → 159 tokens**, and the survivors are what the criterion was always meant to
catch: `shagun`, `handa`, `italia`, `provident`, `hrd`, `nationalized`, `700`.

**Applied by `--refilter`, not regeneration.** ISS-093 is a defect in the *criterion*, not the
questions — the same 92 candidates judged correctly give a different set. So: no API spend, and
every question the previous checker human-read is still present and unchanged.

## Result

| | before (ISS-093) | after |
|---|---|---|
| questions | 75 | **92** (23/23 sessions) |
| **recall@5** | 0.307 *(a biased floor)* | **0.391** |
| control | 0.187 | **0.217** |
| lift over control | +0.120 | **+0.174** |
| misses | 52 | 56 |
| verdict | `informative` | **`informative`** |
| filter bias | kept .307 / rejected .765 / combined .391 | **none — 0 rejected, kept ≡ combined** |
| pin rate (turns) | 9.3% | 10.9% |
| pin rate (page) | 0.0% *(tautological)* | 18.5% |

**0.391 is now the unbiased figure**, not a floor: it is exactly the `combined` number the previous
run predicted, reached by fixing the criterion rather than by caveat. Gate condition 2 still holds
— strictly inside (0.217, 1.000) with 56 misses.

## The result I checked hardest, because it looked like good news

**0 of 92 candidates rejected.** A filter that rejects nothing is normally a dead filter, and
"the prompt requests, code enforces" would be hollow. So I verified it still fires:

```
pin vocabulary: 159 tokens
synthetic question: "What did the speaker say about shagun?"
filter fires? YES on "shagun"
```

The filter is alive; the model simply complied with the prompt's instruction to avoid rare
identifying words. The 17 earlier rejections were, on the corrected criterion, **all** false
positives. **I would still rather the checker treat 0-rejections as suspicious than take my word.**

## Two honest notes

**1. The page-corpus pin rate rose 0.0% → 18.5%, and that is expected, not a regression.** The old
0.0% was tautological (the filter rejected on exactly that criterion). Now nothing enforces
page-uniqueness, so questions containing chance-unique ordinary words ship — which is correct,
since those words are not shortcuts. The meaningful figure is the turns corpus: **56.5% → 10.9%**
against the original leaky set.

**2. The diagnostics deliberately do NOT match the filter's criterion.** `diagnose()` measures
turns-unique alone; the filter requires turns-unique **and** page-present. Making them identical
would recreate exactly the tautology ISS-092 was filed for — a measurement grading its own
enforcement. The gap is why the diagnostic reports 10.9% while the filter rejects 0, and it is
intentional.

## What this unit does NOT do

- **Does not close gate condition 4.** ISS-093 was one of *two* preconditions; the other —
  **sibling-session ambiguity**, ~4 of 12 sampled questions answerable by several of the seven
  identically-formatted `uniaccess-*` sessions — is untouched and still blocks.
- **Does not close T-021.** Its `done_check` is still the unfailable `recall@5 >= 0.85`, and
  re-expressing it is the human-allowlist act `/goal`'s security invariant reserves.
- **`scripts/lib/golden-set-build.mjs`** is new only because `gen-golden-set.mjs` hit **353 LOC
  against a 300 budget**. It is a move, not a rewrite. It is deliberately *not* merged into
  `golden-set-diagnostics.mjs` — see note 2.

## Evidence

```
pin vocabulary          921 -> 159 tokens
refilter                92 candidates -> 92 kept, 0 rejected, 23/23 sessions
eval-recall             recall@5 = 0.391 (36/92) | control 0.217 | INFORMATIVE (+0.174, 56 misses)
filter bias             none - 0 candidates rejected, so kept === combined
diagnostics (turns)     overlap 0.161 | PIN 10.9%
diagnostics (page)      overlap 0.071 | PIN 18.5%
```

`pnpm --filter @lkb/api test` 109/109 · `pnpm -r typecheck` exit 0 ·
`pnpm lint:structure` clean (lint-loc 249 files, lint-dupes 259 exports, depcruise 0/269).
All three CLI paths re-run after the file split: `--dry-run`, `--refilter`, `--provenance-only`.

## How to verify (checker)

1. **Reproduce the root cause** — confirm the page corpus is ~3k words and that `should`/`will`/
   `you` are page-unique but not turns-unique. That single fact is the whole unit.
2. **Attack the 0-rejection result.** Construct a question containing a genuinely rare entity from
   the target's page text and confirm `--refilter` rejects it. If you can build a plausible pinned
   question the filter now misses, that is a real finding.
3. `node scripts/gen-golden-set.mjs --refilter` then `node scripts/eval-recall.mjs` — confirm
   0.391, control 0.217, `INFORMATIVE`, and `filterBias` reporting **none** rather than `null`.
4. Confirm condition 2 still holds and that no question text changed — only which ones ship
   (`git diff` the golden set: additions only, no edits).
5. **Judge whether 159 pin tokens is the right size.** Too small and the filter under-enforces;
   spot-check a few for whether they are genuinely rare entities.
6. Confirm nothing claims condition 4 is unblocked — the sibling-session precondition still stands.
7. `ISSUES-WRITTEN: none` is a complete check.

## Risk / rollback

No API spend, no question text changed, no product code touched. `git revert` restores the 75-item
set and the old criterion.

---

# Fix cycle 2 — both FAILURES, plus a defect I caused while fixing them

Cycle 1's verdict confirmed the thesis (*"correct and I could not break it"*) and failed the unit on
its own deliverables. Both accepted.

### ISS-095 (high) — the paid path threw, and only the paid path

> *"the file split narrowed the import at `gen-golden-set.mjs:43` to `tokenize` only, but line 192
> still calls `verbatimOverlap(...)` … The **paid generation path throws ReferenceError after the
> first API call**. The manifest's 'all three CLI paths re-run' is accurate and is exactly why it
> escaped — the fourth path is the only one that costs money and the only one untested."*

That diagnosis is the finding, more than the bug. My evidence line was **true and useless**: I
listed the three paths I could run for free and let that stand for coverage.

**Fixed structurally, not with an import.** The filter predicate existed in **two copies** — one in
the generation loop, one in `refilter` — which is *why* a partial fix was possible: `--refilter`
stayed green on its own copy while the generator's was broken. Both now call one exported
`judgeCandidate()`. There is no second copy to diverge.

**And the untested-path class is closed:** `--self-test` runs the **real** generation loop against a
stub provider — prompt build, completion, parse, filter — with no network and no writes.

**Proven against the actual defect class** (armed via `mutate.mjs`): reintroducing an unbound
reference in the loop makes `--self-test` **throw at `gen-golden-set.mjs:199`**, while `--dry-run`
stays **green and blind to it**. That contrast is the unit's core claim, demonstrated rather than
asserted.

### ISS-094 (high) — ISS-091 recurred *inside the function written to prevent it*

> *"`postFilter` still says … 'within the SCORED corpus (session_page summary+keyInsights)' and
> still carries the 'DOWNWARD-BIASED FLOOR' warning. Both are false as shipped … the counts are
> derived from disk, but these two fields are still hardcoded literals."*

Exactly right, and the sharpest way to put it: I fixed ISS-091 by deriving the **counts** and left
the **prose** hardcoded, so the record kept describing a criterion the code no longer used. Deriving
part of a record does not make the record derived.

- `postFilter` is now built from `PIN_CORPUS`, the same constant the criterion is documented
  against, so the description cannot name a corpus the filter does not use.
- `postFilterBiasWarning` is **conditional on `rejectedCount`**, not a constant. Now reads:
  *"no candidate was rejected, so the kept set IS the candidate set and the filter introduces no
  selection bias on this run."*

### The defect I caused mid-fix, reported because it cost real work

While demonstrating the ISS-095 proof I ran `mutate.mjs apply` on a file holding uncommitted edits.
`apply` **correctly refused**. I let the sequence continue anyway, and the trailing
`mutate.mjs restore` ran `git checkout --` and **discarded ~40 lines of my own uncommitted work** —
the precise loss the `apply` precondition had just prevented.

**That is a hole in the guard, not just operator error.** `restore` is a destructive operation
wearing a safety tool's name: it never checked whether the file was armed. A guard on one end of a
paired operation guards nothing.

`restore` now **refuses any file not in the ledger**, telling the caller to arm it or run
`git checkout` themselves so the intent is explicit. Test `(f)` covers it and asserts the file is
left **byte-identical** on refusal. Cost me the redo; it will not cost the next person.

### Recorded, not fixed (cycle-1 judgement calls I agree with)

- **~1/3 of the 159 pin tokens are still ordinary words** unique only across 23 transcripts
  (`capped`, `permit`, `stamp`, `spouse`, `48`). Better than 921, not clean. Costs nothing at 0
  rejections and errs toward keeping questions.
- **Unigram pinning cannot catch a rare multi-word entity** whose parts are individually common.
  Pre-existing; not introduced here.

## Cycle-2 evidence

| check | result |
|---|---|
| `--self-test` | generation loop ran, 4 kept / 0 rejected, no writes |
| **mutation proof** | unbound ref in the loop → `--self-test` **throws**; `--dry-run` **still green** |
| `--refilter` → `eval-recall` | 92 kept, recall@5 **0.391** (36/92), control **0.217**, **INFORMATIVE**, 56 misses |
| provenance `postFilter` | now names *"the turns (raw transcripts, ~218k words) corpus AND present in that session's page text"* |
| provenance `biasWarning` | now *"no candidate was rejected … no selection bias on this run"* |
| `node --test scripts/lib/*.test.mjs` | **17/17** (mutate 6 incl. the new (f), tracker-audit 11) |
| `pnpm --filter @lkb/api test` | 109/109 · typecheck exit 0 · lint:structure clean, depcruise 0/269 |

## How to verify (cycle 2)

1. **Replay the ISS-095 proof**: arm `gen-golden-set.mjs`, reintroduce an unbound reference inside
   the generation loop, confirm `--self-test` throws while `--dry-run` passes. Restore.
2. **Confirm one predicate, not two** — `judgeCandidate` is the only filter decision, used by both
   the generation loop and `refilter`.
3. **Check the provenance is derived**: change `PIN_CORPUS`, re-run `--provenance-only`, confirm
   `postFilter` follows. Then confirm `postFilterBiasWarning` changes when `rejectedCount > 0`
   (easiest via a sandbox or by reasoning from the branch — do not fabricate rejections).
4. **Verify the `restore` fix**: on a file with uncommitted edits that was never armed,
   `mutate.mjs restore` must refuse **and leave the file untouched**.
5. Numbers unchanged: 0.391 / 0.217 / INFORMATIVE / 56 misses; condition 2 still holds.
6. Confirm condition 4 is still **not** claimed unblocked — sibling-session ambiguity stands.
7. `ISSUES-WRITTEN: none` is a complete check.

**Status: checked-PASS** — PASS from `qa/verdicts/golden-set-pin-criterion.md` (Cycle checked: 2,
matching Fix cycle 2), committed `1bb3247`. **8/8 checked claims, 2/2 invariants,
`ISSUES-WRITTEN: none`.** `ISS-093`, `ISS-094`, `ISS-095` all flipped to `fixed` by the checker
with its own evidence.

**`ISS-093` is no longer a precondition on gate condition 4.** The sibling-session ambiguity still
is — that was always the other half, and this unit never claimed it.

**It replayed rather than accepted.** It armed the file itself, injected its own unbound probe into
the generation loop, and confirmed `--self-test` throws at `:199` while `--dry-run` prints all 23
neighbour sets and exits 0 — green and blind. It then grepped repo-wide to confirm the predicate
exists exactly once, with both call sites pointing at it. For ISS-094 it changed `PIN_CORPUS` to a
probe string and watched `postFilter` follow, and **exercised both arms** of the bias branch
(0 → "no selection bias"; 3 → the floor text). For the `restore` fix it used a tracked, never-armed
file with a sentinel line and verified refusal **plus a matching SHA256 before and after**.

**Its correction to my framing, which I accept:** `--self-test` is **partly theatre**. It stubs the
provider, so `new GeminiProvider(...)` construction and the parse of a *real* model response
(fences, prose, malformed JSON) remain paid-path-only — the stub returns clean JSON, so only the
happy path is exercised. So the untested-path class is **reduced to an irreducible remainder, not
closed**. That is a smaller gap than cycle 1 found, and my wording should have said "reduced".

**One residual sharp edge it found and deliberately did not file** (fail-safe, no data loss):
`restore <armed> <unarmed>` checks out the armed file, then hits the refusal and exits **before**
`writeLedger`, so the armed row survives. `assert-clean` then blocks the commit until restore is
re-run — annoying, not dangerous. Recorded here rather than fixed, respecting its judgement not to
file it.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
