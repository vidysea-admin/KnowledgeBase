# Native document lifecycle router — cycle 0 building packet

## Scope and exact identity

Root: `C:/Users/product/Desktop/KnowledgeBase`. Task T008, priority tier 3. Explicit two-file lease: existing `apps/api/src/knowledge/collections-router.ts` and NEW `apps/api/src/knowledge/collections-router.test.ts`. Existing immutable document-upload behavior is retained; it does not register/publish native logical sources automatically.

Observed integration HEAD before packet: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`; candidate is exact working-tree bytes, not an isolated commit. Other lanes own other workspace changes.

| File | Before SHA256 | Candidate SHA256 |
| --- | --- | --- |
| `apps/api/src/knowledge/collections-router.ts` | `2F34D72703ACD45F65726C7D9EAFC03783E8CE5BC7DC9672580711A83D392421` | `D54376AEF9EC3289B2976269672BE41FADB5B4AFAD69E826B751156C13491947` |
| `apps/api/src/knowledge/collections-router.test.ts` | NEW, no base | `1AA4CE10FEFE9F5DA826089951CA54DA6C780AB34603E105CA439ED984345685` |

These new QA manifest/packet files are metadata, outside executable candidate scope. Relevant contract: `qa/contracts/goal-t008.md` C1 real approved source/retrieval and tenant quarantine; native exact evidence requirements remain whole-task integration gates.

## Changed behavior and consumers

`KnowledgeDeps.nativeDocuments?: NativeDocumentLifecycle` is `Pick<ReturnType<typeof createNativeDocumentHeadStore>, "registerLogicalSource" | "publish" | "tombstone" | "loadPublished">`, imported from `apps/api/src/native-evidence/head-store.ts` (central ownership). Production central composition injects this dependency; absent capability returns 503.

All endpoints are under existing verified-tenant guard and require exact `ingest` scope:

- POST `/knowledge/document-sources`: exact `{consentGiven:true,note?:string}`. Missing/false consent and injected fields rejected. `recordedBy` is exclusively verified `req.auth.keyId`; absence returns 401. Delegates registration, returns 201 `{sourceId}`. Does not invent registration idempotency.
- PUT `/knowledge/document-sources/:sourceId`: exact `{documentId,documentSourceId,revisionHash,expectedHeadRevision}`; initial expected revision must be explicit null, replacement positive safe integer. Delegates exact stable/immutable binding and tenant to `publish`; returns 200 `{sourceId,head}` only after store resolves. Retry/index/CAS logic remains owned by the store.
- DELETE same path: exact `{expectedHeadRevision}` positive safe integer; delegates status `deleted` tombstone.
- POST same path plus `/revoke`: same revision body, status `revoked` tombstone.

Invalid route input returns 400; source unavailable 404; head conflict 409; invalid/unstable binding 422; all other dependency failures sanitized 503 without raw details. No fake indexed/published success flag. Native DELETE is logical tombstoning; raw document upload/body and legacy collection deletion routes are unchanged.

Security flags: auth/tenant/data writes apply. Routes forward only auth tenant and whitelisted fields; request-controlled attribution is rejected. The actual head store owns data mutation/index-candidate authorization. Locators are not authority. No credential values are stored in this packet; keyId is a non-secret verified document identity.

## Required broker evidence — not executed

From root using approved existing Node/runtime and the central <=30-second broker:

`node --test --import tsx apps/api/src/knowledge/collections-router.test.ts`

Expected 5 named tests. These execute real router tenant/scope/endpoint handlers in-process with injected public lifecycle methods, without sockets, DB or provider. They cover explicit registration/attribution; publication binding/CAS; distinct delete/revoke; every endpoint's tenant/scope/capability gate; safe errors and absence of successful publication claims on store failure.

Immediate compatibility check:

`node --test --import tsx apps/api/src/knowledge/collections.test.ts`

Existing compatibility suite uses local HTTP, injected DB and real PDF fixtures; broker must assess/authorize its environment as applicable. No execution result or exact legacy-suite count is claimed. Focused integration typechecking is also required against final central dependency bytes.

Central downstream consumption additionally must prove actual server mount -> head store -> quarantined candidate indexing -> winning head CAS -> native Ask/search visibility, plus replacement/revoke/delete invalidation. This unit does not claim those missing receipts. Required contract verification remains a central integration gate.

No tests, DB/provider/browser/network operations were executed by this maker. Actual test runtime, environment receipt, token/cost metrics and comparable active-time denominator are unknown. Checker must assess an explicit bounded bootstrap scope if measured maker denominators are unavailable. No checker verdict has been issued; handshake remains building cycle 0.
