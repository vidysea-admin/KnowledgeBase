# T-061 application automation and monitored operations

**Task:** T-061
**Priority tier:** 3 — user-authorized all-40 implementation under D-170; T-060 dependency still gates runtime acceptance.
**Status:** in_progress
**Handshake status:** in_progress
**Fix cycle:** 0
**Contract:** qa/contracts/goal-t061.md C1–C9; maker does not edit this contract.

## Delivered candidate behavior

The resumed parent scope includes the separate `ApplicationFormRuntime`, not merely document readiness. It persists approved target definitions and form operations, validates bounded fields with exact source document/page/span/revision provenance, binds operator approval to canonical payload/target fingerprints, and executes a trusted registered adapter with a stable operation ID and exclusive fenced lease. Field revision invalidates approval; audit retains prior binding hashes atomically with state. The configured HTTPS adapter uses trusted destination/credential configuration, a public pinned DNS address, TLS verification, bounded response, no redirects and explicit accepted-receipt protocol. No real target is configured or contacted by fixtures.

Uncertainty is recorded before the adapter call. Ambiguous responses, timeouts, expired owners and crash-before-result persistence remain explicitly uncertain. Only a runtime-configured and independently validated operation-ID adapter guarantee can permit the same operation to retry; unsafe adapters quarantine. An operator cannot invent success or treat uncertain effects as cancelled: reconciliation requires the registered target to verify the receipt against this exact operation/tenant. The implemented forms router and operator page cover intake, source review, approval, execution, monitor and intervention through current T-060 role/account locking and additional scopes. Production factory/router/frontend mounts exist; fresh integrated verification and actual Mongo/live proof remain pending.

Registered `application-readiness` checks a protected application reference against three fixed document types. It has a persisted per-tenant enabled definition, bounded timeout/attempt cap, idempotent intake, canonical payload digest, atomic Mongo version claim and owner-fenced heartbeat/completion. A callable API monitor detects expired leases, writes an atomic incident/history transition and retries only a retry-safe routine within its cap. Errors/timeouts park operator attention; exhausted retry-safe attempts fail terminally. A non-retry-safe handler crash after its action but before commit parks reconciliation. Operator retry/cancel/reconcile require current version and current T-060 server roles, dedicated API scopes and verified key ID.

The implemented readiness router and operator page cover configure, intake, status, explicit execution, stall scan and intervention; central production mounting exists and awaits fresh proof. Status excludes references, payloads, digests, owner tokens, actor key IDs and arbitrary exception strings. All operation selection/credentials/targets are trusted composition, never an intake override. This preparatory routine is read-only; no real student application is submitted.

## Exact owned candidate paths and consumers

- packages/core/src/domain/automation-monitor.ts and automation-monitor.test.ts — typed input validation, deterministic document outcome, lease monitor.
- apps/api/src/automation/types.ts, store.ts, runtime.ts, router.ts — persisted model/projections, injected tenant-safe Mongo adapter, claim/handler/monitor/operator runtime and real route consumer.
- apps/api/src/automation/fixture-store.ts, runtime.test.ts, router.test.ts — isolated adapter/runtime probes and real authenticated HTTP fixture.
- apps/api/src/automation/mongo-proof.ts — explicit scratch-only real client-reconstruction and cross-tenant proof, never automatically reads live credentials or runs on import.
- qa/packets/goal-t061-schema-fixtures.json — canonical shape fixtures for the integration-owned schema.
- apps/api/src/automation/README.md — exact requests, deployment/duplicate guarantees and runtime gates.
- apps/web/src/pages/automation/AutomationPage.tsx — signed-in current-generation operator consumer.
- apps/api/src/automation/form-types.ts, form-validation.ts, form-store.ts, form-runtime.ts, form-adapter.ts, form-router.ts — approved application records/provenance, tenant Mongo adapter, real registered executor and actual route/receipt protocol.
- apps/api/src/automation/factory.test.ts — actual composition/tenant-accessor/canonical-source/current HostingService fixture, constructor no writes and approval-generation invalidation; no external submission.
- apps/api/src/automation/form-fixture.ts, form-runtime.test.ts, form-router.test.ts — meaningful registered-target/dedup/provenance/approval/concurrency/uncertainty and authenticated HTTP fixtures.
- apps/web/src/pages/automation/ApplicationFormsPage.tsx — actual form/evidence approval/operator consumer.
- apps/web/src/pages/automation/ApplicationFormsPage.test.tsx — source review/version binding, explicit uncertain-side-effect UI and auth-generation private-field/in-flight-result refusal.
- apps/api/src/automation/form-mongo-proof.ts — explicit scratch-only real Mongo source/receipt/state persistence, crash-after-fixture-effect dedup and fresh client/runtime reconstruction; never runs on import.
- apps/api/src/composition/integrations/automation.ts — real tenant Mongo stores, current HostingService role/account locking and trusted approved-target/source registry; constructor performs no writes/network.
- qa/packets/goal-t061-form-schema-fixtures.json — integration-owned `application_operations` canonical shape request with valid/invalid fixtures.

Shared integration owner supplies generated schema/model, migration/accessor, current T-060 permissions/account eligibility, production invocation of the owned composition factory, server router and frontend navigation. Mandatory application-audit binding generation and generated-model aliases now exist; canonical document-ID schema constraint alignment and fresh consumer evidence are pending. These must land and be pinned before submission; no test-only wiring is presented as mounted production.

## Security and storage facts

Auth/tenancy/writes/credentials flags: yes/yes/yes/no new credential values. Actor is only `req.auth.keyId`. Role decisions run under `HostingService.withPermission` through the mutation. Tenant-scoped collection access is supplied only by packages/db. State and sanitized audit/history change in one acknowledged compare-and-swap replacement; failed writes are not acknowledged. Handler timeout aborts and relinquishes the owner; stale tokens/versions cannot commit or heartbeat. Side-effecting future handlers require their own durable operation-ID dedup guarantee or non-retry-safe reconciliation.

## Evidence (pending central CPU lease)

Actual centrally executed backend receipt: qa/evidence/goal-t051checker-broker-t061-backend.json (SHA256 5e20e1710fc69dede131c87a2ba2fc8099f15d42886137f6756d185662998472), 2026-10-14T21:20:45.864Z–21:20:50.117Z, EXIT0, 20/20 cases PASS, elapsed 4.221s; all 224 source/dependency pins unchanged. stdout/stderr path references and exact arguments are in the receipt. Source inventory qa/packets/goal-t061-pins.json SHA256 458b0ea9c90ee10a817a81122f4f458c1ca066a6556150aea18cdfdf34e1d135. These are isolated source/HTTP/Hosting-journal fixtures, no real database or external target evidence. UI3 actual broker receipt qa/evidence/goal-t051checker-broker-t061-ui.json SHA256 d3be304761897cb430c4f7b30828f6ce1de44150d2095b7b4fb101d8b828e080; execution 2026-10-14T21:28:13Z–21:28:17Z, EXIT0, 3/3 PASS, elapsed3.460s, 10pins unchanged. No duplicate maker runs.

Commands included in that combined six-file run:

```text
node --import tsx --test --test-timeout=20000 packages/core/src/domain/automation-monitor.test.ts apps/api/src/automation/runtime.test.ts apps/api/src/automation/router.test.ts
```

Fresh resumed form-executor fixture command, queued with sole broker:

```text
node --import tsx --test --test-timeout=20000 apps/api/src/automation/form-runtime.test.ts apps/api/src/automation/form-router.test.ts
```

The broker has the combined six-file, 20-case backend command with `--test-concurrency=1` for low CPU. The three UI fixtures passed under the separate broker slot:

```text
pnpm --filter @lkb/web exec vitest run --maxWorkers=1 --minWorkers=1 src/pages/automation/ApplicationFormsPage.test.tsx
```

Nine resumed executor fixtures add concrete configured target transport/receipt behavior, required/provenance fields, approval/config binding, revision invalidation, side-effect dedup after ambiguous commit, unsafe crash quarantine, receipt verification, stale owner/heartbeat fencing, adapter destination/redirect/receipt refusal, bounded timeout/attempt cap, corrupt approval/write failure and actual mounted authenticated source-review consumer. No actual external target receives a request: configured transport and source authority are injected isolated fixtures. These fixtures are not live or Mongo persistence proof.

Fixture covers two tenants, definition CAS, replay/conflict, claimed concurrency, stale owner, monitor dedup, timeout, bounded retries, write failure, unsafe crash-before-commit handoff, corruption/redaction and mounted API consumption. The map-backed collection fixture reconstructs runtime/store but does not establish real Mongo persistence. Required immediate downstream and frozen-contract evidence remains pending. Final hashes/base blobs and exact measured counts/durations will be pinned after integration and CPU verification.

## Whole-task gates

Actual approved scratch Mongo persistence/reconstruction, integrated T-060 authorization, browser UI proof, configured wider external application target, external duplicate guarantee and any unattended/live monitoring remain unverified. No external message, student-form submission, host schedule, deployment or production write is authorized or performed by this unit. Full T-061 completion cannot be inferred from local fixture checks.


Frozen contract validator evidence is reusable: qa/evidence/goal-t051checker-validator.json executed python contracts/verify_contracts.py EXIT0, PASS by vacuity (no frozen contracts yet), with validator/registry bytes independently rechecked unchanged. This does not establish runtime behavior. Backend receipt readback after UI names only unrelated dependency drift hosting/composition.test.ts and generated/decisions.ts; neither executed behavior nor T061 owned source changed. Final ready pins will record current dependencies rather than silently relabel tested bytes.


Pre-verdict repair resubmission (cycle0): central compiler observed generated tuple-union .includes diagnostics in store.ts and core automation-monitor.ts; these now use typed .some equality. Schema documentId whitespace constraints are enforced before intake writes and standing form validation assertions include internal whitespace/control rejection. No duplicated handwritten document enum, any cast or compiler suppression was added. Actual initial20 receipt remains attributed initial bytes; it does not certify these changed paths. Fresh complete standing20 plus shared createServer consumer1 command is frozen in qa/packets/goal-t061-repair1-pins.json SHA256 f23b4203bbf5834e4911000465e477a6d0ac93f0e400b7ecc4a13a54254b0d46 (235pins), requested from sole broker. The earlier pending mounted-only packet is withdrawn. The minimal owned readiness landing link exposes the existing /automation/forms route without entrypoint changes. Forms UI3 receipt remains applicable unchanged; no duplicate tests, provider calls, real database writes, migration or external submission occurred.


After the authorized roadmap HOLD/RESUME, the independent checker found the frontend Source document input still limited canonical IDs to80 characters. The owned input now uses the schema's2048-character bound and a fourth UI regression checks a >80-character canonical tenant-prefixed ID reaches actual intake unchanged. Historical UI3 is attributed its old bytes and does not certify this changed consumer. Current UI4 request qa/packets/goal-t061-ui4-pins.json SHA256 435528fa5d3aab199b337f31a7cba4ef9288a755a18c060ca67842f53ddea2b4. The pending backend repair1 request is superseded by qa/packets/goal-t061-repair2-pins.json SHA256 9af4a77c8ff5e0769282806b60cdd77bbaba95d26213b5f95892fdd3b9474cd8, current235pins and unchanged exact7-file21-case command (standing20 plus actual mounted createServer1). Source is frozen again; sole broker owns execution. No fresh result, checker PASS, production durability or target activation is inferred.

2026-10-15 scoped evidence update: sole-broker receipt `qa/goal-vectorless-2026-10-15/verification-t061-ui-four-20261015T1155.json` records the current four-case ApplicationFormsPage fixture run, including the long canonical source ID, EXIT0 in 4227.802ms (2026-10-15T10:08:57.069Z–10:09:01.299Z), with all 21 receipt pins unchanged. Scoped candidate identity `13486810dbcb11ce4a142a5b41ecfe20e4cdd581b9c89d64d04fe00e7f93711a` is an ordered file-pin SHA256, not a Git commit. Exact runtime/command/environment and adjacent stdout/stderr paths are retained in that receipt. This is mocked-API Vitest/jsdom fixture evidence only. Backend21 remains HOLD before execution pending a coherent shared source-jobs/server freeze. Status and handshake remain in_progress, Fix cycle 0; no READY, independent checker PASS, Mongo durability or live acceptance is inferred.

2026-10-15 subsequent backend evidence: `qa/goal-vectorless-2026-10-15/verification-release-backend-and-pages-twenty-six.json` (SHA256 `ae0e87b7356f7ebf4aca7e86e55335b51d724a2106f8b4e2b152061974344d18`) records the exact seven-file T-061 backend command plus `apps/api/src/routes/pages.test.ts`, EXIT0 in 8973.814ms (2026-10-15T11:53:29.173Z–11:53:38.149Z), all receipt pins unchanged. Actual stdout reports **29/29 PASS**: T-061 contributes **21** (factory 1, form-router 1, form-runtime 8, mounted 1, router 1, runtime 7, core automation-monitor 2); shared pages contributes **8**. The legacy receipt filename/scope expectation of 26 is retained as historical naming, not the measured count. Ordered scoped-pin candidate SHA256 `f5122e01b9d6a3c6842ecf9c704e592830d064f0c809a1b5371f59b29d3d7d45` is not a Git commit. Exact command, source/dependency/runtime/environment fingerprints and adjacent stdout/stderr paths are in the receipt. This resolves the preceding before-execution backend HOLD for that measured fixture scope only. Earlier holds and old-byte evidence remain attributed history; no live automation effects or real Mongo proof are established.

Packet readiness remains in_progress/cycle0: `qa/packets/goal-t061.md` still carries historical initial20/current repair2 requests rather than the new union receipt/current packet reconciliation. Before READY, assemble the exact final tracked/untracked change map, base/current source and relevant consumer fingerprints, current receipt/environment mapping, measured maker usage (unknown remains unknown), and explicit scoped acceptance/exclusions into the independent-checker packet; reconcile any subsequent shared-source drift with the receipts. No new checker was dispatched and no independent PASS exists for this metadata update. Whole-task gates above remain unchanged.
