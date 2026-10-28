# failedjobstatus-dead-file-queue-jobs

**Handshake status:** checked-PASS
Fix cycle: 0
Tier: 3 (open medium ISS-FAILEDJOB-001, D-139 follow-up). Class: observability, read-only, tenant-scoped (tenancy touched: FULL ceremony). Lane: lane/failedjobstatus (from 613028be; main merged to pick up D-158 and the amended contract at 60b8e5fc).
Authority: D-139 (dead job on terminal run failure), D-158 (Approver amended t057-d2-activity-health C1/C4: `source` field upload-queue|job-queue, job-queue error-class allow-list, tenant-scoped). Ledger row ISS-FAILEDJOB-001 status NOT changed here. D-139's "/system-status" part is now done under D-158; the earlier option-(b) ordering (notifications first) is also delivered.

## What changed
- `packages/core/src/job-queue/file-job-queue.ts`: `listDead({tenantId}, limit=50)`, read-only (lock + load, no save, no prune, no stamp). Tenant required through `validateQueueId` (ISS-JOBQTENANT-001); filters `status==="dead" && tenantId===opts.tenantId`; newest first; limit 1..100 + `truncated`. Returns only id, errorCode, at, enqueuedAt, attempt, maxAttempts. `lockOptions()` extracted from `run` (no behaviour change).
- `apps/api/src/activity-health/types.ts`: optional `source?: "job-queue"` (absent = upload-queue, so upload rows are byte-identical), job-queue rows projected by their own strict validator (id charset, status failed, deadlineAt null, attempts<=maxAttempts<=100), `jobQueueErrorClass` fixed allow-list (lease-expired, run-missing, bad-payload, plan-invalid, bad-node-result, run-failed; everything else "unknown").
- `apps/api/src/activity-health/file-queue-activity.ts` (new): `withFileQueueActivity(upload, fileQueue)` merges the caller's tenant's dead jobs into the snapshot; no dead jobs -> upload snapshot returned unchanged; file queue read failure fails closed (503, as for upload).
- `notifications.ts`: new optional `fileQueue` dep, source `file-queue`, fixed title/detail with allow-listed reason label (else "unrecognised"), `sources.fileQueue` only when wired; `fromQueue` ignores job-queue rows (no double count).
- `server.ts`: optional `fileQueue` dep wraps activityHealth and feeds notifications. Not wired in production (runner is unwired; nothing constructs it).
- `apps/web` activityHealthModel.ts / ActivityHealthPage.tsx: client validator accepts job-queue rows (same allow-list), page shows "source: job queue" and "Not recorded" deadline.
- /health untouched (D-129).

## Evidence (node from the toolchain)
```
packages/core src/**/*.test.ts            ℹ tests 385 ℹ pass 384 ℹ fail 0 (one run earlier showed 2 fails under load from the Chrome worker; not reproduced on rerun); tsc -p packages/core clean
  file-job-queue.listdead.test.ts         4/4 (tenant isolation, required tenant, read-only byte-identical file, excludes done/ready/leased)
apps/api src/**/*.test.ts                 ℹ tests 796 ℹ pass 794 ℹ fail 2 ; tsc -p apps/api clean
  new: file-queue-activity.test.ts 6/6, notifications.file-queue.test.ts 5/5 ; existing notifications.test.ts, router.test.ts unchanged
  fail 1: router.test.ts "actual producer -> Python first/reclaim/fences ..." (upload queue operation timeout) PRE-EXISTING: fails identically in the unmodified main tree (16 pass / 1 fail)
  fail 2: usage.test.ts "hanging write ... timeout": timing under load; passes alone (usage + router: 16 pass)
apps/web vitest src/pages/activity-health: 5 files, 15 tests pass (incl. new activityHealthJobQueue.test.ts); tsc -p apps/web clean
```
Criteria covered: dead job appears for its own tenant (notifications id file-queue:*, status row source=job-queue); not for another tenant (B/C cases, only caller tenant passed to reader); empty queue changes nothing (deepEqual to the upload snapshot / unwired response); unknown/secret/prototype codes -> "unknown"/"unrecognised"; redaction (no raw code, tenant, path in output); existing tests unchanged.

Mutations (harness in worktree, byte backup restored in finally, timeout, git hash-object equal before/after, harness deleted):
core: 8 listed first pass: no tenant filter KILLED, tenant validation removed KILLED, includes done: SURVIVED then killed after adding the exclusion test; notifications: foreign tenant read, raw code echo, `in` prototype lookup, key always present, truncated dropped: 5/5 KILLED.
status: foreign tenant to file queue, raw error class, allow-list passes any string, source key dropped, projection accepts deadline, web validator accepts any class: 6/6 KILLED; file-queue truncation ignored: SURVIVED then killed after adding the truncation test.

## Not delivered / not verified
No production wiring (runner unwired; `FileJobQueue` is not constructed anywhere), so no live data. `at` is terminalAt only after the next queue operation stamps it, else enqueuedAt. Real Python-queue producer test fails on this machine at base (pre-existing). Browser/Chrome never run.
