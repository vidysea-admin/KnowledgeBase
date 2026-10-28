# Manifest — search-prefilter-coverage

**Contract:** qa/contracts/search-route.md (invariant **[I6]**, added by the `search-prefilter`
checker: the filter's token set must be a superset of the scorer's)
**Goal task:** none (ledger-driven)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-072** (high). ISS-073 (low, Unicode) deliberately NOT addressed —
see "What this does not fix".

## Why

The `search-prefilter` checker PASSed the unit and then demonstrated that its central correctness
property was **unenforced**: it reintroduced the exact `length > 2` defect the design exists to
prevent — *in `search-store.ts`, the file that actually ships it* — and **typecheck plus all 148
tests stayed green.**

That is a fair hit, and it is the second time this session I have shipped a correctness property
without pinning it (ISS-069: `countDocuments` added to `scopedCollection` with no test, caught the
same way). The shape is identical both times: I tested the *primitive* and not its *consumption*.
`lexical.test.ts` pinned `lexicalQueryTokens` inside `packages/index`; nothing pinned that the
shipping file consumed it correctly. A property nothing can fail on is documented, not enforced.

The checker made closing this a condition before U1.5 builds on this seam. Agreed — a seam whose
documented purpose is being reused without re-review is the worst place to leave an unpinned
invariant.

## What changed

1. **`apps/api/src/search-prefilter.ts`** (new) — the filter construction extracted out of
   `search-store.ts`, exactly the `health-probe.ts` precedent (extract so the property becomes
   reachable by a test). Exports `buildTurnPrefilter(query)`, `escapeRegex`, and
   `prefilterMatches(filter, text)` — the last so tests can evaluate **the real filter object**
   rather than re-deriving what they think it should be.
2. **`apps/api/src/search-store.ts`** — now calls `buildTurnPrefilter` and short-circuits on
   `null`. No behaviour change; the construction simply moved somewhere a test can reach it.
3. **`apps/api/src/search-prefilter.test.ts`** (new, 7 tests) — led by
   **`PROPERTY: the filter the store actually builds is a superset of what the scorer can score`**,
   which asserts over the whole scored set for 6 queries against the real filter object.

I also wrote the checker's **[I6]** refinement into the module header, because it is stricter than
what I originally claimed and the difference is load-bearing: the requirement is
`filterTokens ⊇ scorerTokens` — **adding** tokens is safe, **removing** any breaks it. "Share a
tokenizer" reads as though symmetric changes are fine, and they are not: adding a stopword filter
to *both* sides still changes answers, because the scorer would then score turns the filter never
fetched.

## A wrong assumption of mine, caught by my own new test

My first draft asserted that `buildTurnPrefilter("a.c")` must not match `"abc"` — i.e. that
`escapeRegex` is what makes metacharacter queries safe. **The test failed, and it was right to.**
`tokenize` splits on `\W+`, so `"a.c"` never becomes one literal token; it becomes `["a","c"]`,
which legitimately matches `"abc"`.

The real consequence is worth stating rather than quietly patching: **`escapeRegex` cannot receive
a metacharacter from this path at all** — tokens are always `[A-Za-z0-9_]+`. It is defence-in-depth
for a path the current tokenizer makes unreachable. I kept it (the day tokenization preserves
punctuation it becomes load-bearing with no other warning) and replaced the wrong test with two
honest ones: a direct unit test of `escapeRegex`, and a test asserting every token reaching Mongo
matches `^[A-Za-z0-9_]+$` across metacharacter-laden queries.

## What this does not fix

**ISS-073 (low) is deliberately left open.** JS `toLowerCase()` does full Unicode case mapping;
Mongo's `$options: "i"` is ASCII-only, so a turn containing `U+0130` or `U+212A` could be scored
but not matched. The checker measured **0 occurrences in 2118 turns**, and a real fix needs
Mongo-side collation rather than a tweak here. Recorded as a stated bound on [I6] in the module
header rather than papered over. Fixing it now would be speculative work against zero evidence.

## Evidence

**The decisive test — the checker's own attack, replayed.** Reintroduced `length > 2` in
`buildTurnPrefilter` (the shipping path), confirmed the file content changed:

| | before this unit | after this unit |
|---|---|---|
| `search-prefilter.test.ts` | *(did not exist)* | **3 of 7 fail** |
| full `@lkb/api` suite | **148 pass, 0 fail** (defect invisible) | **93 pass, 3 fail** |

Restored → 96/96. The gap ISS-072 records is closed with proof, not assertion.

`pnpm --filter @lkb/api test` — **96/96** (89 pre-existing + 7 new).
`pnpm --filter @lkb/index test` — 59/59, untouched.
`pnpm -r typecheck` — exit 0, all 10 projects.
`pnpm lint:structure` — clean; dependency-cruiser 0 violations across 262 modules.

**Live proof against production Mongo** (read-only; script deleted after), confirming the
extraction changed no behaviour — compared against the old unbounded `find({})` path
reimplemented in the same script:

```
IDENTICAL  "visa student university funding"  (10 hits)
IDENTICAL  "AI in counselling"                (10 hits)
IDENTICAL  "is it ok to go"                   (10 hits)
IDENTICAL  "UK visa"                          (10 hits)
IDENTICAL  "c++"                              (10 hits)
IDENTICAL  "zzzznonexistentqueryxyz"          (0 hits)
RESULT PARITY ACROSS ALL QUERIES: YES
```

**On latency, the checker corrected me and I accept the correction.** I reported 1422ms → 993ms
(~30%); it measured 852ms → 708ms (~17%) using interleaved runs, which is the sounder method —
mine were sequential blocks and absorbed warm-up and network variance. This run showed 609ms.
The honest statement is: **the direction is consistent and the mechanism is understood, but the
magnitude is not a stable constant** — it moves with network conditions to a remote host. It
remains a constant-factor win on an unindexed scan, not a fix.

## How to verify (checker)

1. Read `search-prefilter.ts` — confirm `buildTurnPrefilter` filters no tokens, and that [I6] is
   stated in its superset form (adding safe, removing unsafe), not as "share a tokenizer".
2. Read `search-store.ts` — confirm it delegates and no longer constructs the filter inline.
3. **Replay the checker attack that motivated this unit**: add `.filter(t => t.length > 2)` to
   `buildTurnPrefilter`, confirm via a backup `diff` the file changed, then confirm
   `search-prefilter.test.ts` fails (expect 3 of 7) **and** the full `@lkb/api` suite fails
   (expect 93/96) — the point is that the full suite no longer stays green. Restore, confirm 96/96.
4. Run `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (59/59), `pnpm lint:structure`.
5. **Reproduce live parity yourself** against real Mongo, including a short-token query — do not
   trust the table above.
6. Judge the ISS-073 deferral: is leaving a known (if unreachable) correctness hole open, recorded
   as a bound, the right call versus fixing it now? I think yes at 0/2118 occurrences, but it is a
   judgment call and disagreeing is reasonable.
7. Judge whether the `escapeRegex`-is-unreachable finding should itself be filed — it means a
   guard the previous manifest presented as a safety property is currently inert.

## Risk / rollback

Pure refactor plus tests; read-only against the database; response shape and ranking provably
unchanged (live parity on 6 queries). Reversible by `git revert`.

**Status: checked-PASS** — PASS from `qa/verdicts/search-prefilter-coverage.md` (Cycle checked: 1, matching Fix cycle 1), committed `af8a346`. Closed out on the 2026-09-08 reconcile tick.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
