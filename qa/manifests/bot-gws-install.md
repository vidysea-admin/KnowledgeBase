# Manifest — bot-gws-install
**Contract:** none specific (D-205 U1 follow-up; qa/gates/golive-batch4-2026-10-28.md Answered lines; survey qa/evidence/bot-linux-survey-2026-10-29.md; bot-image verdict findings entrypoint.sh:44-46 MEDIUM and :38 LOW)
**Goal task:** none
**Date:** 2026-10-29
**Status:** ready-for-check
**Handshake status:** ready-for-check
**Fix cycle:** 0
**Dual check:** no (no auth, tenancy or production write: build files; no credentials created, no gws login; the VNC fix removes a secret from argv)
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** bot-image verdict MEDIUM (doctor gate fails open) and LOW (VNC password on argv)
**Executor:** claude-sonnet-subagent
**Executor rationale:** three small edits to existing build files with exact acceptance commands; edit-in-place, no new files except this manifest.

## Criteria
- C1 A plain `docker build -f docker/meeting-bot/Dockerfile .` (no build-args) installs the official Linux gws 0.22.5 binary from the pinned URL with a sha256 check, `LKB_GWS_PATH=/usr/local/bin/gws`, and `docker run --rm --entrypoint gws <img> --version` prints `gws 0.22.5`.
- C2 A build with a wrong `GWS_SHA256` build-arg FAILS at the gws step (checksum mismatch); an empty URL/digest also fails; there is no skip path.
- C3 The doctor gate fails closed: `-e BOT_MODE=doctor -e NODE_OPTIONS=--require=/nonexistent.js` exits nonzero (previously exit 0); a healthy image still exits 0 in doctor mode.
- C4 In login mode the VNC password is never on any process argv (it goes through a 0600 file read by `x11vnc -passwdfile rm:<file>`, deleted after reading), x11vnc still enforces VNC authentication, and the variable is unset for child processes.

## What changed
- EDIT docker/meeting-bot/Dockerfile (gws block only): defaults `GWS_VERSION=0.22.5`, `GWS_URL=https://github.com/googleworkspace/cli/releases/download/v0.22.5/google-workspace-cli-x86_64-unknown-linux-musl.tar.gz`, `GWS_SHA256=4db473dde4b1ab872e4ff35d769b0d4af1f1a6441a605e79d5cf8ada9c87e920`; `set -eu`, fails on empty URL/digest, `sha256sum -c`, install to /usr/local/bin/gws, `gws --version | grep -F $GWS_VERSION`. The old "skip when GWS_URL empty" branch is removed. `LKB_GWS_PATH=/usr/local/bin/gws` was already in the ENV block.
- EDIT docker/meeting-bot/entrypoint.sh: doctor gate captures the exit status without a pipe (`... >/tmp/doctor.log 2>&1 || doctor_rc=$?`, then `cat`), fails on nonzero exit and on `^MISSING`; login mode writes the password with a shell builtin `printf` under `umask 077` to `$XDG_RUNTIME_DIR/vnc.pass` and runs `x11vnc -passwdfile rm:<file>`, then `unset VNC_PASSWORD`.
- EDIT docker-compose.yml (bot service build args only): `GWS_VERSION/GWS_URL/GWS_SHA256` are now null-valued args (unset = the Dockerfile pins apply; the previous `${GWS_URL:-}` forced empty strings over the Dockerfile defaults). Verified with `docker compose config`: no args passed when unset, `GWS_URL=zzz` is forwarded when set.
- EDIT .env.example (gws lines only): comment noting the image installs the verified gws and the three optional build overrides.
- EDIT docker/meeting-bot/image.test.mjs: gws arg assertions updated, new static test for doctor gate and VNC argv, two Docker-gated tests (gws version, doctor repro).
- Line endings: the five files were CRLF in this worktree (core.autocrlf checkout) and are LF in the index; they were normalised to LF in the working copy, so `git diff` shows only the real changes.

## gws asset selection (official source, evidence)
Source: GitHub API `releases/tags/v0.22.5` of googleworkspace/cli (the same release docs/webinar-release.md:105 uses for Windows). Linux x86_64 assets exist in two builds: `google-workspace-cli-x86_64-unknown-linux-gnu.tar.gz` (6,765,622 B) and `google-workspace-cli-x86_64-unknown-linux-musl.tar.gz` (6,876,771 B); aarch64 gnu/musl also exist (not used: the server is x86_64).
Chosen: **musl**, because it is statically linked, so it has no dependence on the base image's glibc/openssl and keeps working if the node base image's Debian release changes; the binary ran fine on the Debian-based node:24-slim.
- Asset name: google-workspace-cli-x86_64-unknown-linux-musl.tar.gz
- URL: https://github.com/googleworkspace/cli/releases/download/v0.22.5/google-workspace-cli-x86_64-unknown-linux-musl.tar.gz
- sha256: 4db473dde4b1ab872e4ff35d769b0d4af1f1a6441a605e79d5cf8ada9c87e920
- Three-way agreement: the release's published `.sha256` file content, the GitHub API `digest` field for the asset, and `sha256sum` of the locally downloaded archive all give this value. Archive contents: gws, LICENSE, README.md, CHANGELOG.md.
- Network used: github.com and api.github.com only (plus the docker builds). No login, no credentials, no OAuth. `gws --version` prints "This is not an officially supported Google product."
- HUMAN step remaining: gws OAuth on the server (volume lkb-bot-gws at /home/node/.config/gws).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 5 files, 4 criteria, est 45 min, single builder, no checker dispatch by the builder
slow-plan: two cold-cache image builds (about 4 min each; the gws step sits before the pnpm layers so any change to it rebuilds them) plus one failing bad-sha build and four static falsifications
Tier: L (config/CI image files only; no source under packages/ or scripts/ edited)
Base / checked state: base 82b9b177; code commit 86234755; the manifest commit that follows touches only qa/ (code files identical to 86234755).
Affected tests: docker/meeting-bot/image.test.mjs only.
Independent review: NOT run by the builder; the checker owns review.
Not run / limits: no meeting join, no recording; gws is only proven to start (`--version`), not authenticated; the login-mode VNC session was checked for argv/env/auth-type but not driven with a real VNC client; the container's own `/proc/1/environ` still holds `VNC_PASSWORD` for same-uid readers (the unset only protects spawned children), accepted since the login container is operator-run and loopback-published.
Tests[C1]: docker/meeting-bot/image.test.mjs::"Dockerfile pins the toolchain and runs as uid 1000" — (static: pinned ARG defaults, sha256sum -c, no skip path) + "built image: gws is the pinned 0.22.5 binary"
Tests[C2]: docker/meeting-bot/image.test.mjs::"Dockerfile pins the toolchain and runs as uid 1000" — (static: sha256sum -c present, no "gws not installed" branch); the wrong-sha build itself is Pre-check[C2]
Tests[C3]: docker/meeting-bot/image.test.mjs::"entrypoint doctor gate does not fail open and the VNC password never reaches argv" — (static) + "built image: doctor gate fails closed when node itself fails" (the verbatim repro) + "built image: uid 1000, no .env, doctor passes" (healthy path exit 0)
Tests[C4]: docker/meeting-bot/image.test.mjs::"entrypoint doctor gate does not fail open and the VNC password never reaches argv" — (static: no -passwd on argv, -passwdfile rm:, umask 077, unset); runtime argv check is Pre-check[C4]
Pre-check[C1]: 86234755 docker build -f docker/meeting-bot/Dockerfile -t bot-gws-install:t2 . (no build-args) -> exit 0; docker run --rm --entrypoint gws bot-gws-install:t2 --version -> exit 0, ok: "gws 0.22.5" (also LKB_GWS_PATH=/usr/local/bin/gws, file mode 0755, uid 1000 user) t=1
Pre-check[C2]: 86234755 ! docker build -f docker/meeting-bot/Dockerfile --build-arg GWS_SHA256=0000000000000000000000000000000000000000000000000000000000000000 -t bot-gws-install:badsha . -> exit 0 (the negated build exited 1), ok: sha256sum rejected the archive (computed checksum mismatch) at the gws RUN step and no image was produced t=1
Pre-check[C3]: 86234755 ! docker run --rm -e BOT_MODE=doctor -e NODE_OPTIONS=--require=/nonexistent.js bot-gws-install:t2 -> exit 0 (the negated run exited 1), ok: "doctor failed (exit 1)"; the pre-fix image lkb-bot-u1:test given the same command exited 0 (fail-open reproduced); healthy `-e BOT_MODE=doctor bot-gws-install:t2` -> exit 0 t=1
Pre-check[C4]: 86234755 docker run -d --name bot-gws-install-login -e BOT_MODE=login -e VNC_PASSWORD=<test> bot-gws-install:t2; docker exec: ps args, /proc/*/cmdline, chrome environ, RFB handshake -> exit 0, ok: x11vnc args are `-passwdfile rm:/tmp/runtime-node/vnc.pass`, 0 cmdline hits for the password, pass file deleted after reading, chrome (pid 7) has no VNC_PASSWORD in its environ, RFB security types [1,2] (count 1, type 2 = VNC authentication, so the password file took effect) t=1
Pre-check[T1]: 86234755 BOT_IMAGE=bot-gws-install:t2 LKB_DOCKER_TESTS=1 node --test docker/meeting-bot/image.test.mjs -> exit 0, 10 passed 0 failed 0 skipped t=1
Pre-check[T2]: 86234755 pnpm lint:structure; node scripts/snapshot.mjs --check -> exit 0, lint:structure OK (10 stages, 0 failed), SNAPSHOT matches (174 lines) t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C4); exactly one mutant each, 4 total
Metrics: builder_min=45 mutants=4 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
The static tests were updated first: the new/changed assertions (`ARG GWS_URL=https://...musl.tar.gz`, `doctor_rc`, `-passwdfile`) could not pass on the old Dockerfile/entrypoint. The runtime red is the pre-fix image: `docker run --rm -e BOT_MODE=doctor -e NODE_OPTIONS=--require=/nonexistent.js lkb-bot-u1:test` -> exit 0 (fails open), versus exit 1 on the fixed image. One slip found and fixed in place: my first test-file edit put a literal newline inside a regex (syntax error).

## Falsifications (one per criterion)
Script: per-mutation byte backup (`cp f f.mutbak`), single `sed` mutation, `timeout 90` on the static test run, restore from that mutation's own backup, then `git hash-object <file>` compared to `git rev-parse HEAD:<file>` (no EXIT trap; committed tree). All four fidelity checks OK; `git status` clean afterwards.

| Criterion | falsifying edit | observed (image.test.mjs, static) |
|---|---|---|
| C1 | Dockerfile `ARG GWS_SHA256=<64 hex>` -> `ARG GWS_SHA256=` | 6 passed / 1 failed |
| C2 | Dockerfile `sha256sum -c -` -> `sha256sum -b -` | 6 passed / 1 failed |
| C3 | entrypoint doctor line -> `node scripts/webinar/setup.mjs --doctor \| tee /tmp/doctor.log` (the original defect) | 6 passed / 1 failed |
| C4 | entrypoint `-passwdfile "rm:$VNC_PASSFILE"` -> `-passwd "$VNC_PASSWORD"` | 6 passed / 1 failed |

## How to verify
- `docker build -f docker/meeting-bot/Dockerfile -t bot-gws-install:chk .` then `docker run --rm --entrypoint gws bot-gws-install:chk --version` -> `gws 0.22.5`.
- `docker build -f docker/meeting-bot/Dockerfile --build-arg GWS_SHA256=0000000000000000000000000000000000000000000000000000000000000000 .` -> fails with `FAILED`.
- `docker run --rm -e BOT_MODE=doctor -e NODE_OPTIONS=--require=/nonexistent.js bot-gws-install:chk; echo $?` -> nonzero.
- `BOT_IMAGE=bot-gws-install:chk LKB_DOCKER_TESTS=1 node --test docker/meeting-bot/image.test.mjs` -> 10 pass. Remove test images afterwards (`docker rmi`).
