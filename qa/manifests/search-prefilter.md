# Manifest — search-prefilter

**Contract:** qa/contracts/search-route.md (this changes how `GET /search` retrieves candidates;
the route's own behaviour and response shape are unchanged)
**Goal task:** none (sweep queue item #3, `c11515a`)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none filed — this is the sweep's queued follow-through on a ceiling
`search-route` disclosed in its own contract.

## Why — and why the obvious fix was the wrong one

The sweep queued this as: *"unbounded per-request `find({}).toArray()` in `createMongoSearchDeps`
(fine at 23 sessions, a cliff later, and U1.5 inherits it)"*. I could not verify that during the
last tick because production Mongo was unreachable, and deliberately did not build blind. That
turned out to matter: **when Mongo came back and I measured, both halves of the queued premise
were wrong.**

Measured against real data (2118 turns, tenant `toc`):

| | median |
|---|---|
| fetch all turns | **1064ms** |
| score in Node | **38ms** |
| bare round-trip (`countDocuments`) | 66ms |
| end-to-end `search()` | **1422ms** |

1. **It is not "fine now".** A single search already costs ~1.4s at the current tiny corpus.
2. **The obvious fix is worthless.** I had planned a `{_id, sessionId, text}` projection. Measured:
   **8% smaller payload**, because `text` IS the payload. It would have been an 8% fix for a
   1.4s problem, and the unit tests would all have passed.

The cost is **transfer, not computation** — scoring is 2.7% of the time. So the fix has to reduce
what crosses the wire, which means filtering server-side.

## The correctness trap this unit exists to avoid

A server-side pre-filter is only safe if it returns a **superset** of what the scorer could
score. I prototyped the natural one — a `$or` of case-insensitive regexes over the query's
content tokens, dropping tokens of length ≤ 2 — and **probed it against real data before writing
any production code.** Two real defects, both silent:

- `"AI in counselling"` → **10 hits collapse to 2.** `AI` and `in` are dropped, so turns matching
  only those are never fetched. Wrong results, no error.
- `"is it ok to go"` → **every token dropped** → `$or: []`, which **Mongo rejects outright**. A
  short-word question errors.

Keeping *all* tokens made every probed query identical. That is not a coincidence, it is a
property: `lexicalSearchTurns` scores a turn above zero only when a query token matches as a
**whole token**, and a **substring** filter is strictly more permissive — so it necessarily
returns a superset, and the extras score 0 and are dropped. The guarantee holds **only** if the
filter uses the scorer's own tokenizer, which is why this unit exports one rather than letting
the store re-derive tokens.

## What changed

1. **`packages/index/src/search/lexical.ts`** — new exported `lexicalQueryTokens(query)`, using
   the same private `tokenize` the scorer uses. Single source of truth for tokenization, which is
   what makes the superset property structural instead of coincidental.
2. **`packages/index/src/search/lexical.test.ts`** — 3 new tests, including
   **`PROPERTY: every turn the scorer can score is reachable by a substring pre-filter on these
   tokens`**, asserted over the whole scored set for 5 queries (including short-token and
   regex-metacharacter cases) rather than spot-checked on one.
3. **`apps/api/src/search-store.ts`** (new) — `createMongoSearchDeps` now builds a `$or` regex
   pre-filter from **all** query tokens, each **regex-escaped** (an unescaped user token is both a
   correctness and a DoS surface — Mongo compiles `$regex` as a real expression), and
   short-circuits to `[]` when there are no tokens, matching `lexicalSearchTurns`' own empty-query
   contract instead of inventing one.
4. **`apps/api/src/store.ts`** — search deps removed. **This was forced, not stylistic:** the
   added evidence comment pushed `store.ts` to **315 non-blank LOC over its 300 budget** and
   `lint-loc` failed. Rather than trim measured evidence to satisfy a budget, the deps moved to
   their own module — the same convention `ingest-store.ts` and `whatsapp-store.ts` already
   follow. `store.ts` is now **257**.
5. **`apps/api/src/production.ts`** — imports `createMongoSearchDeps` from the new module.
6. **`docs/SNAPSHOT.md`** — regenerated; gained exactly one line, `qa/gates/`, from the gate
   directory created last tick. Unrelated to this unit, but `lint:structure` gates freshness.

`packages/index/src/search/lexical.ts`'s scorer and `apps/api/src/routes/search.ts` are otherwise
**unchanged** — this unit changes only which candidates reach the scorer, never how they rank.

## A mistake I made and how it was caught

My first extraction script assumed `createMongoSearchDeps` appeared *before*
`createMongoGraphReadDeps` in `store.ts`. It was appended last, so the slice was empty and the
script **duplicated 170 lines of `store.ts`** instead of moving a block. `tsc` caught it
immediately (3 errors, implicit-any at line 453 of a file that should have been ~270). Recovered
with `git checkout -- apps/api/src/store.ts`, which was clean precisely because the file was
committed. Redone with an explicit `assert tail.count('export function') == 1` guard so the
script fails loudly if the block is ever not last. Recording it because "the recovery was free
because the work was committed" is the actual lesson.

## Evidence

`pnpm -r typecheck` — exit 0, all 10 workspace projects.
`pnpm --filter @lkb/index test` — **59/59** (56 pre-existing + 3 new).
`pnpm --filter @lkb/api test` — **89/89**, unchanged (this unit alters no route behaviour).
`pnpm lint:structure` — clean: `lint-loc` OK (238 files), `lint-dupes` OK, SNAPSHOT fresh at 116
lines, dependency-cruiser 0 violations across 260 modules.

**Mutation-tested with proof of application.** Reintroduced the exact defect found empirically —
`lexicalQueryTokens` filtering `length > 2` — confirmed the file content changed, re-ran:
**7/9 pass, and BOTH the short-token regression test AND the PROPERTY test reddened**, the
property test reporting precisely that a pre-filter would miss a scored hit. Restored → 9/9.

**Live proof against production Mongo** (read-only; script deleted immediately after). Compares
the new path against the old unbounded `find({})` path reimplemented in the same script, so the
comparison is against real behaviour rather than a remembered number:

```
IDENTICAL  "visa student university funding"  (10 hits)
IDENTICAL  "AI in counselling"                (10 hits)   <- broke the naive pre-filter
IDENTICAL  "is it ok to go"                   (10 hits)   <- broke the naive pre-filter
IDENTICAL  "UK visa"                          (10 hits)
IDENTICAL  "c++"                              (10 hits)   <- regex metacharacters
IDENTICAL  "zzzznonexistentqueryxyz"          (0 hits)
new search() latency: median 993ms  (was 1422ms)
RESULT PARITY ACROSS ALL QUERIES: YES
```

**Honest ceiling, stated plainly:** 1422ms → 993ms is a **~30% constant-factor win, not a fix.**
`turns` carries no text index (`_id_`, `tenantId_1`, `tenantId_1_sessionId_1` only), so this is
still an unindexed scan and remains O(corpus). A search costing ~1s at 2118 turns is not healthy;
plan §10's Phase-1 retrieval layer is where that gets solved properly. The value here is that
U1.5 no longer inherits a silent 1.4s, and the transfer-vs-compute split is now measured rather
than assumed.

## How to verify (checker)

1. Read `lexicalQueryTokens` — confirm it uses the scorer's own `tokenize` and drops nothing.
2. Read `search-store.ts` — confirm all tokens are used, each escaped, and the empty-token
   short-circuit returns `[]` rather than emitting `$or: []`.
3. Run `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (59/59),
   `pnpm --filter @lkb/api test` (89/89), `pnpm lint:structure` (clean).
4. Reproduce the mutation: make `lexicalQueryTokens` filter `length > 2`, confirm via a backup
   `diff` the file genuinely changed, re-run — **both** the short-token and PROPERTY tests must
   redden. Restore, confirm 9/9.
5. **Reproduce the live parity check yourself** against real Mongo, comparing the new path to a
   full `find({})` scan — do not trust the table above. Include at least one short-token query
   and one regex-metacharacter query; those are the cases that break naive implementations.
6. Judge the honest-ceiling claim: is a ~30% constant-factor win worth shipping when the real fix
   is a Phase-1 index, or should this have waited? I think shipping is right because U1.5 is
   specified to reuse this scorer and would otherwise inherit the unbounded fetch — but that is a
   judgment call, and disagreeing is reasonable.
7. Consider whether `qa/contracts/search-route.md` needs an amendment-log entry recording the
   measured numbers and the superset invariant (checker territory — the maker does not edit
   contracts).

## Risk / rollback

Read-only against the database; no writes, no schema change, no migration. Response shape and
ranking are provably unchanged (parity verified live on 6 queries). Reversible by `git revert`.
The one behavioural edge: a query whose tokens are all stripped now returns `[]` from the store
instead of scanning everything and returning `[]` anyway — same output, less work.

**Status: checked-PASS** — PASS from `qa/verdicts/search-prefilter.md` (Cycle checked: 1, matching Fix cycle 1), committed `8d0734c`. Closed out on the 2026-09-08 reconcile tick.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
