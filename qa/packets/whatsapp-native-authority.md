# Checker packet — whatsapp-native-authority, cycle1

Repo C:/Users/product/Desktop/KnowledgeBase; two new paths/final pins in same-slug manifest, no base existed. Canonical checker skill C:/Users/product/.agents/skills/checker/SKILL.md; fresh-context review after helper assess gate. Scope current approved WhatsApp native authority only, no broad sweep. Actual usage unknown; use explicit bounded bootstrap rather than claiming measured10% success. Persist verdict only in qa/verdicts/whatsapp-native-authority.md.

## Behavior and immediate consumers

createWhatsAppNativeAuthority(db) runs loadCurrent/listCurrent under session.withTransaction(readConcern:snapshot,readPreference:primary). A read-only database facade injects that session into every findOne/find; exposes only cursor limit/toArray. All source/effective transcript/canonical visibility/checkEvidence reads use this capability; no writes/provider calls. Database failures set a failure flag so internal fail-closed guards cannot convert outage into successful empty response; public failure message sanitized. Unsupported transactions fail; there is no Pickcollection fallback.

Authority requires current explicitly consented WhatsApp source, exact tenant source/session/turn association, canonical approved nonattachment candidate and current matching materialized claim, no pending invalidation, exact effective transcript through existing guard. Explicit revoked/deleted/unpublished states denied. Missing/stale/quarantined evidence returns null; infrastructure failure throws sanitized error. Revision SHA256 binds version, tenant/source/session/message, exact text/attribution, approval binding/audit and current consent. Fresh consent fence metadata intentionally excluded so harmless idempotent approval does not invalidate content. Full text/current revision returned only after actual canonical guard. Generic public title avoids raw group title.

listCurrent reads at most129 sessions and129 candidate claims and explicitly refuses >128, then returns <=128 passage locators (limit1..128). UTF16 slices <=4000 with surrogate-pair boundaries; SHA256 hashes UTF8 exact slice. Raw upstream message ids are not persisted; thread=session id, message=turn id are honest internal references. Locator itself never grants trust. Shared native resolver verifies requested offsets/hash/body against current authority.

Central actual consumer contract buildNativeIntegrations({db,knowledgeStore,messageAuthority}) receives:

`{loadCurrent:(tenant,locator)=>locator.kind==='message'?wa.loadCurrent(tenant,locator):Promise.resolve(null),listLocators:(tenant,identity)=>wa.listCurrent(tenant,identity)}`

Single resolver and actual publisher/query/hydrate/revalidate consume that capability. Central owns composition/native factory; source helper tests do not establish mounted Ask/search acceptance. Native snapshot standalone or unavailable replica acceptance remains HOLD. Existing consent-race write unit and tests are unchanged.

## Verification

Broker only, cwd apps/api, outer60seconds:

`node --import tsx --test --test-concurrency=1 --test-timeout=30000 src/native-evidence/whatsapp-authority.test.ts src/native-evidence/resolver.test.ts`

Eight authority declarations plus resolver standing cases; actual TAP determines count. Fake DB snapshots clone actual canonical materializer-produced source rows at transaction entry and assert every read receives same session. Positive test uses actual shared native resolver; errors in sources/claims/turns/transcript-review collections must propagate sanitized. Existing wire fixture/detector/materializer/visibility/effective-reader are reused unchanged; no real DB/network/providers. New files need central API typecheck. Full native transaction/actual mounted publisher→search→Ask proof is central integration acceptance, not mock inference.

No checker dispatch until current broker receipt and environment/candidate fingerprints are ready. Same-cycle source drift requires new attribution. Native source unit is read-only; earlier issue001/003 write fixes and issue002 native race remain separately tracked, never silently closed.
