# Verdict — bot-image-polish
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** A (fresh, bound to D:/KnowledgeBase, worktree .worktrees/bot-image-polish)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** 69806029..6075776d (code commits 7e58ae96, c7042aab; 6075776d adds only the manifest). Blob identity at HEAD equals the manifest: entrypoint.sh 4f69982d, Dockerfile f4e43308, bot-smoke.sh 985c6f4f, image.test.mjs f0cfc3ca, .gitattributes 510accac.

## Independent evidence (re-run by checker; bound tree untouched, git status clean)
- node --test docker/meeting-bot/image.test.mjs (one file, timeout 240): 11 pass, 0 fail, 4 skipped (docker-gated, no bot-image-polish image here).
- node --test scripts/qa/container-workflows/bot-smoke.test.mjs (one file, timeout 240): 7 pass, 0 fail, 1 skipped (real container test, env-gated).
- C3: `git ls-files --eol` on docker/meeting-bot/*, bot-smoke.sh, run.sh -> all `i/lf w/lf attr/text eol=lf`. Both attribute lines present in .gitattributes.
- C4 (real, existing image lkb-bot-u1:test, `--network none`, the new entrypoint mounted over it, BOT_MODE=login, sentinel password, scan of every /proc/<pid>/environ and cmdline as the node user after Chrome was up): new entrypoint -> HIT only pid 1 `tini` (plus my own scan shell); pulseaudio, Xvfb, x11vnc, chrome have no hit; no cmdline hit in a daemon; vnc.pass consumed (absent). Baseline (parent entrypoint, same image): HITs on tini, pulseaudio, Xvfb and x11vnc. Confirms ISS-409 fixed for all daemons; the pid 1 residual is as the manifest declares (Docker puts container env in the first process).
- C5 (real, same image, a failing `x11vnc` stub on PATH, wrapper reports after the entrypoint exits): new entrypoint -> entrypoint-rc=1, `vnc.pass entries: 0`; parent entrypoint -> entrypoint-rc=1, `vnc.pass entries: 1` (the ISS-410 defect reproduced, then fixed).
- C2 (real): `BOT_IMAGE=lkb-bot-u1:test bash bot-smoke.sh` (this image has no certutil) -> `SMOKE FAIL certutil missing from the image (libnss3-tools); rebuild the image`; the EXIT trap left no bot-smoke container and no bot-smoke network. Script text has no apt-get. A container on `docker network create --internal` has eth0 but `curl https://1.1.1.1` fails ("Couldn't connect", 000): the isolation claim holds.
- C1: Dockerfile apt list contains `libnss3-tools` (diff line 17; static test green). Package is a real Debian package.

## Falsification (copy of HEAD blobs via git archive in scratchpad/fzA; per-mutation byte backup, restored and verified `git hash-object --path` == `git rev-parse HEAD:path` after every mutation; bound tree never mutated)
Baseline 11 pass / 0 fail. Every mutant RED:
- C1 drop `libnss3-tools` -> RED (toolchain test).
- C2 re-introduce apt-get in the smoke -> RED; `--internal` removed -> RED; `docker network rm "$net"` -> `true` -> RED; `--network "$net"` dropped from `docker run` -> RED (all in the "needs no network" test).
- C3 delete `*.sh` line -> RED; delete `docker/meeting-bot/*` line -> RED.
- C4 early unset removed, unset only before x11vnc -> RED (ISS-409 test + ISS-410 test); a `${VNC_PASSWORD:-}` read added after the unset -> RED.
- C5 trap deleted -> RED (ISS-410 test); trap armed after the x11vnc line -> RED.
All restores hash-equal HEAD (entrypoint 4f69982d, Dockerfile f4e43308, bot-smoke 985c6f4f, .gitattributes 510accac).

## Adversarial hunt (auth / secret handling)
- Secret path: the password is never in argv (`printf` builtin, file mode 0600 via umask 077, x11vnc `rm:` consumes it); unset happens before every fork; the `[ -n "${VNC_PASSWORD:-}" ]` guard still precedes the write and fails closed in login mode. In non-login modes the unset is harmless. No new read of the value exists after the unset (test and manual diff agree). No `.env` read, no network, no push, no product source touched.
- The deviation `--internal` instead of `--network none` is documented with evidence and is isolation-equivalent (verified above: no route out).
- Low observation: the cleanup trap is `EXIT` only. A SIGTERM/SIGINT delivered to the entrypoint shell between the file write and x11vnc consuming it (a few seconds of startup, e.g. an early `docker stop`) would not run an EXIT trap under POSIX sh and would leave vnc.pass in the container's tmp, which is discarded with the container (`--rm`) and mode 0600. Not blocking.

## Limits (honest)
- The built-image checks that need a fresh image (C1 `certutil -H` in the new image; C2 full a-d end-to-end real recording with certutil present) were NOT re-run by the checker: building needs the network (apt, Chrome, pip) and no bot-image-polish image exists locally. C1 and the C2 end-to-end therefore rest on the maker's recorded run (certutil -H exit 0; SMOKE RESULT PASS, 4589611-byte webm, -3.3 dB) at identity-matched blobs, backed by the checker's static, shimmed and partial real evidence above. The `--network none` failure the manifest reports was not reproduced either.
- pid 1 `tini` still carries VNC_PASSWORD in /proc/1/environ (declared by the maker; a design change, `VNC_PASSWORD_FILE`, left to the coordinator).

## Issues
ISSUES-WRITTEN: none
PROPOSED-ISSUE: low, non-blocking: bot entrypoint VNC password remains in /proc/1/environ (tini, container env); consider a mounted `VNC_PASSWORD_FILE` input instead of an env value (docker/meeting-bot/entrypoint.sh).
PROPOSED-ISSUE: low, non-blocking: pass-file cleanup trap is EXIT only; add `INT TERM` handlers if early `docker stop` during login startup matters (docker/meeting-bot/entrypoint.sh).

## Metrics
check_min=28 mutations=11 suite_runs=14 repeat_runs=0 cycle=0 files_run=2 real_container_scenarios=6
