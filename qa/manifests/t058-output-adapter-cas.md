# t058-output-adapter-cas

**Handshake status:** building
Status: building
Fix cycle: 0
Priority tier: 3 — root-authorized additive T058 adapter verification.
Security class: tenant-scoped data-write adapter and compare-and-set.

This unit exercises the actual `createMongoOutputRepository`, actual collection schema/semantic validator and current `scopedCollection` adapter using an explicitly captured in-process fake driver. No Mongo connection, provider, browser, staged/private database, genuine approval or durable-store acceptance is involved. The root authorized this additive unit; checker owns `qa/contracts/t058-output-adapter-cas.md` and its corresponding verdict. Maker never edits either.

Source: `apps/api/src/knowledge-outputs/repository-adapter.test.ts`. Existing product repository/validator/service source remains unchanged. The input is the existing explicitly synthetic `qa/packets/t058-output-workbench.fixture.json`, with `needs-review` and empty assessment fingerprint; it makes no trusted assessment claim.

Three proposed checks capture the actual raw-driver boundary: a successful revision1 insert followed by a competing revision2 compare-and-set where exactly one writer matches; tenant+_id+expectedRevision filters and tenant-stamped replacement; current reopen; foreign/stale matchedCount0 return; options remain empty (no upsert). Invalid tenant/revision envelopes must fail before any driver data method.

The third check calls the actual create/get/edit/export service with this real repository adapter, an expressly synthetic authorized source and two local synthetic completion callbacks (zero provider requests). Actual policy lookup reads an empty in-memory policy fixture. Creation reaches the driver's insert; reopening and escaped export consume the row; a successful edit advances revision, a stale edit refuses, and edited content cannot export without review. This proves scoped fixture consumer mechanics, never actual provider usefulness, source approval or Mongo durability. Driver list calls are also captured with tenant, sort and limit; invalid assessed content refuses before write.

Current helper delta review: `tenantScope.ts` now accepts the narrower collection capability; runtime replacement still scopes the filter, stamps tenant last, and passes explicit default options. The other three historical helper drifts concern actual consent/eligibility and screen provenance: visibility now withholds nonconsented source context; effective-reader reconciles visual physical origin/markers; planner prevents screen origin remapping or marker removal. Those visibility/transcript helpers are not exercised by this adapter-only command and the historical27 checks are not recertified by it. Full `goal-t058` HOLD0 and original receipts/source snapshot remain unchanged.

Proposed exact single-process command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/knowledge-outputs/repository-adapter.test.ts`, outer timeout60000ms. Only `docker_governance_review` may classify/schedule ordinary execution. No command has run; no receipt, READY or PASS is asserted. Independent scoped checker probes/verdict remain required. Current scoped pins/spec are in the existing owned `qa/evidence/goal-t058/` folder.

This additive adapter evidence cannot satisfy authentic synthesis usefulness, genuine source review, actual durable Mongo/migrations, global mounted runtime, live browser/citations, T056 full-parent or Umesh acceptance.
