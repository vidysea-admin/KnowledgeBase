# Ask graph selection — scoped maker packet, cycle 0

Manifest: qa/manifests/ask-graph-selection.md, building. Maker /root/integration_control/delivery_matrix. Priority tier 2 auth/tenancy/data-write integration, explicitly assigned by central 2026-10-15. Not READY until scoped stage/downstream receipts and shared compatibility are accepted.

## Candidate and authority

Actual endpoints remain POST /ask and POST /answer-policy/simulate. Root corrected the initially nonexistent answer-policy/router.ts lease to routes.ts/routes.test.ts. Do not change answer-router.ts: its trusted-human owner and guard freeze remain separate. Public selector input is only filters.speakerRefs/topicRefs. The caller cannot submit tenant/authorization via selectors. Existing legacy /ask ignored top-level fields remain inert; durable workflow retains strict top-level parsing.

| Path | Pre-edit SHA256 | Candidate SHA256 |
|---|---|---|
| apps/api/src/routes/ask/ask.ts | c40d50d5364c18144838c9fe67e950bfb1c781dc22f42ec51864010337ca7500 | 23f4f7463d92b22e5d9851b899bde43883fdfad1c1392586b935b7ba0878374b |
| apps/api/src/routes/ask/ask.test.ts | ab6f8d4fce5c14b4d2fd2002d58409d3b5884bd44d6c497abb17a75de64187a3 | 0d2d59299e5e5696ebf57f6b6bd80e485474a822d6aeccd401f0b487c5e55c03 |
| apps/api/src/answer-policy/routes.ts | 77ed43f8bdb336e202fa9beea8af0630ebe6981bae0a38847775fb7c24cf392a | 7c6707e0f965a61c27de88fde144328851d64f2e6b1e225ebe27ef7b5a105e82 |
| apps/api/src/answer-policy/routes.test.ts | 97c4eb077378cddc5b7c1d1f649358d250890a7b095b747fc83d587d9cf75404 | c9c272af3eabca2fe7e5883fd58c2afea47ce3f76c503be510a2248f04e6377a |
| apps/api/src/answer-policy/answer-workflow.ts | e82864a8893ea8d5b08eec7a2d5329bbfc746e1627b3891e0ca7f97aec94d5a0 | b652e5b38bea9e16327ee9bea6ec117d7a024b69e76e0d9148200f8b5fc51c7a |
| apps/api/src/answer-policy/answer-workflow.test.ts | f3ca9a5034b2a0b48b3143df1b1b60746bb512ff8825df9f0fa6e25e60ff21dc | 3e4d0fe22a8de67812d04d8b5ebd8cecd6579f1623c56e342850c80cc1b09583 |

Pre-edit source strings plus their byte hashes are preserved in ask-graph-selection.base.json; these include preexisting dirty work, not a claim of clean HEAD. Reconstruct the exact textual diff against that archive. Only these six product files were edited by this maker.

## Change map and invariants

- answer-workflow.ts: graphReferences validates arrays before retrieval. Trim outer whitespace, retain case, accept ASCII canonical IDs up to 200 characters, require person: prefix plus nonempty suffix for speakers, deduplicate after normalization. Raw input max16 per array and normalized combined max16. Optional empty arrays allowed; absent properties stay absent, preserving old filter shape/digests.
- answerGraphSelection returns defensive copies of only the parsed two arrays. No permission, tenant, trusted-human identity, source rows or arbitrary graph objects reach the factory.
- /ask validates selection before tree/factory access, passes verified req.auth.tenantId and parsed selection to requestDepsFor. A nonempty selector without the factory returns existing bounded503 refusal. The factory still overrides legacy arms and tenant is assigned last. Durable workflow executes the original strict request; legacy unvalidated top-level identity fields remain ignored.
- /answer-policy/simulate uses the same parser projection and selector forwarding before tree/factory access. Existing draft/version validation, tenant identity, simulation semantics and URL stay unchanged.
- Existing workflow stores input.filters, returns them in history and compares their digest for resolution replay; optional graph dimensions therefore persist and prevent changed-selection conflict replay without modifying any evidence/policy/review guard.

Selectors are evidence constraints, never authorization. A syntactically valid foreign canonical topic ID is still passed with the verified tenant; its authority must be refused by the real tenant-scoped graph factory, not guessed from string prefixes in the API parser. Foreign-hint route tests inject a refusing factory and prove caller binding/refusal only, not real Mongo graph isolation.

## Immediate callers, consumers and shared prerequisites

- apps/api/src/server.ts mounts createAskRouter and createAnswerPolicyRouter behind auth/rate limits; unchanged by maker.
- apps/api/src/composition/integrations/routes.ts mounts existing history consumer from answerWorkflow; unchanged.
- apps/api/src/ask/source-context.ts createSourceRequestDepsFor already accepts second GraphContextSelection and applies real graph selection to retrieval arms, source hydration and fallback. Its owner must provide current factory/all-arm security evidence; no fixture here replaces it.
- apps/api/src/ask/graph-context.ts canonical ID validation and snapshot authority are unchanged; its existing combined16 constraint is mirrored.
- apps/api/src/answer-policy/answer-records.ts aliases canonical generated StoredAnswerRun.filters. Central schema child owns optional speakerRefs/topicRefs schema/type updates. Arrays need minItems0/maxItems16 and compatible IDs. No hand-written parallel persistence DTO added here.
- Existing answer-record store/history and conflict freshness/digest consumers are exercised through mounted /ask and /answer-history with in-memory fixture persistence. This is not native Mongo/restart proof.

Security flags: auth and tenant because verified caller identity binds the factory; source privacy because selectors constrain evidence; data writes because saved answer selection/history/replay is affected. No credentials read, environment changes, provider calls, network acquisition, deployment, production writes or native DB operation by maker.

## Broker commands — NOT RUN

Cwd: C:/Users/product/Desktop/KnowledgeBase. Use centrally selected installed Node/tsx runtime; no environment secret required. Sole broker supplies explicit outer90s timeout and before/after source/dependency pins. Actual executable/version and durations must come from its receipt, not this proposal.

Affected stage: eight new route/parser/persistence/replay tests plus one inherited explicitly dormant vector opt-in test across the actual three test files:

```text
node --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern="graph selector|legacy vector opt-in HTTP" apps/api/src/routes/ask/ask.test.ts apps/api/src/answer-policy/routes.test.ts apps/api/src/answer-policy/answer-workflow.test.ts
```

Immediate downstream existing freshness/refusal/conflict regression subset:

```text
node --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern="changed evidence or policy|reported evidence uses|stored candidate and evidence" apps/api/src/answer-policy/answer-workflow.test.ts
```

Coverage: normalized/duplicate/empty/absent dimensions; wrong prefix, slash, controls, non-string and over-budget rejection before reads; /ask and actual policy wrapper forwarding; verified two-tenant factory binding; no-factory503; foreign syntactically valid hints cannot replace verified tenant; mounted durable /ask → stored filters → /answer-history → new workflow instance; stale source suppression; changed-selector conflict replay refusal before provider calls and same-selection replay.

Root-authorized same-cycle test-only clarification: the inherited shared-embed test covers dormant vector/memo behavior (it constructs chunks, supplies an embedding adapter and asserts one shared call). Its factory now explicitly opts into `vectorless:false`, and its title states “legacy vector opt-in HTTP composition gives request factory sole ownership of arms and shared embed”. All existing assertions, grounded response and legacy-factory precedence remain unchanged. This does not change the active vectorless default or make an embedding call acceptable there. Active zero-embedding evidence belongs to the separately owned source-context/native vertical fixtures. Original test bytes remain in the pre-edit archive; historical receipts are not reclassified as current. Current nine-case broker evidence remains pending; no execution has been performed by maker.

The broker may require existing subprocess sandbox authorization for Node/tsx. No local attempt was made, so no claimed restriction/result applies to this exact command. No mutations planned. Frozen contract verifier and coherent compiler/build remain central checks on frozen shared inputs, with empty-contract vacuity disclosed as applicable.

## Acceptance boundaries and measurement

Ground truth: qa/contracts/goal-t056.md C2/C4/C6/C7/C8/C11 scoped to the explicitly approved selector addition. New scoped acceptance belongs to independent checker; maker never edits contracts or verdicts. Root accepted no new /ask/policy URL. All full T008/T055/T056 human/provider/browser/native/operational gates remain open. No filed issue corpus is closed or substituted by this feature.

At hash-read checkpoint, performance.now observed163653.1799999997ms since a marker started after initial source reads; earlier/later intervals are unmeasured. Token usage, cost, total elapsed, reviewer reserve and efficiency ratios unknown. Source hashes above are observed; no test exit/count/duration or PASS is invented.
