# Checker verdict: w17-champproof

VERDICT: FAIL
Status: FAIL
Cycle checked: 1
Reviewed SHA: ec78833c5403b93da9b666bb57e76b069340d0bf
Base SHA: 9e55b6428c5f000e1bc25b24bd0a52ed11473b54
Lane: C:\Users\product\Desktop\KnowledgeBase-lanes\w17-champproof (lane/w17-champproof)
Checked at: 2026-10-17T17:27Z
Origin: closes F2 of qa/verdicts/w17-quotehash.md (lane w17-quotehash)
ISSUES-WRITTEN: none (this checker commits only this file; recommend filing F1 as a high, security-class row)

## Identity
- HEAD = ec78833c..., the parent is 9e55b642, and the worktree is clean apart from checker evidence. The manifest says `Fix cycle: 1`, and no earlier verdict exists.
- Diff: apps/api/src/routes/championship/championship.ts (+21/-1), apps/api/src/championship/mongo-store.ts (+2), the new championship-proof.test.ts, and the manifest.

## Checks (run independently, one at a time, `timeout 600`, from apps/api, node v24.19.0)
Evidence directory: qa/evidence/w17-champproof-checker/ (not committed)
| # | Command | Exit | Result |
|---|---|---|---|
| t1 | node --test --test-force-exit --import tsx src/routes/championship/championship-proof.test.ts | 1 | 5/5 tests pass, then a libuv `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94` crash at teardown. Deterministic on rerun (t1b). |
| t1c | same file without --test-force-exit (the package `test` script form) | 0 | 5/5 |
| t2 | championship.test.ts | 0 | 1/1 |
| t3 | championship/mongo-store.test.ts | 0 | 3/3 |
| t4 | championship/runtime.test.ts | 0 | 5/5 |
| t5 | tsc --noEmit -p tsconfig.json (apps/api) | 0 | clean |
| t6 | checker probe probe.test.ts | 0 | 3/3 (see F1 and the no-write check) |

The suites used an in-memory Mongo double (answer-testdb.ts) and a loopback-only express listener. No real Mongo and no network were used.

## D-020 mutation (checker-owned)
Harness: mutate-verifier-ok.sh forces `ok = true` after the verifier call in `reverifyTrials`. It uses a per-mutation mktemp backup, an idempotent `trap restore EXIT INT TERM ERR` and `timeout 600`. The mutant was applied (count 1). **KILLED**: 4 of the 5 proof tests failed (turn changed, turn missing, cross-tenant, no verifier). The file was restored and `cmp` passed. HEAD fidelity: `git -c core.autocrlf=true hash-object` = 9edbc8e9fa859d01c937ee88964cd1f073a4dbe0 = `HEAD:` blob.

## Key question: does this path use the same verifier as the other saved-answer paths?
**No.** The answer-history, get, queue and conflicts paths all use the verifier composed in apps/api/src/composition/integrations/answers.ts:58-59:
`createMongoEvidenceVerifier(input.db, undefined, visibility.eligibleTurn, input.nativeEvidence)`. That means web is undefined (it refuses web, the same as this unit), the visibility `eligibleTurn` is supplied, and the native resolver is supplied. This unit uses the bare `createMongoEvidenceVerifier(db)` (mongo-store.ts:34), which lacks both. The consequences:
- **F1 (high, security class: consent/visibility), proven.** Without `eligibleTurn`, the visibility checks in apps/api/src/visibility/knowledge.ts:41-50 are skipped: `source.consent?.given === false`, the whatsapp-review provenance check and source-kind gating. The probe sets up a recording source with `consent: { given: false }` and hash-valid proofs. The composed answer-workflow verifier returns **false**, while the candidate's GET /championship/:id **serves the quote** (probe tests 1-2). This is not a regression from base, where everything was served, but the unit's stated parity ("as every other saved-answer path does", championship.ts:19) is false. A consent-withdrawn quote stays served on this path.
- **F2 (medium, functional regression).** Without `nativeResolver`, answer-evidence.ts returns false for any native (document-page/message) evidence, and without `eligibleTurn` it returns false for whatsapp/whatsapp-batch sources. Valid native- and whatsapp-sourced trials are stripped on read, although the other saved-answer paths would keep them. Web-sourced trials are refused on both paths, which is parity and acceptable.

**Required change (it needs composition/**):**
1. Extract one shared constructor so the paths cannot drift. For example, in answer-evidence.ts: `export const createComposedEvidenceVerifier = (db: Db, native?: NativeEvidenceResolver) => createMongoEvidenceVerifier(db, undefined, createKnowledgeVisibility(db).eligibleTurn, native);`. Use it in answers.ts:58-59.
2. `createMongoChampionshipStore(db, options: { verifyEvidence?: VerifyEvidence } = {})` sets `verifyEvidence: options.verifyEvidence`. Remove the bare default; an absent verifier already fails closed.
3. In apps/api/src/composition/integrations/evaluation.ts, add `nativeEvidence?: NativeEvidenceResolver` to `EvaluationIntegrationInput` and build `createMongoChampionshipStore(db, { verifyEvidence: createComposedEvidenceVerifier(db, input.nativeEvidence) })`. No production.ts change is needed, because production.ts:281-282 already passes `nativeEvidence: native.resolver` in the shared `input`.
4. Tests to add: a consent-withdrawn trial is stripped (invert probe test 2), and a native-sourced trial with a resolver that returns current evidence is kept.

## Other brief items
- **No write on GET / no state leak: OK.** `reverifyTrials` builds new event, trial and aiAnswer objects and never calls `store.replace` or `create`. Probe test 3 shows replace/create were never called and the object returned by `store.get` was not mutated. POST freeze and POST trials re-read through `store.get`, so `state: "stale"` lives only in the response. The `trials` copied into `championshipReport(checked)` carry `state`, and `missingSourceEvidenceRunIds` now lists stripped trials. That is consistent, because the trials really have no verifiable sources. The score totals and recorded counts are unchanged. `state` does not exist on the trial model, so it collides with nothing.
- **Tenant scoping: OK.** The verifier receives `req.auth.tenantId`. createMongoEvidenceVerifier calls `assertValidTenantId` and runs sessions, sources and turns lookups with `tenantId`. The cross-tenant turn case is stripped (maker test, and it also fails under the mutant).

## Findings (with fixes)
- F1 (high): mongo-store.ts:34 and evaluation.ts:42. Fix as in steps 1-4 above.
- F2 (medium): the same fix.
- F3 (low, test hygiene): under `--test-force-exit` on Windows, championship-proof.test.ts crashes the process at teardown after all tests pass. The likely cause is keep-alive sockets from `fetch` still open when the process exits. Fix: in `close`, call `server.closeAllConnections()` before `server.close`, or send `connection: close`.

## Ledger
No qa/issues*.jsonl rows exist for this unit. Nothing may be flipped. F2 of w17-quotehash remains **open** until a cycle that uses the composed verifier passes.

## Not verified
- Real Mongo and the production composition at runtime (verified by code reading only).
- Native-resolver behaviour end to end. F2 is established by code: answer-evidence.ts returns false when `!nativeResolver`.
- The maker's extra runs (stale-citation-refusal, native-answer-evidence) were not re-run.
- Budget: maker usage was not supplied, so this is BOOTSTRAP_REVIEW with the ratio unverified. Checker active time was about 170 s (1792257896 to 1792258067, before the verdict was written). Tokens are unknown (null). review_budget.py assess was not run.
