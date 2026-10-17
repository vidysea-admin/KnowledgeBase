# Building packet — source-delivery-native-message-vertical

**Root:** C:/Users/product/Desktop/KnowledgeBase
**Base/current HEAD:** 5c4cbade2d1a8aa4815de13d587db8de3b01cc4a
**Unit/fix cycle:** source-delivery-native-message-vertical / 6
**Status:** building, awaiting WA setup confirmation and broker; not ready-for-check
**Priority tier:** 3 — root-approved native message full mounted journey
**Owned:** NEW apps/api/src/native-evidence/message-vertical.test.ts (no base existed), matching NEW manifest and this NEW packet. Existing DOC vertical file is frozen unchanged at ae20670d112daaa9301e62ab469a6c3522e8a608ed927f8b9c87e950c6736339. No product/shared/contract changes.

## Actual path and fixture provenance

Only generic public helper apps/api/src/whatsapp/review/wire-fixtures.ts is imported: no test-module imports, legacy corpus, source files, real DB or network. It supplies in-memory transactional rollback/active-session protocol. New wrapper extends only generic Mongo query/cursor semantics ($or/$and/$regex/scalar/nested-array filters and limit) and records session identity. Its vectors/chunks/embedding collection access throws/counts before ingest. Configured embedding port throws/counts on actual vectorless Ask. Public upstream messages (Hinglish supplied text plus pending sibling), owner resolver and tracked-group config follow the existing shipped message-publication-fixture.ts setup; no real account/identity/consent verification is claimed. Actual createMongoWhatsAppDeps establishes provided-export consent from verified synthetic owner configuration, and actual detector proposes canonical candidates. No candidate approvals or native branches are manually inserted.

Actual createWhatsAppReviewWiring -> mounted createServer /whatsapp/ingest -> actual review queue -> mounted /whatsapp/review/:id/approve -> real repository/fence/materializer/message publisher in one transaction. Assert source/candidate/claim/tree write sessions identical and non-null. createWhatsAppNativeAuthority -> buildNativeIntegrations -> trustedTreeReads -> actual default native search inventory -> mounted citation resolver -> createSourceRequestDepsFor(vectorless:true,throwing embed) -> Ask -> actual policy workflow/MongoEvidenceVerifier fourth resolver -> mounted history. Source identity comes from actual ingest result and exact candidate evidence; native proofs carry no fabricated turn/session/audio/speaker tuple.

Four authored tests, each30000ms:
1. Positive Hinglish full journey, pending sibling excluded, scope/foreign boundaries, exact locator/text, current allowed policy/history.
2. Current consent withdrawal refuses native search/citation/Ask and sanitizes stored answer history.
3. Actual upstream half-snapshot deletion via mounted re-ingest/invalidation refuses old evidence. No force/shrink bypass.
4. Actual upstream source-message edit via mounted re-ingest/invalidation withdraws prior approval and refuses old evidence. No automatic reapproval.

Every negative first obtains a genuine allowed positive answer, then asserts current authority refusal and no new answer generation. Missing/incomplete product stages fail HOLD assertions; no skip or fabricated success.

## Contracts, commands and evidence

Relevant existing contract clauses: qa/contracts/vectorless-publication.md1–5 (zero vector calls, native authority/currentness, actual downstream proof); qa/contracts/answer-policies-vectorless.md1–4 (current release/sanitized history/authenticated HTTP); goal-t007.md maps3–6 and retained whatsapp-ingestion-first-slice.md C9–14 (quarantine, candidate-only approval/tenant isolation, full parent gates). No acceptance contract edits.

Proposed sole-broker command cwd C:/Users/product/Desktop/KnowledgeBase/apps/api:
`C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --import tsx --test --test-concurrency=1 --test-timeout=30000 src/native-evidence/message-vertical.test.ts`
Broker supplies outer deadline, current pinned install/codegen, before/after full dependencies and exact output/exit/timing. No local tests, compiler, provider, browser, live DB or paid actions executed. No command receipt exists for these four tests yet. WA79 receipt qa/goal-vectorless-2026-10-15/verification-whatsapp-current-seventy-nine.json is historical supporting producer evidence (79/79,exit0,12.560s,268stablepins,0skip), not a substitute for this new mounted consumer. DOC receipts remain separately pinned and unchanged.

Required next: actual affected/downstream broker run, API compiler/current generated types, frozen validator (disclose empty registry if still vacuous), mandatory integration checks and independent same-byte checker verdict. Compiler/factory status for this new fixture is unmeasured; existing factory/WA producer receipts alone do not prove it compiles or passes.

## Accounting and limits

Actual maker active time/tokens/cost unknown, denominators unverified; no measured checker efficiency claimed. Four authored cases are not four passes. No checker dispatched/verdict written. Building only, not ready-for-check.

HOLD: real Mongo MVCC/persistence/restart/transaction races, genuine owner/account/consent proof, live capture/provider behavior, text-model quality/multilingual calibration, shipped frontend/browser and full T007/C1–14 all-reader acceptance. Policy/answer record stores use disclosed public in-memory implementations. Loopback HTTP is broker-only; helper synthetic source data is not live WhatsApp evidence.

## Dependency fingerprint snapshot

Other owners may advance files; broker before/after pins remain authoritative.

| Path | SHA256 |
| --- | --- |
| apps/api/src/native-evidence/message-vertical.test.ts | 9ca33f304168280b43c595598f19812a5d6977f6df6b560ab2cbcc215d38b2fe |
| apps/api/src/whatsapp/review/wire-fixtures.ts | 64afed1d08a8d919762fe7e700115f16d7a4de86866828c648d5569472a7f3e7 |
| apps/api/src/whatsapp/review/compose.ts | 9a4f3dadabad989c7dc658064795230a4ec011e625b5f92bac0f1682e6889b7f |
| apps/api/src/whatsapp/review/ingest.ts | 776ac9f2edba93a915917faedc24962914e82415ef3ed05b11e25186d20c8d96 |
| apps/api/src/whatsapp/review/detection.ts | 61e135ad831895c210ed387f94a2d55327fef25091efb7364aff34f422cecdd8 |
| apps/api/src/whatsapp/review/validation.ts | 84f0f3117473952d1255e730d8256714eea9f697b2b84874ee552874246570b2 |
| apps/api/src/whatsapp/review/store.ts | ede283f9f87666a4f93ee146900a796704aeade851f784602573f08c4104be37 |
| apps/api/src/whatsapp/review/router.ts | 82a4f386eaa38c8f5051f510b515acb3b748c5b10aa37678b56dfd2186ac57bb |
| apps/api/src/whatsapp/review/materializer.ts | 7fb6ed68352f9d6eccd0af49abc10310da972c56d5c0ba006037fb9ca8aa2eb9 |
| apps/api/src/whatsapp/review/invalidate.ts | 7512f739429b9bfb8848e35ac6673037f3a3b5ec20a2aa5dd0f5ae965cbe7214 |
| apps/api/src/whatsapp/store.ts | 75995f58961b2f5da3f2b39c5cf440fc0c726d6540d947fea79abaa0a8132882 |
| apps/api/src/native-evidence/message-publication.ts | 9b8fbaca62136185ad60c5af1dd1ecf089e1cafb4a9d312cb193d783f1b1cbcb |
| apps/api/src/native-evidence/message-revision.ts | 5e769520a06f753af3ab84e13c063e66d65577a080ed36265cd4ab4d16e68895 |
| apps/api/src/native-evidence/whatsapp-authority.ts | 32dbcfe90c978c6050afdf0c8717c3937cd547d90b32542d4342bfe94af733cb |
| apps/api/src/composition/integrations/native.ts | e3809141c5bf25c06e4026db3f41066ea6e67a502aff980911a5119c0016c12b |
| apps/api/src/composition/integrations/trusted-readers.ts | 6a3ef8fba476fda5d25de208b8869fe165990e6d1b2487f486d5c66698e307bc |
| apps/api/src/native-evidence/resolver.ts | 75c39b52f8c8620bf28bf55133b63e3b3746d40236806127540a3f843bc4fe61 |
| apps/api/src/native-evidence/router.ts | 3eed89d5013b5c934622079103d164a60a7b4d6dbc8bf1ebbc4c6956faebdc57 |
| apps/api/src/visibility/knowledge.ts | bd54b93a2b6429f320a0468f7f062c05ece08e6483851e570080efffb0db12dc |
| apps/api/src/visibility/read-snapshot.ts | 1b97ff09d53b7c0f7fe10f13c23803290864e2f5d43c6f57568876ab281030cf |
| apps/api/src/ask/source-context.ts | a64d64aaa1c9a07aefd9f3a0ccaa9e8cf1bb2eabd64426e545afdd70ca139566 |
| apps/api/src/ask/native-source-context.ts | 64263bb8892a5aa4e5d3c9cb08742577b066b03631872fa3c42918d2a032ba0b |
| apps/api/src/search-store.ts | de3f123eaf8505c2e2a7231247a16cfd2cbb87ef26d26e00c9458172cd3958a4 |
| apps/api/src/routes/search.ts | 2b8833a4b9b73ce84449f2daabfee2a6a9433b2e46b9b2058e2d3f830ba8b4dc |
| apps/api/src/routes/whatsapp.ts | f83e63c7f8430c32b00289a48a6a5b8ab7bd0749d6be22341cdc0058a3378f74 |
| apps/api/src/routes/ask/ask.ts | d0fba93447c1c066d8473f87f3fdfcb13dc5ec4aea4855e9320fc1d1fddf1566 |
| apps/api/src/server.ts | 5730f4aeb2086999ebe08e81a729055db118d9a42efd3e425ae7572eaa2328d2 |
| apps/api/src/composition/integrations/routes.ts | 5008201fed89eaaeea6e52fcebc719ceb6ff34d00bef9632fdcc9a7ef585742e |
| apps/api/src/answer-policy/answer-evidence.ts | ec94116f478aadfbec8f4cf9968a9e2224858733e5f32e652188ab0ea9ba10c7 |
| apps/api/src/answer-policy/native-evidence.ts | 9474928553f111a3df0597898b1ac9ac8ca2385ac3c7fafa9cfd108cba832a92 |
| apps/api/src/answer-policy/answer-workflow.ts | e95b1a523a8b9ab9619a045944f686ae026547bde3a86d8fd039b670e3ae88e5 |
| apps/api/src/answer-policy/answer-router.ts | fd11c33e891ed2ae6cc01548a6fdcfdc9587fbe960b95c0e47095dce04c5eff7 |
| apps/api/src/answer-policy/service.ts | d79bfbf73b225a07da868f23e700665daed6627cc013c9f03f577df5000f35c1 |
| apps/api/src/answer-policy/store.ts | 3a3dfc461e0b2abe9afedc780ae63027f739ec3cfee301f16159843a8623be74 |
| apps/api/src/answer-policy/answer-record-store.ts | c01786804e32d37ea536146af09ad592e98479bc3aad2e09f680d535411b60c3 |
| packages/ask/src/answer-policy.ts | 48526dc7bb0367be5fac6e9c2ab979afd4411a6cf4764b442097d1aadcde64d2 |
| packages/ask/src/bounded-refine.ts | 3337cffdb6ee47b8319ffc1fe4a09d792e35e2a7927b584fa3c35ca1a1d66bf3 |
| packages/ask/src/testUtils.ts | 811e72a15a47dadcb4646dae03305762607788b0a55e8f32930234b40b865b54 |


## Preserved original timeout and bounded diagnostic cycle1

Original candidate62653f941be1324cf21458e4a630d701197700f1c643965b41eeed4393e4d413 receipt qa/goal-vectorless-2026-10-15/verification-native-message-four.json/.stdout.txt: first positive30s timeout, outer60sETIMEDOUT,0passes,remaining3unmeasured,402pins stable. Do not overwrite or count unknown cases as failures/passes. Broker exact owned commandline audit found no remaining matching message-vertical child; no blanket Node kill performed.

Independent read-only WA owner confirmed static nested-session chain: trustedTreeReads outer withKnowledgeReadSnapshot -> visibility.native passage resolver -> standalone WhatsAppNativeAuthority starts inner snapshot. Public wireMongoFixture serializes all sessions on one tail mutex; outer may hold lock while awaiting inner. Approval publisher itself uses the passed same session and does not start a nested authority snapshot. This is a concrete static hypothesis, pending stage localization; no serialization/product fix applied.

Diagnostic candidateac12493cc9843a57e979e4c7f1a71dfe235e3cee565901c7bac22b415193b58b adds only content-free MESSAGE_STAGE markers: normalized http_start/end/abort, tx_request/begin/end with numeric session IDs and active count, cleanup_start/end. No source text, bearer key, locator, candidate/run IDs are logged. Fetch uses AbortSignal.any(test signal,6000ms deadline), test.after registers idempotent connection cleanup, finally retains cleanup. Test timeout remains30s. No timeout increase, no application guards weakened, no local execution.

One positive-only diagnostic command (broker authorized separately), cwd apps/api:
`C:/Users/product/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --import tsx --test --test-concurrency=1 --test-timeout=30000 --test-name-pattern=^approved src/native-evidence/message-vertical.test.ts`
Other3cases remain unmeasured; pattern exclusion is not acceptance/PASS. Wait for actual trace before fixture serialization repair or another replay.

## Cycle2 actual production factory consumption

Original diagnostic qa/goal-vectorless-2026-10-15/verification-message-positive-diagnostic.json/.stdout.txt proved Ask nested snapshot wait: session8 began(active1);session9 requested(active1),never began;HTTP aborted6s;cleanup_start/end;ownexit1,8.524s,0pass. All prior ingest/approval/search/citation stages returned success. No outer kill needed; broker post-exit exact script audit found none. Preserve trace and original timeout.

Central separately repaired production read-view binding; this fixture still consumed generic factory and standalone raw WA authority. Root/central authorized narrow TEST-ONLY replacement: import actual buildNativeProductionIntegrations(db) and assert resolver.forReadView is a function. No production edits, mutex/rollback/fences removed, assertions relaxed, markers/6sAbort/test30s/cleanup changed. Current candidate4cfd1792cb506fb02858137f339b45fb61eee7b188418780baaf9ef6cc4ccdc3. One positive-only replay outer15s authorized; remaining3cases prohibited until positive green. No local tests. Factory binding/currentness semantics are production-owned; this fixture now exercises the shipped production binder.

| Added actual production dependency | SHA256 |
| --- | --- |
| apps/api/src/composition/integrations/native-production.ts | a16cacc13ebcc18e1ad959dcfbd7a28bf26ccc9a0c8ef2d3aeb5cd7e651f8698 |
| apps/api/src/ask/graph-context.ts | 94c876c7d2f04f19c6e3665e4f14d65a23002d2a97d8f539ea452434966b4654 |
| apps/api/src/knowledge/collections-store.ts | ba2c80800f94b556d69cee93a90cc4a06294ee93efbc797f9dbc93cb46c661a7 |

## Cycle3 safe completion diagnostic only

Actual production binder removed hang (verification-message-positive-actual-production.json,0/1PASS,2.549s,cleanupend) but exposed hydration identity refusal; separately authorized product mixed-proof repair then removed identity error (verification-message-positive-mixed-proof.json,0/1PASS,2.754s,all8/9/10transactions complete). Ask now reports generic503 source/completion processing failure. All original receipts retained. Remaining3messagecases still prohibited/unmeasured.

Root/central authorized TEST-ONLY diagnosis9ca33f304168280b43c595598f19812a5d6977f6df6b560ab2cbcc215d38b2fe: one completion dispatch catch prints only allowlisted phase/jobKind/fixed errorClass and rethrows original unchanged; answer mock prints only canonical originKINDS/count before existing assertions. No source/quote IDs, content, keys, prompts, raw error messages or stacks are emitted by instrumentation. No source ordering, assertions, application guards, mutex/rollback, cancellation/cleanup or timeouts changed. Await ONEpositive-only outer15s broker diagnostic before any actual admitted-message selection correction. No local tests.

## Cycle4 actual admitted-message selection (test-only)

Actual completion diagnostic verification-message-completion-diagnostic.json/.stdout.txt:0/1PASS,exit1,2.887s,stablepins; context count2/origins[speech,message], jobKindask.answer/errorClassAssertionError. It proved the fixture's positional context[0] assumption, not a production source/currentness failure. Preserve that original diagnostic.

Root approved sole-test fix bc3e4bff47454430ae28e14a71dbd602a69c3a5b94f2c848d0cfc53a54bc43a0 selects actual admitted message by origin and canonical packed source.sourceLocator kind, asserts exact literalquote and locator equality with prior actual HTTPsearch/citation identity, then derives answer text/sourceId from that node. Dispatch independently resolves current native source before fixture textgeneration and asserts literalquote. Mixed speech/message context is retained. Every returned proof is checked: native exactlocator/no fabricated tuple; existing transcript proof literal/identity/speaker/time values match actual canonical stored turn, never fixture-invented identity. No prod ordering/defaultpolicy/guards changed, no assertion silently dropped, markers6sAbort/cleanup/globalmutex/rollback/zero-vector checks retained. No local tests. ONEpositiveouter15s only; other3still gated until green.

## Cycle5 authentic production verifier capability (test-only)

Actual prior canonical-origin replay verification-message-positive-canonical-origin.json/.stdout.txt:Ask200,0/1PASS,2.627s,policy actualstale expectedallowed. Originalreceipt retained. Read-only audit and independent policyowner both confirmed mixedspeech/message result contains WA legacy speech binding; fixture supplied undefined third eligibleTurn verifierarg, while actual production composition/integrations/answers.ts60–62 supplies createKnowledgeVisibility(db).eligibleTurn. Verifier correctly refused missing capability; no product policy/consent/current-source bug demonstrated.

Root/central approved exact sole-test correction candidatea10b05f0682718f144f9dab3ef0615e16e1d76bb9da0d6f6d7f574b6a36761cd: import actual createKnowledgeVisibility and pass its .eligibleTurn as third createMongoEvidenceVerifier arg; fourth native.resolver retained. No verifier/defaultpolicy/guards/assertion/order/locking/diagnostic/timeout/cleanup changes. Mirrors real production authorization, no fake always-true capability. ONEpositiveouter15s pending; remaining3gated untilgreen. No localtests. Current compiler/checker acceptance remains unmeasured.

## Actual cycle5 positive broker result — scoped public mock only

Receipt qa/goal-vectorless-2026-10-15/verification-message-positive-production-verifier.json; raw matching .stdout.txt. Actual broker positive-only replay on candidatea10b05f0682718f144f9dab3ef0615e16e1d76bb9da0d6f6d7f574b6a36761cd:1/1PASS,exit0,2.778s,current source/dependency pins stable. All original mounted stages and assertions reached: ingest/real canonical queue/approval transaction with same-session source-candidate-claim-tree writes, actual production native factory/trusted read view, native keyword search/citation, request-bound mixedsource Ask with configured zeroembedding/vectortraps, actual current policy release/history and foreign/scope boundaries. This is real execution of shipped modules over declared public mocks, not real WhatsApp/account/consent/Mongo/MVCC/provider/browser evidence.

Root activated remaining3lifecycle cases plus2binding cases via sole broker; no positive repeat requested. Their receipts/results are pending and unmeasured here. All owned API sources frozen; no new reviewer or source edit. QA-only update does not alter source acceptance pins. Original timeout and every subsequent identity/order/stale failure remain preserved above and at immutable receipt paths; eventual success does not erase earlier attempts. Full parent/readers/live/quality/compiler/contracts/independent checker gates remain HOLD. No independent PASS claimed.

## Root-authorized canonical production fixture alignment epoch

Only two test sources changed after compiler terminalexit2 and explicit edit-fence release. DOCcandidate5a39cb664f38908fe1e596397c101a20fa9082826a0aac91dac1ee60473ff53f now uses actual buildNativeProductionIntegrations(db) for initial/reconstructed factory and asserts real forReadView/graph.readSnapshot capabilities. MSGcandidateade0668023ddba435e9b5aa336ae83408d2feac5a81b43f3f4679689c3258641 retains production binder, adds actual graph capability assertion. Both actual createSourceRequestDepsFor inputs now receive the SAME native.graph production object. No fakegraph, admission shortcut or graph selection added; existing positives do not select graph filters, so selected-graph execution branch remains unchanged. No extra graph regression node justified absent changed-branch trace.

MSG compiler diagnostics at message-vertical.test.ts299 (verification-api-types-native-request-epoch.stdout.txt) are corrected only by parsing response asunknown and asserting runtime nonarray JSONobject before in-operator property narrowing. No any/cast, refusal assertion/defaultpolicy/lifecycle/privacy/zeroports weakening. All markers6s cancellation/cleanup/test30s, globalmutex/rollback and genuine same-session approval remain.

All previous source hashes and receipts retain their historical scope. Current two-source epoch is unmeasured until ONE DOCpositive plusONE MSGpositive, then current API type/build receipts. No fullsuite/source edits/local tests. Full dependency fingerprint completeness is NOT established by the earlier partial18pin collector; direct table hashes are snapshots, not an exhaustive transitive closure. Sole broker must explicitly include both changed source bytes in actual before/after evidence and disclose collector scope. Root fullparent/nativeDB/MVCC/live/provider/browser/checker gates remain HOLD.
