# Manifest — api-honest-status
**Contract:** C1 C2 C3 C4 (no qa/contracts file; criteria below; QUEUE Wave 1 row W1-api-honest-status, approved by Umesh 2026-10-28)
**Goal task:** none
**Date:** 2026-10-28
**Fix cycle:** 0 of max 2
**Dual check:** no
Dual check reason: no trigger applies. The diff adds no auth, tenancy or data-write logic. The new /connector-workflow fallback is a static deny-only 503 mounted after the existing requireAuth + rate-limit perimeter with requireScope('sources'); it reads and writes nothing and C3 asserts 401 (no key) and 403 (wrong scope) before the 503. The WhatsApp change only relabels an existing 503 body (owner resolution and tenant binding are untouched). /health stays unauthenticated and its body is still the whitelisted {db}.
**Persona walk:** skip (API-only; no UI change)
**Issues addressed:** ISS-368 (verified earlier; regression-pinned here, see C4)
**Executor:** claude-sonnet-subagent
**Executor rationale:** single-context S/M API unit, file-disjoint from the other Wave 1 units

## What changed
- apps/api/src/routes/stubs.ts — new exported `notConfigured(feature)` handler: 503 {error:"not_configured", feature}, nothing else in the body
- apps/api/src/composition/integrations/routes.ts — else-branch: when connectorWorkflow deps are absent (LKB_CONNECTOR_WORKFLOW off) mount `/connector-workflow` behind requireScope('sources') + notConfigured (was a raw 404); the real router is still mounted when configured. Called from server.ts via mountIntegratedWorkflows, so auth/rate-limit order is unchanged
- apps/api/src/whatsapp/owner-config.ts — `WhatsAppNotConfiguredError extends WhatsAppUnavailableError`
- apps/api/src/whatsapp/store.ts — owner not resolved, or a network-class archive error while WHATSAPP_MONGO_URL is unset, throws NotConfigured; a configured-but-down archive keeps WhatsAppUnavailableError
- apps/api/src/routes/whatsapp.ts — `sendUnavailable`: NotConfigured -> 503 {error:"not_configured", feature:"whatsapp"}; Unavailable -> unchanged `whatsapp_unavailable` body; unexpected errors still 500
- apps/api/src/routes/health.ts — `checkHealth()` throw -> 503 {db:"error"}; detector throw -> counted unreadable -> 503 (was an unhandled rejection / bare 500)
- tests: routes/stubs.test.ts (new, C3), routes/whatsapp.test.ts, routes/health.test.ts, whatsapp/store-mongo-snapshot.test.ts (vm module table gains the new class)
- qa/issues.api.jsonl — ISS-API-001..003 (low/medium, not units)
- Scope finding: the live 500 on /whatsapp/groups came from the older deployed build; HEAD already answered 503 `whatsapp_unavailable`. ISS-368's heartbeat-read fix (D-102) is already at HEAD and verified. This unit therefore gives WhatsApp the stable `not_configured` body and closes the remaining health gap (a throwing probe).

## Acceptance criteria
- C1: WhatsApp not configured (no owner grant, or archive URL unset and archive unreachable) answers 503 exactly {error:"not_configured", feature:"whatsapp"} on GET /whatsapp/groups and POST /whatsapp/ingest, with no host, URL, credential, owner id or driver text.
- C2: A configured but unreachable archive keeps 503 `whatsapp_unavailable`; an unexpected non-Mongo error still returns 500 (regression pins retained).
- C3: With the connector workflow unconfigured, every /connector-workflow route answers 401 without a key, 403 without the `sources` scope, else 503 exactly {error:"not_configured", feature:"connector-workflow"} (never 404); configured deployments still get the real router.
- C4: GET /health reports 503 (degraded) when the db probe throws ({db:"error"}) or the watcher detector throws, never 200 and never a hang, with no leak; the ISS-368 cases (unreadable heartbeat read -> 503, readable fresh -> 200) stay green.

## Verification scope
Policy-Version: proportional-verification/2026-10-19.17
Tier: M — 4 criteria across 5 product files; no security/auth/prod-write trigger
Round: 10 files, 4 criteria, est 25 min — API-only edits plus 4 pinned test files
Base / checked state: base 338d2178, code SHA 83c7b50e on branch wave/api-honest-status (worktree .worktrees/api-honest-status)
Gate answers: none (Wave 1 approved in QUEUE 2026-10-28)
Affected tests / full-suite trigger: none; no lockfile, config or shared-fixture change. Also green outside the selected set: whatsapp/{owner-config,route-tenant,store-isolation,store-snapshot,store-source-id}.test.ts, server.test.ts, automation/mounted.test.ts, health-probe.test.ts, connector-workflow/workflow.test.ts (16 pass), composition/integrations/mounted-routes.test.ts (4 pass). tsc --noEmit clean.
Tests[C1]: apps/api/src/routes/whatsapp.test.ts::"unavailable owner is sanitized503…", "POST missing owner is sanitized503…", "C1/C2: unreachable archive…" — pin the exact not_configured body for groups and ingest and the no-leak check
Tests[C2]: apps/api/src/routes/whatsapp.test.ts::"known source network/config errors become sanitized503…", "unexpected group-list errors remain500…", "C1/C2…" — configured-but-down keeps whatsapp_unavailable; spoofed errors stay 500; apps/api/src/whatsapp/store-mongo-snapshot.test.ts — store module still loads with the new class
Tests[C3]: apps/api/src/routes/stubs.test.ts::"C3 connector-workflow…" — 401/403/503 across five routes and methods through the real createServer perimeter
Tests[C4]: apps/api/src/routes/health.test.ts::"C4…" plus the existing "ISS-368…" and "R2…" cases in the same file — new throw handling and the unchanged unreadable-read 503
Falsification[C1]: copy-mutant in apps/api-mutcopy (removed after): whatsapp.ts NotConfigured branch disabled -> whatsapp.test.ts exit 1 (red) -> restored; git hash-object cae6562baa0f == HEAD blob cae6562baa0f
Falsification[C2]: copy-mutant: store.ts always NotConfigured (env check dropped) -> whatsapp.test.ts exit 1 (red) -> restored; hash-object 64a32869c6c3 == HEAD blob 64a32869c6c3
Falsification[C3]: copy-mutant: routes.ts else-branch removed -> stubs.test.ts exit 1 (red) -> restored; hash-object b3312306cf47 == HEAD blob b3312306cf47
Falsification[C4]: copy-mutant: health.ts try/catch around checkHealth removed -> health.test.ts exit 1 (red) -> restored; hash-object 267338b03da6 == HEAD blob 267338b03da6
mutant-cap-raise: all 4 mutations are the one-per-criterion falsification floor of policy .8-4 (C1..C4); no extra mutants beyond the floor.
Falsification note: each mutant ran in a throwaway copy (apps/api-mutcopy, node_modules junction unlinked with Directory.Delete before the copy was removed; target node_modules intact), with a per-mutation byte backup restored in a finally block; the bound tree was never mutated.
Pre-check[C1]: 83c7b50e cd apps/api && node --test --import tsx src/routes/whatsapp.test.ts -> exit 0 (13 tests) t=26
Pre-check[C2]: 83c7b50e cd apps/api && node --test --import tsx src/routes/whatsapp.test.ts ; node --test --import tsx src/whatsapp/store-mongo-snapshot.test.ts -> exit 0 (13 tests + 1 test, two invocations) t=38
Pre-check[C3]: 83c7b50e cd apps/api && node --test --import tsx src/routes/stubs.test.ts -> exit 0 (1 test) t=28
Pre-check[C4]: 83c7b50e cd apps/api && node --test --import tsx src/routes/health.test.ts -> exit 0 (25 tests) t=30; tsc --noEmit -p apps/api/tsconfig.json exit 0 t=90
Metrics: start=2026-10-28T15:25:00Z end=2026-10-28T17:00:00Z wall_min=95 agent_min=unavailable blocked_min=0 suite_runs=0 repeat_runs=0 mutations=4 cycle=0 resumes=0 tokens=unavailable policy=proportional-verification/2026-10-19.17 check_s=0 mutants=0 defects_unit=0 defects_6c=0 builder_min=95
Status: ready-for-check
