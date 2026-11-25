# Manifest — b4-recorder-state
**Contract:** qa/contracts/recorder-container-state.md (the criteria and invariants are on the Criteria line below; contract at 856258361d20903655360a3c8272eb41c3ad67b3, never edited here)
**Goal task:** none (plan D-227 section 7 Lane B row B4; decisions D-230, D-231, D-233)
**Date:** 2026-11-25
**Fix cycle:** 0 of max 2
**Hold fix cycles:** 0 of 2
**Hold-reopens:** 0
**Resume-reset:** unused
**Capability-redispatch:** 0
**Dual check:** no (the route tool names no dual rule for this diff: `tick.mjs --route HEAD~1..HEAD` printed `{"floor":null,"dual":false,"rules_fired":[]}`; no production DB write, no auth code, no student data. The checker may still raise one: the bucket holds a signed-in Chrome profile and the issuer key, and the restore path extracts an archive that came from a bucket.)
**Persona walk:** skip (no screen, flow or user type changed; a container entrypoint and its image)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one shell script, one Dockerfile block and one test file with a precise contract; no external executor was worthy.

## What changed
Branch `wave/b4-recorder-state` off `85625836`; code and tests at `d753a9a8` (full `d753a9a82a12e0825eb86bed2743ca803731cbf7`). Scope is exactly `docker/meeting-bot/` (`git diff --name-only 85625836 HEAD` lists these three files and nothing else).
- docker/meeting-bot/entrypoint.sh — rewritten in place (same file, same original sequence kept): header documents the new variables; state config; lease (`gcloud storage objects describe/cat/cp/rm`, every take, renew and replace sent with `--if-generation-match`, create-if-absent is `=0`); restore (archive validated by `tar -tzf`/`-tzvf` plus awk, extracted into a stage directory, only then copied over the two trees); periodic and final snapshot (tar excludes `poller.lock`, `.lkb-tab-capture.lock` and `Singleton*`, keeps `.lkb-recovery.lock`; each upload preceded by a lease check; failed tar uploads nothing; failed upload keeps the old object); recording copy (non-empty `*.webm`, each file once); pipeline as a background child with a SIGTERM forwarder, a SIGKILL watchdog after `LKB_STOP_WAIT_S`, final snapshot, lease release; `record-once` mode; attendance loop. With no bucket and no attendance account the original `exec node scripts/webinar/run-pipeline.mjs --run --watch` is untouched. The login VNC block, the `trap 'rm -f "$VNC_PASSFILE"' EXIT`, `unset VNC_PASSWORD` ordering, the stale-lock `rm` lines and the whole doctor gate (`doctor_rc`, `grep -q '^MISSING'`) are unchanged.
- docker/meeting-bot/Dockerfile — one new RUN block installing `gnupg` and `google-cloud-cli` from Google's signed apt repository, which fails the build if `gcloud storage cp --help` or `rm --help` lacks `--if-generation-match`; `CLOUDSDK_CORE_DISABLE_PROMPTS=1` added to the ENV block (no secret). `USER node`, the gws pin and the tini ENTRYPOINT are unchanged.
- docker/meeting-bot/entrypoint-state.test.mjs (new, 22 tests) — runs the REAL entrypoint under `sh` (Git Bash here) with stub `gcloud` (a folder is the bucket, honours `--if-generation-match` atomically, logs every call), `node`, `tar` (only the tar-failure test), `pulseaudio`, `pactl`, `Xvfb`, `xdpyinfo`. Hostile archives are built by a small ustar writer in the test, so no symlink support is needed from the host.
- docker/meeting-bot/image.test.mjs — NOT edited (B4-I7 below).
- falsified (unchanged): none. All falsifications ran on a copy outside the worktree.

Bucket client and precondition flag (contract header asks the manifest to name them): `gcloud storage` (`cp`, `cat`, `rm`, `objects describe`), precondition flag `--if-generation-match` (`=0` create-if-absent, `=<generation read>` replace/delete-if-unchanged). `gsutil` is not used. Objects: `<prefix>/state.tar.gz`, `<prefix>/lease`, `<prefix>/recordings/<path under the recordings dir>`; variable names are in the entrypoint header (`LKB_STATE_BUCKET`, `LKB_STATE_PREFIX`, `LKB_SNAPSHOT_INTERVAL_S`, `LKB_LEASE_TTL_S`, `LKB_LEASE_RENEW_S`, `LKB_STOP_WAIT_S`, `LKB_ATTENDANCE_ACCOUNT`, `LKB_ATTENDANCE_INTERVAL_S`, `LKB_RECORD_URL`, `LKB_RECORD_UNTIL`, `LKB_RECORD_ARGS`, `LKB_RELEASE_DIR`).

## Verification scope
Policy-Version: proportional-verification/2026-11-22.19
Tier: L (judgment, above the null floor: the restored object comes from a bucket and the target holds credentials; the contract itself rates B4-C1(d) and B4-C3 as security-relevant)
Round: 3 files, 15 criteria (C1-C8, I1-I7), est 25 min — one script, one Dockerfile block, one test file
Criteria: `B4-C1`, `B4-C2`, `B4-C3`, `B4-C4`, `B4-C5`, `B4-C6`, `B4-C7`, `B4-C8`, `B4-I1`, `B4-I2`, `B4-I3`, `B4-I4`, `B4-I5`, `B4-I6`, `B4-I7`
Owners: docker/meeting-bot (entrypoint.sh, Dockerfile, entrypoint-state.test.mjs)
Fan-out: one builder, no parallel work; no shared port, DB or state beyond a temp directory per test. SERIAL: the test file ran one process at a time because another agent runs a big suite on this laptop.
Base / checked state: base 85625836; code head d753a9a8; manifest committed after it; worktree clean apart from this manifest.
Gate answers: none — no gate file applies; consent is out of scope (D-210); nothing writes to a database; no push, no deploy, no image push, no gcloud or gsutil call against a real project (the `gcloud` on PATH during every test is the stub).
Affected tests / full-suite trigger: docker/meeting-bot/entrypoint-state.test.mjs (new) and docker/meeting-bot/image.test.mjs (existing, unmodified). No full-suite trigger: nothing outside docker/meeting-bot changed.
Sibling: scripts/qa/container-workflows/bot-smoke.sh — not edited; B4-I3 keeps the no-bucket path as it was (test "B4-C1(a)/B4-I3 no bucket variable"), and image.test.mjs still asserts the smoke needs no network.
Sibling: docker-compose.yml — out of scope (plan B5), not edited.
Pre-check[B4-C1]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C2]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C3]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C4]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C5]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C6]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C7]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-C8]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-I1]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs docker/meeting-bot/image.test.mjs -> 22 passed + 11 passed, 0 failed, 4 skipped (the docker-built-image tests need LKB_DOCKER_TESTS=1 and an image; run as two processes) t=218 blobs=docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-I2]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-I3]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d,docker/meeting-bot/entrypoint.sh:76a4f32
Pre-check[B4-I4]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs docker/meeting-bot/image.test.mjs -> 22 passed + 11 passed, 0 failed, 4 skipped t=218 blobs=docker/meeting-bot/Dockerfile:481832c
Pre-check[B4-I5]: d753a9a8 git diff --name-only 85625836 HEAD -> exit 0, lists docker/meeting-bot/Dockerfile, docker/meeting-bot/entrypoint-state.test.mjs and docker/meeting-bot/entrypoint.sh only t=1
Pre-check[B4-I6]: d753a9a8 node --test docker/meeting-bot/entrypoint-state.test.mjs -> 22 passed, 0 failed (the stub log of every test is scanned for acl, iam, allUsers, public, gsutil) t=215 blobs=docker/meeting-bot/entrypoint-state.test.mjs:651607d
Pre-check[B4-I7]: d753a9a8 node --test docker/meeting-bot/image.test.mjs -> 11 passed, 0 failed, 4 skipped (15 tests, the four skipped are docker-gated), file unmodified t=4 blobs=docker/meeting-bot/image.test.mjs:unchanged
Tests[B4-C1]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C1 restore ...", "B4-C1(a)/B4-I3 no bucket variable ...", "B4-C1(b) bucket set, no object ...", "B4-C1(c) a truncated tar, or an unreadable bucket object ...", "B4-C1(d) a tar with a ../ member, an absolute member, an outside symlink or a member outside both trees is refused ..." — restore before the doctor gate with byte equality; no stub call without a bucket variable; first boot; truncated and unreadable archive leave local state untouched; six hostile archives (parent, absolute, outside symlink, absolute symlink, outside hard link, member outside both trees) write nothing outside.
Tests[B4-C2]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C2 locks ..." — the two locks are gone after restore even when the tar carried them, `.lkb-recovery.lock` stays, a snapshot drops the first two and keeps the third.
Tests[B4-C3]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C3 lease: an unexpired lease ...", "B4-C3 lease: an expired lease is taken over ...", "B4-C3(d) two entrypoints started together ...", "B4-C3(e) a lost lease stops the pipeline ..." — unexpired foreign lease blocks restore and pipeline and is never overwritten (exit 75); expired lease taken with `--if-generation-match=<read generation>`, renewed at least twice, deleted only when still held; a barrier in the stub makes two entrypoints read the lease together and exactly one proceeds (exit codes 0 and 75, one pipeline, one restore); a replaced lease stops the pipeline (exit 75) with no snapshot upload and no recording copy.
Tests[B4-C4]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C4 periodic snapshots ...", "B4-C4 a failing upload leaves the previous object byte-identical ...", "B4-C4 a failed tar creation uploads nothing" — at least two periodic plus one final, each tar listing exactly the profile and release trees; a failing upload keeps the old object and the pipeline runs on; a tar that fails uploads nothing.
Tests[B4-C5]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C5 SIGTERM ...", "B4-C5 a pipeline that ignores SIGTERM is killed after the bound ..." — TERM reaches the stub node, the final snapshot is taken after it exits, the lease is released, exit within the bound, a second TERM adds nothing; a node that ignores TERM is killed after `LKB_STOP_WAIT_S`, the final snapshot IS taken and the lease released (the manifest answer the contract asks for: yes, taken).
Tests[B4-C6]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C6 record-once ..." — doctor first, one `record <url> --until <t> <args>` command and never `run-pipeline.mjs`, non-empty `.webm` copied and the zero-byte one skipped and logged, final snapshot, lease released, exit status equals the record command's (7); missing URL or end time exits non-zero with no stub call.
Tests[B4-C7]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C7 attendance loop: one tick per interval ...", "B4-C7 attendance loop works without a bucket ..." — exact command line with the account, never `--watch`, no overlap even when a tick outlives the interval (start-to-start gap measured), a failing tick logged with its exit code and the loop goes on, each recording copied once and the empty file skipped, SIGTERM stops the loop with no tick afterwards, no bucket call without a bucket.
Tests[B4-C8]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C8 LKB_TRANSCRIPT_QA, WEBINAR_VISION_MODEL and GEMINI_STT_MODEL reach node unchanged ..." — the stub node's recorded environment in run, record-once and doctor, with `VNC_PASSWORD` unset in all three.
Tests[B4-I1]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-I1/I4/I5/I6 login mode, Dockerfile and the script text ..." plus docker/meeting-bot/image.test.mjs (ISS-409 ordering and ISS-410 trap tests, unmodified and green) — the pass-file lines, the EXIT trap and the `unset VNC_PASSWORD` before `pulseaudio -D` and `Xvfb :99`. Login mode itself is not run by a test (it needs x11vnc and a real Chrome): static text only.
Tests[B4-I2]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-I2 the doctor gate still fails closed ..." — doctor exit non-zero and a MISSING line each exit 1 before any pipeline; `BOT_MODE=doctor` exits after the gate with no bucket call.
Tests[B4-I3]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-C1(a)/B4-I3 no bucket variable ...", "B4-I3 with no bucket SIGTERM still reaches the pipeline ..." — no stub call without a bucket, the pipeline is still `exec`-ed, SIGTERM reaches it and the container exits 143.
Tests[B4-I4]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-I1/I4/I5/I6 ..." plus docker/meeting-bot/image.test.mjs (Dockerfile tests) — `USER node`, the gws pin, the tini ENTRYPOINT, no secret value in any ENV line.
Tests[B4-I5]: none — a diff property, shown by `git diff --name-only 85625836 HEAD` in the Pre-check line.
Tests[B4-I6]: docker/meeting-bot/entrypoint-state.test.mjs::"B4-I1/I4/I5/I6 ..." and the `noPublicOrIam` scan of every stub log in the C1-C6 tests — no ACL, IAM, allUsers or public flag in the script text or in any recorded bucket call.
Tests[B4-I7]: docker/meeting-bot/image.test.mjs — see "B4-I7" under Flags: none of its assertions break, so it is unmodified.
Falsify[B4-C1]: restore step removed (`restore_state || exit 1` replaced by `true`), in a copy outside the worktree, restored and hash-checked -> "B4-C1 restore" 1/1 green before, 0/1 after.
Falsify[B4-C1(a)]: bucket branch taken with no bucket variable -> "B4-C1(a)/B4-I3" green before, red after.
Falsify[B4-C1(b)]: a missing object treated as an error -> "B4-C1(b)" green before, red after.
Falsify[B4-C1(c)]: local profile cleared before the archive is validated -> "B4-C1(c)" green before, red after.
Falsify[B4-C1(d)]: containment check replaced by `true` -> "B4-C1(d)" green before, red after.
Falsify[B4-C2]: three mutants — locks kept on restore (the `--exclude`s and the `rm` removed), locks kept in the snapshot, `.lkb-recovery.lock` deleted on restore -> "B4-C2 locks" green before, red after, each.
Falsify[B4-C3]: five mutants — unexpired foreign lease ignored, lease writes unconditional (flag removed), lease never renewed, release deletes without checking the holder, snapshot without the lease check -> the matching C3 test green before and red after, each ("B4-C3 lease: an unexpired", "B4-C3(d)", "B4-C3 lease: an expired" twice, "B4-C3(e)").
Falsify[B4-C4]: three mutants — periodic interval made 600 s, old object deleted before the upload, failed tar uploaded anyway -> the three C4 tests green before, red after.
Falsify[B4-C5]: four mutants — SIGTERM not forwarded, no final snapshot, KILL after the bound removed, a second SIGTERM aborts the shutdown (`exit 143`) -> "B4-C5 SIGTERM" (three times) and "B4-C5 a pipeline that ignores SIGTERM" green before, red after. See the honest note on a fifth mutant under Flags.
Falsify[B4-C6]: three mutants — pipeline run instead of one record command, record exit status swallowed (`finish 0`), recordings not copied -> "B4-C6 record-once" green before, red after, each. The swallowed-status mutant is the defect the first draft really had (see Flags).
Falsify[B4-C7]: four mutants — `--watch` added, the loop does not wait for the tick (ticks overlap), the loop stops at a failing tick, recordings copied again every tick -> the two C7 tests green before, red after.
Falsify[B4-C8]: `unset GEMINI_STT_MODEL` before the daemons -> "B4-C8" green before, red after.
Falsify[B4-I1]: the `trap 'rm -f "$VNC_PASSFILE"' EXIT` line removed -> "B4-I1/I4/I5/I6" green before, red after.
Falsify[B4-I2]: `grep -q '^MISSING'` gate made `false` -> "B4-I2" green before, red after.
Falsify[B4-I3]: unsupervised pipeline no longer `exec`-ed (run in the foreground, status swallowed) -> "B4-I3 with no bucket SIGTERM" green before, red after.
Falsify[B4-I4]: `GEMINI_API_KEY=abc123` added to the Dockerfile ENV block -> "B4-I1/I4/I5/I6" green before, red after.
Falsify[B4-I5]: NO ISOLATING FALSIFICATION — a diff property; the Pre-check line is `git diff --name-only`.
Falsify[B4-I6]: `--predefined-acl=publicRead` added to the snapshot upload -> "B4-I1/I4/I5/I6" green before, red after.
Falsify[B4-I7]: NO ISOLATING FALSIFICATION — the criterion is that image.test.mjs is green and not weakened; it is unmodified, so there is no assertion to falsify.
mutant-cap-raise: 34 mutants over 15 criteria (the C-criteria each cover several behaviours named in the contract: (a) to (e), locks, lease, shutdown); each mutant is one one-line edit with its own green-before and red-after run.
Metrics: start=2026-11-25T00:00:00Z end=2026-11-25T00:00:00Z wall_min=unavailable agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=2 mutations=34 cycle=0 resumes=1 tokens=unavailable policy=proportional-verification/2026-11-22.19 check_s=215 mutants=34 defects_unit=2 defects_6c=0

## How to verify (commands + expected)
All from the worktree root; one process at a time (`timeout` around it).
- `node --test docker/meeting-bot/entrypoint-state.test.mjs` -> expected: 22 pass, 0 fail, about 3.5 minutes on this Windows laptop (each test starts real shell processes; Git Bash is the `sh`). Set `LKB_TEST_SH` to name another POSIX shell. The tests skip with a stated reason, never pass, when no `sh` is on PATH.
- `node --test docker/meeting-bot/image.test.mjs` -> expected: 11 pass, 0 fail, 4 skipped (the four built-image tests need `LKB_DOCKER_TESTS=1` and `BOT_IMAGE`).
- `git diff --name-only 85625836 HEAD` -> expected: the three files under docker/meeting-bot/.
- Falsification: copy `docker/meeting-bot/{entrypoint.sh,Dockerfile,entrypoint-state.test.mjs}` to a scratch tree with the same relative layout, apply one edit from the Falsify lines, run `node --test --test-name-pattern=<name> <copy>/docker/meeting-bot/entrypoint-state.test.mjs`. The harness used here (outside the repo, `scratchpad/fals/fals.mjs`) took a byte backup per mutation, a 300 s `timeout` per run, restored in `finally`, and ended with `git hash-object` equal to `git rev-parse HEAD:<file>` for all three files in both the worktree and the copy (printed `HEADCHECK ... EQ HEAD` three times).

## Actual outputs (from maker's own run)
On d753a9a8 (the worktree, full file):
```
ℹ tests 22   ℹ pass 22   ℹ fail 0     (entrypoint-state.test.mjs, 215 s)
ℹ tests 15   ℹ pass 11   ℹ fail 0   ℹ skipped 4     (image.test.mjs, unmodified)
```
Falsification harness: `SUMMARY 32/33 ok` on its first pass and `SUMMARY 1/1 ok` on the second (the one not-ok mutant is explained under Flags, and the mutant that replaced it was red). `HEADCHECK entrypoint.sh: worktree EQ HEAD, copy EQ HEAD (76a4f3249)`, same for `Dockerfile (481832c95)` and `entrypoint-state.test.mjs (651607d57)`.

## Capability coverage (each new claim -> its isolating falsification)
| Criterion | capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| B4-C1 | state restored before doctor gate | "B4-C1 restore" | `restore_state \|\| exit 1` replaced by `true` | red |
| B4-C1(a) | no bucket variable, no stub call | "B4-C1(a)/B4-I3" | bucket branch always taken | red |
| B4-C1(b) | first boot, no object | "B4-C1(b)" | missing object treated as an error | red |
| B4-C1(c) | truncated tar leaves local state untouched | "B4-C1(c)" | local profile cleared before validation | red |
| B4-C1(d) | hostile archive contained | "B4-C1(d)" (six archives) | containment check bypassed | red |
| B4-C2 | locks removed, recovery lock kept, snapshot excludes | "B4-C2 locks" | three mutants (see Falsify) | red each |
| B4-C3 | take, renew, release conditional on the generation | four C3 tests | five mutants (see Falsify) | red each |
| B4-C4 | periodic snapshot, kept old object, failed tar | three C4 tests | three mutants | red each |
| B4-C5 | forward, final snapshot, kill after the bound, second signal | two C5 tests | four mutants | red each |
| B4-C6 | one record command, copy, status | "B4-C6 record-once" | three mutants | red each |
| B4-C7 | loop command, no overlap, failure tolerated, copy once | two C7 tests | four mutants | red each |
| B4-C8 | three variables pass through | "B4-C8" | variable dropped | red |
| B4-I1, I2, I3, I4, I6 | invariants | as in the Falsify lines | one mutant each | red |
| B4-I5, B4-I7 | diff property, existing test file unmodified | `git diff`, image.test.mjs run | none | NO ISOLATING FALSIFICATION |

## Live browser evidence
Not UI-touching — no surface changed. Changed paths: `docker/meeting-bot/entrypoint.sh`, `docker/meeting-bot/Dockerfile`, `docker/meeting-bot/entrypoint-state.test.mjs`.

## Flags for the coordinator and checker
- **B4-I7 and image.test.mjs.** The contract expected five assertions of `image.test.mjs` to break (the exec/`--watch` needles, the `.lkb-tab-capture.lock` needle, the ISS-409 ordering, the ISS-410 trap, the no-secrets ENV rule, the two built-image doctor tests). None breaks, because the edit kept every text that file matches: the `exec node scripts/webinar/run-pipeline.mjs --run --watch` literal (still the no-bucket, no-attendance path), the `.lkb-tab-capture.lock` text, the `unset VNC_PASSWORD` before `^pulseaudio -D` and `^Xvfb :99`, the EXIT trap before `x11vnc`, and no `NAME=value` secret in the Dockerfile. The file is unmodified (`git diff 85625836 HEAD -- docker/meeting-bot/image.test.mjs` is empty) and runs 11 pass, 4 skipped. So nothing was edited, loosened or deleted, and no one needs to edit it for B4. The two built-image doctor tests still need an operator image build to run.
- **Real defect found and fixed while building (not hypothetical).** The first draft's `finish` kept its status in a variable named `rc`, which `lease_release` also sets, so every supervised exit returned 0 whatever the pipeline returned. The record-once and SIGTERM tests caught it (0 where 7 and 143 were expected); `finish` now keeps it in `FIN_RC`. Falsification C6b (`finish 0`) reproduces that class.
- **A mutant that did not discriminate.** Mutant C5d (delete the "second SIGTERM changes nothing" guard in `on_term`) left the C5 test green. The design cannot produce a second final snapshot by that edit, because `finish` runs once whatever the handler does, so the claim "a second SIGTERM adds nothing" is true by structure. The test still asserts exactly one final snapshot and one lease release, and mutant C5e (a second SIGTERM aborts the shutdown with `exit 143`) is red, so the property is covered by a mutant that can fail.
- **Timing.** Tests with an interval or a sleep (C3 renew, C4 periodic, C7 loop) assert on counts such as "at least 2 renewals", "at least 2 periodic snapshots" and "3+ ticks". On this Windows laptop each stub call takes 50-300 ms of process start, so the sleeps are 9 s and 10 s. On a slow or loaded machine a count could fall short; the first run failed three of them for that reason before the sleeps were lengthened, which is a flakiness risk the checker should know about.
- **Unproven by unit tests (D-233 `[ASSUMPTION]` items).** (1) Cloud Run's real shutdown grace against snapshot size and time: the tests prove the order (forward, wait, final snapshot, release) and the bound `LKB_STOP_WAIT_S`, not that Cloud Run's SIGTERM-to-SIGKILL window is long enough to upload a real profile. (2) Secret-file mounts: nothing here reads a mounted secret, and `gws` running from a read-only secret mount is not exercised. (3) A restored profile on a new hostname: the tests restore bytes, not a Chrome session; whether Chrome accepts a profile moved to a new container host (the `Singleton*` lock files are excluded for this, but cookie encryption keys and device binding are not tested) is plan row B8's first proof. Also unproven: the real `gcloud` flags and generation output format (`objects describe --format=value(generation)`, the 412 text) against a real bucket, since the stub is the only `gcloud` here; the Dockerfile's `--help` grep guards only that the flag exists.
- **Not covered by B4 (contract "Out of scope")** and not touched: the media object `live-proof.json` names (D-233 step 7); the registration policy store; slot readiness for one slot (B9 / B3's `capture-slot-readiness.ts`), so the B4-C7 loop proves the command line, not the behaviour behind it; the host id override (B3) and cloud resources (B5); a tar taken while Chrome is running restoring cleanly (B8).
- **Judgment calls.** (a) A snapshot taken while Chrome runs is a plain `tar`; exit status 1 ("file changed as we read it") is accepted, status above 1 or an empty file is a failed tar. (b) `LKB_RELEASE_DIR` is read by the entrypoint only (default `$PWD/data/webinar-release`, which is what `scripts/webinar/run-pipeline-deps.mjs:38` uses as `stateDir`); the pipeline does not read it, so setting it to another path would restore to a place the pipeline does not look. (c) `BOT_MODE=doctor` and `login` never read the bucket variable. (d) The state upload itself carries no generation precondition: the lease guards the writer, and a precondition on the state object would make a lost-lease race fail only at the very end. (e) A lease release that finds the lease replaced leaves it alone and logs it. (f) The attendance loop treats the interval as start-to-start and waits for the previous tick, so a tick longer than the interval starts the next one immediately after it ends.
- **Dockerfile not built.** The new RUN block was not built (no network build in this unit; the contract lists the image build as an operator step). The `gcloud storage ... --help | grep` lines make a wrong client fail the build rather than the first boot.
- **CORE-REQUEST:** none. Everything needed was inside `docker/meeting-bot/`. (For the record, `docker-compose.yml` will need the new environment variables and the `LKB_STATE_BUCKET` wiring; that is plan B5 and is not requested here.)

## Status: ready-for-check
