# Manifest — search-store-rank-assertion

**Contract:** qa/contracts/search-route.md (invariant **[I6]**)
**Goal task:** none (ledger-driven)
**Date:** 2026-09-08
**Fix cycle:** 1 of max 3
**Dual check:** no
**Issues addressed:** **ISS-083** (medium — `hit.score` unasserted), **ISS-084** (medium —
`(turnId, sessionId)` pairing unchecked against the scorer's own ranking).

## Why

The `search-store-tenant-assertion` checker's sixth-bypass hunt found two more gaps, both
against a store carrying correct production code:

- **ISS-083**: `score: 0.5` hardcoded on every hit — **107/107 green**. No test read the field.
- **ISS-084**: rotating `turnId`/`sessionId`/`turn`/`session` together across hits (each
  internally self-consistent, each carrying the *original* score at its position) — **107/107
  green**. Every prior assertion checked a hit against *itself*; none checked it against what
  the scorer actually ranked at that position.

Both are correctly scoped as medium, not high: this is round seven on the same seam, and unlike
round six (the cross-tenant disclosure), neither has a live security or data-leak consequence —
`routes/search.ts` never re-sorts on the returned `score`, so a wrong score doesn't corrupt
ordering, and ISS-084's rotation needs a same-tenant multi-hit query to even be reachable. Both
are still real: a wrong `score` is silently wrong data reaching any future consumer (plan §10
explicitly names this scorer as U1.5's reuse target), and ISS-084 means a hit could carry the
*right* turn and session individually while pairing them incorrectly with each other.

## What changed

**`apps/api/src/search-store.test.ts`** — two new tests, both cross-checking against a
*separately computed* `lexicalSearchTurns` call rather than the store's own output, so a value
merely copied from itself cannot pass:

1. **`hit.score matches what the scorer independently computes for that turn`** — for three
   queries, every returned hit's `score` is compared against a fresh `lexicalSearchTurns` call
   over the same corpus, keyed by `turnId`.
2. **`each hit's (turnId, sessionId) pair matches what the scorer actually ranked at that
   position`** — compares the store's output, position by position, against the independent
   scorer's own rank order: both `turnId` equality at each index, and that the `sessionId`
   genuinely belongs to that turn (via a real corpus lookup, not the store's own `Map`).

No production code changed. `apps/api/src/search-store.ts` is untouched.

## Evidence

**Both mutations, replayed:**

| mutation | before this unit | after this unit |
|---|---|---|
| ISS-083 hardcoded `score: 0.5` | **107/107 green** | 9 pass / 1 fail |
| ISS-084 coordinated rotation (shift id/turn/session by one, keep original score) | **107/107 green** | 9 pass / 1 fail |

Each confirmed via a pre-mutation backup and `diff`; each restored byte-identically, confirmed
10/10 before moving to the next.

`pnpm --filter @lkb/api test` — **109/109** (99 pre-existing + 10, replacing the prior file's 8).
`pnpm --filter @lkb/index test` — 59/59, untouched.
`pnpm -r typecheck` — exit 0, all 10 workspace projects.
`pnpm lint:structure` — clean, 0 dependency violations / 264 modules.

**Live check: attempted, inconclusive, disclosed rather than papered over.** A read-only script
comparing live hits' scores against an independently-computed scorer call over the real 2118
turns did not return output within the tooling's timeout, and a short follow-up wait produced
nothing further. I am not fabricating a result. The checker's own dispatch already requires an
independent live-Mongo check with a documented UNVERIFIED fallback if the host is unreachable —
that check stands as this unit's live verification, not a substitute I invented.

## The stopping question — this is the point to answer it, not defer it again

This is the **seventh** consecutive round of maker-checker cycling on `search-store.ts`'s test
coverage, across two units and two checkers, since the 30% latency win first shipped. The
severity trend is the actual signal, and it is unambiguous:

| round | found | severity |
|---|---|---|
| 4 | derivation untested | high |
| 5 | bypass-the-pin | medium |
| 6 | **cross-tenant disclosure** | **high** |
| 7 (this one) | score/pairing unchecked | medium, medium |

Round 6 was not part of a smooth decline — it was a spike, and it is the reason continuing past
it was clearly correct. Round 7 drops back to medium with **no security or correctness-in-
production implication** (both defects are visible only in test fixtures deliberately
constructed to expose them; neither has a live-Mongo reproduction). That is the shape of a
genuinely converging series settling, not the shape that justifies an eighth round on this same
file by default.

**I am recommending the checker treat this as the last round on `search-store.ts` specifically**
unless it finds something with an actual severity signal (a security implication, a live-data
reproduction, or a production behavioural bug) — not merely "a field my test didn't happen to
check." A ninth mutation class found at low/medium severity with no live consequence should be
filed and left, not chased into a ninth manifest. This is my judgment to offer, not to enforce —
the checker owns severity calls, and if it disagrees it should say so and keep hunting.

## How to verify (checker)

1. Read the two new tests — confirm each cross-checks against an independently computed
   `lexicalSearchTurns` call, not a re-derivation of the store's own logic.
2. **Replay both mutations** (hardcode `score: 0.5`; rotate turnId/sessionId/turn/session by one
   position while preserving the original score) against `search-store.ts`; each must fail.
   Confirm via backup `diff`; restore, confirm 10/10 and the full suite green (109/109).
3. `pnpm -r typecheck`, `pnpm --filter @lkb/index test` (59/59), `pnpm lint:structure`.
4. **Run the live-Mongo check yourself** — this manifest's own attempt was inconclusive and is
   disclosed as such above, not claimed as evidence.
5. **The judgment this manifest is actually asking for**: do you agree round 7's severity trend
   (medium, no live consequence) means this is the point to stop iterating on `search-store.ts`'s
   test coverage specifically, absent a new signal? Or is there a concrete eighth bypass with
   real severity you'd want hunted before calling this seam settled? Either answer is fine — the
   point is making the call explicitly rather than letting the chain continue by inertia.

## Risk / rollback

Test-only change; zero production code touched; read-only against the database. Reversible by
`git revert`.

**Status: checked-PASS** — PASS from `qa/verdicts/search-store-rank-assertion.md` (Cycle checked: 1,
matching Fix cycle 1), committed `80e9ba7`. 15/15 criteria, 7/7 invariants. The checker replayed both
mutations independently and established something this manifest did not claim: the ISS-084 rotation
leaves the **older ISS-080 self-consistency test green**, which is direct proof the new test sees what
round 6 structurally could not. It also completed the live-Mongo check this manifest disclosed as
inconclusive — 8 queries on the real `toc` tenant via the production `getDb()` path with no injection,
**0 score / 0 pair / 0 count mismatches, LIVE RANK PARITY: YES** — so ISS-083/084 close on live evidence
rather than fixture-only proof.

**On the stopping question: the checker agreed and closed the seam — but did not defer.** It ran its own
eighth-bypass hunt and **found one**: replacing the single-fetch `turnById` map with a per-hit
`turnsColl.findOne` — the exact N+1 that contract criterion C9 and invariant [I3] forbid *by name* —
measures **109/109 green, typecheck exit 0**. It survives because the suite counts *session* lookups only
and nothing counts `turns` calls. Filed as **ISS-085 (medium)** and deliberately left unbuilt: cost-only,
no security or live-data consequence, remedy is two lines inside the existing dedup test. That is exactly
the "file it and leave it" bar this manifest argued for, applied to a finding the checker discovered
rather than one it inherited. No contract amendment — [I3] already states the rule; what was missing was
a test, not a rule.

**Reopening criteria for this seam, recorded in the verdict:** a tenant or security bypass, a live
wrong-data reproduction, or a production behavioural bug. Absent one of those, `search-store.ts` test
coverage is settled after seven rounds.

**Post-check incident (found by the maker at close-out, 2026-09-08).** After the verdict was written and
committed, `apps/api/src/search-store.ts` was found in the working tree carrying `score: 0.5` — the
ISS-083 mutation, re-applied to production source after the checker had verified its own restore
SHA256-identical with a clean `git status`. Restored via `git checkout`; `pnpm --filter @lkb/api test`
109/109, 0 fail. **`git log --all -S 'score: 0.5' -- apps/api/src/search-store.ts` returns empty — no
commit ever captured it**, so nothing shipped and nothing needs reverting. This is the third instance
this session of the mutation-concurrency hazard already logged as a PATTERN in `qa/feedback-inbox.md`
(a concurrent reader or writer meeting a mid-mutation tree). Recording it here because the previous two
instances were a sweep *reading* a mutated file; this one is a mutation *surviving* its own restore
verification, which is a stronger failure and argues the mutation protocol needs a post-restore
re-verification at close-out, not only at restore time.

**Handshake status:** checked-PASS — derived by the ISS-350 backfill from all 1 status statement(s) in this file, which agree
