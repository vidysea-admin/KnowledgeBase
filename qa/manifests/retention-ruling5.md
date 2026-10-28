# retention-ruling5

**Handshake status:** checked-PASS
Fix cycle: 0
Lane: lane/w17-retention. Base 9e55b642. Class: data delete path, FULL ceremony.
Authority: ruling 5 (2026-10-17, Approver Umesh): min-age-days=90, clip-padding-seconds=15, agents dry-run only, real deletion stays human.

## Changed paths
- packages/ingest/src/retention/retention-report-args.ts: `parseArgs(argv, mode)`; `"purge"` mode defaults 90/15 and refuses below 90 / below 15. Report mode unchanged (read-only what-if, still no default).
- packages/ingest/src/retention/retention-purge.ts: `parsePurgeArgs` (shared); `--execute` now requires `--confirm-deletion`; lone `--confirm-deletion` refused; each flag at most once. Final fresh re-evaluation immediately before the unlink (after clip extraction).
- packages/ingest/src/retention/retention-purge-job.ts: uses `parsePurgeArgs`.
- scripts/retention/schedule-retention-purge.ps1: defaults '90'/'15', floors, passes `--execute --confirm-deletion` only behind -Execute (-ConfirmDeletion).
- Tests: retention-purge.test.ts, retention-purge-job.test.ts, retention-live.test.ts, retention-report.fixtures.ts (`purgeBaseArgs`), schedule-retention-purge.test.mjs.

## Residual TOCTOU
Still not atomic: a recording could become active between the final re-check and unlink (ms). Closing it fully needs rename-to-quarantine plus a delayed unlink, a design change not done here.

## Not done / consumer impact
apps/api/src/retention-status/writer-consumer.test.ts (outside brief paths) calls runRetentionPurgeJobCli with fixtures `baseArgs` (min-age-days 7), which the job now refuses; it should use `purgeBaseArgs`. 
No real purge run, no scheduler task installed.
