# T-056 maker packet — preparation cycle 0

Manifest: qa/manifests/goal-t056.md. Contract: qa/contracts/goal-t056.md. Scope is the full parent, not a simulator foundation. Current status is building, pending root integration and focused CPU evidence; this is not a request for an intended verdict.

## Behavior and consumer map

1. `application.ts` exports lookupEffectivePolicy(service, verifiedTenant, selection) for both Ask and T058. It reads current tenant revisions, rejects foreign/retired/stale/class-mismatched choices, blocks live contradictory dimensions, and applies static style guidance only to ask.answer. Internal-only removes webFallbackFn and tavilySearchFn before any retrieval.
2. `yaml.ts` admits at most 8192 bytes of unique unindented scalar YAML keys, quotes strings, refuses tags/aliases/structures/nesting and routes all fields through existing parseSave. `admin-router.ts` exposes GET/PUT /answer-policies/:policyId/yaml under existing read/write scopes and requires expectedVersion through normal sequential save logic. `yaml-simulation.ts`/`routes.ts` expose POST /answer-policy/simulate-yaml, apply actual draft source/style/insufficiency behavior to a fresh bounded Ask result and return an explicitly transient unapproved candidate without any policy/history save.
3. `answer-workflow.ts` is the only new execution layer. It accepts query/class/current policy version/evidenceMode/bounded source filters/resolution ID, never client tenant/result/source copies. Root's actual authenticated /ask supplies its tenant-bound tree and request factories. It prunes source context before askV2, stores immutable answer/policy/evidence snapshots and publishes only permitted states. Evidence display mode affects presentation, never removes citation/grounding requirements.
4. `types.ts`/`answer-records.ts` alias actual generated canonical collection definitions. `answer-mongo-store.ts` filters every operation by tenant, uses deterministic tenant-natural identity hashes, never changes candidate/evidence/policy snapshots, limits feedback and uses filtered atomic review/resolve updates. `answer-record-store.ts` is only a detached in-memory test double, not a production store. Exact JSON normalization and stable JSON-key digest ordering protect restart identity from undefined/BSON ordering drift.
5. `answer-evidence.ts` derives source IDs/excerpts/fingerprints only from the trusted pipeline. The Mongo freshness verifier proves canonical tuple/text/byte/hash identity and requires current WhatsApp approval eligibility and trusted web freshness. `published`, `queue` and conflict projections hide withdrawn/stale raw snapshots rather than allowing an old approval to expose them.
6. `answer-router.ts` exposes authenticated saved history/suggestions/feedback/source-conflict reporting; separate scope-bound candidate answer and evidence review endpoints. Authorization actor is honestly the verified tenant API actor, not an invented per-person identity. Public history cannot supply unapproved candidate text. Store failures are honest operational errors.
7. `PolicyManager` uses actual policy endpoints and history; `PolicyAskPage` uses actual U32 guarded Ask hook, source filters/current revisions/history/suggestions/confidence/excerpts/followups/feedback/conflicts; `AnswerReviewPage` shows real candidate records and source-side citations and sends exact digests/attributed review reasons; `AnswerSources` keeps internal/web lists separate, quotes text inertly, uses safeHttpUrl and links to actual cited transcript turns. App/nav adoption is central-only.

## Exact focused commands (CPU lease required)

- API, cwd apps/api: `node --test --test-concurrency=1 --import tsx src/answer-policy/answer-workflow.test.ts src/answer-policy/answer-router.test.ts src/answer-policy/answer-persistence.test.ts src/answer-policy/service.test.ts src/answer-policy/admin-router.test.ts src/answer-policy/mongo-store.test.ts src/answer-policy/routes.test.ts` (serial focused files in one leased job, bounded <=120s). Fixture is two cited source turns “Fee is 100.” / “Fee is 200.” and a fake structural provider using actual bounded askV2, not a semantic/live proof. Direct stateful Mongo boundary double tests exercise actual store filters/CAS/restart and metadata/current eligibility checks; no real database is contacted.
- Web, cwd apps/web after U32 extension: `node node_modules/vitest/vitest.mjs run src/pages/answer-policy/PolicyAskPage.test.tsx src/pages/answer-policy/AnswerPolicySimulator.test.tsx --maxWorkers=1 --minWorkers=1`. Tests explicit q handoff, real selected policy/filter DTO, same-key/key/URL/draft stale replies, withheld candidates, correct feedback run and immutable YAML/review UI consumption. A browser is not exercised by jsdom.
- Scoped type/import compile and generated-schema checks are central after shared adoption, not broad repo tsc. Required frozen validator may reuse a current pinned actual receipt from root/docker_checker if frozen bytes still match; otherwise run once under its CPU lease.

## Security and data-write flags

Auth/tenancy/data writes: yes. Client tenant/result/source bodies cannot choose records or evidence. Stores verify tenant, natural identity and exact digests; async UI ownership includes auth sessionVersion. All new durable writes require schema/generated/migration integration from root, and protected database opt-in D-168. Web/WhatsApp unverifiable eligibility fails closed. No credentials are read/emitted by this unit. No mutation test has been run, so no armed source restore is claimed.

## Execution facts and full acceptance gates

The first focused API broker receipt and its single failed assertion are preserved below; no passing replay or UI result is inferred from queued commands. CPU is serialized by /root/docker_checker. Actual generic U32 hook/App adoption and canonical generated aliases are present; The guarded error mapper is adopted; owned UI and actual consumer hashes are pinned at qa/evidence/goal-t056/source-ui-pretest.json (SHA256 1AC742A1847B08FD38CDC262A2E0556D19C91B8D108A48792EC6437E9771D79B). Shared /ask/server/scopes/App/nav and schema migrations are not leased to maker. Real nonproduction Mongo service restart/races, actual source provider answer, final normal-route browser interactions, dependency U3.1/U3.2/T007/T008/T022 full verdicts and human calibration remain missing. See schema/wiring proposal for exact central interfaces and collection/index shape. Owned API pretest hashes are qa/evidence/goal-t056/source-api-pretest.json; final complete changed-path hashes/base diff and command receipts will be added after byte freeze. Parent stays HOLD until its whole contract is independently satisfied.


## Current source-review fix and central diagnostic receipt

The independently reported multi-conflict rerun bypass is addressed: all original current conflicts must be resolved, every rejected canonical session/URL is excluded, contradictory source preferences refuse before provider, and a stable full-set snapshot is checked after generation. New reports also withhold saved descendants and invalidate review through parent lineage. The A/B/C fixture covers pending second conflict, both resolved exclusions, reports during provider and later history withdrawal. These fixtures have not run. API source snapshot SHA256 is 157505B62D83B8C049CB1B48D1A2A5CA9974BAF0CC3DA0AF7337FAC019116050, superseding revoked E2C071... .

Central API typecheck receipt qa/goal-2026-10-14/api-types-attempt-1.json reports exit 2, 14694 ms. Its T-056 structural source DTO cast and synthetic completion cost diagnostics are corrected in owned source, without type suppression; no passing rerun is claimed.


## Resumed effective-transcript integration

Current API pretest snapshot SHA256 0694AC6755D0E7F6DBAC823B1323B3F0AF9F0100E13458177965C0FE7F983177 supersedes 157505... and includes actual shared effective-reader dependencies/visibility/composition. Verification reads current committed corrections with readEffectiveTurns before full quote/turn/speaker/time/hash/byte checks, then checks current eligibility. A failed/orphan correction read cannot fall back to obsolete originals. New persistence fixture checks original supersession, current corrected tuple approval, subsequent edit invalidation and foreign-head isolation; no execution is claimed. Shared answer composition now passes actual visibility.eligibleTurn. Current UI snapshot 1AC742A1847B08FD38CDC262A2E0556D19C91B8D108A48792EC6437E9771D79B re-pins the changed actual App. Fresh broker grants remain required.


API source snapshot refreshed to 7E99165E1A8E4CAC1B594B3CE5EAA0C6246F7B3BA123EDC074B48CB97E7DAAD3 after read-only reconciliation of shared KnowledgeVisibility bounded existence lookup (4ED89...). Broker preflight stopped before any tests because the previous dependency hash was stale. UI previous snapshot1AC742 is revoked while root adopts normalizeDraft seam: explicit manual/history policy questions retain their API4000 bound; incoming URL/Search/default hook retain512. The actual-page >512 full-question submission/restoration fixture is authored, not run.


## Actual focused API receipt and current freeze

Broker receipt qa/evidence/goal-t051checker-broker-t056-api-current.json and sibling stdout/stderr logs preserve actual exit1, 7034.6374ms, 47/48 cases passed, hashesUnchanged true. Command used absolute bundled node, cwd repository root, --test --test-concurrency=1 --test-timeout=30000 --import tsx plus the seven apps/api/src/answer-policy paths, outer120000ms. Only failure was test regex /refuses database/ versus actual correct guard refusal 'answer records refuse database'; source guard was unchanged. Changed assertion now requires each protected database's exact refusal text, and only persistence file replay is requested. API current source snapshot FC64EF2B2A6EE2F1D276910181D1301F064506D7264AA788DF67CC2CD1F6A943 supersedes7E991. Other47 passing cases remain pinned by their original receipt; no whole48 replay is requested absent a new reason.

Actual hook normalizeDraft option is adopted, defaults/URL/Search remain512 and owner/generation guards remain intact. PolicyAsk passes static bounded4000 UTF16 unsafe-control normalizer; authored actual consumer fixture checks full >512 explicit submission and history restoration without extra paid POST. UI current snapshot F3433CB78F297A814F78832F1B5D358C064F801B1FD650D494BEF32BEA3F7B0E re-pins currentAppEEF7 and hookE695F. Source edits are held during root INPUT_FREEZE; docs/evidence only. No UI test or passing compiler result is claimed.




Latest global compiler API39/web5 red receipts have no T-056-owned diagnostics. The earlier two owned diagnostics and 14694ms failed run are preserved specifically at api-types-attempt-1.json; current-freeze/latest receipts are separate red runs. qa/evidence/goal-t056/compiler-scope-observation.json pins the current failed API receipt and records the limited no-owned-diagnostics observation. This is not a successful compile. Current API/UI source maps were independently checked without drift and freeze acknowledgements were sent to runtime/coordinator. No additional source changes were warranted.


## Latest resumed dependency provenance

Current API source map C5863227C5A1AFA015F031F594620E2AB4030C68DDE8B3016FAA9ECF269E735B supersedes FC64EF solely for shared visibility/knowledge.ts E97C65C1A29304B78257B6880CE27DE49BAFCEFA7D45D1F0CA5DA1182D70EA04. Runtime confirmed its added explicit source.consent.given===false refusal in context/sourceVisible; maker read those current guards and repinned the dependency. Owned API behavior/test assertion are unchanged. UI F3433CB... remains unchanged. The 47/48 receipt remains historical/current to its original before/after pins, not evidence for this new shared guard. Affected assertion replay and UI remain unexecuted, with broker-only scheduling. No live actions were performed by maker; full human/provider/Mongo/browser gates remain.


## BECD resumed ordinary-validation classification

Sole ordinary coordinator is now /root/docker_governance_review; previous docker_checker requests confer no authority. No blocked strict-provider/privateDB command is retried. Fresh executable classification specs are qa/evidence/goal-t056/api-affected-downstream-spec.json (SHA87CC2BF4BA2E772B76FFBD180AAF6E329DCD56AA7C519235F21FFC2BAB6EB70E) and ui-owned-spec.json (SHAF8AD6E458FBF26726FA5BFF24EF9EDBB8B856A97274ED6922002EE06718EC09F). Minimal API files are answer-persistence.test.ts plus answer-workflow.test.ts; UI files are PolicyAskPage.test.tsx plus AnswerPolicySimulator.test.tsx. Each is serial, outer120s, using in-memory/offline/jsdom fixtures, no real Mongo/provider/browser operations. Actual App/U32 downstream checks remain coordinated separately to avoid duplicate green.

Current API map91D6423D86F7954F449E80CC83C162CFA4E97C993AAD410AF1D4D39E8F2AB319 repins current effective-reader4335/planner9D56 physical-screen provenance reconciliation. Owned logic is unchanged from the exact assertion correction; old47/48 failure remains retained. UI F3433CB... is unchanged. These are requests for classification only; no tests or successful replay is inferred. Maker livehandles are NONE and full live/human gates remain.

