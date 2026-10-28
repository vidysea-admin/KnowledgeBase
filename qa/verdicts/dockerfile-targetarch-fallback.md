# Verdict: dockerfile-targetarch-fallback

Date: 2026-10-27
Cycle checked: 0
Bound to: D:/KnowledgeBase | Base 6d6aab00 | Head 7db6839e | Tier L (Dockerfile build config; no security/prod-write trigger; one checker)
Policy-Version: proportional-verification/2026-10-19.17
Contract: none (human-asked unit); acceptance = C1 from the manifest.

## Check plan
1. Diff scope: `git diff --name-status 6d6aab00..7db6839e` and the Dockerfile hunk.
2. Re-run the test on head; run the same test against the base Dockerfile in a copy.
3. One falsification (floor, 1 criterion): head Dockerfile with the fallback reverted, in a copy outside the repo.
4. Read the test: confirm it downloads nothing.

## Results
- Diff scope: 3 files only (M Dockerfile, A scripts/qa/dockerfile-media-tool.test.mjs, A qa/manifests/dockerfile-targetarch-fallback.md). Dockerfile hunk is one line, 68: `case "$TARGETARCH" in` -> `case "${TARGETARCH:-$(dpkg --print-architecture)}" in`. `ARG TARGETARCH`, both sha256 digests, `sha256sum --check -`, the unsupported-arch `exit 1`, curl line and every other stage are untouched (the hunk has no other +/- line).
- Head: `node --test scripts/qa/dockerfile-media-tool.test.mjs` -> tests 5, pass 5, fail 0.
- Base Dockerfile (copy, `git show 6d6aab00:Dockerfile`): pass 2, fail 3; the 3 failures are the TARGETARCH-unset cases, message `sh: line 2: TARGETARCH: unbound variable`. Red on base, green on head, same node test file (byte-identical copy).
- Falsification[C1]: head Dockerfile with line 68 reverted to `"$TARGETARCH"` (sed in a copy outside the repo; diff vs head is that single line) -> pass 2, fail 3, same message. Restored head -> 5/5. Repo tree never mutated (`git status` clean for both files).
- C1 behaviours, each pinned by a test I ran: unset + dpkg amd64 -> yt-dlp_linux / 58162f9b...; unset + dpkg arm64 -> yt-dlp_linux_aarch64 / b16e4dab...; TARGETARCH=arm64 with dpkg stub amd64 -> aarch64 (set value wins); unset + s390x -> exit 1 with 'Unsupported media-tool architecture'. Digest prefixes match the Dockerfile's pinned digests (read at lines 69-71). `:-` also covers an empty-string TARGETARCH.
- No download: the test slices the RUN block only up to the `esac; \` line (before `curl`), runs it under `sh -eu` with a stub `dpkg` on PATH; the only `curl`/`http` text in the test file is a comment (grep). Nothing touches the network.
- Pre-check reuse: manifest Pre-check line (3703a5e, pass 5) matches what I re-ran; I re-ran rather than reused.

## Stated gap (not a FAIL)
No real `docker build --target media-tool-download` was run: Docker daemon is not running locally (per manifest; I did not start one). The legacy-builder behaviour and real `dpkg --print-architecture` output on node:24-slim are verified by simulation (TARGETARCH unset, dpkg stub), not a real build. CI's next legacy-builder build is the confirming instrument.

## Verdict block
VERDICT: PASS
SCOREBOARD: 1/1 criteria met, 0/0 invariants hold
TIER: L (CI/build config: Dockerfile; no security/auth/tenancy/prod-write trigger, one checker)
FAILURES: none
CAPABILITY-COVERAGE: not-applicable (build config, no product capability rows)
LIVE-BROWSER: not-applicable (Dockerfile, scripts/qa/dockerfile-media-tool.test.mjs, qa manifest)
ISSUES-WRITTEN: none
EXECUTOR: claude-sonnet-subagent (checker: claude-sonnet-subagent)
EXPLANATION: The diff changes only Dockerfile:68 plus the new test and manifest; pins, digests, checksum check and the unsupported-arch exit are untouched. The 5-test file is green on head and 3 of 5 red on the base Dockerfile and on the head Dockerfile with the fallback reverted. A real docker build was not possible (daemon not running) and is a stated gap for CI to confirm.
Metrics: start=2026-10-27T00:00:00Z end=2026-10-27T00:00:00Z wall_min=4 agent_min=4 blocked_min=0 suite_runs=0 repeat_runs=0 mutations=1 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=240 mutants=0 defects_unit=0 defects_6c=0
