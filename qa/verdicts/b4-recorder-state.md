# Verdict b4-recorder-state
Cycle checked: 0
VERDICT: PASS
Tier: L (container entrypoint, image config). One checker. Dual check: no. No security/auth/tenancy/prod-write trigger found in the diff (the tar validator is a defence on restore; no write outside the two trees was reproduced).
Policy-Version: proportional-verification/2026-11-22.19
Code 98198314 (entrypoint.sh b8687b3, Dockerfile 9ebedd8, entrypoint-state.test.mjs bf79207). Manifest c1cb27f3. 98198314 stays the judged commit, as the coordinator said.

## Check plan
Re-run the manifest commands in a git-archive copy (no junctions); one falsification per changed criterion in per-mutant copies; read the diff scope; probe the tar validator by hand; measure the real setsid + dash path in WSL where possible; confirm or reject the reviewer's findings 1-3.

## Evidence (own runs)
- `node --test docker/meeting-bot/entrypoint-state.test.mjs`, full file, one process: 31/33 green, 541 s. The 2 reds (C5 ignore-SIGTERM `lease released`; C4 `generation is remembered`: "at least two periodic and one final upload, got 2") are fixed-sleep timing under suite load: each passes alone (C5 twice, 10.9 s; C4 36 s). Not a defect in the criteria; low observation (the manifest itself flagged the fixed sleeps).
- `node --test docker/meeting-bot/image.test.mjs` in the worktree: 11 pass, 0 fail, 4 skipped (docker-gated); file unchanged = B4-I7.
- Diff scope: three files in docker/meeting-bot/ plus the manifest = B4-I5.
- WSL Ubuntu (dash, real setsid, node 22): C5 ignore-SIGTERM, C5 grandchild-ignores-SIGTERM, C1(d), C6 repair all ok.

## Criteria
- B4-C1 (a-d) restore, first boot, truncated tar, hostile tar (../, absolute, outside symlink): tests green; M1 (containment check off) RED, M2 (corrupt-archive refusal off) RED.
- B4-C2 locks: test green (poller.lock and .lkb-tab-capture.lock absent; .lkb-recovery.lock kept).
- B4-C3 lease: M3 (conditional create dropped) RED, M4 (lease_held always true, upload after loss) RED; renew test green.
- B4-C4 snapshot: M5 (generation precondition dropped) RED; invalid tar not uploaded, previous copied first: green.
- B4-C5 SIGTERM: M6 (reap_group disabled) RED; ignore-SIGTERM kill, default 3 s, hung gcloud bounded: green; also green in WSL.
- B4-C6 record-once: M7 (74 to 0) RED, M8 (record status no longer wins) RED. Ruling below.
- B4-C7 attendance loop: M9 (upload-once check off) RED.
- B4-C8 env pass-through: M10 (WEBINAR_VISION_MODEL unset) RED.
- B4-I1, I2, I3, I4, I6: tests green in the full run; manifest falsifications reused (input blobs unchanged). I5 and I7 as above (no isolating falsification possible).

## C6 ruling (amendment rule)
Contract text: exit with the record command's status. Build: exit 74 when that status is 0 and the copy failed or was skipped; the record command's own non-zero status wins. Judged against the amended reading (routine amendment, commit 6b5773f4): a recording made and lost must not exit 0. PASS on that reading; on the literal text alone the build deviates in one case only (record 0, copy failed).

## Mutants
10 of 10 RED for the intended reason, base green, restored. HEAD fidelity: git hash-object equals rev-parse HEAD:<file> for all three docker files in the worktree; the base copy hashes equal too.

## Reviewer findings (second code review), confirmed or rejected by reading
1. Confirmed by reading :249 and :265-267. Breaks no criterion (C1(b) is the object-absent case); fails safe on write. Row ISS-B4RECORDERSTATE-001 (medium).
2. Confirmed; contract-allowed (C6 exits with the record command's status, zero-byte files skipped); the test is deliberate. Product question, row -003 (medium, file-dont-fix).
3. Confirmed in part: the 127 on a reaped pid is real (measured); the unforwarded signal is a millisecond window. No test shows it, C5 and I3 pass; breaks no criterion as measured. Row -002 (medium).
4. Not mine to measure (real start-up time of about 8 gcloud calls): NOT-MEASURED. 5 and 6: low, EXPLANATION only (row -004 carries 5).

## NOT-MEASURED
Real gcloud output formats (404 and 412 error text, describe format); Docker image build (apt repo, gcloud flag check); the `set -m` fallback on a real Linux without setsid; the shutdown budget on real network latency.

## EXPLANATION (low notes, not backlog)
tar_contained splits at the first arrow (GNU tar still refuses the write); the C7 test has a tautological assertion; recordings of a SIGTERM-interrupted tick are not copied; SIGTERM during the doctor gate waits for the doctor; google-cloud-cli and the apt key are unpinned (out of scope per the manifest); fixed sleeps in the C3 renew and C4 periodic tests are fragile under load.

ISSUES-WRITTEN: ISS-B4RECORDERSTATE-001, ISS-B4RECORDERSTATE-002, ISS-B4RECORDERSTATE-003, ISS-B4RECORDERSTATE-004
Metrics: tier=L dual=no wall_min=27 mutants=10 full_file_runs=1 reruns=3 flakes=2 cycle=0
