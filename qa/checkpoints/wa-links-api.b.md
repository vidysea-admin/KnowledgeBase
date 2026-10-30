# Checkpoint (coordinator B) — wa-links-api, cycle 0

Env fingerprint: Windows 11, node v24.13.1, tsx 4.23.13, mongod 7.0.28 standalone local (127.0.0.1:27919, stopped), git archive of 8ca1dcc5 outside the bound root with junctioned node_modules (main tree packages equal base for `packages/`).
Code hashes: service.ts / router.ts blobs equal `git rev-parse 8ca1dcc5:<path>` after every mutant (8 of 8).
Attribution: coordinator B (claude-sonnet-subagent), own runs only.

| Check | Command / scope | Result |
|---|---|---|
| unit+http | `node --test --import tsx src/whatsapp/links/{service,router,notice}.test.ts` (apps/api, copy) | 27 pass, 0 fail |
| mounted surface | `mounted-routes.test.ts server.test.ts user-accounts/admin-router.test.ts` | 37 pass |
| tsc | `tsc --noEmit -p apps/api/tsconfig.json` | exit 0 |
| lint:structure | `node scripts/lint-loc.mjs --all` | 9/10 stages OK; dependencies not runnable on the copy (symlink ENOENT), imports read manually |
| real Mongo | links.mongo.test.ts unmodified | FAIL at migration guard (P2) |
| real Mongo | same, db name from MONGO_WORK_DB (copy only) | PASS |
| real Mongo probe | all transitions/events/bind/relink/expiry/ensureOwner count (copy only, not committed) | all as expected |
| falsification | 8 mutants, one per criterion plus one extra | 6 killed, 2 survived (P3, P4) |
