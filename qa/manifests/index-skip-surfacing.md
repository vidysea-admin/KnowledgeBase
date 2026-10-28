# Manifest — index-skip-surfacing
**Contract:** qa/contracts/ingest-indexing-pipeline.md
**Goal task:** U1.0b (the second half of `qa/QUEUE.md` row 1)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-116 (second defect — the concealment half)

## Why this unit exists

The sweep's queue row 1 named **two** defects in one unit, "because they are cause and
concealment". The `chunk-backfill` unit fixed the cause (Gemini's unbatched >100 call). This fixes
the concealment, which was still live at HEAD:

> `apps/api/src/indexing.ts` **discards** `writeSessionChunks`'s `{written, skipped}`, so
> `indexSession` reports success and no job row, session field or ledger records the loss.

That is precisely how three whole sessions — 790 of 2118 turns, **37% of the corpus** — stayed out
of the vector index while `status.index` said `"done"` for all 26. The only trace was a
`console.warn` nobody reads. A backfill script that happened to report per-session counts is not a
fix for that; the *pipeline* has to surface it.

## What changed

- `apps/api/src/indexing.ts` — `indexSession` now returns `IndexSessionResult`
  (`{sessionId, chunks: {written, skipped}}`) instead of `Promise<void>`, and no longer throws the
  chunk result away. Added `ChunkSkipReason`, which gains a third case: **`"no-embedder"`**, so an
  install with no embedding provider configured is distinguishable from one where embedding
  *failed*. Those need different human responses and previously looked identical (both: silence).
  **Returned, not thrown** — the degradation is deliberately non-fatal (an embedding outage must
  not cost the summary, claims and tree), so the caller needs a value to inspect, not an exception.
- `apps/api/src/indexing.ts` — `BoundIndexer` widened from `Promise<void>` to
  `Promise<IndexSessionResult>`, so the result survives the composition-root boundary rather than
  being erased by the type the ingest paths are wired through.
- `apps/api/src/ingest-store.ts` + `apps/api/src/whatsapp-store.ts` — both live ingest paths now
  inspect the result and warn explicitly that the session **"will not be reachable by vector
  search"**. This is the operator-facing surface; a return value alone would only help tests.
- `apps/api/src/indexing.test.ts` — 3 new tests asserting the result is surfaced for each of the
  three outcomes (failed / no-embedder / real write).

## How to verify (commands + expected)

- `pnpm --filter @lkb/api typecheck` → exit 0
- `pnpm --filter @lkb/api test` → exit 0, 124 pass (121 + 3 new)
- `pnpm -r typecheck` and `pnpm -r test` → exit 0
- structure gates individually by exit code (ISS-100 — the `&&` chain short-circuits)
- mutation: force `skipped` to `null` in the returned object → the 3 new tests must fail

## Actual outputs (from maker's own run)

```
pnpm --filter @lkb/api typecheck   exit=0
pnpm --filter @lkb/api test        ℹ tests 124  ℹ pass 124  ℹ fail 0
```

**Mutation proof (run after committing `2d44750`, since `mutate.mjs` refuses to arm a file that is
not byte-identical to HEAD):** forcing `skipped` to `null` in the returned object gives
**122 pass / 2 fail**, and the two failures are the new "surfaces an embedding failure" and
"reports 'no-embedder' distinctly" tests. **The third new test correctly stays green**, and that is
not a gap: it asserts `skipped === null` on a successful run, which this particular mutation makes
trivially true. Stating that rather than claiming 3/3 — a mutation that kills every test would mean
the tests were all asserting the same thing.

```
MUTATION ARMED: apps/api/src/indexing.ts
mutated: skipped forced to null
  -> tests 124  pass 122  fail 2
RESTORED: apps/api/src/indexing.ts (verified identical to HEAD)
MUTATIONS CLEAN: none outstanding
git diff --quiet HEAD -- apps/api/src/indexing.ts  -> clean
  -> tests 124  pass 124  fail 0
```

## Disclosed — the checker should press on these

1. **`BoundIndexer` is a widened public type.** Every consumer compiles, but a checker should
   confirm no caller silently depended on `Promise<void>` (e.g. in a union or a callback position).
2. **A `console.warn` is a weak surface and I am not claiming otherwise.** The sweep asked for the
   loss to be recorded "where an operator or a test can read it". The *test* half is now solid; the
   *operator* half is still only a log line. The genuinely durable options — a `jobs` ledger row, or
   a `gaps` row (that collection exists for exactly this), or a `sessions.status.vector` field —
   each need a schema change or a design decision, and I judged that out of scope for the
   concealment fix rather than smuggling a schema change into it. **If the checker disagrees, this
   is the right thing to FAIL me on**, and `gaps` is the option I would build next.
3. **This does not re-verify the corpus.** `chunk-backfill` already established 26/26 sessions on
   real rows; nothing here changes stored data, so I did not re-run the live probe and this unit
   should not be credited with it.
4. **`tracker-audit --gate g1` is still red at HEAD** (ISS-117, other lane's `U2.4` row), so
   `pnpm lint:structure` fails as a whole. Every other gate passes individually by exit code.

## Status: checked-PASS

**Verdict:** `qa/verdicts/index-skip-surfacing.md` — PASS, cycle 1, 11/11 criteria, committed
`a9f95a5`. `ISSUES-WRITTEN: ISS-118 (high), ISS-119 (low), ISS-120 (medium)`.

**The checker declined the FAIL I invited on disclosure #2 — and then made the point better than I
had.** Its reasoning for declining: the queue row asked for an operator **or** a test, the test half
is now mutation-proven, no contract criterion requires a durable record, and the discard actually
named in ISS-116 is gone. But it then ran a mutation I had not thought to run — **disabling the
`console.warn` on both ingest paths simultaneously left the suite at 124/0.** So the operator surface
is not merely "weak" as I described it; it is **untested and silently deletable**. That is a sharper
and more useful finding than the FAIL would have been, and it is filed as **ISS-118 (high)** with the
`gaps` row as the next unit.

It also verified — rather than accepted — my reasoning about the third mutation test staying green:
it asserts `skipped === null` **and** `written > 0`, and the mutation makes only the first trivially
true, leaving the second load-bearing. Correct, not a hole.

**ISS-120 was mine and is now fixed.** The checker found a *second* g1 failure that ISS-117's text
does not cover: `U1.0` was in `goal.json` with no `TASKS.md` row — I created that divergence in this
session by registering the task on one tracker only. Fixing it exposed a further defect in the audit
tool itself: its row regex allowed a letter suffix on `T-###` but not on `U#.#`, so `| U1.0b |` in
TASKS.md **did not match and G1 reported a divergence the tool had invented** — worse than a missed
one, because the honest fix (add the row) cannot clear it. Regex widened, two tests added
(`scripts/lib/tracker-audit.test.mjs`, 13/13).

**`lint:structure` is still red, and only the other lane can clear it.** After my fixes, the sole
remaining g1 findings are `U2.4`'s unknown status `"partial"` and its `pending`/`partial` divergence
— `lane/a-speakers`' row, mid-cycle. ISS-117 stands.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
