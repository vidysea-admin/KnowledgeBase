# Manifest — hybrid-arms-binding (U1.5 part 2)
**Contract:** qa/contracts/hybrid-retrieval.md
**Goal task:** U1.5 (part 2 — discharges the C6/C7 deferral)
**Date:** 2026-09-09
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** none — roadmap feature work

## CYCLE 3 — ISS-179: my own C6 test was VACUOUS, and it is the same class I keep shipping

The checker passed C7 and confirmed both cycle-2 fixes reproduce (the hoist mutation that stayed
green at cycle 1 now kills 3 tests; recall reproduces to the digit at 0.870). It then failed C6 on
a **third distinct unpinned path** — factory internals, then binding site, now the **data boundary**
— and it is right.

What I shipped in cycle 2:

```js
assert.ok(a.queriedTenants.every((q) => q.endsWith(":tenant-a")));
```

**`[].every()` is `true`.** A module-level cache of `turns`/`chunks` not keyed by tenant — one
`??=`, the most ordinary perf change anyone would make to this file — suppresses the second tenant's
read entirely and the assertion passes because there is nothing left to iterate. The test also used
two SEPARATE db fakes and asserted on the **query filter string**, never on what came back, so it
could not observe a cross-tenant candidate even in principle. C6's Verified-by asks for exactly the
thing it did not check: *"tenant B's question never returns a candidate resolving to tenant A's
session."*

This is the ninth-plus instance of *a guard that passes by doing nothing* in my own units, and the
second time in three days that I have written a check whose negative result was structurally
unreachable. I am recording it as a pattern, not an incident.

**The fix:** ONE db holding BOTH tenants' rows, whose `find()` actually honours the `tenantId`
filter so a leak is expressible; assertions on the **returned node ids**; and a non-vacuity block
asserting ≥4 real reads, non-empty results for both tenants, and zero `UNSCOPED` reads — so the test
cannot pass by querying nothing.

| mutation (the checker's own, re-run by me) | old test | new test |
|---|---|---|
| **R — unkeyed module-level `turns` cache** | survived (vacuous) | **killed** |
| **S — unkeyed module-level `chunks` cache** (vector arm's corpus) | survived (vacuous) | **killed** |

173/173 green, 0 cancelled; `pnpm -r typecheck` clean; mutations armed and restored through
`scripts/lib/mutate.mjs` with a trap on timeout/interrupt/error (D-020), `assert-clean` outstanding
none. One anchor mismatch aborted a first attempt and the trap restored the file — recorded because
it is evidence the trap works, not despite it.

**Not claimed:** this pins the boundary against an in-process cache. It does not prove isolation
against a real Mongo; the checker's own live two-tenant probe is the evidence for that, and it is
the checker's, not mine.

## CYCLE 2 — both cycle-1 failures fixed, and the corrected number is WORSE than the one I reported

### ISS-169 (C6, security-class) — the binding site is now pinned

The checker hoisted `deps.extraCandidateArmsFor("system")` out of the request handler and **170/170
stayed green**. It was right about why: my tests pinned what the factory *does* once a tenant is
known, and nothing pinned *where* it is called. `extraCandidateArmsFor` was referenced by zero tests
in the repo.

Three tests added to `apps/api/src/ask-arms.test.ts`, driving the real router over real HTTP with a
recording factory (173/173 green, 0 cancelled):

| mutation to `routes/ask.ts` | tests killed |
|---|---|
| **A — hoist the bind to boot** (the checker's own) | **3 / 3** |
| **B — bind lazily once, then reuse** (the cheap wrong fix) | **2 / 3** |

B matters more than A. A cache is safe today and becomes a cross-tenant read the moment its key is
dropped — and it would survive a test that only asserted "not `system`". The assertion is therefore
the **ordered list** of bindings, not a membership check: a hoist yields `["system"]` and a cache
yields `["tenant-a"]`, and both fail, differently. The third test pins that a **refused** caller
(401/403) binds nothing at all — the bind must sit behind `requireScope`, or a caller who is about
to be rejected has already touched a tenant's corpus.

Mutations were armed and restored through `scripts/lib/mutate.mjs` with a trap firing on
timeout/interrupt/error (D-020); `assert-clean` reports none outstanding.

### ISS-170 (C7) — the number measured an arm that does not ship

Both defects the checker named were real. Fixed in `scripts/eval-recall.mjs`:

1. **Lexical depth** — the eval read `k*4 = 20` turns; `ask-arms.ts` reads `k = 5` and then dedupes
   by session. The eval's lexical arm was strictly stronger than production's.
2. **The tree arm is now NAMED in the report's `retriever` string** as
   `tree=HEURISTIC PROXY not the shipped selectNodes LLM arm`, so no reader has to already know it.

**Re-measured at the shipped depth: 0.870 (80/92), not 0.891.**

| retriever | recall@5 | hits |
|---|---|---|
| heuristic (tree, proxy) | 0.391 | 36/92 |
| **vector (cosine)** | **0.935** | 86/92 |
| **hybrid — as reported cycle 1** | 0.891 | 82/92 |
| **hybrid — corrected, shipped depth** | **0.870** | **80/92** |
| control (question-blind) | 0.217 | — |

**The correction moved the number down, and the regression vs vector alone widened from −0.043 to
−0.065.** Two more of the questions I had counted as hits were being carried by a lexical arm four
times deeper than the one that ships. I have not tuned weights to recover them, for the same reason
as cycle 1.

One thing I claimed in cycle 1 is now **withdrawn**: I explained the regression as "the tree arm
votes with almost the authority of noise." That is a property of the *heuristic proxy*, which does
not ship. It may still be true of `selectNodes`; **I have no evidence either way**, and the checker
was right that it was stated as a cause when it was a guess about a different arm.

### Still not measured (unchanged, and I am not claiming otherwise)

The eval fuses **session ids**; `askV2` fuses **nodes** through `selectNodes`. Same `rrfMerge`, same
key discipline, different call path. 0.870 characterises the merge *policy* on a near neighbour of
the shipped configuration — not `askV2` end to end. A bounded live `/ask` sample is the thing that
would close this, and it is not in this cycle.

---

## THE HEADLINE (cycle 1, kept — numbers superseded above): the hybrid merge is WORSE than vector alone

C7 required U1.5 to measure its **own** recall rather than inherit U1.4's 0.935. Measured, through
the same harness, the same 92-question golden set and the same question-blind control:

| retriever | recall@5 | hits |
|---|---|---|
| heuristic (tree) | 0.391 | 36/92 |
| **vector (cosine)** | **0.935** | 86/92 |
| **hybrid (RRF, 3 arms)** | **0.891** | 82/92 |
| control (question-blind) | 0.217 | — |

**hybrid vs vector: −0.043. A REGRESSION.** It introduced **8 new misses** that pure vector got
right (and recovered 4 the vector arm missed).

Against plan §10's literal bar it "passes" — 0.891 ≥ 0.85. **I do not think that should be
credited**, and C7 is written to prevent exactly that reading: the honest statement is that adding
the tree and lexical arms **diluted** a better ranking. Reciprocal-rank fusion weights every arm
equally, and the tree arm scores 0.391 — barely above the 0.217 chance floor — so it is voting with
almost the authority of noise.

**What I have NOT done, deliberately:** tuned per-arm weights until the number went up. That would
be fitting the merge to a 92-question set whose ground truth an open gate precondition already
disputes, and calling the result an improvement. The contract's author refused to fix arm weights
for the same reason — no evidence in the repo bears on them.

**My read:** the merge machinery is correct (three cycles of adversarial checking say so) and the
*configuration* is not yet justified. The next honest step is U2.2-style measurement of what each
arm contributes, not a weight I picked because it made this number rise.

## What changed

- `apps/api/src/ask-arms.ts` (new) — the vector and lexical arms. **A FACTORY taking `tenantId`**,
  which is C6's substance, not packaging: `buildProductionDeps()` has no tenant and its router-level
  id is the literal `"system"`, so arms bound at boot would query one tenant's corpus for every
  tenant's questions — **ISS-078's shape aimed at the corpus instead of the API.**
- `apps/api/src/routes/ask.ts` — binds the arms per request from the **verified key's** tenantId.
  `AskRouteDeps` now *excludes* `extraCandidateArmsFn` from `askDeps`, so a bound function cannot be
  smuggled in at boot even by accident.
- `packages/ask/src/ask-v2.ts` — the arms fn now receives the tree, so an arm maps its own id
  vocabulary (sessionIds) to nodes **without duplicating `buildTree`'s path convention**.
- `scripts/eval-recall.mjs` — `--retriever hybrid`, writing its own report file. It **reuses
  `rrfMerge`** rather than reimplementing fusion, so the measured merge is the shipped merge.

## How to verify

- `pnpm --filter @lkb/api test` → 170 pass · `pnpm -r test` → exit 0
- `node scripts/eval-recall.mjs --retriever hybrid` → 0.891, own report file
- mutations: arms query the boot tenant instead of the request tenant; vector failure swallowed

## Actual outputs

```
MUTATION I  arms query "system" not the request tenant (C6)  -> 168 pass / 2 fail
MUTATION J  vector failure swallowed (C5)                    -> 169 pass / 1 fail
restored byte-identical · MUTATIONS CLEAN · clean run 170 pass / 0 fail

recall@5 = 0.891 (82/92) · control 0.217 · VERDICT: INFORMATIVE, 10 misses left to move
```

## Disclosed — the checker should press on these

1. **The regression is the finding, and I want it ruled on.** If a merge that measurably loses to
   one of its own arms should not ship at all, that is a defensible FAIL and better than a green
   tick on a number I have just argued against.
2. **The hybrid arm is not yet reachable from `/ask` in production** in the sense of having been
   exercised against live Mongo — it is wired and unit-tested with an injected db, but I did not run
   a live `/ask`. Given that C6 is security-class, a live two-tenant probe is the stronger evidence
   and I did not produce it.
3. **`k = 5` per arm and `RRF_K = 60` are conventional, not derived.** Same reasoning as the
   contract's refusal to fix weights.
4. **The eval harness's hybrid path fuses SESSION IDS while `askV2` fuses NODES.** Both use the same
   `rrfMerge` and the same key discipline, but they are not the same call path — so the measured
   number is of the merge *policy*, not of `askV2` end to end. That is a real gap between what I
   measured and what ships.

## Live browser evidence

`qa/evidence/browser-hybrid-arms-binding-2026-09-09/` (D-024).

**Why this unit is UI-touching:** `qa/ui-surfaces.json` matches `apps/api/src/ask-arms.ts`, which
this unit created in cycle 1. This cycle's own diff (`ask-arms.test.ts`, `scripts/eval-recall.mjs`)
does **not** match the pattern — but D-024 gates the **unit at PASS**, not the cycle, so the
evidence is owed here rather than skipped on a technicality.

`/ask`, real browser, **0 console errors**. Typed *"What did speakers say about UK student visas and
post-study work?"* and clicked Ask. The answer cites UKVI's tightened Basic Compliance Assessment
and Enroly CAS Shield, with `INTERNAL SOURCES (1)` =
`toc/year:2026/month:08/session:2026-08-03-uk-beyond-offer-letters` — the correct session — and
`WEB SOURCES (0)`. On the half it has no evidence for it says *"The context does not contain
information about what speakers said regarding post-study work"* rather than inventing it.

**This is a smoke pass, not the validation** (`maker/SKILL.md:199`). It shows the live path works
end to end through the per-request-bound arms; it is **one question on one tenant** and is not a
recall measurement. The checker runs Mode D with its own script.

## Status: checked-PASS

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
