# Independent verdict — goal-t060

VERDICT: HOLD
Cycle checked: 0
ISSUES-WRITTEN: none

## Scope and remaining gates

The submitted local hosting runtime satisfies the exercised C1–C6 boundaries: real centrally mounted verified identity/tenant roles, durable audited role/key/webhook changes, persisted event jobs, pinned HTTPS/signing transport, delivery status/audit and restart/replay. The current required API/web coherence gate has no fresh green receipt; its recorded checks are red. Consequently this is **not PASS**, does not authorize maker close-out, and does not complete T-060.

C7 remains scoped to the adopted tenant-private retention **reader** and attributed dry-run writer fixture. Production tenant onboarding/deployment, real external delivery, all existing application mutation audit, live hosting/retention evidence and approval-gated media deletion remain separate whole-task gates. No production target, provider, external message or real purge was used here. Generic APIs preserve separately approved key scopes; lifecycle/recovery fences apply globally, while hosted routes require current roles. Profile activation does not resurrect a revoked key or restore a hosted role.

## Checked bytes and provenance

- Manifest `qa/manifests/goal-t060.md`: `9ec2664fec513e2b82abebb64cc2e72b7ce2ffedfaa3af3cacfc1c7efdd4db6b`; ready-for-check, cycle 0.
- Canonical explicitly resubmitted packet: `93129f72f358f4568787e628b683fccf0a6a4273efa3407d73e2a00f1516bb07`.
- Submitted 66-path map `qa/evidence/goal-t060-ready-pins.json`: `0952c50af15aca9b0f4824eb3a31e0719b1332b8e834e2cd0807d3727d12d0cd`; independently read back 66/66 current matches.
- Checker-owned shared probe `qa/evidence/goal-t028-central-check.test.ts`: `43bc9ae5ebca638504f8776060179b9a1fc25094367df5914c6524f122153084`.
- Shared broker spec `qa/evidence/goal-t028-t060-mounted-checker-spec.json`: `d6798526db23bf5c85d47766c23dba11eab1c3107bbe8f3eb9023a1cb40f754f`.
- Independent receipt `qa/evidence/goal-t051checker-broker-t028-t060-mounted-independent4.json`: `b286fe8d19e8a523f00159db2bf9518c5c321397a4bf4fe3d72c7b29a92a3866`; all 75 union paths plus spec unchanged before/after and independently matching current bytes at 22:33:58 UTC.

The 66-path map and 76-path receipt retain the full exact file hash tables, including hosting, actual factory, server, routes, production, auth/key store, account provider and fixture consumers. Review covered all new hosting logic/tests, actual central mounts and relevant auth/key/account/retention boundaries. Historical snapshots superseded before verdict were not silently certified as current.

## Independent behavior and reused evidence

I authored the shared pending-commit and webhook cases; checker T-028 authored the account lifecycle cases. The sole CPU broker executed **one** shared process. Its four passing cases independently demonstrate:

1. Actual `buildHostingIntegrations` plus `createServer` and real hosting/account journals: directory eligibility, tenant/actor/header spoof resistance, foreign IDs, role grants, lower-role refusals, deactivate/activate/regrant/delete/revoked-key behavior and fresh construction.
2. Actual wrapped `/keys` refuses lower role, scope elevation and bootstrap revocation with JSON 403. Persisted incomplete account or key intent survives reconstruction, yields redacted JSON 503 at unrelated `/search`, and does not invoke its consumer. Tenant B remains usable.
3. Actual mounted registration → event → real worker/transport → HMAC over exact transmitted bytes → status/audit → fresh factory replay. Numeric socket address remains pinned, TLS/Host retain the approved origin, ordinary replay does not send again, mixed-private DNS and expanded Unicode URL are refused, and public responses omit signing material/ciphertext/payload.
4. Corrupt account metadata and invalid configured authority fail closed at generic and hosted consumers.

Outbound DNS and HTTPS construction were deterministic adapters; role/service/journal/worker/signing/factory/server logic remained the actual product implementations. These are local integration proofs, not real internet delivery. The same receipt is shared with T-028; no duplicate execution occurred.

Attributed maker evidence independently inspected: original 24/24 includes 22 unchanged non-factory cases, plus the supplemental 3/3 covers all **current** factory cases after the authorized retention binding/import changes. This accounts for 25 authored cases; there was no single 25-case run. It covers fsync/corruption/abandoned-lock refusal, account/key partial completion, private DNS, bounded transport, exact signatures, retries/ACK uncertainty and persisted-only revocation during paused DNS. Issue-reproduction corpus: N/A, new feature with no filed issue claimed fixed. No mutation run.

## Commands and actual results

All Node commands used `C:\Users\product\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`, cwd `C:\Users\product\Desktop\KnowledgeBase`.

- Independent: `node --test --test-concurrency=1 --test-timeout=30000 --import tsx qa/evidence/goal-t028-central-check.test.ts`; outer 90000 ms. 22:33:10.744–22:33:17.477 UTC; elapsed **6708.752 ms**, exit 0, 4/4 pass, no failures/cancelled/skipped/todo, signal/error null. Raw stdout/stderr alongside the independent receipt; stderr empty. Node duration 6528.7908 ms.
- Maker: `node --import tsx --test --test-timeout=30000 --test-concurrency=1 apps/api/src/hosting/journal.test.ts apps/api/src/hosting/service.test.ts apps/api/src/hosting/transport.test.ts apps/api/src/hosting/worker.test.ts apps/api/src/hosting/router.test.ts apps/api/src/hosting/composition.test.ts`; outer 45000 ms. 21:12:16.535–21:12:25.473 UTC; elapsed 8922.4856 ms, exit 0, historical 24/24. Receipt/output: `qa/evidence/goal-t051checker-broker-t060-maker.*`; 45 before/after pins unchanged at that snapshot; current factory/test exclusions are explicit.
- Supplemental: `node --import tsx --test --test-timeout=30000 --test-concurrency=1 apps/api/src/hosting/composition.test.ts`; outer 45000 ms. 21:43:00.486–21:43:02.691 UTC; elapsed 2191.8519 ms, exit 0, current 3/3, 52 before/after pins unchanged. Receipt/output: `qa/evidence/goal-t051checker-broker-t060-retention-factory.*`; receipt SHA `a9c0a75a504a39ec6c6b93d0ce8424d9b29d567602062adca65923cbd31a9441`.
- Reused frozen check: `python contracts/verify_contracts.py`, exit 0, no frozen contracts; **PASS by vacuity only**. Receipt `qa/evidence/goal-t051checker-validator.json`; validator `1240059fc2abc63cde58472ef8f7964978e74ba5bc2f5156a30379ddae391db3` and registry `d31dad4c1fce135238169f48c18bc5ef68ea0deff7978d9323441330778cc940` still match. Individual duration unknown; combined historical batch 1.4327147 s.
- Required coherence: bundled Node + bundled `pnpm.mjs --filter @lkb/api typecheck`: exit 2, 18553 ms, 39 TS diagnostics, 21:35:02.301–21:35:20.854 UTC. `qa/goal-2026-10-14/api-types-current-freeze.json` SHA `28cde10c6a2fdbab4b84fcbb168bbd8150ef98cac81995373ab9cfef8255eda3`.
- Required coherence: bundled Node + bundled `pnpm.mjs --filter @lkb/web typecheck`: exit 2, 13182 ms, 5 TS diagnostics, 21:36:13.101–21:36:26.283 UTC. `qa/goal-2026-10-14/web-types-current-freeze.json` SHA `2fd4b5fab37429c3a3f89b4f71f4cecf5c7992d84a77a048fab38520918553fe`. Both JSON receipts preserve exact program/args and inline stdout/stderr. No owned hosting/factory diagnostic is claimed; unrelated diagnostics still do not make this required gate green.

## Timing and explanation

Initial agent launch and aggregate preparation duration are unmeasured. First recorded preparation clock was 18:21:17 UTC; intervening source work, human holds/resumes, packet resubmissions, source freezes and serial CPU waits span hours. This is not represented as a two-minute end-to-end check.

Measured final receipt/check leg began 22:32:03 UTC with spec review/hash confirmation. Broker command started/finished at the exact times above. Independent receipt/output/final-pin review was recorded 22:33:58 UTC; red gate receipt review completed 22:34:29 UTC. Draft/persist start follows that checkpoint; final confirmed persistence is recorded below. Broker dispatch/grant transition timestamps beyond these observations are unknown; no unmeasured interval is attributed by subtraction. Light source review occurred during earlier preparation; no second test process or broad suite was launched by this checker.

EXPLANATION: Scoped behavioral evidence is green and no acceptance defect was demonstrated. HOLD is solely the still-missing required coherent API/web green gate, plus the explicitly separate full-task/live gates. Retain these actual receipts and current hashes; do not rerun the historical 24/3/4 solely to obtain another count. A materially changed candidate requires explicit current-cycle resubmission and relevant verification before any future PASS.

Persistence confirmation: the initial verdict write completed and the clock was read at **22:35:32 UTC**. Measured final-leg interval 22:32:03–22:35:32 is **209 seconds**; the required gate/output/provenance checks explain exceeding the focused target. Exact draft-start/write-call-start timestamps are unknown. This annotation is a subsequent metadata-only append; initial agent-to-verdict elapsed remains unknown.
