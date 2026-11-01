# Checkpoint: wa-selection-api (coordinator A), cycle 0
Original checker attribution: claude-sonnet-subagent, verdict qa/verdicts/wa-selection-api.md. Environment: win32, node v24.13.1, copy of `git archive 225fcfee` with junctions to the main node_modules (packages identical to main HEAD).
Code hashes: service.ts blob 5e4139346996dcc0e5755894784ed19083c9fe11, router.ts blob 70724461b1cabb3586919d70dfcd51f0fd1d1dea. Lock file: pnpm-lock.yaml at 225fcfee (not changed by the diff). Data snapshot: none (no DB).

| Check | Command / scope | Result |
|---|---|---|
| affected tests | `node --test --import tsx src/whatsapp/selection/router.test.ts src/whatsapp/links/router.test.ts src/whatsapp/links/service.test.ts` (3 files, 41 tests) | 41 pass, 0 fail |
| typecheck | `tsc --noEmit -p apps/api` | exit 0 |
| manifest lint | `tick.mjs --lint-manifest qa/manifests/wa-selection-api.md --root .` | exit 0 |
| falsification | 11 mutants, one at a time, per-mutation restore + git hash-object equal to HEAD blob | 8 killed, 3 survived (extras); qa/evidence/wa-selection-api/checker-a-mutants.md |
| event path | stub-Db probe of buildWhatsAppSelection | event accepted, counts only |
| read-only credential probe | not run (local mongod start refused by permissions) | UNVERIFIED-by-checker |
