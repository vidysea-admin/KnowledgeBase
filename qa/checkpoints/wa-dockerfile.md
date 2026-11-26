# Checkpoint - wa-dockerfile (C3C), cycle 0, checker fresh claude-sonnet-subagent
Environment: Windows 11, node with the worktree's offline npm cache, no Docker daemon. Head aab9ad5098e61ccffe4a32e7f0f75c9e2d870fce, base be5a090f. Code hashes: Dockerfile b1cd296430f9de3bf49d23eff937169d7e9aac98, .dockerignore b5041426072d5bda0bf22f421a42e3c48d81cef2 (both equal the HEAD blobs before and after). Dependency lock: package-lock.json unchanged vs base.

| Check | Command and scope | Result |
|---|---|---|
| route floor | tick.mjs --route be5a090f..aab9ad50 | floor null, dual false |
| diff scope (4c) | git diff --name-only/--stat be5a090f HEAD; diff of src and readOnlySocket.ts | 2 files, +53/-0; src diff empty |
| static C1-C7, I3 | CTX_ROOT=worktree node qa/evidence/wa-dockerfile/check-dockerfile.mjs worktree | 8 PASS, exit 0 |
| replay C2/C4/C7 | node qa/evidence/wa-dockerfile/sim-build.mjs worktree <fresh scratch> (offline npm) | SIM-PASS, markers 1/1, /app = dist node_modules package.json |
| falsification MA/MB/MC | scratch copies (patch before ci; final-stage npm ci --omit=dev; src in .dockerignore), same checker | MA C1+C2 red, MB C2+C4 red, MC C4 red; control green |
| I2 | reused maker pre-check (typecheck exit 0, 66 tests pass) | valid: no source or test blob changed vs base |

NOT-MEASURED: C3C-C8, and the docker halves of C2, C3, C4, C6, C7 (no daemon, no network).
Maker evidence reused: falsify-output.txt (24 mutants, 0 survivors); identity = unchanged Dockerfile and .dockerignore blobs.
