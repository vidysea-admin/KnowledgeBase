# Verdict - w29-spoolhash
**VERDICT: PASS**
**Cycle checked:** 0
**Reviewed SHA:** 510bc263552a1d724ce8b034fdbdbb02d5a29c0b
**Base SHA:** 4ca0271e3a8be2b6b7efc199280bd165493e9e77
**Reviewer:** Sonnet 5.5 (Opus at weekly limit, so this security unit had a Sonnet review, not the usual Opus review). Review is by diff reading plus tests, a probe and a mutation; no native Windows ACL receipt was produced.

## Checked
1. No URL in audit.jsonl at any stage: secret-spool test 1 greps audit.jsonl after enqueue, claim, renew and finish (no "fixturebearer"); the claim row stores `redacted:sha256:<hash>`. Pass.
2. Secret location and path safety: `<sha256(tenant)>/<jobId>.secret`; jobId must match `^[a-f0-9]{64}$` (jobIdentity, input.ts:26) and tenant is hashed, so no traversal. writeSecret uses O_NOFOLLOW, 0o600, nlink 1, fstat/lstat ino and dev match, fsync, then `verify.artifact`; preflight allows only `^[a-f0-9]{64}\.secret$` plus the 3 known names and verifies each. Pass.
3. Deletion on terminal paths: `retire()` runs before the settled row is appended in update() (finish, uncertain, stale-in-renew), poll stale, claim stale, and the missing or mismatched secret path. Secret-spool tests cover succeeded, uncertain, poll-stale and hash mismatch. My own probe (zz-probe, deleted after run, 3/3 pass) covers claim-stale, renew-stale and uncertain-after-stale: no .secret left, no URL in audit, state uncertain. Pass.
4. Legacy rows replay: legacy test passes (claim returns URL, no secret file, settle redacts). replay checks the marker against the prior row's marker. Pass.
5. Commands (node --test --import tsx, timeout 600, exit 0 each): secret-spool 6/0, jobs 10/0, privacy 12 pass 0 fail 2 skipped (native ACL, pre-existing), url-redaction 3/0 (D-015: the ledger's recorded cases are these), onair-binding 8/0. `tsc --noEmit -p apps/api` exit 0. Outputs in .chk/ (untracked).
6. Mutation (own, backup + trap + timeout): removed `retire(` from the claim stale-lease path. Applied, then secret-spool 6/6 still passed, so the mutant SURVIVES: that exact path has no test. The probe above shows the unmutated code is correct. Restored; cmp ok; `git -c core.autocrlf=true hash-object` = 021f3861... = HEAD blob.

## Findings (EXPLANATION, not new issues)
- Low: add a claim-after-expiry assertion to secret-spool.test.ts (store.ts:123 has no test that fails when `retire` is removed).
- Low: if the journal append throws after writeSecret in enqueue, an orphan `.secret` remains in the ACL-gated tenant dir (fail-safe, not an audit leak).
- Not verified: a native Windows ACL receipt for the new secret file (skipped tests are pre-existing; the verifier is shared with w27-spoolacl).

ISSUES-WRITTEN: none
**Ledger:** ISS-T045WORKER-001 residual (hash-only journal) MAY be flipped to verified at 510bc263. Rows written by earlier builds that hold a URL stay as is (append-only, documented in the manifest).
