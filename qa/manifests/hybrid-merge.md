# Manifest — hybrid-merge
**Contract:** qa/contracts/hybrid-retrieval.md
**Goal task:** U1.5
**Date:** 2026-09-09
**Fix cycle:** 3 of max 3
**Dual check:** no
**Issues addressed:** ISS-157 (fixed, cycle 2) · ISS-158 (high) + ISS-159 (medium) — the cycle-2 FAIL

## What this unit does NOT claim, stated first

**It does not claim `recall@5 ≥ 0.85`, and it does not report a hybrid recall number at all.**

Contract C7 requires U1.5 to measure its **own** hybrid recall rather than inherit U1.4's 0.935.
Measuring that honestly needs the vector arm wired at the composition root against real chunks and
a real per-request tenant (C6) — which is the *second* half of U1.5 and is not in this unit.

So this unit ships the **merge mechanism and its seam**, tested, and stops before the number. I am
recording that as a deliberate split rather than shipping a merge with an unmeasured claim
attached: this project's whole golden-set problem began with a number nobody could falsify.

## What changed

- `packages/ask/src/merge.ts` (new) — `rrfMerge`. Pure, no I/O, and deliberately knows nothing
  about vectors, lexical search or the tree. That is what keeps `packages/ask` free of a
  `packages/index` import (C10, dep-cruiser enforced): the arms are built at the composition root,
  which may import both; only their *results* arrive here.
- `packages/ask/src/ask-v2.ts` — optional `extraCandidateArmsFn` on `AskV2Deps`, merged into the
  **candidates thunk's input**. `router.ts` and `evaluator.ts` are **byte-unchanged** (C1,
  verified by `git diff --stat`, empty).

## The real design decision was the KEY, not the formula

Plan §10 says "deduped by turnId". **That is unimplementable as written**, and the contract's
author said so independently: the three arms speak three id vocabularies — tree search yields
`node_id`, the vector retriever `sessionId`, lexical search `turnId`. **No field all three carry.**

Deduping on a field two arms lack would silently dedupe *nothing* — worse than not deduping, because
the merge would look correct while one long session's chunks crowded the list. So the key is
explicit, total and injected; production uses `node_id`, the only vocabulary all three necessarily
share by the time C2 requires them to be tree nodes.

## Degradation is reported, not swallowed

A failed arm returns `[]` and `/ask` still answers from tree + lexical. But **empty-because-healthy
and empty-because-failed must not look identical** — this project has shipped three separate
silent-degradation bugs. A degraded arm writes an `ask.retrieval_degraded` job and an audit entry
naming which arm and why; an arm that ran and found nothing writes neither. Both are tested.

## How to verify

- `pnpm --filter @lkb/ask test` → 45 pass
- `git diff --stat -- packages/ask/src/router.ts packages/ask/src/evaluator.ts` → empty (C1)
- `npx depcruise …` → exit 0 (C10)
- mutations: drop the tie-break; collapse fusion to last-arm-wins; remove the degradation report

## Actual outputs

```
pnpm -r typecheck = 0 · pnpm -r test = 0 · @lkb/ask 45/45
depcruise = 0        · C1 diff: empty

MUTATION A  tie-break dropped (C4 determinism)          -> 44 pass / 1 fail
MUTATION B  fusion -> last-arm-wins (C3/C4 semantics)   -> 43 pass / 2 fail
MUTATION C  degradation report removed (C5 visibility)  -> 44 pass / 1 fail
restored byte-identical each time · MUTATIONS CLEAN: none outstanding
```

Three mutations, three different failure counts — so the assertions pin three distinct properties
rather than all tripping on one symptom.

## Disclosed — the checker should press on these

1. **C6 (tenancy) is NOT satisfied by this unit and I am not claiming it is.** The seam is designed
   for per-request binding — `extraCandidateArmsFn` is a closure the composition root builds — but
   **nothing binds it yet**, so there is no live tenant path to attack. C6 is security-class and
   never round-capped; it should be judged against the *next* unit, and this manifest should not be
   credited with it.
2. **C7 is deliberately unmet** (see the top). If the checker judges that a merge without its
   measurement should not PASS at all, that is a defensible FAIL and I would rather take it than
   have the split pass unexamined.
3. **C9 (`compete.ts`) is untouched** because the new dep is optional — the `tavilySearchFn`
   precedent. Verified by typecheck and the existing tests, not by a new one.
4. **`RRF_K = 60` is the conventional constant and I did not derive it.** The contract explicitly
   refused to fix a value, and no evidence in this repo bears on it. It is documented, not justified.
5. **The first arm wins ties** so the tree node's `summary` survives for the refine step. That is a
   real behavioural choice a reviewer should agree with rather than inherit.

## Cycle 2 — it failed on the gap I did NOT disclose, not the split I did

**Verdict:** FAIL, cycle 1, 8/11. **The split was upheld** — and on better reasoning than mine. My
argument was "don't ship an unmeasured claim". Its argument is structural: C6 and C7 are both
properties of the composition-root binding, which C10 *forbids* `packages/ask` from reaching at
all — so the alternative was never "a measured merge", it was one bundled unit where a
security-class criterion sits sixth of eleven behind a sort comparator. **ISS-078 — the
cross-tenant disclosure that survived four PASSes and 102 green tests — is this repo's own
evidence against that shape.** It also grepped the whole commit for `0.935` / `≥0.85` / any recall
number and found none, so C7's actual hazard is structurally unreachable here. Recorded as
*deferred*, with the condition that **a second deferral of either is accretion and should be failed
as such.**

### The real failure: a node an arm invents becomes a citation

The checker fed `askV2` an `extraCandidateArmsFn` supplying a fabricated
`tenant:t9/session:GHOST` — absent from the tree, **foreign tenant prefix** — and it came back in
`sources.internal`, **with all 45 tests green.**

Path: the thunk → `router.ts`'s `internalSource`, which performs no membership check; and
`rrfMerge` is generic over `T`, so it *structurally cannot* perform one. I added a seam that admits
arbitrary nodes and then asserted everything about ordering and nothing about membership.

**I did not disclose this.** I disclosed the split, which was fine, and missed the gap, which was
not — and "citations resolve to real content" is the one promise this whole system is built on.

The checker also ruled it is **not** the caller's obligation, and I agree with the reasoning: the
ghost carried a foreign tenant prefix, and the contract's own invariant is that tenant scoping is
never a property of the caller behaving well. A retrieval arm is exactly what will later be fed by
a vector index over rows another tenant wrote.

### The fix, and the wrong fix it had to avoid

`collectNodeIds(tree)` — a local walk, since `packages/ask` may not import `packages/index` and a
membership set needs no tree library — and the merged candidates are filtered through it.

**Two mutations, because the cheap wrong fix would have passed the ghost test:**

```
MUTATION D  guard removed          (the ghost-citation shape)      -> 46 pass / 1 fail
MUTATION E  guard -> ignore-the-arms (the cheaper WRONG fix)       -> 45 pass / 2 fail
restored byte-identical · MUTATIONS CLEAN · clean run 47 pass / 0 fail
```

Mutation E matters more than D: silently dropping the extra arms would satisfy "no ghost reaches
the citations" while **disabling the entire feature**. A guard that passes by doing nothing is the
failure mode this project keeps finding, so it is pinned explicitly.

### Carried forward from the checker, not acted on here

- It found the **seventh** unreachable path across my units — but the three surfaces I flagged for
  it (`firstSeen`, empty-arm, vacuous ask-v2 tests) all came back **covered**. The uncovered one
  was the one I had not thought to flag.
- **Three contract improvements it deliberately did NOT apply**, on the grounds that amending a
  contract while its verdict is pending is softening: C2's `Verified-by` names a "resolver" the
  design need not contain; there is no vocabulary for a *legitimately deferred* criterion, so a
  correctly-scoped half-unit reads 8/11; and C7 clause 4 is policy rather than falsifiable. Worth
  a later amendment unit, by a checker.

## Cycle 3 — the same attack, one refinement sharper, and the PATTERN is the real finding

**Verdict:** FAIL, cycle 2, 8/11. The cycle-1 ghost is genuinely dead (the checker wrote its own
probe rather than running mine), and both mutations re-derived exactly — including E, the one that
catches a guard passing by doing nothing.

**But it broke the fix with a variant.** My guard compared the `node_id` **string**. So an arm
supplying a **real but unselected** id kept **its own object**, and `router.ts` copies
`node.evidence` verbatim — so a poisoned summary and **another tenant's `turn_id`** reached the
answer context, with all 47 tests green.

**Checking that an id is known says nothing about the object carrying it.**

### The checker named the pattern, and it is the most useful thing in this unit

> *the second consecutive [gap] sitting one refinement behind the pinned property — cycle 1 pinned
> ordering not membership; cycle 2 pinned id-membership not node-identity.*

That is exactly right, and it is a habit rather than two accidents. Each time I secured the
property I had just been shown, and each time the next attack lived one level in from it. Naming it
is worth more than either fix.

### The fix: RESOLVE, don't filter

The tree's own node is now **substituted** for whatever the arm supplied — `treeSearchFn` was
already injected doing this exact lookup, and ISS-157's own `fix_direction` had named it, which I
did not follow.

The principle, stated so the next arm inherits it: **an arm's job is to say WHICH nodes are
relevant. It has no authority over what those nodes CONTAIN.**

### ISS-159 — and the irony is worth recording

Dropped candidates were discarded **silently, four lines below the code that exists to make a
degraded run distinguishable from a healthy one.** ISS-157's `fix_direction` had asked for that
reporting; I implemented neither it nor a note saying why. An arm that keeps proposing unknown
nodes is a *broken* arm and must not look like a quiet one. Now logged as `ask.candidates_dropped`,
with a test that a clean run reports none — so the entry means something.

```
MUTATION G  resolve -> filter (the exact ISS-158 bypass)   -> 49 pass / 1 fail
MUTATION H  drop reporting removed (ISS-159)               -> 49 pass / 1 fail
restored byte-identical · MUTATIONS CLEAN · clean run 50 pass / 0 fail
pnpm -r typecheck = 0 · pnpm -r test = 0 · depcruise = 0
```

### Standing state

- **C6 and C7 remain the FIRST deferral** — the checker verified this rather than accepting it
  (zero hits for `extraCandidateArmsFn`/`rrfMerge` under `apps/`, no recall number in the commit).
  Cycle 1's condition still binds: **a second deferral would be accretion and should be failed.**
- **C8 met:** the cycle-2 test re-ran ISS-157's recorded reproduction **verbatim** (1/1 refused),
  no substituted corpus — D-015's rule.
- **This is fix cycle 3 of 3.** A further FAIL is `STALLED` and stops for the human, which is the
  right outcome if the next variant is one refinement further in again.

## Status: checked-PASS (part 1; C6/C7 deferred to part 2)

**Verdict:** `qa/verdicts/hybrid-merge.md` — **PASS**, cycle 3, 9/9 applicable criteria, 5/5
invariants, committed `266d09b`. `ISSUES-WRITTEN: none`.

**C2 is met, and not on my evidence** — the checker re-derived the cycle-2 exploit itself and
confirmed the poisoned summary and the foreign `tenant:t9/turn:X` are gone from the citation **and**
from the `scored[].node` objects the answer is built from.

### Why the pattern stopped, which is the real lesson

It applied the "one refinement in" lens deliberately and ran **six** attacks — fabricated `children`
on a legitimate arm node; duplicate `node_id` inside the tree; an arm returning the tree ROOT;
`__proto__`/`constructor` ids; tree mutation via shared reference. All blocked or correctly
admitted.

And it gave the structural reason rather than declaring victory:

> *the fix **replaces** the arm's object rather than validating it, so no field is left for a next
> attack to live in.*

**That is the difference from cycles 1 and 2.** Both earlier fixes *validated* something about the
arm's object and left the rest of it in play, so the next attack simply moved to a field I had not
checked. Replacement ends the class rather than the instance. Worth carrying to every future seam
that accepts caller-supplied data.

Two details it flagged as load-bearing rather than incidental: the `Map` (not a plain object) is
what blocks `__proto__` ids, and its own mutation-E-class probe now reddens **three** named tests
where cycle 2 reddened two — so the "silently disable the feature" wrong fix got harder to ship,
not just as hard.

### A manifest-writing nit I am recording rather than waving off

It noted I reported C8 with a by-id count for ISS-157 but gave **ISS-158/159 as prose** instead of
`ISS-158: 1/1 · ISS-159: 1/1`. It diffed the tests against the ledger rows itself and found both
recorded reproductions re-run verbatim, nothing substituted — so D-015's actual harm is absent. But
D-015 exists because *"a fix measured against a corpus its own author chose is marking homework with
an easier exam"*, and the by-id format is the part that makes that checkable by someone else. My
prose required the checker to do the diffing I should have made unnecessary.

### What part 2 owes

**C6 (tenancy) and C7 (the real hybrid recall number) are still the FIRST deferral** — verified, not
accepted. Cycle 1's condition binds part 2: **a second deferral of either is accretion and should be
failed as such.**

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
