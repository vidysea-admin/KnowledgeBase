# Checker packet — whatsapp-vectorless-integration, cycle 2

Repo: C:/Users/product/Desktop/KnowledgeBase. Maker skill: skills/maker/SKILL.md. Independent checker uses skills/checker/SKILL.md and writes only matching qa/verdicts/whatsapp-vectorless-integration.md. Manifest records exact base/final hashes, scope and open concurrency limitation. Status remains in_progress pending required execution evidence.

## Change map and actual consumers

Only store.ts checkEvidence source validity predicate changes: explicit `source.consent?.given === false` joins existing missing/tenant/kind/path/session rejection. Reject error remains generic source/session evidence unavailable. Source lookup already uses withTenant and the caller's Mongo ClientSession. No durable cache, source mutation, approval bypass, API shape or schema change.

createMongoWhatsAppReviewRepository calls this same check for list/get/insert/decide and matching idempotent action retries. Approval invokes it inside existing session.withTransaction before changing candidate and materializing approved claim. Immediate downstream apps/api/src/visibility/knowledge.ts imports checkEvidence and independently checks current source consent, so the same canonical evidence guard continues to protect trusted readers. Existing composition/integrations/knowledge.ts already builds candidate-only ingest plus review router; composition/integrations/routes.ts already mounts it. No duplicate mount required.

Three added store tests are the literal issue floor: insertion after withdrawn consent produces zero candidate/publisher rows; withdrawal after insertion refuses approval/list/get with pending audit unchanged and zero publication; withdrawal after approval refuses successful idempotent confirmation while historical row remains for fresh-reader denial. Actual repository and detector run against existing transactional mock. A mock PASS cannot prove live Mongo race safety.

## Exact focused execution

Cwd apps/api:

`node --import tsx --test --test-concurrency=1 --test-timeout=30000 src/whatsapp/review/store.test.ts src/whatsapp/review/router.test.ts src/whatsapp/review/wire.test.ts src/whatsapp/review/wire-fix1.test.ts ../../qa/evidence/whatsapp-review-foundation-checker.test.ts`

Outer bound 90 seconds, one CPU slot through root broker. Mock fixture/database and local-loopback router tests only; no secret environment, actual database, browser or provider calls required. Known environment esbuild/subprocess restrictions may require the broker's approved execution path. Do not rerun broad suites; central compiler/integration checks are root-owned.

Expected 46 tests: 12 store, 5 router, 8 wiring, 12 wiring-fix, 9 independent foundation corpus. Count must be verified from actual TAP; do not infer execution. Report issue001 X/3 and unchanged ISS-377 2/2 + ISS-378 1/1 only from actual tests. The open race issue002 has no executable reproduction yet and is not credited as resolved.

Minimum future central race protocol: source authorization revision must be updated by all consent mutation paths; approval and withdrawal must contend on that revision through a conditional write in their transactions. Merely reading revision, doing a no-op write, or re-reading within the same snapshot is insufficient evidence. Introduce no ad hoc source field outside schema ownership. Verify actual Mongo interleavings and retry semantics before parent acceptance.

## Resumed issue003 extension (supersedes earlier 46-case command)

Current product patch adds atomic source initialize-only update: `sourcesColl.updateOne({_id:storedSource._id},{$setOnInsert:storedSource},{upsert:true})`. scopedCollection pins tenant in filter and update. Existing rows are not rewritten, so source authorization, consent and future metadata cannot be reset by reingest, even when withdrawal occurs immediately before the database upsert. Source hash/group identity and legacy-id selection remain unchanged. No lookup-derived overwrite is used. This does not implement the separate concurrent approval/withdrawal CAS protocol.

Adapted source-id fixture keeps actual stored rows, applies `$setOnInsert` only on absence and returns cloned reads. New named issue003 corpus covers namespaced repeated ingest, legacy repeated ingest, and withdrawal immediately before upsert; each uses full adapter-created source and preserves authorization metadata. Existing snapshot/isolation fixture additions capture `$setOnInsert` through the same original write hook. Existing VM snapshot fixture delegates its source update to its original mutation hook and requires only `$setOnInsert`; every ordering/owner/payload assertion remains unchanged. wire-fixtures is untouched.

Exact broker command cwd apps/api, outer90 seconds:

`node --import tsx --test --test-concurrency=1 --test-timeout=30000 src/whatsapp/review/store.test.ts src/whatsapp/review/router.test.ts src/whatsapp/review/wire.test.ts src/whatsapp/review/wire-fix1.test.ts ../../qa/evidence/whatsapp-review-foundation-checker.test.ts src/whatsapp/store-source-id.test.ts src/whatsapp/store-snapshot.test.ts src/whatsapp/store-isolation.test.ts src/whatsapp/store-mongo-snapshot.test.ts`

Expected59 (prior46 + source-id6 + snapshot3 + isolation3 + VM1), actual count must come from broker. Floors issue0013 and issue0033; unchanged foundation9 still preserves ISS-3772 and ISS-3781. No run yet at source freeze. Full final source/base hashes are in manifest. Parent T007 and issue002 remain open. No key/actual Mongo/provider/browser needed.

## Actual cycle1 evidence and cycle2 typing-only delta

Broker `qa/goal-vectorless-2026-10-15/verification-whatsapp59-20261015T0824.json` records59/59 PASS,exit0,11183.7536ms, no skips/cancel/todo/fail, unchanged candidate pins. Issue0013/3 and issue0033/3 literal floor succeeded. This supersedes earlier pending execution language for cycle1 only. Central API compiler then found three string-id fixture filter errors in review/store.test.ts117/130/146 because an untyped Mongo collection defaults `_id` to ObjectId. Root authorized only the narrow type repair: import canonical `Sources` as type and use `collection<Sources>` on those three source updates. No production code, fixture runtime behavior, assertions, schema or compiler suppression changes. Current test SHA256 BD3B077E9E473B0B2ED1F60E82EF4C050BA4FC394E03F1067671FC1BA2878985; other final hashes stay as manifest. Cycle2 remains in_progress pending serial broker attribution/typecheck and checker. Old source pin7BD6924 is historical rather than current-byte proof.
