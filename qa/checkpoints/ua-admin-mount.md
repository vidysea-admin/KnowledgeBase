# Checkpoint - ua-admin-mount (coordinator A) - cycle 0
Head a956d368, base cdc61b36. Policy proportional-verification/2026-10-19.17. Environment: node v24.13.1, scratch copies of git archive a956d368 (read-only junctions to bound node_modules/packages/schema, removed after).
Code blobs at HEAD: composition/integrations/user-accounts.ts d66cc39e, admin-router.test.ts a6382941, structure.config.json (config at a956d368).
Completed checks (command -> result): admin-router.test.ts -> 21/21; principal+auth-router+auth-service+throttle tests -> 48/48; pnpm -s lint:structure -> OK 10 stages; tsc --noEmit -p apps/api -> exit 0; differential probe (fake Db, real adminRouter) -> unlock key == auth.unlockEmail key, issue-link origin+basePath ok.
Falsifications: F1 drop adminRouter -> KILLED by [A6 wiring]; F2 constant subjectHash and F3 drop publicOrigin -> SURVIVE repo tests, killed only by probe (P1); F4 dirsize override removed/33 -> lint violation. End-state blobs equal HEAD blob d66cc39e.
Attribution: coordinator A only; no sub-checkers; dual partner's evidence not read.
