# Checkpoint (coordinator B) — wa-owner-resolver, cycle 0
Head: 89165c77 (product code a50d2af1). Policy: proportional-verification/2026-10-19.17. Environment: win32, node via tsx, throwaway copy of `git archive HEAD` with link-only node_modules junctions (outside the bound root); local standalone Mongo 127.0.0.1:27018, throwaway db dropped.

| check | command / scope | code hashes (HEAD blobs) | result |
|---|---|---|---|
| verify set | node --test --import tsx owner-config, store-isolation, route-tenant, routes/whatsapp, store-source-id, store-snapshot, store-mongo-snapshot (.test.ts) -> 48 tests | owner-config.ts, store.ts at HEAD | 48 pass, 0 fail |
| wiring | node --test --import tsx apps/api/src/whatsapp/review/*.test.ts | same | 63 pass, 0 fail, 3 skipped (opt-in real-Mongo) |
| falsification W4-1..W4-5 | qa/evidence/wa-owner-resolver-b/mutate_w4b.py, owner-config + store-isolation + route-tenant (25 tests), per-mutation backup, 150 s timeout, hash-object == HEAD blob after each | owner-config.ts, store.ts | 5/5 killed on intended tests, 5/5 restored (True) |
| real Mongo + spoof probe | qa/evidence/wa-owner-resolver-b/zz-checker-b.test.ts.txt | same | 2 pass |
Diff-scope (4c) and security read: done, no defect. Tier L. Verdict: PASS (cycle 0), PROPOSED-ISSUE P1 medium, P2 low, P3 low.
