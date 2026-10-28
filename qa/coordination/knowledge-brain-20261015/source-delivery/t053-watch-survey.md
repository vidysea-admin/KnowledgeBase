# T-053 watched-source survey

Read-only source inspection, 2026-10-15. Loaded `skills/maker/SKILL.md`. No source edits, tests, browser, network or database access.

## Existing behavior

- `packages/ingest/src/watched/schedule.ts`: active sources become due at `checkIntervalHours`; `check.ts` hashes fetched text and compares the prior hash; `run.ts` persists outcomes and reports failures/truncation. Corresponding `schedule.test.ts`, `check.test.ts`, `run.test.ts` exist.
- `apps/api/src/connector-workflow/watched.ts:17`: guarded snapshot -> SHA-256 -> tenant-scoped intake -> verified index receipt -> compare-and-set `lastFetch`. Unchanged content is retried when physical consumption proof is absent. Snapshot intake avoids a second-fetch race.
- `apps/api/src/connector-workflow/workflow.test.ts:292`: changed/unchanged consumption; :316 failed-index retry; :343 partial consumer refusal; :377 legacy hash-only recovery; :390 HTML snapshot and per-URL provenance.

## Exact durable-mode gap

`apps/api/src/connector-workflow/router.ts:115-117` rejects watched verification with `watched_job_snapshot_unsupported` whenever `deps.sourceJobs` exists. `workflow.test.ts:64` explicitly tests this gate. Synchronous hash-diff ingestion exists; durable source-job mode cannot run it through this route.

Potential additive implementation/test files: `apps/api/src/connector-workflow/watched-jobs.ts` and `watched-jobs.test.ts`, for snapshot-bound enqueue, worker consumption and idempotent receipts. Removing the existing gate requires edits to router/types/store/worker consumers; a new-only implementation cannot complete that integration.

## Separate potential finding

`watched.ts:27-35` caps processing at 25 rows and increments `processed` before its due check. `mongo-store.ts:130` lists active rows without pagination/sort. Consequently, 25 not-due leading rows can repeatedly prevent a later due row from being reached. This is source-derived potential starvation, not a reproduced test finding. Distributed cadence also remains an explicit operational gate (`watched.ts:15`); lock scope is one service instance.
