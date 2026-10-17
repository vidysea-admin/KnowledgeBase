# Independent checker verdict — goal-t007

VERDICT: HOLD
Cycle checked: 1
Task: T-007 (priority tier 3)
Scope: the five submitted UI/client files only, against `qa/contracts/goal-t007.md`
map 5 and `whatsapp-ingestion-first-slice.md` C12–13 source behavior. This is not full
T-007 acceptance and does not authorize mounting or trusted publication.

## Evidence and timing

Resumed review launch measured: 2026-10-14T19:14:01.9909493Z.
Final five-file hash/readiness check measured: 2026-10-14T19:29:18.7513081Z.
Elapsed between those checkpoints: 916.760359 seconds. Verdict persistence time is
recorded separately after the write; exact per-read/review phase intervals were not
instrumented. No approval was requested, and no runtime command began. A fresh FIFO
slot was requested from `/root/docker_checker` at resumed launch, with the explicit
requirement to wait for pinned install/codegen. No slot grant was received during
this review interval; the time target was exceeded while awaiting that prerequisite
and preparing the independent probes. Do not interpret total elapsed as CPU execution.

Directly reviewed complete new ReviewQueue/client logic and submitted tracked diff;
read relevant AuthContext/shared HTTP wrapper, review router and SessionDetail hash
consumer. Private state remounts for changed credentials and explicit reused-key login;
request generations reject obsolete loads; decisions are explicit and show server-confirmed
states. Approval excludes personal-excluded material; missing/session-mismatched evidence
disables decisions. Encoded evidence paths target the existing session turn hash consumer.
No proven acceptance violation was found by this source review.

Attributed maker evidence (not independently reproduced): packet `qa/packets/goal-t007.md`
cycle 1 records the exact final-byte, approved single-worker invocation:
`node node_modules/vitest/vitest.mjs run src/pages/WhatsAppPage.test.tsx src/pages/whatsapp/ReviewQueue.test.tsx --maxWorkers=1 --minWorkers=1 --fileParallelism=false`
from `apps/web`, with a 90-second wrapper; exit 0, 19/19 cases, Vitest 10.84 s,
outer 14.5147895 s. Its default sandbox startup failed with esbuild spawn EPERM
before any test; exact escalated retry succeeded. React Router future warnings were
disclosed. This fixture evidence does not prove a mounted live API or browser.

Independent runtime coverage prepared but **not executed**:
`qa/evidence/goal-t007/checker.test.tsx` and `checker.config.mts` contain three probes:
real ReviewQueue link navigation into SessionDetail to encoded, highlighted/scrolled
turn 248 of 250; reversed ingest-refresh response ordering; and reused-key login while
a private decision is pending. Proposed bounded single-worker command from `apps/web`:
`node node_modules/vitest/vitest.mjs run --config ../../qa/evidence/goal-t007/checker.config.mts --maxWorkers=1 --minWorkers=1 --fileParallelism=false`.
It still needs a fresh FIFO grant and the known esbuild child-process escalation.
No mutations, browser, provider, DB or product-source writes were performed.

Exact read/check command receipts in tool outputs: initial packet/source read exit 0,
0.6070794 s; source/test/consumer/hash read exit 0, 0.7314205 s; targeted downstream/diff
read exit 0, 3.0860937 s; consumer fixture read exit 0, 4.4216551 s; final UTC/hash/readiness
command exit 0, 0.385138 s. Read-only commands do not satisfy behavioral runtime checks.

## Final checked SHA256s (all five match submitted cycle 1)

| File | SHA256 |
| --- | --- |
| apps/web/src/api/whatsapp.ts | BE1B77720EA928402845728502DCE314931AB07970B55DCC3CF0DAA534E8210A |
| apps/web/src/pages/WhatsAppPage.tsx | 885F1AF68ED4D21B00D141BB8DDD8631F732071621ED4471C5FBAB7693B651CB |
| apps/web/src/pages/WhatsAppPage.test.tsx | F10CF5883BFAA5B87B670AAE119B3C950AF077BD12864FDAAD751FCC53070E61 |
| apps/web/src/pages/whatsapp/ReviewQueue.tsx | 9FE70D1B8643A7878AA8A81650E85145E8002EC3D09AC4338A399ECE4D223D63 |
| apps/web/src/pages/whatsapp/ReviewQueue.test.tsx | D9812D471A8203543CAB8661CB9177662C00DB8B8F4191641DB2F73696019818 |

ISSUES-WRITTEN: none

EXPLANATION: HOLD is for missing independent behavioral evidence and central web
compiler/frozen-contract validation receipts, not a demonstrated source failure.
Keep the manifest ready-for-check; do not close it checked-PASS. Resume the prepared
focused check once the coordinator grants execution and supplies central checks.
Full-parent gates remain: all C1–14, mounted reviewed ingestion/routes, all trusted
retrieval/aggregation quarantine, detection mutation and attachment acceptance,
schema/drift/structure/workspace checks, live Mongo transaction/restart/re-ingest and
second-tenant isolation, exact approved Ask citations, and shipped browser review
workflow with zero errors. A later scoped UI PASS cannot close T-007.

Persistence checkpoint: file existence/length confirmed at 2026-10-14T19:30:07.0322027Z
(4,837 bytes before adding this checkpoint). Launch-to-confirmed-persistence elapsed
965.0412534 seconds. Draft/write phase exact start was not instrumented; do not infer
its duration from the remaining interval.
