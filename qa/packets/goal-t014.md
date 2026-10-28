# goal-t014 checker packet — cycle 0 READY source candidate

Read qa/manifests/goal-t014.md and checker contract qa/contracts/goal-t014.md. ROOTGO authorized the exclusive new source directories, dedicated docs and this QA packet. Base: no prior file existed at each new path.

## Source and consumer map

- apps/api/src/championship/model.ts — API plan/event DTOs derive central generated `ChampionshipEvents` from `schema/championship_events.schema.json`; allowlisted validation, canonical exact-question SHA256 and event metadata integrity. Caller: runtime and router. Proposed review/roster references explicitly unverified. Central `packages/core/src/generated/championship_events.ts` and core export are read-only dependencies for this maker.
- apps/api/src/championship/runtime.ts — freeze, exact eval pair/tenant/tier/answer/score/time validation, duplicate refusal, immutable snapshot and revalidated full-denominator report. Caller: championship router; original T-012 eval rows remain unchanged.
- apps/api/src/championship/mongo-store.ts — injected durable Db adapter, tenant/id/revision CAS, validated copied reload, immutable fixed plan/old trial snapshots, missing migration refusal and duplicate cross-event evaluation conflict. Central migration must install schema validator and exact `championship_eval_once` unique `{tenantId:1,'trials.evalRunId':1}` partial `{'trials.0':{$exists:true}}` index; adapter never creates schema/indexes.
- apps/api/src/routes/championship/championship.ts — authenticated compete-scope API, no client tenant, id/tenant revalidation, store-backed revision CAS, deliberate conflict/not-found outcomes. Immediate consumer: web client; central production composition must supply durable adapter and mount after existing requireAuth.
- apps/web/src/pages/championship/client.ts — saved-event reload, checked DTO boundary and exact existing Compete start/score plus championship freeze/import routes.
- apps/web/src/pages/championship/ChampionshipPage.tsx and ChampionshipPlanForm.tsx — ordinary source-question/proposed-roster/reference fields, event reload/freeze, matched question/counsellor, original human answer/internal score, preserved run ID on failed import, report/gates. Shared App/nav mounting remains central.
- docs/championship-workflow.md — exact request shapes, digest meaning, CAS/retry/runtime adapter and real acceptance boundaries.

Security flags: auth/tenant reads and writes YES (existing auth middleware/scope only; authenticated tenant passed to all store operations); credential handling NO new credential storage (existing apiFetch); cross-tenant refusal required; report remains authenticated/internal, no public export endpoint. Shared integration must supply schema-backed persistence; no schema bypass or memory production store.

## Central consumer map observed in source (not executed/live proof)

- apps/api/src/composition/integrations/evaluation.ts: buildEvaluationIntegrations creates the real store only with LKB_CHAMPIONSHIP=1 and the protected-database guard. global_university_db is refused; lkb additionally requires exact MONGODB_DB=lkb and LKB_I_KNOW_THIS_IS_PRODUCTION=1. Construction is side-effect-free; these configuration flags are not human-event approval.
- apps/api/src/server.ts: shared requireAuth precedes mountIntegratedWorkflows. apps/api/src/composition/integrations/routes.ts mounts createChampionshipRouter for configured store; otherwise compete-scoped workflow_unavailable503, with no memory fallback.
- apps/web/src/App.tsx mounts ChampionshipPage at /championship; apps/web/src/layout/NavSidebar.tsx exposes its entry.
- schema/championship_events.schema.json + packages/core/src/generated/championship_events.ts + packages/core/src/index.ts provide the canonical collection/type export. schema/index.json declares exact championship_eval_once unique compound partial index. migrations/20261014200000-knowledge-workflows.cjs installs canonical validator/index declarations and refuses destructive rollback; maker has not executed it or touched real Mongo.

Final dependency pins and fresh central compiler/validator receipt references are required at READY. These paths remain central-writer owned, not maker edits.

## Focused proposed commands (await ROOT CPU mutex)

- From apps/api: node --import tsx --test src/championship/runtime.test.ts src/championship/mongo-store.test.ts src/routes/championship/championship.test.ts — fake-store domain + Mongo adapter seam + HTTP boundaries and downstream reloaded report. Express loopback listener is used, no live DB/provider. Fake DB does not prove real Mongo validator/index/restart behavior.
- From apps/web: node node_modules/vitest/vitest.mjs run src/pages/championship/client.test.ts src/pages/championship/ChampionshipPage.test.tsx --maxWorkers=1 --minWorkers=1 — actual DOM/client consumer and tenant/event stale response.
- Required contracts/verify_contracts.py and scoped TypeScript checks coordinated with root CPU mutex. No full suites, browsers or mutations.

Current focused API proof was executed by the sole CPU broker, not duplicated by maker:

- Receipt: qa/evidence/goal-t051checker-broker-t014-api.json; raw logs: qa/evidence/goal-t051checker-broker-t014-api.stdout.txt and .stderr.txt.
- Program: C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe; cwd: C:\Users\product\Desktop\KnowledgeBase.
- Exact args: --test --test-concurrency=1 --test-timeout=30000 --import tsx apps/api/src/championship/runtime.test.ts apps/api/src/championship/mongo-store.test.ts apps/api/src/routes/championship/championship.test.ts.
- Wrapper timeout120000ms; exitCode0; elapsed1686.0915ms; stdout tests9/pass9/fail0/skipped0; stderr empty; receipt hashesUnchanged=true over13 candidate paths. Fake-adapter and loopback source proof only.
- Web receipt: qa/evidence/goal-t051checker-broker-t014-web.json; raw logs: matching .stdout.txt/.stderr.txt. Same canonical Node; cwd C:\Users\product\Desktop\KnowledgeBase/apps/web. Exact args: node_modules/vitest/vitest.mjs run src/pages/championship/client.test.ts src/pages/championship/ChampionshipPage.test.tsx --maxWorkers=1 --minWorkers=1. timeout120000ms; exitCode0; elapsed5569.7314ms; stdout two files/seven tests passed (Page5/client2); stderr empty; same13 before/after source hashes unchanged.
- Both stages are broker-executed source/fake-adapter/loopback/DOM proof. Do not duplicate API/web/coherent compiler/validator runs.

Cycle0 final source/dependency/evidence SHA256 pins: qa/evidence/goal-t014/ready-cycle0-pins.json. Thirteen newly created source/test/doc paths match both executed broker receipts and current source-pretest pins; sixteen read-only contract/schema/caller/consumer/validator dependencies and nine receipt/log artifacts are pinned. Shared paths remain central-owned; maker edits only its leased source and QA files.

Original source pins: qa/evidence/goal-t014/source-pretest.json. Both API/web before/after maps match these current source pins. The bounded runner qa/evidence/goal-t014/run-focused.ps1 was prepared but not executed by maker; consume the broker's actual command/receipts above.

## Reusable validator and unresolved software coherence

qa/evidence/goal-t051checker-validator.json records `python contracts/verify_contracts.py`, actual exit0, output `verify_contracts: no frozen contracts yet (research phase) -- PASS by vacuity`. Individual duration is unknown; combined checker batch was1.4327147s. Its validatorSHA2561240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3 and registrySHA256d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940 match current validator/registry bytes; no duplicate execution.

Central compiler receipts at candidate freeze are preserved byte-for-byte as qa/evidence/goal-t014/ready-cycle0-api-types-snapshot.json (exit2,39 diagnostics) and ready-cycle0-web-types-snapshot.json (exit2,5 diagnostics), copied from qa/goal-2026-10-14 API/web receipts. There are no championship diagnostics in this output. Root repairs these global software failures; the mutable central receipts may advance, while these snapshots retain the actual candidate facts. This READY is a scoped source candidate with actual focused proof, not a global compiler/application PASS. Any required S1–S10 boundary affected by that red coherence must receive HOLD; do not conceal a software gap among human/public gates.

Checker-derived preparation probes executed in the focused suite include corrupted reloaded answers/timestamps/eval IDs (runtime.test.ts reloaded-corruption case) and old-auth/event selection stale completion (ChampionshipPage.test.tsx), based on independent checker's earlier source feedback. Checker may inspect additional probes; any new execution requires fresh sole broker CPU grant. Checker alone writes qa/verdicts/goal-t014.md with Cycle checked0 and actual scope/limitations.

## Independent checks and unresolved full-task gates

Contract S1–S10 governs scoped runtime acceptance. Domain corpus includes empty/duplicate/malformed source banks, malformed Unicode, forged approval/tenant/credibility, exact question/name/tier/time/score matching, repeated run/pair and corrupt reload snapshots. HTTP corpus includes invalid auth/scope, tenant mismatch, wrong returned run ID, revision conflict, persisted answer/citation snapshot and read consumer. Web client/DOM corpus checks actual existing Compete route use, save-before-import, event switch invalidation and old-tenant late completion. Checker owns additional probes and verdict.

No fixture question, proposed name, score or fake store is a real counsellor participation/evaluation claim. Full Q3/human-bank/T-013/independent-panel/streak/public-event gates remain as specified in the contract and manifest. No whole-task T-014 completion claim.
