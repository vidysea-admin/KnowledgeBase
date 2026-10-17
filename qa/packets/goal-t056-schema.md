# T-056 central integration proposal — source shape and runtime ownership

Maker owns only `apps/api/src/answer-policy/**` and `apps/web/src/pages/answer-policy/**`. Root owns canonical schemas, generated types, migrations, server/Ask/App/nav/package/lock changes. This proposal is not a schema or migration execution.

## Canonical collection proposal

1. `answer_policy_revisions`: existing `types.ts` `PolicyRevision`. Mongo `_id` is the structured object `{tenantId,policyId,version}`. Required tenantId, policyId, version, questionClass, mode, style, onInsufficient, citations=`required`, action, retired, changedBy, changedAt, note, previousVersion. Enum definitions are `types.ts`; notes 1..500; policy id /^[a-z0-9][a-z0-9_-]{0,63}$/i; positive safe sequential version. Actor requires `actor`, optional `claimedBy` is an unverified user label. Version history is append-only.
2. `answer_policy_review_items`: existing `types.ts` `ReviewItem`. Mongo `_id` is SHA256 tenant/kind/key; wire `id` is derived from `_id`. Required tenantId, kind (change/conflict), status, createdAt, key, summary; optional conflict/change/resolution. This remains the policy audit queue, distinct from AI candidate answers.
3. `answer_runs`: `answer-records.ts` `AnswerRun`. Mongo `_id` is SHA256 of JSON `[tenantId,id]`. Required id, tenantId, createdAt, actor, query (1..4000), questionClass, filters `{sessionIds:string[0..20],sources:all|internal}`, evidenceMode boolean, state (allowed/review/refused/approved/rejected/conflicted), reason, candidate, candidateDigest, evidenceDigest, evidence, policy (revision or null), feedback array (max100). Optional parentRunId, resolutionId, review. Candidate is immutable `AskV2Result` including answer/verdict/reason/scored/auditLog/web_used/insufficient_coverage and separately typed internal/web source arrays. Every evidence entry requires id, origin internal|web, SHA256 fingerprint, source snapshot object, original excerpt string. Review requires decision approved|rejected, by actor, note, at, both candidateDigest/evidenceDigest; atomic update only `state:review` and both original digests. Feedback requires helpful|unhelpful, note, by actor, at. Immutable candidate/evidence/policy/query are never updated; only review state/review and bounded feedback are writable.
4. `answer_source_conflicts`: `answer-records.ts` `SourceConflict`. Mongo `_id` is SHA256 of JSON `[tenantId, JSON([runId,sortedSourceIds])]`, so each run/source pair deduplicates even without an index. Required id, tenantId, runId, createdAt, by actor, explanation (1..500), a/b full server-derived EvidenceBinding snapshots, candidateDigest, evidenceDigest, status open|resolved. Optional resolution requires keepSourceId/excludeSourceId, note, by actor, at. Atomic resolve only while open. Neither side can originate from a client-provided source copy: input is two IDs checked against the stored authenticated run.

All SHA256 strings are lowercase 64 hex. `_id` and tenantId are always present in Mongo filters. Source snapshots may preserve additional provider metadata, but their top-level origin, identity, excerpts and provenance tuple must validate. Canonical types should be generated and used by domain/storage adapters once schemas land; handwritten domain DTOs in the maker source are current integration inputs, not an alternate schema authority.

## Tenant-leading indexes (migration only)

- answer_policy_revisions: `{tenantId:1,policyId:1,version:1}` unique.
- answer_policy_review_items: `{tenantId:1,kind:1,key:1}` unique; `{tenantId:1,status:1,createdAt:1}`.
- answer_runs: `{tenantId:1,id:1}` unique; `{tenantId:1,createdAt:-1,id:1}`; `{tenantId:1,state:1,createdAt:-1}`.
- answer_source_conflicts: `{tenantId:1,id:1}` unique; `{tenantId:1,runId:1,createdAt:1}`; `{tenantId:1,status:1,createdAt:1}`.

Schema fixtures must include allowed/review/approved/rejected runs, actual quoted internal provenance, two-sided conflicts and resolved preference; invalid fixtures should cover missing tenant, weak citations, malformed digest, source-free approved run and mismatched resolution. These are a root/checker integration requirement, not maker-authored ground truth.

## Runtime wiring

- Build one `AnswerPolicyService` over `createMongoAnswerPolicyStore(db,{production})` using D-168 production flag, and one `AnswerWorkflow` over `createMongoAnswerRecordStore(db,{production})` plus `createMongoEvidenceVerifier(db, optionalTrustedWebVerifier)`.
- Set the workflow on shared `AskRouteDeps` and server composition. Before legacy Ask call, invoke `workflow.execute(verifiedTenant,req.body,{actor:api-key:<verifiedTenant>},tree,requestBoundDepsWithTenant)`. Preserve BoundedAskError handling and route `AnswerWorkflowError`/Policy errors through `answerWorkflowFailure`. Workflow requires bounded sourceContext, so missing runtime configuration is an honest 503.
- Mount `createAnswerHistoryRouter(workflow)` after shared auth, rate limit and JSON. GET history/suggestions and POST feedback/conflict reporting require `ask`; candidate/source-conflict reads require `answer-policy:read`; resolution requires `answer-policy:write`. Key issuance must support these scopes.
- App `/ask`: `PolicyAskPage`; `/answer-policy`: `PolicyManager`; new `/answer-review`: `AnswerReviewPage`. Add normal nav. Existing AskPage source remains untouched; final U32 handoff evidence must target the adopted route.
- `PolicyAskPage` preserves normalized q prefill-only, explicit current-key submit, render-time auth-session/URL ownership, draft/URL/auth/unmount generation isolation, and same-key session resets. Saved history run can be opened via `/ask?run=<id>`.

## Explicit remaining gates

No real Mongo restart, provider, browser, schema-generation, migration execution, production write or dependency acceptance is claimed by this proposal. The default evidence verifier refuses web review without a trusted web freshness callback; provider-returned generation remains bounded by existing Ask grounding. Human preference is recorded distinctly from factual verification. Original conflicted answer stays withheld permanently; a new query with current source/policy verification must produce the downstream answer excluding the reviewed losing source.
