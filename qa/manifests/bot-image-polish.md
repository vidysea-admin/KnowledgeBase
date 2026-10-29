# Manifest — bot-image-polish
**Contract:** none specific (D-205 follow-ups from the bot-smoke checker verdict qa/verdicts/bot-smoke.md; D-206 context; ISS-409, ISS-410 low)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** no (image/CI scripts only; no auth, tenancy or production write; the VNC password handling is hardened, not widened; no secrets read)
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** ISS-409, ISS-410
**Executor:** claude-sonnet-subagent
**Executor rationale:** five small edits in files the unit scope names (Dockerfile, entrypoint.sh, image.test.mjs, .gitattributes, bot-smoke.sh); no product source touched.

## Criteria
- C1 The image ships `certutil` (package `libnss3-tools` in the Dockerfile apt list): `docker run --rm --entrypoint certutil <img> -H` works.
- C2 `bot-smoke.sh` has no run-time package install and runs its throwaway container with no route to the internet; the full end-to-end run (a-d) passes.
- C3 `.gitattributes` pins `*.sh` and `docker/meeting-bot/*` to `eol=lf`; the affected files are LF in the worktree.
- C4 (ISS-409) In login mode `VNC_PASSWORD` is read only by the step that writes the 0600 pass file and is unset before pulseaudio, Xvfb, x11vnc and Chrome start, so none of their `/proc/<pid>/environ` holds it.
- C5 (ISS-410) A failure of x11vnc (or anything after the pass file is written) leaves no pass file: an EXIT trap removes it.

## What changed
- docker/meeting-bot/Dockerfile: `libnss3-tools` added to the apt list.
- docker/meeting-bot/entrypoint.sh: the password is captured into the 0600 pass file and `unset VNC_PASSWORD` runs at the top (all modes), before pulseaudio/Xvfb/x11vnc; the `trap 'rm -f "$VNC_PASSFILE"' EXIT` is armed before the file is written (a successful `exec` discards it; x11vnc `rm:` already consumed the file). The old late `unset` and in-block pass-file code were moved up, not duplicated.
- scripts/qa/container-workflows/bot-smoke.sh: removed the `apt-get install libnss3-tools` step (now only checks `certutil` exists); the host run creates `docker network create --internal bot-smoke-net-$$` and runs the container on it, and the cleanup trap removes container and network. **Deviation from the brief, with evidence:** the brief asked for `--network none`. With `--network none` the real record fails twice in a row (`[bot] stop failed: audio track ended unexpectedly` / `video track ended unexpectedly`, `lkb capture failed`, record exit 1, `SMOKE d FAIL record_exit=1`), while the same image on the default bridge or on an `--internal` network passes (exit 0, ~4.6 MB webm, ~-3 dB). Chrome's tab capture needs a network interface to exist; `--internal` provides one with no external route (curl to https://example.com from a container on such a network returned `000`).
- .gitattributes: `*.sh text eol=lf` and `docker/meeting-bot/* text eol=lf`. Index copies were already LF; the six affected working files (docker/meeting-bot/*, bot-smoke.sh, run.sh) were re-checked-out and are now `w/lf`; no content diff from renormalising.
- docker/meeting-bot/image.test.mjs: libnss3-tools in the package list; tests for ISS-409 ordering, ISS-410 trap, smoke network isolation, .gitattributes; a docker-gated test that `certutil -H` runs in the built image.
- No product source, compose or docs touched. docs/SNAPSHOT.md unchanged.

## What still needs network
Only building the image (apt, the pinned gws release, pip, `seleniumbase get cft`/`uc_driver`, pnpm install). Two of my builds failed on transient `files.pythonhosted.org` / `storage.googleapis.com` read timeouts (network outage) and the third succeeded. Running the smoke needs no internet. Residual for C4: PID 1 (`tini`) still has the password in `/proc/1/environ`, because Docker puts the container env into the first process and the ENTRYPOINT is tini; the entrypoint cannot scrub that. Removing it would need a `VNC_PASSWORD_FILE` style input (mounted file) instead of an env value, which is a design change for the coordinator, not done here. The `docker exec` probe shell also inherits the container env (probe artefact, not a daemon).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 5 files, 5 criteria, est 90 min (long: builds 9 min each, network outage), single builder, no checker dispatch by the builder
slow-plan: one image build (cold, apt+Chrome download, 9 min) plus three real smoke runs and four probe runs of about 2 min each
Tier: L (image/CI), one checker
Base / checked state: base 69806029; code commits 7e58ae96 and c7042aab (final code SHA c7042aab); the manifest commit follows and touches only qa/. Blobs at c7042aab: entrypoint.sh 4f69982d, Dockerfile f4e43308, bot-smoke.sh 985c6f4f, image.test.mjs f0cfc3ca, .gitattributes 510accac.
Affected tests: docker/meeting-bot/image.test.mjs, scripts/qa/container-workflows/bot-smoke.test.mjs.
Independent review: NOT run by the builder; the checker owns review.
Image used: `docker build -f docker/meeting-bot/Dockerfile -t bot-image-polish:test .` at 7e58ae96 (Dockerfile and entrypoint identical at c7042aab; only bot-smoke.sh and image.test.mjs changed after). Image, containers and networks created here were removed.
Not run / limits: no live Google sign-in (login mode was run with a sentinel password and no network; Chrome opened accounts.google.com unreachable); x11vnc ISS-410 failure forced with a failing `x11vnc` stub on PATH because a real port conflict makes x11vnc delete the pass file itself (the baseline also passes that variant, so it does not reproduce the issue); `/proc/1/environ` residual above; healthcheck.sh untouched.
Tests[C1]: docker/meeting-bot/image.test.mjs::"Dockerfile pins the toolchain and runs as uid 1000" (libnss3-tools in the list) + "built image: certutil (libnss3-tools) is present so the smoke needs no network" (gated) — static package presence and the real binary in the built image
Tests[C2]: docker/meeting-bot/image.test.mjs::"container smoke needs no network: no apt step and the container runs on an --internal network" + scripts/qa/container-workflows/bot-smoke.test.mjs (7 shimmed pass) — no apt-get, internal network created, used by `docker run`, and removed
Tests[C3]: docker/meeting-bot/image.test.mjs::"shell scripts are pinned to LF in the checkout (.gitattributes)" — both attribute lines present
Tests[C4]: docker/meeting-bot/image.test.mjs::"entrypoint takes the VNC password out of the environment BEFORE any daemon starts (ISS-409)" — unset precedes pulseaudio, Xvfb, x11vnc, no read after the unset, pass file written before the unset
Tests[C5]: docker/meeting-bot/image.test.mjs::"entrypoint removes the VNC pass file when x11vnc fails (ISS-410)" — EXIT trap armed before x11vnc
Pre-check[C1]: c7042aab `docker run --rm --network none --entrypoint certutil bot-image-polish:test -H` -> exit 0, ok: prints the certutil usage (`-A Add a certificate to the database`); `LKB_DOCKER_TESTS=1 BOT_IMAGE=bot-image-polish:test node --test docker/meeting-bot/image.test.mjs`: 15 passed, 0 failed, 0 skipped t=1 blobs=docker/meeting-bot/Dockerfile:f4e43308,docker/meeting-bot/image.test.mjs:f0cfc3ca
Pre-check[C2]: c7042aab `BOT_IMAGE=bot-image-polish:test bash scripts/qa/container-workflows/bot-smoke.sh` -> exit 0, ok: `SMOKE record exit=0`, `SMOKE a PASS ... (4589611 bytes)`, `b PASS 1 video + 1 audio stream`, `c PASS audio max_volume -3.3 dB`, `d PASS record exit 0, no chrome process remains`, `SMOKE RESULT PASS`; no bot-smoke container or network remained t=1 blobs=scripts/qa/container-workflows/bot-smoke.sh:985c6f4f
Pre-check[C3]: c7042aab `git ls-files --eol docker/meeting-bot scripts/qa/container-workflows/bot-smoke.sh` -> exit 0, ok: all `i/lf w/lf attr/text eol=lf`; `git status --short` clean t=1 blobs=.gitattributes:510accac
Pre-check[C4]: c7042aab (entrypoint blob unchanged since 7e58ae96) login mode run (`-e BOT_MODE=login -e VNC_PASSWORD=<sentinel>`, `--cap-add SYS_PTRACE`, scan of every /proc/<pid>/environ as root after Chrome was up) -> exit 0, ok: new image HIT only `pid=1 tini` (plus the docker-exec scan shell); processes present: chrome, pulseaudio, Xvfb, x11vnc, none hit; baseline (previous entrypoint, same image): HITs on pid 1 tini, `pulseaudio`, `Xvfb`, `x11vnc`. cmdline scan: no hit in either; `ls /tmp/runtime-node/vnc.pass`: absent after start in both t=1 blobs=docker/meeting-bot/entrypoint.sh:4f69982d
Pre-check[C5]: c7042aab (entrypoint blob unchanged since 7e58ae96) forced x11vnc failure (stub `x11vnc` exiting 1 on PATH, `BOT_MODE=login`) -> exit 0, ok: previous entrypoint: `entrypoint-rc=1`, `vnc.pass entries: 1` (file left behind, the ISS-410 defect); new entrypoint: `entrypoint-rc=1`, `vnc.pass entries: 0` t=1 blobs=docker/meeting-bot/entrypoint.sh:4f69982d
Pre-check[T1]: c7042aab `pnpm lint:structure; node scripts/snapshot.mjs --check` -> exit 0, `lint:structure: OK (10 stages, 0 failed)` and `OK: docs/SNAPSHOT.md matches a fresh regeneration (174 lines, budget 200)` t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C5); C2 carries three mutants (apt step, isolation, network cleanup), C3 two (each attribute line), C4 two (unset position, read after unset), C5 two (no trap, trap armed too late)
Metrics: builder_min=90 mutants=10 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
Tests were written before the edits. First run of `node --test docker/meeting-bot/image.test.mjs` against the unmodified code: the "container smoke needs no network" test failed with `AssertionError: smoke must not install packages at run time` (the apt step was still there); the libnss3-tools, ISS-409 and ISS-410 assertions were red the same way (they target lines that did not exist). After the edits: 11 pass, 0 fail, 4 skipped (gated). A later test-side regex bug (`"$net"` unescaped in a JS regex) was red then fixed.

## Falsifications (one or more per criterion)
Harness: copies the committed blobs (`git show HEAD:<path>`) into a scratch tree outside the repo and mutates the COPY only; per-mutation byte backup (`cp f f.mutbak`), a check that the sed changed the file, `timeout 120` on the test run, restore from that mutation's own backup, then `git hash-object --path=<repo path> <copy>` equals `git rev-parse HEAD:<repo path>` after every mutation (all OK). No EXIT trap; the worktree was never mutated (`git status` clean).

| Criterion | falsifying edit (in the copy) | observed (image.test.mjs, 11 runnable tests) |
|---|---|---|
| C1 | drop ` libnss3-tools` from the Dockerfile apt list | 10 pass / 1 fail: "Dockerfile pins the toolchain and runs as uid 1000" |
| C2 | re-add `docker exec -u root ... apt-get install -y libnss3-tools` to the smoke | 10 / 1: "container smoke needs no network ..." |
| C2 | `network create --internal` -> `network create` | 10 / 1: same test |
| C2 | `docker network rm "$net"` -> `true` | 10 / 1: same test |
| C3 | delete the `*.sh text eol=lf` line | 10 / 1: "shell scripts are pinned to LF ..." |
| C3 | delete the `docker/meeting-bot/* text eol=lf` line | 10 / 1: same test |
| C4 | delete the early `unset`, unset only just before x11vnc | 9 / 2: "entrypoint takes the VNC password out ... BEFORE any daemon starts (ISS-409)" (+ ISS-410 test, since the x11vnc line shape changed) |
| C4 | add a `${VNC_PASSWORD:-}` read after the unset | 10 / 1: the ISS-409 test |
| C5 | delete the pass-file EXIT trap | 10 / 1: "entrypoint removes the VNC pass file when x11vnc fails (ISS-410)" |
| C5 | arm the trap after the x11vnc line (just before CHROME=) | 10 / 1: the ISS-410 test |
Real-image falsification of the two behavioural criteria is the baseline comparison in Pre-check[C4]/[C5]: the previous entrypoint (mounted from `git show HEAD~1`) shows the leak (pulseaudio, Xvfb, x11vnc environ hits) and the leftover pass file, the new one does not. For C2, `--network none` was also run for real and fails (see What changed), which is why the internal network is used.
