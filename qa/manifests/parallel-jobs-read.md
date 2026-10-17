# Parallel jobs read — coordination

Task: T-057; tier: 3 roadmap; mode: NORMAL per root approval.
Status: implementation-ready — planning complete, implementation not checker PASS.

## Scope authorization
Root explicitly authorizes a dedicated new jobs resource scope for this new read-only provider ledger. Use existing requireScope("jobs") after authenticated/rate-limited composition. Existing scopes are arbitrary strings in schema and POST /keys already accepts nonempty string arrays; no auth helper/schema/frozen-contract edits required. Do not broaden sessions or keys privileges. No key minted or DB action. The Settings checkbox list does not currently offer jobs: single integrator owns adding it and its security test later.

## Accepted machine contract
qa/evidence/parallel-jobs-read/contract.json is implementation-ready. GET /jobs exposes {jobs,limit,truncated}; each summary only {_id,kind,status,createdAt,provider?,updatedAt?}. Status pending|processing|done|failed. Only query limit; default50/hardcap100, strict scalar ASCII positive decimal/range1..100. Reject repeated/array/object/unknown/tenant selectors before dependencies. Verified req.auth.tenantId is sole tenant. Scoped application-DB read, createdAt DESC then _id DESC, fetch limit+1, true truncation only when extra result observed. Explicit projection and defensive validation omit tenant/raw request/response/error/lease/cost/credentials. Malformed data gives generic503. Private no-store. Dedicated upload queue and general pipeline/cost analytics are excluded.

## Disjoint implementation ownership
DB builder: packages/db/src/collections/jobs.ts and jobs.test.ts; unchanged scopedCollection. API builder: apps/api/src/jobs/router.ts, router.test.ts, store.ts, store.test.ts; JobsReadDeps.listJobs(tenantId,limit) returns validated JobsReadResponse. Web builder: apps/web/src/api/jobs.ts and jobs.test.ts, pages/jobs/JobsPage.tsx and JobsPage.test.tsx; frontend hand-mirrors HTTP shapes, no package imports; stale auth generation success/error refused, rows cleared immediately on key replacement/logout.

Single integrator alone owns packages/db/src/index.ts, apps/api/src/server.ts, fixtures.ts, production.ts, apps/web/src/App.tsx, layout/NavSidebar.tsx, pages/SettingsPage.tsx and SettingsPage.test.tsx. production.ts is already dirty under concurrent Ask work and requires cross-chat coordination before edits. API builds import @lkb/db.jobs after integrator barrel wiring; makers report dependency pending rather than edit shared export. Root dispatches makers; independent checker /root/compete_tenancy_checker owns qa/contracts/parallel-jobs-read.md and final verdict.

## Budget/cap evidence
Observed DB collections20/30 ->22 with accessor/test; web API16/30 ->18; web pages20/30 unchanged by jobs subdir. API src33/31 and routes32/30 already exceed directory caps: new implementation belongs in apps/api/src/jobs/ (four files), without budget config edits. New jobs-read accessor/API/UI seams have0 prior PASSes. Source TS <=300 nonblank LOC/testTS <=400; avoid unrelated writer/worker/helper changes.

## Evidence and limits
Read-only source checks establish schema fields, tenant accessor, existing provider writer and dedicated upload DB split, auth/scope and key issuance mechanics. No tests, DB/provider/browser calls, key minting or implementation edits were performed by planner. No checker PASS or T-057 completion claim. Root hardcap100/default50 agrees independent checker request; semantic truth and human gold unrelated to this provider-status feature remain unchanged.
