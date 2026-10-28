# Verdict - w6-consent-cas

**Cycle checked:** 0
**Coordinator:** A
**Policy-Version:** proportional-verification/2026-10-19.17 (Tier S, test-only diff)
**Checked code sha:** 91788069 (code sha ef7dc0b4 + manifest/ledger commit)
**VERDICT: PASS**

## Identity
- `git diff 021bdea0..HEAD --stat -- apps/api/src`: only `consent-race.test.ts` (+115) and `test-fixtures.ts` (+108/-12). No product code. `git hash-object apps/api/src/whatsapp/review/store.ts` == `git rev-parse HEAD:...store.ts` == 83c598c8f83756b500598f7a82930836e2b4e987, and matches the manifest's stated blob. Tier S is correct for this diff.

## Evidence (independently re-run, apps/api, one file per invocation, timeout 300)
- consent-race.test.ts: tests 8 pass 8 fail 0; diagnostic `interleavings=45 approvalOps=7 outcomes={"approvalFirst":32,"withdrawalFirst":13} writeConflictRetries=12` (non-vacuous: both linearizations and WriteConflict retries occur).
- Consumers of reviewMongoFixture: consent-cas 7/7, router 5/5, store 12/12, whatsapp-review/review-source 9/9.
- `npx tsc --noEmit -p .` exit 0.
- Native replica-set test (consent-race-mongo.test.ts) NOT re-run (opt-in, needs a local mongod; checker scope forbids provider/network). Not a criterion: C1-C3 are the no-Mongo proofs. Maker claim recorded as unverified-by-checker.

## Falsification (copy at apps/api/src/whatsapp/review-mut, deleted afterwards, no node_modules inside; per-mutation byte backup, cp restore, cmp, git hash-object == HEAD blob after each: restored ok x4; real store.ts never mutated)
- Control (copy, no mutation): 8/8 green.
- C1 / C2, M3 (fenceApproval returns before its write): RED 4 of 8 (sweep, window test, and two older fence tests).
- C1, M9 (checker-chosen, not in the manifest: withdrawal updateOne loses the revision filter and the `$inc`, a blind write): RED 2 of 8 (sweep and window test). So the sweep guards the withdrawal-side CAS too.
- C1, M5 (consent check removed from checkEvidence AND consent/revision filter removed from the fence): RED 2 of 8 (sweep, one older fence test).
- C3, M6 (withdrawal findOne/updateOne lose withTenant and the tenantId check): RED, only the new tenancy test fails (the other 7 stay green), confirming C3 is guarded solely by the new test.

## Acceptance
- C1 PASS: sweep covers readAt 0..8 x 5 write lags = 45 interleavings, asserts withdrawal always lands, approved <=> exactly one published claim, approved => revision 2 and the in-transaction read saw consent true at revision 1, refused => needs-review, 0 published, revision 1, only the consent/fence refusal may reject; runs count and both-linearization and conflict non-vacuity asserted. Killed by M3, M5, M9.
- C2 PASS: window test starts the withdrawal at the first session op after the uncommitted fence write; asserts approval ok, withdrawal lands, revision 2, 1 published. Killed by M3 and M9.
- C3 PASS: foreign-tenant withdrawal rejects with "source not found for withdrawal", sources rows deep-equal before and after. Killed by M6.

## Adversarial notes (auth/tenancy/data-write paths touched)
- Fixture default path (no isolation argument) is behaviourally the old fixture: all four other consumers green. The isolation model is opt-in and test-support only, so it cannot weaken production checks; its fidelity limits (serialized transactions, single-version snapshot, not WiredTiger) are stated in the manifest and the native test remains the arbiter.
- D-015: ISS-WAVECTORLESS-002's single recorded reproduction (pause after evidence read, withdrawal commits, resume) is exercised by the sweep (readAt positions after the read refuse) and by consent-cas.test.ts; reported 1/1 and the open remainder (no production caller) is named, consistent with ISS-W6-001. The ledger row correctly stays open.
- Ledger shard `qa/issues.w6.jsonl` uses id ISS-W6-001 (per-lane rule, not renumbered); the unit did not edit the canonical rows.

## PROPOSED-ISSUE
- none (ISSUES-WRITTEN: none). Note: ISS-W6-001 (filed by the maker, medium, open) is accepted as-is; it is a product-ownership question and not a defect of this unit.

## Metrics
check_min=12 wall_min=12 suite_runs=0 repeat_runs=5 mutations=4 (M3, M5, M6, M9) cycle=0 defects_unit=0 defects_6c=0 policy=proportional-verification/2026-10-19.17 tokens=unavailable
