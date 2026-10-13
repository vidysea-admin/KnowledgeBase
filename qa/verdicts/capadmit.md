# Verdict: capadmit

VERDICT: FAIL
Cycle checked: 0

## EXPLANATION
Product code is correct; the unit's only proof is flaky.

Reproductions (ISS-CAPTUREFIX-001 records no numbered corpus; single live-run timeline): lobby whole run, admitted, admission_timeout each 3/3 designed cases, but run solo 13 times the new admitted test failed 5 of 13 (states=recording, "starting" never sampled), and in the full meeting-bot suite (69 files) both the lobby and admitted runRecord tests failed (~10.3 s). lobbywatch's 4 admission-gate reproductions: unchanged and green.

Read-through: tab-browser.ts stays starting until admitted, guarded by failure and stopped; record-commands.ts sends Joined once on admitted; gate.state is lobby/admitted/failed. Timeout path never reaches recording (typed failure). Denied/unknown ends only at admission_timeout, never recording. OBS has no status file, Joined is gated. No flag required: no contract or T-034/T-035 manifest mandates one; this tightens a status invariant. Consumers: controller-state.ts accepts "starting" (and recovery handles it); web and API "recording" strings are job statuses, not the tab status file. lobbyzt (bf4c6bdb) now emits admitted for every platform with the same event names: git merge-tree HEAD lane/capadmit is clean (no conflicts); a built trial worktree was not run.

Suite: 818 tests, 813-814 pass, failures = the two new tests above plus the two known Windows ones (symlink EPERM, interrupted recovery). tsc clean. lint-loc: only the known stale docs/SNAPSHOT.md stage fails.

Mutations (hash-verified, restored, HEAD blobs match): M1 status always recording KILLED; M2 Joined fired on opened KILLED; M3 gate ignores timeout KILLED (gate.state test); M4 admitted no longer promotes: INCONCLUSIVE (same 3 pass/1 fail as the flaky baseline). 3/4 killed.

Required for PASS: make the status sampling independent of controller poll timing and show 20 solo plus 5 full-suite runs green.

ISSUES-WRITTEN: ISS-CAPADMIT-001
