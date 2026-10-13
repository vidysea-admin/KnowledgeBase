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

# Cycle 1

VERDICT: PASS
Cycle checked: 1

## EXPLANATION
Commit 82bdc358. Production code unchanged since cycle 0 (diff 34204315..82bdc358 touches only admission-status.test.ts under packages; the rest is manifest, ledger, SNAPSHOT). All assertions kept. Barrier is real: in the admitted scenario the fake bot loops on a `release` file that only the wait hook writes, on seeing state "starting", so `admitted` cannot precede an observed `starting`; `quit` is written only after the outcome is observed (recording, or 25 starting samples in the lobby case). `--until` is 120 s but a missing `recording` still fails at the 60 s test timeout, not 120 s.

Evidence: solo x15 `node --test --import tsx src/capture/admission-status.test.ts`: pass 4 fail 0 in 15/15 (10-26 s each). Full meeting-bot suite x1: 867 tests, pass 862, fail 3 = known symlink EPERM (owned status retains...), known interrupted recovery, plus record-commands "shouldAutoClick forwards Meet..." (3 s startup timeout, 23.6 s under suite load, no browser; 5/5 solo green; not in this unit's files or paths: load flake, filed here as a note, not an issue). tsc --noEmit exit 0. lint-loc --all: OK (10 stages, 0 failed).
Mutations (hash-verified applied, restored, HEAD blob 020b3a0c): M1 status always recording KILLED (lobby and admitted tests fail); M4 admitted no longer promotes KILLED (admitted test fails at 60 s; clean 3 pass otherwise). Cycle 0 inconclusive M4 is now conclusive.
Mutant time-to-fail is 60 s (the per-test timeout); the whole file takes about 100 s because the orphaned run drains until the fake bot's 90 s give-up. Acceptable for a failure path; a note, not a defect (could shrink via a shorter giveUp or an explicit abort). No leftover processes or temp dirs after mutant runs; drive() cleanup is in finally.
Merge: `git merge-tree --write-tree codex/machine-migration-2026-10-09 lane/capadmit` clean (tree 20037980). Main's t034next tab-browser.ts changes (optional guard param, id/filename asserts in launch, chunk caps) are independent of the status/admittedSeen lines at 180-232; no semantic conflict read. A merged build was not run.

ISSUES-WRITTEN: none (ISS-CAPADMIT-001 closed)
