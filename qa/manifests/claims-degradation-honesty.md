# Manifest — claims-degradation-honesty

**Contract:** qa/contracts/ingest-indexing-pipeline.md — **and this unit deliberately CONTRADICTS
its criterion 2.** That criterion says a failed `complete()` "yields `[]`, an honest 'nothing
extracted yet', never a crash". The sweep's ISS-056 says that `[]` is not honest, and I agree — but
the contract is checker-owned, so I have **not** amended it. Checker: please amend criterion 2 or
reject this unit. Flagged rather than quietly edited, because the last sweep reopened ISS-006 for
exactly the pattern of makers writing their own ground truth.
**Goal task:** sweep top-3 (ISS-056)
**Date:** 2026-09-07
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** ISS-056

## Why — the filed issue understates it; this is silent data loss

ISS-056 was filed as "`claims.ts` returns `[]` on provider failure indistinguishably from 'no
claims', while its sibling `summarize.ts` labels its degradation". True — but reading the **caller**
shows why it matters:

```ts
await getDb().collection<Claims>("claims").deleteMany({ tenantId, "evidence.sessionId": sessionId });
if (extractedClaims.length > 0) { … insertMany … }
```

**The delete was unconditional; the insert was conditional.** So a transient provider outage during
a re-index **deleted every previously-extracted real claim for that session and wrote nothing
back**. Not merely ambiguous — destructive, on the collection that holds 81 of the project's real
claims, triggered by exactly the flaky-Mongo/flaky-provider conditions this session has hit
repeatedly.

## What changed

1. **`packages/index/src/pipeline/claims.ts`** — `extractClaims` returns
   `{ claims, degraded: {reason} | null }` instead of a bare array. Still never throws (the
   contract's actual intent). `degraded` is set for a rejected `complete()` and for a non-array
   response; it is **null** when extraction genuinely ran and found nothing, including when every
   candidate claim was dropped by the evidence check — because that is a successful extraction, and
   conflating it would stop legitimate empty results from ever replacing stale claims.
2. **`apps/api/src/indexing.ts`** — the claims delete/insert now happens **only when extraction was
   not degraded**; on degradation the prior claims are left exactly as they were and the reason is
   logged. 
3. **The db is now injectable** (`IndexSessionDeps.db`, defaulting to `getDb()`), and the three
   tenant-scoped accessors are built from that same handle — `scopedCollection` still forces a
   `tenantId` at every call site, it just no longer reaches past the injection.

## The reason for (3), which is the part I want on the record

My first fix was **untested and I only found that by mutation-testing my own work**: reverting the
guard to the unconditional delete left the entire suite green, because `indexSession` reached the db
through a module singleton no test could touch.

That is the **fourth** time in this project a guard has shipped with nothing pinning it — ISS-030
(the scorer's honesty guards), ISS-038 (the `--check` gate "tested" by a source-text regex), ISS-048
(I14's subset clause), and now this. Three of those were caught by a checker. This one I caught
myself, and the lesson has finally been applied at the cause rather than the symptom: the code was
made testable instead of the gap being disclosed again.

## Real evidence

### Both mutations caught, each proven to have applied
```
revert to the unconditional deleteMany (the original ISS-056 bug)   guard 1 -> 0   RED — caught
make extractClaims report degraded:null on failure (silent [])                     RED — caught
```

### A failing test that was RIGHT, and a fixture that was wrong
The degraded-run test first failed reporting `deleteMany` had still been called. The code was
correct; **my fake returned no turns**, so `extractClaims` short-circuited on `turns.length === 0`
to a legitimately non-degraded empty result. The fixture now returns a real turn, and the reason is
written into the fake so the next person does not lose the same hour.

### Suites
```
packages/index  40/40   (was 38: +2 — degraded-vs-genuinely-empty are now distinguished)
apps/api        69/69   (was 66: +3 — the new indexing write-decision tests)
core 7 · ai 56 · ask 32 · ingest 41 · meeting-bot 40 · web 40 (vitest)   all pass
pnpm -r typecheck  → all 9 projects Done
```

### Structure
`lint-loc` 216 files OK · `lint-dirsize` OK · `lint-root` OK · `lint-dupes` 240 exports OK ·
`lint-migrations` OK · `snapshot --check` OK · depcruise 240 modules, **no violations** ·
score unchanged at **20.2% / 28.9%**.

## A workflow problem this unit exposed (logged to the inbox, NOT fixed unilaterally)

`pnpm lint:structure` now **fails during any in-flight unit**, because `catalogue-score --check`
refuses when a scraped SOURCE file is uncommitted:
```
REFUSED: packages/index/src/pipeline/claims.ts is not what the repository holds (modified).
```
Every other structure check passed and the score was unchanged. The refusal is contract I13/I14 and
is plainly right for the *evidence* and *catalogue* inputs, which can inflate the number. For
scraped source the protection is arguably already the doc's EDITED-SINCE-COMMIT banner plus the
staleness check — and a source edit that changes no verdict still blocks the lint, i.e. the gate is
red exactly when you would want to run it, pre-commit.

**I have not touched it.** It is a checker-owned invariant, and the ruling that "a gate that blocks
every commit until someone else acts is a gate people delete" now applies to this gate itself.
Appended verbatim to `qa/feedback-inbox.md`.

## Disclosed limitations

- **The live proof is missing.** The remote Mongo was unreachable throughout (`tcp 27017` timeout),
  so I could not demonstrate the original data loss against a real database on a scratch tenant.
  The proof here is code-level plus the mutation test; a live re-index that kills the provider
  mid-run would be stronger, and is the first thing to do when Mongo returns.
- **`summarize.ts` has the same shape and I did NOT change it.** A degraded run still overwrites a
  good session_page with `"(fallback, LLM summary unavailable) …"`. It is at least labelled, and the
  contract explicitly requires that fallback — so changing it is a contract decision, not a bug fix.
  Raising it here rather than acting on it.
- `console.warn` is the whole degradation signal at the caller; there is no gap row and no metric.
  A `gaps` row would be the better home, but `gaps` has no live writer yet (plan §10 U0.7+).

## How to verify (for the checker)
1. **Rule on the contract contradiction first** — criterion 2 currently blesses the behaviour this
   unit removes. Amend or reject; do not let it stand as-is with the code disagreeing.
2. Re-run both mutations yourself, proving each applied: revert the `if (claimsDegraded)` guard, and
   make the `catch` return `degraded: null`. Each must redden a test.
3. Confirm the distinction is right in **both** directions: a genuinely empty extraction and one
   where all claims were dropped for fabricated evidence must be **non**-degraded, or stale claims
   could never be cleared.
4. `pnpm -r test` and `pnpm -r typecheck` clean; `apps/api` 69, `packages/index` 40.
5. Check the injected-db refactor did not weaken tenant scoping — `scopedCollection` must still be
   what builds every accessor, and no query may lose its `tenantId`.
6. **Judge the workflow finding.** Is `--check` refusing on uncommitted scraped source right, given
   it makes `lint:structure` unusable pre-commit? I deliberately did not change it.
7. If Mongo is reachable, do the live proof I could not: seed claims on a scratch tenant, re-index
   with a failing provider, and confirm the claims survive.

## Status: checked-PASS

**Verdict:** `qa/verdicts/claims-degradation-honesty.md` — **PASS**, `Cycle checked: 1`, commit `3d0c442`.
9/9 dispatch items verified · 4/4 touched criteria met · 3/3 declared mutations caught.

### What the checker ruled, including where it corrected me

1. **Contract criterion 2 amended, not rejected.** The escalation was right: the criterion blessed the
   behaviour this unit removes. It was rewritten, a **new criterion 2a** was added forbidding a
   conditional insert paired with an unconditional delete, and an amendment log was appended.
2. **ISS-056 upgraded medium → HIGH**, and the live proof this manifest listed as missing was **done by
   the checker**: a degraded re-index kept a human-`verified` claim (1→1); the pre-fix path destroyed
   it (1→0), against the real database.
3. **"The remote Mongo was unreachable" above is WRONG** — ICMP is blocked, but TCP 27017 opens. My
   probe (`cat < /dev/tcp/...`, exit 124) cannot distinguish a closed port from an open-but-silent one,
   and Mongo does not speak first. The limitation stands as written for the record; this is its
   retraction.
4. **`summarize.ts`**: agreed it was right to leave, and it is the same bug labelled → **ISS-059**,
   with criterion 1a added.
5. **The workflow complaint was refuted on measurement, then sustained on packaging.** ISS-047 moved
   the score +10.5 points from purely uncommitted source with no banner at all, so the banner is not
   the protection I claimed. I13/I14 upheld; the pre-commit packaging problem is real → **ISS-058**
   (split `--check` into `lint:score`).
6. **Tenant scoping confirmed not weakened** by the injected-db refactor.
7. **New, higher-severity finding — ISS-060 (high):** stripping `tenantId` from the claims `deleteMany`
   survives the entire suite and typecheck, and live it took two scratch tenants 1→0. Not chargeable
   to this unit (HEAD had the identical hole), and this unit is what makes it cheap to close — the
   fake db need only record filters as well as op names.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
