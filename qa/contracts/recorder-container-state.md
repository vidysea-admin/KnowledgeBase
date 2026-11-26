# Contract — recorder-container-state (unit B4, plan Lane B, D-233, D-231)

> Status: adopted by /checker 2026-11-25. SOURCE: MAKER-DERIVED. The criteria were proposed by the maker from the owner-approved plan (D-227, section 7 Lane B row B4) and the code read on 2026-11-25; they are not
> Umesh's words. The plan's own words: "Restore / snapshot / lease, lock delete, shutdown trap, a `record-once` mode, the attendance loop; forward `LKB_TRANSCRIPT_QA`, `WEBINAR_VISION_MODEL`, `GEMINI_STT_MODEL`" in
> `docker/meeting-bot/entrypoint.sh` and `Dockerfile:74-86`; plan check: "a restarted container is still signed in". Decisions behind it: D-230 (hosting), D-231 (single-slot attendance), D-233 (state, lease, host id).
> Scope: `docker/meeting-bot/entrypoint.sh`, `docker/meeting-bot/Dockerfile`, and one NEW test file beside `docker/meeting-bot/image.test.mjs` (named in the manifest). Nothing outside `docker/meeting-bot/` changes.
> Runner and seam: `node --test` on the new file; it runs the real `entrypoint.sh` with `sh` (Git Bash or WSL) in a temp directory with stub executables first on `PATH`: `gcloud`/`gsutil` (acting on a local folder
> that stands in for the bucket and logging every call), `pulseaudio`, `pactl`, `Xvfb`, `xdpyinfo`, and a stub `node` recording its argv and environment. The manifest names which bucket client the entrypoint uses;
> every bucket call goes through a command on `PATH`, so no real bucket is reachable. A signal test that cannot run in the checker's shell is NOT-MEASURED, never PASS. Variable names below are placeholders;
> the maker names the real ones.

## Criteria
- **[B4-C1] Restore.** With the bucket variable set and a stub bucket holding a state tar (profile directory plus release directory), the entrypoint extracts it into `LKB_BOT_PROFILE_DIR` and the release directory
  before the doctor gate and before the pipeline starts; a marker file and a `live-proof.json` come back byte-equal. (a) No bucket variable: no stub command is called at all and the sequence is as today.
  (b) Bucket set, no object (first boot): start with empty state and log that. (c) Truncated tar: exit non-zero and leave existing local state untouched. (d) (checker-added) A tar with a `../escape` member, an
  absolute-path member, or a symlink pointing outside the two directories is refused or contained: nothing is written outside the profile and release directories. Reason: the restored object comes from a bucket and
  the target holds credentials.
- **[B4-C2] Locks (amended).** After restore, `poller.lock` (release directory) and `.lkb-tab-capture.lock` (profile directory) are absent even if the tar carried them. `.lkb-recovery.lock` is NOT deleted: a present one
  still blocks the next capture (`tab-browser.ts:149`) and a restore leaves it in place (D-233). A snapshot tar never contains `poller.lock` or `.lkb-tab-capture.lock`, and DOES contain `.lkb-recovery.lock` when it
  exists, so a "profile needs inspection" state survives a restart; a tar carrying it restores it in place.
- **[B4-C3] Lease.** The entrypoint takes the lease before it restores. An unexpired lease of another holder: it neither restores nor starts the pipeline, never overwrites the lease, and exits non-zero with a message.
  An expired lease is taken over. The lease is renewed while the pipeline runs (interval set short by an env variable in the test) and is deleted on a clean shutdown only if this instance still holds it.
  (d) (checker-added) Taking and taking-over the lease is conditional on the object's generation (create-if-absent; replace-only-if-unchanged since it was read), the manifest names the precondition flag, and a test
  starts two entrypoints at the same time against one stub bucket whose stub honours the precondition: exactly one proceeds. (e) (checker-added) If a renewal finds the lease no longer this instance's, it stops
  the pipeline and uploads nothing more (no snapshot, no recording copy): snapshots and uploads happen only while the lease is held. Reason: two writers on one profile tar corrupt the signed-in state.
- **[B4-C4] Snapshot.** With a 1 s interval and a stub `node` that sleeps, at least two periodic snapshots upload, each a complete tar of exactly the profile and release trees. A stub upload that fails leaves the previous
  bucket object byte-identical and does not stop the pipeline; a failed tar creation uploads nothing.
- **[B4-C5] Shutdown trap (`run` and `record-once` only; `login` mode untouched).** On SIGTERM the entrypoint passes SIGTERM to the stub `node`, waits up to a bounded time (short in the test), takes one final snapshot
  after the child exits, releases the lease, and exits within the bound. A second SIGTERM does not start a second final snapshot. The pipeline no longer runs through `exec`, so the trap survives. If the child ignores
  SIGTERM, it is killed after the bound and the lease is still released; the manifest names whether the final snapshot is then taken, and a test covers that path.
- **[B4-C6] `record-once`.** `BOT_MODE=record-once` with the meeting URL and end time in environment variables runs the doctor gate, then ONE record command (the stub `node` sees `record <url> --until ...` as in
  `record-commands.ts:84-86`), never `run-pipeline.mjs`. Afterwards it copies the non-empty `.webm` files of the record directory to the stub bucket (a zero-byte file is skipped and logged), takes a final snapshot,
  releases the lease and exits with the record command's exit status; if that status is 0 and a recording was not copied (the copy failed, or was skipped because the lease is not held), it exits 74. The record command's own non-zero status always wins.
- **[B4-C7] Attendance loop.** In `run` mode with the attendance account variable set, the entrypoint calls `node scripts/webinar/run-pipeline.mjs --run --calendar-attendance-account <account>` once per interval (default
  300 s, the `POLL_MS` of `scripts/webinar/scheduler/service.mjs:2`; short in the test), never with `--watch`. Ticks never overlap (a stub `node` that outlives the interval is never run twice at once). A failing tick
  is logged with its exit code and the loop continues. New non-empty recordings are copied to the stub bucket after each tick, each file once. SIGTERM stops the loop (C5). With the account variable unset, the current
  `--run --watch` command line is used unchanged.
- **[B4-C8] Environment passes through.** With `LKB_TRANSCRIPT_QA=1`, `WEBINAR_VISION_MODEL=a` and `GEMINI_STT_MODEL=b` set on the entrypoint, the stub `node` sees all three unchanged in `run`, `record-once` and
  `doctor` modes, and `VNC_PASSWORD` is still absent from it (existing rule).

## Invariants
- **[B4-I1]** `login` mode: the VNC pass-file handling, the `trap 'rm -f "$VNC_PASSFILE"' EXIT` line, and the order (`unset VNC_PASSWORD` before `pulseaudio -D`, `Xvfb :99` and `x11vnc`) are unchanged.
- **[B4-I2]** The doctor gate still fails closed (`doctor_rc` check, `grep -q '^MISSING'`) and `BOT_MODE=doctor` still exits after it.
- **[B4-I3]** With no bucket variable the container behaves as today and calls no bucket command, so `scripts/qa/container-workflows/bot-smoke.sh` (own entrypoint, `--internal` network) is unaffected; SIGTERM is
  still forwarded to the pipeline and the container exits with the pipeline's status (the entrypoint never swallows SIGTERM, with or without a bucket).
- **[B4-I4]** The Dockerfile keeps `USER node`, the pinned `gws`, the tini `ENTRYPOINT`, and carries no secret value in any `ENV` line.
- **[B4-I5]** No change to any file outside `docker/meeting-bot/` for this unit (the host id override is plan unit B3; compose and cloud resources are B5).
- **[B4-I6] (checker-added)** No call in the stub log sets a public ACL, makes an object public, or changes IAM: the snapshot holds a signed-in Chrome profile and the issuer key.
- **[B4-I7] (checker-added) Existing image tests are updated, never deleted or loosened.** The assertions of `docker/meeting-bot/image.test.mjs` that B4's edits break (the maker listed five: the exec/`--watch` needles at :47-49 and
  the `.lkb-tab-capture.lock` needle at :46; the ISS-409 pre-daemon ordering :65-76; the ISS-410 trap literal :78-83; the no-secrets ENV rule :33-40; the two built-image doctor tests :129-152) are changed
  to the new behaviour by an edit that preserves each one's intent; the manifest names who edits that file (it belongs to another session), and the docker-free part of `node --test docker/meeting-bot/image.test.mjs`
  is green at the unit's tip. Reason: the absolute rule against softening a criterion to pass a failing artifact.

## Out of scope / ignore
- Operator steps (not builder criteria): build the image and run `LKB_DOCKER_TESTS=1 BOT_IMAGE=<image> node --test docker/meeting-bot/image.test.mjs` (network build); after the Google sign-in (plan B6) and the first
  snapshot, restart the real worker and see that the bot is still signed in; check Cloud Run's real shutdown grace against snapshot time and size; check the bucket client's permissions and that `gws` runs from a
  read-only mounted secret.
- NOT covered by B4, so B4 PASS does not prove a restarted recorder can run: (1) the media file `live-proof.json` names (D-233 step 7: its own bucket object, restored to the path the proof names; D-233 says it is its own
  small unit with its own check before plan row B8, and no contract or inbox entry exists for it yet); (2) the registration policy store under `raw/webinars` (D-233 assumption; B12 is blocked on gate question Q3, D-234);
  (3) slot readiness for one slot: D-231 Result shows a non-autonomous attendance run with fewer than two slots fails readiness today, so the loop command of B4-C7 works only after plan unit B9 lands; B4-C7 proves
  the command line, not the behaviour behind it; (4) the host id override (B3) and the cloud resources (B5); (5) that a tar taken while Chrome is running restores to a clean profile (plan row B8 is the first proof).
- Live checks fed: go-live [G07] (join and record, through B8) and the restart proof of plan row B4.

## Amendment log
- 2026-11-25 · routine · created from the maker-derived inbox entry "unit-level checks for Lane B units B2 and B4" (plan section 7 B4, D-233, D-231). Dispositions: B4-C1 amend (added d: tar containment); B4-C2 amend
  (contradiction: the maker's "a snapshot tar never contains any of the three" would drop `.lkb-recovery.lock`, against D-233 "a restore leaves it in place" and `tab-browser.ts:149`; the tar now keeps it);
  B4-C3 amend (added d: conditional create/replace and a two-entrypoint race; e: no upload after losing the lease); B4-C4 amend (failed tar uploads nothing); B4-C5 amend (child that ignores SIGTERM);
  B4-C6 accept; B4-C7 amend (ticks never overlap, files uploaded once; command-line-only caveat from D-231); B4-C8 accept; B4-I1, I2, I4, I5 accept; B4-I3 amend (SIGTERM still forwarded); added B4-I6
  (no public ACL) and B4-I7 (the five breaking assertions of image.test.mjs are updated, not loosened; the maker's list was filing-only). Gaps recorded under Out of scope, none needs an owner answer.
- 2026-11-25 · routine · B4-C6 amend (checker, unit b4-recorder-state, cycle 0): exit 74 when the record command succeeded but a recording was not copied; the record command's own non-zero status still wins. Reason: the literal text (exit with the record command's status) would let a recording that was made and lost exit 0; the maker flagged the tension and chose 74 (D-238 item 5). Judged against the amended reading.
