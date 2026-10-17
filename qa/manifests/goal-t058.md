# goal-t058

**Handshake status:** ready-for-check
Status: ready-for-check
Fix cycle: 0
Priority tier: 3 — D-170 authorized full T-058 implementation, with existing live/provider/user acceptance gates preserved.
Security class: authentication, tenant reads/writes/exports and stored draft edits.

## Authorization and acceptance

Root GO relayed by `/root/deploy_environment`: exclusive `apps/api/src/knowledge-outputs/**`, `apps/web/src/pages/knowledge-outputs/**`, `apps/web/src/api/knowledge-outputs.ts`, feature documentation and own QA manifest/packet/evidence. Shared schema/generated/migration/API composition/App/nav dependencies remain central `/root/docker_runtime` writes. Maker never edits `qa/contracts/` or a verdict. No commit/push.

Acceptance: checker-owned `qa/contracts/goal-t058.md`, C1–C12. Existing `qa/contracts/t058-evidence-builder.md` and cycle0 PASS remain unchanged and scoped to literal evidence foundation. Whole T-058 requires genuine integrated provider/sample/live UI and Umesh acceptance, with T-056 dependency tracked separately. No source-only PASS closes the parent.

## Candidate source map

New API files: types.ts (generated collection type and bounded input), evidence.ts (authorized verified source resolution and source/policy digest), assessment.ts (exact item/source assessment fingerprint), synthesis.ts (structured three-kind provider generation plus separate entailment assessment), service.ts (create/edit/revalidate/export orchestration), markdown.ts (escaped editable artifact), repository.ts (tenant-bound Mongo and reference memory store, atomic revision), validator.ts (actual JSON schema/Ajv2020/formats and semantic identity/reference/role/range/fingerprint checks on writes and reads), reader.ts (tenant-scoped session/claim/turn reads through real T007 knowledge visibility), router.ts (scope-gated endpoints), wiring.ts (real provider/policy integration factory), workbench.test.ts (focused successful/adversarial behavior), persistence.integration.test.ts (explicit isolated Mongo integration).

New web files: API HTTP projection/client, KnowledgeOutputsPage.tsx (create/reopen/edit/revalidate/export/citations and auth-session stale-response fencing), workbench.ui.test.tsx (single-process node/jsdom HTTP consumer harness).

Feature documentation: docs/features/t058-output-workbench.md.

All paths above are new/untracked; no base existed. Core evidence-builder is reused unchanged. Exact final hashes and central integration diff will be pinned after checks.

## Current implementation facts and remaining evidence

Every model item uses server-generated citation IDs resolved from verified claim evidence. Unknown citations and malformed model JSON refuse. A separate model call assesses grounding; unsupported text remains withheld. Source coverage and excluded-claim counts stay visible and bind the digest; a refusal policy cannot treat partial source evidence as ready. All content is an AI draft, never human verification. Edits preserve citation references, set needs-review and require explicit revalidation before export; items may be removed without inventing mappings. Reopened reads/export re-resolve current tenant sources/policy, refuse drift and revision races, and escape Markdown/HTML.

New Mongo output writes refuse protected production databases; the opt-ins for T-054/T-056 do not authorize this collection. Central composition must preserve truthful 503 until the new write gate is satisfied.

The broker executed the first focused API check: 20/21 fixtures passed, exit1; its only failure expected an unescaped timestamp in correctly escaped Markdown. The test assertion was repaired without changing output formatting, safety checks or runtime source. Original failure evidence is preserved below. Corrected API21 and untouched UI1 now passed with captured pins unchanged. No provider calls, real Mongo connections or browser flows ran. Focused commands use the existing safe-test-runtime, `--test-isolation=none --test-concurrency=1 --test-timeout=30000`, outer60s bounds; maker started no independent test process or parallel repository TypeScript check. The frozen-validator receipt is reused as described below.

Real Mongo integration requires explicit LKB_T058_MONGO_URI (secret not printed); the harness allocates and cleans a new random `test_t058_*` database and never reads .env/default DB. Independent live browser/provider/semantic and Umesh acceptance are separate outstanding gates. The real TOC sample claims are unreviewed; production generation must refuse them without source-state mutation. A synthetic verified in-memory copy can demonstrate consumer mechanics only and is labelled as such.

## Reused frozen-validator evidence

CPU broker `/root/docker_checker` authorized reusing `qa/evidence/goal-t051checker-validator.json` instead of another validator run. Receipt SHA256 `53EF35F5204AEA32DB0A4701DD60EBEEE10CBBF24AE5AF9287F16EB7EED0D6DB` records actual `python contracts/verify_contracts.py`, exit0, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`; combined batch 1.4327147s, individual duration unknown. Maker's read-only SHA check confirmed both current validator and frozen registry exactly match the receipt's pins. This does not substitute affected-stage/downstream evidence and is not an own candidate test run.

## Resume state

User suspension was honored: no test/process/provider/browser/DB handle existed when paused. Root resumed source work under the same exclusive leases. Historical CPU grants are revoked; fresh broker execution is required against final pins. Central schema and generated KnowledgeOutputs include sourceCoverage, assessmentDigest and occurredAt; installed Ajv/ajv-formats links, actual API composition/routes, web App route and sidebar navigation were observed. Reader applies the actual T054 correction projection then actual T007 current approval/revocation/source checks, safe WhatsApp projections and ordinary excluded-claim coverage. Runtime schema validation and 12 semantic damaged-row cases are implemented; the API test file contains21 entries plus the separate one-case node/jsdom harness. Actual T007 transitions in fake Mongo cover pending invalidation, changed sources and real claim revocation; these are fixtures, not real reviewer acceptance. The first failed timestamp assertion prevented later T007 source-drift/revocation branches from running; the rerun must exercise them before source readiness.

## First affected-stage receipt and assertion repair

Actual broker command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/api/src/knowledge-outputs/workbench.test.ts`, outer timeout60000ms, ran2026-10-14T21:06:50.716Z–21:06:52.763Z; elapsed2041.0119ms; exit1; pass20, fail1, skipped0; source/dependency hashes unchanged. Receipt `qa/evidence/goal-t051checker-broker-t058-api.json` and its stdout/stderr remain untouched. Output correctly contains `Occurred at 2026\-10\-14T10:00:00\.000Z`. Only the assertion now expects that escaped full timestamp, with structured occurrence equality retained. Current isolated rerun prepins SHA256 `8A657E75D542CD81C1EC5DECF073DC911BEFE316D1E09D64A89506143FD3B06C`. The corrected API rerun passed21/21; UI is not yet executed; manifest stays building, cycle0.

The first rerun preflight skipped before launch because its inherited broker spec included a changed unused shared route file. Isolated API checks mount requireAuth and createOutputRouter in their own Express fixture; the UI harness mounts AuthProvider/page in MemoryRouter. Neither imports the global composition/server/App/sidebar. Those observed global pins are separate in `qa/evidence/goal-t058/integration-observed-pins.json`, expressly not root ROUTE_FREEZE or actual integrated acceptance. The isolated map includes the exercised T056/T007/T054/evidence/tenant/auth/client helper sources and loader. Global mounted integration and full runtime proof remain pending; fixture results cannot certify unused global paths.

## Corrected affected-stage receipt

Broker actually reran the exact API command, outer60000ms, at2026-10-14T21:18:50.988Z–21:18:53.501Z; elapsed2500.7848ms, exit0, 21passed/0failed/0skipped, captured pins unchanged. Receipt `qa/evidence/goal-t051checker-broker-t058-api-corrected.json` SHA256 `7B986671288269279A0313ADF24E27F5C0E8557467F91C821044D27AD148BFD4` and adjacent stdout/stderr contain actual output. The original failed receipt SHA256 `F3C6A60EAB5ED0F57C48677DF98959F4F0DC6F20E06AFD928841134138FACF97` is retained. All T007 source-drift/revocation branches now executed successfully. These are synthetic provider/in-memory or fake-Mongo fixtures, including a local authenticated router; they do not establish actual provider/Mongo or global runtime acceptance. Broker requires no API repeat absent relevant source drift. Untouched UI1 against isolated pins remains pending; handshake stays building cycle0.

## Final isolated consumer receipt and checker handoff

Actual UI command: `node --test --test-isolation=none --test-concurrency=1 --test-timeout=30000 --import ./.cache/coordination/safe-test-runtime/register.mjs apps/web/src/pages/knowledge-outputs/workbench.ui.test.tsx`, outer60000ms, ran2026-10-14T21:20:59.410Z–21:21:02.222Z, elapsed2800.1347ms, exit0, 1passed/0failed/0skipped. Receipt `qa/evidence/goal-t051checker-broker-t058-ui.json` SHA256 `DD3E072058E78CCB198F2F89E49190AC951D22F70EF467DEB1FE9BFBE0BF1A55`, adjacent stdout/stderr. Isolated pins unchanged during the run; maker's final read-only pin comparison also found no drift. Only React Router future-version notices appeared on stderr; no assertion failure.

Frozen isolated source and receipt index: `qa/evidence/goal-t058/source-freeze.json`, cycle0, using pretest map SHA256 `8A657E75D542CD81C1EC5DECF073DC911BEFE316D1E09D64A89506143FD3B06C`. Independent checker probes/verdict remain required. `ready-for-check` requests source assessment; it does not claim checker PASS or close T-058. Global root ROUTE_FREEZE/integration, useful actual configured-provider outputs, isolated real Mongo recreation, actual reviewed sample, independent browser/citation clickthrough, T056 full-parent and genuine Umesh acceptance remain open. No duplicate API/UI/validator run is requested.

