# dockerfile-targetarch-fallback

**Handshake status:** ready-for-check
Status: ready-for-check
**Date:** 2026-10-27
**Fix cycle:** 0 of max 2
**Dual check:** not required (tier L config: Dockerfile build stage plus a test; one checker, no dual)
**Issues addressed:** none (human request in chat 2026-10-27, "yes make it")
**Executor:** claude-sonnet-subagent
**Executor rationale:** one-line config change plus one small test; one builder, no external model.

## What changed
- Dockerfile:68 — `case "$TARGETARCH" in` became `case "${TARGETARCH:-$(dpkg --print-architecture)}" in` (trailing line-continuation backslash kept). Cause: DevOps CI builds with Docker's legacy builder (log: `Step 44/70 ... Removing intermediate container`), which does not set the automatic TARGETARCH build arg, so under `set -eu` the stage failed with `TARGETARCH: parameter not set`. Unchanged: `ARG TARGETARCH`, both pinned sha256 digests, `sha256sum --check`, the unsupported-arch `exit 1`, every other stage.
- scripts/qa/dockerfile-media-tool.test.mjs (new, no existing Dockerfile test of this kind: `git grep -ln Dockerfile -- '*test*'` found only health.test.ts and source-overlay-candidate.test.mjs, neither about this stage) — 5 node:test cases. It extracts the media-tool-download `RUN set -eu; ... esac;` block from Dockerfile, runs it with `sh -eu` and a stub `dpkg` on PATH, and echoes asset/digest. The extract stops at `esac;`, so curl never runs; nothing is downloaded.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: L (CI/build config; one checker, no dual)
Round: 2 files, 1 criterion, est 15 min — one-line Dockerfile edit plus one test and this manifest
Base sha: 6d6aab00
Base / checked state: code commit 3703a5e5, base 6d6aab00, branch docs/devops-golive-2026-10-26
Affected tests / full-suite trigger: scripts/qa/dockerfile-media-tool.test.mjs only; none other reads the Dockerfile's media-tool stage. Builder ran no full suite.
Tests[C1]: scripts/qa/dockerfile-media-tool.test.mjs::TARGETARCH unset: asset is selected from dpkg --print-architecture (amd64); ::TARGETARCH unset: dpkg arm64 selects the aarch64 asset; ::TARGETARCH set wins over dpkg (behaviour unchanged under BuildKit); ::unsupported architecture still exits 1; ::pins unchanged: ARG TARGETARCH, sha256sum --check — the first two assert the fix, the third and fifth that set-TARGETARCH behaviour and pins are unchanged, the fourth that unsupported still exits 1
Pre-check[C1]: 3703a5e node --test scripts/qa/dockerfile-media-tool.test.mjs -> pass 5, 0 failed t=1 blobs=scripts/qa/dockerfile-media-tool.test.mjs:ca958b7
Falsification[C1]: base Dockerfile red (3 of 5 fail, `sh: line 2: TARGETARCH: unbound variable`); fixed Dockerfile with the fallback reverted in a throwaway copy red (same 3 fail); fixed Dockerfile green (5 of 5)
Falsify[C1]: dockerfile-media-tool red@6d6aab00 green@3703a5e5
Metrics: policy=proportional-verification/2026-10-19.17 suite_runs=0 mutations=1 cycle=0 check_s=0 mutants=0 defects_unit=0 defects_6c=0

## How to verify
- `node --test scripts/qa/dockerfile-media-tool.test.mjs` -> expected: tests 5, pass 5, fail 0
- `git show 6d6aab00:Dockerfile > /tmp/d/Dockerfile` placed at `<dir>/Dockerfile` with the test at `<dir>/scripts/qa/` -> expected: 3 fail (base is red)
- `git diff 6d6aab00 3703a5e5 -- Dockerfile` -> expected: a single changed line, 68

## Actual outputs
Fixed tree: `ℹ tests 5 ℹ pass 5 ℹ fail 0`. Base Dockerfile (copy): `ℹ pass 2 ℹ fail 3`, failures `sh: line 2: TARGETARCH: unbound variable` (the amd64, arm64 and unsupported cases). Fixed with fallback reverted (copy): `ℹ pass 2 ℹ fail 3`, same message. Both copies live under the scratchpad, outside the repo; the repo tree was never mutated.

Real `docker build --target media-tool-download .` was NOT run: Docker CLI is present but the daemon is not running on this machine (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`). The legacy-builder behaviour is therefore verified by simulation (TARGETARCH unset, stub dpkg), not by a real legacy-builder build; the checker or CI should confirm with a real build.

Live browser evidence: Not UI-touching — changed paths are Dockerfile, scripts/qa/dockerfile-media-tool.test.mjs and this manifest only; no surface changed.

## Capability coverage
| Criterion | capability | the check that covers it | the falsifying edit | observed |
|---|---|---|---|---|
| C1 | media-tool-download selects its yt-dlp asset from dpkg when TARGETARCH is unset; TARGETARCH still wins when set; unsupported arch exits 1; digests and sha256 check unchanged | scripts/qa/dockerfile-media-tool.test.mjs (5 cases) | revert Dockerfile:68 to `case "$TARGETARCH" in` (throwaway copy) | before the revert `pass 5 fail 0`; after it `pass 2 fail 3`, the unset-TARGETARCH cases fail with `TARGETARCH: unbound variable`; the set-TARGETARCH and pins cases stay green |
