# Review authority policy — cycle 1 maker packet

Root: C:/Users/product/Desktop/KnowledgeBase
Manifest: qa/manifests/review-authority-policy.md
Status: HOLD, no tests executed; not ready-for-check.
Priority: tier 2 auth/data-write boundary integration, exact paths authorized by parent/root plan.

## Candidate identity and ownership

New files with no base bytes:

- apps/api/src/review-authority/policy.ts: SHA256 5f20356f010c9fc70600ab9c8b9a49a3398b6d49e93fc50d578c17f0e13bf790
- apps/api/src/review-authority/policy.test.ts: SHA256 c8adaee59a4a6607038f3cc73c19b31e262aba638b2ece95908e0284921b0577

No edits to existing router/service/store/auth/server/composition/core/schema/enforcement or checker contracts/verdicts. These QA files belong to this unit. Exact file hashes, not an uncommitted combined HEAD, identify this candidate. Before independent dispatch bind current combined candidate/base SHA and pending integration changes separately.

## Authorized acceptance and implementation map

One server-owned version1 resolver accepts a configuration string parameter; no implementation env/file reads or raw API-key values. Undefined/empty string denies every identity. Malformed input rejects startup with constant error invalid_review_authority_config. Config shape is exactly {version:1,tenants:[{tenantId,keys:[{keyId,subject,reviewerKind,canPropose,canReview,answerActions}]}]}. Explicit records reject duplicate tenant/key identities, duplicate/unknown answer actions, unknown fields, malformed IDs/booleans/kinds, and any automation canReview/answerActions grant. Parse completes before resolver publication; private maps and frozen returned records/actions prevent caller mutation. Defensive bounds: 131072 input characters, 100 tenants, 100 keys/tenant, 1000 total keys. No QA contract altered or new task acceptance threshold asserted.

createReviewPolicyResolver returns frozen resolve(principal) and fails closed for malformed principal tenant/key/scopes or absent tenant/key allowlist. API-key scopes never confer configured human identity/permissions.

createReviewAdapters returns answerReviewAuthority and relationshipContextFor. The answer adapter reads only validated req.auth, exact configured tenant/key, explicit human kind and allowlisted action; returns configured subject for existing human:subject actor construction. Caller actor/isHuman/body/header values do not participate. The relationship adapter returns trusted configured subject as actorId, tenant and explicit canPropose/canReview/reviewerKind; automation cannot review. Foreign resolver output is refused. Existing router scope checks remain additional and unchanged. Resolver failures propagate to existing sanitized router failure paths; no authority is manufactured.

Exact immediate consumers (not edited): apps/api/src/answer-policy/answer-router.ts AnswerReviewAuthority.verifyHuman(Request,HumanReviewAction), HumanReviewAction union and human() gate; apps/api/src/speaker-relations/router.ts SpeakerRelationsRouterDeps.contextFor(RelationshipPrincipal). Principal validation imports isValidTenantId from apps/api/src/auth.ts. Relationship context shape remains apps/api/src/speaker-relations/types.ts. No source bootstrap endpoint or composition mount added.

Security flags: authenticated tenant/key identity, explicit human review, data-write authorization, no credentials. No raw key logging/persistence; unknown rawKey config field is rejected with constant diagnostic.

## Broker checks and evidence readiness

Only sole broker executes commands during shared CPU restrictions. Focused command at root:

`node --test --import tsx apps/api/src/review-authority/policy.test.ts`

Selected nodes, all authored and unexecuted:

1. review authority unset configuration denies all and malformed input refuses startup
2. review authority rejects duplicate tenants keys actions and malformed records atomically
3. review authority configuration bounds tenant key and total inventories
4. review authority resolves immutable tenant and nonsecret key identity only
5. review authority refuses malformed verified principals without scope-based promotion
6. review authority answer adapter grants only configured human actions ignoring caller claims
7. review authority relationship adapter copies explicit policy without human inference
8. review authority adapters reject foreign resolver authority and propagate safe refusal failures

Tests directly call both actual adapters against minimal Request-shaped mocks; no live HTTP/DB/provider/browser/env fixtures or human approval. Dependency readiness is unverified; no execution restriction observed because no test attempted. Broker must retain exact runtime/lock/candidate fingerprints, full output, exit code and duration; parent supplies combined compiler/contracts/downstream mounting evidence. Reviewer must independently inspect both immediate adapters/consumers and apply required security checks. No mutation receipt or verdict currently exists.

## Caller glue

const resolver = createReviewPolicyResolver(serverOwnedConfigString);
const { answerReviewAuthority, relationshipContextFor } = createReviewAdapters(resolver);
createAnswerHistoryRouter(workflow, answerReviewAuthority);
createSpeakerRelationsRouter({ service, contextFor: relationshipContextFor });

Mounting/authentication middleware and actual server configuration acquisition belong to the parent composition lane. Never supply request bodies/headers as serverOwnedConfigString.

## Accounting and independent review

Source phase monotonic 56168.5412ms → 146846.621ms = 90.6780798 active seconds, UTC 2026-10-15T10:07:54.025Z → 10:09:24.704Z; no recorded waits. Actual tokens/cost null. Packaging is separate. Preserve unknowns; do not invent a complete ratio denominator. No checker dispatched. When evidence becomes ready, use global C:/Users/product/.agents/skills/checker/SKILL.md: prospective budget assess, completion_reserve true with exact slug/cycle/candidate identity, review phase and protected finalization; no PASS before evidence and canonical verdict readback.
