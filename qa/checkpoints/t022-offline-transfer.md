# Checkpoint — t022-offline-transfer (cycle 1, PASS)

Evidence identity (all re-run by the checker on 2026-10-26, no maker/broker receipt reused):
- code hashes (LF-normalised == git blob): offline-transfer.ts 13079af4, offline-transfer.test.ts 790c0ce5, CalibrationReviewPage.tsx 915e15eb, CalibrationReviewPage.test.tsx bab6c98e, client.ts (page) 30a0c5e4, README 2df7c536; server router 09a5c167, file-store c0fd3ec5, seed 6d003368, types 41b6c165 (read only).
- command: `node node_modules/vitest/vitest.mjs run src/pages/calibration-review/offline-transfer.test.ts src/pages/calibration-review/CalibrationReviewPage.test.tsx --maxWorkers=1 --no-file-parallelism` in a throwaway copy of apps/web (node_modules junction to the bound tree's), collected 9, result 9 pass, exit 0.
- command: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` same copy, exit 0.
- runtime: node v24.13.1, vitest 2.1.8, typescript 5.9.3 (package.json pins); config: vitest.config.ts jsdom + setupTests.ts; lock: none read (pnpm store via junction).
- falsifications A,B,C,D,E,G + extra client mutant: green-before/red-after as in the verdict; probes P1 (4 tests), P2 (1 test) green on real code.
- attribution: this checker only. Scratch: scratchpad/t022ot (ephemeral).
