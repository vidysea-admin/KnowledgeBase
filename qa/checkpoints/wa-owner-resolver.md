# Checkpoint - wa-owner-resolver coordinator A (cycle 0)
Evidence identity for all rows: head 89165c77, base 00de9d92; code hashes owner-config.ts b258b7dc, store.ts b819c5ab, production.ts 8ffc1434, knowledge.ts bc04b124; dependency lock pnpm-lock.yaml unchanged by the diff; runtime node + tsx via link-only node_modules junctions to the main tree (its @lkb/db identical to base); no build/deploy id (api-only unit tests); no data snapshot. Attribution: checker A (claude-sonnet-subagent), verdict qa/verdicts/wa-owner-resolver.md.
- `node --test --import tsx` owner-config + store-isolation + route-tenant + routes/whatsapp + store-source-id + store-snapshot + store-mongo-snapshot (7 files, 48 tests) -> 48 pass, 0 fail.
- `node --test --import tsx` review/*.test.ts + tenant-guards/scoped-write.test.ts + store-guards.test.ts -> 183 tests, 0 fail, 3 skipped.
- `tsc --noEmit -p apps/api` -> clean (no output).
- Falsification M1..M5, G2, G3 (one fresh copy per mutant, 25 tests green before) -> all killed; table in qa/evidence/wa-owner-resolver/checker-a-mutants.md.
- Probes: real resolver + real store (admin / member / key / ambiguous / linkId); seeded document vs schema/whatsapp_links.schema.json -> pass.
