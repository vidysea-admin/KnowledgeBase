# Maker packet — source-delivery-registration-retry

Root: C:/Users/product/Desktop/KnowledgeBase
Base observed: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a; dirty working candidate bound by per-file hashes, not HEAD alone.
Unit: T-052 scoped proven pre-submit recovery; Fix cycle: 1; Tier: 3.
Status: building; broker evidence pending. Maker workflow: skills/maker/SKILL.md.

## Contract and behavior
qa/contracts/goal-t052.md C1,C3,C4,C7,C11; existing original-source confirmation policy preserved. A trusted clean browser result may carry submissionDisposition=not-attempted only before submit_with_redirects entry. Local attempt persists preSubmitEvidence={disposition:not-attempted,configurationHash:sha256}. Local strict validator permits it only in action_required. A changed validated configuration plus current source/policy authorization permits one fresh durable submitting attempt; source identity must match exactly and duplicate operation references refuse. Missing receipt, unchanged config and uncertain/submitting/awaiting/confirmed never repeat. New mail alone cannot recover action_required.

## Exact files and change map
- packages/meeting-bot/py/sb_join_register.py
- packages/meeting-bot/py/test_sb_join_registration_redirect.py
- packages/meeting-bot/src/joiners/browser-joiner.ts
- packages/meeting-bot/src/joiners/joiners.test.ts
- packages/meeting-bot/src/calendar/registration-workflow.ts
- packages/meeting-bot/src/calendar/registration-workflow.test.ts
- packages/meeting-bot/src/calendar/auto-record-policy.ts
- packages/meeting-bot/src/calendar/state/schedule-state.ts
- packages/meeting-bot/src/calendar/state/schedule-state.test.ts

Python producer tags pre-submit guarded exits and conservatively omits post-entry evidence. Browser child parser validates optional receipt only for action_required after clean unique result. Workflow fingerprints explicit execution config allowlist, requires changed fingerprint and exact source/message/thread/organizer/URL/interval, then reruns candidate-bound authorization/config validation before persisting replacement. auto-record-policy adds local attempt field; schedule-state validates shape/phase/hash. Four existing test seams add proof-chain, no-repeat, current-veto, persistence-failure and mail/restart barriers.

## Evidence fingerprints
Raw before/candidate pins and actual observed wall interval: qa/coordination/knowledge-brain-20261015/source-delivery/t052-retry-pins.json. Base bytes supplied by captured before hashes; existing unrelated working changes preserved. All nine paths existed before this unit; packet/manifest/design/pins newly created. Tokens/cost/active elapsed unknown; do not report measured checker ratios. No tests executed locally. No fixture is live acceptance.

## Broker requests
Sole broker, each <=30 seconds; preflight interpreter/import containment and writable basetemp.
1. node --test --import tsx --test-name-pattern="proven pre-submit|pre-submit recovery|persisted action_required|registration child lifecycle" packages/meeting-bot/src/calendar/registration-workflow.test.ts packages/meeting-bot/src/joiners/joiners.test.ts
2. Approved compatible Python -m pytest packages/meeting-bot/py/test_sb_join_registration_redirect.py -k retry_receipt --basetemp BROKER_WRITABLE_SCOPED_DIR -q
3. Direct existing meeting-bot TypeScript compiler --noEmit -p packages/meeting-bot/tsconfig.json
4. Broader focused workflow/state/child mocks and contracts/verify_contracts.py as broker permits. Existing state-test first fixture lacks receivedAt in baseline; do not attribute preexisting failure to this patch or silently repair it. Exclude actual child browser timeout test and unrelated full suites during shared CPU restriction.

## Security and limits
Flags: auth/scope, tenancy, external data writes, private operator config hash. Exact checked source is authority; public status/reason alone never authorizes retry. Child parser/runtime internal callbacks are trusted boundaries. No schemas/generated/shared changes; no Zoom activation; no network/DB/browser/provider activity. Current lane lock/persist-before-execute contract remains caller-owned. Live registration/storage/Windows/Ubuntu/downstream full T-052 acceptance remains open. Independent checker must load C:/Users/product/.agents/skills/checker/SKILL.md with fresh context, assess gates and bounded BOOTSTRAP_REVIEW if actual maker denominators remain unknown.
