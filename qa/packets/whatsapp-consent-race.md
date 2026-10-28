# Checker packet — whatsapp-consent-race, cycle1

Repo C:/Users/product/Desktop/KnowledgeBase. Existing canonical checker skill C:/Users/product/.agents/skills/checker/SKILL.md. Maker manifest qa/manifests/whatsapp-consent-race.md; checker writes only same-slug verdict. Full parent T007 and issue002 native proof remain explicitly HOLD. Do not sweep unrelated modules or reopen bounded nonsecurity findings.

## Changed logic and consumers

review/store.ts adds `fenceApproval`: tenant-qualified sources.updateOne matching source id, kind whatsapp-batch, exact group path, consent.given != false; sets a fresh `sourceMeta.whatsappReviewFence` UUID each transaction attempt and requires acknowledged/matched1/modified1. Called after canonical checkEvidence in initial approval and idempotent approved retry, before decision/publication/success. No no-op fencing, upsert, provider request or standalone transaction fallback. Existing real materializer is database/session-only. Read-only visibility still calls unmodified checkEvidence; it never calls the new writing helper.

Writing the same source forces conflict with concurrent consent updates under Mongo transactions. Native proof must establish retry rechecks consent; do not infer native guarantees from the fixture's serial transactions. Approval-first may commit before withdrawal; after withdrawal fresh trusted readers must reject historical claim and idempotent approval must refuse. Historical claims are preserved for audit; quarantine remains independent.

Fixture changes implement Mongo-shaped acknowledged/matched/modified results, dotted `$set` assignment and dotted `$ne` predicate. Existing assertions/corpora retained; no default success shortcut. Source fixture snapshots still rollback transaction writes. Five new protocol tests check fresh UUID/session/filter, idempotent no-republish, refusal on three bad acknowledgments, publisher rollback, unsupported transactions, and foreign tenant. (Five test declarations; refusal declaration has three result variants.)

## Exact serial broker verification

No real DB/provider/browser/keys. Cwd apps/api, outer90seconds, one CPU worker:

`node --import tsx --test --test-concurrency=1 --test-timeout=30000 src/whatsapp/review/store.test.ts src/whatsapp/review/router.test.ts src/whatsapp/review/wire.test.ts src/whatsapp/review/wire-fix1.test.ts ../../qa/evidence/whatsapp-review-foundation-checker.test.ts src/whatsapp/store-source-id.test.ts src/whatsapp/store-snapshot.test.ts src/whatsapp/store-isolation.test.ts src/whatsapp/store-mongo-snapshot.test.ts src/whatsapp/review/consent-race.test.ts`

Expected64 cases; actual TAP determines results. Prior WhatsApp59 receipt `qa/goal-vectorless-2026-10-15/verification-whatsapp59-20261015T0824.json` is historical. Keep literal issue0013 cases, issue0033 cases and unchanged foundation9/ISS3772/ISS3781; do not substitute new fences tests for recorded floors. Central API typecheck covers new native source without executing it.

## Native acceptance command — separately authorized only

Requires explicit `LKB_WHATSAPP_CONSENT_MONGO_RUN=1`, URI, DB matching `lkb_wa_consent_test_[a-z0-9_]+`; actual replica-set hello required. Command same runner flags but only `src/whatsapp/review/consent-race-mongo.test.ts`, outer60seconds. Standalone deployment fails assertion rather than becoming acceptance. Opt-out skip is not native proof.

Real-source-read gate pauses exact recorded issue002 attack, then real owner source update commits false before approval resumes. Reverse order verifies approved positive visibility then immediate withdrawal refusal; third scenario verifies publisher error rolls back fence/claim/candidate. Cleanup deletes only random run tenant in explicitly isolated test database; never drop database. No native execution yet. Native test lacks production authorization and is not to be run against existing real source data.

## Review budget and identity

Diff scope five files above; final hashes in manifest. Review complete short changed helpers/test modules plus directly used evidence/materializer routines only; no whole-repo survey. Record checker active/wait/tool seconds and token counts only if telemetry available, otherwise null. Fresh context required after broker source-freeze evidence. Full original race remains open until native proof; a scoped protocol PASS must preserve that limit explicitly.
