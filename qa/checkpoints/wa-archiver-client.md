# Checkpoint — wa-archiver-client, checker A, cycle 0
Verdict: PASS. Head 1647c25b, base 00de9d92. Checker agent: chk-wa-archiver-client-a.
- suite: `node --test --import tsx apps/api/src/whatsapp/archiver/*.test.ts` on a `git archive 1647c25b` copy (node_modules junction to main) -> 76 tests, 57 pass, 0 fail, 19 skip. Code hashes: client.ts 59d074e8, config.ts b04eda3a, errors.ts 14e6d8d9, fake-archiver.ts 4948bfed (equal to HEAD blobs). Env: node >=24, win32. Lockfile unchanged.
- tsc --noEmit (tsconfig.base, directory include) -> exit 0.
- falsification M1, M2, M3 (survives), M4, M5, M6, M8, M9, M10: green-before and red-after in separate copies.
- probes: URL spelling matrix (45 cases, flag on and off), hostile-server probe (13 requests, canary sweep clean).
- grep .env.example: 2 / 0.
