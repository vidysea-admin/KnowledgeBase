# Manifest — vector-cosine-retriever
**Contract:** qa/contracts/ingest-indexing-pipeline.md
**Goal task:** U1.4 (plan §10 — **roadmap tier 3**, the first non-QA-generated unit this stretch)
**Date:** 2026-09-08
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** ISS-124 (high), ISS-123 (medium) — both raised by the cycle-1 FAIL

## The number

**recall@5 = 0.935 (86/92)**, against the heuristic baseline's **0.391 (36/92)** and a question-blind
control of **0.217**. Delta **+0.543**. Verdict from the harness's own saturation detector:
**INFORMATIVE** — not 1.000, 6 real misses left to move.

That last point is the one that matters most. The `golden-set-redesign` gate existed because
recall@5 had been pinned at **1.000 with zero misses**, a metric that could register a regression
but never demonstrate an improvement. The regenerated set now shows a large genuine gain *and*
retains headroom, so it is still a usable ruler after the win.

## What changed

- `packages/index/src/vector/cosine.ts` (new) — `cosineSimilarity`, `rankByCosine`,
  `rankSessionsByCosine`. Pure, no I/O. Brute force per **D-021** (cycle 2 — cycle 1 wrongly cited
  "D-a", a plan-local shorthand that was never a DECISIONS id): Atlas Vector Search does not exist
  on a self-hosted Mongo reached by raw IP (no `+srv`), and at 1452 × 3072 an exhaustive scan is
  **exact** at a measured p95 of 62 ms, where an ANN index would be approximate and slower to
  build.
- `packages/index/src/vector/retriever.ts` (new) — `createVectorRetriever`, satisfying the existing
  `RetrieveFn` so it drops into the recall harness with **no change to the harness**.
- `scripts/eval-recall.mjs` — extended in place with `--retriever vector` (no new script file;
  `scripts/` is at its D-018 budget). Also fixed two real defects found by running it, below.
- `packages/index/src/index.ts` — exports.

## Three design decisions worth the words

1. **`RetrieveFn` is synchronous and I did not change it.** Vector retrieval needs the question
   embedded, which is I/O. Making the seam async would have touched every existing retriever and the
   harness for one caller's benefit. Instead the embedding is hoisted *out* of the hot path:
   `createVectorRetriever` takes questions already embedded. That also turns 92 requests into one
   batched call. The retriever's real job is ranking, and ranking is pure.
2. **A missing question embedding THROWS.** Returning `[]` would be indistinguishable, to the
   harness, from "the retriever ran and found nothing" — a plumbing failure would be scored as a
   retrieval miss and silently depress recall. A metric that reports a wiring bug as a quality
   regression is worse than no metric.
3. **Sessions are deduped BEFORE the top-k cut.** The chunker deliberately overlaps turns, so
   neighbouring chunks are near-duplicates; ranking chunks and truncating would let one long session
   occupy every slot and push the correct answer out. There is a dedicated test for exactly that.

## Two real defects the run exposed (neither found by reasoning)

- **`eval-recall.mjs` never loaded `.env`**, so `connect()` silently fell back to
  `localhost:27017` and failed against a host that was never the target. One line, but it would
  have made the vector mode unusable for anyone but me.
- **The vector run overwrote `recall-report.json` — the heuristic baseline its own delta is
  measured against.** I caught this only after the first successful run. Reports are now written
  per-retriever (`recall-report.json` / `recall-report-vector.json`), the baseline was restored
  from git, and the measurement was re-run to confirm both numbers now coexist on disk. **A unit
  whose entire purpose is a delta had been destroying its own comparand.**

## How to verify (commands + expected)

- `pnpm --filter @lkb/index test` → exit 0, 194 pass (16 new)
- `pnpm -r typecheck` / `pnpm -r test` → exit 0
- `node scripts/eval-recall.mjs --retriever vector` → recall@5 ≈ 0.935, writes the vector report
- `node scripts/eval-recall.mjs` → the heuristic baseline, 0.391, untouched
- every structure gate individually by exit code (ISS-100)

## Actual outputs (from maker's own run)

```
recall@5 = 0.935 (86/92 hits)
control (question-blind) = 0.217 | chance floor = 0.217
VERDICT: INFORMATIVE — 0.935 vs a 0.217 question-blind control (+0.717), 6 miss(es) left to move

BOTH ON DISK (re-run after the clobber fix):
  heuristic: 0.391 | 36/92
  vector   : 0.935 | 86/92
  delta    : +0.543
  retriever: vector (brute-force cosine, gemini-embedding-001, 1452 chunks)

@lkb/index  tests 194  pass 194  fail 0
pnpm -r typecheck = 0 · pnpm -r test = 0
```

## Disclosed — the checker should press on these

1. **The residual misses are NOT random, and this bounds the result.** Four of the six involve
   `uniaccess-*` sessions (`atlas-skilltech` ×2, `cept-university`, `ashoka-university`). That is
   precisely the **sibling-session ambiguity** flagged as unresolved precondition 4 of the
   `golden-set-redesign` gate: seven identically-formatted `uniaccess-*` sessions where several can
   legitimately answer the same question. So an unknown share of those 6 "misses" may be
   **mislabelled ground truth rather than retrieval failures** — which means 0.935 is arguably a
   *floor*. I am not claiming the higher number; I am flagging that the gate's open precondition
   directly limits how precisely this result can be read.
2. ~~**Single measurement, one embedding model.**~~ **The checker resolved this and the result was
   better than I claimed:** a re-run produced byte-identical misses *including every miss's full
   ordered top-5*; only `generatedAt` changed. One embedding model is still the only one tested.
3. **Not wired into `/ask`.** This is the retriever only. `vectorSearchFn` injection at the
   composition root and the hybrid merge are U1.5, deliberately not smuggled in here.
4. ~~**No latency measurement.**~~ **RESOLVED IN CYCLE 2 — and it was a requirement, not a
   caveat.** I framed this as a disclosure; the checker correctly ruled that plan §10's *Verify:*
   line names p95 outright, and that my brute-force-over-ANN argument rested on it. Measured:
   **p50 28.84 ms · p95 62.35 ms · max 127.55 ms.** See the cycle-2 section.
5. **The dedupe-before-truncate behaviour changes what "k" means** versus a chunk-level ranking.
   That is intentional and tested, but it is a semantic choice a reviewer should agree with rather
   than inherit.

## Cycle 2 — the cycle-1 FAIL, and what it got right

**Verdict:** `qa/verdicts/vector-cosine-retriever.md` — **FAIL**, cycle 1, 5/7 criteria (6/6
invariants held). Both failures were about **U1.4's own stated requirements, not retrieval
quality** — and the checker was right on both.

It confirmed the retrieval work independently and could not break it: 0.935 (86/92) reproduced
exactly, 1452 real 3072-dim chunks over 26 sessions verified by its own live Mongo query, byte-
identical rankings across runs **including every miss's full ordered top-5**, the clobber fix
verified in git history rather than on disk, and **6/6 mutations killed** including
dedupe-before-truncate and the tie-break.

### FAILURE 1 — ISS-124 (high): I shipped code that reverses a recorded decision, citing an id that does not exist

`cosine.ts` cited **"D-a"** — a *plan-local shorthand* that was never a DECISIONS id. Meanwhile
`ARCHITECTURE.md` Q5 still read *"CLOSED by D-003: Mongo Atlas Vector Search on `chunks`"*, which
the shipped code deliberately does not use. Plan §10 makes *"write the DECISIONS entry superseding
D-003"* part of U1.4 itself, and I simply did not do it. **Fixed:**

- **D-021 appended** via `scripts/append_decision.ps1`, `Supersedes: D-003` scoped explicitly to Q5
  only — D-003's stack, language split, schema-source and CI budgets are untouched and stay in
  force. (It was written as D-019 first and refused: the concurrent lane had taken D-019/D-020
  while this unit was in flight. The append guard caught it — the exact collision class
  `qa/gates/ledger-id-collision.md` is open about.)
- `ARCHITECTURE.md` Q5 repointed to `D-003 → D-021` (authorized by that entry's
  `Changes-authorized`, written **before** the edit, per the Lab Protocol).
- `cosine.ts` now cites D-021.

### FAILURE 2 — ISS-123 (medium): p95 was a stated Verify item, not an optional extra

I had disclosed "no latency measurement" as if it were a caveat. It was a requirement: the plan's
*Verify:* line names p95 beside the two things I did do, and my brute-force-over-ANN justification
**rested on an unmeasured claim**. Measured now, ranking only (the batched embed is excluded
deliberately — it is one round-trip amortised over every question, so folding it in would report
network latency as retrieval latency):

```
p50 28.84 ms · p95 62.35 ms · max 127.55 ms   (n=92, 1452 chunks x 3072 dims)
```

**This also corrected an overclaim of mine.** The comment in `cosine.ts` said the scan was
"milliseconds"; it is tens of milliseconds — off by an order of magnitude. The comment now carries
the measured numbers and says where they come from. The conclusion survives (62 ms is comfortably
inside D-021's ~500 ms revisit threshold) but it is now evidence rather than intuition.

### Nothing in `packages/index/src/vector/` changed

Both fixes are one DECISIONS entry, two one-line repoints, and timing instrumentation in
`eval-recall.mjs`. The retriever the checker attacked and could not break is byte-identical.

### The checker's findings I am carrying forward rather than closing

- **It went further than I did on disclosure #1** and found a cause I missed: `atlas-skilltech`
  has only **4 chunks** against 21–45 for other sessions, and owns **2 of the 6 misses**. Its view:
  none of the six is a clean retrieval failure and at least four are ambiguous ground truth. So
  0.935 is citable as **a floor with the caveat attached** — and explicitly **must not** be used to
  close gate condition 4 or to settle U1.5's ≥0.85 while precondition 1 is open. I am recording
  that constraint here so U1.5 cannot quietly inherit the number.
- It also **discharged gate precondition 2** (ISS-093's biased post-filter): `golden-set-rejected`
  is now empty, so `kept === combined` and there is no selection bias left in the comparison.
- **`packages/index/src/vector/` has no contract at all**, and U1.5 builds on it. It recommends
  `/checker init-contract vector-retrieval` (human-gated) before U1.5. Flagged, not actioned —
  contract creation is the checker's and the human's, never the maker's.

## Cycle 2 outputs

```
pnpm -r typecheck = 0 · pnpm -r test = 0
lint-loc=0 lint-dirsize=0 lint-root=0 lint-dupes=0 lint-migrations=0 snapshot=0 depcruise=0
ARCHITECTURE.md = 131 lines (budget 150)
recall@5 = 0.935 (86/92) — unchanged, as expected: no retriever code changed
latency: p50 28.84 · p95 62.35 · max 127.55 ms
```

## Status: checked-PASS

**Verdict:** `qa/verdicts/vector-cosine-retriever.md` — **PASS**, cycle 2, 7/7 criteria, 6/6
invariants, committed `6d4b397`. `ISSUES-WRITTEN: ISS-125 (medium, ledger row only)`.

The checker verified each fix **against its own recorded reproduction** rather than against my
account of it, and checked the D-021 scoping by *effect* rather than wording: `ARCHITECTURE.md` Q2
still reads "CLOSED by D-003: TS pnpm monorepo", untouched — so D-003's stack answer is still
attributed to D-003 and standing, which is the thing a badly-scoped supersession would have
silently broken. `docs/DECISIONS.md` took 8 added lines and **zero deletions**; the Q5 block is the
only ARCHITECTURE hunk and `Changes-authorized` names it.

It also corroborated the D-019 collision from git independently (`05b93cc`/`6a57bae` predate this
unit's commit) and noted that **a maker bypassing the append guard would never have hit its id
allocator at all** — the refusal is itself evidence the entry went through the proper write path
before the edit.

**No regression, proven with git rather than by reading:** `git diff 6da5251 HEAD --
packages/index/src/vector/` is one file where every changed line begins with ` *` — entirely inside
a block comment, no executable line moved. So cycle 1's 6/6 mutation kills still describe the
shipped artifact. recall@5 = 0.935 with the **identical six misses and identical ordered top-5
lists**; the heuristic baseline is intact at 0.391.

**Its p95 re-run came out at 78.11 ms against my 62.35 ms — and it was right to expect that.**
Unlike the ranking (deterministic, byte-identical), wall-clock timing is not reproducible to two
decimal places. Both are ~6× inside D-021's 500 ms revisit threshold. It ruled excluding the
batched embed **honest rather than convenient** — it is what ISS-123's own `fix_direction`
demanded, the embed term cancels between the brute-force and ANN arms the number exists to compare,
and the exclusion is stamped into the report, the code comment and this manifest. **Boundary it
attached: this is not end-to-end `/ask` latency and U1.5 must not inherit it as such.**

### Carried into the PASS so it travels with the number

- **0.935 is citable only as a floor with disclosure 1 attached.** It may **not** close golden-set
  gate condition 4, nor settle U1.5's ≥0.85 exit criterion, while sibling-session ambiguity is open.
- **ISS-125:** `"D-a"` still survives in `schema/chunks.schema.json` and its generated type. Not
  charged — it predates this unit (U1.2, `821341b`) and ISS-124's recorded reproduction named three
  artefacts, all three closed. Fixed immediately anyway rather than deferred, since it is one word
  and D-003 makes the JSON Schemas the single source of truth.
- **A stale token in D-021 itself:** its `Changes-authorized` field ends "...replace the 'D-a'
  citation with **D-019**", the refused attempt's id showing through. The checker recorded it and
  deliberately did **not** request a fix, and I agree: `DECISIONS.md` is append-only, so appending a
  whole new decision to correct one stale token would be worse governance than leaving it visible.
  Every other field in the entry says D-021 and the scope is correct.
- **`packages/index/src/vector/` still has no contract**, and the recommendation is now stronger
  than at cycle 1: U1.5 inherits 0.935 as the input to a ≥0.85 exit criterion while the directory it
  depends on has no criteria of its own. Raised as a HUMAN_GATE — contract creation belongs to the
  checker and the human, never the maker.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
