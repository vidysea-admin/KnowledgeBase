# Verdict: t055coll-hidden-member-survival (T-055, ISS-T055COLLECTIONS-001)

VERDICT: PASS
Status: PASS
Cycle checked: 1
Reviewed SHA: 604495d41edfa07b4748d4e7b792c3eaa5ad2419
(Authoritative header = latest cycle. Cycle 0 history: FAIL at c997cd67a0492d618aef1166eb79dba3c2b1f366, recorded below unchanged except this header.)
Base SHA: a9fac545 (diff a9fac545..c997cd67 = 2 files: apps/api/src/knowledge/collections-hidden-members.test.ts (new), qa/manifests/t055coll-hidden-member-survival.md; no source change)
Checker: independent, fresh context, 2026-10-16T14:37Z to 14:50Z UTC
ISSUES-WRITTEN: none (finding F1 is returned to the maker as a cycle-1 fix; it is not a new ledger row)

## Summary
The product fix is real, sits at base, and is the ledger's own submitted candidate. Both ledger reproductions are refused verbatim (2/2), including through the actual authenticated createServer. FAIL is for one test-strength defect on a data-write property, which the manifest overclaims: the concurrency test does not detect removal of the revision CAS. The fix is test-only.

## Identity and base-fix verification
- Lane HEAD = c997cd67a0492d618aef1166eb79dba3c2b1f366. Base, HEAD and the worktree store blob are the same: collections-store.ts blob 6acac807.
- The store bytes at a9fac545 (LF) have sha256 ba2c80800f94b556d69cee93a90cc4a06294ee93efbc797f9dbc93cb46c661a7. That exactly equals the ledger `fix_candidate.store_sha256`, so the "already fixed at base" claim is verified.
- The guard is at collections-store.ts:65-70. It loads the row by tenant + `_id` + `revision: expectedRevision`. If any current member fails memberExists, it returns false and the router returns 409 (collections-router.ts:143). The update is `updateOne({_id, revision})` (CAS).

## Clause check: is reject-with-409 consistent with goal-t055 C5/C7? Yes.
- C5 requires failing closed without partial hidden success. A refusal changes nothing, and no hidden ids appear in the response. A server-side merge would be a policy change that no clause requires.
- C7 requires every predicate to carry the auth tenant. In the createServer probe, every knowledge_collections call carried tenantId "a". A foreign tenant gets 409/422/404, or a new row under its own hashed key.
- Low note: the error code `collection_changed` is semantically loose, because refreshing does not unblock the edit. The UI already disables Edit and shows a warning (CuratedCollections.tsx:44,47). Not filed.

## Commands and results (all evidence in .checker-t055coll/; each command's exit code and complete output were captured to files)
| # | Command (cwd apps/api; node v24.19.0 via the codex runtime) | Exit | Dur | Result |
|---|---|---|---|---|
| 1 | timeout 600 node --test --test-force-exit --import tsx src/knowledge/collections-hidden-members.test.ts | 0 | 20s | 4/4 pass |
| 2 | timeout 900 ... src/knowledge/collections.test.ts (createServer graph loaded) | 0 | 192s | 5/5 pass |
| 3 | Mutation `some`: current-member `.every(Boolean)` changed to `.some(Boolean)` (isolated untracked copy) | 1 | 19s | 3 of 4 fail; the cross-tenant test survives, as expected. Killed. |
| 4 | Mutation `nocas`: `updateOne({ _id, revision: expectedRevision })` changed to `updateOne({ _id })` | 0 | 15s | **4/4 pass. The mutant SURVIVES.** |
| 5 | Checker probes P1-P5, built from the maker harness plus checker tests | 0 | 17s | 5/5 pass |
| 6 | P5 against the `nocas` mutant | 1 | 15s | fails: statuses [200,200] where [200,409] is expected (lost update). Killed. |
| 7 | CHK-S: ledger A/B and control C through the ACTUAL createServer (collections.test.ts harness) | 0 | 51s | pass |
| 8 | timeout 600 tsc --noEmit -p apps/api/tsconfig.json (includes the new test file) | 0 | 60s | clean |
| 9 | python contracts/verify_contracts.py | 0 | - | PASS by vacuity (no frozen contracts) |

- Mutation safety: mutants were untracked sibling copies, not the tracked source. A trap on EXIT/INT/TERM/ERR removed them and a timeout wrapped each run.
- After the runs, the store, router, the new test and collections.test.ts all match HEAD by `git hash-object` (fidelity.txt). No `__chk*` files are left over, and `git status` shows only `.checker-t055coll/`.

## D-015 ledger measurement (ISS-T055COLLECTIONS-001)
- ISS-T055COLLECTIONS-001: **2/2 refused**. Case A (sanitized GET, then PUT of the visible subset) and case B (PUT with `members: []`) each returned 409, and the stored row deep-equals the original clone. This was replayed independently through the actual authenticated createServer + buildTestDeps keyStore, as the ledger `reproduction_setup` requires.
- Control C: 200, revision 2, sibling unchanged.
- Note: the maker's own A/B test uses the router plus an auth shim, not createServer, so it deviates from the ledger setup. My CHK-S run closes that gap for this cycle.

## Findings
**F1 (data-write class, uncapped): FAIL. The concurrency test is vacuous against loss of the revision CAS.**
- Location: apps/api/src/knowledge/collections-hidden-members.test.ts:97-106 (the "concurrent updates cannot lose writes" test).
- The manifest claims "a revision check makes concurrent writers lose", but mutant `nocas` (removing the CAS predicate at collections-store.ts:70) passes all 4 tests.
- Cause: the fake DB resolves too quickly for the two HTTP requests to interleave. Writer 2's pre-read `findOne({_id, revision:1})` happens after writer 1 has already written, so the pre-read does the work and the CAS is never exercised.
- With real Mongo, both writers can read revision 1 before either writes. Then only the CAS prevents a silent lost update, where both callers get 200 and revision 2.
- Concrete fix (test-only): in the concurrency test, wrap `fx.db.collection("knowledge_collections").findOne` so that any call whose filter carries `revision` awaits a 2-party barrier. Release when both have arrived, with a 3 s fallback. Then assert:
  - barrier hits == 2
  - statuses sorted == [200, 409]
  - row.revision == 2
  - row.title == the winner's title
- Reference implementation: `.checker-t055coll/probe-tail.ts` test CHK-P5. It passes on c997cd67 and fails on `nocas` (runs 5 and 6).
- Re-run mutation `nocas` and record it as killed. Also correct the manifest evidence line.
- Optional: move the ledger A/B case onto createServer (see `.checker-t055coll/server-tail.ts`) so the standing test matches the ledger setup.

## Residuals (judged)
**R1, DELETE of a collection holding hidden members: not a defect. Low note, not filed, no fix now.**
- Visibility is tenant-level, not per-caller. `memberVisible(tenant, kind, row)` is in metadata-visibility.ts:24-39, and sessionVisible excludes whatsapp-batch for every caller (visibility/knowledge.ts:148-150). No same-tenant writer can see more than another, so no one is deleting curation that a peer can see and they cannot.
- DELETE is an explicit, whole-collection action. It requires ingest scope, is tenant-scoped and is revision-guarded. Probe P4 confirms: reader gets 403, stale revision gets 409 with the row unchanged, and the correct revision gets 200.
- The UI warns that records are unavailable before the user clicks Delete.
- C5 requires delete, and the ledger `fix_direction` explicitly scopes it out ("Full intentional collection DELETE remains separate").
- Whether deleting a collection that holds withheld curation should need extra confirmation is a product decision for the Approver. It is not a silent data-loss path.

**R2, TOCTOU between the current-member check and updateOne: real but low. Not filed.**
- The window is the async gap at collections-store.ts:68-70. The only member that can be dropped is one that was visible at GET time and at check time. The caller chose to omit it while it was visible, so this is not erasure of withheld curation.
- The router cannot add hidden ids (422).
- Closing the window would need a transaction or a visibility/version stamp on member rows. That is disproportionate.

## Probes outside maker assertions (C9)
- P1: a hidden topic member (mixed sessionRefs) blocks the PUT with 409.
- P2: a missing (deleted) current member fails closed with 409 and the row unchanged.
- P3: a revision-0 PUT that reuses the hidden id cannot overwrite it (it gets a new hashed key).
- P4: the DELETE characterization described under R1.
- P5: the interleaved CAS test described under F1.
- CHK-S: the createServer replay described under the ledger measurement.

## Ledger rows
- ISS-T055COLLECTIONS-001: its own reproductions are verified 2/2 refused at this SHA. **Do not flip yet.** The unit FAILs this cycle; flip at the matching cycle-1 PASS close-out.
- No source changes are expected for cycle 1, so A/B need only be re-run, not re-proven.

## Not verified / limits
- Real Mongo was not used, so concurrency is proven only on the fake.
- No browser or UI run.
- Production requireAuth key-store verification was exercised only through buildTestDeps' keyStore.

## Accounting
- Maker usage is unknown, so the status is BOOTSTRAP_REVIEW and the ratio is unverified.
- Checker: about 780 s active. Actual tokens are unknown (null), with a debit of 90k allocated tokens.
- Escalation is the orchestrator brief's limit of about 120k tokens.
- review_budget.py assess: exit 0, status BOOTSTRAP_REVIEW, exceeded []. Input and output are in `.checker-t055coll/metrics-final.json` and `assess-final.out`.
- The default bootstrap scope (180 s / 6k tokens) was exceeded. That miss is recorded, not waived.

---
## Cycle 1 re-check (2026-10-16 UTC, same independent checker)
VERDICT: PASS
Cycle checked: 1
Reviewed SHA: 604495d41edfa07b4748d4e7b792c3eaa5ad2419
- Identity: lane HEAD = 604495d4. The diff from ad63e9a3 touches only collections-hidden-members.test.ts (+6 lines: barrier, `barrierHits == 2`, collection restore) and the manifest (Fix cycle: 1). Store blob 6acac807 is unchanged, so the cycle-0 A/B createServer replay (CHK-S) still applies to the same product bytes.
- Command: timeout 600 node --test --test-force-exit --import tsx src/knowledge/collections-hidden-members.test.ts. Exit 0, 18 s, 4/4 pass (A/B test re-passed).
- Checker mutation `nocas` (updateOne({ _id, revision }) changed to updateOne({ _id })), run as an isolated untracked copy under timeout and trap. Exit 1, 21 s. Only the concurrency test fails: actual [200, 200], expected [200, 409] (line 110 of the copy). The other 3 pass. Mutant killed.
- Command: timeout 600 tsc --noEmit -p apps/api/tsconfig.json. Exit 0, 69 s.
- Fidelity: store and test hash-object both match HEAD, and no __chk files are left.
- **F1: CLOSED.**
- Manifest wording: the cycle-1 section accurately states that cycle 0 had overclaimed and that the CAS is now proven.
  - Low note: the "Not done" line still says tsc is unverified. The checker ran tsc with exit 0 at cycle 0 (60 s) and at cycle 1 (69 s). Not filed.
- Residuals R1 (DELETE) and R2 (race window) are unchanged: low, not filed (see cycle 0).
- **Ledger: ISS-T055COLLECTIONS-001 MAY flip to done/fixed.** Measurement: ISS-T055COLLECTIONS-001: 2/2 refused (A, B: 409, row unchanged), control C 200. This was replayed through the actual createServer on unchanged store bytes.
- Evidence: .checker-t055coll/c1/ (hidden.out, mut.harness, tsc.out) and .checker-t055coll/mut-c1nocas.out
- Not verified: real Mongo, browser.
- Accounting: cycle 1 took about 150 s active, tokens unknown (null). The debit is about 20k, added cumulatively to cycle 0's 780 s / 90k. Maker usage is unknown, so the status is BOOTSTRAP_REVIEW and the ratio is unverified.
ISSUES-WRITTEN: none
