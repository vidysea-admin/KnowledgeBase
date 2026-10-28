# T-055 collections hidden-member survival (ISS-T055COLLECTIONS-001)

**Status:** checked-PASS
**Fix cycle:** 1
**Priority tier:** 3 (roadmap T-055); issue class data-write, severity high (full ceremony)
**Root:** C:/Users/product/Desktop/KnowledgeBase-lanes/w16-t055coll (branch lane/w16-t055coll)
**Base SHA:** a9fac545 (checkpoint). **Candidate SHA:** see the commit that carries this file (git log -1 on the branch).
**Verdict target:** qa/verdicts/t055coll-hidden-member-survival.md

## Finding on entry
Base a9fac545 already contains the refusal guard in `apps/api/src/knowledge/collections-store.ts` `writeCollection`: it loads the tenant + `_id` + `revision` row, and returns false (router answers 409) when any CURRENT stored member is unavailable to the caller. The revision predicate on `updateOne({_id, revision})` is the CAS; cycle 0 claimed it was proven but the test never overlapped the writers (checker F1). Cycle 1 proves it with a 2-party barrier. The ledger row was "submitted-unverified" and never executed. No product code change was needed; this unit adds the missing executed proof. Semantics kept: reject with 409 (never lose data). A server-side merge was NOT chosen: ledger expected values for A and B are 409 with the stored row unchanged, and a merge is a policy change (hidden ids in responses, explicit deselection of hidden members) that nothing in goal-t055 C5/C7 or DECISIONS settles.

## Changed paths
- apps/api/src/knowledge/collections-hidden-members.test.ts (new, 4 tests)
- qa/manifests/t055coll-hidden-member-survival.md (this file)

No source file changed. The existing apps/api/src/knowledge/collections.test.ts is unchanged (its createServer import graph does not load under current CPU contention; not run).

## Contract clauses
goal-t055 C5 (saved collections, fail closed without partial hidden success), C7 (every predicate tenant-scoped, foreign identifiers), C9 (issue-fix replays its own ledger reproductions verbatim, per-ID counts).

## Checks a checker must run
1. `cd apps/api; node --test --import tsx src/knowledge/collections-hidden-members.test.ts` (expect pass 4).
2. Mutation (D-020, per-mutation backup): in collections-store.ts replace the current-member availability check with `if (!current) return false;`; expect 3 of 4 tests fail; verify `git hash-object` equals HEAD blob afterwards.
3. Typecheck of apps/api (not completed by maker, see below).
4. Optional: run collections.test.ts when the machine can load server.ts.

## Evidence (real output)
- Tests: 4 pass, 0 fail (ledger A/B verbatim plus control C; cross-tenant; same-tenant less visibility incl. rename/add/swap/re-submit/reader-scope/visibility-revoked-later; concurrent 2-writer race and 3 concurrent writers on hidden-member row).
- Ledger corpus: ISS-T055COLLECTIONS-001 2/2 refused verbatim (A and B, 409, stored row deep-equal to original clone); control C 200 and targeted.
- Mutation (guard removed): 3 fail, 1 pass (cross-tenant test passes because tenant predicates, not the guard, protect it); store restored, blob 6acac8077b893ce8e711813067aa671d279e4876 equals HEAD.
- Environment: tests use the real createKnowledgeRouter + createMongoKnowledgeStore over a filter-enforcing fake Db with an auth shim. server.ts / requireAuth mounting is NOT exercised (importing server.ts timed out at 115 s and 900 s under 100% CPU, in the main tree too).

## Cycle 1 (test-only fix for checker F1)
- Concurrency test now holds both writers at a 2-party barrier on the revision findOne, asserts barrier hits == 2, statuses [200, 409], revision 2, title of the winner.
- Result: pass 4, fail 0. Mutation `updateOne({ _id, revision })` -> `updateOne({ _id })` with per-mutation backup: concurrency test FAILS (actual [200, 200]), other 3 pass; store blob 6acac807 equals HEAD after restore.
- Not re-run by maker: replay through real createServer (checker CHK-S in the cycle-0 verdict passed it; maker test still uses router plus auth shim).

## Not done
- `tsc --noEmit -p apps/api/tsconfig.json` timed out at 115 s (exit 124); unverified.
- Residuals flagged, not fixed: (a) DELETE /knowledge/collections/:id removes a collection holding hidden members for any ingest-scope caller (ledger: separate); (b) check-then-write TOCTOU if a member becomes hidden between the visibility check and updateOne (revision CAS does not cover visibility); (c) web client: a collection with hidden members is uneditable (409), the UI already disables editing per the ledger; no web change made.

## Actual maker usage
Active seconds, tokens, cost: unknown.
