# Manifest — w6-consent-cas

Status: ready-for-check
**Handshake status:** ready-for-check
**Contract:** none (advances ledger row ISS-WAVECTORLESS-002, qa/issues.WAVECTORLESS.jsonl line 2; row not edited)
**Goal task:** none (Wave 2 W6, docs/REMAINING-PLAN-2026-10-28.md)
**Date:** 2026-10-28
**Fix cycle:** 0 of max 2
Fix cycle: 0
**Dual check:** no (the diff is two test-support files; no auth/tenancy/consent/data-write product code changed. The source-authorization CAS in apps/api/src/whatsapp/review/store.ts:43-76 is already on HEAD since 382e0c14 and its blob 83c598c8 is unchanged by this unit. Policy: a test-only diff needs no dual and no trigger line.)
**Issues addressed:** ISS-WAVECTORLESS-002 (advance; stays open: no production withdrawal caller, see D-015 section and ISS-W6-001)
**Executor:** claude-opus-builder
**Executor rationale:** one shared fixture plus one test file; the isolation model needed care, no delegation.

## What changed
- Merged `wavectorless002-cas-race` (94792654). Its content was already on HEAD (the real-Mongo race test merged 2026-10-26), so the merge is a no-op on files; the stale ready-for-check manifest copy was resolved to HEAD's merged-no-check version.
- apps/api/src/whatsapp/review/test-fixtures.ts (edited in place, +96 -12): `reviewMongoFixture(inputs, isolation?)`. With no second argument behaviour is the old fixture (all other users unchanged). With it, the fixture models MongoDB transaction isolation: point-in-time session reads at the transaction's first op (per-row pre-image history), first-committer-wins WriteConflict (TransientTransactionError) with rollback and retry in `withTransaction`, row write locks (a row written in an open transaction shows its pre-image to, and blocks writes from, out-of-session callers), and a `beforeSessionOp(n)` hook that releases a competitor at an exact session-op index. `isolationStats()` returns session ops and conflict retries.
- apps/api/src/whatsapp/review/consent-race.test.ts (edited in place, +115 -1): three tests. (1) exhaustive deterministic sweep: the withdrawal's source read is released at every session-op index of the approval (0..8) crossed with five write lags, 45 interleavings; (2) withdrawal released between the approval's fence write and its commit; (3) a foreign tenant cannot withdraw another tenant's source.
- No product code changed, no schema change (`sourceMeta.authorizationRevision` is already in schema/sources.schema.json:80 and the generated types). No dependency added; mongodb-memory-server is not in pnpm-lock.yaml, so the in-memory path is the fixture model.
- qa/issues.w6.jsonl: ISS-W6-001 (medium), filed not fixed.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (diff is test-support code and tests only; the consent/approval CAS being proven is unchanged product code, store.ts blob equals HEAD). The orchestrator briefed tier L because the subject is consent; per the test-only rule the tier follows the diff. Raise to L if the checker finds a product change is needed.
Round: 2 files, 3 criteria, est 25 min: shared fixture isolation model plus three tests, no product change
slow-plan: none needed, estimate is within 30 min
Base sha: 021bdea0 (branch wave/w6-consent-cas); code sha ef7dc0b4
Gate answers: none (no gate files touched)
Affected tests / full-suite trigger: all five consumers of reviewMongoFixture run one file per invocation: consent-race.test.ts, consent-cas.test.ts, router.test.ts, store.test.ts, src/whatsapp-review/review-source.test.ts; no safe-fallback trigger; no full suite run.
Tests[C1]: apps/api/src/whatsapp/review/consent-race.test.ts::"deterministic interleaving sweep, withdrawal vs approval, every point of the approval transaction" — the sweep itself: every interleaving of withdrawal and approval, asserted end state per run
Tests[C2]: apps/api/src/whatsapp/review/consent-race.test.ts::"a withdrawal landing between the approval's fence and its commit waits, then retries on the new revision" — the one window the sweep cannot reach by op index (row locked, uncommitted)
Tests[C3]: apps/api/src/whatsapp/review/consent-race.test.ts::"tenancy holds, a foreign tenant cannot withdraw another tenant's source" — tenant guard on the withdrawal writer
Falsification[C1]: copy-mutant M3 (fenceApproval returns before its write) in apps/api/src/whatsapp/review-mut/store.ts: sweep red (and 3 older fence tests red); control (no mutation) 8/8 green. Copy-mutant M5 (consent check removed from checkEvidence AND consent/revision filter removed from the fence): sweep red at "readAt=0 lag=0: the committed approval published over a source still consented and fenced"; control green.
Falsification[C2]: same M3: window test red (no fence write, so no row lock, and the withdrawal is never started at the revision-1 point); control green.
Falsification[C3]: copy-mutant M6 (withdrawal findOne/updateOne lose withTenant and the source.tenantId check): tenancy test red "Missing expected rejection"; every other test stayed green, so this check is guarded only by the new test; control green.
Mutation hygiene: the copy lived in untracked apps/api/src/whatsapp/review-mut (no node_modules inside, then deleted); per-mutation byte backup in a mktemp file restored by cp after each run (no trap), each restore verified with git hash-object == git rev-parse HEAD:apps/api/src/whatsapp/review/store.ts (83c598c8f83756b500598f7a82930836e2b4e987): RESTORED ok x4; the real store.ts was never mutated.
Pre-check[C1]: ef7dc0b4 node --test --import tsx src/whatsapp/review/consent-race.test.ts -> green 8 passed, 0 failed (interleavings=45 approvalOps=7 outcomes={"approvalFirst":32,"withdrawalFirst":13} writeConflictRetries=12) t=8 blobs=apps/api/src/whatsapp/review/consent-race.test.ts:1a64068
Pre-check[C2]: ef7dc0b4 node --test --import tsx src/whatsapp/review/consent-race.test.ts -> green 8 passed, 0 failed (window test included) t=8 blobs=apps/api/src/whatsapp/review/consent-race.test.ts:1a64068
Pre-check[C3]: ef7dc0b4 node --test --import tsx src/whatsapp/review/consent-race.test.ts -> green 8 passed, 0 failed (tenancy test included) t=8 blobs=apps/api/src/whatsapp/review/consent-race.test.ts:1a64068
Metrics: start=2026-10-28T20:40 end=2026-10-28T21:35 wall_min=55 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=3 defects_unit=0 defects_6c=0 builder_min=55

## Acceptance
- C1: for every position of the competing withdrawal across the approval transaction, deterministically and with no Mongo server: the withdrawal always lands; an approval either commits (candidate approved, one published claim, revision exactly 2, and its in-transaction read of the source saw consent true at revision 1) or is refused with the consent/fence refusal (candidate needs-review, no published claim, revision 1); never an approval over an already withdrawn source. Both linearizations and WriteConflict retries must occur in the sweep (non-vacuous).
- C2: a withdrawal arriving after the approval wrote its fence but before commit waits behind the row lock, then retries on the new revision and still lands (revision 2, approval kept, withdrawal visible after).
- C3: tenancy stays intact: a foreign tenant's withdrawal is refused and changes neither consent nor revision.

## How to verify (commands + expected), from apps/api, one file per invocation
- `timeout 300 node --test --import tsx src/whatsapp/review/consent-race.test.ts` -> tests 8, pass 8, diagnostic `interleavings=45 ... writeConflictRetries=12`.
- Consumers unchanged: consent-cas.test.ts 7/7, router.test.ts 5/5, store.test.ts 12/12, src/whatsapp-review/review-source.test.ts 9/9.
- `npx tsc --noEmit -p .` -> exit 0.
- Native proof (opt-in, disposable local mongod 7.0 on 127.0.0.1:27932, replica set, temp dbpath in scratchpad, no .env, no production URL; stopped afterwards): `LKB_WHATSAPP_CONSENT_MONGO_RUN=1 ... node --test --import tsx src/whatsapp/review/consent-race-mongo.test.ts` -> pass 2, fail 0, `race outcomes over 50: {"approvalFirst":21,"withdrawalFirst":29}`.

## D-015: the issue's own recorded reproductions (ISS-WAVECTORLESS-002)
The row records one reproduction: "pause approval after checkEvidence source read; tenant owner updates sources.consent.given=false and commits; resume approval". Reported by issue id: ISS-WAVECTORLESS-002: 1/1 recorded reproduction refused on all three engines: fixture protocol (consent-cas.test.ts 7/7, whose first test is this attack), the new isolation-model sweep (every read/write position, including "read, then withdrawal commits, then fence", refuses with the candidate still needs-review and 0 published), and the native replica set (consent-race-mongo.test.ts withdrawal-first barrier case, re-run this session, pass).
Left open (named, with reason): the row's remaining ask "production withdrawal caller". `withdrawWhatsAppSourceConsent` still has no non-test caller and, per grep over apps/packages/scripts/workers, nothing in production withdraws source consent at all. Who may withdraw, through which surface, and the audit trail are a product/ownership decision, so this unit adds no caller; filed as ISS-W6-001. The row therefore stays `open`; its real-Mongo concurrent-run ask is evidenced here and in wavectorless002-cas-race.

## Findings worth the checker's attention
- The CAS fix the brief asked to "implement" is already on HEAD (apps/api/src/whatsapp/review/store.ts:43-76, commit 382e0c14). This unit's deliverable is the deterministic no-Mongo proof of it, not a product change.
- Fidelity limit of the fixture model: transactions are still serialized with each other (as before), and the model is single-version-history snapshot isolation, not WiredTiger. The native test remains the arbiter for Mongo specifics. As in the earlier unit, under snapshot isolation the fence's consent/revision filter and the withdrawal's revision filter are defence in depth and the shared-row write (M3) is the load-bearing mechanism; the older consent-cas.test.ts (plain model, no conflicts) kills filter-only mutants.
- Tenant scoping: the withdrawal's tenant guard had no refusing test for a foreign tenant until C3 (M6 survived all older tests).

## Capability coverage
Criterion C1 -> M3, M5. Criterion C2 -> M3. Criterion C3 -> M6.

## Cleanup
Disposable mongod (port 27932) stopped; scratch data under the session scratchpad. review-mut copy deleted (no junctions inside). store.ts blob equals HEAD.
