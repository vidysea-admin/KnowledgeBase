# Manifest — golden-set-regeneration

**Contract:** qa/contracts/golden-set-recall.md
**Gate:** qa/gates/golden-set-redesign.md — **ANSWERED** 2026-09-08, Option C (Umesh). Answered,
not closed: it closes only when conditions 1–4 hold, which is what this unit claims.
**Goal task:** T-021 (and ISS-071, high)
**Date:** 2026-09-08
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** **ISS-071** (high — the saturated, unfalsifiable eval)

## Result first

| | before | after |
|---|---|---|
| **recall@5** | **1.000** | **0.307** |
| misses | **0** | **52** |
| question-blind control | 0.217 | 0.187 |
| lift over control | +0.783 (meaningless — see below) | **+0.120** |
| `assessBaseline` verdict | **`saturated`** | **`informative`** |
| unique-token pin rate (turns corpus) | 56.5% | **9.3%** |
| verbatim overlap vs scored corpus | **1.000** | **0.071** |
| questions | 46 | 75 (23/23 sessions) |

**Gate condition 2 is satisfied:** recall@5 is **strictly between 0.217 and 1.000** with a
**non-zero miss count**. It is not 1.000, so this does not escalate to Option B.

## The finding that matters more than the pass

**The retriever is much weaker than anyone could previously see.** 0.307 against a 0.187
question-blind control is a lift of **+0.120** — real, but modest. The old 1.000 was not measuring
retrieval at all; it was measuring copy-detection, because each question *was* a `keyInsights`
string lifted verbatim from the same `session_page.json` whose `summary` retrieval scores against.

That is the point of the exercise, and it is unwelcome news rather than a win: **52 misses is now
visible headroom for U1.4/U1.5 to move**, where before there was none. Phase 1's exit criteria are
falsifiable again.

## What changed

1. **`scripts/gen-golden-set.mjs`** — was five lines of `question: insight`. Now: reads
   `turns.json` (raw transcript, never `session_page.json`); ranks **near-neighbour sessions** by
   content-token Jaccard and names them in the prompt so wording must fit them too; asks for real
   student questions. **The prompt requests those properties; a deterministic post-filter enforces
   them** — any candidate carrying a token unique to its own session, or overlapping the transcript
   past 0.5, is rejected and logged. **17 of 92 candidates were rejected**, so the filter did real
   work rather than rubber-stamping.
2. **`scripts/lib/golden-set-diagnostics.mjs`** (new) — the gate's two required diagnostics as pure
   functions (no model, no network) so the checker reproduces them exactly.
3. **`apps/api/src/ai-transport.ts`** — a **disclosed scope addition**, see below.

## Three honesty notes I am not burying

**1. The page-corpus pin rate of 0.0% is tautological.** The post-filter rejects on exactly that
criterion, so it *must* come out 0. It is not evidence. **The informative number is the turns-only
corpus — 56.5% → 9.3%** — which the filter was not optimising for.

**2. Same vendor on both sides, at Umesh's direction.** Umesh chose Gemini ("go with gemini api
key"). The summarize jobKind resolves to Gemini's `DEFAULT_MODEL` = `gemini-2.5-flash`, so
`session_page.json` came from **Flash** and this generation used **Pro** — literally a different
model, satisfying the gate's wording. But Pro and Flash share a vendor, family and training
lineage, so this reduces same-source vocabulary leakage **less than a cross-vendor run would**, on
top of the reduction the gate itself already calls partial. I raised this before proceeding; it is
recorded in the script, not only here. **Gate condition 1 restated: Option C reduces but does not
remove same-source vocabulary leakage.**

**3. The control moved, and the gate's 0.217 is now two different things.** The gate cites the
question-blind control as **0.217**; on this new set the same null retriever measures **0.187**.
Both are correct — a control is a property of the question set, and the set changed. 0.217 is also
the chance floor (`k/sessions` = 5/23). Condition 2's threshold of 0.217 stands as written, and
0.307 clears it either way.

## Disclosed scope addition — a real production bug found en route

`ANTHROPIC_API_KEY` is present in `.env` as a **bare name with no value**, so the api-key path
throws at construction. That left the claude-code OAuth adapter — which was **dead on Windows**:
`resolveCliCommand` appended `.cmd` unconditionally, but `claude` here ships as `claude.exe`, and
Node ≥20 refuses to spawn `.cmd`/`.bat` without a shell → `spawn EINVAL`. **Every claude-code job
failed on Windows, including `/ask`'s configured fallback (`ask: [gemini, claude-code]`)**, invisible
because every test uses the fake transport.

Fixed in place: probe `PATH` for what is actually installed, `.exe` before `.cmd`, preserving the
`shell:false` property the function exists to protect; unchanged fallback when nothing is found.
Verified live before the switch to Gemini: **35.2s round-trip returning real JSON**.

This widened the unit. I judged duplicating transport logic in a script to be the worse sin, and
the golden-set work could not proceed through a dead provider. **The checker should rule on whether
it warranted its own unit** — I think it is defensible and I would not fight a finding.

## Evidence

```
generation: 75 questions, 23/23 sessions, 17 candidates rejected by the post-filter
diagnostics (turns corpus):  overlap mean 0.164 max 0.313 | PIN 9.3% (7/75)
diagnostics (scored corpus): overlap mean 0.071 max 0.214 | PIN 0.0% (0/75, tautological)
eval-recall: recall@5 = 0.307 (23/75) | control 0.187 | VERDICT: INFORMATIVE
  "0.307 vs a 0.187 question-blind control (+0.120), with 52 miss(es) left to move"
```

`pnpm --filter @lkb/api test` 109/109 · `pnpm -r typecheck` exit 0 ·
`pnpm lint:structure` clean, depcruise 0 violations / 269 modules.

**Miss-quality check, because a high miss count could be an artefact rather than a signal:**
- The corpus contains a near-duplicate pair (`uk-beyond-offer-letters` and its `-reupload`). It
  accounts for **5 of 52** misses, of which **2** scored a miss while its own twin sat in the top-5
  — arguably unfair. Removing those two gives 25/75 = 0.333; the conclusion is unchanged.
- Misses are **spread, not concentrated** (worst session: 4). So this is not one broken session
  dragging the number down.

## The threat to validity I could not rule out

The near-neighbour instruction deliberately makes questions phrase-ambiguous across sessions. If it
over-corrected, some questions may be *legitimately* answerable by more than one session, and the
"expected" id would then be arbitrary — which would depress recall for a reason that is not the
retriever's fault. Evidence against: the null control sits at 0.187, slightly **below** the 0.217
chance floor, which is what a non-degenerate set looks like. Evidence I cannot supply: nobody has
human-read the 75 questions to confirm each has exactly one right answer.

**This is the single thing most worth an independent opinion.** If the checker reads a sample and
finds several questions genuinely multi-session, the honest reading of 0.307 changes.

## How to verify (checker)

1. **Re-run all three yourself** — `node scripts/gen-golden-set.mjs --dry-run` (neighbour
   selection, no API call), the diagnostics, and `node scripts/eval-recall.mjs`. Do not trust the
   table.
2. **Check condition 2 literally**: recall@5 strictly between 0.217 and 1.000 **and** miss count
   non-zero. A 1.000 would mean the remedy failed and escalates to Option B — confirm it is not.
3. **Read a sample of the 75 questions** (say 10, spread across sessions) and judge: is each one
   genuinely answerable by its expected session, and *only* by it? This is the validity threat
   above and it is the judgment I most want from you.
4. **Confirm the post-filter is load-bearing**, not decorative: `data/eval/golden-set-rejected.json`
   should show 17 real rejections with reasons. Try disabling the pin check and confirm pinned
   questions reappear.
5. **Verify the tautology claim** — that page-corpus pin rate is 0 *by construction*, so my
   headline pin improvement rests on the turns-only number.
6. **Rule on the `ai-transport.ts` scope addition**: separate unit, or correctly folded in?
7. Confirm nothing here claims the gate is CLOSED. Conditions 1–3 are argued satisfied; **condition
   4** (re-pointing U1.4/U1.5's exit criteria at this set) is explicitly NOT done by this unit.
8. `ISSUES-WRITTEN: none` is a complete check.

## Risk / rollback

The old golden set is in git history; `git revert` restores it. No product behaviour changed except
the `ai-transport.ts` fix, which strictly widens what resolves. Read-only against the database.

---

# Fix cycle 2 — both FAILURES from cycle 1

The cycle-1 verdict summed it up better than I can: **the remedy works; the artifact's honesty
didn't.** Condition 2 was verified satisfied and every number reproduced — and the unit still
failed, on two claims about itself. That is the right call.

### ISS-091 (high) — the report's honesty field was the report's one false statement

> *"`data/eval/recall-report.json` still carries `goldenSetProvenance` = 'verbatim
> session_page.keyInsights excerpts … same pipeline and document as the retrieval target' —
> hardcoded at `scripts/eval-recall.mjs:82-85`, describing the set this unit deleted."*

Accepted. A field that exists **purely so a reader can trust the number** was describing the set I
had just replaced. Same family: the generator's own header still said "this is Anthropic" after the
switch to Gemini.

**Fixed as a class, not as a sentence.** Correcting the string would have reset the clock on the
identical failure at the next regeneration. Provenance is now **derived**: `gen-golden-set.mjs`
writes `data/eval/golden-set-provenance.json` (model, summarizer model, source, prompt strategy,
filter, counts, and the bias warning), and `eval-recall.mjs` **reads** it. If it is absent the
report says so explicitly — *"UNKNOWN … treat the score as uninterpretable"* — rather than
substituting a guess. A record written by whatever produced the data cannot drift from it.

`--provenance-only` rebuilds that record from artifacts already on disk with **no API call**, so a
stale record is repairable without regenerating — regeneration is non-deterministic and would have
produced a different set, invalidating the review already done against this one. It stamps
`recordedAfterTheFact: true`, which is honest but weaker, and says why in the code.

The stale generator header is corrected to name Flash → Pro and the same-vendor caveat.

### ISS-092 (high) — 0.307 is a downward-biased floor, and I did not say so

> *"the pin check runs over **the same page corpus the heuristic retriever scores against**, so it
> selectively deletes what the retriever answers: filtered-out 17: **0.765** · kept 75: **0.307** ·
> unfiltered 92: **0.391**"*

Accepted, and this is the sharper of the two findings — I would not have found it. The filter is
**not neutral**: rejecting questions whose rare tokens the retriever can see means rejecting, by
construction, the questions the retriever finds easy. I reported the resulting number as though it
were an unbiased estimate of retrieval quality. It is a floor.

**Fixed by measurement, not by a caveat.** `eval-recall.mjs` now scores the rejected set too and
publishes all three figures on every run, in the console and in `filterBias` in the report:

```
filter bias: kept 0.307 (n=75) | rejected 0.765 (n=17) | combined 0.391 (n=92)
             — kept is a FLOOR, not an unbiased estimate
```

My numbers reproduce the checker's exactly. A prose caveat would have gone stale the way ISS-091's
string did; a figure recomputed every run cannot.

**The checker's second observation, which I am recording rather than fixing:** "page-unique" is a
much weaker property than the *rare-entity* one the filter is meant to capture — `parents`,
`interest`, `story` and `loan` are all page-unique, and three loan-financing questions were
discarded for containing "parents"/"interest". That is a real design weakness in the filter
criterion. **I have deliberately not changed it in a fix cycle**: switching the pin corpus changes
which questions ship and would require regeneration and re-review. It belongs in its own unit, and
`filterBias` now makes its cost visible in the meantime.

### The validity threat — confirmed real, and worse than I could show

I flagged possible over-correction into multi-session ambiguity and could not settle it. The
checker read 12 questions and found **~4/12 genuinely multi-session, ~4 borderline** — driven by
**seven identically-formatted `uniaccess-*` sessions**, where a question like *"is the university
in the city or a secluded campus?"* is answered by all of them. So **a material share of the 52
misses are not retriever failures.**

My counter-evidence (control 0.187, below the 0.217 chance floor) rules out *total* degeneracy,
not this partial kind — the checker is right that those are different claims. Recorded as a
**precondition on gate condition 4**: before U1.4/U1.5's exit criteria are re-pointed at this set,
the sibling-session ambiguity needs addressing, or those gates inherit a metric that punishes a
retriever for a question with no unique answer.

### Not certified by this unit

`apps/api/src/ai-transport.ts`. The checker ruled folding it in **defensible** and the fix
**correct**, with two deliberate deviations noted (scans all PATH dirs for `.exe` before any
`.cmd`, rather than Windows' per-dir PATHEXT order; returns `command+ext`, not an absolute path).
But it has **no test, and the entire real transport is uncovered** — which is exactly why a
completely dead provider path shipped under 109 green tests. That gap is pre-existing and outside
this contract; it is not certified here and should be its own unit.

## Cycle-2 evidence

| check | result |
|---|---|
| `node scripts/gen-golden-set.mjs --provenance-only` | wrote provenance, `afterTheFact=true`, no API call |
| `node scripts/eval-recall.mjs` | recall@5 **0.307**, control 0.187, **INFORMATIVE**, 52 misses — unchanged |
| filter bias (new, every run) | kept **0.307** / rejected **0.765** / combined **0.391** |
| report provenance | now an object read from disk (`model: gemini-2.5-pro`), not a hardcoded string |
| `pnpm --filter @lkb/api test` | 109/109 |
| `pnpm -r typecheck` | exit 0 |
| `pnpm lint:structure` | clean, depcruise 0 violations / 269 modules |

No regeneration, no API spend, and the set the checker reviewed is byte-identical.

## How to verify (cycle 2)

1. `node scripts/eval-recall.mjs` — confirm `filterBias` reports all three figures and that
   `goldenSetProvenance` is an **object read from `golden-set-provenance.json`**, not a string.
2. **Delete `golden-set-provenance.json` and re-run** — the report must say `UNKNOWN … treat the
   score as uninterpretable`, never a substituted guess. Restore it with `--provenance-only`.
3. Confirm the three bias figures match your own independent replay (you measured
   0.765 / 0.307 / 0.391).
4. Confirm no stale claim survives: grep for `Anthropic` and `keyInsights excerpts` in
   `scripts/gen-golden-set.mjs` and `scripts/eval-recall.mjs`.
5. Condition 2 unchanged and still satisfied: 0.307 strictly inside (0.217, 1.000), 52 misses.
6. Judge whether deferring the pin-corpus redesign to its own unit is right, or whether shipping a
   filter with a known-weak criterion is not acceptable even with the bias published.
7. `ISSUES-WRITTEN: none` is a complete check.

**Status: checked-PASS** — PASS from `qa/verdicts/golden-set-regeneration.md` (Cycle checked: 2,
matching Fix cycle 2), committed `a1fa870`. 3/3 in-scope gate conditions, 3/3 regression gates.

**The checker verified the claims rather than the sentences.** For ISS-091 it deleted
`golden-set-provenance.json` and re-ran, confirming the report degraded to *"UNKNOWN … treat the
score as uninterpretable"* with no substituted claim — testing the failure mode, which is the only
way to check a "fixed as a class" assertion. It confirmed `git diff` on the golden set is empty,
so the set it sampled at cycle 1 is byte-identical and that reading still describes this artifact.

**On the deferral, it argued against me before ruling for me** — the right shape for a judgment
call. Re-deriving the rejection tokens itself, it found **13 of 17 rejections fire on ordinary or
function words** (`should`, `will`, `you`×2, `people`, `paths`, `skills`, `living`), which is
materially worse than the "page-unique vs rare-entity" framing I had accepted from cycle 1. It
still ruled shipping acceptable, on grounds I had not fully articulated: fixing the criterion *is*
a regeneration (invalidating the review and every number in the verdict); nothing yet depends on
0.307 being unbiased because condition 4 is unexecuted; the cost is published as a recomputed
figure rather than a caveat that can go stale; and the deliverable — a falsifiable metric — holds
either side of the bias. It named what would flip the ruling, and filed **ISS-093 (high)** as
**binding: it must close before gate condition 4 is executed**, so the deferral is tracked rather
than trusted.

**Two follow-ups it raised, both handled at close-out:**
1. The condition-4 preconditions lived only in the manifest and verdict, not in the gate file that
   whoever executes condition 4 will actually read. Now appended to
   `qa/gates/golden-set-redesign.md` as a clearly-labelled progress note **below** the human'''s
   answer, which is untouched — it records findings and asks for no new decision.
2. **T-021 stays open, correctly.** Its `done_check` is still the unfailable `recall@5 >= 0.85`
   the gate itself says must be re-set, and condition 4 is unexecuted; closing it would claim the
   gate work is finished. `ISS-071` is flipped to `fixed` because the saturation it names is
   genuinely gone — that is a narrower claim than the task being done.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
