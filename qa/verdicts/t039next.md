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

## Cycle 1 (unit t039send, lane/w16-t039send)
VERDICT: PASS
Cycle checked: 1
Reviewed SHA: aac972a9f6441d45f30d23e938f36645b8e72548
Base SHA: a9fac545

EXPLANATION:
Diff base..candidate = manifest + 2 lines in scripts/webinar/send-now-host.test.ts (a comment and `for (i<200 && !existsSync(dump)) await 50 ms`). The loop only waits for the child's argv dump (max 10 s); the following `readFileSync(dump)` still throws if the file never appears, and the `deepEqual` argv assertions at lines 123-125 are unchanged. It removes a race (livenessMs 400 does not guarantee the child wrote the dump before the 202) and weakens nothing. No product code changed.
"Already fixed at base" claims, verified against base a9fac545: (1) ISS-T039NEXT-001: send-now-host.ts:43 has `liveProbes?: LiveProbes`, passed at :90; test line 202 `hermetic = { statusEnabled: true, liveProbes: aliveProbe }` seeds and reads with the same probe; the foreign-tenant assertion is its own test (line 209). TRUE. (2) ISS-T039DUPES-002: base test line 92 job-1.json carries tenantId "tenant-a". TRUE (file passes 17/17).
Runs (node --test --test-force-exit --import tsx scripts/webinar/send-now-host.test.ts, from the lane): 2/2 runs pass 17 fail 0, exit 0. Evidence: scratchpad/t039send-evidence/run1.txt, run2.txt.
Mutation M1 (status() tenant check `tenantId !== tenant` -> `false && ...`, per-mutation byte backup, subshell trap EXIT/INT/TERM/ERR, timeout 600): applied (hash b224e79e -> 369ebf9a), result pass 16 fail 1, the failing test is the "tenant this host does not serve is forbidden" test = KILLED. cmp restore OK; git hash-object == HEAD blob b224e79ee6df3b4f1bdd113807ecd89f489bbdc3. mut.txt in the evidence dir.
Not verified: the before-state race (maker's 4/4 red under load) was not reproduced by me; ISS-T039DUPES-006 (claimLiveRecording survivors) and ISS-SENDNOWAPI-004 are out of this unit's paths and remain open as the maker states; no full suites run (per brief).
Ledger: ISS-T039NEXT-001 already closed; ISS-T039DUPES-002 (status open in qa/issues.t039dupes.jsonl) may be flipped to verified/closed. ISS-T039DUPES-006 and ISS-SENDNOWAPI-004 stay open.
ISSUES-WRITTEN: none
