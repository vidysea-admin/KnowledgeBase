# Verdict: source-delivery-registration-retry

VERDICT: PASS
Status: PASS
Cycle checked: 1
Reviewed SHA: f195ada7dcc1694d423f75bd25380b1e421a935d
Base: a9fac545 (diff base..candidate is manifests only; source reviewed in place and byte-pinned)
Scope: unit only (pre-submit proof + changed-configuration recovery). NOT T-052 acceptance; C9/C10/C11 live gates stay HOLD.

## Identity
Re-hashed, equal to the manifest: sb_join_register.py 1effe057..., test_sb_join_registration_redirect.py c6fd1266..., browser-joiner.ts 7ebbcaa5..., joiners.test.ts e702736e..., registration-workflow.ts 6de9f34f..., registration-workflow.test.ts 673bc59e..., auto-record-policy.ts 6c8512e4..., schedule-state.ts 33d02b72..., schedule-state.test.ts 55d1637a...

## Judgements asked
1. Inactive by default / nothing submits without explicit activation: PASS. runWebinarRegistrations needs (a) a registrationOnly, approved, positively classified, resolved webinar source; (b) a config, which the runner supplies only via LKB_WEBINAR_REGISTRATION_CONFIG runtime paths + verified tenant + a candidate-bound approved policy (resolveRegistrationPolicy). Absent, denied or unapproved policy yields a visible action_required (configuration-required / profile-required / scope-denied) and register() is never called; (c) a register dependency. The sibling provider-candidate modules are not wired here.
2. Retry safety / no duplicate: PASS. A retry happens only when the single prior row for the source is phase=action_required AND carries preSubmitEvidence {disposition "not-attempted", configurationHash} (strict validator schedule-state.ts:105-109), the source message/thread/organizer/url/interval are unchanged, and the current configuration hash differs from the recorded one. Rows in submitting / uncertain / awaiting-confirmation / legacy (no evidence) never resubmit; an interrupted submitting row becomes uncertain on restart. The durable submitting row (fresh attemptId UUID) is committed and read back before register(); a persist failure prevents execution. Idempotency key: one operation row per source (inventory.reviewKey) bound to tenantId/sourceId/sourceMessageId, plus per-attempt attemptId; more than one row per source skips. The not-attempted receipt is produced only by sb_join_register.register_form before the submit entry, is popped for post-entry results, and browser-joiner accepts it only with status action_required (dirty exit, timeout, duplicate or malformed output gives uncertain).
3. 2000 ms child timeout: NOT a product defect; it is host load against a test-only bound. The product default is 120000 ms (browser-joiner.ts) and a timeout is handled conservatively (uncertain/browser_timeout, never submitted, owned cleanup runs). Evidence: the committed test at 2000 ms re-run by me: 9 of 12 subtests fail with uncertain/browser_timeout instead of the expected result (jn.out). A bare node exit costs ~1.0-1.3 s here and each fixture round trip (child + cleanup) took 2.3-5.7 s under load. A copy of the test with ONLY timeoutMs 2000->30000 passes 12/12 plus the 2 sibling registration tests (jn30.out); a separate 5-case probe at 30000 ms passed with elapsed 2.3-4.7 s. Recommendation (test-only, not a new issue or pulled unit): raise the fixture timeoutMs to >=30000 in joiners.test.ts or re-run on idle CPU. The committed lifecycle test must not be claimed green on this host.

## Independent evidence (my commands; outputs under scratchpad t052/)
- registration-workflow.test.ts whole file: exit 0, 13/13 (wf.out), including the 4 pre-submit/recovery cases.
- py/test_sb_join_registration_redirect.py (fixtures read first: node fake DOM + FakeSB/Stub, no browser, no network), repo .venv Python 3.12.10, LKB_NODE set: 16 passed, exit 0 (py.out).
- schedule-state.test.ts: 9 pass / 9 fail; all 9 failures are ERR_MODULE_NOT_FOUND: express from apps/api/src/server.ts (lane has no apps/api node_modules). This is an environment gap in unrelated native-API tests and is UNVERIFIED here. The strict preSubmitEvidence validator test passes.
- Mutation M2 (workflow; own; per-mutation backup, timeout 300, trap, restore): removed the changed-configuration guard (prior?.preSubmitEvidence.configurationHash === configurationHash) -> 2 tests FAIL (pass 11 / fail 2): "proven pre-submit recovery needs changed configuration..." and "persisted action_required cannot ... resubmit". Mutation M3 (py): removed result.pop("submissionDisposition", None) -> test_retry_receipt_proves_only_exits_before_submit_entry FAILED. Both restored; git hash-object equals the f195ada7 blobs (workflow 16aa0ccde..., sb_join_register ca5f79be...); lane git status clean.
- tsc direct: only the 2 unrelated errors (see sibling verdict). verify_contracts.py: PASS by vacuity.
- Not run per rules: "registration actual child timeout" (real Chrome); no real submission. D-015: no filed issue is fixed here. ISS-373/374 recorded reproductions are re-run verbatim inside the 16 Python tests (16/16 green).

## Not verified / limits (retained)
- The 9 express-gap schedule-state tests; the committed joiners lifecycle test is green only via the timeout-only copy; live Windows/Ubuntu process ownership, real organizer form, restart, confirmation and downstream gates remain HOLD (C4-C6, C9-C11).

ISSUES-WRITTEN: none
Ledger rows may be flipped: yes (manifest -> checked-PASS), carrying the two caveats above into the close-out note. T-052 stays in_progress.

## Budget
Checker actual tokens and active time are not exposed by the host (null). review_budget helper not run. Ratio unverified; no escalation requested. Wall time under ~100% shared CPU: lifecycle run ~60 s, py 149 s, tsc 49 s.
