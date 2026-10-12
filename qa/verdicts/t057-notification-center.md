# Verdict: t057-notification-center

VERDICT: PASS
Cycle checked: 0
Commit checked: 8e0fd77 (lane/notifcenter)
Scope: GET /notifications aggregation (apps/api/src/activity-health/notifications.ts), web /notifications page, nav and route wiring.

## EXPLANATION

- Tenancy: tenant comes only from `req.auth.tenantId`; query/body tenant selectors and unknown params are refused with 400. The aggregator builds no filter. It passes the tenant to the three existing readers: provider jobs (`jobs(tenantId)` = `scopedCollection`) and watcher (`watchReports(tenantId)` = `scopedCollection`) are scoped by the real helper in packages/db; the upload queue reader keeps its existing single-tenant guard (`tenantId !== configuration.tenantId` throws, so any other tenant degrades to `unavailable`). Limit: the two-tenant test uses fake tenant-honouring readers with the real router and auth middleware, NOT the real scoping helper; the production scoping is covered by the siblings' own tests. Not a defect, noted.
- Leak: read every template. Titles are constants. Details use `errorClass` (validated enum), attempts/maxAttempts (validated ints), provider `kind`/`provider` only if `^[A-Za-z0-9._:-]{1,64}$` (else dropped), watcher `mode` (enum) and two counts. Raw `error`, `errors[]`, `digestPath`, tenantId are never read after projection (projectJobSummary / projectWatchRun strip them). Ids are `source:rowId` (opaque, <=200). No emails, Drive names, URLs or keys reach a template.
- Limit/order: `^[1-9][0-9]{0,2}$` and <=100, repeats, `0`, `101`, `01`, `1e1` all 400; default 50. Merge sorts `occurredAt` desc with id as the tiebreak, so deterministic. Partial outage: per-source `unavailable`, all three -> fixed 503; `truncated` set from sources or overflow. Honest.
- localStorage: stores only an id array, no content; every access in try/catch. FINDING: key `lkbNotificationsRead` is global, not per tenant/key, so a second tenant on the same browser inherits the first tenant's opaque ids and shares the 500 cap. No count or content from the previous tenant is shown (counts come from the current response). Filed ISS-NOTIFCENTER-004 (low).
- Merge: `git merge-tree --write-tree lane/notifcenter codex/machine-migration-2026-10-09` printed a tree id only, no conflict markers; App.tsx/NavSidebar/server.ts additions sit beside the merged ops-health and send-now changes.
- Counts I re-ran: API notifications.test.ts exit 0 (6 tests); web notifications+ops-health+App.routes 3 files / 19 tests passed; `tsc --noEmit` exit 0 in apps/api and apps/web.
- Mutations (own harness, per-mutation backup restored in `finally`, hash-verified): A all three readers pinned to tenant "A" -> KILLED; B provider-job raw `error` text interpolated into title -> KILLED (a first draft that read fields already stripped by the projector was a no-op and was discarded); C limit bound removed -> KILLED. 3 of 3.
- After: notifications.ts blob 15443a0d = `git rev-parse HEAD:` blob; harness deleted; worktree and main tree clean apart from this verdict and the ledger row.

ISSUES-WRITTEN: ISS-NOTIFCENTER-004 (low)
