# retention-ruling5-api-consumer

**Handshake status:** checked-PASS — closed out 2026-10-26 (resume reconcile) citing qa/verdicts/retention-ruling5.md (cycle-0 PASS on the same change)
Status: ready-for-check
Fix cycle: 0
Lane: lane/w17-retentionapi. Base 42a50b648d98d347faeb86c5e046c436fd33d08f (lane/w17-retention tip, ruling 5). Class: test-only consumer fix.
Authority: ruling 5 (2026-10-17, Approver Umesh).

## Changed paths
- apps/api/src/retention-status/writer-consumer.test.ts: import and use `purgeBaseArgs` (min-age-days 90) instead of `baseArgs` (7) in the dry-run CLI test. No `--execute`. Fixture raw-old is 100 days old at NOW and ~106 days at the real `--as-of`, so it stays a candidate. Assertions unchanged.

## Production callers
grep of apps/api (src, scripts) for retention-purge / RetentionPurge / min-age-days / --execute / confirm-deletion: only this test. No production caller.

## Checks a checker must run
- From apps/api: `timeout 600 node --test --import tsx src/retention-status/writer-consumer.test.ts`
- `node ../../node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` in apps/api.

## Evidence
- Test: tests 2, pass 2, fail 0. The test imports ingest by relative path, so it ran against the lane's ruling 5 code, not the junctioned main tree.
- tsc apps/api: no output, exit 0.
