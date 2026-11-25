# Checkpoint (coordinator B): wa-key-store (C3B), cycle 0

Policy-Version: proportional-verification/2026-11-22.19
Status: complete, verdict PASS written to qa/verdicts/wa-key-store.b.md. Resume: 0.

Evidence identity common to every row below:
- code: head 350df1670df8592b411c0f0a833895a79252caef; src/wa/authState.ts blob bcabe1d45042593d49b1bdee628413157b0d3a25; src/wa/authState.test.ts blob 56d7e7852cf0f9858a1d2be6cc5a749d704be215
- config and lock: package-lock.json de8280e32c8643bc9e75e4e0f56c9cebc56924c7; tsconfig.json c4a0b5f0bda06e322f546dd1fbf3bc9d42ea5617; node v24.13.1, win32; mongod 7.0 loopback 127.0.0.1:27931 (own PID 45624, stopped)
- scratch copy: `scratchpad/c3b-check-b/copy` (real node_modules copy, no install, no network)

| # | Check | Command and scope | Result |
|---|---|---|---|
| 1 | Full file with database | `C3B_SEED=777 C3B_TEST_MONGO_URI=<loopback> npx tsx --test --test-force-exit src/wa/authState.test.ts` | 93/93 pass (run-mongo.txt) |
| 2 | Full file, no database | same, no URI | 52 pass, 41 skipped as NOT-MEASURED (run-nodb.txt) |
| 3 | Typecheck | `npm run typecheck` (tsc --noEmit) | clean (typecheck.txt) |
| 4 | Probes P1-P4 | probe copy of the test file plus PROBE-P1..P4 | 8/8 on fake+mongo (run-probe.txt); probe file sha256 a709b98cd8a5578e... |
| 5 | Probe P5 | PROBE-P5 projection check | green on the head, red under X8 |
| 6 | Mutants X1-X10 | qa/evidence/wa-key-store-b/mutate.mjs, seed 12345, no database, 150 s timeout, per-mutation backup | X1-X7, X10 killed; X8, X9 survive the builder suite; all hashes = HEAD blob |
| 7 | X8, X9 under probes | mutate-probe.mjs, PROBE-P1 and PROBE-P5 | X8 killed by P5, X9 killed by P1; base green; hashes = HEAD blob |
| 8 | Floor recompute | `tick.mjs --route c4bb66b3..350df167 --root .worktrees/wa-c3b` | floor null, dual false; tier L kept on the manifest's trigger |
| 9 | Scope and greps | diff names; I5 grep; I2 | exactly 2 files; I5 grep empty; I2 holds |

Cleanup: mongod PID 45624 stopped, its dbpath removed, mutant dirs removed. PID 5984 never touched.
