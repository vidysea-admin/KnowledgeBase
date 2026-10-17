# Checker packet — t039-manual-jobs-operation-authority, cycle 1

Root: C:/Users/product/Desktop/KnowledgeBase. Maker: /root/manual_jobs_maker. Source frozen. Status in_progress pending broker, not READY. Checker writes only matching qa/verdicts/t039-manual-jobs-operation-authority.md and necessary checker-owned issue/contract records.

## Authority and acceptance

Read local AGENTS.md and checker skill C:/Users/product/.agents/skills/checker/SKILL.md. Governing clauses: qa/contracts/goal-t039.md 3–5 (authenticated owner, safe input, authoritative active ownership) and qa/contracts/t039-send-now-command.md 1–6 (strict unreadable refusal, module-root state, terminal states, safe messages, actual downstream command). Scope is the authority reader correction only. Whole-task live admission/media/Windows/Ubuntu gates remain open.

## Exact candidate and original bytes

Four changed source/test paths and full final SHA256: qa/evidence/t039-manual-jobs-operation-authority/candidate.json. Original SHA256: baseline.json in same directory; each original byte copy is named path-with-__ plus .before. Diff candidate against those bytes, preserving earlier user/maker edits. Root checkout commit may change during shared integration; these exact before/current pins identify this unit. No shared schema/exports/composition edits.

## Changed behavior and consumers

- scripts/webinar/send-now-host.ts createSendNowDeps default operationsFile now raw/webinars/operations.json, matching createSchedulerRuntime stateDir and runPipelineTick statePath. Existing root, strict reader, tenant, until validation, planner and launch guards unchanged.
- packages/meeting-bot/src/send-now-command.ts defaultSendNowDeps same canonical change. readLiveJobs retains scheduled files and their strict tenant checks, then includes nonterminal operation ids not already mapped by scheduled files. Resolve each id from validated state.source.reconciliation.occurrences aliases: matching alias.key stores historical normalized URL followed by |ISO-start. Strip only final timestamp; pass status unchanged. Unmapped active operations throw, never become no jobs. Terminal processing/ready/failed/action_required stay excluded. Existing reader validates canonical state and alias hashes/identities before use.
- send-now-command.test.ts new canonical queued/recording test uses real reconcileWebinarSources, writes temp canonical state, calls actual readWebinarOperationState, and immediately consumes jobs through runSendNow. Equivalent link blocked, different meeting allowed, terminal released, orphan active refused. No browser/real launch.
- send-now-host.test.ts new default-authority test verifies expired scheduled metadata cannot erase canonical recording state; canonical corrupt, wrong-tenant and orphan queued rows refuse.

Relevant unchanged dependency excerpts: calendar/state/schedule-state.ts readWebinarOperationState validates state tenant/operation rows and reconciliation source; calendar/calendar-client.ts validateReconciliationState validates alias identity + webinarSessionKey; send-now.ts planner treats only four explicit terminal states as released. scripts/webinar/manual-jobs/host.ts createManagedSendNowDeps invokes base.plan before durable ownership selection and launch replan. These are read dependencies, not write leases. Default CLI caller remains cli.ts send-now dispatch.

Security flags: tenant-scoped reads, duplicate/capture ownership and secret-bearing stored URLs. No new public response fields or credential reads. Unresolvable legacy active rows intentionally refuse all manual launches until owner inspection; known distinct meetings remain allowed when aliases resolve. Live-recording claim remains the concurrent recorder guard; this patch does not claim distributed atomic queue admission.

## Broker commands and check limits

Affected-stage + immediate CLI/API consumer:
node --test --import tsx packages/meeting-bot/src/send-now-command.test.ts scripts/webinar/send-now-host.test.ts
Managed downstream consumer:
node --test --import tsx scripts/webinar/manual-jobs/host.test.ts
Required frozen validator:
python contracts/verify_contracts.py

Use root's single CPU broker and actual declared Node runtime; do not run competing local suites. Existing host tests spawn only their argv-dump-fixture.mjs, never CLI recorder/browser/provider. New cases need temp file I/O only. Other unrelated worker/IPC/native-host proofs remain separate. Capture each command's raw output, exit/duration, runtime/environment identity and before/after candidate hashes. Tests currently unexecuted; do not inherit earlier PASS.

## Filed-issue reproduction floor

ISS-T039CMD-002 is historically verified, not reopened/closed by this unit. Its recorded reproduction: while poller recording operation exists with no scheduled file, send-now same URL must refuse. New authority regression addresses the missing canonical preclaim view; independent checker should also probe canonical recording/no scheduled/no alias => unreadable rather than accept. No real poller/meeting is authorized. Existing live-recording suites cover postclaim path separately; their immutable old receipts do not prove new bytes.

No filed issue is claimed fixed or measured as fully replayed. No mutant or live event was run. Full T039 contract 1–2 and 8–9 remain mandatory for parent completion.

## Accounting and dispatch readiness

Maker host tokens/cost/earlier active time unknown null; no fabricated retrospective duration. Broker evidence pending. Fresh-context checker receives exact packet only after broker evidence and READY status. Record explicit allocation/debits and prospective monotonic launch/end/wait accounting per checker skill; no duplicate reviewers without a concrete reason.
