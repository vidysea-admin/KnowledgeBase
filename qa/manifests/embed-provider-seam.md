# Manifest — embed-provider-seam

**Contract:** qa/contracts/ai-provider-seam.md
**Goal task:** **U1.1** (plan §10 Phase 1) — the first roadmap-tier unit this loop has reached.
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** none — roadmap work, not a defect.

## Why this unit, and why now

Backlog tiers 1–2 are empty for the first time (0 open critical/high), so D-014's priority reaches
**tier 3, the roadmap**. `U1.1` is its head: `U1.2`–`U1.5` (chunking, embed-on-index, cosine
retrieval, hybrid merge) all block on it, and `packages/index/src/vector/` does not exist.

## What changed

1. **`packages/ai/src/provider.ts`** — `EmbedJob` / `EmbedResult`, and `embed?()` on `Provider`.
   **Optional, deliberately.** claude-code runs a CLI and Anthropic ships no embedding API;
   requiring it would force four adapters to implement a method that throws, which is a worse lie
   than not implementing it. Plus `canEmbed()` so callers test capability instead of duck-typing.
2. **`providers/gemini.ts`** — `batchEmbedContents` over the **existing** `Transport`, so this is
   one more HTTP shape rather than a second SDK, and the existing fake covers it.
   `RETRIEVAL_QUERY` vs `RETRIEVAL_DOCUMENT` by `purpose`.
3. **`providers/ollama.ts`** — `/api/embed`, same seam. This is the member that keeps `goal.md`'s
   *"never leak the corpus into a public model"* reachable: chunking the whole transcript corpus is
   the largest volume of Vidysea text that would ever leave the building, and here it need not.
4. **`router.ts`** — `embed(jobKind, job, config)`, same chain and ledger as `complete`, one
   difference: a provider without `embed()` is **skipped, not failed**.
5. **`config/ai-routing.yaml`** — `embedding: [gemini, ollama]` (D-005 Gemini-first, D-b chain).

## The two failure modes I coded against

Both corrupt a similarity search *silently*, which is what makes them worth refusing rather than
tolerating:

- **A short response.** Two texts, one vector. Zipping those by index attaches chunk B's meaning to
  chunk A's id, and every later search is subtly wrong with nothing to show for it. Both adapters
  throw instead.
- **A ragged response.** Differing lengths cannot be compared by cosine at all, so `dims` would be
  a fiction. Both adapters throw.

And at the router: **no capable provider is an error, not an empty result.** Returning zero vectors
would look exactly like a corpus with nothing in it — an index build that *succeeds* while
producing nothing is the hardest failure to notice.

## Evidence

**Live, against the real API** (the plan's "one real call per configured provider recording actual
dims"):

```
LIVE gemini embed: 2 vectors | 3072 dims | model gemini-embedding-001 | 0.8s
query purpose    : 3072 dims
cosine(doc0,doc1): 0.8178   (<1, so distinct sentences give distinct vectors)
```

**11 new tests, all attacks on the contract** — batching (2 texts ⇒ 1 call), order preservation,
`taskType` switching, short-response refusal, ragged refusal, empty batch costs **no call**,
`canEmbed` discrimination, router skip-not-fail, router fallback past a throwing provider, and
"no capable member ⇒ throws".

`pnpm -r test` — **380 passing, 0 failing** across all 8 packages (`@lkb/ai` 56 → **67**).
`pnpm -r typecheck` exit 0 · `pnpm lint:structure` clean, depcruise **0 violations / 269 modules**.

## What this does NOT do

- **No vectors are stored.** `chunks` still has no `vector` field — that is `U1.2`, which must edit
  `schema/chunks.schema.json` (today it holds `embeddingRef`, a *string pointer*, which
  brute-force cosine cannot use).
- **Nothing calls `embed()` in production yet.** Wiring it into `indexing.ts` is `U1.3`.
- **Ollama's live path is untested.** The daemon is reachable here, but `nomic-embed-text` may not
  be pulled; the adapter is covered by fake-transport tests only. Stated rather than implied — the
  last unit's lesson was that "all paths tested" claims must name the path that wasn't.

## How to verify (checker)

1. `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint:structure`.
2. **Attack the batching claim**: confirm N texts produce exactly ONE transport call, and that an
   empty batch produces **zero** (an empty array must never hit a paid endpoint).
3. **Try to make a wrong pairing survive.** Return fewer/more vectors than texts, or mixed lengths,
   and confirm both adapters refuse. If you can get a plausible-but-mispaired result through, that
   is a real finding.
4. **Reproduce the live call** and record the dims you observe — 3072 is a claim about the API, not
   a constant in our code, and it is the number `U1.2`'s schema will have to match.
5. **Judge `embed` being optional.** The alternative is a required method that throws on four
   adapters. Is skip-not-fail right, or does it hide a misconfigured chain?
6. Confirm nothing claims a vector index exists — this is the seam only.
7. `ISSUES-WRITTEN: none` is a complete check.

## Risk / rollback

Additive: one optional interface method, two adapter methods, one router function, one config line.
No existing behaviour changed; no product code calls any of it yet. `git revert` is clean.

**Status: checked-PASS** — PASS from `qa/verdicts/embed-provider-seam.md` (Cycle checked: 1),
committed `69c6b5f`. **8/8 contract criteria, 3/3 invariants**, 7/7 manifest items reproduced. Goal
task **U1.1 closed** (progress 57%).

**It wrote its own probe rather than re-running my tests** — nine mispairing attacks across both
adapters (fewer vectors, more vectors, ragged, an entry missing `values`, the `embeddings` key
absent). All nine threw. It independently confirmed **3072 dims** with its own transport and
sentences, and checked the semantics actually work: the query scored **0.727** against the relevant
sentence vs **0.563** against an irrelevant one.

**It verified the "does NOT do" section exactly rather than approximately** — including my weakest
claim. I said Ollama's live path was untested; it went and found *why*: the daemon is up with
`qwen3:8b`, and `POST /api/embed` with `nomic-embed-text` returns **"model not found, try pulling
it first"**. That is a better disclosure than the one I wrote.

**On the design call it ruled CORRECT, and closed the question I actually had.** A typo'd provider
name throws in `route()` *before* capability is consulted, so a misconfiguration and an incapable
provider stay distinct failures; a chain of entirely incapable providers throws and names each
skip. It also endorsed the ledger semantics for a reason I had not articulated: a skip consumed no
provider, no tokens and no cost, so recording it as `failed` would inflate the very failure rate
the ledger exists to report.

### Two issues filed, both mine

- **ISS-096 (medium)** — the degenerate case my guards miss: N texts in, N **empty** vectors back
  returns `{dims: 0}` instead of throwing. Both guards are *relative* (count vs count, length vs
  `length[0]`) and neither has a **floor**. Pairing stays correct, so this is not the mispairing
  failure — and nothing can be corrupted today because nothing stores vectors. **It must close
  before U1.3**, or a dims-0 batch would make every later cosine degenerate while the index build
  reports success. One line per adapter; the next unit touching this path owns it, per D-014's
  severity gate.
- **ISS-097 (low)** — my comment at `router.ts:98` says a skip "is recorded as an attempt so the
  ledger still explains where a request went". **It is not.** It lives only in the thrown error,
  and on a *succeeding* chain leaves no trace at all. Behaviour right, sentence wrong — the same
  class as ISS-091/094: prose asserting something the code does not do.

### The contract amendment, and the restraint in it

It added **C9** (the embedding sub-seam) and **[I4]** (a batch is never silently mispaired), because
the contract predated the seam and U1.2–U1.5 would otherwise be judged against one blind to their
foundation. It **deliberately did not** add a `dims > 0` criterion, on the grounds that *writing a
new criterion to fail the unit in front of you distorts the gate as surely as softening one would*.
That is the right call and worth recording as precedent — the gap lives in ISS-096 instead.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
