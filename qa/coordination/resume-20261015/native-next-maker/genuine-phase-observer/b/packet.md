# Trusted recovery phase observation — B author packet

policy_version: managed-review/1
token_metric: actual_total
Status: authored-unverified; central source freeze and sole-broker receipts required
Fix cycle: genuine-phase-observer/1
Root: C:/Users/product/Desktop/KnowledgeBase
Base SHA: d50a25c200dcbcf574ecade0aa205f5fcb45c5f8
Candidate SHA: null (shared dirty candidate; central owns combined identity)
Actual maker active_s / actual_total tokens / cost: null / null / null

## Source ownership and evidence

Only two existing source paths changed: packages/meeting-bot/src/capture/native/native-archive-recovery.ts and native-archive-recovery.test.ts. [preimages.json](preimages.json), [backups](backups/) preserve exact raw bytes before authoring. [source-pins.json](source-pins.json) binds final bytes: recovery68lines SHA2569d96c19b487710be597a49136b02ee5d4910cc0addb6678ea408c1a36071f10b; tests163lines SHA256a125bb23755d9f51fb496b67bb0993415e3f2decec13949c9b8455cfef7db877. No new source file, contracts, schemas, dependencies, source issuer, ACL/root operation or QA verdict changed. C separately owns actual fixture wiring.

Historical206/184/18/4 batch, stage3 timeout partial observations, and isolated original genuine positive failure remain immutable. Isolated raw [genuine-seal-isolated-original-positive.log](../../../broker/genuine-seal-isolated-original-positive.log) shows42.694s genuine node status unavailable versus ready; it does not identify inner failure. No earlier enum-only1725 fixture run is claimed; that variant was NEVER_RUN. Observer adds diagnostic localization only, not a fix for the outstanding recovery failure.

## Exact behavior / interface

Export NativeArchiveRecoveryPhaseEvent:
- stage: admit | receipt | media | provider | final-admission.
- event: start | complete | failed.
- errorName?: Error | TypeError | RangeError | SyntaxError | UnknownError.
- errorCode?: EACCES | EPERM | ENOENT | EINVAL | EIO | ETIMEDOUT.

Factory input gains optional synchronous trusted `observe?: (event: Readonly<NativeArchiveRecoveryPhaseEvent>) => void`. Notifications are frozen newly allocated scalar-only objects; failure classification never includes raw error, name outside whitelist, message, stack, cause, paths, data, content or payload. Unknown names normalize UnknownError; unknown codes omitted. Even thrown error accessors cannot escape failure classification. Observer exceptions at every notification are swallowed. Observer return is not proof and is not awaited; this is a synchronous trusted callback only.

Operations stay ordered and unchanged: real store.admit; admission+receipt JSON read; existing receipt private/shape refusals; actual media reproof; actual provider reproof; final admission. Same original catch mappings and returned capabilities. A receipt successfully read/parsed emits complete before existing semantic refusal returns; no fabricated failure exception is introduced for those early returns. No generic capability register, injected proof factory or API/HTTP field is added.

Immediate consumer: C's actual production.test.ts recovery factory uses the fixed scalar observer to timestamp phases, while keeping the ready assertion and actual media/provider calls intact. Optional trusted observability never issues capabilities or changes acceptance.

## Focused authored regression / minimum broker request

1. New test node `throwing recovery observer preserves genuine missing admission refusal and fixed failure fields`: opens a real private empty store, tries a missing UUID, checks exact admit:start and admit:failed Error/ENOENT events, frozen records, observer throws on both notifications, and unchanged unadmitted result. Uses real filesystem/admission boundary; no decoders, DB or paid provider. Native root prerequisite remains real, broker-only.
2. Existing genuine read-only closed spool positive now collects events while observer throws on every notification. The same single recovery invocation must still return ready and match exact five-stage start/complete ordering, unchanged source bytes/modes and actual provider guard acceptance. No extra decoder replay or duplicated positive suite added. This positive may still expose the known original recovery defect; no expectation weakened.
3. Root-requested isolated original production49 positive with C observer fixture is the narrow diagnostic replay to locate current failure. It must retain native binary/root identities, bounded deadline, actual result count, and content-free event output. Separate failure from observer changes; never infer acceptance from diagnostic delivery.
4. Combined bot/root-script typecheck and applicable scoped structure/import checks remain broker responsibilities on exact source freeze. No checker dispatch/acceptance requested before evidence.

No tests/build/FFmpeg/ACL/DB/browser/providers executed. No green/red/restored or stage timing claimed. Unknown actual_total usage stays null. Central must assemble/validate full managed-review/1 input before independent checking; this fragment is not a validation/PASS receipt. All original private transform/platform/real DB/EXIT chain gaps remain open.
