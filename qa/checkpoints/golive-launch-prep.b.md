# Checkpoint B — golive-launch-prep (coordinator B, cycle 0)
Head 8ba84690 (code 7aae458e), base a9bbeb98, policy proportional-verification/2026-11-22.19. Complete: no remaining mandatory checks except operator steps L1-C7 and L2-C6 (not runnable here by project rule).
Env: win32, node via tsx, scratchpad copies glb/rl, glb/lv (+ rlm1-6, lvm1-6 mutants; junctions to node_modules, left in place, never recursively deleted).
| check | command + scope | code blobs | result |
|---|---|---|---|
| rate-limit + jobs router | `node --test --import tsx src/rate-limit.test.ts src/jobs/router.test.ts` (cwd apps/api), 14 tests | rate-limit.ts b19b8134, rate-limit.test.ts 87b29be6 | 14 pass |
| live-verify | `node --test --import tsx scripts/live-verify.test.mjs` (root), 18 tests | live-verify.mjs 6e371619, live-verify.test.mjs 0fe88b04, pinned json a5b9c320 | 18 pass |
| typecheck | `tsc --noEmit -p tsconfig.json` (apps/api) | tree 8ba84690 | exit 0 |
| apps/api suite | `node --test --test-concurrency=1 --import tsx "src/**/*.test.ts"` (1500 s cap) | tree 8ba84690, lock pnpm-lock.yaml 4015e000 | 2220 pass, 22 skip, 1 env fail (activity-health Mongo), last file cut by cap, re-run alone 6/6 |
| falsification | 12 rows, 6 in glb/rlm1-6 + 6 in glb/lvm1-6, single named node each | as above | all red on the named assertion; green-before in glb/rl (9/9) and glb/lv (6/6) |
| floor recompute | `tick.mjs --route a9bbeb98..HEAD` | | floor L, dual false (contracts rule only) |
| contract identity | `git hash-object` vs `c32c8bbc:` blobs | e92e1a75, 250a93af | identical |
full-suite trigger: auth L unit (repo-wide suite deferred to the pre-push check / CI).
