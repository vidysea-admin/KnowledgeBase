# Verdict: w23-onairbind (ISS-T045WORKER-002)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: d5ba240ab7d4da01b2479d2e0510ecb90c7ddc7f
Base SHA: 3c99337fb64188bc5ed94b2f058ecf92c8823864
Reviewer: Claude Sonnet 5.5 (checker). NOTE: policy prefers Opus for security units; Opus weekly limit exhausted, so this is a Sonnet review.
ISSUES-WRITTEN: none
Ledger: ISS-T045WORKER-002 MAY flip open -> verified (see residual below).

## Identity
Diff base..candidate = apps/api/src/source-intake/jobs/onair-binding.test.ts (+71) and qa/manifests/w23-onairbind.md (+35). Zero production change
(source-privacy.ts blob e85100860b73 identical at base, candidate and w21).

## 1. "Already fixed at base" - CONFIRMED
At base source-privacy.ts `approvedSourceSession` binds cookie to LKB_ONAIR_SESSION_TENANT/ACCOUNT + exact-key binding rows
(tenant, account, event, actorKeyIds, approvalRef), throws source_session_authorization_unavailable (403) on any mismatch/ambiguity;
`sourceSessionStillApproved` compares fresh authority to the stored job authority. source-jobs.ts: enqueue stamps authority;
authorizeExecution and executeJob's `allowed()` call sourceSessionStillApproved; cookie is deleted from jobEnv unless fresh authority exists;
`allowed()` is rechecked on every index session and every non-DELETE media transport call.
D-015: privacy.test.ts (existing at base) reads the row's 4 recorded reproductions from qa/issues.T045WORKER.jsonl (asserts count 4) and
replays each. Replayed by me: ONAIR-FOREIGN-TENANT, ONAIR-UNBOUND-ACCOUNT, ONAIR-UNAPPROVED-EVENT, ONAIR-BINDING-CHANGED = 4/4 refuse, counts page/tool/provider 0/0/0,
reason authorization-unavailable. Both controls (ONAIR-OWNED-EVENT, ONAIR-PUBLIC-NO-COOKIE) pass in the "controls and fences" test. 0 reproductions left open.

## 2. Tests green and non-vacuous
Green: onair-binding.test.ts + privacy.test.ts: 18 tests, 16 pass, 0 fail, 2 skipped (native ACL / POSIX, platform-gated) - qa/coordination/w23-ck/green.txt
Own mutations on source-privacy.ts (per-mutation byte backup, trap, timeout 300, onair-binding.test.ts only), each caught:
- M1 drop actor-membership check: 1 fail (unapproved event/unnamed actor)
- M2 drop session-tenant check: 1 fail (cross-tenant)
- M3 sourceSessionStillApproved -> return true: 2 fail (replayed authority; revoked/rotated)
- M4 drop event match: 2 fail
- M5 drop ambiguous duplicate-grant guard: 1 fail
Post-run: git hash-object source-privacy.ts = e85100860b739c620025b8051b7bea5db1895a1c = candidate blob. Lane tree clean apart from untracked scratch (removed).

## 3. Execution-time recheck
Confirmed by read: authorizeExecution + executeJob + per-call allowed() re-run sourceSessionStillApproved against current env; removed binding, removed actor,
rotated approvalRef, changed account, rotated cookie -> refused (test 4, plus privacy.test ONAIR-BINDING-CHANGED via runSourceJob).

## 4. tsc (w21-integrate, properly junctioned)
Copied the one test file into w21 apps/api tree, `tsc --noEmit -p apps/api/tsconfig.json`: exit 0, 0 errors; test there 4/4 pass; copy deleted; w21 `git status --porcelain` = empty.
(Maker's 101 errors were an env junction gap; confirmed not in touched file. w21 shares identical source-privacy/test-fixture/worker/types/input blobs.)

## 5. lint-loc --all
Lane: 9/10 stages exit 0; dependencies exit 726, all `no-unresolvable-workspace-import` in apps/web (vitest/react missing in lane node_modules), none in apps/api - environment gap.
w21 with candidate files copied in: OK, 10 stages, 0 failed (exit 0). Copies removed, w21 clean.

## Residual (EXPLANATION, not an issue)
- The production wiring in composition/integrations/source-jobs.ts (authorizeExecution/executeJob) needs Mongo getDb and has no test; the new and existing tests use a test-supplied
  authorizeExecution that mirrors it. Execution-time recheck there is verified by code read only, not mutation. Real host/Mongo run remains separately required.
- Time-based expiry intentionally absent (schema has no expiry field); expiry-by-removal/rotation covered. Policy choice left to Umesh.
- Not verified: browsers, real Mongo, network, full suites.
