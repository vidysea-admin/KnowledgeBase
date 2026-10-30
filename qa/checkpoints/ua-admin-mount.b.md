# Checkpoint (coordinator B) — ua-admin-mount, cycle 0
All checks complete; verdict PASS. Environment: win32, node via tsx, in-memory fake Db (no Mongo), bound root D:/KnowledgeBase, head a956d368.
Code hashes (git blob): composition/integrations/user-accounts.ts d66cc39ef4559977045ab0fccef95bfe4b53ea24 · user-accounts/admin-router.test.ts a63829415ec4f1667d1cf1ecfcf5602d00b7462e · structure.config.json 16dadabd3553429954bdcb5fa57f1ab1af3c659f. Lock hash: pnpm-lock.yaml unchanged by the diff.

| Check | Command / scope | Result |
|---|---|---|
| M-1/M-2 admin suite | `node --test --import tsx apps/api/src/user-accounts/admin-router.test.ts` (21 collected) | 21 pass |
| M-2 A3/A4 suites | principal, auth-router, auth-service, throttle test.ts (9/15/17/7) | 48 pass |
| M-2 importer | cookie.test.ts (6) | 6 pass |
| M-3 | `pnpm -s lint:structure` (10 stages); `tsc --noEmit -p apps/api/tsconfig.json` | exit 0; exit 0 |
| M-1 probe | qa/evidence/ua-admin-mount-b/subjecthash-unlock-probe.ts.txt in a git-archive copy | green (unlock clears the A4 row) |
| F-M1 | copy m1: drop adminRouter from return | 21 pass -> 1 fail by assertion (restored == HEAD blob) |
| F-M2 | copy m2: subjectHash replaced | probe green -> red `cleared` false (restored == HEAD blob); committed suites 60/60 still green under the mutant |
| F-M3 | lint-dirsize `check()` with override removed / 33 | red 34 > budget; green with 34 |

Attribution: coordinator B only, no sub-checkers, no reuse of any other coordinator's evidence. Fingerprint: node on win32, tsx, copies built by `git archive a956d368` with junctions to the real node_modules/packages (link only; never deleted recursively).
