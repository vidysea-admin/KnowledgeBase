# Manifest — wavectorless002-cas-race

Status: ready-for-check
**Handshake status:** ready-for-check
**Contract:** none (advances ledger row ISS-WAVECTORLESS-002, qa/issues.WAVECTORLESS.jsonl line 2; row not edited)
**Goal task:** none
**Date:** 2026-10-26
**Fix cycle:** 0 of max 2
Fix cycle: 0
**Dual check:** no (diff is one test file; no security/auth/tenancy/prod-write product code touched, no dual-trigger line applies)
**Issues addressed:** ISS-WAVECTORLESS-002 (advance only; stays open: no production caller of withdrawWhatsAppSourceConsent, see Open)
**Executor:** claude-sonnet-subagent
**Executor rationale:** one-file test addition against a real disposable mongod; no delegation needed

## What changed
- apps/api/src/whatsapp/review/consent-race-mongo.test.ts (edited in place, +73 -1): imports `withdrawWhatsAppSourceConsent`; new opt-in test "concurrent withdrawal vs approval x50 on a real replica set". Per iteration: fresh random tenant, `store.decide(approved)` and `withdrawWhatsAppSourceConsent` fired together via `Promise.allSettled` (withdrawal start jittered 0-8 ms so the overlap point sweeps the approval's life), then final-state assertions.
- No product code changed. store.ts hash equals HEAD blob (83c598c8). The race exposed no product bug.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: S (test-only diff, one file; test is opt-in via LKB_WHATSAPP_CONSENT_MONGO_RUN=1 and skipped otherwise)
Round: 1 files, 2 criteria, est 30 min — one test file plus a disposable mongod, no product change
Base sha: b3eabbeede7fd444b6ccdea42832be8a1d54e6ae
Base / checked state: code sha 5cf78909 (manifest committed after it; manifest-only follow-up commit)
Gate answers: none (no gate files touched)
Affected tests / full-suite trigger: consent-race-mongo.test.ts (both tests), consent-cas.test.ts, consent-race.test.ts; no safe-fallback trigger; no full suite run.
Tests[C1]: apps/api/src/whatsapp/review/consent-race-mongo.test.ts::"concurrent withdrawal vs approval x50" — the new race
Tests[C2]: apps/api/src/whatsapp/review/consent-race-mongo.test.ts::"native consent/approval serialization" (the row's recorded reproduction: pause after source read, withdraw, resume) plus consent-cas.test.ts
Falsification[C1]: copy-mutant M3 (fenceApproval returns immediately, copy of apps/api at apps/.mutapi) red: "iteration 0: approval fence and withdrawal must each bump the revision exactly once"; control (no mutation) green; copy deleted
Falsification[C1b]: copy-mutant M5 (consent check removed from checkEvidence AND consent/revision filter removed from fence) red: "iteration 0: only a consent refusal may reject approval" (actual: whatsapp_native_publication_unavailable, i.e. only the materializer's own recheck still refused); control green
Falsification[C2]: M3 and M5 both also turn the recorded-repro test red (both runs showed 2 failing, first test included)
Pre-check[C1]: 5cf78909 node --test --import tsx src/whatsapp/review/consent-race-mongo.test.ts -> green 2 passed, 0 failed on a real mongod 7.0.24 replica set with LKB_WHATSAPP_CONSENT_MONGO_RUN=1 (50 races {"approvalFirst":30,"withdrawalFirst":20}; also 200 races {"approvalFirst":130,"withdrawalFirst":70}, 2 passed) t=5 blobs=apps/api/src/whatsapp/review/consent-race-mongo.test.ts:6934a0f
Pre-check[C2]: 5cf78909 node --test --import tsx src/whatsapp/review/consent-race-mongo.test.ts src/whatsapp/review/consent-cas.test.ts src/whatsapp/review/consent-race.test.ts -> green 14 passed, 0 failed with the mongo env set on a real replica set (recorded native repro passed; cas and race files 12 of 12) t=8 blobs=apps/api/src/whatsapp/review/consent-race-mongo.test.ts:6934a0f
Metrics: start=2026-10-26T22:40 end=2026-10-26T23:20 wall_min=40 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=3 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=3 defects_unit=0 defects_6c=0

## Acceptance
- C1: a concurrent race test on a REAL disposable mongod asserts, over 50 races, never an approved candidate/claim whose source was withdrawn first, and exactly one of the two wins each race (approval-first or withdrawal-first, classified from the final state).
- C2: the row's own recorded reproduction re-run and reported by issue id (D-015).

## How to verify (commands + expected)
Disposable mongod (not a repo dependency; the machine's installed C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe, temp dbpath in the session scratchpad, 127.0.0.1:27931, `--replSet rsrace`, one-node `replSetInitiate`; no download, no .env, no production URL). From apps/api:
- `LKB_WHATSAPP_CONSENT_MONGO_RUN=1 LKB_WHATSAPP_CONSENT_MONGO_URI="mongodb://127.0.0.1:27931/?replicaSet=rsrace" LKB_WHATSAPP_CONSENT_MONGO_DB=lkb_wa_consent_test_race1 node --test --import tsx src/whatsapp/review/consent-race-mongo.test.ts` -> expected: pass 2, fail 0, a `race outcomes` diagnostic summing to 50.
- Without the env var the file reports 2 skipped and the unit suite stays green: `node --test --import tsx src/whatsapp/review/consent-race-mongo.test.ts src/whatsapp/review/consent-cas.test.ts src/whatsapp/review/consent-race.test.ts` -> tests 14, pass 12, skipped 2.
- mongodb-memory-server is NOT in pnpm-lock.yaml (0 matches), so it was not used or added.

## Actual outputs
- ✔ native consent/approval serialization (324 ms); ✔ concurrent withdrawal vs approval x50 (4045 ms); race outcomes over 50: {"approvalFirst":30,"withdrawalFirst":20}; pass 2 fail 0. Repeat runs at 50: 32/18, 29/21; at 200: 131/69, 133/67, 130/70. Both linearizations occur in every run, so the test is not vacuous.
- Invariants per race: withdrawal always fulfils; approval either returns ok or rejects with the consent/fence refusal only; final consent.given is false; approval-first => candidate approved, 1 claim, revision 2, and the approval transaction's own in-txn read of the source saw {consent:true, revision:1} at publish time; withdrawal-first => candidate needs-review, 0 claims, revision 1.

## D-015: the issue's own recorded reproduction (ISS-WAVECTORLESS-002)
The row's reproduction is "pause approval after checkEvidence source read; tenant owner sets consent.given=false and commits; resume approval". Reported by issue id: ISS-WAVECTORLESS-002: 1/1 recorded reproduction refused on a real replica set (consent-race-mongo.test.ts withdrawal-first barrier case: approval rejected, candidate needs-review, 0 claims, consent false), plus the in-memory fixture version consent-cas.test.ts 7/7 (re-run, 12/12 together with consent-race.test.ts). New this unit: 50 and 200 unpaused concurrent races on real Mongo, 0 violations.
Left open (named, with reason): the row's second ask, "production withdrawal caller", is unmet: `withdrawWhatsAppSourceConsent` still has no non-test caller; this unit adds no caller (central schema/integration owner decision). The row stays `open`; its real-Mongo concurrent-run ask is now evidenced here.

## Findings worth the checker's attention
- Mutants M1 (fence drops consent+revision filter) and M2 (withdrawal drops its revision filter), each alone, SURVIVE the race test (50/50 green). They are equivalent mutants under MongoDB snapshot isolation: the approval transaction's fence is a write to the same source row, so a withdrawal that commits after the approval's snapshot read produces a WriteConflict and the transaction retries and re-reads consent=false. The revision filter is defense in depth; the load-bearing mechanism is the shared-row write (killed by M3). Recorded here so the CAS filters are not mistaken for the sole guard.
- Defense in depth is layered: with the checkEvidence consent check removed, the materializer still refuses (whatsapp_native_publication_unavailable).

## Capability coverage
Criterion C1 -> M3, M5. Criterion C2 -> M3, M5.

## Cleanup
Disposable mongod PID 27072 started by this session is stopped at the end; its data dir was in the session scratchpad. Copy mutants lived in untracked apps/.mutapi and were deleted (junction removed first); store.ts blob equals HEAD (83c598c8f83756b5...).
