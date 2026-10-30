# Checkpoint - ua-deploy-cookie-proxy (cycle 0, single checker)
Head 0ad45a1c, base f57ce7e1, policy proportional-verification/2026-10-19.17. Attribution: claude-sonnet-subagent, verdict qa/verdicts/ua-deploy-cookie-proxy.md.

| Check | Command / scope | Code hashes (git blob) | Env | Result |
|---|---|---|---|---|
| D-4 tests | `npx vitest run docker/runtime-config.test.ts src/api src/config` (cwd apps/web), 14 files / 171 tests | 40-lkb-runtime-config.sh 6299ba9d; runtime-config.test.ts blob at HEAD 0ad45a1c | node v24.13.1, sh = Git Bash, lock hash unchanged (no dependency change) | 171 passed |
| D-4 types | `npx tsc --noEmit -p apps/web` | vite-env.d.ts at HEAD | same | exit 0 |
| F1 default flip | copy, `*) accounts="true"`, test file docker/runtime-config.test.ts | script blob 6299ba9d restored | same | green-before 27/27, red-after 8 failed, restored cmp-equal, hash = HEAD blob |
| F2 raw value | copy, printf arg raw env, same test file | same | same | green-before 27/27, red-after 10 failed, restored cmp-equal, hash = HEAD blob |
| D-1/D-2/D-3/D-5 | grep per token over ops.md, .env.example, DEVOPS-HANDOVER.md; `git diff --name-only f57ce7e1 HEAD` | document blobs at HEAD | n/a | all pass |
| lint:structure | `node scripts/lint-loc.mjs --all` with node_modules junctions for apps/web, apps/api, 7 packages | tree at HEAD | same | OK, 10 stages, 0 failed |
