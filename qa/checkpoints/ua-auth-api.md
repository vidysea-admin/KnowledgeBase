# Checkpoint A: ua-auth-api (coordinator A, cycle 0)
Evidence identity (own runs, 2026-10-30, copy of HEAD f4790297 in the scratchpad, node_modules junctioned, copy removed after):
- code (git blob prefix): auth-service.ts dc18d4ff2ab2 · auth-router.ts ad629bebce91 · throttle.ts 9358eb31b6bd · composition/integrations/user-accounts.ts 7ae7ff0b353b; each equals `git rev-parse HEAD:<file>`. Bound tree clean.
- cmds: `node --test --import tsx src/user-accounts/{throttle,auth-service,auth-router}.test.ts`, cwd apps/api -> 7/7, 17/17, 15/15 green.
- mutants: A4-1..A4-10 (A4-7 re-run for CRLF); 9 KILLED, A4-10 SURVIVED the repo tests and was KILLED by probe P7 (`mutate-p10.mjs`).
- probes: zz-probe P1,P3,P6-P10 7/7; zz-probe2 Q1-Q5 5/5 (real argon2 where stated). Sources and outputs in `qa/evidence/ua-auth-api/checker-a/`.
- Not run: real Mongo (no server), full suite, browser (api-only), lint-loc.
- result: PASS with P1 (medium) to P4 (low) as PROPOSED-ISSUE. Remaining: none.
