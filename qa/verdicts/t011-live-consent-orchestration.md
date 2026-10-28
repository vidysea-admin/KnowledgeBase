# Verdict: t011-live-consent-orchestration (T-011), non-live criteria only, quiet-host re-check

VERDICT: PASS (non-live criteria). Live criteria and the parent T-011 stay HOLD (need the live deploy).
Cycle checked: 1
Reviewed tree: HEAD fd894426 (bound D:/KnowledgeBase). The prior verdict's lane SHA 150700ff is not an object in this repo; the three cycle-1 files are the committed blobs of 0f3d9bb4 (privacy.ts ccc09086, unchanged).
Prior same-cycle HOLD archived: qa/verdicts/t011-live-consent-orchestration.r1-1.md. Tier M, as dispatched, no raise.
Policy: proportional-verification/2026-10-19.17

## Check plan
Re-run the only blocked item (known-clock bridge, native ACL) on a quiet host; re-judge the remaining non-live criteria on validated identity only.

## Findings
1. Known-clock bridge test, 3 runs, fresh UUID protected fixture (native-acl-fixture.ps1 Create, LKB_PRIVATE_ACL_PROBE_DIR), `node --test --import tsx --test-name-pattern=known-clock`: 3/3 PASS, test elapsed 10132 / 9660 / 9871 ms (file wall 21837 / 21235 / 22991 ms). The "publish native ACL and sealed readiness" step, the former failure point, took elapsedMs 1158 / 981 / 972. Host: powershell cold start 198 ms, CPU 32%. The pattern also matched unknown-clock, which passed 3/3 as well (11244 ms in run 1). Logs: qa/evidence/t011-quiet-host-recheck/run{1,2,3}.txt.
2. Full non-live set in one process, same fixture: controller-bridge (known-clock, write-failure, unknown-clock), privacy 10, coverage 1, private-acl 4 = 18/18 pass, 0 fail/cancelled/skipped (full.txt). Child cleanup clean every run (exit code=0, no forced termination). write-failure and unknown-clock, unverified last time, now pass.
3. Adjacent suites finalizer-input, provider-input, downstream, context: 14/14 pass. Typecheck packages/meeting-bot `tsc --noEmit`: rc 0, 12 s (the earlier context.ts:73 TS2532 narrowing holds). apps/api tsc: 10 TS errors, all missing third-party modules (ajv, @langchain/langgraph, pdfjs-dist) in unrelated files; none in bot-privacy or record-consent.
4. Deadline question: native ACL call alone measured 335-500 ms (5 probes, one launch each, aclprobe.mts.txt) against the fixed 5000 ms deadline: more than 10x margin. The prior timeouts (5.3-6.0 s) were the CPU-100% host. Not a defect of the unit. Not a FAIL.
5. Identity validation. Reused unchanged evidence: EPIPE `deliver()` falsification (mutation killed 5/10 in privacy.test.ts) is valid because privacy.ts HEAD blob is still ccc09086 and privacy.test.ts has a single commit; no new mutant. Manifest pin drift (not a product defect): finalizer-input.ts and provider-input.ts hashes differ from the manifest table (changed in wave commit 0f3d9bb4, unchanged since); their tests pass.
6. Product change since the first HOLD, read in full: private-acl.ts (packages copy) now retries ONCE on ETIMEDOUT only (commit 9d05aaec, "F-1"); second timeout or any other failure fails closed; covered by a passing test. Safe. Side effects, both low: the cause still reports deadlineMs 5000 though worst case is 2 launches (about 10 s); and the manifest line "both equivalent readonly verifiers" is now false (see ISS-394).

## Ledger (single check, checker writes)
ISS-394 medium availability (PROPOSED/file-don't-fix): apps/api/src/bot-privacy/private-acl.ts:54 has no ETIMEDOUT retry, packages/meeting-bot/.../private-acl.ts:54-57 has one; the API connector still fails closed on a single slow PowerShell start. The 5000 ms constant is not otherwise a defect.

## Not verified
Live criteria (connected candidate, actual host/profile/media, live controls/ACK, unattended overlap, cited ingest/Ask), the central broker compiler rerun of apps/api. Parent T-011 stays open.

Metrics: start=2026-10-26T22:08:00+05:30 end=2026-10-26T22:21:00+05:30 wall_min=13 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=3 mutations=0 cycle=1 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=780 mutants=0 defects_unit=0 defects_6c=0
slow: protocol-and-identity-reading 8 (3 bridge runs about 22 s each, 18-test set 41 s and tsc were under 3 min together; passed the 10-min hard checkpoint, process row ISS-395)
Evidence: qa/evidence/t011-quiet-host-recheck/ (run1-3.txt, full.txt, aclprobe.mts.txt). Fixture e580e6ee-6e1e-4605-8708-c53315d3c98a created and removed by Cleanup (rc 0); no child processes left.
ISSUES-WRITTEN: ISS-394, ISS-395
