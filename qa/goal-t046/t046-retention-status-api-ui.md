# t046-retention-status-api-ui

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Task: T-046; Tier: 3 roadmap; class: auth/tenancy operational read, full ceremony.
Maker: /root/qa_status/maker_t046; checker: /root/qa_status/checker_t046.

## Authorized scoped behavior

Read authenticated tenant's private retention last-run state and render compact retention status on the actual meeting-bot page through the shared integration owner. Preserve the prior checked retention planner, dry-run, executor, clips and existing page sections. No actual deletion, scheduler registration, DB writes, deployment, external communication or browser performed by this unit.

Ground truth: qa/contracts/goal-t046.md C3/C4/C5-source/C7, SHA256 166FD5871254BB942D21BC2DCE4FA1998C9F89CFE5D2B8F522FA1BC57D1D1575. Existing contracts/purge policy and prior T046 verdicts retain original scope. This source slice cannot close whole-task C1-C6 acceptance.

## Changes and final candidate hashes (no base existed: all six files untracked)

| Path | SHA256 |
|---|---|
| apps/api/src/retention-status/summary.ts | 214EECB9AE3CAA6943319907FF127D64657F8620DCDDE953241A719B01EE352A |
| apps/api/src/retention-status/store.ts | E0496679485DCB1CD704F3A2362622731E04DB56ACC68791EF8AA0DE20EC736D |
| apps/api/src/retention-status/router.ts | C02F529501A7D09611CEDAED0767745DDB5D3B15BEEF55D5849F7CF40D69BDC6 |
| apps/api/src/retention-status/status.test.ts | 15204C682ACFC8AFC64C5B4D399B4C710341391DC91905DD047C9613DA3349C4 |
| apps/web/src/pages/meeting-bot/RetentionSection.tsx | 8A371173BD9FE0E0B66A5F92AAA28E085DF6F2403573013214C4953AD6AB3E3A |
| apps/web/src/pages/meeting-bot/RetentionSection.test.tsx | F83CC69B6621BC975E8FCA9E2958224ED902F505B8CF0943216A345DDF49E24E |

## Caller/consumer and security map

- router.ts createRetentionStatusRouter: GET /retention/status, existing requireScope('sessions'), req.auth.tenantId only, cache private/no-store, sanitized 503 errors. Integration must mount below existing requireAuth. No client tenant/path selection. Projection repeated at response boundary; reportFile, tenant metadata and undeclared fields excluded.
- store.ts createRetentionStatusReader: configured data root only; SHA256(exact validated tenant) / retention / last-run.json. Required exact private document tenantId. Reject filesystem ancestor links/junctions, nonregular/hardlinked/overlarge files, replaced file identity; no global fallback. Missing configured root is unavailable; genuinely absent tenant state is never-run.
- summary.ts projectSummary: version 1, coherent dryRun/mode/ok/exitCode, canonical bounded ISO dates with finish>=start and at most 5 min future, grouped safe-integer/null counters; dry-run cannot report deletion. Read-only allowlist output.
- RetentionSection.tsx actual apiFetch consumer GET /retention/status with bearer key; SectionFrame supplies auth/loading/error/retry/stale states. Clear never-run, failed, dry-run and execute results, unknown counts, no delete control.
- Existing consumers: apps/api/src/auth.ts; apps/web/src/api/client.ts; pages/meeting-bot/useLoad.ts, SectionFrame.tsx, model.ts. Existing producer: packages/ingest/src/retention/{retention-purge-job,retention-last-run}.ts. Global legacy producer summaries intentionally remain unavailable to tenant API.

Flags: auth YES; tenancy YES; cross-tenant read boundary YES; writes NO in new production code; test fixture writes ONLY disposable temp dirs; credentials sent via existing client auth header, never response/log.

## Shared integration requests (owner /root/docker_runtime; pending)

1. Mount createRetentionStatusRouter({readRetentionStatus:createRetentionStatusReader(configuredSameDataRoot)}) below existing requireAuth.
2. Actual MeetingBotPage imports RetentionSection/loadRetentionStatus, calls useLoad(apiKey,loadRetentionStatus), renders section while preserving others.
3. Actual retention job writer writes exact tenantId inside tenant-private last-run summary, CLI derives private path from strictly parsed tenant/data root; no global fallback/override.
4. Actual pipeline commits validated current tenant/session/source/work-lane index proof before markSessionProcessed; do not assert this is delivered from helper-only history.

## Evidence / exact bounded commands

Root serial CPU lease granted by /root/docker_checker 2026-10-14; used only the two exact focused test files sequentially and released immediately after results. Each hidden Start-Process child had a 45-second outer WaitForExit/Kill bound. Known TSX/Vite subprocess requirement used require_escalated directly; approval succeeded. No source edits during the CPU lease.

- API cwd apps/api: `C:/Program Files/nodejs/node.exe --test --test-timeout=30000 --import tsx src/retention-status/status.test.ts`: exit 0, 4 tests / 4 pass / 0 fail / 0 skip; elapsed 1.1943389 seconds (Node reports 958.6843 ms). Actual in-process HTTP auth/route/store and disposable temp fixtures, including two authenticated tenants, query/header override, revoked/invalid bearer, linked/oversized/malformed private files. Output qa/goal-t046/api-test.stdout.txt SHA256 E7A4515FF0290569D8024275E6FA2D8584DEAA3A046ABA48E9F0331462B1DDB1; stderr empty.
- Web cwd apps/web: `C:/Program Files/nodejs/node.exe node_modules/vitest/vitest.mjs run src/pages/meeting-bot/RetentionSection.test.tsx --maxWorkers=1 --minWorkers=1 --testTimeout=10000`: exit 0, 4 tests / 4 pass / 0 fail; elapsed 3.4617074 seconds (Vitest reports 2.39 seconds, start 19:01:15). Actual existing apiFetch bearer loader and component consumer. Output qa/goal-t046/web-test.stdout.txt SHA256 ED1706E512AC949A98EBB814EAC99BFDDDF2688B97997DC33F0B70BBFBC066C6; stderr empty.
- Frozen-validator evidence reused at queue-owner instruction from qa/evidence/goal-t051checker-validator.json: exact command `python contracts/verify_contracts.py`, exit 0, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`, batch 2026-10-14T18:39:31.7184876Z..18:39:33.1459082Z. Individual duration unknown; combined checker batch 1.4327147s. Fresh hashes match validator 1240059FC2ABC63CDE58472EF8F7964978E74BA5BC2F5156A30379DDAE391DB3 and registry D31DAD4C1FCE135238169F48C18BC5EF68EA0DEFF7978D9323441330778CC940. This vacuous registry check does not replace stage/downstream evidence.
- API/web broad typechecks deferred to central package integration at root CPU owner's direction. Node_modules present; no dependency install performed. Runtime C:/Program Files/nodejs/node.exe; Python C:/Program Files/Python312/python.exe.
- Actual writer-to-reader disposable dry-run proof still pending integration-owned writer signature.

No ledger issue fix claimed, no mutation run. No live/host/scheduler/purge evidence newly acquired. C2 real committed pipeline hook and real clip/current bytes, C3 runtime writer/router composition, C5 actual mounted page/live browser and C6 actual host/scheduler remain explicit gates until independently proven.
