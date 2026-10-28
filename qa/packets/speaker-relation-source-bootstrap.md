# Speaker relationship source bootstrap — cycle 1

Root: C:/Users/product/Desktop/KnowledgeBase
Manifest: qa/manifests/speaker-relation-source-bootstrap.md
Status: HOLD awaiting sole broker execution; not ready-for-check.
Priority: tier 2 auth/data-write integration boundary explicitly authorized by parent.

## Exact candidate and ownership

New files, no base bytes:

- apps/api/src/speaker-relations/source-router.ts — SHA256 8395fe7e5116c244af71b32a6b56c6655d04f4f5adcae45856893dcbf409b45b
- apps/api/src/speaker-relations/source-router.test.ts — SHA256 7b822a1bae742549dafa54455521375592a3703fa33633546aafed814c632073

QA paths above belong only to this lane. No changes to existing router/service/types/store/server/composition/core/schema/enforcement or checker contracts/verdicts. Parent binds final combined candidate/base SHA before independent review; these file hashes identify this frozen uncommitted slice.

## Acceptance and change map

createSpeakerRelationSourceRouter receives SpeakerRelationSourceRouterDeps: trusted contextFor matching the existing relationship router contract, and readAuthority(tenantId,personId):Promise<RelationshipAuthority|null>. GET /speaker-relations/source?personId=... validates verified req.auth tenant/keyId/scopes and requires sessions. It snapshots only trusted principal identity, verifies matching context tenant/actor/types and explicit canPropose||canReview. Automation review grant is inconsistent and refused. Body/query authority fields cannot enter source selection; unknown/multivalue query keys and nonempty bodies are rejected.

Authority must be current readAuthority snapshot with matching tenant/person, human-confirmed identity, SHA256-shaped base view revision and bounded statements. Every statement has unique valid ID, text and 1–20 exact evidence citations. Every evidence locator has a valid own session-keyed transcript hash in the trusted map; inherited/missing/malformed hashes and duplicate evidence are refused. Source never accepts or computes caller hashes. More than 100 statements, 20 evidence/statement, quote >12000 or complete response >512KiB refuses whole response rather than truncating. Output projects only {capabilities:{canPropose,canReview,reviewerKind},personId,sourceRevisionDigest,statements:[{id,text,evidence:[{sessionId,turnId,quote,transcriptHash}]}]}; no actor/tenant/history/session-title/topic/private snapshot dumps. Every route response is private,no-store; exceptions return constant sanitized 503.

Dependencies: ../auth.ts isValidTenantId and preverified Request.auth; ./router.ts SpeakerRelationsRouterDeps contextFor; ./types.ts RelationshipAuthority/RelationshipContext; packages/index/src/graph/speaker-knowledge.ts SpeakerKnowledgeView statements and base revision. Existing authority builder already establishes source metadata visibility. Parent-owned composition/integrations/reviews.ts will inject readAuthority via relationshipStore.transaction(tenant,tx=>tx.authority(person)), without writes. Product coordinator receives payload through integration coordinator; no UI files edited by lane. Existing relationship list revision supplies review baseRevision; bootstrap sourceRevisionDigest/evidence hashes supply proposal authority.

Risk flags: authentication, tenant isolation, exact source provenance, write authorization preparation, sensitive source projection. No native DB writes, live DB/provider/browser/env reads or manufactured human approvals. QA contracts unchanged.

## Focused broker execution and readiness

Command from root: `node --test --import tsx apps/api/src/speaker-relations/source-router.test.ts`.

Eight authored nodes, all unexecuted:

1. relationship source authenticates verified principal and scope before reading authority
2. relationship source projects exact current base digest hashes and trusted capabilities
3. relationship source rejects identity permission hash extras and invalid filters
4. relationship source fails closed on absent foreign malformed and unauthorized policy
5. relationship source refuses missing foreign unresolved stale-shaped authority
6. relationship source refuses missing malformed or inherited transcript hashes and evidence
7. relationship source refuses overbounds and duplicate statements without truncation
8. relationship source sanitizes asynchronous policy and snapshot failures

Tests use injected fake context/authority and loopback HTTP; node:http permits explicit GET bodies for forgery probes. No service writes or actual DB/provider calls. No test/dependency readiness claim or execution restriction receipt exists because lane executed no tests. Sole broker retains full output/exit/duration/runtime/lock/candidate bindings. Combined compiler/contracts/mounted route and UI immediate consumption are parent-owned required gates. Independent checker must verify authority/consumer boundary and evidence before PASS.

## Prospective measurement and review packaging

node:perf_hooks start 279806.491ms at 2026-10-15T10:11:37.663Z; end 385603.9118ms at 10:13:23.460Z; active 105.7974208 seconds, no explicit waits. Actual host tokens/cost null. Packaging excluded. No checker dispatched. Current C:/Users/product/.agents/skills/checker/SKILL.md requires prospective phase assessment and completion_reserve true for exact slug/cycle/candidate, review allocation and protected finalization; do not invent efficiency ratios or bypass missing evidence.
