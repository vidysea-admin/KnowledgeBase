# Manifest — summarize-degradation-honesty

**Contract:** qa/contracts/ingest-indexing-pipeline.md, criterion 1a (added last cycle, ruling on
this exact bug).
**Goal task:** none (ledger-driven unit)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-059

## Why

`summarizeSession` returned a bare `SessionSummaryResult`, so a rejected `complete()` call or an
unparseable response was indistinguishable from a genuine success — same shape as ISS-056's claims
bug, one file over. `indexSession` then ran `deleteMany`-then-`insertOne` on `session_pages`
**unconditionally**, so a transient provider outage during a re-index silently replaced a real,
previously-written summary with the labelled `"(fallback, LLM summary unavailable) <500-char
transcript slice>"`, and `status.index` still flipped to `"done"` as if nothing had gone wrong.

This was disclosed by the maker in the ISS-056 manifest and deliberately not fixed there — "the
contract explicitly requires that fallback" was true but incomplete, and contracts are
checker-owned. The checker ruled the maker right on both counts and added **criterion 1a**: the
fallback may exist for a session with no page yet; it may not replace one that does. This unit
builds exactly that, same template as the accepted ISS-056 fix.

## What changed

1. **`packages/index/src/pipeline/summarize.ts`** — `summarizeSession` now returns
   `SummarizeResult { page, degraded }`. `degraded` is set for a rejected `complete()` and for an
   unusable/missing-summary response; it is `null` for a genuine success and for the zero-turns
   `"(no content to summarize)"` case (an honest empty result, not a failure — same distinction
   `claims.ts` draws).
2. **`packages/index/src/index.ts`** — exports the new `SummarizeResult` type.
3. **`apps/api/src/indexing.ts`** — on a degraded summarize, checks whether a real `session_pages`
   doc already exists for the session **before** touching anything. If one exists, it is left
   exactly as it was (a `console.warn`, no delete, no insert). If none exists, the labelled
   fallback is written as before — criterion 1 still requires the fallback to exist for a fresh
   session. A non-degraded run keeps the unconditional replace: a genuinely fresh summary always
   supersedes an older one, fallback or not.

## Real evidence

### Mutation, proven applied, caught two ways

```
MUTATION: `const existingPage = summaryDegraded ? await ... : null;` -> `const existingPage = null;`
          (the guard's own lookup disabled, forcing every degraded run down the unconditional-
          replace branch — the exact ISS-059 bug). Confirmed present via grep before running.

BEFORE this fix (the bug): 75/75 GREEN (this is what "silent" means).
AFTER this fix: 73/75, 2 RED —
  "no existing page -> the fallback is written as normal"                    (op-sequence test)
  "a DEGRADED summarize run with a REAL existing page must NOT touch it"    (op-sequence test)
```

Mutation reverted; `git diff apps/api/src/indexing.ts` clean of the mutation marker afterward.

### New tests (4, `apps/api/src/indexing.test.ts`)

- a degraded run with **no** existing page still writes the fallback (criterion 1 preserved)
- a degraded run **with** a real existing page issues **no write of any kind** to `session_pages`
- a successful run **always** replaces the page, even when one already exists (the other half — a
  guard that refuses ALL replacement would be just as broken)
- a degraded **summarize** run does not take the **claims** write down with it (paths independent,
  mirroring the existing degraded-claims-doesn't-affect-summary test from the ISS-056 unit)

`packages/index/src/pipeline/summarize.test.ts`'s 5 existing tests were rewritten for the new
`{page, degraded}` shape, not narrowed — each now also asserts the `degraded` field explicitly.

### Suites

```
packages/index  40/40   (test count unchanged — 5 rewritten, not added, for summarize.ts)
apps/api        75/75   (was 71: +4 — the new ISS-059 write-decision tests)
Total 339, 0 fail.
pnpm -r typecheck -> all 10 projects Done.
```

## Disclosed limitation — the live proof did NOT run this time, and here is the actual evidence

Following the precedent set for ISS-056/ISS-060 (both closed with a live two-tenant proof against
the real database), I wrote an equivalent live script: seed a real `session_pages` doc, re-index
with a failing `complete`, confirm the summary survives unchanged. **It failed to connect twice in
a row** — `Server selection timed out after 15000 ms` — against `mongodb://13.202.206.101:27017`,
which this session has already established is real but genuinely flaky (ISS-056's manifest wrongly
called it unreachable once; the checker proved it reachable; this run is a real, reproducible
timeout, not the same probe-was-broken mistake — the TCP driver itself timed out server selection,
not a raw socket probe).

This is disclosed rather than silently skipped or claimed successful. The mutation-tested unit
evidence above is real, load-bearing evidence on its own — it is what caught the checker's own
`$set`/`$unset` gaps in the last two units without any live database at all — but it is not the
same strength as a live proof, and the checker should retry the live path if Mongo answers by
check time. The script is saved in this session's scratchpad
(`live-summary-proof.ts`) and can be handed over or rewritten.

## How to verify (for the checker)

1. Reproduce the mutation yourself (disable the `existingPage` lookup) and confirm both new tests
   redden.
2. Confirm the distinction is right in both directions: a degraded run with no page writes the
   fallback; a degraded run with a real page writes nothing; a successful run always replaces.
3. If Mongo is reachable at check time, do the live proof I could not: seed a real summary, degrade
   the re-index, confirm it survives.
4. `pnpm -r test` (339), `pnpm -r typecheck` clean.
5. Confirm `packages/index`'s existing 5 summarize tests weren't weakened by the rewrite — each
   still asserts the same summary content, plus the new `degraded` field.

## Status: checked-PASS

**Verdict:** `qa/verdicts/summarize-degradation-honesty.md` — **PASS**, `Cycle checked: 1`, commit
`ec323da`. 1/1 criterion met.

### What the checker ruled

1. **Mutation reproduced independently** — disabled the `existingPage` lookup, got exactly the two
   claimed tests red (73/75), reverted.
2. **Confirmed both guard directions plus the unconditional-replace-on-success path** via the real,
   unmutated tests.
3. **Wrote its own live-Mongo script (different tenant/session ids) and independently confirmed the
   disclosed limitation** rather than trusting it — two separate attempts, both hit the same
   `Server selection timed out after 15000 ms`. The honest disclosure was correct, not a convenient
   excuse.
4. **Confirmed ISS-056's fix untouched** and both cross-path independence tests (degraded summarize
   doesn't affect claims; degraded claims doesn't affect summarize) are real and passing.
5. Full suite 339/339, typecheck 10/10 clean, fresh run.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
