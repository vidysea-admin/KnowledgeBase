# T-052 proven pre-submit retry design

Status: design only; source extension lease pending. No source edits, tests, network, browser, DB or provider work performed.

Repository: C:/Users/product/Desktop/KnowledgeBase
Observed HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a (2026-10-15T09:59:08Z).
Workflow loaded: skills/maker/SKILL.md. Tier 3, scoped continuation of T-052, qa/contracts/goal-t052.md C1/C3/C4/C7/C11. Independent verdict required; this is not T-052 acceptance.

## Exact extension paths (nine)

1. packages/meeting-bot/py/sb_join_register.py
2. packages/meeting-bot/py/test_sb_join_registration_redirect.py
3. packages/meeting-bot/src/joiners/browser-joiner.ts
4. packages/meeting-bot/src/joiners/joiners.test.ts
5. packages/meeting-bot/src/calendar/registration-workflow.ts
6. packages/meeting-bot/src/calendar/registration-workflow.test.ts
7. packages/meeting-bot/src/calendar/auto-record-policy.ts
8. packages/meeting-bot/src/calendar/state/schedule-state.ts
9. packages/meeting-bot/src/calendar/state/schedule-state.test.ts

Smallest safe delivery unit includes receipt producer/transport, durable local validation, retry consumer and all four associated test seams. The original two-file lease cannot supply independent durable proof; it must not implement retries from reason strings alone. No collection schema, generated type, shared module or Zoom helper changes proposed.

## Receipt and recovery

Python emits submissionDisposition="not-attempted" only on guarded returns before entering submit_with_redirects. Results after that entry never receive the marker, even action_required results. The TypeScript process parser accepts the optional marker only on one valid action_required result after clean close; dirty exit, duplicate/malformed/fatal output, timeout and cleanup failures remain uncertain without it.

Persist optional preSubmitEvidence={disposition:"not-attempted", configurationHash:<sha256>} on the local WebinarRegistrationAttempt, only for action_required. Hash a canonical explicit allowlist of validated execution configuration without public exposure or secret values in diagnostics. ConfigurationHash is an equality guard, never authority. Strict local state validator rejects invalid shape/hash/phase combinations; old state without evidence remains nonretryable.

Retry requires one prior action_required attempt with trusted receipt, changed validated configuration, and identical source id/message/thread/organizer/registration URL/start/end. Revalidate current source approval/authentication/classification/accepted occurrence and candidate-bound policy resolver, including deny/opt-out metadata. Before execution replace the marker atomically with a new submitting attempt id/time/baseline, dropping stale evidence. No blind repeat of submitting, uncertain, awaiting-confirmation or confirmed. Unchanged configuration remains action_required, preventing polling loops. The existing trusted lane lock/persist-before-execute contract remains required.

## Required broker checks and cases

Broker only: Python focused registration test; node --test --import tsx packages/meeting-bot/src/joiners/joiners.test.ts packages/meeting-bot/src/calendar/registration-workflow.test.ts packages/meeting-bot/src/calendar/state/schedule-state.test.ts; direct meeting-bot compiler and contracts/verify_contracts.py subject to broker selection and interpreter/import/writable-temp preflight. No tests have run for this design.

Cover producer pre-submit receipt and conservative post-entry omission; process clean/dirty/duplicate/fatal/malformed receipt handling; persisted round-trip and invalid receipt refusal; changed configuration recovery once; unchanged polling no repeat; missing/legacy evidence no repeat; source mutation/deny/rejection/unresolved veto; new submitting persistence failure prevents browser execution; interrupted restart remains uncertain; confirmation and immediate downstream projection unchanged. Specifically persisted action_required plus otherwise fresh valid authenticated confirmation on the next tick must not promote, capture or resubmit, including after restart; preserve confirmWebinarRegistration's existing action_required barrier. A changed proven-pre-submit configuration is a recovery prerequisite, whereas new mail alone grants no recovery. Windows/Ubuntu/live submission/real storage acceptance remains open.

## Risks and metrics

Security flags: external data writes and approved identity/scope, tenant-bound persisted attempt state. A browser status or public reason is insufficient proof of no submission. Arbitrary valid-looking receipt injection through trusted internal config/test callbacks is outside the process producer guarantee; no public request may populate it. Existing concurrent work must be preserved and exact before/after fingerprints recorded once a lease arrives. Unknown source changes invalidate cached evidence.

No actual elapsed maker implementation time yet (survey/design only); tokens and monetary cost unknown. Source-ready and checker dispatch are prohibited until extended lease, implementation and broker evidence exist. D-079 and inactive Zoom/provider helpers remain unchanged.
