# Checkpoint - wa-unlink-consent coordinator B (cycle 1)
Code head b7d4f0d7 (branch head 95ab9656, manifest only), base bf86b0b3. Environment: bound tree for read-only test runs, git archive copy outside it for mutations, node v24, own mongod 7.0.28 replica set (started and stopped by this run).
| check | command | scope | result | identity |
|---|---|---|---|---|
| real-Mongo trio | WA_REVIEW_TEST_MONGO_URL=... node --test --import tsx unlink.mongo.test.ts links.mongo.test.ts account-coupling.mongo.test.ts | 3 | 3 pass, 0 skipped; tally approvalFirst 21 / unlinkFirst 1 | 95ab9656 |
| W8-4 + regression | account-coupling, unlink, link-data, consent-cas, consent-race, service, router, notice, mounted-routes, admin-router tests | 97 | 97 pass | 95ab9656 |
| user-accounts regression | node --test --import tsx src/user-accounts/*.test.ts | 174 | 171 pass, 3 skipped, 0 fail | 95ab9656 |
| typecheck | npx tsc --noEmit -p apps/api | api | exit 0 | 95ab9656 |
| wiring trace | production.ts:265 -> buildUserAccounts default hook -> createAdminRouter -> event() -> accountChanged | static + tests | wired | b7d4f0d7 |
| falsification | 9 W8-4 + 2 W8-6 mutants | archive copy | 11/11 red, 11/11 HEAD-fidelity | qa/evidence/wa-unlink-consent-b/falsification-c1.md |
| diff scope | git diff --stat bf86b0b3..b7d4f0d7 | 9 files | all in manifest; no consent file | |
Checker: coordinator B (claude-sonnet-5-5).
