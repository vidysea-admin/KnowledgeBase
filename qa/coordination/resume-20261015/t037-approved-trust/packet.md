# T037 persisted approve-once → actual scheduler consumer

Status: IMPLEMENTED / UNEXECUTED / NOT READY FOR CHECK. Cycle 0. Tier 3, authorization/security class.
Policy: managed-review/1; incomplete fragment only, no checker dispatch or PASS.
Root: C:/Users/product/Desktop/KnowledgeBase
Base Git SHA: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Candidate raw-byte map: 6f50bfe0cb9a859eb8e52f78a7d76e8ce6e9444bd6c98044139657f613a48fce (not a Git commit).
Exact changed/read-dependency identities: pins.json. Raw original bytes: raw-backup/. Final changed snapshots: source-pins/.

## Actual software gap filled

Previously projectApprovedSenderTrust existed only in a pure helper/test; runScheduleTickOnce selected using static bootstrap trust before verified rules loading. New server-local selection callback runs after a verified rules read and uses that exact document for candidate-specific persisted approval and subsequent canonical veto. The actual scheduler's existing global overlap/dedup, tenant-tagged job persistence and scheduled-dispatch recheck remain immediate consumers.

Changed paths: calendar/auto-join.ts adds an optional local selector option receiving the exact original candidate (not ID lookup or shared domain grants); calendar/schedule-tick.ts composes existing projection with loaded authority; calendar/join-rules/join-rules-enforce.ts passes its single resolved authority through preselection and veto; new calendar/join-rules/join-rules-approved-trust-tick.test.ts authors nine tests. Prefix all with packages/meeting-bot/src/. The leased existing schedule-tick-rules-integration.test.ts is unchanged and a required immediate-consumer check.

## Boundaries and clauses

qa/contracts/goal-t037.md C2: saved sender/domain approval must reach a distinct next eligible webinar and persisted scheduling outcome. C3/C5/C6: deny/opt-out, current key tenant, durable owner, primary/last-valid and original expiry must remain enforced. C8/C9 live/downstream/independent proof stays open.

No global union of grants, status mutation, everyWebinar/default change or invented source aliases. Projection is available only when current key matches configured rules tenant and that authority matches scheduler persistence owner. Existing helper still requires authenticated conference-source due webinars, saved exact sender/domain approval and deny/opt-out permission. Existing selector retains global overlap and dedup. No primary reread between approval projection and veto; snapshot refresh's existing lock/revalidation behavior remains intact. Like existing policy, a document saved after this resolution takes effect at a later check; the separately implemented scheduled-dispatch gate still rechecks before capture. This does not claim instantaneous revocation after capture begins.

ISS-376 broad everyWebinar admission remains explicitly unchanged and Approver-gated. New unit is a missing roadmap consumer, not a claimed fix for a filed issue: no issue ID is closed and no original attack corpus is claimed satisfied. Existing sender-authentication/URL/refusal/snapshot regressions remain required focused checks. All synthetic approval tests use actual recordTenantApproval/store reload; this is not a human/operator acceptance claim or API/browser proof.

## Evidence request and remaining gates

broker-request.json asks root's sole broker for new9 plus existing scheduler integration4, bounded60seconds, then affected last-valid enforcement/type/contract checks only after first execution. Exact test node reasons and sanitized environment requirements are recorded there. No tests, build, checker tools, DB, browser, provider, scheduler execution or actual approval effect ran in this maker phase. No ready-for-check submission is made.

managed-review-fragment.json intentionally has readiness.complete=false, no receipts and no invented candidate Git SHA. Root must complete identity/evidence, run policy validate and assess before a fresh independent reviewer. Actual maker total tokens/cost/active time are null; before.json and phase-metrics.json retain prospective monotonic phase wall bounds, not measured full maker active usage. No ratio success claimed.

Source scopes are FROZEN for broker. Preserve shared dirty state. Full T037 live auth/operator/restart/trusted-next-webinar/capture/email acceptance, known cross-source/series/ISS376 exceptions, full independent verdict and matching close-out remain open. No schema/deps/enforcement/frozen-contract/global tracker changes.
