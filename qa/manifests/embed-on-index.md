# Manifest — embed-on-index

**Contract:** qa/contracts/ingest-indexing-pipeline.md (+ `schema-v2.md` **C8**, which the U1.2
verdict bound to this unit)
**Goal task:** **U1.3** (plan §10 Phase 1)
**Date:** 2026-09-08
**Fix cycle:** 2 of max 3
**Dual check:** no
**Issues addressed:** none — roadmap work. Closes contract **C8**'s write-side half.

## The design point, and it was already paid for once

`indexSession` writes claims with a **conditional delete**, because ISS-056 taught this codebase
that an unconditional `deleteMany` plus a conditional `insertMany` destroys real data the moment a
provider blips: a failed call returned an empty array indistinguishable from *"this transcript has
no claims"*, so a transient outage deleted every previously-extracted claim and wrote nothing back.

**Chunks carry the same shape with more force.** A vector index is expensive to rebuild and its
absence is **invisible** — a search does not error, it just quietly returns less. So the chunk
delete only ever runs with a replacement already in hand, and an embedding failure is caught,
logged, and left alone.

**It also must not take the rest of indexing down.** Rethrowing would turn *"no vectors this run"*
into *"no summary, no claims, no tree"* — trading a recoverable gap for a total one.

## What changed

1. **`apps/api/src/indexing.ts`** — `embed?: IndexEmbedFn` on `IndexSessionDeps`, **optional**: an
   install with no embedding provider must still summarize, extract claims and build a tree.
   Absent dep ⇒ chunks skipped entirely, every other stage unaffected. Chunks are built with
   `buildChunks`, embedded in one batch, and written delete-then-insert **only on success**.
2. **The write-time correlation assertion C8 needs.** The U1.2 verdict found that `vector` and
   `dims` are *independently optional* in JSON Schema, so `{vector: [3 items], dims: 99}` validates
   cleanly. JSON Schema cannot express the correlation; the write is the only place that sees both.
   Two refusals: wrong vector **count** for the chunk list, and any vector whose length contradicts
   the batch's `dims`.
3. **`apps/api/src/production.ts`** — `embed` wired **only when `chains.embedding` exists**.
   Passing an embedder unconditionally would break indexing on an install without one.
4. **`packages/index/src/index.ts`** — exports `buildChunks`.
5. **`TASKS.md`** — U1.2 flipped to `done`; see below.

## Evidence — by exit code, not by grepping output

| gate | result |
|---|---|
| `pnpm -r typecheck` | **EXIT 0** |
| `pnpm -r test` | **EXIT 0** — `@lkb/api` 109 → **117** (8 new) |
| `pnpm lint:structure` | **EXIT 0**, depcruise ran: **0 violations, 275 modules / 838 deps** |
| `python schema/validate.py` | **EXIT 0** |

The 8 tests are the failure modes, and the first two are the ones that matter:

- **a failed embed writes nothing at all to `chunks`** (the ISS-056 shape, on the collection where
  it would be hardest to notice);
- **a failed embed still leaves claims written and the tree updated** (no total-failure trade);
- no `embed` dep ⇒ chunks untouched, every other stage still runs;
- success ⇒ `deleteMany` **before** `insertMany`, so a re-index never doubles the corpus;
- rows carry a real `vector`, a matching `dims`, `turnRefs` — and assert **no `text`** (ADR-0001)
  and **no `embeddingRef`** (the retired pointer);
- the two C8 refusals; and every chunk write is **tenant-scoped**.

**A test bug I caught and fixed rather than weakening the assertion:** my first two refusal tests
passed a single-turn fixture, which yields one chunk — so neither mismatch could arise and both
"failed" with *"Missing expected rejection"*. The fix was to shape the fixtures so the condition is
actually reachable (2 vectors for 1 chunk; a 2-number vector against `dims: 3`), not to relax the
test.

## What is NOT verified, and it is the important half

**No live row has been written.** Mongo has been unreachable for four consecutive ticks
(`Server selection timed out`), so contract **C8**'s two row-level checks — *"chunks non-empty for
all 26 sessions"* and *"`vector.length === dims` for 100% of rows"* — are **UNVERIFIED**, not
passed. Everything above is fake-db evidence about write *decisions*.

I am flagging this rather than letting the unit read as complete: the U1.2 verdict moved those
checks here specifically so they would stop living in prose, and they cannot be discharged while
the database is down. **C8 should stay open until a live run.**

## Also in this commit, disclosed

`lint:structure` was exiting 1 on G1 — the U1.2 checker closed `goal.json` but not `TASKS.md`,
exactly as the U1.1 checker did an hour earlier. Flipped `TASKS.md` U1.2 to `done`. **Second
occurrence**, so it is logged as a pattern in `qa/feedback-inbox.md`: a gate that fires predictably
on every single PASS is one people learn to clear reflexively rather than read.

## How to verify (checker)

1. **Re-run every gate by exit code.** Two units ago I reported "clean" from a grep while the
   chain had short-circuited; do not repeat my mistake on my behalf.
2. **Attack the degrade-safe guard.** Make `embed` throw, reject, return `undefined`, hang — and
   confirm `chunks` sees **zero** operations in each case, while claims and tree still complete.
   The dangerous direction is a delete that runs anyway.
3. **Attack the C8 assertion.** Vectors of differing lengths, a `dims` that matches none of them,
   more/fewer vectors than chunks. Anything that reaches `insertMany` with an inconsistent
   `vector`/`dims` pair is a real finding — that combination validates against the schema.
4. **Confirm the tenant scoping** on the chunk `deleteMany` — an untenanted delete would reach
   another tenant's rows, which is the security-class failure this project has already paid for.
5. **If Mongo is up for you, run C8 for real** and say so; if not, record UNVERIFIED. Do not
   convert a timeout into a verdict in either direction.
6. Confirm `production.ts` passes `embed` only when a chain is configured, and that an install
   without one still indexes.
7. `ISSUES-WRITTEN: none` is a complete check.

## Risk / rollback

One optional dep, one guarded block, one config-conditional wiring. No existing stage's behaviour
changes when `embed` is absent, which is every current deployment until a chain is configured.
`git revert` is clean.

**Status: checked-PASS** — PASS from `qa/verdicts/embed-on-index.md` (Cycle checked: 1), committed
`6577a8b`. **8/8 criteria, 4/4 invariants.** Goal task **U1.3 closed (61%)**. C8's row-side stays
**OPEN** and is now a ledger row (**ISS-113**) rather than a promise in prose.

**It built a 12-turn fixture specifically to avoid inheriting my blind spot.** My own refusal tests
had used a single-turn fixture — a bug I caught and disclosed — so it used 12 real chunks and ran
**nine** attack shapes: throw, reject, `undefined`, a malformed object with no `vectors` key,
2-for-1, 1-for-12, `dims: 99` matching nothing, an empty vector at index 1, and ragged vectors
**where index 0 matches `dims`**. That last one is the shape a `vectors[0]`-derived check would
miss. `chunks` saw **zero operations in all nine**, claims written in all nine.

Its structural point is better than my defence of it: *"the delete sits positionally inside the
success branch, so the ISS-056 shape is structurally impossible, not merely remembered."*

**Tenant scoping verified by mutation, not by reading** — swapping `chunksColl(tenantId)` for the
raw handle reddens exactly one test. It also noticed that the general "every write is
tenant-confined" test survives that mutation because it runs *without* `embed`: coverage is
complete via the dedicated test, but **that test's name over-promises**. Recorded.

### ISS-112 (medium) — my guarantee contradicts my own code placement

> *"The C8 assertions throw **outside** the try/catch … so P4–P9 skip chunks correctly **and** skip
> `tree_index` and the `status.index` flip … leaving the session permanently `pending` and absent
> from the Brain tree. That is precisely the trade the code comment and manifest say they refuse."*

Accepted without qualification. My comment says rethrowing *"would turn 'no vectors this run' into
'no summary, no claims, no tree'"* — and then I placed the assertions where they do exactly that.
The `try` wraps only `deps.embed(...)`; the assertions sit after it. **A guarantee stated in a
comment and contradicted by the line numbering is worse than no comment**, because it stops the
next reader from checking.

**Medium rather than high because the checker chased reachability rather than assuming it:**
`gemini.ts` and `ollama.ts` already refuse wrong-count, empty and ragged batches *inside*
`deps.embed`, where the catch handles them — so with today's `embedding: [gemini, ollama]` chain
the path is not live-reachable. It becomes reachable the moment a provider without those guards
joins the chain, which is precisely what an optional-`embed` seam invites.

**Fix is one line of scope** — move the assertions inside the same `try`. Pulled as the next unit
rather than folded into this close-out, since the maker cannot certify its own fix.

### ISS-113 (medium, tracking) — C8's row side survives as a row

It did not trust the ping: real driver, `serverSelectionTimeoutMS: 8000`, `Server selection timed
out`. So (a) 26-session non-emptiness, (b) `vector.length === dims` **as rows**, and (c) `turnRefs`
resolution are unverified — and it noted **(c) is not asserted at write time at all**, which I had
not spotted. Filing it as a ledger row is the right move: it makes the deferral survive this
close-out instead of living in a manifest nobody re-reads.

**Noted, not filed:** there is no timeout on the `embed` call, so a hang stalls `indexSession`
forever — the same shape as `complete()` one screen up, and therefore a transport-layer unit's
problem rather than this one's.

---

# Fix cycle 2 — ISS-112, folded back into this unit

The cycle-1 verdict PASSed and filed **ISS-112 (medium)**. I am fixing it here rather than as a
separate unit because it is the *same file, same guarantee* — and because the guarantee is
currently **stated and false**, which is the part that matters more than its reachability.

> *"The C8 assertions throw **outside** the try/catch … so P4–P9 skip chunks correctly **and** skip
> `tree_index` and the `status.index` flip … That is precisely the trade the code comment and
> manifest say they refuse."*

**What changed:** the assertions moved **inside** the same `try` that wraps `deps.embed(...)`, and
the `catch` comment now says explicitly that it covers them. So a contradictory batch is handled
identically to a provider outage: chunks left unchanged, everything else completes.

**Why I did not leave it as a medium for a later unit.** The severity gate says medium is verified
inside the next unit touching the same file — but nothing else is scheduled to touch
`indexing.ts`, and the defect is a comment that *contradicts its own line numbering*. A future
reader who checks the guarantee against the code would have found it false; one who trusted the
comment would have shipped a provider without in-adapter guards straight into the failure. The
checker was right that it is not live-reachable today; it is reachable the moment the chain gains a
member without `gemini.ts`/`ollama.ts`'s own refusals — which is exactly what an *optional* `embed`
seam invites.

**The tests changed shape, deliberately.** Both refusal tests previously asserted
`assert.rejects(...)` — they were pinning the *throw*, which is the behaviour ISS-112 says is
wrong. They now assert the **guarantee**: zero chunk operations, **and** `tree_index` still
written, **and** the `status.index` flip still applied. Pinning a throw that should not happen is
how a defect gets a regression test protecting it.

## Cycle-2 evidence — by exit code

| gate | result |
|---|---|
| `pnpm -r typecheck` | **EXIT 0** |
| `pnpm -r test` | **EXIT 0** — `@lkb/api` **117**, unchanged count, two rewritten |
| `pnpm lint:structure` | **EXIT 0** |
| `python schema/validate.py` | **EXIT 0** |

## Still open, unchanged by this cycle

**ISS-113** — C8's row-level half (26-session non-emptiness, `vector.length === dims` as rows,
`turnRefs` resolution) remains **UNVERIFIED**; Mongo has now been unreachable for five ticks. The
checker also noted **`turnRefs` resolution is not asserted at write time at all**, which I had not
spotted and which no fake-db test can cover.

## How to verify (cycle 2)

1. **Re-run your nine attack shapes** — all must now leave `chunks` untouched **and** complete
   `tree_index` + the status flip. Previously P4–P9 skipped both.
2. Confirm the assertions are inside the `try` and that the `catch` genuinely catches them —
   the one-line-of-scope claim.
3. Confirm the two rewritten tests would **fail** if the assertions were moved back out. That is
   what makes them a regression test rather than documentation.
4. All four gates by exit code.
5. `ISSUES-WRITTEN: none` is a complete check.

**Status: checked-PASS** — PASS from `qa/verdicts/embed-on-index.md` (Cycle checked: 2), committed
`0b8ad7b`. **8/8 criteria, 5/5 invariants, `ISSUES-WRITTEN: none`.** ISS-112 → `fixed`.
**C8 and ISS-113 stay OPEN** — Mongo down a sixth consecutive tick.

**It proved the rewritten tests are a guard, not documentation** — the check I most wanted. It armed
`mutate.mjs`, reintroduced ISS-112 *minimally* (re-narrowing the `catch` so assertion errors escape
while provider failures stay caught), and got **15 pass / 2 fail — and the two failures are exactly
the two rewritten tests**, nothing else in the file. Restored byte-identical. That is the
difference between a test that describes behaviour and one that defends it.

**On the fold it ruled correct, and drew the general line** rather than just answering this case:
folding is legitimate on *same file, same guarantee, new numbered cycle, fresh checker* — and
illegitimate if used to slip **new scope** into an already-PASSed unit. It noted the evidence bar
*rose* rather than fell, since cycle 1 had passed on tests that pinned the defective behaviour. Its
closing point is the one to remember: **deferring a medium to "the next unit touching this file"
when no such unit is scheduled is how a medium becomes permanent.**

**It corrected an error of its own from cycle 1**, unprompted: both its cycle-1 verdict and
ISS-112's evidence say the 12-turn fixture yields "12 chunks" — it yields **3**, because
`buildChunks` packs them. Its own cycle-2 probe failed on that bad assertion before it caught it.
Conclusions unaffected (3 chunks still make every index-1 shape reachable), and the verdict now
says so wherever the figure appears.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 2 status statement(s) in this file, which agree
