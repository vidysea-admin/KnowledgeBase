# Manifest — search-store-tenant-assertion

**Contract:** qa/contracts/search-route.md (invariant **[I6]**, extended by this unit to cover the
`tenantId` half of the filter object, not only the `$or` half)
**Goal task:** none (ledger-driven)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-078** (high — tenant assertion missing), **ISS-079** (medium — `k`
unasserted), **ISS-080** (medium — post-fetch resolution unasserted). ISS-073/081/082 untouched
by this unit.

## Why

The `search-store-injectable-handle` checker's primary job was to hunt a fifth bypass. It found
one **inside** the claimed-closed class and **four more outside it**, all against a store
carrying the correct production code — the defects are entirely in what the tests could see:

| # | Mutation | Caught before this unit? |
|---|---|---|
| **5A** | `scopedCollection` removed from the turns handle | **NO — 102/102 green** |
| 5B | `k` ignored | NO — 102/102 green |
| 5C | every hit given the wrong session | NO — 102/102 green |
| 5D | every hit given the wrong turn | NO — 102/102 green |
| 5F | session dedup removed (N+1) | NO — 102/102 green |
| 5E | duplicated results | yes (only one caught) |

**5A is the one that matters, and it is a fair hit on me specifically, not a new class of
mistake.** My own manifest's stated claim was: *"Closes: any bypass that corrupts the filter
object reaching Mongo, regardless of where the corruption happens."* `tenantId` **is part of
that object** — I had already printed it in the captured filter. My test's `asPrefilter()`
narrowed the capture to `$or` and threw the rest away, so I built the instrument that would have
caught this and then pointed it somewhere else. Live consequence, stated plainly: a regression
here would return **every tenant's** verbatim transcript text to any authenticated caller.
`packages/db/src/lib/tenantScope.test.ts` calls this exact boundary "the one invariant in this
codebase whose failure is unrecoverable."

The checker also identified *why* 5C/5D survived, which is a second, distinct root cause worth
fixing rather than papering over: my fake's `findOne` returned the same session object for every
`_id`, and `find` returned the whole corpus regardless of filter. Id-keyed resolution cannot be
falsified by a fake that ignores the id. 5B/5C/5D/5F were all things my *own* previous manifest
predicted as untested ("can you corrupt results while keeping the captured filter a valid
superset — e.g. corrupting `k`, the scoring call, or the turn/session resolution after the
fetch?") and then did not act on before shipping.

## What changed

**`apps/api/src/search-store.test.ts`** — rewritten, not patched, because both root causes needed
fixing in the fixtures themselves:

1. **The fake now applies filters like real Mongo does.** `matches(filter, doc)` checks
   `tenantId`, `_id`, and the `$or` regex clauses (via the already-shipped `prefilterMatches`).
   `find`/`findOne` filter their rows through it instead of returning everything unconditionally.
   This alone makes id-keyed and tenant-keyed resolution falsifiable — it is what 5A/5C/5D need
   to be catchable at all.
2. **The corpus now includes a second tenant** (`other`, session `s9`, turn `t9`, sharing the
   query term `"2026"`). Without a second tenant present, an unscoped query and a scoped one
   return identical results — the leak is only detectable when there is something to leak.
3. **`assertAllCallsConfined(calls, tenantId)`** — a same-named helper checking every captured
   `find`/`findOne` call's `tenantId`. **Correction from the checker, accepted:** this claimed
   to be "the exact function" `indexing.test.ts` uses, copied verbatim. It is not — that one is
   ~4x larger and also handles write ops plus a `tree_index` node_id special case this store
   never needs. The right characterization is "same name, same idea, independently sized to this
   file's narrower (read-only) call shape," not "copied." The decision not to unify them is
   still sound (diverging call shapes), but I should not have called it a copy.
4. **The corpus now spans multiple sessions for a shared query** (`"2026"` hits `t1`/`t3`→s1 and
   `t6`→s1 and needs a second session to test dedup meaningfully — added `t4` overlap via s3).
   A query touching only one session made a broken session `Map` lookup indistinguishable from a
   correct one; ISS-080's fix needs at least two.
5. Eight tests, each targeting one mutation class:
   - tenant-confinement across four different queries (ISS-078)
   - no other tenant's turn or session is ever returned, using the real cross-tenant term `"2026"`
   - the superset property, now over **derived** queries (kept from the prior unit) but checked
     against the filter actually captured by the *filtering* fake
   - `k` is honoured at two different values (ISS-079)
   - each hit carries its own turn and session, verified against distinct session titles (ISS-080)
   - sessions are fetched once each, not once per hit (ISS-080, the N+1 [I3] forbids)
   - the existing no-tokens and end-to-end tests, carried over

No production code changed. `apps/api/src/search-store.ts` is untouched.

## Evidence

**All five previously-undetected mutations, replayed against the new test file:**

| mutation | before this unit | after this unit |
|---|---|---|
| **5A** cross-tenant disclosure | **102/102 green** | **4 pass / 4 fail** |
| 5B `k` ignored | 102/102 green | 7 pass / 1 fail |
| 5C wrong session | 102/102 green | 7 pass / 1 fail |
| 5D wrong turn | 102/102 green | 7 pass / 1 fail |
| 5F dedup removed | 102/102 green | 7 pass / 1 fail |

Each mutation confirmed via a pre-mutation backup and `diff` before trusting the red result;
each restored byte-identically, confirmed 8/8 (and full suite green) before moving to the next.
5A correctly trips four tests at once — a tenant leak violates several invariants simultaneously,
which is itself evidence the fix isn't narrowly patched around one symptom.

`pnpm --filter @lkb/api test` — **107/107** (99 pre-existing + 8 new, replacing the prior file's 3).
`pnpm --filter @lkb/index test` — 59/59, untouched.
`pnpm -r typecheck` — exit 0, all 10 workspace projects.
`pnpm lint:structure` — clean, 0 dependency violations / 264 modules.

**Live proof against real production Mongo** (read-only, script deleted after), exercising the
real un-injected `getDb()` path to confirm the fake's new filtering behaviour did not require any
production change and that live results genuinely stay tenant-scoped:
```
visa student university funding -> 5 hits, all tenant toc: true
AI in counselling -> 5 hits, all tenant toc: true
2026 intake -> 5 hits, all tenant toc: true
```

## What this does and does not close

**Closes:** the specific five mutations found, and — because the fix is a filtering fake plus a
call-site assertion rather than five narrow patches — the general classes each belongs to: any
corruption of the tenant key, any corruption of `k`, any corruption of post-fetch id resolution
(turn or session), and any reintroduction of per-hit session lookups.

**Does not close, and I am not claiming otherwise:** a fifth mutation class the checker tried and
could not make land (5E, duplicated results) is already caught by an existing assertion, kept
unchanged. A sixth-round hunt was not run — after four consecutive checker-found gaps in this
same seam, running my own hunt and reporting "I found nothing" would be exactly the
self-certification this pair exists to prevent. That is the checker's job on this manifest, not
mine to pre-empt.

## How to verify (checker)

1. Read `search-store.test.ts` — confirm `matches()` genuinely filters (not merely records) on
   `tenantId`, `_id`, and `$or`, and that the corpus contains a second tenant sharing a query term
   with the first.
2. **Replay all five mutations** (5A/5B/5C/5D/5F as described above) against the new test file;
   each must fail. Confirm via backup `diff` each mutation genuinely changed the file. Restore,
   confirm 8/8 and the full suite green.
3. Try a sixth bypass. Candidates worth trying: corrupt `sessionsColl`'s tenant scoping
   specifically (only the turns handle was attacked, not the sessions handle — does removing
   `scopedCollection` from the *sessions* lookup get caught?); corrupt the score value attached to
   a hit while leaving turnId/sessionId correct; return a session belonging to a *different* turn
   within the *same* tenant (same-tenant cross-session mix-up, which tenant assertions alone
   won't catch).
4. `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (59/59), `pnpm lint:structure`, and
   reproduce live parity yourself against real Mongo.
5. Judge whether `assertAllCallsConfined`'s reuse (rather than a search-specific reimplementation)
   is the right call, or whether the two functions should be unified into a shared test helper —
   this is the second time this exact function has been needed verbatim.

## Risk / rollback

Test-only change; zero production code touched; read-only against the database. Reversible by
`git revert`.

**Status: checked-PASS** — PASS from `qa/verdicts/search-store-tenant-assertion.md` (Cycle checked: 1, matching Fix cycle 1), committed `ca18b79`. All three documented candidates plus one of the checker's own (coordinated turn/session/score rotation) were tried in the sixth-bypass hunt; two landed and were filed rather than fixed here — ISS-083 (score value unasserted) and ISS-084 ((turnId,sessionId) pairing unchecked against what the scorer actually ranked), both medium, neither a security or ranking-order defect. Item 5's claim that assertAllCallsConfined was copied verbatim from indexing.test.ts was corrected above — it is independently sized, not copied. Closed out 2026-09-08.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
