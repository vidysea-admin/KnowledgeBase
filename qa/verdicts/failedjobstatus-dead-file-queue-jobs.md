# Verdict - failedjobstatus-dead-file-queue-jobs

**Cycle checked:** 0
**Commit under check:** 936113b6 (lane/failedjobstatus)
**Class:** security (tenancy, information disclosure). Authority: D-139, D-158 (contract t057-d2-activity-health C1/C4 amended).

## VERDICT: PASS

## EXPLANATION
1. Tenancy. Probed at core (listDead) and through real HTTP routers (/activity-health, /notifications) with bearer A while forging `x-tenant-id: B`, `x-forwarded-tenant`, `?tenantId=B`, `?tenant=B`: B's job never appears, the reader is only ever asked for "A", B sees only B. listDead refuses undefined, null, {}, "*", array, object-with-toString, "", trailing space, "a b", bare string, String object (all invalid-input, ISS-JOBQTENANT-001); extra keys (tenantIds, all) are ignored; "tenanta" does not match "tenantA". Result JSON carries no payload and no tenant string.
2. Disclosure. Raw error text (`sk-LEAK /srv/secret/path ... stack at Error`) becomes `unknown` / `unrecognised` in both routes; no path, payload, tenant or raw code in either body. Both routes send `Cache-Control: private, no-store`; /health untouched (diff has no health change).
3. Contract. DTO matches amended C1/C4: optional `source: "job-queue"`, fixed allow-list, tenant scoped. D-158 text says `upload-queue | job-queue`; upload rows omit `source` (permitted: "may include"). NOTE (not a defect): /notifications uses `source: "file-queue"`, a different enum (notification source) than the DTO `source`; inconsistent naming for the same queue, worth a one-line reconciliation if the Approver cares.
4. Upload rows byte-identical: existing activity-health tests (router, queue-reader, notifications) are unchanged by the diff and pass; the "upload rows changed" mutation is killed by them.
5. Web validator rejects unknown source, bad id, non-failed status, non-null deadline, bad class, attempts>max; web vitest 712/712.
6. Maker's claim: the apps/api "actual producer -> Python first/reclaim/fences ..." test (router.test.ts:60, "upload queue operation timeout") DOES fail in the full apps/api suite on untouched main (0a1bec47: 783/785, plus usage "hanging write" timing test), but passes ALONE on both main and lane (3/3, twice each). So it is order/load dependent and not caused by this lane. Filed ISS-FAILEDJOBSTATUS-001 (medium, test-stability).
7. Mutations (9, harness in worktree, byte backup restored in finally, 240s timeout, hash==HEAD blob verified every time, harness deleted): core tenant filter dropped KILLED; core tenant validation dropped KILLED; raw error class leak (api) KILLED; raw label (notifications) KILLED; wrong source value KILLED; upload row altered (source added) KILLED; notifications foreign tenant KILLED; system-status foreign tenant KILLED; web validator accepts any class KILLED. 0 survived (one initial survivor was only a too-narrow test selection; with router/queue-reader tests included it is killed).
8. Suites: core 385 tests, 383 pass, 2 fail = timing tests (ISS-JOBQSTALL-002 S4, default start-time source) under Chrome-worker load; both pass on rerun (43/43). apps/api 796 tests, 795 pass, 1 fail (item 6 only, pre-existing). apps/web 68 files / 712 tests pass. tsc clean for core, apps/api, apps/web.

Notes (low, not backlog): the upload-row validator (types.ts and web model) now also accepts job-queue error classes on source-less rows (allow-list widened for upload); the web page still says "returned upload operations" when job-queue rows are shown. Not wired in production, so no live data.

ISSUES-WRITTEN: ISS-FAILEDJOBSTATUS-001 (pre-existing test instability on main, not this unit)
