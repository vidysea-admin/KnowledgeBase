# Manifest — bot-smoke
**Contract:** none specific (D-205 survey unit U5; qa/gates/golive-batch4-2026-10-28.md Answered lines; survey qa/evidence/bot-linux-survey-2026-10-29.md)
**Goal task:** none
**Date:** 2026-10-29
**Status:** checked-PASS
**Handshake status:** checked-PASS
**Fix cycle:** 0
**Dual check:** no (no auth, tenancy or production write: a throwaway local container records a local fixture page; no secrets, no network beyond an apt install in that container)
**Persona walk:** skip (no screen, flow or user type)
**Issues addressed:** none
**Executor:** claude-sonnet-subagent
**Executor rationale:** one new smoke script plus a fixture page and a test, all under scripts/qa/container-workflows/ as the unit scope names; no product source edited.

## Criteria
- C1 A non-empty `tab-*.webm` is produced by `record` run inside the bot image against a local fixture meeting page.
- C2 `ffprobe` shows exactly one audio and one video stream in that file.
- C3 Audio peak (`ffmpeg volumedetect` max_volume) is above -40 dB, i.e. not silent.
- C4 The record process exits 0 and no chrome/chromedriver process remains (/proc scan).
- C5 `bot-smoke.sh` exits nonzero if any of C1-C4 fails (and the host run ends `SMOKE RESULT FAIL`).
- C6 The recorder is driven the way run-pipeline does (`node --import tsx packages/meeting-bot/src/cli.ts record <url> --until <now+90s> --backend tab`, image ENV for Python/browser/sandbox/DISPLAY), and the fixture is self-contained (looping canvas + 440 Hz oscillator, no external assets).

## What changed
- NEW scripts/qa/container-workflows/bot-smoke.sh: host mode starts one throwaway container (`bot-smoke-<pid>`, tini entrypoint, shm 1g) from `BOT_IMAGE`, pipes the script and fixture in through stdin (no docker cp, so no Windows path rewriting; CR stripped), runs `--inside` as the image's node user, and always `docker rm -f -v` the container in a trap. `--inside` replays the entrypoint bring-up (PulseAudio null sink, Xvfb :99), serves the fixture over HTTPS on 127.0.0.1:8443 with a throwaway openssl certificate imported into the node user's NSS db, runs `cli.ts record ... --backend tab --until +90s` and then `check_artifacts`. `--check <rec_dir> <exit>` runs only C1-C4 so it can be tested without Docker.
- NEW scripts/qa/container-workflows/fixtures/bot-smoke-meeting.html: animated canvas (requestAnimationFrame loop) + 440 Hz sine OscillatorNode through the AudioContext; no external assets.
- NEW scripts/qa/container-workflows/bot-smoke.test.mjs: 8 tests (2 static, 5 shimmed check-mode scenarios covering a-d with fake ffprobe/ffmpeg/proc, 1 real container run gated by `LKB_DOCKER_TESTS=1 BOT_IMAGE=<image>`).
- No product source, Dockerfile, compose or docs touched. docs/SNAPSHOT.md unchanged (still matches).

## Findings about the product (for the coordinator; no product change made)
1. **A localhost URL is accepted by detectPlatform but refused by record consent.** `detectPlatform("http://127.0.0.1/...")` returns `"unknown"` (no throw, packages/ingest/src/join-policy/platform.ts:14-34). Platform "unknown" is a valid platform and runs the generic local-browser path. The refusal is later: `recordMeetingHash` (packages/meeting-bot/src/capture/record-consent/context.ts, used by `createRecordConsent` from `prepareWorkspaceCaptureControls`) throws `Capture requires an HTTPS meeting URL without userinfo` for any non-https URL. Workaround used, with no product change: serve the fixture over HTTPS.
2. **Chrome does not trust a self-signed fixture by default and SeleniumBase does not ignore cert errors here.** The first HTTPS run recorded Chrome's "Your connection is not private" interstitial and the audio was silent (max -91 dB), i.e. the recorder correctly captured a blank error page. SeleniumBase adds `--ignore-certificate-errors` only when not (uc and enable_ws) (browser_launcher.py:2661), and UC mode is on. Fix used: import the fixture certificate into the node user's NSS db (`certutil`, package libnss3-tools). **The image does not contain certutil**, so the host step installs `libnss3-tools` in the throwaway container as root (needs network for apt). Smallest product-side improvement if the network dependency is unwanted: add `libnss3-tools` to the apt list in docker/meeting-bot/Dockerfile (a U1 file; not touched here).
3. **Record dir must stay inside the repo tree.** With `LKB_RECORD_DIR=/tmp/...` the recorder produced the webm but `record` then failed in finalize with `Capture slot must be confined to the configured repository` (exit 1). The smoke therefore uses the image default `/app/raw/webinars` (as U1 set it).
4. **Survey [ASSUMPTION] 7 is only partly confirmed.** With the explicit `botsink` null-sink load and `set-default-sink` removed, the smoke still passed (max -4.1 dB): the PulseAudio daemon's own fallback sink was enough. The daemon itself was not removed in any run, so "PulseAudio required" is not falsified either way.
5. **Chrome memory:** no OOM on the 4 GB Docker VM (container saw 3.9 GB total, about 3 GB available with Chrome idle); a 90 s recording at 1280x720 produced about 5 MB.
6. **Git on Windows checks files out CRLF** (no `*.sh eol=lf` in .gitattributes; same as the existing run.sh/entrypoint.sh). The script strips CR when piping itself and the fixture into the container, but running the host script from a CRLF working copy under Git Bash would need `eol=lf`. Not changed (not in scope).

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Round: 3 new files, 6 criteria, est 75 min, single builder, no checker dispatch by the builder
slow-plan: one image build (cached, 104 s), 4 real container smoke runs of about 2 min each (1 diagnostic with Chrome interstitial, 2 real falsifications, 1 final), 8 script-level mutants run against a copy
Tier: M (test/QA scripts only; no product source edited)
Base / checked state: base 82b9b177; code commit 964bf183 (bot-smoke.sh blob 415dd23f, fixture blob 69c226c3 pre-mutation, test blob see Pre-check); the manifest commit follows and touches only qa/.
Affected tests: scripts/qa/container-workflows/bot-smoke.test.mjs only.
Independent review: NOT run by the builder; the checker owns review.
Image used: `docker build -f docker/meeting-bot/Dockerfile -t bot-smoke-img .` from the worktree at base 82b9b177 (gws not installed, as designed; unused by the smoke).
Not run / limits: no live meeting join; platform path "unknown" only (no Meet/Zoom/Teams admission logic is exercised; admission falls to the lenient path and is not asserted); no `--transcribe`/index stage; Chrome tab capture is exercised only at 1280x720/5 fps lean settings of the extension; apt install of libnss3-tools needs network (see Finding 2); the 440 Hz tone content is not spectrally verified, only its level.
Tests[C1]: scripts/qa/container-workflows/bot-smoke.test.mjs::"(a) fails with no webm, an empty webm, or only a .playable.webm" + "real container smoke: a-d pass inside the bot image" — covers both the shimmed failure paths of check (a) and the real container producing a non-empty webm
Tests[C2]: scripts/qa/container-workflows/bot-smoke.test.mjs::"(b) fails unless there is exactly one audio and one video stream" + the real container smoke test — covers the stream-count conjunct of check (b) against fake ffprobe and the real file
Tests[C3]: scripts/qa/container-workflows/bot-smoke.test.mjs::"(c) fails on a silent, quiet-below-threshold or unreadable audio peak, passes just above -40 dB" + the real container smoke test — covers the peak threshold of check (c) against fake volumedetect output and the real recording
Tests[C4]: scripts/qa/container-workflows/bot-smoke.test.mjs::"(d) fails on a nonzero record exit or a leftover chrome/chromedriver process" + the real container smoke test — covers the exit-status and leftover-process conjuncts of check (d) and the real teardown
Tests[C5]: scripts/qa/container-workflows/bot-smoke.test.mjs::"(a)..(d) fail" tests (each asserts a nonzero exit and the matching `SMOKE <x> FAIL` line) + "check passes when a, b, c and d all hold" — every failing criterion must flip the exit status, and the all-green case must stay 0
Tests[C6]: scripts/qa/container-workflows/bot-smoke.test.mjs::"script records the way run-pipeline does and states all four criteria" + "fixture is a self-contained looping canvas + 440 Hz tone page with no external assets" — pins the record command shape and the self-contained fixture content
Pre-check[C1]: 964bf183 BOT_IMAGE=bot-smoke-img bash scripts/qa/container-workflows/bot-smoke.sh -> exit 0, ok: `SMOKE a PASS non-empty webm: /app/raw/webinars/tab-1793244753946-179ed762.webm (5022195 bytes)` t=1 blobs=scripts/qa/container-workflows/bot-smoke.sh:415dd23f
Pre-check[C2]: 964bf183 same run -> exit 0, ok: `SMOKE b PASS 1 video + 1 audio stream` (ffprobe: opus audio index 0, vp8 video index 1) t=1
Pre-check[C3]: 964bf183 same run -> exit 0, ok: `SMOKE c PASS audio max_volume -3.4 dB (> -40 dB)` (record log: audio level max 0 dB, mean -6 dB) t=1
Pre-check[C4]: 964bf183 same run -> exit 0, ok: `SMOKE record exit=0`, `SMOKE d PASS record exit 0, no chrome process remains`, `SMOKE RESULT PASS`; afterwards `docker ps -a` shows no bot-smoke container t=1
Pre-check[C5]: 964bf183 node --test scripts/qa/container-workflows/bot-smoke.test.mjs -> exit 0, 7 passed (1 skipped: the real-run test needs LKB_DOCKER_TESTS; the shimmed scenarios drive each criterion to nonzero) t=1 blobs=scripts/qa/container-workflows/bot-smoke.test.mjs:see-git
Pre-check[C6]: 964bf183 LKB_DOCKER_TESTS=1 BOT_IMAGE=bot-smoke-img node --test scripts/qa/container-workflows/bot-smoke.test.mjs -> exit 0, 8 passed 0 skipped (real container test 126 s) t=1
Pre-check[T1]: 964bf183 pnpm lint:structure; node scripts/snapshot.mjs --check -> exit 0, `lint:structure: OK (10 stages, 0 failed)` and `OK: docs/SNAPSHOT.md matches a fresh regeneration (174 lines, budget 200)` t=1
mutant-cap-raise: one falsification per criterion is mandatory (C1-C6); C4 carries two mutants (exit status and leftover-process are separate conjuncts), C6 carries two (record command and fixture tone), C3 also has a real end-to-end silent-tone falsification
Metrics: builder_min=75 mutants=9 policy=proportional-verification/2026-10-19.17 cycle=0 suite_runs=0 repeat_runs=0 tokens=unavailable

## Red evidence (TDD)
This unit is a QA harness whose behaviour had to be discovered against the real image first (consent HTTPS refusal, certificate trust, record-dir confinement), so the script was developed against the live container and the test file written once the shape was stable. The failing-first evidence is instead the real runs that failed before the fixes: (1) HTTPS fixture without cert trust -> Chrome interstitial, `audio level: max -91 dB ← SILENT`, `lkb capture failed: recording is silent`; (2) record dir under /tmp -> `lkb capture failed: Capture slot must be confined to the configured repository`, `SMOKE d FAIL record_exit=1`; (3) the EXIT trap read a function-local `name` -> `name: unbound variable` and an orphan container (fixed: global, orphan removed). The check-mode tests were run red first as well: the first run of the (a) test failed (`{"webm":null}` still exited 0) because of a test-helper bug (`opts.webm ?? default` swallowed null), fixed in the helper.

## Falsifications (one or more per criterion)
Script: `/tmp/bsf/falsify.sh` copies bot-smoke.sh, the test and the fixture to a scratch directory and mutates the COPY only; per-mutation byte backup (`cp f f.mutbak`), single `sed` mutation (checked to have changed the file), `timeout 120` on the test run, restore from that mutation's own backup, then `git hash-object --path=<repo path> <copy>` compared to `git rev-parse HEAD:<repo path>`. All fidelity checks OK (415dd23f for bot-smoke.sh, 69c226c3 for the fixture); worktree `git status` clean afterwards. No EXIT trap.

| Criterion | falsifying edit (in the copy) | observed (bot-smoke.test.mjs) |
|---|---|---|
| C1 | drop the `[ -s "$webm" ]` non-empty conjunct in check (a) | 6 passed / 1 failed: "(a) fails with no webm, an empty webm, ..." |
| C2 | drop the `[ "$na" = "1" ]` audio-stream conjunct in check (b) | 6 passed / 1 failed: "(b) fails unless there is exactly one audio and one video stream" |
| C3 | `exit !(p > m)` -> `exit !(p > -100)` (threshold floor) | 6 passed / 1 failed: "(c) fails on a silent, quiet ..." |
| C4 | drop the `$record_exit = 0` conjunct in check (d) | 6 passed / 1 failed: "(d) fails on a nonzero record exit or a leftover ..." |
| C4 | drop the `-z "$left"` (leftover process) conjunct in check (d) | 6 passed / 1 failed: same test |
| C5 | `return "$fail"` -> `return 0` in check_artifacts | 3 passed / 4 failed: tests (a), (b), (c), (d) |
| C6 | record command `--backend tab` -> `--backend obs` | 6 passed / 1 failed: "script records the way run-pipeline does ..." |
| C6 | fixture `frequency.value = 440` -> `0` | 6 passed / 1 failed: "fixture is a self-contained looping canvas + 440 Hz tone ..." |
| C3/C4/C5 (real) | fixture `gain.gain.value = 0.5` -> `0`, real container run of the mutated copy | script exit 1: `SMOKE record exit=1`, `audio level: max -91 dB ← SILENT`, `SMOKE a PASS`, `SMOKE b PASS`, `SMOKE c FAIL audio max_volume '-91.0' dB`, `SMOKE d FAIL record_exit=1`, `SMOKE RESULT FAIL (exit 1)` |
Also run, informational (not a mutant verdict): removing the explicit `botsink` creation and `set-default-sink` still passed (see Finding 4). Removing only the `pactl list short sinks | grep` line made `set-default-sink botsink` fail with `No such entity` under `set -e` (script exit 1), so the sink step is not a no-op.

## How to verify
- Build: `docker build -f docker/meeting-bot/Dockerfile -t bot-smoke-img .` (repo root; about 4 min cold, about 2 min cached).
- Smoke: `BOT_IMAGE=bot-smoke-img bash scripts/qa/container-workflows/bot-smoke.sh` (about 2 min; needs network for the in-container `apt-get install libnss3-tools`); expect `SMOKE a/b/c/d PASS`, `SMOKE RESULT PASS`, exit 0, and no leftover `bot-smoke-*` container.
- Tests: `node --test scripts/qa/container-workflows/bot-smoke.test.mjs` (7 pass, 1 skipped); with `LKB_DOCKER_TESTS=1 BOT_IMAGE=bot-smoke-img` the real run is included (8 pass). On Git Bash for Windows the script sets `MSYS_NO_PATHCONV=1` itself.
- Cleanup of what this unit created: `docker rmi bot-smoke-img` (the smoke removes its own container).
