# Verdict: t039next
VERDICT: FAIL
Cycle checked: 0
Checked commit: d89537f4 (lane/t039next). Tier 3, auth/tenancy: full ceremony.

EXPLANATION:
Product code is sound; the unit fails the definition of done because the host status test is red on this machine and masks the tenant check.

Security review (code + fakes): tenant comes only from req.auth.tenantId; GET uses exact requireScope("send-now") (calendar key, near-miss keys 403, no key 401, host not asked); jobId must match send-now-<14 digits>-<6 hex> before the host is asked (traversal, %2F, %0A, case, length variants all 400); the reader never joins jobId into a path (equality compare only) and joins only a regex-validated tenant id, so a foreign job reads only the caller's directory and answers exactly like a nonexistent one (200 not-running, or launching if young); host serving another tenant gets 403 for every id alike (no per-job existence leak); unreadable/corrupt/stray/foreign-tagged state THROWS -> 503 with a fixed message, no path leaked. Flag off: GET not mounted, test shows deepEqual to a server with no adapter.

Results: session-status.test 4/4; send-now-status.test (api) 6/6 and apps/api full 810/810 (D2_FIXTURE_PYTHON set); apps/api tsc 0; meeting-bot tsc 0; lint-loc --all OK. meeting-bot full 815/818: record-backend and tab-browser symlink EPERM (known), joiners.test "registration actual child timeout" (load flake, 6/6 alone). send-now-host.test: "status: live claim by that job id = running ..." FAILS in 15/15 runs (13x fail 1, 2x fail 2 adding the timing test "launcher that dies at once"): it seeds the claim with a fake start time "T0" (aliveProbe) while the host reads with the real probe, which returns a real start time here -> proven PID reuse -> "launching", expected "running". The manifest's "my 3 new tests pass" is not true on this machine. Because the test aborts at line 183, its foreign-tenant assertion never runs.

Ledger reproductions (ISS-SENDNOWAPI-003, 1 recorded: "launch whose CLI exits after 5 s: API has already answered 202"): 202 still returned by design; GET now reports launching for the first 30 s after a dead launch, then not-running: 1/1 reproduced as an honest-limit, not a defect. 60 s join measurement stays open (manifest says so).

Mutations (hash-verified, per-mutation restore, HEAD blob equal after): M1 tenant hardcoded KILLED; M2 GET scope removed KILLED; M3 jobId end-anchor dropped KILLED; M4 host tenant mismatch ignored SURVIVED (only the pre-existing failures fail); M5 reader swallows unreadable KILLED; M6 throw->200 KILLED. 5/6 killed.

Fix direction (cycle 1): make the host test hermetic (omit probes.startTime when seeding, or inject LiveProbes via options) and move the foreign-tenant assertion into its own test; re-run mutation M4, which must then be killed. No product-code change needed.
ISSUES-WRITTEN: ISS-T039NEXT-001

## Cycle 1
VERDICT: PASS
Cycle checked: 1
Checked commits: 0791518d, 8e723c1f (lane/t039next).

EXPLANATION:
ISS-T039NEXT-001 reproduction (send-now-host.test.ts) now 15/15 runs green, 16 pass / 0 fail each (cycle 0: 15/15 red). Production default unchanged: liveProbes is optional, the only production caller (join-rules-api-host.ts) calls createSendNowDeps() with no options, and readSessionStatus's `probes = {}` default applies for undefined. The tenant test is its own test, with the host serving tenant-a and the caller tenant-b on a job that is running for tenant-a; it asserts forbidden/tenant-not-served. The livenessMs 20_000 change keeps the meaning: the child's exit settles the launch at once (502), and a staying-alive launcher is still 202 in the "launch: 202 ..." test (livenessMs 400) and the other 202 tests.
Results: apps/api full 810/810 (D2_FIXTURE_PYTHON set), apps/api tsc 0, meeting-bot session-status.test 4/4, meeting-bot tsc 0, lint-loc --all OK.
Mutations (hash-verified applied, per-mutation restore, HEAD blob equal after): M1 tenant hardcoded, M2 GET scope removed, M3 jobId anchor dropped, M4 host tenant mismatch ignored (cycle-0 survivor, now killed), M5 reader swallows unreadable, M6 throw->200, L1 exit no longer fails launch, L2 liveness timer rejects, P1 probes not passed: 9/9 killed.
ISSUES-WRITTEN: none
