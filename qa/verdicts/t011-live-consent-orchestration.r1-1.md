# Verdict: t011-live-consent-orchestration (T-011), non-live criteria only

VERDICT: HOLD
Cycle checked: 1
Reviewed SHA: 150700ffc00a912a3eab6fd5e986ab337f0a0403
Base: a9fac545 (lane w16-t011clock). Reason class: ENVIRONMENT (not a product FAIL).

## Diff reviewed (git diff a9fac545 150700ff)
privacy.ts, controller-worker.fixture.ts, controller-bridge.test.ts, manifest. Only these three source files changed.

## Findings
1. EPIPE fix (privacy.ts deliver()): CORRECT. send() now gets a no-op callback so async EPIPE is consumed; sync throws are still swallowed as before. Ack semantics unchanged. It cannot mask a real ack failure: the parent client (controller-client.ts:16-31) resolves "accepted" only on a validated ack with matching requestId/token, else times out "unavailable", and the receipt governs exclusion. Own mutation (deliver body replaced by `void value`, so no acks sent): privacy.test.ts 5 pass / 5 fail, killed; restored, git hash-object == HEAD blob (ccc09086...).
2. Fixture-ready handshake: test-only. `t011-fixture-ready` appears only in controller-worker.fixture.ts and controller-bridge.test.ts (grep of all ts/js/mjs, no production reference). Production controller-client ignores unknown messages (no matching requestId). OK.
3. Known-clock bridge test, 3 runs with a fresh UUID protected fixture (native-acl-fixture.ps1 Create, LKB_PRIVATE_ACL_PROBE_DIR): runs 1(rerun after a shell 127 launch error), 2, 3 ALL fail at "publish native ACL" with cause native-acl-process / deadline / ETIMEDOUT, elapsedMs 5353/5626/5280, deadlineMs 5000. Child cleanup was clean each time (exit code=0, no forced kill). Host CPU 100% (LoadPercentage), powershell fixture Create alone took 12 s. Not provable PASS or FAIL on logic -> HOLD on environment. Rerun needed on a quiet host.
4. privacy.test.ts 10/10, coverage.test.ts 1/1 pass.

## Finding F-1 (product risk, medium, file-don't-fix unless Approver opts in)
private-acl.ts:54 `timeout:5000` (also deadlineMs:5000 at line 18) is a fixed constant. On a slow or loaded host, Windows PowerShell 5.1 cold start alone exceeds 5 s, so the privacy publisher fails closed (private capture unavailable). Fail-closed is safe for privacy but is an availability risk and makes the known-clock test unrunnable on loaded hosts. Suggested fix (Approver decision, security/policy constant): make the deadline configurable via a bounded env value (e.g. 5-30 s) or retry once on ETIMEDOUT; keep default 5000.

## Not verified
Known-clock full pass, write-failure/unknown-clock scenarios, typecheck, live criteria.

## Ledger rows
Do NOT flip. Maker must not close out until a quiet-host known-clock pass.

Evidence (outside repo): ../w16-t011clock-chk/ (bridge-1b/2/3.txt, privacy.txt, coverage.txt, mut-privacy.txt, summary.txt). Fixture dir: qa/evidence/native-acl-fixtures/8e992dd8-481d-4824-8f1e-f99c8bfd9f51 (untracked, not committed).
ISSUES-WRITTEN: none
