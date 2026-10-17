# Speaker relationship proposal and human review service

**Handshake status:** building
Status: building
Fix cycle: 1
Priority tier: 3 — approved vectorless Knowledge Brain U2.4/T-055/T-056 roadmap.

## Authority and bounded unit

Root and integration_control approved exclusive new apps/api/src/speaker-relations/ service/store/test lease. Canonical schema/generated/accessor/migration are separately central-owned. Portable maker workflow skills/maker/SKILL.md applies. Existing checker contract qa/contracts/speaker-knowledge-vectorless.md clauses 1–5 governs identity/source/evidence boundaries; a dedicated relationship-write contract is requested from the independent checker. Maker did not edit contracts. No graph helper, shared composition, routes or schemas were changed by this unit.

This is the same-person statement relationship proposal/review service and isolated transactional Mongo adapter, not a mounted product or full-parent acceptance. It never writes speakers/identities or public graph_edges. Cross-person relationships are refused pending a separate helper/review lease.

## New candidate paths (no base existed)

| Path | SHA256 |
|---|---|
| apps/api/src/speaker-relations/types.ts | DFDA428C83A3469EC7EAE93BF0877FACFE018A686C13A3B1484B3EC18415748F |
| apps/api/src/speaker-relations/service.ts | 25C0F5AC26A530918071033F8A1E5F1958D19E5AD3190A7C5A5CCBCD266164E0 |
| apps/api/src/speaker-relations/mongo-store.ts | C41021E5A66EE9ACB02C7C21A50439C5067430E5052F2D9693EEC58A53FFE4DB |
| apps/api/src/speaker-relations/service.test.ts | E930AC8883B60D25F6DF989FFD84CA456D170FEC49A8DDF2493D99CED98917B0 |
| apps/api/src/speaker-relations/mongo-store.test.ts | 061FF4D7309776A212C1D80C149A22F295AB3145FA113FCA26DF51BD94ADB853 |

## Interfaces and change map

createSpeakerRelationshipService(store, now?) exposes propose, review, list and accepted. Server-derived RelationshipContext supplies tenantId/actorId/canPropose/canReview/reviewerKind, never request-body identity. Proposal model output may suggest only; review requires human kind and review entitlement. Canonical same-person endpoints must match two unique current attributed statements in a human-confirmed base speaker view. SourceRevisionDigest equals that base view revision WITHOUT accepted relationship edges to avoid recursive invalidation. Current exact evidence locators/quotes and transcript hashes must survive. Missing/withdrawn/foreign/stale/uncertain authority fails closed.

Proposal input.id is an idempotency token. Persisted _id is rel:SHA256([tenantId,input.id]) so tenant-colliding tokens do not collide Mongo _id. Immutable proposal shape including author must match for replay. Review receipt.id is the canonical ID used by review. Review uses expected revision CAS, actor-bound requestHash and optional canonical reviewHistory (max two lifecycle commands). Only suggested→accepted/rejected and accepted→revoked are allowed. Matching prior receipt replays its minimal id/revision/status after later revocation without reopening the record; modified command/actor/key conflicts. Review latest summary maps commands accept/reject/revoke to statuses accepted/rejected/revoked. New reviews require current source authority; deleted/stale relations are excluded by accepted reader and cannot be newly accepted.

The accepted reader filters tenant/person/status/current authority, then requires latest accepted human-review summary and matching receipt revision/actor before emitting SpeakerKnowledgeRelation[] for the existing pure helper. Pending/rejected/revoked records cannot enter graph or Ask. The service currently has no mounted caller. Integration_control owns snapshot authority-loader and eventual route composition; no caller receipt is claimed.

createMongoSpeakerRelationshipStore(db, authorityReader) opens a real client session snapshot with majority writes and 10s commit bound. Both authority source reads and relationship CRUD bind the same session and mandatory tenant. Its DB facade permits writes only to speaker_relationships; source writes are rejected. Inventory refuses >100 rather than silently truncating. Missing transactions fail closed; abort/endSession execute on errors. scopedCollection supplies tenant-bound reads/inserts/replacement CAS. No provider, environment or secret access.

Security flags: auth permission/tenancy/source privacy/data writes YES; credentials/providers/external effects NO. Persistence writes are implemented as source interfaces only and have not been executed against a real database.

## Commands and current evidence

NOT RUN by maker; queued only with sole verification_broker:

```
node --test --test-timeout=60000 --test-concurrency=1 --import tsx apps/api/src/speaker-relations/service.test.ts apps/api/src/speaker-relations/mongo-store.test.ts
```

Twelve focused synthetic tests: proposal→human accept, automation and unresolved/deterministic identity refusal, eight stale/forged/foreign source variants, cross-person exclusion, review race/CAS, request replay after revocation, stale review/storage CAS failure, foreign persisted rows/input limits, tenant-colliding keys, session-bound Mongo authority/CRUD, forbidden source writes/unscoped reads and abort cleanup, transaction/tenant/revision refusal. Mongo tests use an in-memory driver double; no DB or listener. No runtime tokens/cost claimed.

Source frozen pending broker receipt; API semantic typecheck and frozen verifier assigned to broker. Candidate status remains building until focused evidence and dedicated checker contract are available. Independent checker must evaluate actual bytes and retain route/authority wiring, native Mongo concurrency/restart, genuine human review, full corpus precision and all parent acceptance as open gates.
