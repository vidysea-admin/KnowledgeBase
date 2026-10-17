# Checker packet — t052-approved-registration-workflow

Subsequent central-runtime lease covered only scripts/webinar/run-pipeline.test.mjs affected registration fixtures. Its current SHA256 is `C893D058A27524942B9879C60942C94A19A2653512E172D258AED72C7BEE9221`. All original assertions remain. Absolute native Python/profile paths and all first/last/email selectors now reach supported configuration; initiating sources have synthetic authenticated provider acquisition receipt and confirmation receipts are current canonical UTC. The direct disk-failure fixture uses real reconcileWebinarSources accepted webinar state and real validateWebinarRegistration; its update asserts the submitting marker before throwing, so a prior source/config refusal cannot pass vacuously. Actual runner persistSync publication remains exercised through the existing composed path. Focused argv is `node --test --import tsx --test-name-pattern=registration scripts/webinar/run-pipeline.test.mjs` (six affected tests), still unexecuted pending fresh CPU lease.

**Fix cycle:** 1
**Status:** building; no ready-for-check claim yet.
**Maker:** /root/docker_migration_review
**Independent checker:** /root/docker_dependency_review/checker_t052
**Full contract:** qa/contracts/goal-t052.md, SHA256 1AFB3852AB90198A20F38D363CF9F81CFCE84D7BA2698ECEE94095706FE697D8

## Change map and consumers

- registration-workflow.ts extracts the old runWebinarRegistrations implementation without importing back from auto-record-policy. It adds source/config checks before the durable attempt, calls config(candidate), emits only the REGISTRATION_REASONS finite public vocabulary, and checks canonical provider receipt freshness. Runtime dependencies are node:path and the core types; no browser or network is created here.
- The config candidate is enriched transiently with registrationIdentity derived from accepted non-unresolved source/proven linked calendar provider IDs, canonical existing gmail:/cal: session keys and proven alias keys. The T-037 resolver uses all aliases only for deny/opt-out. A bounded validation failure refuses rather than truncating veto evidence. No private metadata is sent to Python or copied into public output/attempt; acquisition remains the provenance store.
- auto-record-policy.ts retains its public lifecycle export/import so existing scripts/webinar/run-pipeline.mjs keeps the same registration API. Confirmation projection and original immutable source lineage remain here. Delayed reconciliation rebases its own field changes onto current operations before preparing; its new persistSync callback returns undefined and is invoked/committed in the same call stack. Declared async writers refuse before invocation; generic async storage is unsupported. Confirmation uses the acquisition cutoff so a later wall clock cannot create a future-to-acquisition proof.
- state/schedule-state.ts preserves source-bound registration validation and adds finite diagnostic validation and receivedAt freshness to the existing exact confirmation predicate. It does not store operator values or change the attempt's canonical shape.
- registration-workflow.test.ts uses real source reconciliation and confirmation consumers with synthetic fixture identities. Ten tests cover source approval/auth/classification, unresolved source, actionable/config-correction states, per-candidate policy errors, storage-before-submit and write refusal, uncertain/restart deduplication, provider freshness, exact confirmation lineage, advanced-clock/concurrent-child preservation through actual source preparation, async-writer refusal before invocation and failed sync-write noncommit. Pinned-browser `cft` config remains accepted. Its disk readback is a temporary fixture, not actual Mongo/live durability.

## Security and integration

Flags: authentication, tenancy, external data submission, credential/privacy, durable data writes and confirmation authority. Lane ownership and configured/API-key tenant validation remain caller obligations. T-037 resolves registration consent from a persisted tenant-bound approved profile/scope and refuses opt-out/deny. Environment JSON supplies runtime paths only after the ROOT dependency-factory integration; it must not approve an operator or host.

Persistence is trusted internal synchronous code bound to the actual atomic-file writer; persistSync returning undefined expresses that production contract. Declared async callbacks refuse before invocation. A post-return guard refuses memory commit if a callback violates its contract; it does not undo that callback's side effects. No async whole-state durability claim is made. Bind all source callers/tests to the explicit sync-only interface before running affected checks. The historical static async concern was not a reproduced production overwrite because the actual consumer was already synchronous.

receivedAt must originate exclusively from Gmail provider internalDate, never a From/Date header, user form or scan clock. ROOT owns canonical schema/generated/store/core/snapshot/HTTP preservation; missing receipt refuses fresh confirmation. Confirmed historical records remain readable, but cannot bypass current source-validation/projection requirements.

## Planned bounded validation — ROOT CPU lease only

1. node --test --import tsx packages/meeting-bot/src/calendar/registration-workflow.test.ts
2. Affected standing runner registration tests after the owner adds faithful complete mock form/runtime and provider receipt data while preserving assertions.
3. node node_modules/typescript/bin/tsc -p packages/meeting-bot/tsconfig.json --noEmit
4. python contracts/verify_contracts.py (report vacuity if no frozen contracts).

Do not launch a local browser, broad suite, external registration, mail send or DB write as part of these checks. No mutations are proposed. Existing ISS-373/374 browser attack corpora and OS ownership remain separate required historical/full-acceptance gates.

## Missing evidence and prerequisites

No current candidate command evidence, final file hashes or full real-source chain has been supplied yet. Missing real configured source/operator, actual supported organizer submission, genuine fresh confirmation, actual durability/restart, downstream outputs, custom JavaScript form support and Ubuntu proof require full-parent HOLD where absent, not inferred PASS. A scoped source result cannot replace independent C1–C14 acceptance.

Actual source gap evidence: qa/evidence/t052-real-mail-provenance.json, acquired through connected Gmail profile/search/full-message reads only. Exact provider internalDate and literal URL-presence observations demonstrate that the historical invite/confirmation threads and authenticated envelope senders differ. D-079 strict identity/thread policy is retained; provider-bound cross-thread/approved-sender-alias correlation and safe tracking-link handling require an explicitly reasoned decision after this proof. No current attempt, historical user approval or automatic execution is manufactured from this mail pair.

The concrete HUMAN_GATE proposal is qa/gates/t052-zoom-confirmation-and-brevo-resolution.md (proposed, awaiting Umesh). Retained original HTML has one Register Now anchor on the exact named Brevo tracking host; its destination/provider ID has not been resolved or verified. The proposal cannot itself grant consent or widen the current matcher. No live provider/browser/registration calls are allowed during the resumed source checks.
