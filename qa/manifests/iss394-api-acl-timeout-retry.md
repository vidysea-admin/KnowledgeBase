# iss394-api-acl-timeout-retry

**Handshake status:** checked-PASS — closed out 2026-10-26 by maker, dual check: A qa/verdicts/iss394-api-acl-timeout-retry.md (15758604) + B qa/verdicts/iss394-api-acl-timeout-retry.b.md (7c834027); merged to docs/devops-golive-2026-10-26
Status: checked-PASS — closed out 2026-10-26 by maker, dual check: A qa/verdicts/iss394-api-acl-timeout-retry.md (15758604) + B qa/verdicts/iss394-api-acl-timeout-retry.b.md (7c834027); merged to docs/devops-golive-2026-10-26
**Date:** 2026-10-26
**Fix cycle:** 0 of max 2
**Dual check:** required
**Issues addressed:** ISS-394
**Executor:** claude-sonnet-subagent
**Executor rationale:** single-file mirror of an already-reviewed change (9d05aaec); one builder, no external model.

## What changed
- apps/api/src/bot-privacy/private-acl.ts:54-57 â€” the single `run(...)` call (timeout 5000) became `launch()`; `let result=launch(); if(result.error.code==="ETIMEDOUT")result=launch();`. Exactly one retry, on ETIMEDOUT only; a second timeout or any other failure still reaches `nativeUnavailable` and fails closed. `deadlineMs` stays 5000 per launch, so the total is bounded at 2 x 5000 ms (same as packages/meeting-bot record-consent/private-acl.ts:54-57). File CRLF endings preserved (4 insertions, 1 deletion).
- apps/api/src/bot-privacy/private-acl.test.ts (new test file, no existing API test covered this module) â€” mirror of the 9d05aaec test: timeout-then-success accepted after 2 launches; timeout-twice refused as `deadline` with no third launch; EPERM and exit-1 PermissionDenied not retried (1 launch); first-success is 1 launch.
- unchanged: packages/meeting-bot/.../private-acl.ts (already has the retry), host-connector.ts, private-acl.ps1.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (security: the privacy ACL publisher decides whether a host recording directory is private; the change alters its fail-closed timing path)
Round: 3 files, 2 criteria, est 15 min — one-line mirror of 9d05aaec plus its test and this manifest
dual-trigger: security apps/api/src/bot-privacy/private-acl.ts:54
Base sha: b3eabbeede7fd444b6ccdea42832be8a1d54e6ae
Base / checked state: code commit 11a40951, base b3eabbee, branch iss394-api-acl-timeout-retry
Affected tests / full-suite trigger: apps/api/src/bot-privacy/private-acl.test.ts. Sibling consumers (apps/api/src/bot-privacy/router.test.ts, apps/api/src/source-intake/jobs/privacy.test.ts) could not be loaded in this worktree (ERR_MODULE_NOT_FOUND express / @lkb/ingest: no node_modules installed in the isolated worktree); they inject the `run` stub or use the real call and the signature `verifyPrivateDirectory(directory, run)` is unchanged, so they are not behaviour-affected. Builder ran no full suite.
Tests[C1]: apps/api/src/bot-privacy/private-acl.test.ts::native ACL retries exactly once on ETIMEDOUT only and fails closed otherwise â€” covers retry-then-success, double-timeout, non-timeout not retried
Tests[C2]: apps/api/src/bot-privacy/private-acl.test.ts â€” the test is the D-015 replay of the issue's slow-start case
Sibling: packages/meeting-bot/src/capture/record-consent/private-acl.ts:54-57 â€” not affected, already carries the retry (unchanged)
Pre-check[C1]: 11a4095 node --test --import tsx apps/api/src/bot-privacy/private-acl.test.ts -> pass 1, 0 failed t=2 blobs=apps/api/src/bot-privacy/private-acl.test.ts:9b30808
Pre-check[C2]: 11a4095 node --test --import tsx apps/api/src/bot-privacy/private-acl.test.ts -> pass 1, 0 failed t=2 blobs=apps/api/src/bot-privacy/private-acl.test.ts:9b30808
Falsification[C1]: golden apps/api/src/bot-privacy/private-acl.test.ts red-before (base b3eabbee, ACL unavailable thrown at test line 17, the timeout-then-success case) / green-after (pass 1)
Falsify[C1]: private-acl.test.ts red@b3eabbee green@11a4095

## Falsification (mutations in COPIES under the scratchpad, never the bound tree; D-020)
Script: scratchpad iss394-mut.mjs copies private-acl.ts + test to a per-mutation directory, mutates the copy, runs the test; worktree hash-checked afterwards (git hash-object private-acl.ts = 53ac2c2320238228b2f8c0b836d49338de9296ee, `git status` shows only the 2 unit files + this manifest).
- copy of fix, unmutated -> exit 0, pass 1 / fail 0
- mut_no_retry (retry line removed) -> exit 1, fail 1 (timeout-then-success refused)
- mut_retry_any_failure (retry on any error/non-zero status) -> exit 1, "AssertionError: Missing expected exception" (non-timeout failure retried to success)
- mut_retry_twice (loop up to 2 retries) -> exit 1, "AssertionError: Missing expected exception" (double-timeout then success accepted)

## D-015 â€” the issue's own recorded reproductions, by issue id
- ISS-394 recorded: "native ACL call measured 335-500 ms vs 5000 ms deadline on a quiet host" -> re-run now: 439 ms, exit 0, no timeout (quiet-host baseline reproduced; no retry consumed).
- ISS-394 recorded: "5.3-6.0 s on a CPU-100% host" -> NOT reproduced live (needs a saturated host; non-deterministic, would not be a creditable regression). Its failure mode (first launch ETIMEDOUT, host recovers) is replayed deterministically: timeout-then-success was refused at base b3eabbee (red) and is accepted after exactly 2 launches on the fix. ISS-394: 1/1 recorded failure mode now accepted; 0/1 recorded host-load timing run live (named, reason above).
- Residual (named): a host where BOTH launches exceed 5 s still fails closed by design (issue fix_direction: keep default 5000 ms and fail-closed).

## How to verify
- `node --test --import tsx apps/api/src/bot-privacy/private-acl.test.ts` -> expected: pass 1, fail 0 (win32 only; skipped elsewhere)

## Actual outputs
`âœ” native ACL retries exactly once on ETIMEDOUT only and fails closed otherwise` / `â„¹ tests 1 â„¹ pass 1 â„¹ fail 0`

Metrics: policy=proportional-verification/2026-10-19.17 suite_runs=0 mutations=3 cycle=0
