# Checkpoint — wa-selection-api (coordinator B), cycle 0

Head 225fcfee (code 1d557bbf), base 8ca1dcc5. Policy proportional-verification/2026-10-19.17. Tier L.
Environment fingerprint: Windows 11, node v24 (repo engines), tsx via the main tree node_modules (junctions into a `git archive` copy outside the bound root, unlinked after), mongod 7.0 on 127.0.0.1:27999 started and stopped by this run (own PIDs 32348, 13688), throwaway DB `lkb_test_wa_links_chkb`. No dependency lock change (pnpm-lock.yaml untouched in the W6 diff). Original checker attribution: coordinator B (this file), no reuse of any other check.

| Check | Command / scope | Code identity | Result |
|---|---|---|---|
| Acceptance (W6-1..6) | `node --test --import tsx src/whatsapp/selection/router.test.ts` (17 tests) | blob service.ts 5e413934, tree 225fcfee archive | 17 pass 0 fail |
| Regression | selection router.test + links/router.test + links/service.test | same | 41 pass 0 fail |
| Typecheck | `tsc --noEmit -p apps/api/tsconfig.json --forceConsistentCasingInFileNames false` | same | exit 0 (the scratch path's casing differs between two junction routes; flag only silences TS1149, a copy artefact) |
| Mutants M1..M7 | one edit per run to service.ts from the HEAD blob, 120 s timeout, restore from the HEAD blob after each, `git hash-object` == `git rev-parse 225fcfee:<file>` after each | per mutant | all RED, all restored hash-equal |
| Real local Mongo | production factory `buildWhatsAppSelection` + migration `applyWhatsappLinks` + in-repo fake archiver, probe test in scratch | same | pass: one valid `selection.changed` event persisted through the real $jsonSchema validator, links and sync_runs collections byte-identical, admin write 403, other-tenant 404, idempotent repeat no event |
| Read-only credential | local mongod with --auth, user role `read` on the throwaway DB | n/a (Mongo semantics) | read ok; insertOne, updateOne, deleteOne, createCollection all refused code 13 |

Remaining: none.
