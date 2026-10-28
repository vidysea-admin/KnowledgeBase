# Verdict: w27-onairexpiry (D-182, OnAir binding 24h expiry, ISS-WEBINARRELEASE-013)

VERDICT: PASS
Cycle checked: 0
Reviewed SHA: ead405c37fee73f635273f7971c2598898fa9d32
Base SHA: 4264418c7488d95e76bc0d86e3920efb0e0ccd72 (commits 5b444a69, bc61d3fa, ead405c3)
Mode: quick ship review

## Checks
1. D-182: docs/DECISIONS.md diff is +15/-0 (additions only). D-182 follows D-181 sequentially. `Approved-by: Umesh`. Both Q/A quotes match the brief's verbatim text ("Keep trying to join (Recommended)", "Expire 24h after event (Recommended)"). PASS.
2. Expiry: source-privacy.ts `approvedSourceSession` (enqueue) throws when `expiresAt <= now`; `sourceSessionStillApproved` (execution) calls the same function with `now`, and source-jobs.ts authorizeExecution, executeJob allowed() and guardedSourceMediaTransport all go through it. `bindingExpiry` requires a strict UTC ISO string; missing, null, empty or non-ISO values throw (fail closed, 403). Only the key set (7 to 8 keys) and expiry gate changed; tenant/actor/event/duplicate/fingerprint logic is untouched (expiresAt is deliberately not in bindingFingerprint). Rows for other events or actors are not expiry-checked, but a malformed expiresAt on any row fails closed. PASS.
3. Ledger: qa/issues.WEBINARRELEASE.jsonl committed diff is 1 line. Parsed as JSON, only ISS-WEBINARRELEASE-013 changed (status open to resolved, note added). 17 unique ids, no duplicate row. PASS.
4. Tests (timeout 600, apps/api): onair-binding.test.ts 8/8 pass (rc 0); privacy.test.ts 12 pass, 2 skipped (native/POSIX prerequisites), 0 fail (rc 0); tsc --noEmit -p apps/api rc 0. The ISS-T045WORKER-002 reproductions in privacy.test.ts still pass with the added expiresAt fixture.
5. Mutation (own, per-mutation backup, trap, timeout 600): removed the `expiresAt <= now` throw. Result: onair-binding fails 2 of 8 (enqueue-after-expiry, execution-after-expiry), named. Restored; cmp ok; `git -c core.autocrlf=true hash-object` b537efb6b5122ae547fab8cb443f3c8628061f37 equals HEAD blob.

## Not verified
lint-loc, the full API suite, browsers, real Mongo and network were not run (out of scope for this quick review). Operator action: every live LKB_ONAIR_SOURCE_BINDINGS row needs expiresAt before deploy, or protected OnAir is refused (documented in D-182).

Ledger rows may be flipped: yes (ISS-WEBINARRELEASE-013 is already resolved by ruling; no further flip needed).
ISSUES-WRITTEN: none
