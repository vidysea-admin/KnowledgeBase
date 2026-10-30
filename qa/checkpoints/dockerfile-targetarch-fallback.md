# Checkpoint: dockerfile-targetarch-fallback (cycle 0, checker)

Check: node --test scripts/qa/dockerfile-media-tool.test.mjs on head 7db6839e
 scope: 5 tests; test blob scripts/qa/dockerfile-media-tool.test.mjs (git show 7db6839e); Dockerfile at 7db6839e; no deps lock/config; env: win32, git-bash sh, node (stub dpkg)
 result: pass 5 fail 0
Check: same test vs base Dockerfile (6d6aab00, copy outside repo) -> pass 2 fail 3 (TARGETARCH unbound variable)
Check: falsification, head Dockerfile with line 68 reverted to "$TARGETARCH" (copy outside repo) -> pass 2 fail 3; restored -> 5/5
Check: diff scope 6d6aab00..7db6839e -> Dockerfile:68 only + test + manifest
Not run: real docker build (daemon not running) - stated gap
Attribution: claude-sonnet-subagent checker, verdict qa/verdicts/dockerfile-targetarch-fallback.md
