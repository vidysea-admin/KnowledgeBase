# Speaker relationship standalone router boundary — cycle 1

Root: C:/Users/product/Desktop/KnowledgeBase
Manifest: qa/manifests/speaker-relations-router-boundary.md
Base HEAD: 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
Status: HOLD awaiting sole broker execution; independent reviewer must not be dispatched as ready yet.

## Candidate and scope

Both new/untracked files had no base:

- apps/api/src/speaker-relations/router.ts — SHA256 3A39C1981333D10D6CD8349225834839A6BEEF56670477E0EE902190464CE90A
- apps/api/src/speaker-relations/router.test.ts — SHA256 DF095A03A405DEC62D425F5D05731813E2F7A3F4E99C7E5A5B0863943ECA7F8E

No shared auth/server/composition/service/types/store/core/schema files edited. QA files above are this lane's packet only. Parent integration owner requested exactly this standalone boundary. No QA contract changed or new acceptance threshold invented.

## Acceptance and change map

createSpeakerRelationsRouter receives service and trusted async contextFor(verified principal). Routes are POST /speaker-relations, POST /speaker-relations/:id/review, GET /speaker-relations?personId&status (suggested default). Existing ../auth.ts VerifiedKey is the sole request authentication source. Missing/invalid tenant, keyId, or scopes is refused; sessions scope is required. contextFor receives only a frozen principal snapshot; its explicit actor/permissions/reviewerKind must match verified tenant and valid types. No API-key-to-human inference. Null/missing/malformed/throwing policy fails closed. Proposal permission and human review permission are enforced before service calls.

The router bounds and explicitly admits only the service proposal/evidence fields or explicit review decision/baseRevision/requestId. Body tenantId/actorId/reviewerKind/permissions and unknown fields are refused. List validates person/status and rejects extra/multivalue filters. Service.list output tenant/person/status/count are checked again. DTO projects allowlisted endpoint and quote/citation fields, no transcriptHash, actor, internal histories or tenant dumps. Receipt DTO is allowlisted. Errors map known service codes and sanitize arbitrary async errors. All routes set private,no-store. Accepted-only graph behavior remains the service's accepted() consumer boundary.

Immediate dependencies: apps/api/src/speaker-relations/types.ts (context/service/row contracts); service.ts (domain errors and authority enforcement); ../auth.ts (verified principal). No production mounting consumer added; that is parent integration work.

Risk flags: auth, tenancy, writes, human review, error/DTO disclosure. No credentials read; header/body identity never reaches policy or persistence authority. No live DB/provider fixtures.

## Focused execution and readiness

Sole broker command from root: `node --test --import tsx apps/api/src/speaker-relations/router.test.ts`.

Authored node names (all eight, no execution receipt yet):

1. relationship router requires verified principal and sessions scope — no-auth, malformed principals and scope.
2. relationship router trusts only injected policy and rejects foreign context — trusted principal, body/header isolation and tenant agreement.
3. relationship router rejects forged authority and invalid proposal shapes — exact keys, evidence limits and source digest.
4. relationship router refuses automation review and missing write permissions — human gate and policy flags.
5. relationship router bounds explicit review commands and strips receipt extras — accept/reject/revoke and receipt allowlist.
6. relationship router lists suggested by default with source-safe DTO and bounded filters — safe source projection/query bounds.
7. relationship router fails closed on missing policy and sanitized async failures — policy/service failure boundaries.
8. relationship router refuses cross-tenant or mismatched list outputs — output guard.

Fixtures use injected fake service/policy and loopback HTTP only; accepted() throws if unexpectedly invoked. Execution facts: no tests attempted, no dependency readiness claim, no sandbox restriction observed for these commands. Broker must retain full output/exit/duration and candidate binding. Combined compiler/contract/production mounting/downstream gates remain parent-owned.

Prospective measured source phase: TickCount64 21493968 → 21612312 = 118.344 seconds, no recorded waits. Actual tokens/cost null. Initial reads unmeasured/null; do not manufacture a complete efficiency denominator. Independent review packaging must follow C:/Users/product/.agents/skills/checker/SKILL.md completion reserve: completion_reserve true, identity slug/cycle/exact pins, review phase then protected finalization; prospective budget assessment required. No checker dispatched by this lane.
