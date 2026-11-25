# Checkpoint — golive-launch-prep (coordinator A) — cycle 0
Head judged 8ba84690 (code 7aae458e), base a9bbeb98. Policy proportional-verification/2026-11-22.19.
Evidence identities (command | scope | code blobs | env | result):
- node --test --import tsx src/rate-limit.test.ts src/jobs/router.test.ts | cwd apps/api, 14 tests | rate-limit.test.ts:87b29be router.test.ts:5b077b2, rate-limit.ts at HEAD | node + tsx from worktree node_modules | 14 pass 0 fail
- node --test --import tsx scripts/live-verify.test.mjs | cwd root, 18 tests | live-verify.test.mjs:0fe88b0 | same | 18 pass 0 fail
- pnpm typecheck | cwd apps/api | tsc --noEmit | no errors
- contracts byte-identity vs c32c8bbc | git rev-parse of both blobs | equal
- falsification L2 x6 (checker, copy chkA-l2, green 9/9 before) and L1 x6 (sub-checker aa5fa86c41ce4aca5, copy chkA-l1, green 18/18 before): all red for the named reason, restored and cmp-verified.
Not run (by instruction): L1-C7, L2-C6 (deployed address); repo-wide suite -> `full-suite trigger: auth L unit` for the pre-push check. apps/api package suite: partial (cap 560 s, ~71 of 302 files, one environmental red activity-health/router.test.ts:150 python venv); behaviour-scoped set of 15 limiter-mentioning files: 209 tests, 190 pass, 0 fail.
Remaining: none.
