# Verdict — bot-smoke
**Cycle checked:** 0
**VERDICT: PASS**
**Checker:** A (fresh, bound to D:/KnowledgeBase, worktree .worktrees/bot-smoke)
**Policy-Version judged under:** proportional-verification/2026-10-19.17 (as pinned in manifest)
**Diff checked:** 82b9b177..94cda247 (code commit 964bf183; 94cda247 adds only the manifest). Blob identity: bot-smoke.sh 415dd23f and fixture 69c226c3 equal the manifest's pre-check blobs.

## Independent evidence (re-run by checker, tree untouched)
- node --test scripts/qa/container-workflows/bot-smoke.test.mjs (one file, timeout 240): 7 pass, 0 fail, 1 skipped (real container test, env-gated). Covers C1-C6 shimmed paths.
- Real-tool check-mode run inside the existing image lkb-bot-u1:test (--network none, script piped on stdin, real ffprobe/ffmpeg/volumedetect and real /proc), synthetic webm files:
  - tone+video webm: a/b/c/d PASS, max_volume -18.0 dB, rc 0 (C1, C2, C3, C4 positive).
  - silent audio: `c FAIL '-91.0'`, rc 1. video-only: `b FAIL video=1 audio=0`, rc 1. audio-only: `b FAIL video=0 audio=1`, rc 1.
  - record_exit=1: `d FAIL record_exit=1`, rc 1. Live process named `chrome`: `d FAIL record_exit=0 leftover=[535:chrome]`, rc 1 (C4, C5).
- C6: command shape `node --import tsx packages/meeting-bot/src/cli.ts record "$url" --until "$until" --backend tab` present at bot-smoke.sh:126 with LKB_CAPTURE_BACKEND=tab; fixture has canvas + requestAnimationFrame loop + 440 Hz oscillator, no external src/href/fetch (test asserts).

## Falsification (copy in scratchpad/bsf, per-mutation byte backup, restored and verified with git hash-object --path == git rev-parse HEAD:path; bound tree never mutated, git status clean)
- C1 drop `-s` conjunct in (a): RED (a test). C2 drop audio-stream conjunct: RED (b test). C3 threshold `p > m` -> `p > -100`: RED (c test).
- C4 drop record_exit conjunct: RED; drop leftover-process conjunct: RED (d test both).
- C5 `return "$fail"` -> `return 0`: RED (4 tests a-d); `--check` dispatch `exit $?` -> `exit 0`: RED (4 tests).
- C6 `--backend tab` -> `--backend obs` on the record line: RED (command-shape test); `frequency.value = 440` -> `0`: RED; injected external `<img src="https://...">`: RED (no-external-assets test).
- All restores hash-equal HEAD (bot-smoke.sh 415dd23f69c6, fixture 69c226c3a742).

## Adversarial hunt (auth / tenancy / data-write)
- No product source touched. Script sets LKB_CAPTURE_APPROVED_BY=bot-smoke / APPROVAL_REF=D-205-bot-smoke only inside a throwaway container against a local 127.0.0.1 fixture; it does not read .env, push, or use credentials (static test asserts no `.env`, `docker push|login`). Container is `docker rm -f -v` in an EXIT/INT/TERM trap, name global so the trap resolves. Cert/key are throwaway in /tmp inside the container. No bypass found.
- Minor: tests do not have a mutant-catching assertion that a pre-existing `tab-*.webm` from an earlier run in /app/raw/webinars cannot satisfy (a); irrelevant in a fresh throwaway container. Not filed.

## Limits (honest)
- The full end-to-end record run (real Chrome tab capture in the image, C1-C4 positive on a recorded fixture) was NOT re-run by the checker: it needs `apt-get install libnss3-tools` in the container (network, forbidden here), certutil is absent from the image, and the manifest's image bot-smoke-img is not present locally. C1-C4 end-to-end rest on the maker's recorded run (exit 0, 5022195-byte webm, -3.4 dB) at the identity-matched blob 415dd23f plus the checker's real-tool check-mode evidence above.
- Product observations in the manifest (certutil missing from image, HTTPS-only consent, CRLF checkout of *.sh) are maker findings for the coordinator, not defects of this unit.

## Issues
ISSUES-WRITTEN: none
PROPOSED-ISSUE: none (low, non-blocking, coordinator note: add libnss3-tools to docker/meeting-bot/Dockerfile and `*.sh eol=lf` to .gitattributes so the smoke needs no network and runs from a CRLF checkout)

## Metrics
check_min=12 mutations=12 suite_runs=13 repeat_runs=0 cycle=0 files_run=1 real_tool_scenarios=6
