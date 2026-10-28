# speaker-profile-accepted-relationships

Status: implementation-ready-awaiting-broker
**Handshake status:** implementation-ready-awaiting-broker
Fix cycle: 0

Priority tier 3, T-055 / U2.4, approved Knowledge Brain plan. Source-native accepted relationship integration; auth/tenant read boundaries require independent review. Existing profile consumer unit's broker evidence remains historical, not evidence for these changed store bytes. No parent-task completion claim.

## Scope

Maker leases only `apps/api/src/speaker-profiles/store.ts`, `store.test.ts`, new `relationship-reader.ts` and `relationship-reader.test.ts`. No schema, generated types, barrels, router, server, composition or QA contract changes. Source files frozen pending sole-broker tests. Composition activation is deferred to central integration.

Acceptance: `qa/contracts/speaker-knowledge-vectorless.md` clauses 1–5 plus the canonical relationship service's current source-authority and human-review checks. Confirmed identity is required before accepted relationships enter the graph. No suggestions/rejections/revocations, cross-person joins, foreign tenants, missing review receipts, changed transcript hashes or stale base revisions may feed accepted relationships. Oversized inventories refuse; never truncate.

## Changed logic and immediate consumers

- `readSpeakerProfileInput` factors the existing visibility/metadata/turn-correction logic without widening permissions.
- `readSpeakerKnowledgeAuthority(snapshotDb, tenantId, personId)` exposes a BASE graph and exact effective transcript hashes, sorted by timestamp/turn ID as the existing speaker hash requires. It opens no session, reads no relationships and cannot self-invalidate its source digest through accepted edges. The relationship store's source-authority callback can use it within its own existing transaction.
- `createMongoSpeakerProfileDeps(db, acceptedReader?)` defaults to the prior relationship-free graph. When configured, the callback runs only inside the final existing read snapshot, receives the current source-only authority, and accepted evidence goes back through `buildSpeakerKnowledgeView` validation using the same sanitized source inputs.
- `readAcceptedSpeakerRelationships` adapts the existing canonical `createSpeakerRelationshipService(...).accepted` validator through a read-only transaction capability. `get/list` use tenant-scoped collection reads; authority is the current supplied base snapshot; inserts and CAS explicitly throw. No client/session access or nested transaction. Same-person accepted inventory has a hard 100-row bound.

Risk flags: auth/tenancy yes (existing sessions-scope caller and source snapshot), writes no, credentials/providers/external effects no. Mandatory source privacy and freshness checks remain in the original authority path. Canonical service/type/mongo-store modules are dependencies owned/frozen by speaker_graph_maker, not changed here.

## Candidate identity

Existing HEAD reference: `5c4cbade2d1a8aa4815de13d587db8de3b01cc4a`. Dirty baseline preserved. Before this phase store.ts SHA256 was `39673D43BA16866D26DD1B2CCEE7C424A841D7168476A26897735E9DCA6C3028`; store.test.ts was `48299D28B5500F784923D0E0D13DEA3F9A498A6A7EECE191B43C428A1A7E9F5F`. New reader files had no base.

Final SHA256, prefix `apps/api/src/speaker-profiles/`:

| File | SHA256 |
|---|---|
| store.ts | 14A5817B08DF1488E037D122EC34E7A28E9FE2C6907C9141424E66B555F6C086 |
| store.test.ts | E5FB7F33E2B4FD388BAAC0D3852BDA5F83A785FF856FC6299E2C4463F319F144 |
| relationship-reader.ts | 489107E7F9CAAF5625438342D47C9F037E0EEE20E013FB84E4ADEE2315440B9F |
| relationship-reader.test.ts | A6A66395EA6A0E75B4AC63EFE2670594466F05EEBE86B5AB1B104E3724B9C0D1 |

## Verification requested

Sole broker holds execution; no commands run by maker. Exact selected node names:

1. store.test.ts: `source-only authority is session-free and relation-independent with exact effective transcript hashes` — source-only digest, session-free capability, no relationship reads.
2. store.test.ts: `optional accepted relationship reader runs only inside existing source snapshot` — current snapshot passed, accepted relation consumed by graph, consent withdrawal prevents callback.
3. relationship-reader.test.ts: `snapshot accepted reader reuses canonical validator and excludes stale foreign unreviewed terminal rows` — accepted happy path plus nine refusal variants.
4. relationship-reader.test.ts: `accepted reader refuses oversized inventory and identity/tenant mismatches without nested capability` — confirmed identity, tenant and inventory bounds.

Root command: `node --import tsx --test --test-name-pattern="^(source-only authority is session-free and relation-independent with exact effective transcript hashes|optional accepted relationship reader runs only inside existing source snapshot|snapshot accepted reader reuses canonical validator and excludes stale foreign unreviewed terminal rows|accepted reader refuses oversized inventory and identity/tenant mismatches without nested capability)$" apps/api/src/speaker-profiles/store.test.ts apps/api/src/speaker-profiles/relationship-reader.test.ts`.

Immediate downstream existing API case: `mounted knowledge route enforces scope, request bounds, tenant and safe DTO`, in `apps/api/src/speaker-profiles/router.test.ts`. Source-only authority consumer is the canonical relationship service/store, requiring its matching independent producer verdict. Shared schema/composition remain frozen under central integration. Full integrated release checks belong to the later joint candidate, not this selected maker batch.

No live DB, provider, browser, private TOC or credential access. SDK session lifecycle and synthetic collection fixtures only. Exact selected test receipt, dependency pins and environment evidence to be appended by broker coordination before ready-for-check; a central full release verifier is still required at its applicable gate.

## Prospective maker measurement

Monotonic source-phase ticks: `215115884038` to `215974570792`, frequency `10000000`: `85.8686754` active seconds, no waits in that source phase. Tokens/cost unknown (`null`), not zero. Metadata packaging is separate, not included in that denominator. No execution, elapsed-time, efficiency-success or PASS claim.
